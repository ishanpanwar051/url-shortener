import { Router, Request, Response, IRouter } from 'express';
import { urlService } from '../services/url.service';
import { authMiddleware, optionalAuth } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { NotFoundError, ValidationError, AppError } from '../errors';
import logger from '../utils/logger';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config';

const router: IRouter = Router();

function getPublicBaseUrl(req: Request): string {
  if (config.publicBaseUrl) {
    return config.publicBaseUrl.replace(/\/$/, '');
  }
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

const createUrlSchema = z.object({
  longUrl: z.string().url('Must be a valid URL'),
  customAlias: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, hyphens, and underscores').optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  title: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  password: z.string().min(1).max(100).optional(),
  maxClicks: z.number().int().min(1).optional(),
  isOneTime: z.boolean().optional(),
});

const updateUrlSchema = z.object({
  longUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  title: z.string().max(500).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  password: z.string().min(1).max(100).nullable().optional(),
  maxClicks: z.number().int().min(1).nullable().optional(),
  isOneTime: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

const shortCodeParamSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid short code format');

function parsePositiveInt(value: string | undefined, defaultVal: number): number {
  if (!value) return defaultVal;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

function handleError(err: unknown, res: Response, defaultStatus = 500): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validation failed', details: err.errors });
    return;
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error({ err }, 'Unexpected error');
  res.status(defaultStatus).json({ error: message });
}

// Create short URL
router.post('/shorten', rateLimiter, optionalAuth, async (req: Request, res: Response) => {
  try {
    const data = createUrlSchema.parse(req.body);
    const url = await urlService.createShortUrl(
      data.longUrl,
      req.user?.userId,
      data.customAlias,
      data.expiresInDays,
      {
        title: data.title,
        tags: data.tags,
        password: data.password,
        maxClicks: data.maxClicks,
        isOneTime: data.isOneTime,
      },
    );
    const baseUrl = getPublicBaseUrl(req);
    res.status(201).json({ ...url, shortUrl: `${baseUrl}/${url.shortCode}` });
  } catch (err) {
    handleError(err, res, 400);
  }
});

// Get user's URLs (with search, filter, sort)
router.get('/urls', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parsePositiveInt(req.query.page as string, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit as string, 20), 100);
    const search = req.query.search as string | undefined;
    const status = req.query.status as 'active' | 'inactive' | 'all' | undefined;
    const sort = (req.query.sort as 'createdAt' | 'clicks' | 'expiresAt') || 'createdAt';
    const order = (req.query.order as 'asc' | 'desc') || 'desc';

    const validSort = ['createdAt', 'clicks', 'expiresAt'].includes(sort) ? sort : 'createdAt';
    const validOrder = ['asc', 'desc'].includes(order) ? order : 'desc';

    const result = await urlService.getUserUrls(
      req.user!.userId, page, limit, search,
      status === 'active' || status === 'inactive' ? status : undefined,
      validSort, validOrder,
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch user URLs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export user's URLs as CSV
router.get('/urls/export', authMiddleware, async (req: Request, res: Response) => {
  try {
    const csv = await urlService.exportUserUrlsCsv(req.user!.userId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="my-urls.csv"');
    res.send(csv);
  } catch (err) {
    logger.error({ err }, 'Failed to export URLs');
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
  } catch (err) {
    handleError(err, res);
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
  } catch (err) {
    handleError(err, res);
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
  } catch (err) {
    handleError(err, res);
  }
});

// Generate QR code (PNG)
router.get('/qr/:shortCode', rateLimiter, optionalAuth, async (req: Request, res: Response) => {
  try {
    const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
    const baseUrl = getPublicBaseUrl(req);
    const shortUrl = `${baseUrl}/${shortCode}`;

    const darkColor = (req.query.dark as string) || '#000000';
    const lightColor = (req.query.light as string) || '#ffffff';
    const size = Math.min(Math.max(parseInt(req.query.size as string || '300', 10), 100), 1000);

    const qrBuffer = await QRCode.toBuffer(shortUrl, {
      type: 'png',
      width: size,
      margin: 2,
      color: { dark: darkColor, light: lightColor },
    });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename="${shortCode}-qr.png"`);
    res.send(qrBuffer);
  } catch (err) {
    handleError(err, res);
  }
});

// Get URL info (public — for pre-checking before redirect)
router.get('/urls/info/:shortCode', optionalAuth, async (req: Request, res: Response) => {
  try {
    const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
    const url = await (await import('../db')).prismaRead.uRL.findUnique({
      where: { shortCode },
      select: {
        shortCode: true,
        title: true,
        isActive: true,
        expiresAt: true,
        clicks: true,
        password: true,
        maxClicks: true,
        isOneTime: true,
      },
    });
    if (!url || !url.isActive) {
      res.status(404).json({ error: 'URL not found or inactive' });
      return;
    }
    res.json({
      shortCode: url.shortCode,
      title: url.title,
      isActive: url.isActive,
      expiresAt: url.expiresAt,
      clicks: url.clicks.toString(),
      hasPassword: !!url.password,
      maxClicks: url.maxClicks?.toString() ?? null,
      isOneTime: url.isOneTime,
    });
  } catch (err) {
    handleError(err, res);
  }
});

export default router;
