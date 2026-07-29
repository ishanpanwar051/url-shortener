"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mockPrisma = {
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
    },
};
jest.mock('../db', () => ({
    __esModule: true,
    default: mockPrisma,
}));
jest.mock('../middleware/auth', () => {
    const original = jest.requireActual('../middleware/auth');
    return {
        ...original,
        generateToken: jest.fn().mockReturnValue('mock-jwt-token'),
    };
});
const auth_service_1 = require("../services/auth.service");
describe('AuthService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    describe('register', () => {
        it('should register a new user successfully', async () => {
            mockPrisma.user.create.mockResolvedValue({
                id: 1,
                email: 'test@example.com',
                username: 'testuser',
                hashedPassword: 'hashed',
                role: 'USER',
                isActive: true,
            });
            const result = await auth_service_1.authService.register('test@example.com', 'testuser', 'password123');
            expect(result).toHaveProperty('token', 'mock-jwt-token');
            expect(result.user).toMatchObject({ id: 1, email: 'test@example.com', username: 'testuser' });
            expect(mockPrisma.user.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    email: 'test@example.com',
                    username: 'testuser',
                }),
            });
        });
        it('should throw if email or username already exists', async () => {
            const p2002Error = new Error('Unique constraint failed');
            Object.assign(p2002Error, {
                code: 'P2002',
                meta: { target: ['email'] },
            });
            mockPrisma.user.create.mockRejectedValue(p2002Error);
            await expect(auth_service_1.authService.register('existing@example.com', 'user', 'password123')).rejects.toThrow('Email or username already taken');
        });
    });
    describe('login', () => {
        it('should login successfully with valid credentials', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 1,
                email: 'test@example.com',
                username: 'testuser',
                hashedPassword: await bcryptjs_1.default.hash('password123', 12),
                role: 'USER',
                isActive: true,
            });
            const result = await auth_service_1.authService.login('test@example.com', 'password123');
            expect(result).toHaveProperty('token', 'mock-jwt-token');
            expect(result.user).toMatchObject({ id: 1, email: 'test@example.com', username: 'testuser' });
        });
        it('should throw if user not found', async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);
            await expect(auth_service_1.authService.login('nonexistent@example.com', 'password123')).rejects.toThrow('Invalid credentials');
        });
        it('should throw if password is wrong', async () => {
            mockPrisma.user.findUnique.mockResolvedValue({
                id: 1,
                email: 'test@example.com',
                username: 'testuser',
                hashedPassword: await bcryptjs_1.default.hash('correctpassword', 12),
                role: 'USER',
                isActive: true,
            });
            await expect(auth_service_1.authService.login('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials');
        });
    });
    describe('getProfile', () => {
        it('should return user profile with urls', async () => {
            const mockProfile = {
                id: 1,
                email: 'test@example.com',
                username: 'testuser',
                createdAt: new Date(),
                urls: [],
            };
            mockPrisma.user.findUnique.mockResolvedValue(mockProfile);
            const result = await auth_service_1.authService.getProfile(1);
            expect(result).toEqual(mockProfile);
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
                where: { id: 1 },
                select: expect.objectContaining({
                    id: true,
                    email: true,
                    username: true,
                }),
            });
        });
    });
});
//# sourceMappingURL=auth.service.test.js.map