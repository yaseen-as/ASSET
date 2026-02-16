import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';
import type { JwtPayload } from '@platform/shared';

export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email, role: 'user' } as Omit<JwtPayload, 'iat' | 'exp'>,
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry }
  );
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as JwtPayload;
}
