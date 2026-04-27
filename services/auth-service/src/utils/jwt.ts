import jwt from 'jsonwebtoken';
import { config } from '../config';
import type { JwtPayload } from '@platform/shared';

export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email, role: 'user' } as Omit<JwtPayload, 'iat' | 'exp'>,
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}
