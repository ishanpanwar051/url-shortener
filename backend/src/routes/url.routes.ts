import { Router, Request, Response } from 'express';
import { urlService } from '../services/url.service';
import { authMiddleware, optionalAuth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { NotFoundError } from '../errors';
import logger from '../utils/logger';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config';

const router = Router();

function getPublicBaseUrl(req: Request): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/$/, '');
  }
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

const createUrlSchema = z.object({
  longUrl: z.string().url(),
  customAlias: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  customAliasDb: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

const updateUrlSchema = z.object({
  longUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

const shortCodeParamSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid short code format');

function parsePositiveInt(value: string | undefined, defaultVal: number): number {
  if (!value) return defaultVal;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

// Create short URL
router.post('/shorten', rateLimiter, optionalAuth, async (req: Request, res: Response) => {
  try {
    const data = createUrlSchema.parse(req.body);
    const url = await urlService.createShortUrl(
      data.longUrl,
      req.user?.userId,
      data.customAlias,
      data.expiresInDays
    );
    res.status(201).json(url);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// Get user's URLs
router.get('/urls', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parsePositiveInt(req.query.page as string, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit as string, 20), 100);
    const result = await urlService.getUserUrls(req.user!.userId, page, limit);
    res.json(result);
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to fetch user URLs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete URL
router.delete('/urls/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id, 0);
    if (!id) { res.status(400).json({ error: 'Invalid URL ID' }); return; }
    await urlService.deleteUrl(id, req.user!.userId);
    res.status(204).send();
  } catch (err: unknown) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update URL
router.patch('/urls/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id, 0);
    if (!id) { res.status(400).json({ error: 'Invalid URL ID' }); return; }
    const data = updateUrlSchema.parse(req.body);
    const url = await urlService.updateUrl(id, req.user!.userId, data);
    res.json(url);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get analytics
router.get('/analytics/:shortCode', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
    const analytics = await urlService.getUrlAnalytics(shortCode, req.user!.userId);
    if (!analytics) {
      res.status(404).json({ error: 'URL not found' });
      return;
    }
    res.json(analytics);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid short code', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate QR code
router.get('/qr/:shortCode', rateLimiter, optionalAuth, async (req: Request, res: Response) => {
  try {
    const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
    const baseUrl = getPublicBaseUrl(req);
    const shortUrl = `${baseUrl}/${shortCode}`;
    const qrBuffer = await QRCode.toBuffer(shortUrl, {
      type: 'png',
      width: 300,
      margin: 2,
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(qrBuffer);
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid short code', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

export default router;
