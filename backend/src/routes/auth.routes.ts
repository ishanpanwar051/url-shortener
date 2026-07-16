import { Router, Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { authMiddleware } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { cookieConfig } from '../config';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(6).max(100),
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
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(400).json({ error: err.message });
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
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(401).json({ error: err.message });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out successfully' });
});

router.get('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const profile = await authService.getProfile(req.user!.userId);
    res.json({ user: profile });
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

export default router;
