import bcrypt from 'bcryptjs';
import prisma from '../db';
import { generateToken } from '../middleware/auth';

export class AuthService {
  async register(email: string, username: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 12);
    try {
      const user = await prisma.user.create({
        data: { email, username, hashedPassword },
      });
      const token = generateToken({ userId: user.id });
      return { token, user: { id: user.id, email: user.email, username: user.username } };
    } catch (err: unknown) {
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as Record<string, unknown>).code === 'P2002'
      ) {
        throw new Error('Email or username already taken');
      }
      throw err;
    }
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken({ userId: user.id });
    return { token, user: { id: user.id, email: user.email, username: user.username } };
  }

  async getProfile(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, createdAt: true, urls: true },
    });
    return user;
  }
}

export const authService = new AuthService();
