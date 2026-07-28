import { Prisma } from '@prisma/client';
import { promises as dns } from 'dns';
import { isIP } from 'net';
import bcrypt from 'bcryptjs';
import prisma, { prismaRead } from '../db';
import redis from '../redis';
import logger from '../utils/logger';
import {
  generateUniqueId, encodeBase62,
  bloomFilterInit, bloomFilterInsert, bloomFilterContains,
  lruCacheGet, lruCachePut, lruCacheDelete,
  parseUserAgent, extractUTM,
} from '../utils/core';
import { NotFoundError, ValidationError, GoneError, ForbiddenError } from '../errors';
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

interface CachedUrlEntry {
  longUrl: string;
  urlId: number;
  hasPassword?: boolean;
  maxClicks?: number | null;
  isOneTime?: boolean;
}

// Lua script: atomically delete key only if value matches
const ATOMIC_UNLOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

// Lua script: atomically move up to N items from source to destination list
const BATCH_MOVE_SCRIPT = `
  local items = {}
  for i = 1, ARGV[1] do
    local item = redis.call("RPOPLPUSH", KEYS[1], KEYS[2])
    if not item then break end
    items[#items + 1] = item
  end
  return #items
`;

export const FRONTEND_ROUTES = new Set([
  'login', 'register', 'dashboard', 'analytics', 'admin',
  'api', 'health', 'static', 'metrics', 'qr',
]);

export class UrlService {
  private readonly CACHE_PREFIX = 'url:';
  private readonly NEGATIVE_PREFIX = 'neg:';
  private readonly COUNTER_PREFIX = 'clicks:';
  private bloomFilterReady = false;

  /** Load all existing short codes into the bloom filter on startup. */
  async hydrateBloomFilter(): Promise<void> {
    bloomFilterInit();
    const codes = await prismaRead.uRL.findMany({ select: { shortCode: true } });
    for (const { shortCode } of codes) {
      bloomFilterInsert(shortCode);
    }
    this.bloomFilterReady = true;
    logger.info('Bloom filter hydrated with %d short codes', codes.length);
  }

