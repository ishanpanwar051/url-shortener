import { CookieOptions } from 'express';
export declare function validateConfig(): void;
export declare const config: {
    port: number;
    databaseUrl: string;
    replicaDatabaseUrl: string;
    redisUrl: string;
    jwtSecret: string;
    jwtExpiresIn: string;
    machineId: number;
    bloomFilterExpected: number;
    bloomFilterFpr: number;
    lruCacheCapacity: number;
    rateLimitPerMinute: number;
    shortCodeLength: number;
    defaultUrlExpiryDays: number;
    corsOrigin: string;
    publicBaseUrl: string;
    isProduction: boolean;
    cookieDomain: string | undefined;
    cookieSecure: boolean;
};
export declare const cookieConfig: {
    name: string;
    options: CookieOptions;
};
//# sourceMappingURL=config.d.ts.map