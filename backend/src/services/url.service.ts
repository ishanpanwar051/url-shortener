import { Prisma } from '@prisma/client';
import { promises as dns } from 'dns';
import { isIP } from 'net';
import prisma, { prismaRead } from '../db';
import redis from '../redis';
import logger from '../utils/logger';
import { generateUniqueId, encodeBase62, bloomFilterInsert, bloomFilterContains, lruCacheGet, lruCachePut } from '../utils/core';
import { config } from '../config';
import { ClickData } from '../models';
import {
  urlCreatedTotal,
  redirectTotal,
  cacheHitTotal,
  cacheMissTotal,
  errorTotal,
} from '../middleware/metrics';

const MAX_SHORT_CODE_RETRIES = 3;
const CACHE_TTL = 3600;
const NEGATIVE_CACHE_TTL = 30;
const CACHE_STAMPEDE_LOCK_TTL = 5;
const CACHE_STAMPEDE_RETRY_MS = 50;
const CACHE_STAMPEDE_MAX_RETRIES = 5;
const CLICK_QUEUE_KEY = 'click_queue';

// Lua script: atomically delete key only if value matches
const ATOMIC_UNLOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

export const FRONTEND_ROUTES = new Set([
  'login', 'register', 'dashboard', 'analytics',
  'api', 'health', 'static',
]);

export class UrlService {
  private readonly CACHE_PREFIX = 'url:';
  private readonly NEGATIVE_PREFIX = 'neg:';
  private readonly COUNTER_PREFIX = 'clicks:';

