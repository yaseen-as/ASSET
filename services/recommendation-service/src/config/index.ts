import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3005', 10),
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
  featureServiceUrl: process.env.FEATURE_SERVICE_URL || 'http://localhost:3006',
  defaultModelName: process.env.DEFAULT_MODEL_NAME || 'meta',
  modelCacheSize: parseInt(process.env.MODEL_CACHE_SIZE || '5', 10),
  dailyRankingCronEnabled: process.env.DAILY_RANKING_CRON_ENABLED === 'true',
  performanceBackfillCronEnabled: process.env.PERFORMANCE_BACKFILL_CRON_ENABLED === 'true',
};
