"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const url_service_1 = require("../services/url.service");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const errors_1 = require("../errors");
const logger_1 = __importDefault(require("../utils/logger"));
const qrcode_1 = __importDefault(require("qrcode"));
const zod_1 = require("zod");
const config_1 = require("../config");
const router = (0, express_1.Router)();
function getPublicBaseUrl(req) {
    if (config_1.config.publicBaseUrl) {
        return config_1.config.publicBaseUrl.replace(/\/$/, '');
    }
    const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = (req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
    return `${proto}://${host}`;
}
const createUrlSchema = zod_1.z.object({
    longUrl: zod_1.z.string().url('Must be a valid URL'),
    customAlias: zod_1.z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, hyphens, and underscores').optional(),
    expiresInDays: zod_1.z.number().int().min(1).max(3650).optional(),
    title: zod_1.z.string().max(500).optional(),
    tags: zod_1.z.array(zod_1.z.string().max(50)).max(10).optional(),
    password: zod_1.z.string().min(1).max(100).optional(),
    maxClicks: zod_1.z.number().int().min(1).optional(),
    isOneTime: zod_1.z.boolean().optional(),
});
const updateUrlSchema = zod_1.z.object({
    longUrl: zod_1.z.string().url().optional(),
    isActive: zod_1.z.boolean().optional(),
    title: zod_1.z.string().max(500).optional(),
    tags: zod_1.z.array(zod_1.z.string().max(50)).max(10).optional(),
    password: zod_1.z.string().min(1).max(100).nullable().optional(),
    maxClicks: zod_1.z.number().int().min(1).nullable().optional(),
    isOneTime: zod_1.z.boolean().optional(),
    expiresInDays: zod_1.z.number().int().min(1).max(3650).nullable().optional(),
});
const shortCodeParamSchema = zod_1.z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Invalid short code format');
function parsePositiveInt(value, defaultVal) {
    if (!value)
        return defaultVal;
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : defaultVal;
}
function handleError(err, res, defaultStatus = 500) {
    if (err instanceof errors_1.AppError) {
        res.status(err.statusCode).json({ error: err.message, code: err.code });
        return;
    }
    if (err instanceof zod_1.z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.errors });
        return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger_1.default.error({ err }, 'Unexpected error');
    res.status(defaultStatus).json({ error: message });
}
// Create short URL
router.post('/shorten', rateLimiter_1.rateLimiter, auth_1.optionalAuth, async (req, res) => {
    try {
        const data = createUrlSchema.parse(req.body);
        const url = await url_service_1.urlService.createShortUrl(data.longUrl, req.user?.userId, data.customAlias, data.expiresInDays, {
            title: data.title,
            tags: data.tags,
            password: data.password,
            maxClicks: data.maxClicks,
            isOneTime: data.isOneTime,
        });
        const baseUrl = getPublicBaseUrl(req);
        res.status(201).json({ ...url, shortUrl: `${baseUrl}/${url.shortCode}` });
    }
    catch (err) {
        handleError(err, res, 400);
    }
});
// Get user's URLs (with search, filter, sort)
router.get('/urls', auth_1.authMiddleware, async (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
        const search = req.query.search;
        const status = req.query.status;
        const sort = req.query.sort || 'createdAt';
        const order = req.query.order || 'desc';
        const validSort = ['createdAt', 'clicks', 'expiresAt'].includes(sort) ? sort : 'createdAt';
        const validOrder = ['asc', 'desc'].includes(order) ? order : 'desc';
        const result = await url_service_1.urlService.getUserUrls(req.user.userId, page, limit, search, status === 'active' || status === 'inactive' ? status : undefined, validSort, validOrder);
        res.json(result);
    }
    catch (err) {
        logger_1.default.error({ err }, 'Failed to fetch user URLs');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Export user's URLs as CSV
router.get('/urls/export', auth_1.authMiddleware, async (req, res) => {
    try {
        const csv = await url_service_1.urlService.exportUserUrlsCsv(req.user.userId);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="my-urls.csv"');
        res.send(csv);
    }
    catch (err) {
        logger_1.default.error({ err }, 'Failed to export URLs');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete URL
router.delete('/urls/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id, 0);
        if (!id) {
            res.status(400).json({ error: 'Invalid URL ID' });
            return;
        }
        await url_service_1.urlService.deleteUrl(id, req.user.userId);
        res.status(204).send();
    }
    catch (err) {
        handleError(err, res);
    }
});
// Update URL
router.patch('/urls/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const id = parsePositiveInt(req.params.id, 0);
        if (!id) {
            res.status(400).json({ error: 'Invalid URL ID' });
            return;
        }
        const data = updateUrlSchema.parse(req.body);
        const url = await url_service_1.urlService.updateUrl(id, req.user.userId, data);
        res.json(url);
    }
    catch (err) {
        handleError(err, res);
    }
});
// Get analytics
router.get('/analytics/:shortCode', auth_1.authMiddleware, async (req, res) => {
    try {
        const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
        const analytics = await url_service_1.urlService.getUrlAnalytics(shortCode, req.user.userId);
        if (!analytics) {
            res.status(404).json({ error: 'URL not found' });
            return;
        }
        res.json(analytics);
    }
    catch (err) {
        handleError(err, res);
    }
});
// Generate QR code (PNG)
router.get('/qr/:shortCode', rateLimiter_1.rateLimiter, auth_1.optionalAuth, async (req, res) => {
    try {
        const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
        const baseUrl = getPublicBaseUrl(req);
        const shortUrl = `${baseUrl}/${shortCode}`;
        const darkColor = req.query.dark || '#000000';
        const lightColor = req.query.light || '#ffffff';
        const size = Math.min(Math.max(parseInt(req.query.size || '300', 10), 100), 1000);
        const qrBuffer = await qrcode_1.default.toBuffer(shortUrl, {
            type: 'png',
            width: size,
            margin: 2,
            color: { dark: darkColor, light: lightColor },
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Content-Disposition', `inline; filename="${shortCode}-qr.png"`);
        res.send(qrBuffer);
    }
    catch (err) {
        handleError(err, res);
    }
});
// Get URL info (public — for pre-checking before redirect)
router.get('/urls/info/:shortCode', auth_1.optionalAuth, async (req, res) => {
    try {
        const shortCode = shortCodeParamSchema.parse(req.params.shortCode);
        const url = await (await Promise.resolve().then(() => __importStar(require('../db')))).prismaRead.uRL.findUnique({
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
    }
    catch (err) {
        handleError(err, res);
    }
});
exports.default = router;
//# sourceMappingURL=url.routes.js.map