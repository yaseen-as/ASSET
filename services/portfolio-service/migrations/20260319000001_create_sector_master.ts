import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS portfolio.sector_master (
      symbol          VARCHAR(50) NOT NULL,
      exchange        VARCHAR(10) NOT NULL,
      sector          VARCHAR(100) NOT NULL,
      industry        VARCHAR(100),
      market_cap      VARCHAR(20),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (symbol, exchange)
    );
  `);

  // Seed top 50 NSE stocks
  const sectors = [
    // IT
    { symbol: 'TCS', exchange: 'NSE', sector: 'Information Technology', industry: 'IT Services', market_cap: 'LARGE' },
    { symbol: 'INFY', exchange: 'NSE', sector: 'Information Technology', industry: 'IT Services', market_cap: 'LARGE' },
    { symbol: 'WIPRO', exchange: 'NSE', sector: 'Information Technology', industry: 'IT Services', market_cap: 'LARGE' },
    { symbol: 'HCLTECH', exchange: 'NSE', sector: 'Information Technology', industry: 'IT Services', market_cap: 'LARGE' },
    { symbol: 'TECHM', exchange: 'NSE', sector: 'Information Technology', industry: 'IT Services', market_cap: 'LARGE' },
    { symbol: 'LTIM', exchange: 'NSE', sector: 'Information Technology', industry: 'IT Services', market_cap: 'LARGE' },
    // Banking
    { symbol: 'HDFCBANK', exchange: 'NSE', sector: 'Banking', industry: 'Private Banks', market_cap: 'LARGE' },
    { symbol: 'ICICIBANK', exchange: 'NSE', sector: 'Banking', industry: 'Private Banks', market_cap: 'LARGE' },
    { symbol: 'KOTAKBANK', exchange: 'NSE', sector: 'Banking', industry: 'Private Banks', market_cap: 'LARGE' },
    { symbol: 'AXISBANK', exchange: 'NSE', sector: 'Banking', industry: 'Private Banks', market_cap: 'LARGE' },
    { symbol: 'SBIN', exchange: 'NSE', sector: 'Banking', industry: 'Public Banks', market_cap: 'LARGE' },
    { symbol: 'BANKBARODA', exchange: 'NSE', sector: 'Banking', industry: 'Public Banks', market_cap: 'LARGE' },
    { symbol: 'INDUSINDBK', exchange: 'NSE', sector: 'Banking', industry: 'Private Banks', market_cap: 'LARGE' },
    // Financial Services
    { symbol: 'BAJFINANCE', exchange: 'NSE', sector: 'Financial Services', industry: 'NBFC', market_cap: 'LARGE' },
    { symbol: 'BAJAJFINSV', exchange: 'NSE', sector: 'Financial Services', industry: 'Financial Conglomerate', market_cap: 'LARGE' },
    { symbol: 'SBILIFE', exchange: 'NSE', sector: 'Financial Services', industry: 'Insurance', market_cap: 'LARGE' },
    { symbol: 'HDFCLIFE', exchange: 'NSE', sector: 'Financial Services', industry: 'Insurance', market_cap: 'LARGE' },
    // Oil & Gas
    { symbol: 'RELIANCE', exchange: 'NSE', sector: 'Oil & Gas', industry: 'Conglomerate', market_cap: 'LARGE' },
    { symbol: 'ONGC', exchange: 'NSE', sector: 'Oil & Gas', industry: 'Exploration', market_cap: 'LARGE' },
    { symbol: 'BPCL', exchange: 'NSE', sector: 'Oil & Gas', industry: 'Refining', market_cap: 'LARGE' },
    { symbol: 'IOC', exchange: 'NSE', sector: 'Oil & Gas', industry: 'Refining', market_cap: 'LARGE' },
    // Pharma
    { symbol: 'SUNPHARMA', exchange: 'NSE', sector: 'Pharma', industry: 'Pharmaceuticals', market_cap: 'LARGE' },
    { symbol: 'DRREDDY', exchange: 'NSE', sector: 'Pharma', industry: 'Pharmaceuticals', market_cap: 'LARGE' },
    { symbol: 'CIPLA', exchange: 'NSE', sector: 'Pharma', industry: 'Pharmaceuticals', market_cap: 'LARGE' },
    { symbol: 'DIVISLAB', exchange: 'NSE', sector: 'Pharma', industry: 'API Manufacturing', market_cap: 'LARGE' },
    { symbol: 'APOLLOHOSP', exchange: 'NSE', sector: 'Pharma', industry: 'Hospitals', market_cap: 'LARGE' },
    // Automobile
    { symbol: 'TATAMOTORS', exchange: 'NSE', sector: 'Automobile', industry: 'Auto Manufacturers', market_cap: 'LARGE' },
    { symbol: 'MARUTI', exchange: 'NSE', sector: 'Automobile', industry: 'Auto Manufacturers', market_cap: 'LARGE' },
    { symbol: 'M&M', exchange: 'NSE', sector: 'Automobile', industry: 'Auto Manufacturers', market_cap: 'LARGE' },
    { symbol: 'BAJAJ-AUTO', exchange: 'NSE', sector: 'Automobile', industry: 'Two Wheelers', market_cap: 'LARGE' },
    { symbol: 'EICHERMOT', exchange: 'NSE', sector: 'Automobile', industry: 'Two Wheelers', market_cap: 'LARGE' },
    // FMCG
    { symbol: 'HINDUNILVR', exchange: 'NSE', sector: 'FMCG', industry: 'Personal Care', market_cap: 'LARGE' },
    { symbol: 'ITC', exchange: 'NSE', sector: 'FMCG', industry: 'Diversified FMCG', market_cap: 'LARGE' },
    { symbol: 'NESTLEIND', exchange: 'NSE', sector: 'FMCG', industry: 'Food Products', market_cap: 'LARGE' },
    { symbol: 'BRITANNIA', exchange: 'NSE', sector: 'FMCG', industry: 'Food Products', market_cap: 'LARGE' },
    { symbol: 'TATACONSUM', exchange: 'NSE', sector: 'FMCG', industry: 'Food Products', market_cap: 'LARGE' },
    // Metals & Mining
    { symbol: 'TATASTEEL', exchange: 'NSE', sector: 'Metals', industry: 'Steel', market_cap: 'LARGE' },
    { symbol: 'JSWSTEEL', exchange: 'NSE', sector: 'Metals', industry: 'Steel', market_cap: 'LARGE' },
    { symbol: 'HINDALCO', exchange: 'NSE', sector: 'Metals', industry: 'Aluminium', market_cap: 'LARGE' },
    { symbol: 'COALINDIA', exchange: 'NSE', sector: 'Metals', industry: 'Mining', market_cap: 'LARGE' },
    // Power & Utilities
    { symbol: 'NTPC', exchange: 'NSE', sector: 'Power', industry: 'Power Generation', market_cap: 'LARGE' },
    { symbol: 'POWERGRID', exchange: 'NSE', sector: 'Power', industry: 'Power Transmission', market_cap: 'LARGE' },
    { symbol: 'ADANIGREEN', exchange: 'NSE', sector: 'Power', industry: 'Renewable Energy', market_cap: 'LARGE' },
    // Construction & Infrastructure
    { symbol: 'LT', exchange: 'NSE', sector: 'Infrastructure', industry: 'Engineering', market_cap: 'LARGE' },
    { symbol: 'ULTRACEMCO', exchange: 'NSE', sector: 'Infrastructure', industry: 'Cement', market_cap: 'LARGE' },
    { symbol: 'GRASIM', exchange: 'NSE', sector: 'Infrastructure', industry: 'Cement & Diversified', market_cap: 'LARGE' },
    // Telecom
    { symbol: 'BHARTIARTL', exchange: 'NSE', sector: 'Telecom', industry: 'Telecom Services', market_cap: 'LARGE' },
    // Conglomerate / Others
    { symbol: 'ADANIENT', exchange: 'NSE', sector: 'Infrastructure', industry: 'Conglomerate', market_cap: 'LARGE' },
    { symbol: 'ADANIPORTS', exchange: 'NSE', sector: 'Infrastructure', industry: 'Ports & Logistics', market_cap: 'LARGE' },
    { symbol: 'TITAN', exchange: 'NSE', sector: 'Consumer Goods', industry: 'Jewellery & Watches', market_cap: 'LARGE' },
    { symbol: 'ASIANPAINT', exchange: 'NSE', sector: 'Consumer Goods', industry: 'Paints', market_cap: 'LARGE' },
  ];

  for (const s of sectors) {
    await knex.raw(`
      INSERT INTO portfolio.sector_master (symbol, exchange, sector, industry, market_cap)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (symbol, exchange) DO UPDATE SET
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        market_cap = EXCLUDED.market_cap,
        updated_at = NOW()
    `, [s.symbol, s.exchange, s.sector, s.industry, s.market_cap]);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE IF EXISTS portfolio.sector_master');
}
