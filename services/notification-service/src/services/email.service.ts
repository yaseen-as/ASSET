import nodemailer from 'nodemailer';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('EmailService');

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465,
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (config.nodeEnv === 'development') {
      logger.info(`[DEV] Email to ${to}: ${subject}`);
      return true;
    }

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
    });

    logger.info(`Email sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    logger.error(`Failed to send email to ${to}`, err);
    return false;
  }
}
