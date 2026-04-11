import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  jwt: {
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem',
    // For development, fallback to symmetric secret
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    trading: process.env.TRADING_SERVICE_URL || 'http://localhost:3003',
    marketData: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3004',
    recommendation: process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:3006',
    engagement: process.env.ENGAGEMENT_SERVICE_URL || 'http://localhost:3007',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};
