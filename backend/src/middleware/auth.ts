import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import redis from '../redis';
import logger from '../utils/logger';

export interface AuthPayload {
  userId: number;
  email?: string;
  username?: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      requestId: string;
    }
  }
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn as any });
}

const BLACKLIST_PREFIX = 'bl:token:';

export async function blacklistToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as AuthPayload & { exp?: number };
    if (!decoded?.exp) return;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;
    await redis.set(`${BLACKLIST_PREFIX}${token}`, '1', 'EX', ttl);
  } catch (err) {
    logger.warn({ err }, 'Failed to blacklist token');
  }
}

async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const result = await redis.get(`${BLACKLIST_PREFIX}${token}`);
    return result !== null;
  } catch {
    return true;
  }
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.cookies?.token) {
    return req.cookies.token;
  }
  return null;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    logger.warn({ requestId: req.requestId }, 'Auth failed: no token provided');
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  if (await isTokenBlacklisted(token)) {
    logger.warn({ requestId: req.requestId }, 'Auth failed: blacklisted token');
    res.status(401).json({ error: 'Token has been revoked' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    logger.warn({ requestId: req.requestId }, 'Auth failed: invalid or expired token');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (token) {
    try {
      if (await isTokenBlacklisted(token)) return next();
      req.user = jwt.verify(token, config.jwtSecret) as AuthPayload;
    } catch {
      // Token invalid, continue without auth
    }
  }
  next();
}

export async function adminMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  await authMiddleware(req, res, async () => {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}
