"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBloomFilter = getBloomFilter;
exports.getLRUCache = getLRUCache;
exports.getConsistentHash = getConsistentHash;
exports.encodeBase62 = encodeBase62;
exports.decodeBase62 = decodeBase62;
exports.generateUniqueId = generateUniqueId;
exports.hashString = hashString;
exports.bloomFilterInit = bloomFilterInit;
exports.bloomFilterInsert = bloomFilterInsert;
exports.bloomFilterContains = bloomFilterContains;
exports.lruCacheGet = lruCacheGet;
exports.lruCachePut = lruCachePut;
exports.lruCacheDelete = lruCacheDelete;
exports.consistentHashGetNode = consistentHashGetNode;
exports.consistentHashAddNode = consistentHashAddNode;
exports.parseUserAgent = parseUserAgent;
exports.extractUTM = extractUTM;
const config_1 = require("../config");
const logger_1 = __importDefault(require("./logger"));
// C++ native module - compiled from backend/core
// eslint-disable-next-line @typescript-eslint/no-var-requires
let native = null;
try {
    native = require('../../core/build/url_shortener_core');
}
catch {
    logger_1.default.warn('C++ native module not found, using JS fallback');
}
// ─── JS Fallback: Bloom Filter ────────────────────────────────────────────
class JSBloomFilter {
    constructor(expectedItems, fpr) {
        const m = Math.ceil((-expectedItems * Math.log(fpr)) / (Math.log(2) ** 2));
        this.size = m;
        this.hashCount = Math.ceil((m / expectedItems) * Math.log(2));
        this.bits = new Uint8Array(Math.ceil(m / 8));
    }
    hashes(key, seed) {
        let h = seed;
        for (let i = 0; i < key.length; i++) {
            h = ((h << 5) - h + key.charCodeAt(i)) | 0;
        }
        return Math.abs(h) % this.size;
    }
    insert(key) {
        for (let i = 0; i < this.hashCount; i++) {
            const idx = this.hashes(key, i + 1);
            this.bits[idx >> 3] |= 1 << (idx & 7);
        }
    }
    contains(key) {
        for (let i = 0; i < this.hashCount; i++) {
            const idx = this.hashes(key, i + 1);
            if ((this.bits[idx >> 3] & (1 << (idx & 7))) === 0)
                return false;
        }
        return true;
    }
}
// ─── JS Fallback: LRU Cache ──────────────────────────────────────────────
class JSLRUCache {
    constructor(capacity) {
        this.map = new Map();
        this.capacity = capacity;
    }
    get(key) {
        const val = this.map.get(key);
        if (val !== undefined) {
            this.map.delete(key);
            this.map.set(key, val);
        }
        return val;
    }
    put(key, value) {
        if (this.map.has(key))
            this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.capacity) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
    }
    // BUG FIX: delete method was missing — lruCacheDelete called cache.del?.(key) which always no-oped
    delete(key) {
        this.map.delete(key);
    }
}
// ─── JS Fallback: Consistent Hash ─────────────────────────────────────────
class JSConsistentHash {
    constructor(virtualNodes = 150) {
        this.ring = new Map();
        this.sortedKeys = [];
        this.virtualNodes = virtualNodes;
    }
    hashCode(key) {
        let h = 0;
        for (let i = 0; i < key.length; i++) {
            h = ((h << 5) - h + key.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    }
    addNode(node) {
        for (let i = 0; i < this.virtualNodes; i++) {
            const hash = this.hashCode(`${node}#${i}`);
            this.ring.set(hash, node);
            this.sortedKeys.push(hash);
        }
        this.sortedKeys.sort((a, b) => a - b);
    }
    getNode(key) {
        if (this.sortedKeys.length === 0)
            return null;
        const hash = this.hashCode(key);
        let lo = 0, hi = this.sortedKeys.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.sortedKeys[mid] < hash)
                lo = mid + 1;
            else
                hi = mid;
        }
        if (lo === this.sortedKeys.length)
            lo = 0;
        return this.ring.get(this.sortedKeys[lo]) ?? null;
    }
}
// ─── Singletons ──────────────────────────────────────────────────────────
// Bloom filter singleton
let bloomFilter = null;
function getBloomFilter() {
    if (!bloomFilter) {
        if (native?.BloomFilter) {
            bloomFilter = new native.BloomFilter(config_1.config.bloomFilterExpected, config_1.config.bloomFilterFpr);
        }
        else {
            bloomFilter = new JSBloomFilter(config_1.config.bloomFilterExpected, config_1.config.bloomFilterFpr);
        }
    }
    return bloomFilter;
}
// LRU Cache singleton
let lruCache = null;
function getLRUCache() {
    if (!lruCache) {
        if (native?.LRUCache) {
            lruCache = new native.LRUCache(config_1.config.lruCacheCapacity);
        }
        else {
            lruCache = new JSLRUCache(config_1.config.lruCacheCapacity);
        }
    }
    return lruCache;
}
// Consistent Hash singleton
let consistentHash = null;
function getConsistentHash() {
    if (!consistentHash) {
        if (native?.ConsistentHash) {
            consistentHash = new native.ConsistentHash(150);
        }
        else {
            consistentHash = new JSConsistentHash(150);
        }
    }
    return consistentHash;
}
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function encodeBase62(id) {
    if (native?.encodeBase62) {
        return native.encodeBase62(id);
    }
    // JS fallback
    if (id === 0)
        return BASE62[0];
    let result = '';
    while (id > 0) {
        result = BASE62[id % 62] + result;
        id = Math.floor(id / 62);
    }
    return result;
}
function decodeBase62(code) {
    if (native?.decodeBase62) {
        return native.decodeBase62(code);
    }
    let result = 0;
    for (const c of code) {
        const idx = BASE62.indexOf(c);
        if (idx === -1)
            return 0;
        result = result * 62 + idx;
    }
    return result;
}
const SNOWFLAKE_EPOCH = 1700000000000;
let snowflakeSeq = 0;
let snowflakeLastTs = 0;
function generateUniqueId(machineId = config_1.config.machineId) {
    // Always use JS implementation — C++ snowflake IDs exceed Number.MAX_SAFE_INTEGER
    // and lose precision when passed through N-API as JavaScript numbers.
    let ts = Date.now() - SNOWFLAKE_EPOCH;
    if (ts < snowflakeLastTs)
        ts = snowflakeLastTs;
    if (ts === snowflakeLastTs) {
        snowflakeSeq = (snowflakeSeq + 1) & 0x3F;
        if (snowflakeSeq === 0) {
            while (Date.now() - SNOWFLAKE_EPOCH <= snowflakeLastTs) { /* spin */ }
            ts = Date.now() - SNOWFLAKE_EPOCH;
        }
    }
    else {
        snowflakeSeq = 0;
    }
    snowflakeLastTs = ts;
    // 41 bits ts | 6 bits machineId | 6 bits seq — fits in MAX_SAFE_INTEGER (2^53)
    return ts * 4096 + ((machineId & 0x3F) << 6) + snowflakeSeq;
}
function hashString(key) {
    if (native?.hashString) {
        return native.hashString(key);
    }
    // JS fallback - Bob Jenkins one-at-a-time
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash += key.charCodeAt(i);
        hash += hash << 10;
        hash ^= hash >> 6;
    }
    hash += hash << 3;
    hash ^= hash >> 11;
    hash += hash << 15;
    return hash >>> 0;
}
function bloomFilterInit() {
    getBloomFilter();
}
function bloomFilterInsert(key) {
    const bf = getBloomFilter();
    if (bf) {
        bf.insert(key);
    }
}
function bloomFilterContains(key) {
    const bf = getBloomFilter();
    return bf ? bf.contains(key) : true;
}
const LRU_CACHE_TTL = 300000; // 5 minutes
function lruCacheGet(key) {
    const cache = getLRUCache();
    if (!cache)
        return null;
    const raw = cache.get(key);
    if (raw == null)
        return null;
    try {
        const entry = JSON.parse(raw);
        if (Date.now() < entry.e) {
            return entry.v;
        }
        // Expired — leave for capacity-based eviction
        return null;
    }
    catch {
        // Backward compat: stored before TTL was added
        return raw;
    }
}
function lruCachePut(key, value) {
    const cache = getLRUCache();
    if (!cache)
        return;
    const entry = { v: value, e: Date.now() + LRU_CACHE_TTL };
    cache.put(key, JSON.stringify(entry));
}
function lruCacheDelete(key) {
    const cache = getLRUCache();
    if (!cache)
        return;
    // Use .delete() — JSLRUCache implements it; native addon may use .del()
    if (typeof cache.delete === 'function') {
        cache.delete(key);
    }
    else if (typeof cache.del === 'function') {
        cache.del(key);
    }
}
function consistentHashGetNode(key) {
    const ch = getConsistentHash();
    return ch ? ch.getNode(key) : null;
}
function consistentHashAddNode(node) {
    const ch = getConsistentHash();
    if (ch) {
        ch.addNode(node);
    }
}
function parseUserAgent(ua) {
    if (!ua)
        return { browser: 'Unknown', os: 'Unknown' };
    const s = ua.toLowerCase();
    // Browser detection (order matters — check specific before generic)
    let browser = 'Other';
    if (s.includes('edg/') || s.includes('edge/'))
        browser = 'Edge';
    else if (s.includes('opr/') || s.includes('opera/'))
        browser = 'Opera';
    else if (s.includes('chrome/') && !s.includes('chromium'))
        browser = 'Chrome';
    else if (s.includes('chromium/'))
        browser = 'Chromium';
    else if (s.includes('firefox/') || s.includes('fxios/'))
        browser = 'Firefox';
    else if (s.includes('safari/') && !s.includes('chrome'))
        browser = 'Safari';
    else if (s.includes('msie') || s.includes('trident/'))
        browser = 'IE';
    else if (s.includes('bot') || s.includes('crawler') || s.includes('spider') || s.includes('googlebot') || s.includes('bingbot'))
        browser = 'Bot';
    // OS detection
    let os = 'Other';
    if (s.includes('windows nt'))
        os = 'Windows';
    else if (s.includes('iphone') || s.includes('ipad'))
        os = 'iOS';
    else if (s.includes('android'))
        os = 'Android';
    else if (s.includes('macintosh') || s.includes('mac os x'))
        os = 'macOS';
    else if (s.includes('linux'))
        os = 'Linux';
    else if (s.includes('cros'))
        os = 'ChromeOS';
    return { browser, os };
}
function extractUTM(referer) {
    if (!referer)
        return {};
    try {
        const url = new URL(referer);
        return {
            utmSource: url.searchParams.get('utm_source') ?? undefined,
            utmMedium: url.searchParams.get('utm_medium') ?? undefined,
            utmCampaign: url.searchParams.get('utm_campaign') ?? undefined,
        };
    }
    catch {
        return {};
    }
}
//# sourceMappingURL=core.js.map