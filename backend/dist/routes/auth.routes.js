"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = require("../services/auth.service");
const auth_1 = require("../middleware/auth");
const logger_1 = __importDefault(require("../utils/logger"));
const rateLimiter_1 = require("../middleware/rateLimiter");
const config_1 = require("../config");
const auth_2 = require("../middleware/auth");
const zod_1 = require("zod");
const errors_1 = require("../errors");
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    username: zod_1.z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, hyphens, and underscores'),
    password: zod_1.z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100)
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
function setAuthCookie(res, token) {
    res.cookie(config_1.cookieConfig.name, token, config_1.cookieConfig.options);
}
function clearAuthCookie(res) {
    res.clearCookie(config_1.cookieConfig.name, config_1.cookieConfig.options);
}
router.post('/register', rateLimiter_1.authRateLimiter, async (req, res) => {
    try {
        const data = registerSchema.parse(req.body);
        const { token, user } = await auth_service_1.authService.register(data.email, data.username, data.password);
        setAuthCookie(res, token);
        res.status(201).json({ user });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: err.errors });
            return;
        }
        if (err instanceof errors_1.AppError) {
            res.status(err.statusCode).json({ error: err.message });
            return;
        }
        logger_1.default.error({ err }, 'Registration failed');
        res.status(500).json({ error: 'Registration failed' });
    }
});
router.post('/login', rateLimiter_1.authRateLimiter, async (req, res) => {
    try {
        const data = loginSchema.parse(req.body);
        const { token, user } = await auth_service_1.authService.login(data.email, data.password);
        setAuthCookie(res, token);
        res.json({ user });
    }
    catch (err) {
        if (err instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation failed', details: err.errors });
            return;
        }
        if (err instanceof errors_1.AppError) {
            res.status(err.statusCode).json({ error: err.message });
            return;
        }
        logger_1.default.error({ err }, 'Login failed');
        res.status(401).json({ error: 'Invalid email or password' });
    }
});
router.post('/logout', auth_1.authMiddleware, async (req, res) => {
    const token = (0, auth_1.extractToken)(req);
    if (token) {
        await (0, auth_2.blacklistToken)(token);
    }
    clearAuthCookie(res);
    res.json({ message: 'Logged out successfully' });
});
router.get('/profile', auth_1.authMiddleware, async (req, res) => {
    try {
        const profile = await auth_service_1.authService.getProfile(req.user.userId);
        res.json(profile);
    }
    catch (err) {
        logger_1.default.error({ err }, 'Failed to fetch profile');
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Session check — returns user info for SPA auth restore on page refresh
router.get('/me', auth_1.authMiddleware, async (req, res) => {
    try {
        const profile = await auth_service_1.authService.getProfile(req.user.userId);
        if (!profile) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            user: { id: profile.id, email: profile.email, username: profile.username, role: profile.role },
        });
    }
    catch (err) {
        logger_1.default.error({ err, userId: req.user?.userId }, 'Failed to fetch profile');
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map