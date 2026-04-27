import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3007', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'engagement_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  alertEvaluation: {
    pollIntervalMs: parseInt(process.env.ALERT_POLL_INTERVAL || '5000', 10),
    batchSize: parseInt(process.env.ALERT_BATCH_SIZE || '200', 10),
    maxTriggerCount: parseInt(process.env.ALERT_MAX_TRIGGERS || '0', 10),
    cooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS || '300000', 10),
  },

  pageSize: 25,
} as const;
