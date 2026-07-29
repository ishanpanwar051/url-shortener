"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const auth_service_1 = require("../services/auth.service");
const url_service_1 = require("../services/url.service");
const errors_1 = require("../errors");
const logger_1 = __importDefault(require("../utils/logger"));
const zod_1 = require("zod");
const router = (0, express_1.Router)();
// All admin routes require ADMIN role
router.use(auth_1.adminMiddleware);
function parsePositiveInt(value, defaultVal) {
    if (!value)
        return defaultVal;
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : defaultVal;
}
// GET /api/admin/stats — system overview
router.get('/stats', async (_req, res) => {
    try {
        const stats = await url_service_1.urlService.getSystemStats();
        res.json(stats);
    }
    catch (err) {
        logger_1.default.error({ err }, 'Failed to get system stats');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
        const search = req.query.search;
        const result = await auth_service_1.authService.getAllUsers(page, limit, search);
        res.json(result);
    }
    catch (err) {
        logger_1.default.error({ err }, 'Admin: failed to list users');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// PATCH /api/admin/users/:id — update user (activate/deactivate, role)
router.patch('/users/:id', async (req, res) => {
    try {
        const targetId = parsePositiveInt(req.params.id, 0);
        if (!targetId) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        const schema = zod_1.z.object({
            isActive: zod_1.z.boolean().optional(),
            role: zod_1.z.enum(['USER', 'ADMIN']).optional(),
        });
        const data = schema.parse(req.body);
        const updated = await auth_service_1.authService.updateUser(req.user.userId, targetId, data);
        res.json(updated);
    }
    catch (err) {
        if (err instanceof errors_1.AppError) {
            res.status(err.statusCode).json({ error: err.message });
            return;
        }
        if (err instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: err.errors });
            return;
        }
        logger_1.default.error({ err }, 'Admin: failed to update user');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/admin/users/:id — delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const targetId = parsePositiveInt(req.params.id, 0);
        if (!targetId) {
            res.status(400).json({ error: 'Invalid user ID' });
            return;
        }
        await auth_service_1.authService.deleteUser(req.user.userId, targetId);
        res.status(204).send();
    }
    catch (err) {
        if (err instanceof errors_1.AppError) {
            res.status(err.statusCode).json({ error: err.message });
            return;
        }
        logger_1.default.error({ err }, 'Admin: failed to delete user');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/admin/urls — list all URLs
router.get('/urls', async (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
        const search = req.query.search;
        const result = await url_service_1.urlService.adminGetAllUrls(page, limit, search);
        res.json(result);
    }
    catch (err) {
        logger_1.default.error({ err }, 'Admin: failed to list URLs');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /api/admin/urls/:id — delete any URL
router.delete('/urls/:id', async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id, 0);
        if (!id) {
            res.status(400).json({ error: 'Invalid URL ID' });
            return;
        }
        await url_service_1.urlService.adminDeleteUrl(id);
        res.status(204).send();
    }
    catch (err) {
        if (err instanceof errors_1.AppError) {
            res.status(err.statusCode).json({ error: err.message });
            return;
        }
        logger_1.default.error({ err }, 'Admin: failed to delete URL');
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map