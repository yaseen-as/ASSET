export interface OpenPosition {
  symbol: string;
  exchange: string;
  entry_date: string;
  entry_price: number;
  shares: number;
  cost_basis: number;     // shares * entry_price + entry-side cost
}
