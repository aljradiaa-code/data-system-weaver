/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core domain types for the Gold AI Backtester (v2).
 */

export type TF = 'H4' | 'H1' | 'M15' | 'M5';

export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  vol: number;
  bullish: boolean;
  i: number;
  label: string;
  ts: number;
}

export type MTFData = Record<TF, Candle[]>;

export type Direction = 'BUY' | 'SELL' | 'NONE';

export interface OrderBlock {
  type: 'bull_ob' | 'bear_ob';
  top: number;
  bot: number;
  idx: number;
  strength: number;
}

export interface FairValueGap {
  type: 'bull_fvg' | 'bear_fvg';
  top: number;
  bot: number;
  idx: number;
  filled: boolean;
}

export interface OTEZone {
  top: number;
  bot: number;
  level: number; // 0.62 / 0.705 / 0.79
}

export interface H4Map {
  trend: Direction;
  ema20: number;
  ema50: number;
  ema200: number;
  atr: number;
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  oteZone: OTEZone | null;
  swingHigh: number;
  swingLow: number;
}

export interface H1Structure {
  h1Trend: Direction;
  isHotZone: boolean;
  hotDir: Direction;
  inOTE: boolean;
  inOB: boolean;
  inFVG: boolean;
  correction: number; // 0..1 retracement depth
  bosUp: boolean;
  bosDown: boolean;
}

export interface M15Reversal {
  isValid: boolean;
  dir: Direction;
  passCount: number; // 0..4
  hasBOS: boolean;
  hasRejection: boolean;
  hasEngulf: boolean;
  hasLiquiditySweep: boolean;
}

export interface M5Entry {
  confirmed: boolean;
  dir: Direction;
  passCount: number; // 0..4
  emaCross: boolean;
  m5BOS: boolean;
  momentum: boolean;
  volumeSpike: boolean;
}

export interface Session {
  name: string;
  color: string;
  power: number; // 0..100
}

export interface MasterSignal {
  isReady: boolean;
  dir: Direction;
  quality: number; // 0..100
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  lot: number;
  h4Map: H4Map;
  h1Str: H1Structure;
  m15Rev: M15Reversal;
  m5Entry: M5Entry;
  sess: Session;
  reasons: string[];
}

export type TradeStatus = 'OPEN' | 'WIN_TP1' | 'WIN_TP2' | 'LOSS' | 'BE';

export interface Backtrade {
  id: number;
  dir: 'BUY' | 'SELL';
  entry: number;
  stop: number;
  tp1: number;
  tp2: number;
  lot: number;
  quality: number;
  openIdx: number;
  closeIdx: number | null;
  status: TradeStatus;
  pnl: number;
  pnlR: number;
  closePrice?: number;
  currentPrice?: number;
  zones: string[];
  m15Signals: number;
  m5Signals: number;
  features?: number[];
  confidence?: number;
}

export interface AuditTopic {
  id: number;
  title: string;
  defect: string;
  scientificSolution: string;
  revampedCodeOutcome: string;
}

export interface PerfStats {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnL: number;
  grossWin: number;
  grossLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  expectancyR: number;
  avgR: number;
  sharpe: number;
}
