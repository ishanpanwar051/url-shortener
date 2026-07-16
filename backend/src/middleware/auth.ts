import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: 'No token provided' });
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
