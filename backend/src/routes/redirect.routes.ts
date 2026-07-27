import { Router, Request, Response } from 'express';
import { urlService, FRONTEND_ROUTES } from '../services/url.service';
import logger from '../utils/logger';

const router = Router();

// Pass frontend routes through to SPA fallback
router.use('/:shortCode', (req, res, next) => {
  const { shortCode } = req.params;
  if (FRONTEND_ROUTES.has(shortCode)) {
    next('router');
    return;
  }
  next();
});

router.get('/:shortCode', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;
    if (!shortCode || shortCode.length > 50) {
      res.status(404).send(notFoundHtml);
      return;
    }

    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const referer = ((req.headers['referer'] || req.headers['referrer'] || '') as string);

    const result = await urlService.getLongUrl(shortCode, ipAddress, userAgent, referer);

    if (!result) {
      res.status(404).send(notFoundHtml);
      return;
    }

    res.redirect(302, result.longUrl);
  } catch (err) {
    logger.error({ err, shortCode: req.params.shortCode }, 'Redirect failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const notFoundHtml = `
  <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
    <h1>404 - Link Not Found</h1>
    <p>The shortened URL doesn't exist or has expired.</p>
  </body></html>
`;

export default router;
