"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockRedis = {
    eval: jest.fn(),
};
jest.mock('../redis', () => ({
    __esModule: true,
    default: mockRedis,
}));
jest.mock('../config', () => ({
    config: {
        rateLimitPerMinute: 5,
    },
}));
const rateLimiter_1 = require("../middleware/rateLimiter");
function createMocks(path = '/test') {
    return {
        req: { ip: '127.0.0.1', path },
        res: {
            setHeader: jest.fn(),
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        },
        next: jest.fn(),
    };
}
describe('rateLimiter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should allow first request (count=1)', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockResolvedValue([1, 60]);
        await (0, rateLimiter_1.rateLimiter)(req, res, next);
        expect(mockRedis.eval).toHaveBeenCalledTimes(1);
        expect(mockRedis.eval).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'ratelimit:/test:127.0.0.1', '60');
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
        expect(next).toHaveBeenCalled();
    });
    it('should allow requests within limit', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockResolvedValue([3, 45]);
        await (0, rateLimiter_1.rateLimiter)(req, res, next);
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 2);
        expect(next).toHaveBeenCalled();
    });
    it('should block requests over limit', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockResolvedValue([6, 30]);
        await (0, rateLimiter_1.rateLimiter)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json).toHaveBeenCalledWith({
            error: 'Too many requests',
            retryAfter: 30,
        });
        expect(next).not.toHaveBeenCalled();
    });
    it('should allow request if Redis is unavailable (fail-open)', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockRejectedValue(new Error('Connection refused'));
        await (0, rateLimiter_1.rateLimiter)(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
describe('authRateLimiter', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should use authlimit prefix and limit of 10', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockResolvedValue([1, 60]);
        await (0, rateLimiter_1.authRateLimiter)(req, res, next);
        expect(mockRedis.eval).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'authlimit:/test:127.0.0.1', '60');
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
        expect(next).toHaveBeenCalled();
    });
    it('should allow exactly 10 requests (the auth limit)', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockResolvedValue([10, 30]);
        await (0, rateLimiter_1.authRateLimiter)(req, res, next);
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
        expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
        expect(next).toHaveBeenCalled();
    });
    it('should block requests over auth limit', async () => {
        const { req, res, next } = createMocks();
        mockRedis.eval.mockResolvedValue([11, 30]);
        await (0, rateLimiter_1.authRateLimiter)(req, res, next);
        expect(res.status).toHaveBeenCalledWith(429);
        expect(next).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=rateLimiter.test.js.map