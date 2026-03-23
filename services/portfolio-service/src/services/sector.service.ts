import { SectorRepository, type SectorRow } from '../repositories/sector.repository';

export interface SectorInfo {
  sector: string;
  industry: string | null;
  marketCap: string | null;
}

export interface SectorAllocation {
  sector: string;
  value: number;
  weight: number;
  holdings: number;
}

export class SectorService {
  private repo = new SectorRepository();

  async getSectorForSymbol(symbol: string, exchange: string): Promise<SectorInfo | null> {
    const row = await this.repo.findBySymbol(symbol, exchange);
    if (!row) return null;
    return { sector: row.sector, industry: row.industry, marketCap: row.market_cap };
  }

  async classifyHoldings(holdings: { symbol: string; exchange: string; currentPrice: number; quantity: number; [key: string]: unknown }[]): Promise<(typeof holdings[0] & { sector?: string; industry?: string; marketCap?: string })[]> {
    const lookups = holdings.map(h => ({ symbol: h.symbol, exchange: h.exchange }));
    const sectorRows = await this.repo.findBySymbols(lookups);
    const sectorMap = new Map<string, SectorRow>();
    for (const r of sectorRows) {
      sectorMap.set(`${r.exchange}:${r.symbol}`, r);
    }

    return holdings.map(h => {
      const s = sectorMap.get(`${h.exchange}:${h.symbol}`);
      return {
        ...h,
        sector: s?.sector || 'Other',
        industry: s?.industry || undefined,
        marketCap: s?.market_cap || undefined,
      };
    });
  }

  async getSectorAllocation(holdings: { symbol: string; exchange: string; currentPrice: number; quantity: number }[]): Promise<SectorAllocation[]> {
    const classified = await this.classifyHoldings(holdings);
    const totalValue = classified.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
    if (totalValue === 0) return [];

    const sectorMap = new Map<string, { value: number; count: number }>();
    for (const h of classified) {
      const sector = h.sector || 'Other';
      const val = h.currentPrice * h.quantity;
      const existing = sectorMap.get(sector) || { value: 0, count: 0 };
      existing.value += val;
      existing.count++;
      sectorMap.set(sector, existing);
    }

    return Array.from(sectorMap.entries())
      .map(([sector, data]) => ({
        sector,
        value: Math.round(data.value * 100) / 100,
        weight: Math.round((data.value / totalValue) * 10000) / 100,
        holdings: data.count,
      }))
      .sort((a, b) => b.value - a.value);
  }

  getDiversificationScore(allocation: SectorAllocation[], holdingWeights: number[]): number {
    if (holdingWeights.length === 0) return 0;

    const n = holdingWeights.length;

    // HHI = sum of squared weights (weights as fractions)
    const hhi = holdingWeights.reduce((sum, w) => sum + w * w, 0);

    // Normalize HHI: (HHI - 1/N) / (1 - 1/N)
    const minHHI = 1 / n;
    const maxHHI = 1;
    const normalizedHHI = n > 1
      ? ((hhi - minHHI) / (maxHHI - minHHI)) * 100
      : 100;

    let score = 100 - normalizedHHI;

    // Bonus for sector diversity
    if (allocation.length >= 3) score += 10;

    // Bonus for balanced market cap mix
    const hasMixed = allocation.some(a => a.sector !== allocation[0]?.sector);
    if (hasMixed) score += 5;

    // Penalty for single stock > 50%
    if (holdingWeights.some(w => w > 0.5)) score -= 20;

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
