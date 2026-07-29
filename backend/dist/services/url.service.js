"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.urlService = exports.UrlService = exports.FRONTEND_ROUTES = void 0;
const dns_1 = require("dns");
const net_1 = require("net");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importStar(require("../db"));
const redis_1 = __importDefault(require("../redis"));
const logger_1 = __importDefault(require("../utils/logger"));
const core_1 = require("../utils/core");
const errors_1 = require("../errors");
const config_1 = require("../config");
const metrics_1 = require("../middleware/metrics");
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
exports.FRONTEND_ROUTES = new Set([
    'login', 'register', 'dashboard', 'analytics', 'admin',
    'api', 'health', 'static', 'metrics', 'qr',
]);
class UrlService {
    constructor() {
        this.CACHE_PREFIX = 'url:';
        this.NEGATIVE_PREFIX = 'neg:';
        this.COUNTER_PREFIX = 'clicks:';
        this.bloomFilterReady = false;
    }
    /** Load all existing short codes into the bloom filter on startup. */
    async hydrateBloomFilter() {
        (0, core_1.bloomFilterInit)();
        const codes = await db_1.prismaRead.uRL.findMany({ select: { shortCode: true } });
        for (const { shortCode } of codes) {
            (0, core_1.bloomFilterInsert)(shortCode);
        }
        this.bloomFilterReady = true;
        logger_1.default.info('Bloom filter hydrated with %d short codes', codes.length);
    }
    // Convert an IPv4 address string to a 32-bit integer for range checking
    ip4ToInt(ip) {
        const parts = ip.split('.').map(Number);
        return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
    }
    // Check if an IPv4 address falls within a CIDR range
    ip4InCidr(ip, cidr) {
        const [rangeIp, bitsStr] = cidr.split('/');
        const bits = parseInt(bitsStr, 10);
        const ipInt = this.ip4ToInt(ip);
        const rangeInt = this.ip4ToInt(rangeIp);
        const mask = ~0 << (32 - bits);
        return (ipInt & mask) >>> 0 === (rangeInt & mask) >>> 0;
    }
    isPrivateIPv4(ip) {
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
    isPrivateIPv6(ip) {
        const lower = ip.toLowerCase();
        if (lower === '::1' || lower === '0:0:0:0:0:0:0:1')
            return true;
        if (lower.startsWith('fd') || lower.startsWith('fc'))
            return true;
        if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb'))
            return true;
        const v4MappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (v4MappedMatch) {
            return this.isPrivateIPv4(v4MappedMatch[1]);
        }
        return false;
    }
    async validateUrl(rawUrl) {
        let parsed;
        try {
            parsed = new URL(rawUrl);
        }
        catch {
            throw new errors_1.ValidationError('Invalid URL format');
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new errors_1.ValidationError('Only http and https URLs are allowed');
        }
        const hostname = parsed.hostname.toLowerCase();
        if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') {
            throw new errors_1.ValidationError('URLs pointing to internal or private networks are not allowed');
        }
        let addresses;
        try {
            addresses = await dns_1.promises.lookup(hostname, { all: true });
        }
        catch {
            throw new errors_1.ValidationError('Cannot resolve hostname. Please check the URL is correct.');
        }
        for (const addr of addresses) {
            if ((0, net_1.isIP)(addr.address) === 4 && this.isPrivateIPv4(addr.address)) {
                throw new errors_1.ValidationError('URLs pointing to internal or private networks are not allowed');
            }
            if ((0, net_1.isIP)(addr.address) === 6 && this.isPrivateIPv6(addr.address)) {
                throw new errors_1.ValidationError('URLs pointing to internal or private networks are not allowed');
            }
        }
    }
    async createShortUrl(longUrl, userId, customAlias, expiresInDays, options) {
        await this.validateUrl(longUrl);
        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : new Date(Date.now() + config_1.config.defaultUrlExpiryDays * 24 * 60 * 60 * 1000);
        let shortCode;
        if (customAlias) {
            if (exports.FRONTEND_ROUTES.has(customAlias.toLowerCase())) {
                throw new errors_1.ValidationError('This alias is reserved and cannot be used');
            }
            shortCode = customAlias;
        }
        else {
            shortCode = this.generateCandidateCode();
        }
        // Hash password if provided
        let hashedPassword;
        if (options?.password) {
            hashedPassword = await bcryptjs_1.default.hash(options.password, 10);
        }
        const url = await this.persistUrlWithRetry(shortCode, longUrl, userId, customAlias, expiresAt, {
            title: options?.title,
            tags: options?.tags,
            password: hashedPassword,
            maxClicks: options?.maxClicks ? BigInt(options.maxClicks) : undefined,
            isOneTime: options?.isOneTime ?? false,
        });
        (0, core_1.bloomFilterInsert)(url.shortCode);
        await this.cacheUrl(url.shortCode, url.longUrl, url.id, !!hashedPassword, options?.maxClicks, options?.isOneTime);
        metrics_1.urlCreatedTotal.inc();
        return url;
    }
    serializeCacheEntry(longUrl, urlId, hasPassword = false, maxClicks, isOneTime = false) {
        return JSON.stringify({ longUrl, urlId, hasPassword, maxClicks, isOneTime });
    }
    parseCacheEntry(raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.longUrl && typeof parsed.urlId === 'number') {
                return parsed;
            }
        }
        catch {
            if (raw.startsWith('http://') || raw.startsWith('https://')) {
                return { longUrl: raw, urlId: 0 };
            }
        }
        return null;
    }
    async cacheUrl(shortCode, longUrl, urlId, hasPassword = false, maxClicks, isOneTime = false) {
        const payload = this.serializeCacheEntry(longUrl, urlId, hasPassword, maxClicks, isOneTime);
        await redis_1.default.set(`${this.CACHE_PREFIX}${shortCode}`, payload, 'EX', CACHE_TTL);
        (0, core_1.lruCachePut)(shortCode, payload);
    }
    generateCandidateCode() {
        const id = (0, core_1.generateUniqueId)();
        return (0, core_1.encodeBase62)(id).padStart(config_1.config.shortCodeLength, '0');
    }
    async persistUrlWithRetry(initialShortCode, longUrl, userId, customAlias, expiresAt, extras) {
        let shortCode = initialShortCode;
        for (let attempt = 0; attempt < MAX_SHORT_CODE_RETRIES; attempt++) {
            try {
                return await db_1.default.uRL.create({
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
            }
            catch (err) {
                if (err !== null &&
                    typeof err === 'object' &&
                    'code' in err &&
                    err.code === 'P2002') {
                    const meta = err.meta;
                    const target = meta?.target ?? [];
                    if (customAlias || target.includes('custom_alias')) {
                        throw new errors_1.ValidationError('Custom alias already taken');
                    }
                    if (attempt < MAX_SHORT_CODE_RETRIES - 1) {
                        shortCode = this.generateCandidateCode();
                        continue;
                    }
                    throw new errors_1.ValidationError('Short code collision after retries. Please try again.');
                }
                throw err;
            }
        }
        throw new errors_1.ValidationError('Failed to create short URL after maximum retries');
    }
    async getLongUrl(shortCode, ipAddress, userAgent, referer, password) {
        const recordClick = (urlId, entry) => {
            if (urlId > 0) {
                this.bufferClick(urlId, ipAddress, userAgent, referer);
            }
        };
        // Check LRU cache first (fastest — in-process memory)
        const lruResult = (0, core_1.lruCacheGet)(shortCode);
        if (lruResult) {
            const entry = this.parseCacheEntry(lruResult);
            if (entry) {
                // Password-protected: require verification even on cache hit
                if (entry.hasPassword) {
                    if (!password) {
                        return { requiresPassword: true };
                    }
                    // We need to verify against DB since we don't cache the hash
                    const dbUrl = await db_1.prismaRead.uRL.findUnique({ where: { shortCode } });
                    if (!dbUrl?.password)
                        return null;
                    const valid = await bcryptjs_1.default.compare(password, dbUrl.password);
                    if (!valid)
                        return { wrongPassword: true };
                }
                metrics_1.cacheHitTotal.inc({ layer: 'lru' });
                recordClick(entry.urlId, entry);
                metrics_1.redirectTotal.inc({ cached: 'true', status: '302' });
                return { longUrl: entry.longUrl, cached: true };
            }
        }
        metrics_1.cacheMissTotal.inc({ layer: 'lru' });
        // Bloom filter: fast rejection if the short code definitely doesn't exist
        if (this.bloomFilterReady && !(0, core_1.bloomFilterContains)(shortCode)) {
            metrics_1.redirectTotal.inc({ cached: 'false', status: '404' });
            return null;
        }
        // Check negative cache (cache penetration protection)
        const negKey = `${this.NEGATIVE_PREFIX}${shortCode}`;
        const negCached = await redis_1.default.get(negKey);
        if (negCached) {
            metrics_1.redirectTotal.inc({ cached: 'false', status: '404' });
            return null;
        }
        // Check Redis cache
        const cached = await redis_1.default.get(`${this.CACHE_PREFIX}${shortCode}`);
        if (cached) {
            const entry = this.parseCacheEntry(cached);
            if (entry) {
                if (entry.hasPassword) {
                    if (!password)
                        return { requiresPassword: true };
                    const dbUrl = await db_1.prismaRead.uRL.findUnique({ where: { shortCode } });
                    if (!dbUrl?.password)
                        return null;
                    const valid = await bcryptjs_1.default.compare(password, dbUrl.password);
                    if (!valid)
                        return { wrongPassword: true };
                }
                metrics_1.cacheHitTotal.inc({ layer: 'redis' });
                (0, core_1.lruCachePut)(shortCode, cached);
                recordClick(entry.urlId, entry);
                metrics_1.redirectTotal.inc({ cached: 'true', status: '302' });
                return { longUrl: entry.longUrl, cached: true };
            }
        }
        metrics_1.cacheMissTotal.inc({ layer: 'redis' });
        // Anti-cache-stampede: only one request queries DB at a time
        const url = await this.fetchUrlWithStampedeProtection(shortCode);
        if (!url) {
            const retryCache = await redis_1.default.get(`${this.CACHE_PREFIX}${shortCode}`);
            if (retryCache) {
                const entry = this.parseCacheEntry(retryCache);
                if (entry) {
                    metrics_1.cacheHitTotal.inc({ layer: 'redis_retry' });
                    (0, core_1.lruCachePut)(shortCode, retryCache);
                    recordClick(entry.urlId, entry);
                    metrics_1.redirectTotal.inc({ cached: 'true', status: '302' });
                    return { longUrl: entry.longUrl, cached: true };
                }
            }
            await redis_1.default.set(negKey, '1', 'EX', NEGATIVE_CACHE_TTL);
            metrics_1.redirectTotal.inc({ cached: 'false', status: '404' });
            return null;
        }
        if (!url.isActive || (url.expiresAt && url.expiresAt < new Date())) {
            await db_1.default.uRL.update({ where: { id: url.id }, data: { isActive: false } });
            metrics_1.redirectTotal.inc({ cached: 'false', status: '410' });
            return null;
        }
        // Check max clicks
        if (url.maxClicks !== null && url.maxClicks !== undefined && url.clicks >= url.maxClicks) {
            metrics_1.redirectTotal.inc({ cached: 'false', status: '410' });
            return null;
        }
        // Password check
        if (url.password) {
            if (!password)
                return { requiresPassword: true };
            const valid = await bcryptjs_1.default.compare(password, url.password);
            if (!valid)
                return { wrongPassword: true };
        }
        // Cache for future lookups
        await this.cacheUrl(shortCode, url.longUrl, url.id, !!url.password, url.maxClicks !== null ? Number(url.maxClicks) : null, url.isOneTime);
        recordClick(url.id);
        // Handle one-time links: deactivate after first use
        if (url.isOneTime) {
            await db_1.default.uRL.update({ where: { id: url.id }, data: { isActive: false } });
            await redis_1.default.del(`${this.CACHE_PREFIX}${shortCode}`);
            (0, core_1.lruCacheDelete)(shortCode);
            await redis_1.default.set(negKey, '1', 'EX', NEGATIVE_CACHE_TTL);
        }
        metrics_1.cacheMissTotal.inc({ layer: 'db' });
        metrics_1.redirectTotal.inc({ cached: 'false', status: '302' });
        return { longUrl: url.longUrl, cached: false };
    }
    async fetchUrlWithStampedeProtection(shortCode) {
        const lockKey = `${this.CACHE_PREFIX}stampede:${shortCode}`;
        const lockValue = `worker:${config_1.config.machineId}:${Date.now()}:${Math.random()}`;
        for (let retry = 0; retry < CACHE_STAMPEDE_MAX_RETRIES; retry++) {
            const lockOk = await redis_1.default.set(lockKey, lockValue, 'EX', CACHE_STAMPEDE_LOCK_TTL, 'NX');
            if (lockOk) {
                try {
                    return await db_1.prismaRead.uRL.findUnique({ where: { shortCode } });
                }
                finally {
                    await redis_1.default.eval(ATOMIC_UNLOCK_SCRIPT, 1, lockKey, lockValue);
                }
            }
            await new Promise((resolve) => setTimeout(resolve, CACHE_STAMPEDE_RETRY_MS));
        }
        return db_1.prismaRead.uRL.findUnique({ where: { shortCode } });
    }
    bufferClick(urlId, ipAddress, userAgent, referer) {
        const device = this.parseDevice(userAgent);
        const { browser, os } = (0, core_1.parseUserAgent)(userAgent);
        const utm = (0, core_1.extractUTM)(referer);
        const click = {
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
        redis_1.default.rpush(CLICK_QUEUE_KEY, JSON.stringify(click)).catch((err) => {
            logger_1.default.warn({ err }, 'Failed to buffer click');
        });
    }
    async flushClickQueue(batchSize = 500) {
        try {
            await this.recoverProcessingQueue();
            const count = await redis_1.default.eval(BATCH_MOVE_SCRIPT, 2, CLICK_QUEUE_KEY, `${CLICK_QUEUE_KEY}:processing`, batchSize.toString());
            if (count === 0)
                return 0;
            const batch = await redis_1.default.lrange(`${CLICK_QUEUE_KEY}:processing`, 0, count - 1);
            if (batch.length === 0)
                return 0;
            const events = batch.map((entry) => JSON.parse(entry));
            const urlCounts = new Map();
            for (const event of events) {
                urlCounts.set(event.urlId, (urlCounts.get(event.urlId) || 0) + 1);
            }
            await db_1.default.$transaction([
                db_1.default.clickEvent.createMany({ data: events }),
                ...Array.from(urlCounts.entries()).map(([urlId, count]) => db_1.default.uRL.update({
                    where: { id: urlId },
                    data: { clicks: { increment: count } },
                })),
            ]);
            await redis_1.default.del(`${CLICK_QUEUE_KEY}:processing`);
            return batch.length;
        }
        catch (err) {
            logger_1.default.error({ err }, 'Flush failed, returning events to queue');
            try {
                while (true) {
                    const item = await redis_1.default.lmove(`${CLICK_QUEUE_KEY}:processing`, CLICK_QUEUE_KEY, 'RIGHT', 'LEFT');
                    if (item === null)
                        break;
                }
            }
            catch (recoveryErr) {
                logger_1.default.error({ err: recoveryErr }, 'Failed to recover click queue');
            }
            return 0;
        }
    }
    async recoverProcessingQueue() {
        try {
            const processingKey = `${CLICK_QUEUE_KEY}:processing`;
            const length = await redis_1.default.llen(processingKey);
            if (length === 0)
                return;
            logger_1.default.info('Recovering %d orphaned click events from processing queue', length);
            const items = await redis_1.default.lrange(processingKey, 0, length - 1);
            if (items.length > 0) {
                await redis_1.default.ltrim(processingKey, items.length, -1);
                await redis_1.default.rpush(CLICK_QUEUE_KEY, ...items);
                logger_1.default.info('Recovered %d click events back to main queue', items.length);
            }
        }
        catch (err) {
            logger_1.default.error({ err }, 'Failed to recover processing queue');
        }
    }
    parseDevice(userAgent) {
        if (!userAgent)
            return null;
        const ua = userAgent.toLowerCase();
        if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios'))
            return 'iOS';
        if (ua.includes('android'))
            return 'Android';
        if (ua.includes('windows'))
            return 'Windows';
        if (ua.includes('macintosh') || ua.includes('mac os'))
            return 'Mac';
        if (ua.includes('linux'))
            return 'Linux';
        if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider'))
            return 'Bot';
        return 'Other';
    }
    anonymizeIp(ip) {
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
    async getUserUrls(userId, page = 1, limit = 20, search, status, sort = 'createdAt', order = 'desc') {
        const skip = (page - 1) * limit;
        // Build where clause
        const where = { userId };
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
        }
        else if (status === 'inactive') {
            where.isActive = false;
        }
        const orderBy = { [sort]: order };
        const [urls, total] = await Promise.all([
            db_1.prismaRead.uRL.findMany({ where, orderBy, skip, take: limit }),
            db_1.prismaRead.uRL.count({ where }),
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
    async deleteUrl(urlId, userId) {
        let shortCode;
        await db_1.default.$transaction(async (tx) => {
            const url = await tx.uRL.findFirst({ where: { id: urlId, userId } });
            if (!url) {
                throw new errors_1.NotFoundError('URL not found or unauthorized');
            }
            shortCode = url.shortCode;
            await tx.uRL.delete({ where: { id: urlId } });
        });
        await redis_1.default.del(`${this.CACHE_PREFIX}${shortCode}`);
        (0, core_1.lruCacheDelete)(shortCode);
        await redis_1.default.set(`${this.NEGATIVE_PREFIX}${shortCode}`, '1', 'EX', NEGATIVE_CACHE_TTL);
    }
    async updateUrl(urlId, userId, data) {
        if (data.longUrl) {
            await this.validateUrl(data.longUrl);
        }
        let shortCode;
        const updated = await db_1.default.$transaction(async (tx) => {
            const url = await tx.uRL.findFirst({ where: { id: urlId, userId } });
            if (!url) {
                throw new errors_1.NotFoundError('URL not found or unauthorized');
            }
            shortCode = url.shortCode;
            const updateData = {};
            if (data.longUrl !== undefined)
                updateData.longUrl = data.longUrl;
            if (data.isActive !== undefined)
                updateData.isActive = data.isActive;
            if (data.title !== undefined)
                updateData.title = data.title;
            if (data.tags !== undefined)
                updateData.tags = data.tags;
            if (data.isOneTime !== undefined)
                updateData.isOneTime = data.isOneTime;
            if (data.maxClicks !== undefined) {
                updateData.maxClicks = data.maxClicks !== null ? BigInt(data.maxClicks) : null;
            }
            if (data.expiresInDays !== undefined) {
                updateData.expiresAt = data.expiresInDays !== null
                    ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
                    : null;
            }
            if (data.password !== undefined) {
                updateData.password = data.password ? await bcryptjs_1.default.hash(data.password, 10) : null;
            }
            return tx.uRL.update({ where: { id: urlId }, data: updateData });
        });
        await redis_1.default.del(`${this.CACHE_PREFIX}${shortCode}`);
        (0, core_1.lruCacheDelete)(shortCode);
        return updated;
    }
    async getUrlAnalytics(shortCode, userId) {
        const url = await db_1.prismaRead.uRL.findFirst({ where: { shortCode, userId } });
        if (!url) {
            return null;
        }
        const [totalClicks, recentClicks, clicksByDay, clicksByDevice, clicksByBrowser, clicksByOs, clicksByReferer] = await Promise.all([
            db_1.prismaRead.clickEvent.count({ where: { urlId: url.id } }),
            db_1.prismaRead.clickEvent.findMany({
                where: { urlId: url.id },
                orderBy: { timestamp: 'desc' },
                take: 10,
            }),
            // BUG FIX: cast count to int so it's JSON-serializable (not BigInt)
            db_1.prismaRead.$queryRaw `
        SELECT DATE(timestamp)::text as day, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id}
        GROUP BY DATE(timestamp)
        ORDER BY day DESC
        LIMIT 30
      `,
            db_1.prismaRead.$queryRaw `
        SELECT device, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND device IS NOT NULL
        GROUP BY device
        ORDER BY count DESC
        LIMIT 10
      `,
            db_1.prismaRead.$queryRaw `
        SELECT browser, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND browser IS NOT NULL
        GROUP BY browser
        ORDER BY count DESC
        LIMIT 10
      `,
            db_1.prismaRead.$queryRaw `
        SELECT os, COUNT(*)::int as count
        FROM click_events
        WHERE url_id = ${url.id} AND os IS NOT NULL
        GROUP BY os
        ORDER BY count DESC
        LIMIT 10
      `,
            db_1.prismaRead.$queryRaw `
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
    async exportUserUrlsCsv(userId) {
        const urls = await db_1.prismaRead.uRL.findMany({
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
            db_1.prismaRead.user.count(),
            db_1.prismaRead.uRL.count(),
            db_1.prismaRead.uRL.aggregate({ _sum: { clicks: true } }),
            db_1.prismaRead.uRL.count({ where: { isActive: true } }),
        ]);
        return {
            totalUsers,
            totalUrls,
            totalClicks: Number(totalClicks._sum.clicks ?? 0),
            activeUrls,
        };
    }
    async adminGetAllUrls(page = 1, limit = 20, search) {
        const skip = (page - 1) * limit;
        const where = {};
        if (search) {
            where.OR = [
                { longUrl: { contains: search, mode: 'insensitive' } },
                { shortCode: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [urls, total] = await Promise.all([
            db_1.prismaRead.uRL.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: { owner: { select: { id: true, email: true, username: true } } },
            }),
            db_1.prismaRead.uRL.count({ where }),
        ]);
        return { urls, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    async adminDeleteUrl(urlId) {
        const url = await db_1.default.uRL.findUnique({ where: { id: urlId } });
        if (!url)
            throw new errors_1.NotFoundError('URL not found');
        await db_1.default.uRL.delete({ where: { id: urlId } });
        await redis_1.default.del(`${this.CACHE_PREFIX}${url.shortCode}`);
        (0, core_1.lruCacheDelete)(url.shortCode);
        await redis_1.default.set(`${this.NEGATIVE_PREFIX}${url.shortCode}`, '1', 'EX', NEGATIVE_CACHE_TTL);
    }
}
exports.UrlService = UrlService;
exports.urlService = new UrlService();
//# sourceMappingURL=url.service.js.map