import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { authMiddleware, extractToken } from '../middleware/auth';
import logger from '../utils/logger';
import { authRateLimiter } from '../middleware/rateLimiter';
import { cookieConfig } from '../config';
import { blacklistToken } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

function setAuthCookie(res: Response, token: string): void {
  res.cookie(cookieConfig.name, token, cookieConfig.options);
}

function clearAuthCookie(res: Response): void {
  res.clearCookie(cookieConfig.name, cookieConfig.options);
}

router.post('/register', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const { token, user } = await authService.register(data.email, data.username, data.password);

    setAuthCookie(res, token);

    res.status(201).json({ user });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Registration failed';
    logger.error({ err }, 'Registration failed');
    res.status(400).json({ error: message });
  }
});

router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const { token, user } = await authService.login(data.email, data.password);

    setAuthCookie(res, token);

    res.json({ user });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error({ err }, 'Login failed');
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

router.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (token) {
    await blacklistToken(token);
  }
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully' });
});

router.get('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    res.json(profile);
  } catch (err: any) {
    logger.error({ err }, 'Failed to fetch profile');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Session check — returns user info for SPA auth restore on page refresh
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      user: { id: profile.id, email: profile.email, username: profile.username },
    });
  } catch (err) {
    logger.error({ err, userId: req.user?.userId }, 'Failed to fetch profile');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
