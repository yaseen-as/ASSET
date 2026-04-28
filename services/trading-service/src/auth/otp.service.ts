import { logger } from '../utils/logger';

/**
 * OTP Service — Mock implementation for development.
 * Replace with real SMS provider (MSG91, Twilio) for production.
 */
export class OtpService {
  async sendOtp(phone: string, code: string): Promise<boolean> {
    // In development, just log the OTP
    logger.info(`[OTP] Sending OTP ${code} to ${phone}`);

    // TODO: Integrate real SMS provider
    // if (config.otp.provider === 'msg91') { ... }
    // if (config.otp.provider === 'twilio') { ... }

    return true;
  }

  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  getExpiryDate(minutes: number = 10): Date {
    return new Date(Date.now() + minutes * 60 * 1000);
  }
}
