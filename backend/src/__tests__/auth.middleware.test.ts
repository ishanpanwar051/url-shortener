import jwt from 'jsonwebtoken';
import { config } from '../config';

jest.mock('../config', () => ({
  config: {
    jwtSecret: 'test-secret',
    jwtExpiresIn: '1h',
  },
}));

import { generateToken, authMiddleware, optionalAuth } from '../middleware/auth';

describe('Auth Middleware', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const payload = { userId: 1, email: 'test@example.com', username: 'testuser' };
      const token = generateToken(payload);

      expect(typeof token).toBe('string');
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      expect(decoded.userId).toBe(1);
      expect(decoded.email).toBe('test@example.com');
    });
  });

  describe('authMiddleware', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: jest.Mock;

    beforeEach(() => {
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      mockNext = jest.fn();
    });

    it('should return 401 if no authorization header and no cookie', () => {
      mockReq = { headers: {}, cookies: {} };
      authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid', () => {
      mockReq = { headers: { authorization: 'Bearer invalid-token' }, cookies: {} };
      authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next if token is valid in Authorization header', () => {
      const token = generateToken({ userId: 1, email: 'test@example.com', username: 'testuser' });
      mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} };

      authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next if token is valid in httpOnly cookie', () => {
      const token = generateToken({ userId: 1, email: 'test@example.com', username: 'testuser' });
      mockReq = { headers: {}, cookies: { token } };

      authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer Authorization header over cookie', () => {
      const headerToken = generateToken({ userId: 1, email: 'header@example.com', username: 'headeruser' });
      const cookieToken = generateToken({ userId: 2, email: 'cookie@example.com', username: 'cookieuser' });
      mockReq = {
        headers: { authorization: `Bearer ${headerToken}` },
        cookies: { token: cookieToken },
      };

      authMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockReq.user!.email).toBe('header@example.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 if cookie token is invalid', () => {
      mockReq = { headers: {}, cookies: { token: 'invalid-token' } };
      authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: jest.Mock;

    beforeEach(() => {
      mockRes = {};
      mockNext = jest.fn();
    });

    it('should continue without auth if no token and no cookie', () => {
      mockReq = { headers: {}, cookies: {} };
      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set user if valid token in header', () => {
      const token = generateToken({ userId: 1, email: 'test@example.com', username: 'testuser' });
      mockReq = { headers: { authorization: `Bearer ${token}` }, cookies: {} };

      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set user if valid token in cookie', () => {
      const token = generateToken({ userId: 1, email: 'test@example.com', username: 'testuser' });
      mockReq = { headers: {}, cookies: { token } };

      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user!.userId).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue if invalid token in header', () => {
      mockReq = { headers: { authorization: 'Bearer bad-token' }, cookies: {} };
      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue if invalid token in cookie', () => {
      mockReq = { headers: {}, cookies: { token: 'invalid' } };
      optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