  // Convert an IPv4 address string to a 32-bit integer for range checking
  private ip4ToInt(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  // Check if an IPv4 address falls within a CIDR range (e.g. '10.0.0.0/8')
  private ip4InCidr(ip: string, cidr: string): boolean {
    const [rangeIp, bitsStr] = cidr.split('/');
    const bits = parseInt(bitsStr, 10);
    const ipInt = this.ip4ToInt(ip);
    const rangeInt = this.ip4ToInt(rangeIp);
    const mask = ~0 << (32 - bits);
    return (ipInt & mask) >>> 0 === (rangeInt & mask) >>> 0;
  }

  private isPrivateIPv4(ip: string): boolean {
    const privateRanges = [
      '127.0.0.0/8',     // Loopback
      '10.0.0.0/8',      // RFC 1918
      '172.16.0.0/12',   // RFC 1918
      '192.168.0.0/16',  // RFC 1918
      '169.254.0.0/16',  // Link-local
      '0.0.0.0/8',       // Invalid
      '100.64.0.0/10',   // CGNAT
      '198.18.0.0/15',   // Benchmarking
    ];
    return privateRanges.some((cidr) => this.ip4InCidr(ip, cidr));
  }

  private isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    // ::1 (loopback)
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // fd00::/8 (ULA / unique local address)
    if (lower.startsWith('fd') || lower.startsWith('fc')) return true;
    // fe80::/10 (link-local)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    // ::ffff:0:0/96 (IPv4-mapped IPv6) — extract the embedded IPv4
    const v4MappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4MappedMatch) {
      return this.isPrivateIPv4(v4MappedMatch[1]);
    }
    return false;
  }

  private async validateUrl(rawUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Invalid URL format');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Only http and https URLs are allowed');
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block obvious private hostnames
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') {
      throw new Error('URLs pointing to internal or private networks are not allowed');
    }

    // Resolve hostname to IP addresses and check each one
    // This catches DNS rebinding, IPv6 variants, and CNAME chains
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await dns.lookup(hostname, { all: true });
    } catch {
      // DNS resolution failure — this is suspicious, but let the URL through
      // (the error might be transient; users can retry)
      return;
    }

    for (const addr of addresses) {
      if (isIP(addr.address) === 4 && this.isPrivateIPv4(addr.address)) {
        throw new Error('URLs pointing to internal or private networks are not allowed');
      }
      if (isIP(addr.address) === 6 && this.isPrivateIPv6(addr.address)) {
        throw new Error('URLs pointing to internal or private networks are not allowed');
      }
    }
  }

  async createShortUrl(longUrl: string, userId?: number, customAlias?: string, expiresInDays?: number) {
    await this.validateUrl(longUrl);
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + config.defaultUrlExpiryDays * 24 * 60 * 60 * 1000);

    let shortCode: string;

    if (customAlias) {
      if (FRONTEND_ROUTES.has(customAlias)) {
        throw new Error('This alias is reserved and cannot be used');
      }
      shortCode = customAlias;
    } else {
      shortCode = this.generateCandidateCode();
    }

    const url = await this.persistUrlWithRetry(shortCode, longUrl, userId, customAlias, expiresAt);

    bloomFilterInsert(url.shortCode);

    // Cache the URL
    await redis.set(`${this.CACHE_PREFIX}${url.shortCode}`, url.longUrl, 'EX', 3600);
    lruCachePut(url.shortCode, url.longUrl);

    urlCreatedTotal.inc();
    return url;
  }

  private generateCandidateCode(): string {
    const id = generateUniqueId();
    return encodeBase62(id).padStart(config.shortCodeLength, '0');
  }

  private async persistUrlWithRetry(
    initialShortCode: string,
    longUrl: string,
    userId: number | undefined,
    customAlias: string | undefined,
    expiresAt: Date,
  ) {
    let shortCode = initialShortCode;

    for (let attempt = 0; attempt < MAX_SHORT_CODE_RETRIES; attempt++) {
      try {
        return await prisma.uRL.create({
          data: {
            shortCode,
            longUrl,
            customAlias: customAlias || null,
            userId: userId || null,
            expiresAt,
          },
        });
      } catch (err: unknown) {
        if (
          err !== null &&
          typeof err === 'object' &&
          'code' in err &&
          (err as Record<string, unknown>).code === 'P2002'
        ) {
          const meta = (err as Record<string, unknown>).meta as Record<string, unknown> | undefined;
          const target = (meta?.target as string[]) ?? [];
          if (customAlias || target.includes('custom_alias')) {
            throw new Error('Custom alias already taken');
          }
          if (attempt < MAX_SHORT_CODE_RETRIES - 1) {
            shortCode = this.generateCandidateCode();
            continue;
          }
          throw new Error('Short code collision after retries. Please try again.');
        }
        throw err;
      }
    }

    throw new Error('Failed to create short URL');
  }

  async getLongUrl(shortCode: string, ipAddress?: string, userAgent?: string, referer?: string) {
    // Check LRU cache first (fastest — in-process memory)
    const lruResult = lruCacheGet(shortCode);
    if (lruResult) {
      cacheHitTotal.inc({ layer: 'lru' });
      redirectTotal.inc({ cached: 'true', status: '302' });
      return { longUrl: lruResult, cached: true };
    }
    cacheMissTotal.inc({ layer: 'lru' });

    // Bloom filter: fast rejection if the short code definitely doesn't exist
    if (!bloomFilterContains(shortCode)) {
      redirectTotal.inc({ cached: 'false', status: '404' });
      return null;
    }

    // Check negative cache (cache penetration protection)
    const negKey = `${this.NEGATIVE_PREFIX}${shortCode}`;
    const negCached = await redis.get(negKey);
    if (negCached) {
      redirectTotal.inc({ cached: 'false', status: '404' });
      return null;
    }

    // Check Redis cache
    const cached = await redis.get(`${this.CACHE_PREFIX}${shortCode}`);
    if (cached) {
      cacheHitTotal.inc({ layer: 'redis' });
      lruCachePut(shortCode, cached);
      redirectTotal.inc({ cached: 'true', status: '302' });
      return { longUrl: cached, cached: true };
    }
    cacheMissTotal.inc({ layer: 'redis' });

    // Anti-cache-stampede: only one request queries DB at a time
    const url = await this.fetchUrlWithStampedeProtection(shortCode);
    if (!url) {
      // Check if another request populated the cache while we waited
      const retryCache = await redis.get(`${this.CACHE_PREFIX}${shortCode}`);
      if (retryCache) {
        cacheHitTotal.inc({ layer: 'redis_retry' });
        lruCachePut(shortCode, retryCache);
        redirectTotal.inc({ cached: 'true', status: '302' });
        return { longUrl: retryCache, cached: true };
      }
      // Truly not found — cache negative result to prevent repeated lookups
      await redis.set(negKey, '1', 'EX', NEGATIVE_CACHE_TTL);
      redirectTotal.inc({ cached: 'false', status: '404' });
      return null;
    }

    if (!url.isActive || (url.expiresAt && url.expiresAt < new Date())) {
      await prisma.uRL.update({
        where: { id: url.id },
        data: { isActive: false },
      });
      redirectTotal.inc({ cached: 'false', status: '410' });
      return null;
    }

    // Cache for future
    await redis.set(`${this.CACHE_PREFIX}${shortCode}`, url.longUrl, 'EX', CACHE_TTL);
    lruCachePut(shortCode, url.longUrl);

    // Buffer click event asynchronously
    this.bufferClick(url.id, ipAddress, userAgent, referer);

    cacheMissTotal.inc({ layer: 'db' });
    redirectTotal.inc({ cached: 'false', status: '302' });
    return { longUrl: url.longUrl, cached: false };
  }

  private async fetchUrlWithStampedeProtection(shortCode: string) {
    const lockKey = `${this.CACHE_PREFIX}stampede:${shortCode}`;
    const lockValue = `worker:${config.machineId}:${Date.now()}:${Math.random()}`;

    for (let retry = 0; retry < CACHE_STAMPEDE_MAX_RETRIES; retry++) {
      const lockOk = await redis.set(lockKey, lockValue, 'EX', CACHE_STAMPEDE_LOCK_TTL, 'NX');
      if (lockOk) {
        try {
          return await prismaRead.uRL.findUnique({ where: { shortCode } });
        } finally {
          // Atomic unlock: only delete if we still hold the lock
          await redis.eval(ATOMIC_UNLOCK_SCRIPT, 1, lockKey, lockValue);
        }
      }
      // Another request is fetching; wait and retry
      await new Promise((resolve) => setTimeout(resolve, CACHE_STAMPEDE_RETRY_MS));
    }
    // Max retries exceeded — fall through to DB
    return prismaRead.uRL.findUnique({ where: { shortCode } });
  }

  private bufferClick(urlId: number, ipAddress?: string, userAgent?: string, referer?: string): void {
    const device = this.parseDevice(userAgent);
    const click: ClickData = {
      urlId,
      ipAddress,
      userAgent,
      referer,
      device,
      timestamp: new Date(),
    };
    redis.rpush(CLICK_QUEUE_KEY, JSON.stringify(click)).catch((err) => {
      logger.warn({ err }, 'Failed to buffer click');
    });
  }

  async flushClickQueue(batchSize = 500): Promise<number> {
    try {
      // Recover any orphaned events from a previous crash
      await this.recoverProcessingQueue();

      // Atomically pop batch from main queue and push to processing queue
      // RPOPLPUSH ensures no data loss if this crashes mid-flight
      const batch: string[] = [];
      for (let i = 0; i < batchSize; i++) {
        const item = await redis.rpoplpush(CLICK_QUEUE_KEY, `${CLICK_QUEUE_KEY}:processing`);
        if (item === null) break;
        batch.push(item);
      }

      if (batch.length === 0) return 0;

      const events: Array<{
        urlId: number;
        ipAddress?: string;
        userAgent?: string;
        referer?: string;
        device?: string | null;
        timestamp: Date;
      }> = batch.map((entry: string) => JSON.parse(entry));

      // Batch-insert click events and increment counters
      const urlCounts = new Map<number, number>();
      for (const event of events) {
        urlCounts.set(event.urlId, (urlCounts.get(event.urlId) || 0) + 1);
      }

      await prisma.$transaction([
        prisma.clickEvent.createMany({ data: events }),
        ...Array.from(urlCounts.entries()).map(([urlId, count]) =>
          prisma.uRL.update({
            where: { id: urlId },
            data: { clicks: { increment: count } },
          })
        ),
      ]);

      // Success: remove processing queue
      await redis.del(`${CLICK_QUEUE_KEY}:processing`);
      return batch.length;
    } catch (err) {
      // Failure: move events back from processing queue to main queue
      logger.error({ err }, 'Flush failed, returning events to queue');
      try {
        while (true) {
          const item = await redis.rpoplpush(`${CLICK_QUEUE_KEY}:processing`, CLICK_QUEUE_KEY);
          if (item === null) break;
        }
      } catch (recoveryErr) {
        logger.error({ err: recoveryErr }, 'Failed to recover click queue');
      }
      return 0;
    }
  }

  private async recoverProcessingQueue(): Promise<void> {
    try {
      const processingKey = `${CLICK_QUEUE_KEY}:processing`;
      const length = await redis.llen(processingKey);
      if (length === 0) return;

      logger.info('Recovering %d orphaned click events from processing queue', length);
      let moved = 0;
      while (true) {
        const item = await redis.rpoplpush(processingKey, CLICK_QUEUE_KEY);
        if (item === null) break;
        moved++;
      }
      if (moved > 0) {
        logger.info('Recovered %d click events back to main queue', moved);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to recover processing queue');
    }
  }

  private parseDevice(userAgent?: string): string | null {
    if (!userAgent) return null;
    const ua = userAgent.toLowerCase();
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) return 'iOS';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) return 'Bot';
    return 'Other';
  }

  async getUserUrls(userId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [urls, total] = await Promise.all([
      prismaRead.uRL.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prismaRead.uRL.count({ where: { userId } }),
    ]);
    return { urls, total, page, totalPages: Math.ceil(total / limit) };
  }

  async deleteUrl(urlId: number, userId: number) {
    let shortCode: string;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const url = await tx.uRL.findFirst({ where: { id: urlId, userId } });
      if (!url) {
        throw new Error('URL not found or unauthorized');
      }
      shortCode = url.shortCode;
      await tx.uRL.delete({ where: { id: urlId } });
    });
    await redis.del(`${this.CACHE_PREFIX}${shortCode!}`);
  }

  async updateUrl(urlId: number, userId: number, data: { longUrl?: string; isActive?: boolean }) {
    let shortCode: string;
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const url = await tx.uRL.findFirst({ where: { id: urlId, userId } });
      if (!url) {
        throw new Error('URL not found or unauthorized');
      }
      shortCode = url.shortCode;
      return tx.uRL.update({
        where: { id: urlId },
        data,
      });
    });
    await redis.del(`${this.CACHE_PREFIX}${shortCode!}`);
    return updated;
  }

  async getUrlAnalytics(shortCode: string, userId: number) {
    const url = await prismaRead.uRL.findFirst({ where: { shortCode, userId } });
    if (!url) {
      return null;
    }

    const [totalClicks, recentClicks, clickByDay] = await Promise.all([
      prismaRead.clickEvent.count({ where: { urlId: url.id } }),
      prismaRead.clickEvent.findMany({
        where: { urlId: url.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      prismaRead.$queryRaw`
        SELECT DATE(timestamp) as day, COUNT(*) as count
        FROM click_events
        WHERE url_id = ${url.id}
        GROUP BY DATE(timestamp)
        ORDER BY day DESC
        LIMIT 30
      `,
    ]);

    return {
      url,
      totalClicks,
      recentClicks,
      clickByDay,
    };
  }
}

export const urlService = new UrlService();
