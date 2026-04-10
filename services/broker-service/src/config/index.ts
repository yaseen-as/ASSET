import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'asset_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    schema: process.env.DB_SCHEMA || 'broker',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  encryption: {
    key: process.env.BROKER_TOKEN_ENCRYPTION_KEY || '',
  },
  angelOne: {
    apiKey: process.env.ANGEL_ONE_API_KEY || '',
    apiUrl: process.env.ANGEL_ONE_API_URL || 'https://apiconnect.angelone.in',
    scripMasterUrl: process.env.ANGEL_ONE_SCRIP_MASTER_URL || 'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json',
  },
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  marketDataServiceUrl: process.env.MARKET_DATA_SERVICE_URL || 'http://localhost:3004',
};
