"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.blacklistToken = blacklistToken;
exports.extractToken = extractToken;
exports.authMiddleware = authMiddleware;
exports.optionalAuth = optionalAuth;
exports.adminMiddleware = adminMiddleware;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const redis_1 = __importDefault(require("../redis"));
const logger_1 = __importDefault(require("../utils/logger"));
function generateToken(payload) {
    return jsonwebtoken_1.default.sign(payload, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtExpiresIn });
}
const BLACKLIST_PREFIX = 'bl:token:';
async function blacklistToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.decode(token);
        if (!decoded?.exp)
            return;
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl <= 0)
            return;
        await redis_1.default.set(`${BLACKLIST_PREFIX}${token}`, '1', 'EX', ttl);
    }
    catch (err) {
        logger_1.default.warn({ err }, 'Failed to blacklist token');
    }
}
async function isTokenBlacklisted(token) {
    try {
        const result = await redis_1.default.get(`${BLACKLIST_PREFIX}${token}`);
        return result !== null;
    }
    catch {
        return true;
    }
}
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    if (req.cookies?.token) {
        return req.cookies.token;
    }
    return null;
}
async function authMiddleware(req, res, next) {
    const token = extractToken(req);
    if (!token) {
        logger_1.default.warn({ requestId: req.requestId }, 'Auth failed: no token provided');
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    if (await isTokenBlacklisted(token)) {
        logger_1.default.warn({ requestId: req.requestId }, 'Auth failed: blacklisted token');
        res.status(401).json({ error: 'Token has been revoked' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        req.user = decoded;
        next();
    }
    catch {
        logger_1.default.warn({ requestId: req.requestId }, 'Auth failed: invalid or expired token');
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
async function optionalAuth(req, _res, next) {
    const token = extractToken(req);
    if (token) {
        try {
            if (await isTokenBlacklisted(token))
                return next();
            req.user = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        }
        catch {
            // Token invalid, continue without auth
        }
    }
    next();
}
async function adminMiddleware(req, res, next) {
    await authMiddleware(req, res, async () => {
        if (req.user?.role !== 'ADMIN') {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }
        next();
    });
}
//# sourceMappingURL=auth.js.map