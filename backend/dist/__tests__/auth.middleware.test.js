"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
jest.mock('../redis', () => ({
    __esModule: true,
    default: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), eval: jest.fn() },
}));
jest.mock('../config', () => ({
    config: {
        jwtSecret: 'test-secret',
        jwtExpiresIn: '1h',
    },
}));
const auth_1 = require("../middleware/auth");
describe('Auth Middleware', () => {
    describe('generateToken', () => {
        it('should generate a valid JWT token', () => {
            const payload = { userId: 1, email: 'test@example.com', username: 'testuser' };
            const token = (0, auth_1.generateToken)(payload);
            expect(typeof token).toBe('string');
            const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
            expect(decoded.userId).toBe(1);
            expect(decoded.email).toBe('test@example.com');
        });
    });
    describe('authMiddleware', () => {
        let mockReq;
        let mockRes;
        let mockNext;
        beforeEach(() => {
            mockRes = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };
            mockNext = jest.fn();
        });
        it('should return 401 if no authorization header and no cookie', async () => {
            mockReq = { headers: {}, cookies: {} };
            await (0, auth_1.authMiddleware)(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
            expect(mockNext).not.toHaveBeenCalled();
        });
        it('should return 401 if token is invalid', async () => {
            mockReq = { headers: { authorization: 'Bearer invalid-token' }, cookies: {} };
            await (0, auth_1.authMiddleware)(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(mockNext).not.toHaveBeenCalled();
        });
        it('should call next if token is valid in Authorization header', async () => {
            const token = (0, auth_1.generateToken)({ userId: 1, email: 'test@example.com', username: 'testuser' });
            mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
            await (0, auth_1.authMiddleware)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user.userId).toBe(1);
            expect(mockNext).toHaveBeenCalled();
        });
        it('should call next if token is valid in httpOnly cookie', async () => {
            const token = (0, auth_1.generateToken)({ userId: 1, email: 'test@example.com', username: 'testuser' });
            mockReq = { headers: {}, cookies: { token } };
            await (0, auth_1.authMiddleware)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user.userId).toBe(1);
            expect(mockNext).toHaveBeenCalled();
        });
        it('should prefer Authorization header over cookie', async () => {
            const headerToken = (0, auth_1.generateToken)({ userId: 1, email: 'header@example.com', username: 'headeruser' });
            const cookieToken = (0, auth_1.generateToken)({ userId: 2, email: 'cookie@example.com', username: 'cookieuser' });
            mockReq = {
                headers: { authorization: `Bearer ${headerToken}` },
                cookies: { token: cookieToken },
            };
            await (0, auth_1.authMiddleware)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user.userId).toBe(1);
            expect(mockReq.user.email).toBe('header@example.com');
            expect(mockNext).toHaveBeenCalled();
        });
        it('should return 401 if cookie token is invalid', async () => {
            mockReq = { headers: {}, cookies: { token: 'invalid-token' } };
            await (0, auth_1.authMiddleware)(mockReq, mockRes, mockNext);
            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
            expect(mockNext).not.toHaveBeenCalled();
        });
    });
    describe('optionalAuth', () => {
        let mockReq;
        let mockRes;
        let mockNext;
        beforeEach(() => {
            mockRes = {};
            mockNext = jest.fn();
        });
        it('should continue without auth if no token and no cookie', () => {
            mockReq = { headers: {}, cookies: {} };
            (0, auth_1.optionalAuth)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeUndefined();
            expect(mockNext).toHaveBeenCalled();
        });
        it('should set user if valid token in header', () => {
            const token = (0, auth_1.generateToken)({ userId: 1, email: 'test@example.com', username: 'testuser' });
            mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} };
            (0, auth_1.optionalAuth)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user.userId).toBe(1);
            expect(mockNext).toHaveBeenCalled();
        });
        it('should set user if valid token in cookie', () => {
            const token = (0, auth_1.generateToken)({ userId: 1, email: 'test@example.com', username: 'testuser' });
            mockReq = { headers: {}, cookies: { token } };
            (0, auth_1.optionalAuth)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user.userId).toBe(1);
            expect(mockNext).toHaveBeenCalled();
        });
        it('should continue if invalid token in header', () => {
            mockReq = { headers: { authorization: 'Bearer bad-token' }, cookies: {} };
            (0, auth_1.optionalAuth)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeUndefined();
            expect(mockNext).toHaveBeenCalled();
        });
        it('should continue if invalid token in cookie', () => {
            mockReq = { headers: {}, cookies: { token: 'invalid' } };
            (0, auth_1.optionalAuth)(mockReq, mockRes, mockNext);
            expect(mockReq.user).toBeUndefined();
            expect(mockNext).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=auth.middleware.test.js.map