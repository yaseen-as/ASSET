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
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  marketServiceUrl: process.env.MARKET_SERVICE_URL || 'http://localhost:3004',
};
