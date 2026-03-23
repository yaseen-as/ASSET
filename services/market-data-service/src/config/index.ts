import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3004', 10),
  wsPort: parseInt(process.env.WS_PORT || '3014', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'asset_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    schema: process.env.DB_SCHEMA || 'market',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  brokerServiceUrl: process.env.BROKER_SERVICE_URL || 'http://broker-service',
  mockTicks: process.env.MOCK_TICKS === 'true',
  trackedSymbols: (process.env.TRACKED_SYMBOLS || 'RELIANCE,INFY,SBIN,TCS,HDFCBANK').split(','),
  mockTickIntervalMs: parseInt(process.env.MOCK_TICK_INTERVAL_MS || '3000', 10),
};
