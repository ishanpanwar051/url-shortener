import { Router, Request, Response, IRouter } from 'express';
import { adminMiddleware } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { urlService } from '../services/url.service';
import { AppError } from '../errors';
import logger from '../utils/logger';
import { z } from 'zod';

const router: IRouter = Router();

// All admin routes require ADMIN role
router.use(adminMiddleware);

function parsePositiveInt(value: string | undefined, defaultVal: number): number {
  if (!value) return defaultVal;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultVal;
}

// GET /api/admin/stats — system overview
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await urlService.getSystemStats();
    res.json(stats);
  } catch (err) {
    logger.error({ err }, 'Failed to get system stats');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parsePositiveInt(req.query.page as string, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit as string, 20), 100);
    const search = req.query.search as string | undefined;
    const result = await authService.getAllUsers(page, limit, search);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Admin: failed to list users');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id — update user (activate/deactivate, role)
router.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const targetId = parsePositiveInt(req.params.id, 0);
    if (!targetId) { res.status(400).json({ error: 'Invalid user ID' }); return; }

    const schema = z.object({
      isActive: z.boolean().optional(),
      role: z.enum(['USER', 'ADMIN']).optional(),
    });
    const data = schema.parse(req.body);
    const updated = await authService.updateUser(req.user!.userId, targetId, data);
    res.json(updated);
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    logger.error({ err }, 'Admin: failed to update user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id — delete user
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const targetId = parsePositiveInt(req.params.id, 0);
    if (!targetId) { res.status(400).json({ error: 'Invalid user ID' }); return; }
    await authService.deleteUser(req.user!.userId, targetId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logger.error({ err }, 'Admin: failed to delete user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/urls — list all URLs
router.get('/urls', async (req: Request, res: Response) => {
  try {
    const page = parsePositiveInt(req.query.page as string, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit as string, 20), 100);
    const search = req.query.search as string | undefined;
    const result = await urlService.adminGetAllUrls(page, limit, search);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Admin: failed to list URLs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/urls/:id — delete any URL
router.delete('/urls/:id', async (req: Request, res: Response) => {
  try {
    const id = parsePositiveInt(req.params.id, 0);
    if (!id) { res.status(400).json({ error: 'Invalid URL ID' }); return; }
    await urlService.adminDeleteUrl(id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    logger.error({ err }, 'Admin: failed to delete URL');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
