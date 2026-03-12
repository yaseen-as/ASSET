import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'asset_platform',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    schema: process.env.DB_SCHEMA || 'recommendations',
  },
  marketDataServiceUrl: process.env.MARKET_DATA_SERVICE_URL || 'http://market-data-service',
  trackedSymbols: (process.env.TRACKED_SYMBOLS || 'RELIANCE,INFY,SBIN,TCS,HDFCBANK').split(','),
  signalWeights: {
    ruleEngine: parseFloat(process.env.WEIGHT_RULE_ENGINE || '0.4'),
    mlModel: parseFloat(process.env.WEIGHT_ML_MODEL || '0.4'),
    sentiment: parseFloat(process.env.WEIGHT_SENTIMENT || '0.2'),
  },
};
