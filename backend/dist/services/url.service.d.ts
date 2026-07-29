export declare const FRONTEND_ROUTES: Set<string>;
export declare class UrlService {
    private readonly CACHE_PREFIX;
    private readonly NEGATIVE_PREFIX;
    private readonly COUNTER_PREFIX;
    private bloomFilterReady;
    /** Load all existing short codes into the bloom filter on startup. */
    hydrateBloomFilter(): Promise<void>;
    private ip4ToInt;
    private ip4InCidr;
    private isPrivateIPv4;
    private isPrivateIPv6;
    validateUrl(rawUrl: string): Promise<void>;
    createShortUrl(longUrl: string, userId?: number, customAlias?: string, expiresInDays?: number, options?: {
        title?: string;
        tags?: string[];
        password?: string;
        maxClicks?: number;
        isOneTime?: boolean;
    }): Promise<{
        id: number;
        shortCode: string;
        longUrl: string;
        title: string | null;
        customAlias: string | null;
        userId: number | null;
        clicks: bigint;
        expiresAt: Date | null;
        isActive: boolean;
        tags: string[];
        password: string | null;
        maxClicks: bigint | null;
        isOneTime: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private serializeCacheEntry;
    private parseCacheEntry;
    private cacheUrl;
    private generateCandidateCode;
    private persistUrlWithRetry;
    getLongUrl(shortCode: string, ipAddress?: string, userAgent?: string, referer?: string, password?: string): Promise<{
        requiresPassword: boolean;
        wrongPassword?: undefined;
        longUrl?: undefined;
        cached?: undefined;
    } | {
        wrongPassword: boolean;
        requiresPassword?: undefined;
        longUrl?: undefined;
        cached?: undefined;
    } | {
        longUrl: string;
        cached: boolean;
        requiresPassword?: undefined;
        wrongPassword?: undefined;
    } | null>;
    private fetchUrlWithStampedeProtection;
    private bufferClick;
    flushClickQueue(batchSize?: number): Promise<number>;
    private recoverProcessingQueue;
    private parseDevice;
    private anonymizeIp;
    getUserUrls(userId: number, page?: number, limit?: number, search?: string, status?: 'active' | 'inactive' | 'all', sort?: 'createdAt' | 'clicks' | 'expiresAt', order?: 'asc' | 'desc'): Promise<{
        urls: {
            id: number;
            shortCode: string;
            longUrl: string;
            title: string | null;
            customAlias: string | null;
            userId: number | null;
            clicks: bigint;
            expiresAt: Date | null;
            isActive: boolean;
            tags: string[];
            password: string | null;
            maxClicks: bigint | null;
            isOneTime: boolean;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    }>;
    deleteUrl(urlId: number, userId: number): Promise<void>;
    updateUrl(urlId: number, userId: number, data: {
        longUrl?: string;
        isActive?: boolean;
        title?: string;
        tags?: string[];
        password?: string | null;
        maxClicks?: number | null;
        isOneTime?: boolean;
        expiresInDays?: number | null;
    }): Promise<{
        id: number;
        shortCode: string;
        longUrl: string;
        title: string | null;
        customAlias: string | null;
        userId: number | null;
        clicks: bigint;
        expiresAt: Date | null;
        isActive: boolean;
        tags: string[];
        password: string | null;
        maxClicks: bigint | null;
        isOneTime: boolean;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getUrlAnalytics(shortCode: string, userId: number): Promise<{
        url: {
            id: number;
            shortCode: string;
            longUrl: string;
            title: string | null;
            customAlias: string | null;
            userId: number | null;
            clicks: bigint;
            expiresAt: Date | null;
            isActive: boolean;
            tags: string[];
            password: string | null;
            maxClicks: bigint | null;
            isOneTime: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
        totalClicks: number;
        recentClicks: {
            id: number;
            urlId: number;
            browser: string | null;
            os: string | null;
            timestamp: Date;
            ipAddress: string | null;
            userAgent: string | null;
            referer: string | null;
            country: string | null;
            city: string | null;
            device: string | null;
            utmSource: string | null;
            utmMedium: string | null;
            utmCampaign: string | null;
        }[];
        clicksByDay: {
            day: string;
            count: number;
        }[];
        clicksByDevice: {
            device: string | null;
            count: number;
        }[];
        clicksByBrowser: {
            browser: string | null;
            count: number;
        }[];
        clicksByOs: {
            os: string | null;
            count: number;
        }[];
        clicksByReferer: {
            referer: string | null;
            count: number;
        }[];
    } | null>;
    exportUserUrlsCsv(userId: number): Promise<string>;
    getSystemStats(): Promise<{
        totalUsers: number;
        totalUrls: number;
        totalClicks: number;
        activeUrls: number;
    }>;
    adminGetAllUrls(page?: number, limit?: number, search?: string): Promise<{
        urls: ({
            owner: {
                id: number;
                email: string;
                username: string;
            } | null;
        } & {
            id: number;
            shortCode: string;
            longUrl: string;
            title: string | null;
            customAlias: string | null;
            userId: number | null;
            clicks: bigint;
            expiresAt: Date | null;
            isActive: boolean;
            tags: string[];
            password: string | null;
            maxClicks: bigint | null;
            isOneTime: boolean;
            createdAt: Date;
            updatedAt: Date;
        })[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    adminDeleteUrl(urlId: number): Promise<void>;
}
export declare const urlService: UrlService;
//# sourceMappingURL=url.service.d.ts.map