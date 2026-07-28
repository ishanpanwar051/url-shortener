import bcrypt from 'bcryptjs';
import prisma, { prismaRead } from '../db';
import { generateToken } from '../middleware/auth';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

export class AuthService {
  async register(email: string, username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.user.create({
        data: { email, username, hashedPassword },
      });
      const token = generateToken({ userId: user.id, email: user.email, username: user.username, role: user.role });
      return { token, user: { id: user.id, email: user.email, username: user.username, role: user.role } };
    } catch (err: unknown) {
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as Record<string, unknown>).code === 'P2002'
      ) {
        throw new ValidationError('Email or username already taken');
      }
      throw err;
    }
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new ValidationError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new ForbiddenError('Account is disabled');
    }

    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) {
      throw new ValidationError('Invalid credentials');
    }

    const token = generateToken({ userId: user.id, email: user.email, username: user.username, role: user.role });
    return { token, user: { id: user.id, email: user.email, username: user.username, role: user.role } };
  }

  async getProfile(userId: number) {
    const user = await prismaRead.user.findUnique({
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

  async getAllUsers(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prismaRead.user.findMany({
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
      prismaRead.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateUser(adminUserId: number, targetUserId: number, data: { isActive?: boolean; role?: string }) {
    // Prevent admin from demoting themselves
    if (adminUserId === targetUserId && data.role === 'USER') {
      throw new ForbiddenError('Cannot demote yourself');
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundError('User not found');

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.role !== undefined && { role: data.role }),
      },
      select: { id: true, email: true, username: true, role: true, isActive: true },
    });

    return updated;
  }

  async deleteUser(adminUserId: number, targetUserId: number) {
    if (adminUserId === targetUserId) {
      throw new ForbiddenError('Cannot delete your own account');
    }
    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundError('User not found');
    await prisma.user.delete({ where: { id: targetUserId } });
  }
}

export const authService = new AuthService();
