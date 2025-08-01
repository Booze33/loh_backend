import type { Context, Next, MiddlewareHandler } from 'hono';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import type { DecodedToken } from '../types/auth/authTypes.ts';

const { TokenExpiredError, JsonWebTokenError } = jwt;
const prisma = new PrismaClient();

export const authMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log("Invalid auth header format");
      return c.json({ error: 'No or invalid authentication token format' }, 401);
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      console.log("Token extraction failed");
      return c.json({ error: 'Authentication token is missing' }, 401);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set in environment variables');
      return c.json({ error: 'Internal configuration error' }, 500);
    }

    let decoded: DecodedToken;

    try {
      decoded = jwt.verify(token, jwtSecret) as DecodedToken;
      console.log("Token decoded successfully:", { userId: decoded.userId });
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return c.json({ error: 'Authentication token has expired' }, 401);
      }
      if (err instanceof JsonWebTokenError) {
        return c.json({ error: 'Invalid authentication token' }, 401);
      }
      throw err;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        chatSessions: true
      },
    });

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    c.set('user', user);
    await next();
  } catch (error) {
    console.error('Error in auth middleware:', error);
    return c.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
};