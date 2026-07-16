const mockPrisma = {
  uRL: {
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  clickEvent: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(async (arg: any) => {
    if (typeof arg === 'function') {
      return arg(mockPrisma);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg.map((x: any) => x));
    }
    return undefined;
  }),
  $queryRaw: jest.fn(),
};

jest.mock('../db', () => ({
  __esModule: true,
  default: mockPrisma,
  prisma: mockPrisma,
  prismaRead: mockPrisma,
}));

const mockRedisStore = new Map<string, string>();

const mockRedis = {
  get: jest.fn().mockImplementation(async (key: string) => mockRedisStore.get(key) ?? null),
  set: jest.fn().mockImplementation(async (key: string, value: string) => { mockRedisStore.set(key, value); return 'OK'; }),
  del: jest.fn().mockImplementation(async (key: string) => { mockRedisStore.delete(key); return 1; }),
  rpush: jest.fn().mockResolvedValue(1),
  llen: jest.fn().mockResolvedValue(0),
  lrange: jest.fn().mockResolvedValue([]),
  ltrim: jest.fn().mockResolvedValue('OK'),
};

jest.mock('../redis', () => ({
  __esModule: true,
  default: mockRedis,
}));

jest.mock('../utils/core', () => ({
  generateUniqueId: jest.fn().mockReturnValue(123456789),
  encodeBase62: jest.fn().mockReturnValue('abc123'),
  bloomFilterInsert: jest.fn(),
  bloomFilterContains: jest.fn().mockReturnValue(true),
  lruCacheGet: jest.fn().mockReturnValue(null),
  lruCachePut: jest.fn(),
}));

import { urlService } from '../services/url.service';

