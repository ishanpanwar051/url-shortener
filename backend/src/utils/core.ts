import { config } from '../config';
import logger from './logger';

// C++ native module - compiled from backend/core
// eslint-disable-next-line @typescript-eslint/no-var-requires
let native: any = null;
try {
  native = require('../../core/build/Release/url_shortener_core');
} catch {
  logger.warn('C++ native module not found, using JS fallback');
}

// Bloom filter singleton
let bloomFilter: any = null;
export function getBloomFilter(): any {
  if (!bloomFilter) {
    if (native?.BloomFilter) {
      bloomFilter = new native.BloomFilter(config.bloomFilterExpected, config.bloomFilterFpr);
    }
  }
  return bloomFilter;
}

// LRU Cache singleton
let lruCache: any = null;
export function getLRUCache(): any {
  if (!lruCache) {
    if (native?.LRUCache) {
      lruCache = new native.LRUCache(config.lruCacheCapacity);
    }
  }
  return lruCache;
}

// Consistent Hash singleton
let consistentHash: any = null;
export function getConsistentHash(): any {
  if (!consistentHash) {
    consistentHash = native?.ConsistentHash ? new native.ConsistentHash(150) : null;
  }
  return consistentHash;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function encodeBase62(id: number): string {
  if (native?.encodeBase62) {
    return native.encodeBase62(id);
  }
  // JS fallback
  if (id === 0) return BASE62[0];
  let result = '';
  while (id > 0) {
    result = BASE62[id % 62] + result;
    id = Math.floor(id / 62);
  }
  return result;
}

export function decodeBase62(code: string): number {
  if (native?.decodeBase62) {
    return native.decodeBase62(code);
  }
  let result = 0;
  for (const c of code) {
    const idx = BASE62.indexOf(c);
    if (idx === -1) return 0;
    result = result * 62 + idx;
  }
  return result;
}

const SNOWFLAKE_EPOCH = 1700000000000;
let snowflakeSeq = 0;
let snowflakeLastTs = 0;

export function generateUniqueId(machineId: number = config.machineId): number {
  if (native?.generateUniqueId) {
    return native.generateUniqueId(machineId);
  }
  let ts = Date.now() - SNOWFLAKE_EPOCH;
  if (ts < snowflakeLastTs) ts = snowflakeLastTs;
  if (ts === snowflakeLastTs) {
    snowflakeSeq = (snowflakeSeq + 1) & 0x3F;
    if (snowflakeSeq === 0) {
      while (Date.now() - SNOWFLAKE_EPOCH <= snowflakeLastTs) { /* spin */ }
      ts = Date.now() - SNOWFLAKE_EPOCH;
    }
  } else {
    snowflakeSeq = 0;
  }
  snowflakeLastTs = ts;
  // 41 bits ts | 6 bits machineId | 6 bits seq — fits in MAX_SAFE_INTEGER (2^53)
  return ts * 4096 + ((machineId & 0x3F) << 6) + snowflakeSeq;
}

export function hashString(key: string): number {
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

export function bloomFilterInit(): void {
  getBloomFilter();
}

export function bloomFilterInsert(key: string): void {
  const bf = getBloomFilter();
  if (bf) {
    bf.insert(key);
  }
}

export function bloomFilterContains(key: string): boolean {
  const bf = getBloomFilter();
  // Without the native bloom filter, conservatively assume the key might exist
  return bf ? bf.contains(key) : true;
}

const LRU_CACHE_TTL = 300_000; // 5 minutes

interface LRUCacheEntry {
  v: string;
  e: number;
}

export function lruCacheGet(key: string): string | null {
  const cache = getLRUCache();
  if (!cache) return null;
  const raw = cache.get(key);
  if (raw == null) return null;
  try {
    const entry: LRUCacheEntry = JSON.parse(raw);
    if (Date.now() < entry.e) {
      return entry.v;
    }
    // Expired — leave for capacity-based eviction
    return null;
  } catch {
    // Backward compat: stored before TTL was added
    return raw;
  }
}

export function lruCachePut(key: string, value: string): void {
  const cache = getLRUCache();
  if (!cache) return;
  const entry: LRUCacheEntry = { v: value, e: Date.now() + LRU_CACHE_TTL };
  cache.put(key, JSON.stringify(entry));
}

export function consistentHashGetNode(key: string): string | null {
  const ch = getConsistentHash();
  return ch ? ch.getNode(key) : null;
}

export function consistentHashAddNode(node: string): void {
  const ch = getConsistentHash();
  if (ch) {
    ch.addNode(node);
  }
}
