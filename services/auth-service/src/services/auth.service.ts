import { v4 as uuidv4 } from 'uuid';
import { UserRepository, RefreshTokenRepository, OtpRepository } from '../repositories/user.repository';
import { OtpService } from './otp.service';
import { hashPassword, comparePassword } from '../utils/hash';
import { generateAccessToken, generateRefreshToken, hashToken } from '../utils/jwt';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { AuthTokens } from '@platform/shared';

export class AuthService {
  private userRepo = new UserRepository();
  private refreshTokenRepo = new RefreshTokenRepository();
  private otpRepo = new OtpRepository();
  private otpService = new OtpService();

  // ─── Register ───
  async register(email: string, password: string, phone: string): Promise<{ userId: string, phone: string }> {
    // Check existing user
    const existingEmail = await this.userRepo.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email already registered', 'EMAIL_EXISTS', 409);
    }

    const existingPhone = await this.userRepo.findByPhone(phone);
    if (existingPhone) {
      throw new AppError('Phone number already registered', 'PHONE_EXISTS', 409);
    }

    // Create user
    const passwordHash = await hashPassword(password);
    const user = await this.userRepo.create(email, passwordHash, phone);

    // Send OTP
    const code = this.otpService.generateCode();
    const expiresAt = this.otpService.getExpiryDate();
    await this.otpRepo.create(phone, code, expiresAt);
    await this.otpService.sendOtp(phone, code);

    logger.info('User registered', { userId: user.id, email });

    return { userId: user.id, phone };
  }

  // ─── Verify OTP ───
  async verifyOtp(phone: string, otp: string): Promise<void> {
    const otpRecord = await this.otpRepo.findLatest(phone);

    if (!otpRecord) {
      throw new AppError('No valid OTP found. Request a new one.', 'OTP_NOT_FOUND', 400);
    }

    if (otpRecord.attempts >= 5) {
      throw new AppError('Too many OTP attempts. Request a new one.', 'OTP_MAX_ATTEMPTS', 429);
    }

    if (otpRecord.code !== otp) {
      await this.otpRepo.incrementAttempts(otpRecord.id);
      throw new AppError('Invalid OTP', 'OTP_INVALID', 400);
    }

    await this.otpRepo.markVerified(otpRecord.id);
    await this.userRepo.setPhoneVerified(phone);

    logger.info('Phone verified', { phone });
  }

  // ─── Login ───
  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new AppError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    if (!user.is_active) {
      throw new AppError('Account is deactivated', 'ACCOUNT_INACTIVE', 403);
    }

    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      throw new AppError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshToken);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + config.jwt.refreshExpiryDays * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepo.create(user.id, refreshTokenHash, familyId, expiresAt);

    logger.info('User logged in', { userId: user.id });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  // ─── Refresh Token ───
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await this.refreshTokenRepo.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new AppError('Invalid refresh token', 'INVALID_TOKEN', 401);
    }

    if (storedToken.revoked) {
      // Token reuse detected — revoke entire family
      logger.warn('Refresh token reuse detected! Revoking family.', {
        familyId: storedToken.family_id,
        userId: storedToken.user_id,
      });
      await this.refreshTokenRepo.revokeFamily(storedToken.family_id);
      throw new AppError('Token reuse detected. All sessions revoked.', 'TOKEN_REUSE', 401);
    }

    if (new Date(storedToken.expires_at) < new Date()) {
      throw new AppError('Refresh token expired', 'TOKEN_EXPIRED', 401);
    }

    // Revoke the old token (rotation)
    await this.refreshTokenRepo.revoke(storedToken.id);

    // Get user
    const user = await this.userRepo.findById(storedToken.user_id);
    if (!user || !user.is_active) {
      throw new AppError('User not found or inactive', 'USER_INACTIVE', 401);
    }

    // Issue new pair
    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + config.jwt.refreshExpiryDays * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepo.create(user.id, newRefreshTokenHash, storedToken.family_id, expiresAt);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
    };
  }

  // ─── Logout ───
  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const storedToken = await this.refreshTokenRepo.findByTokenHash(tokenHash);

    if (storedToken && storedToken.user_id === userId) {
      await this.refreshTokenRepo.revoke(storedToken.id);
    }

    logger.info('User logged out', { userId });
  }
}

// ─── Custom Error Class ───
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'AppError';
  }
}
