import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'insights_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  materializationHour: parseInt(process.env.MATERIALIZATION_HOUR || '0', 10),
  materializationCronEnabled: process.env.MATERIALIZATION_CRON_ENABLED === 'true',
  featureCacheTtlSeconds: parseInt(process.env.FEATURE_CACHE_TTL_SECONDS || '86400', 10),
};
