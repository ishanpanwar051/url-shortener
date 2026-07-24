import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import redis from '../redis';

export interface AuthPayload {
  userId: number;
  email?: string;
  username?: string;
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
  } catch {
    // Best-effort blacklisting
  }
}

async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const result = await redis.get(`${BLACKLIST_PREFIX}${token}`);
    return result !== null;
  } catch {
    // Redis unavailable — don't block, just log
    return false;
  }
}

function extractToken(req: Request): string | null {
  // 1. Check Authorization header (for API clients)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  // 2. Check httpOnly cookie (for browser SPA)
  if (req.cookies?.token) {
    return req.cookies.token;
  }

  return null;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  if (await isTokenBlacklisted(token)) {
    res.status(401).json({ error: 'Token has been revoked' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (token) {
    try {
      req.user = jwt.verify(token, config.jwtSecret) as AuthPayload;
    } catch {
      // Token invalid, continue without auth
    }
  }
  next();
}
