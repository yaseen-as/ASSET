import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3007', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'swing_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    schema: 'alerts',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  alertEvaluation: {
    /** How often (ms) to poll DB for alerts needing a re-check */
    pollIntervalMs: parseInt(process.env.ALERT_POLL_INTERVAL || '5000', 10),
    /** Max alerts processed per evaluation cycle */
    batchSize: parseInt(process.env.ALERT_BATCH_SIZE || '200', 10),
    /** How many times an alert can fire before auto-disable (0 = unlimited) */
    maxTriggerCount: parseInt(process.env.ALERT_MAX_TRIGGERS || '0', 10),
    /** Cooldown (ms) between repeated triggers of the same alert */
    cooldownMs: parseInt(process.env.ALERT_COOLDOWN_MS || '300000', 10), // 5 min
  },
} as const;
