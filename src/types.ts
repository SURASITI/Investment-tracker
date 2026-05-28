export type TransactionType = 'Buy' | 'Sell' | 'Dividend' | 'Tax' | 'Fee';
export type Currency = 'USD' | 'THB';

export interface Transaction {
  id: string;
  userId: string;
  date: string;
  type: TransactionType;
  ticker: string;
  amount: number | null;
  currency: Currency;
  price: number | null;
  shares: number | null;
  note: string;
  createdAt: any;
}

export interface PortfolioItem {
  ticker: string;
  totalCostUSD: number;
  totalSharesBought: number;
  totalSellUSD: number;
  totalSharesSold: number;
  sharesHeld: number;
  avgCostPerShare: number;
  avgSellPerShare: number;
  realizedPL: number;
  divNet: number;
}
