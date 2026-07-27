import { config } from '../config';
import logger from './logger';

// C++ native module - compiled from backend/core
// eslint-disable-next-line @typescript-eslint/no-var-requires
let native: any = null;
try {
  native = require('../../core/build/url_shortener_core');
} catch {
  logger.warn('C++ native module not found, using JS fallback');
}

// ─── JS Fallback: Bloom Filter ────────────────────────────────────────────
class JSBloomFilter {
  private bits: Uint8Array;
  private size: number;
  private hashCount: number;

  constructor(expectedItems: number, fpr: number) {
    const m = Math.ceil((-expectedItems * Math.log(fpr)) / (Math.log(2) ** 2));
    this.size = m;
    this.hashCount = Math.ceil((m / expectedItems) * Math.log(2));
    this.bits = new Uint8Array(Math.ceil(m / 8));
  }

  private hashes(key: string, seed: number): number {
    let h = seed;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % this.size;
  }

  insert(key: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const idx = this.hashes(key, i + 1);
      this.bits[idx >> 3] |= 1 << (idx & 7);
    }
  }

  contains(key: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const idx = this.hashes(key, i + 1);
      if ((this.bits[idx >> 3] & (1 << (idx & 7))) === 0) return false;
    }
    return true;
  }
}

// ─── JS Fallback: LRU Cache ──────────────────────────────────────────────
class JSLRUCache {
  private map = new Map<string, string>();
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  get(key: string): string | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  put(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value!;
      this.map.delete(oldest);
    }
  }
}

// ─── JS Fallback: Consistent Hash ─────────────────────────────────────────
class JSConsistentHash {
  private ring = new Map<number, string>();
  private sortedKeys: number[] = [];
  private virtualNodes: number;

  constructor(virtualNodes: number = 150) {
    this.virtualNodes = virtualNodes;
  }

  private hashCode(key: string): number {
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) - h + key.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  addNode(node: string): void {
    for (let i = 0; i < this.virtualNodes; i++) {
      const hash = this.hashCode(`${node}#${i}`);
      this.ring.set(hash, node);
      this.sortedKeys.push(hash);
    }
    this.sortedKeys.sort((a, b) => a - b);
  }

  getNode(key: string): string | null {
    if (this.sortedKeys.length === 0) return null;
    const hash = this.hashCode(key);
    let lo = 0, hi = this.sortedKeys.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sortedKeys[mid] < hash) lo = mid + 1;
      else hi = mid;
    }
    if (lo === this.sortedKeys.length) lo = 0;
    return this.ring.get(this.sortedKeys[lo]) ?? null;
  }
}

// ─── Singletons ──────────────────────────────────────────────────────────

// Bloom filter singleton
let bloomFilter: any = null;
export function getBloomFilter(): any {
  if (!bloomFilter) {
    if (native?.BloomFilter) {
      bloomFilter = new native.BloomFilter(config.bloomFilterExpected, config.bloomFilterFpr);
    } else {
      bloomFilter = new JSBloomFilter(config.bloomFilterExpected, config.bloomFilterFpr);
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
    } else {
      lruCache = new JSLRUCache(config.lruCacheCapacity);
    }
  }
  return lruCache;
}

// Consistent Hash singleton
let consistentHash: any = null;
export function getConsistentHash(): any {
  if (!consistentHash) {
    if (native?.ConsistentHash) {
      consistentHash = new native.ConsistentHash(150);
    } else {
      consistentHash = new JSConsistentHash(150);
    }
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
  // Always use JS implementation — C++ snowflake IDs exceed Number.MAX_SAFE_INTEGER
  // and lose precision when passed through N-API as JavaScript numbers.
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

export function lruCacheDelete(key: string): void {
  const cache = getLRUCache();
  if (!cache) return;
  cache.del?.(key) ?? cache.delete?.(key);
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
