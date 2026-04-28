import { UserRepository, OtpRepository } from './user.repository';
import { OtpService } from './otp.service';
import { hashPassword, comparePassword } from './hash';
import { generateAccessToken } from './jwt';
import { logger } from '../utils/logger';
import type { AuthTokens } from '@platform/shared';
import { AppError } from '../errors/app-error';

export { AppError };

export class AuthService {
  private userRepo = new UserRepository();
  private otpRepo = new OtpRepository();
  private otpService = new OtpService();

  async register(email: string, password: string, phone: string): Promise<{ userId: string, phone: string }> {
    const existingEmail = await this.userRepo.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email already registered', 'EMAIL_EXISTS', 409);
    }

    const existingPhone = await this.userRepo.findByPhone(phone);
    if (existingPhone) {
      throw new AppError('Phone number already registered', 'PHONE_EXISTS', 409);
    }

    const passwordHash = await hashPassword(password);
    const user = await this.userRepo.create(email, passwordHash, phone);

    const code = this.otpService.generateCode();
    const expiresAt = this.otpService.getExpiryDate();
    await this.otpRepo.create(phone, code, expiresAt);
    await this.otpService.sendOtp(phone, code);

    logger.info('User registered', { userId: user.id, email });

    return { userId: user.id, phone };
  }

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

    const accessToken = generateAccessToken(user.id, user.email);
    logger.info('User logged in', { userId: user.id });

    return {
      accessToken,
      expiresIn: 86400, // 24 hours
    };
  }
}