  // Convert an IPv4 address string to a 32-bit integer for range checking
  private ip4ToInt(ip: string): number {
    const parts = ip.split('.').map(Number);
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  // Check if an IPv4 address falls within a CIDR range
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
      '127.0.0.0/8',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '169.254.0.0/16',
      '0.0.0.0/8',
      '100.64.0.0/10',
      '198.18.0.0/15',
    ];
    return privateRanges.some((cidr) => this.ip4InCidr(ip, cidr));
  }

  private isPrivateIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    if (lower.startsWith('fd') || lower.startsWith('fc')) return true;
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
    const v4MappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4MappedMatch) {
      return this.isPrivateIPv4(v4MappedMatch[1]);
    }
    return false;
  }

  async validateUrl(rawUrl: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new ValidationError('Invalid URL format');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new ValidationError('Only http and https URLs are allowed');
    }

    const hostname = parsed.hostname.toLowerCase();

    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') {
      throw new ValidationError('URLs pointing to internal or private networks are not allowed');
    }

    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await dns.lookup(hostname, { all: true });
    } catch {
      throw new ValidationError('Cannot resolve hostname. Please check the URL is correct.');
    }

    for (const addr of addresses) {
      if (isIP(addr.address) === 4 && this.isPrivateIPv4(addr.address)) {
        throw new ValidationError('URLs pointing to internal or private networks are not allowed');
      }
      if (isIP(addr.address) === 6 && this.isPrivateIPv6(addr.address)) {
        throw new ValidationError('URLs pointing to internal or private networks are not allowed');
      }
    }
  }

  async createShortUrl(
    longUrl: string,
    userId?: number,
    customAlias?: string,
    expiresInDays?: number,
    options?: {
      title?: string;
      tags?: string[];
      password?: string;
      maxClicks?: number;
      isOneTime?: boolean;
    },
  ) {
    await this.validateUrl(longUrl);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + config.defaultUrlExpiryDays * 24 * 60 * 60 * 1000);

    let shortCode: string;
    if (customAlias) {
      if (FRONTEND_ROUTES.has(customAlias.toLowerCase())) {
        throw new ValidationError('This alias is reserved and cannot be used');
      }
      shortCode = customAlias;
    } else {
      shortCode = this.generateCandidateCode();
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (options?.password) {
      hashedPassword = await bcrypt.hash(options.password, 10);
    }

    const url = await this.persistUrlWithRetry(shortCode, longUrl, userId, customAlias, expiresAt, {
      title: options?.title,
      tags: options?.tags,
      password: hashedPassword,
      maxClicks: options?.maxClicks ? BigInt(options.maxClicks) : undefined,
      isOneTime: options?.isOneTime ?? false,
    });

    bloomFilterInsert(url.shortCode);

    await this.cacheUrl(url.shortCode, url.longUrl, url.id, !!hashedPassword, options?.maxClicks, options?.isOneTime);

    urlCreatedTotal.inc();
    return url;
  }

  private serializeCacheEntry(longUrl: string, urlId: number, hasPassword = false, maxClicks?: number | null, isOneTime = false): string {
    return JSON.stringify({ longUrl, urlId, hasPassword, maxClicks, isOneTime });
  }

  private parseCacheEntry(raw: string): CachedUrlEntry | null {
    try {
      const parsed = JSON.parse(raw) as CachedUrlEntry;
      if (parsed.longUrl && typeof parsed.urlId === 'number') {
        return parsed;
      }
    } catch {
      if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return { longUrl: raw, urlId: 0 };
      }
    }
    return null;
  }

  private async cacheUrl(shortCode: string, longUrl: string, urlId: number, hasPassword = false, maxClicks?: number | null, isOneTime = false): Promise<void> {
    const payload = this.serializeCacheEntry(longUrl, urlId, hasPassword, maxClicks, isOneTime);
    await redis.set(`${this.CACHE_PREFIX}${shortCode}`, payload, 'EX', CACHE_TTL);
    lruCachePut(shortCode, payload);
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
    extras?: {
      title?: string;
      tags?: string[];
      password?: string;
      maxClicks?: bigint;
      isOneTime?: boolean;
    },
  ) {
    let shortCode = initialShortCode;

    for (let attempt = 0; attempt < MAX_SHORT_CODE_RETRIES; attempt++) {
      try {
        return await prisma.uRL.create({
          data: {
            shortCode,
            longUrl,
            title: extras?.title || null,
            customAlias: customAlias || null,
            userId: userId || null,
            expiresAt,
            tags: extras?.tags ?? [],
            password: extras?.password || null,
            maxClicks: extras?.maxClicks ?? null,
            isOneTime: extras?.isOneTime ?? false,
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
            throw new ValidationError('Custom alias already taken');
          }
          if (attempt < MAX_SHORT_CODE_RETRIES - 1) {
            shortCode = this.generateCandidateCode();
            continue;
          }
          throw new ValidationError('Short code collision after retries. Please try again.');
        }
        throw err;
      }
    }

    throw new ValidationError('Failed to create short URL after maximum retries');
  }

  async getLongUrl(shortCode: string, ipAddress?: string, userAgent?: string, referer?: string, password?: string) {
    const recordClick = (urlId: number, entry?: CachedUrlEntry) => {
      if (urlId > 0) {
        this.bufferClick(urlId, ipAddress, userAgent, referer);
      }
    };

    // Check LRU cache first (fastest — in-process memory)
    const lruResult = lruCacheGet(shortCode);
    if (lruResult) {
      const entry = this.parseCacheEntry(lruResult);
      if (entry) {
        // Password-protected: require verification even on cache hit
        if (entry.hasPassword) {
          if (!password) {
            return { requiresPassword: true };
          }
          // We need to verify against DB since we don't cache the hash
          const dbUrl = await prismaRead.uRL.findUnique({ where: { shortCode } });
          if (!dbUrl?.password) return null;
          const valid = await bcrypt.compare(password, dbUrl.password);
          if (!valid) return { wrongPassword: true };
        }
        cacheHitTotal.inc({ layer: 'lru' });
        recordClick(entry.urlId, entry);
        redirectTotal.inc({ cached: 'true', status: '302' });
        return { longUrl: entry.longUrl, cached: true };
      }
    }
    cacheMissTotal.inc({ layer: 'lru' });

    // Bloom filter: fast rejection if the short code definitely doesn't exist
    if (this.bloomFilterReady && !bloomFilterContains(shortCode)) {
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
      const entry = this.parseCacheEntry(cached);
      if (entry) {
        if (entry.hasPassword) {
          if (!password) return { requiresPassword: true };
          const dbUrl = await prismaRead.uRL.findUnique({ where: { shortCode } });
          if (!dbUrl?.password) return null;
          const valid = await bcrypt.compare(password, dbUrl.password);
          if (!valid) return { wrongPassword: true };
        }
        cacheHitTotal.inc({ layer: 'redis' });
        lruCachePut(shortCode, cached);
        recordClick(entry.urlId, entry);
        redirectTotal.inc({ cached: 'true', status: '302' });
        return { longUrl: entry.longUrl, cached: true };
      }
    }
    cacheMissTotal.inc({ layer: 'redis' });

    // Anti-cache-stampede: only one request queries DB at a time
    const url = await this.fetchUrlWithStampedeProtection(shortCode);
    if (!url) {
      const retryCache = await redis.get(`${this.CACHE_PREFIX}${shortCode}`);
      if (retryCache) {
        const entry = this.parseCacheEntry(retryCache);
        if (entry) {
          cacheHitTotal.inc({ layer: 'redis_retry' });
          lruCachePut(shortCode, retryCache);
          recordClick(entry.urlId, entry);
          redirectTotal.inc({ cached: 'true', status: '302' });
          return { longUrl: entry.longUrl, cached: true };
        }
      }
      await redis.set(negKey, '1', 'EX', NEGATIVE_CACHE_TTL);
      redirectTotal.inc({ cached: 'false', status: '404' });
      return null;
    }

    if (!url.isActive || (url.expiresAt && url.expiresAt < new Date())) {
      await prisma.uRL.update({ where: { id: url.id }, data: { isActive: false } });
      redirectTotal.inc({ cached: 'false', status: '410' });
      return null;
    }

    // Check max clicks
    if (url.maxClicks !== null && url.maxClicks !== undefined && url.clicks >= url.maxClicks) {
      redirectTotal.inc({ cached: 'false', status: '410' });
      return null;
    }

    // Password check
    if (url.password) {
      if (!password) return { requiresPassword: true };
      const valid = await bcrypt.compare(password, url.password);
      if (!valid) return { wrongPassword: true };
    }

    // Cache for future lookups
    await this.cacheUrl(
      shortCode, url.longUrl, url.id,
      !!url.password,
      url.maxClicks !== null ? Number(url.maxClicks) : null,
      url.isOneTime,
    );

    recordClick(url.id);

    // Handle one-time links: deactivate after first use
    if (url.isOneTime) {
      await prisma.uRL.update({ where: { id: url.id }, data: { isActive: false } });
      await redis.del(`${this.CACHE_PREFIX}${shortCode}`);
      lruCacheDelete(shortCode);
      await redis.set(negKey, '1', 'EX', NEGATIVE_CACHE_TTL);
    }

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
          await redis.eval(ATOMIC_UNLOCK_SCRIPT, 1, lockKey, lockValue);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, CACHE_STAMPEDE_RETRY_MS));
    }
    return prismaRead.uRL.findUnique({ where: { shortCode } });
  }

  private bufferClick(urlId: number, ipAddress?: string, userAgent?: string, referer?: string): void {
    const device = this.parseDevice(userAgent);
    const { browser, os } = parseUserAgent(userAgent);
    const utm = extractUTM(referer);
    const click: ClickData = {
      urlId,
      ipAddress: ipAddress ? this.anonymizeIp(ipAddress) : undefined,
      userAgent,
      referer,
      device,
      browser,
      os,
      ...utm,
      timestamp: new Date(),
    };
    redis.rpush(CLICK_QUEUE_KEY, JSON.stringify(click)).catch((err) => {
      logger.warn({ err }, 'Failed to buffer click');
    });
  }

  async flushClickQueue(batchSize = 500): Promise<number> {
    try {
      await this.recoverProcessingQueue();

      const count = await redis.eval(
        BATCH_MOVE_SCRIPT, 2, CLICK_QUEUE_KEY, `${CLICK_QUEUE_KEY}:processing`, batchSize.toString()
      ) as number;

      if (count === 0) return 0;

      const batch = await redis.lrange(`${CLICK_QUEUE_KEY}:processing`, 0, count - 1);
      if (batch.length === 0) return 0;

      const events: ClickData[] = batch.map((entry: string) => JSON.parse(entry));

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

      await redis.del(`${CLICK_QUEUE_KEY}:processing`);
      return batch.length;
    } catch (err) {
      logger.error({ err }, 'Flush failed, returning events to queue');
      try {
        while (true) {
          const item = await redis.lmove(`${CLICK_QUEUE_KEY}:processing`, CLICK_QUEUE_KEY, 'RIGHT', 'LEFT');
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

      const items = await redis.lrange(processingKey, 0, length - 1);
      if (items.length > 0) {
        await redis.ltrim(processingKey, items.length, -1);
        await redis.rpush(CLICK_QUEUE_KEY, ...items);
        logger.info('Recovered %d click events back to main queue', items.length);
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

  private anonymizeIp(ip: string): string {
    if (ip.includes('.')) {
      const parts = ip.split('.');
      if (parts.length === 4) {
        parts[3] = '0';
        return parts.join('.');
      }
    }
    if (ip.includes(':')) {
      const parts = ip.split(':');
      for (let i = 3; i < parts.length; i++) {
        parts[i] = '0';
      }
      return parts.join(':');
    }
    return ip;
  }

  async getUserUrls(
    userId: number,
    page = 1,
    limit = 20,
    search?: string,
    status?: 'active' | 'inactive' | 'all',
    sort: 'createdAt' | 'clicks' | 'expiresAt' = 'createdAt',
    order: 'asc' | 'desc' = 'desc',
  ) {
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.URLWhereInput = { userId };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { longUrl: { contains: q, mode: 'insensitive' } },
        { shortCode: { contains: q, mode: 'insensitive' } },
        { customAlias: { contains: q, mode: 'insensitive' } },
        { title: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const orderBy: Prisma.URLOrderByWithRelationInput = { [sort]: order };

    const [urls, total] = await Promise.all([
      prismaRead.uRL.findMany({ where, orderBy, skip, take: limit }),
      prismaRead.uRL.count({ where }),
    ]);

    return {
      urls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    };
  }

  async deleteUrl(urlId: number, userId: number) {
    let shortCode: string;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const url = await tx.uRL.findFirst({ where: { id: urlId, userId } });
      if (!url) {
        throw new NotFoundError('URL not found or unauthorized');
      }
      shortCode = url.shortCode;
      await tx.uRL.delete({ where: { id: urlId } });
    });
    await redis.del(`${this.CACHE_PREFIX}${shortCode!}`);
    lruCacheDelete(shortCode!);
    await redis.set(`${this.NEGATIVE_PREFIX}${shortCode!}`, '1', 'EX', NEGATIVE_CACHE_TTL);
  }

  async updateUrl(
    urlId: number,
    userId: number,
    data: {
      longUrl?: string;
      isActive?: boolean;
      title?: string;
      tags?: string[];
      password?: string | null;
      maxClicks?: number | null;
      isOneTime?: boolean;
      expiresInDays?: number | null;
    },
  ) {
    if (data.longUrl) {
      await this.validateUrl(data.longUrl);
    }

    let shortCode: string;
    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const url = await tx.uRL.findFirst({ where: { id: urlId, userId } });
      if (!url) {
        throw new NotFoundError('URL not found or unauthorized');
      }
      shortCode = url.shortCode;

      const updateData: Prisma.URLUpdateInput = {};
      if (data.longUrl !== undefined) updateData.longUrl = data.longUrl;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.title !== undefined) updateData.title = data.title;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.isOneTime !== undefined) updateData.isOneTime = data.isOneTime;
      if (data.maxClicks !== undefined) {
        updateData.maxClicks = data.maxClicks !== null ? BigInt(data.maxClicks) : null;
      }
      if (data.expiresInDays !== undefined) {
        updateData.expiresAt = data.expiresInDays !== null
          ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
          : null;
      }
      if (data.password !== undefined) {
        updateData.password = data.password ? await bcrypt.hash(data.password, 10) : null;
      }

      return tx.uRL.update({ where: { id: urlId }, data: updateData });
    });

    await redis.del(`${this.CACHE_PREFIX}${shortCode!}`);
    lruCacheDelete(shortCode!);
    return updated;
  }

  async getUrlAnalytics(shortCode: string, userId: number) {
    const url = await prismaRead.uRL.findFirst({ where: { shortCode, userId } });
    if (!url) {
      return null;
    }

    const [totalClicks, recentClicks, clicksByDay, clicksByDevice, clicksByBrowser, clicksByOs, clicksByReferer] = await Promise.all([
      prismaRead.clickEvent.count({ where: { urlId: url.id } }),
      prismaRead.clickEvent.findMany({
        where: { urlId: url.id },
        orderBy: { timestamp: 'desc' },
        take: 10,
      }),
      // BUG FIX: cast count to int so it's JSON-serializable (not BigInt)
      prismaRead.$queryRaw<Array<{ day: string; count: number }>>`
        SELECT DATE(timestamp)::text as day, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id}
        GROUP BY DATE(timestamp)
        ORDER BY day DESC
        LIMIT 30
      `,
      prismaRead.$queryRaw<Array<{ device: string | null; count: number }>>`
        SELECT device, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND device IS NOT NULL
        GROUP BY device
        ORDER BY count DESC
        LIMIT 10
      `,
      prismaRead.$queryRaw<Array<{ browser: string | null; count: number }>>`
        SELECT browser, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND browser IS NOT NULL
        GROUP BY browser
        ORDER BY count DESC
        LIMIT 10
      `,
      prismaRead.$queryRaw<Array<{ os: string | null; count: number }>>`
        SELECT os, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND os IS NOT NULL
        GROUP BY os
        ORDER BY count DESC
        LIMIT 10
      `,
      prismaRead.$queryRaw<Array<{ referer: string | null; count: number }>>`
        SELECT referer, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND referer IS NOT NULL AND referer != ''
        GROUP BY referer
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    return {
      url,
      totalClicks,
      recentClicks,
      clicksByDay,
      clicksByDevice,
      clicksByBrowser,
      clicksByOs,
      clicksByReferer,
    };
  }

  async exportUserUrlsCsv(userId: number): Promise<string> {
    const urls = await prismaRead.uRL.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Short Code,Long URL,Title,Clicks,Status,Tags,Created At,Expires At';
    const rows = urls.map((u) => {
      const cols = [
        u.shortCode,
        `"${u.longUrl.replace(/"/g, '""')}"`,
        `"${(u.title || '').replace(/"/g, '""')}"`,
        u.clicks.toString(),
        u.isActive ? 'Active' : 'Inactive',
        `"${u.tags.join(', ')}"`,
        u.createdAt.toISOString(),
        u.expiresAt ? u.expiresAt.toISOString() : '',
      ];
      return cols.join(',');
    });

    return [header, ...rows].join('\n');
  }

  async getSystemStats() {
    const [totalUsers, totalUrls, totalClicks, activeUrls] = await Promise.all([
      prismaRead.user.count(),
      prismaRead.uRL.count(),
      prismaRead.uRL.aggregate({ _sum: { clicks: true } }),
      prismaRead.uRL.count({ where: { isActive: true } }),
    ]);

    return {
      totalUsers,
      totalUrls,
      totalClicks: Number(totalClicks._sum.clicks ?? 0),
      activeUrls,
    };
  }

  async adminGetAllUrls(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.URLWhereInput = {};
    if (search) {
      where.OR = [
        { longUrl: { contains: search, mode: 'insensitive' } },
        { shortCode: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [urls, total] = await Promise.all([
      prismaRead.uRL.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { owner: { select: { id: true, email: true, username: true } } },
      }),
      prismaRead.uRL.count({ where }),
    ]);
    return { urls, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async adminDeleteUrl(urlId: number) {
    const url = await prisma.uRL.findUnique({ where: { id: urlId } });
    if (!url) throw new NotFoundError('URL not found');
    await prisma.uRL.delete({ where: { id: urlId } });
    await redis.del(`${this.CACHE_PREFIX}${url.shortCode}`);
    lruCacheDelete(url.shortCode);
    await redis.set(`${this.NEGATIVE_PREFIX}${url.shortCode}`, '1', 'EX', NEGATIVE_CACHE_TTL);
  }
}

export const urlService = new UrlService();
