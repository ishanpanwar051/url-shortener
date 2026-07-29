export declare function getBloomFilter(): any;
export declare function getLRUCache(): any;
export declare function getConsistentHash(): any;
export declare function encodeBase62(id: number): string;
export declare function decodeBase62(code: string): number;
export declare function generateUniqueId(machineId?: number): number;
export declare function hashString(key: string): number;
export declare function bloomFilterInit(): void;
export declare function bloomFilterInsert(key: string): void;
export declare function bloomFilterContains(key: string): boolean;
export declare function lruCacheGet(key: string): string | null;
export declare function lruCachePut(key: string, value: string): void;
export declare function lruCacheDelete(key: string): void;
export declare function consistentHashGetNode(key: string): string | null;
export declare function consistentHashAddNode(node: string): void;
export interface ParsedUA {
    browser: string;
    os: string;
}
export declare function parseUserAgent(ua?: string): ParsedUA;
export interface UTMParams {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
}
export declare function extractUTM(referer?: string): UTMParams;
//# sourceMappingURL=core.d.ts.map