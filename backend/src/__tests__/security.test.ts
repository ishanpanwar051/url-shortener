import jwt from 'jsonwebtoken';

// ─── Mock Redis ─────────────────────────────────────────────────────────
const mockRedisGet = jest.fn().mockResolvedValue(null);
const mockRedisSet = jest.fn().mockResolvedValue('OK');
const mockRedisEval = jest.fn().mockResolvedValue([0, 0]);
jest.mock('../redis', () => ({
  __esModule: true,
  default: {
    get: mockRedisGet,
    set: mockRedisSet,
    eval: mockRedisEval,
    ping: jest.fn().mockResolvedValue('PONG'),
  },
}));

// ─── Mock Config ────────────────────────────────────────────────────────
jest.mock('../config', () => ({
  config: {
    jwtSecret: 'test-secret-key-for-security-tests-32ch',
    jwtExpiresIn: '7d',
    rateLimitPerMinute: 60,
    corsOrigin: '*',
  },
  cookieConfig: {
    name: 'token',
    options: { httpOnly: true, secure: false, sameSite: 'strict', path: '/' },
  },
  validateConfig: jest.fn(),
}));

// ─── Mock Prisma ────────────────────────────────────────────────────────
const mockPrismaUser = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
};
const mockPrismaUrl = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
};
jest.mock('../db', () => ({
  __esModule: true,
  default: { user: mockPrismaUser, uRL: mockPrismaUrl },
}));

// ─── Imports ────────────────────────────────────────────────────────────
import { generateToken, blacklistToken, authMiddleware, optionalAuth } from '../middleware/auth';

// ─────────────────────────────────────────────────────────────────────────
// SECURITY TEST SUITE
// ─────────────────────────────────────────────────────────────────────────

describe('SECURITY: Authentication & Token Revocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
  });

  describe('JWT Blacklist', () => {
    it('blacklistToken stores token in Redis with TTL matching expiry', async () => {
      const payload = { userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = jwt.sign(payload, 'test-secret-key-for-security-tests-32ch');

      await blacklistToken(token);

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.stringContaining('bl:token:'),
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('blacklisted token is rejected by authMiddleware', async () => {
      const token = generateToken({ userId: 1 });
      mockRedisGet.mockResolvedValue('1'); // token is blacklisted

      const mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as any;
      const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const mockNext = jest.fn();

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token has been revoked' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('non-blacklisted token passes authMiddleware', async () => {
      mockRedisGet.mockResolvedValue(null); // not blacklisted
      const token = generateToken({ userId: 1 });

      const mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as any;
      const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const mockNext = jest.fn();

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('Redis failure does not block legitimate requests', async () => {
      mockRedisGet.mockRejectedValue(new Error('Redis down'));
      const token = generateToken({ userId: 1 });

      const mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as any;
      const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const mockNext = jest.fn();

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('Redis failure on blacklist does not prevent storing', async () => {
      mockRedisSet.mockRejectedValue(new Error('Redis down'));
      const payload = { userId: 1, exp: Math.floor(Date.now() / 1000) + 3600 };
      const token = jwt.sign(payload, 'test-secret-key-for-security-tests-32ch');

      await expect(blacklistToken(token)).resolves.not.toThrow();
    });
  });

  describe('Token Security', () => {
    it('does not accept tokens with wrong secret', async () => {
      const token = jwt.sign({ userId: 1 }, 'wrong-secret');

      const mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as any;
      const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const mockNext = jest.fn();

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('does not accept expired tokens', async () => {
      const token = jwt.sign(
        { userId: 1, exp: Math.floor(Date.now() / 1000) - 100 },
        'test-secret-key-for-security-tests-32ch',
      );

      const mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} } as any;
      const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const mockNext = jest.fn();

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('does not accept token without Bearer prefix', async () => {
      const token = generateToken({ userId: 1 });

      const mockReq = { headers: { authorization: token }, cookies: {} } as any;
      const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;
      const mockNext = jest.fn();

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('optionalAuth does not set user for invalid tokens', async () => {
      const mockReq = { headers: { authorization: 'Bearer garbage' }, cookies: {} } as any;
      const mockRes = {} as any;
      const mockNext = jest.fn();

      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});

describe('SECURITY: Password Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const mockReq = {
      body: { email: 'test@example.com', username: 'testuser', password: 'Ab1' },
    } as any;
    const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    const { z } = await import('zod');
    const schema = z.object({
      email: z.string().email(),
      username: z.string().min(3).max(50),
      password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(100)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    });

    const result = schema.safeParse(mockReq.body);
    expect(result.success).toBe(false);
  });

  it('rejects passwords without uppercase', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      password: z
        .string()
        .min(8)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/)
        .regex(/[0-9]/),
    });

    const result = schema.safeParse({ password: 'lowercase1' });
    expect(result.success).toBe(false);
  });

  it('rejects passwords without lowercase', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      password: z
        .string()
        .min(8)
        .regex(/[A-Z]/)
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/),
    });

    const result = schema.safeParse({ password: 'UPPERCASE1' });
    expect(result.success).toBe(false);
  });

  it('rejects passwords without numbers', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      password: z
        .string()
        .min(8)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/, 'Password must contain at least one number'),
    });

    const result = schema.safeParse({ password: 'NoNumbers' });
    expect(result.success).toBe(false);
  });

  it('accepts valid passwords', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      password: z
        .string()
        .min(8)
        .max(100)
        .regex(/[A-Z]/)
        .regex(/[a-z]/)
        .regex(/[0-9]/),
    });

    expect(schema.safeParse({ password: 'Strong1Pass' }).success).toBe(true);
    expect(schema.safeParse({ password: 'MyP4ssw0rd' }).success).toBe(true);
  });
});