describe('UrlService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisStore.clear();
    mockRedis.get.mockImplementation(async (key: string) => mockRedisStore.get(key) ?? null);
    mockRedis.set.mockImplementation(async (key: string, value: string) => { mockRedisStore.set(key, value); return 'OK'; });
    mockRedis.del.mockImplementation(async (key: string) => { mockRedisStore.delete(key); return 1; });
    mockRedis.rpush.mockResolvedValue(1);
    mockRedis.llen.mockResolvedValue(0);
    mockRedis.lrange.mockResolvedValue([]);
    mockRedis.ltrim.mockResolvedValue('OK');
    const { lruCacheGet } = require('../utils/core');
    lruCacheGet.mockReturnValue(null);
  });

  describe('createShortUrl', () => {
    it('should create a short URL without custom alias', async () => {
      mockPrisma.uRL.create.mockResolvedValue({
        id: 1,
        shortCode: 'abc123',
        longUrl: 'https://example.com',
        customAlias: null,
        userId: null,
        clicks: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      });

      const result = await urlService.createShortUrl('https://example.com');

      expect(result.shortCode).toBe('abc123');
      expect(mockPrisma.uRL.create).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('should create a short URL with custom alias', async () => {
      mockPrisma.uRL.create.mockResolvedValue({
        id: 1,
        shortCode: 'myalias',
        longUrl: 'https://example.com',
        customAlias: 'myalias',
        userId: null,
        clicks: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await urlService.createShortUrl('https://example.com', undefined, 'myalias');

      expect(result.shortCode).toBe('myalias');
      expect(mockPrisma.uRL.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ customAlias: 'myalias' }) }),
      );
    });

    it('should throw if custom alias already taken', async () => {
      const p2002Error = new Error('Unique constraint failed');
      Object.assign(p2002Error, {
        code: 'P2002',
        meta: { target: ['custom_alias'] },
      });
      mockPrisma.uRL.create.mockRejectedValue(p2002Error);

      await expect(
        urlService.createShortUrl('https://example.com', undefined, 'myalias')
      ).rejects.toThrow('Custom alias already taken');
    });
  });

  describe('getLongUrl', () => {
    it('should return cached URL from LRU', async () => {
      const { lruCacheGet } = require('../utils/core');
      lruCacheGet.mockReturnValue('https://cached-example.com');

      const result = await urlService.getLongUrl('abc123');

      expect(result).toEqual({ longUrl: 'https://cached-example.com', cached: true });
    });

    it('should return URL from Redis cache', async () => {
      mockRedisStore.set('url:abc123', 'https://redis-example.com');

      const result = await urlService.getLongUrl('abc123');

      expect(result).toEqual({ longUrl: 'https://redis-example.com', cached: true });
    });

    it('should return URL from database', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.uRL.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc123',
        longUrl: 'https://db-example.com',
        isActive: true,
        expiresAt: null,
      });

      const result = await urlService.getLongUrl('abc123');

      expect(result).toEqual({ longUrl: 'https://db-example.com', cached: false });
    });

    it('should return null for inactive URLs', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.uRL.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc123',
        longUrl: 'https://example.com',
        isActive: false,
        expiresAt: null,
      });

      const result = await urlService.getLongUrl('abc123');

      expect(result).toBeNull();
    });

    it('should return null for expired URLs', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.uRL.findUnique.mockResolvedValue({
        id: 1,
        shortCode: 'abc123',
        longUrl: 'https://example.com',
        isActive: true,
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await urlService.getLongUrl('abc123');

      expect(result).toBeNull();
    });

    it('should return null for non-existent URLs', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.uRL.findUnique.mockResolvedValue(null);

      const result = await urlService.getLongUrl('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserUrls', () => {
    it('should return paginated user URLs', async () => {
      mockPrisma.uRL.findMany.mockResolvedValue([
        { id: 1, shortCode: 'abc', longUrl: 'https://example.com', clicks: 5, isActive: true },
      ]);
      mockPrisma.uRL.count.mockResolvedValue(1);

      const result = await urlService.getUserUrls(1, 1, 20);

      expect(result.urls).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });

  describe('deleteUrl', () => {
    it('should delete a URL owned by the user', async () => {
      mockPrisma.uRL.findFirst.mockResolvedValue({ id: 1, shortCode: 'abc123', userId: 1 });
      mockPrisma.uRL.delete.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(1);

      await urlService.deleteUrl(1, 1);

      expect(mockPrisma.uRL.delete).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockRedis.del).toHaveBeenCalledWith('url:abc123');
    });

    it('should throw if URL not owned by user', async () => {
      mockPrisma.uRL.findFirst.mockResolvedValue(null);

      await expect(urlService.deleteUrl(1, 1)).rejects.toThrow('URL not found or unauthorized');
    });
  });

  describe('updateUrl', () => {
    it('should update a URL owned by the user', async () => {
      mockPrisma.uRL.findFirst.mockResolvedValue({ id: 1, shortCode: 'abc123', userId: 1 });
      mockPrisma.uRL.update.mockResolvedValue({
        id: 1,
        shortCode: 'abc123',
        longUrl: 'https://updated.com',
        isActive: true,
      });

      const result = await urlService.updateUrl(1, 1, { longUrl: 'https://updated.com' });

      expect(result.longUrl).toBe('https://updated.com');
      expect(mockRedis.del).toHaveBeenCalledWith('url:abc123');
    });

    it('should throw if URL not owned by user', async () => {
      mockPrisma.uRL.findFirst.mockResolvedValue(null);

      await expect(urlService.updateUrl(1, 1, { longUrl: 'https://x.com' })).rejects.toThrow('URL not found or unauthorized');
    });
  });

  describe('getUrlAnalytics', () => {
    it('should return analytics for a URL owned by the user', async () => {
      mockPrisma.uRL.findFirst.mockResolvedValue({
        id: 1,
        shortCode: 'abc123',
        longUrl: 'https://example.com',
        clicks: 10,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      });
      mockPrisma.clickEvent.count.mockResolvedValue(10);
      mockPrisma.clickEvent.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await urlService.getUrlAnalytics('abc123', 1);

      expect(result).not.toBeNull();
      expect(result!.totalClicks).toBe(10);
    });

    it('should return null for unowned URLs', async () => {
      mockPrisma.uRL.findFirst.mockResolvedValue(null);

      const result = await urlService.getUrlAnalytics('abc123', 999);

      expect(result).toBeNull();
    });
  });

  describe('parseDevice', () => {
    it('should detect iOS', () => {
      const device = (urlService as any).parseDevice(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      );
      expect(device).toBe('iOS');
    });

    it('should detect Android', () => {
      const device = (urlService as any).parseDevice(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
      );
      expect(device).toBe('Android');
    });

    it('should detect Windows', () => {
      const device = (urlService as any).parseDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      );
      expect(device).toBe('Windows');
    });

    it('should detect Mac', () => {
      const device = (urlService as any).parseDevice(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      );
      expect(device).toBe('Mac');
    });

    it('should detect Bot', () => {
      const device = (urlService as any).parseDevice(
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      );
      expect(device).toBe('Bot');
    });

    it('should return null for undefined user agent', () => {
      const device = (urlService as any).parseDevice(undefined);
      expect(device).toBeNull();
    });
  });
});
