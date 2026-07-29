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
exports.authService = exports.AuthService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importStar(require("../db"));
const auth_1 = require("../middleware/auth");
const errors_1 = require("../errors");
class AuthService {
    async register(email, username, password) {
        const hashedPassword = await bcryptjs_1.default.hash(password, 12);
        try {
            const user = await db_1.default.user.create({
                data: { email, username, hashedPassword },
            });
            const token = (0, auth_1.generateToken)({ userId: user.id, email: user.email, username: user.username, role: user.role });
            return { token, user: { id: user.id, email: user.email, username: user.username, role: user.role } };
        }
        catch (err) {
            if (err !== null &&
                typeof err === 'object' &&
                'code' in err &&
                err.code === 'P2002') {
                throw new errors_1.ValidationError('Email or username already taken');
            }
            throw err;
        }
    }
    async login(email, password) {
        const user = await db_1.default.user.findUnique({ where: { email } });
        if (!user) {
            throw new errors_1.ValidationError('Invalid credentials');
        }
        if (!user.isActive) {
            throw new errors_1.ForbiddenError('Account is disabled');
        }
        const valid = await bcryptjs_1.default.compare(password, user.hashedPassword);
        if (!valid) {
            throw new errors_1.ValidationError('Invalid credentials');
        }
        const token = (0, auth_1.generateToken)({ userId: user.id, email: user.email, username: user.username, role: user.role });
        return { token, user: { id: user.id, email: user.email, username: user.username, role: user.role } };
    }
    async getProfile(userId) {
        const user = await db_1.prismaRead.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                role: true,
                isActive: true,
                createdAt: true,
                urls: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    select: {
                        id: true,
                        shortCode: true,
                        longUrl: true,
                        title: true,
                        clicks: true,
                        isActive: true,
                        tags: true,
                        createdAt: true,
                        expiresAt: true,
                    },
                },
            },
        });
        return user;
    }
    async getAllUsers(page = 1, limit = 20, search) {
        const skip = (page - 1) * limit;
        const where = search
            ? {
                OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { username: { contains: search, mode: 'insensitive' } },
                ],
            }
            : {};
        const [users, total] = await Promise.all([
            db_1.prismaRead.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    username: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    _count: { select: { urls: true } },
                },
            }),
            db_1.prismaRead.user.count({ where }),
        ]);
        return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    async updateUser(adminUserId, targetUserId, data) {
        // Prevent admin from demoting themselves
        if (adminUserId === targetUserId && data.role === 'USER') {
            throw new errors_1.ForbiddenError('Cannot demote yourself');
        }
        const target = await db_1.default.user.findUnique({ where: { id: targetUserId } });
        if (!target)
            throw new errors_1.NotFoundError('User not found');
        const updated = await db_1.default.user.update({
            where: { id: targetUserId },
            data: {
                ...(data.isActive !== undefined && { isActive: data.isActive }),
                ...(data.role !== undefined && { role: data.role }),
            },
            select: { id: true, email: true, username: true, role: true, isActive: true },
        });
        return updated;
    }
    async deleteUser(adminUserId, targetUserId) {
        if (adminUserId === targetUserId) {
            throw new errors_1.ForbiddenError('Cannot delete your own account');
        }
        const target = await db_1.default.user.findUnique({ where: { id: targetUserId } });
        if (!target)
            throw new errors_1.NotFoundError('User not found');
        await db_1.default.user.delete({ where: { id: targetUserId } });
    }
}
exports.AuthService = AuthService;
exports.authService = new AuthService();
//# sourceMappingURL=auth.service.js.map