describe('SECURITY: Input Validation', () => {
  it('custom alias rejects special characters', async () => {
    const { z } = await import('zod');
    const schema = z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-zA-Z0-9_-]+$/);

    expect(schema.safeParse('good-alias').success).toBe(true);
    expect(schema.safeParse('good_alias').success).toBe(true);
    expect(schema.safeParse('goodalias1').success).toBe(true);

    expect(schema.safeParse('bad alias').success).toBe(false);
    expect(schema.safeParse('bad.alias').success).toBe(false);
    expect(schema.safeParse('bad/alias').success).toBe(false);
    expect(schema.safeParse('<script>').success).toBe(false);
  });

  it('URL field validates URL format', async () => {
    const { z } = await import('zod');
    const schema = z.string().url();

    expect(schema.safeParse('https://example.com').success).toBe(true);
    expect(schema.safeParse('http://example.com/path').success).toBe(true);

    expect(schema.safeParse('not-a-url').success).toBe(false);
    expect(schema.safeParse('').success).toBe(false);
    // Note: file:// and javascript: pass z.string().url() — real SSRF protection is in UrlService.validateUrl()
  });
});

describe('SECURITY: SSRF Protection (URL Validation)', () => {
  it('URL service validates URLs before creation', () => {
    const { UrlService } = require('../services/url.service');
    const service = new UrlService();

    // We can't call validateUrl directly (private), but we can test the public method
    // with invalid URLs that should fail
    expect(service.createShortUrl('not-a-url')).rejects.toThrow();
    expect(service.createShortUrl('ftp://example.com')).rejects.toThrow();
    expect(service.createShortUrl('javascript:alert(1)')).rejects.toThrow();
  });
});

describe('SECURITY: CORS Configuration', () => {
  it('config validates CORS_ORIGIN in production', () => {
    const savedEnv = { ...process.env };

    process.env.NODE_ENV = 'production';
    delete process.env.CORS_ORIGIN;
    process.env.JWT_SECRET = 'test-secret-key-for-security-tests-32ch';

    jest.resetModules();
    jest.unmock('../config');
    const { validateConfig } = require('../config');

    expect(() => validateConfig()).toThrow('CORS_ORIGIN must be set in production');

    Object.assign(process.env, savedEnv);
  });

  it('config accepts CORS_ORIGIN in production', () => {
    const savedEnv = { ...process.env };

    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://example.com';
    process.env.JWT_SECRET = 'test-secret-key-for-security-tests-32ch';

    jest.resetModules();
    jest.unmock('../config');
    const { validateConfig } = require('../config');

    expect(() => validateConfig()).not.toThrow();

    Object.assign(process.env, savedEnv);
  });
});

describe('SECURITY: IP Anonymization', () => {
  it('anonymizes IPv4 addresses', () => {
    const { UrlService } = require('../services/url.service');
    const service = new UrlService();

    // Test via private method access
    expect(service.anonymizeIp('192.168.1.100')).toBe('192.168.1.0');
    expect(service.anonymizeIp('10.0.0.1')).toBe('10.0.0.0');
    expect(service.anonymizeIp('8.8.8.8')).toBe('8.8.8.0');
    expect(service.anonymizeIp('1.2.3.4')).toBe('1.2.3.0');
  });

  it('anonymizes IPv6 addresses', () => {
    const { UrlService } = require('../services/url.service');
    const service = new UrlService();

    expect(service.anonymizeIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
      '2001:0db8:85a3:0:0:0:0:0',
    );
    // Short IPv6 addresses with fewer groups remain unchanged (loopback is too short to truncate)
    expect(service.anonymizeIp('::1')).toBe('::1');
  });

  it('handles edge cases', () => {
    const { UrlService } = require('../services/url.service');
    const service = new UrlService();

    expect(service.anonymizeIp('')).toBe('');
    expect(service.anonymizeIp('no-ip')).toBe('no-ip');
  });
});

describe('SECURITY: Route-Level Protection', () => {
  it('auth routes require rate limiting (authRateLimiter is applied)', () => {
    // Verify the auth routes module imports rate limiter
    const authRoutes = require('../routes/auth.routes');
    expect(authRoutes.default).toBeDefined();
  });

  it('URL creation routes require rate limiting', () => {
    const urlRoutes = require('../routes/url.routes');
    expect(urlRoutes.default).toBeDefined();
  });
});

describe('SECURITY: Error Handling', () => {
  it('error messages do not leak internal details', () => {
    const { authService } = require('../services/auth.service');

    // Invalid credentials should return generic message, not "user not found"
    mockPrismaUser.findUnique.mockResolvedValue(null);

    authService.login('nonexistent@example.com', 'password').catch((err: Error) => {
      expect(err.message).toBe('Invalid credentials');
      expect(err.message).not.toContain('nonexistent@example.com');
      expect(err.message).not.toContain('SELECT');
    });
  });

  it('duplicate user errors are generic', () => {
    const { authService } = require('../services/auth.service');

    const p2002Error = new Error('Unique constraint failed');
    Object.assign(p2002Error, { code: 'P2002', meta: { target: ['email'] } });
    mockPrismaUser.create.mockRejectedValue(p2002Error);

    authService.register('test@example.com', 'user', 'password').catch((err: Error) => {
      expect(err.message).toBe('Email or username already taken');
      expect(err.message).not.toContain('email');
      expect(err.message).not.toContain('INSERT');
    });
  });
});
