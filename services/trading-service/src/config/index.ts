import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'trading_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  engagementDb: {
    database: process.env.ENGAGEMENT_DB_NAME || 'engagement_db',
  },
  authDb: {
    database: process.env.AUTH_DB_NAME || 'auth_db',
  },
  engagement: {
    pageSize: 25,
    alertCooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS || '300000', 10),
    alertMaxTriggerCount: parseInt(process.env.ALERT_MAX_TRIGGERS || '0', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '24h',
  },
  otp: {
    provider: process.env.OTP_PROVIDER || 'mock',
    apiKey: process.env.SMS_API_KEY || '',
    senderId: process.env.SMS_SENDER_ID || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  encryption: {
    key: process.env.BROKER_TOKEN_ENCRYPTION_KEY || '',
  },
  upstox: {
    clientId: process.env.UPSTOX_CLIENT_ID || '',
    clientSecret: process.env.UPSTOX_CLIENT_SECRET || '',
    redirectUri: process.env.UPSTOX_REDIRECT_URI || 'http://localhost:3000/v1/broker/callback/upstox',
    apiUrl: 'https://api.upstox.com/v2',
    authUrl: 'https://api.upstox.com/v2/login/authorization/dialog',
    tokenUrl: 'https://api.upstox.com/v2/login/authorization/token',
    instrumentUrl: 'https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz',
  },
  marketServiceUrl: process.env.MARKET_SERVICE_URL || 'http://localhost:3004',
};
