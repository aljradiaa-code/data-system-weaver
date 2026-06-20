/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * indicators.ts — Smart Money Concepts (SMC) / ICT multi-timeframe engine.
 * Pure functions, no side effects. All thresholds are ATR-relative so the
 * logic adapts to gold's changing volatility instead of using fixed pip values.
 */

import {
  Candle,
  Direction,
  H4Map,
  H1Structure,
  M15Reversal,
  M5Entry,
  MasterSignal,
  OrderBlock,
  FairValueGap,
  OTEZone,
  Session,
} from './types';

/* ----------------------------- math helpers ----------------------------- */

export function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 1;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / (slice.length || 1) || 1;
}

function swing(candles: Candle[]): { high: number; low: number } {
  const look = candles.slice(-40);
  return {
    high: Math.max(...look.map((c) => c.high)),
    low: Math.min(...look.map((c) => c.low)),
  };
}

/* ----------------------------- sessions ----------------------------- */

export function getSessionByTime(ts: number): Session {
  const h = new Date(ts).getUTCHours();
  // London/NY overlap is the most powerful for gold.
  if (h >= 12 && h < 16) return { name: 'London/NY Overlap', color: '#ffd900', power: 95 };
  if (h >= 7 && h < 12) return { name: 'London', color: '#00dfa2', power: 80 };
  if (h >= 16 && h < 21) return { name: 'New York', color: '#a78bfa', power: 75 };
  return { name: 'Asia', color: '#5f9ea0', power: 45 };
}

/* --------------------------- SMC primitives --------------------------- */

function findOrderBlocks(candles: Candle[], a: number): OrderBlock[] {
  const obs: OrderBlock[] = [];
  for (let i = 2; i < candles.length - 1; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    const next = candles[i + 1];
    const move = Math.abs(next.close - cur.close);
    if (move < a * 0.8) continue; // require an impulsive displacement
    // bullish OB: last down candle before strong up move
    if (!prev.bullish && next.close > cur.high) {
      obs.push({ type: 'bull_ob', top: prev.high, bot: prev.low, idx: i - 1, strength: move / a });
    }
    // bearish OB: last up candle before strong down move
    if (prev.bullish && next.close < cur.low) {
      obs.push({ type: 'bear_ob', top: prev.high, bot: prev.low, idx: i - 1, strength: move / a });
    }
  }
  return obs.slice(-5);
}

function findFVGs(candles: Candle[]): FairValueGap[] {
  const fvgs: FairValueGap[] = [];
  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const c = candles[i];
    // bullish FVG: gap between candle[i-2].high and candle[i].low
    if (c.low > a.high) {
      fvgs.push({ type: 'bull_fvg', top: c.low, bot: a.high, idx: i, filled: false });
    }
    // bearish FVG
    if (c.high < a.low) {
      fvgs.push({ type: 'bear_fvg', top: a.low, bot: c.high, idx: i, filled: false });
    }
  }
  return fvgs.slice(-5);
}

function computeOTE(dir: Direction, sw: { high: number; low: number }): OTEZone | null {
  const range = sw.high - sw.low;
  if (range <= 0) return null;
  // ICT Optimal Trade Entry: 0.62 - 0.79 retracement.
  if (dir === 'BUY') {
    return { top: sw.high - range * 0.62, bot: sw.high - range * 0.79, level: 0.705 };
  }
  if (dir === 'SELL') {
    return { top: sw.low + range * 0.79, bot: sw.low + range * 0.62, level: 0.705 };
  }
  return null;
}

/* ---------------------------- H4: trend map ---------------------------- */

export function buildH4Map(h4: Candle[]): H4Map {
  const closes = h4.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, Math.min(200, closes.length));
  const a = atr(h4);
  const sw = swing(h4);

  let trend: Direction = 'NONE';
  if (e20 > e50 && e50 > e200) trend = 'BUY';
  else if (e20 < e50 && e50 < e200) trend = 'SELL';

  return {
    trend,
    ema20: e20,
    ema50: e50,
    ema200: e200,
    atr: a,
    orderBlocks: findOrderBlocks(h4, a),
    fvgs: findFVGs(h4),
    oteZone: computeOTE(trend, sw),
    swingHigh: sw.high,
    swingLow: sw.low,
  };
}

/* ------------------------- H1: structure / zones ------------------------ */

export function analyzeH1Structure(h1: Candle[], h4Map: H4Map): H1Structure {
  const closes = h1.map((c) => c.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const price = closes[closes.length - 1];

  let h1Trend: Direction = 'NONE';
  if (e20 > e50) h1Trend = 'BUY';
  else if (e20 < e50) h1Trend = 'SELL';

  const inZone = (z: { top: number; bot: number } | null) =>
    !!z && price <= Math.max(z.top, z.bot) && price >= Math.min(z.top, z.bot);

  const inOTE = inZone(h4Map.oteZone);
  const inOB = h4Map.orderBlocks.some((ob) => inZone(ob));
  const inFVG = h4Map.fvgs.some((fvg) => inZone(fvg));

  const range = h4Map.swingHigh - h4Map.swingLow || 1;
  const correction =
    h4Map.trend === 'BUY'
      ? (h4Map.swingHigh - price) / range
      : (price - h4Map.swingLow) / range;

  // Break of structure on H1
  const recent = h1.slice(-10);
  const hi = Math.max(...recent.slice(0, -1).map((c) => c.high));
  const lo = Math.min(...recent.slice(0, -1).map((c) => c.low));
  const bosUp = price > hi;
  const bosDown = price < lo;

  const isHotZone = inOTE || inOB || inFVG;
  const hotDir = h4Map.trend;

  return {
    h1Trend,
    isHotZone,
    hotDir,
    inOTE,
    inOB,
    inFVG,
    correction: Math.max(0, Math.min(1, correction)),
    bosUp,
    bosDown,
  };
}

/* ----------------------- M15: reversal confirmation --------------------- */

export function analyzeM15Reversal(m15: Candle[], dir: Direction): M15Reversal {
  const recent = m15.slice(-6);
  if (recent.length < 4) {
    return { isValid: false, dir, passCount: 0, hasBOS: false, hasRejection: false, hasEngulf: false, hasLiquiditySweep: false };
  }
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  const body = Math.abs(last.close - last.open) || 0.001;
  const upperWick = last.high - Math.max(last.open, last.close);
  const lowerWick = Math.min(last.open, last.close) - last.low;

  // 1. Break of structure aligned with dir
  const priorHigh = Math.max(...recent.slice(0, -1).map((c) => c.high));
  const priorLow = Math.min(...recent.slice(0, -1).map((c) => c.low));
  const hasBOS = dir === 'BUY' ? last.close > priorHigh : last.close < priorLow;

  // 2. Rejection wick in the trade direction
  const hasRejection = dir === 'BUY' ? lowerWick > body * 1.2 : upperWick > body * 1.2;

  // 3. Engulfing candle
  const hasEngulf =
    dir === 'BUY'
      ? last.bullish && !prev.bullish && last.close > prev.open
      : !last.bullish && prev.bullish && last.close < prev.open;

  // 4. Liquidity sweep (took prior extreme then closed back inside)
  const hasLiquiditySweep =
    dir === 'BUY' ? last.low < priorLow && last.close > priorLow : last.high > priorHigh && last.close < priorHigh;

  const passCount = [hasBOS, hasRejection, hasEngulf, hasLiquiditySweep].filter(Boolean).length;
  return { isValid: passCount >= 2, dir, passCount, hasBOS, hasRejection, hasEngulf, hasLiquiditySweep };
}

/* -------------------------- M5: entry trigger --------------------------- */

export function analyzeM5Entry(m5: Candle[], dir: Direction): M5Entry {
  const recent = m5.slice(-12);
  if (recent.length < 6) {
    return { confirmed: false, dir, passCount: 0, emaCross: false, m5BOS: false, momentum: false, volumeSpike: false };
  }
  const closes = recent.map((c) => c.close);
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const last = recent[recent.length - 1];

  const emaCross = dir === 'BUY' ? e9 > e21 : e9 < e21;

  const priorHigh = Math.max(...recent.slice(0, -1).map((c) => c.high));
  const priorLow = Math.min(...recent.slice(0, -1).map((c) => c.low));
  const m5BOS = dir === 'BUY' ? last.close > priorHigh : last.close < priorLow;

  const momentum = dir === 'BUY' ? last.bullish : !last.bullish;

  const avgVol = recent.reduce((s, c) => s + c.vol, 0) / recent.length || 1;
  const volumeSpike = last.vol > avgVol * 1.3;

  const passCount = [emaCross, m5BOS, momentum, volumeSpike].filter(Boolean).length;
  return { confirmed: passCount >= 2, dir, passCount, emaCross, m5BOS, momentum, volumeSpike };
}

/* ------------------------- feature extraction --------------------------- */

/** Builds the 28-dim feature vector consumed by the neural network. */
export function extractFeatures(
  h4Map: H4Map,
  h1Str: H1Structure,
  m15Rev: M15Reversal,
  m5: Candle[]
): number[] {
  const dirNum = (d: Direction) => (d === 'BUY' ? 1 : d === 'SELL' ? -1 : 0);
  const a = h4Map.atr || 1;
  const price = m5.length ? m5[m5.length - 1].close : h4Map.ema20;
  const m5e = analyzeM5Entry(m5, m15Rev.dir);

  const f: number[] = [
    dirNum(h4Map.trend),
    dirNum(h1Str.h1Trend),
    dirNum(m15Rev.dir),
    (h4Map.ema20 - h4Map.ema50) / a,
    (h4Map.ema50 - h4Map.ema200) / a,
    (price - h4Map.ema20) / a,
    h1Str.correction,
    h1Str.inOTE ? 1 : 0,
    h1Str.inOB ? 1 : 0,
    h1Str.inFVG ? 1 : 0,
    h1Str.bosUp ? 1 : 0,
    h1Str.bosDown ? 1 : 0,
    m15Rev.passCount / 4,
    m15Rev.hasBOS ? 1 : 0,
    m15Rev.hasRejection ? 1 : 0,
    m15Rev.hasEngulf ? 1 : 0,
    m15Rev.hasLiquiditySweep ? 1 : 0,
    m5e.passCount / 4,
    m5e.emaCross ? 1 : 0,
    m5e.m5BOS ? 1 : 0,
    m5e.momentum ? 1 : 0,
    m5e.volumeSpike ? 1 : 0,
    Math.tanh(h4Map.orderBlocks.length / 3),
    Math.tanh(h4Map.fvgs.length / 3),
    h4Map.oteZone ? 1 : 0,
    (h4Map.swingHigh - price) / (h4Map.swingHigh - h4Map.swingLow || 1),
    Math.tanh((price - h4Map.swingLow) / a),
    h1Str.isHotZone ? 1 : 0,
  ];
  return f;
}

/* --------------------------- master signal ----------------------------- */

export function masterSignal(
  h4: Candle[],
  h1: Candle[],
  m15: Candle[],
  m5: Candle[],
  balance: number,
  riskPerTrade: number
): MasterSignal {
  const h4Map = buildH4Map(h4);
  const h1Str = analyzeH1Structure(h1, h4Map);
  const dir = h4Map.trend;
  const m15Rev = analyzeM15Reversal(m15, dir);
  const m5Entry = analyzeM5Entry(m5, dir);
  const price = h1[h1.length - 1].close;
  const sess = getSessionByTime(h1[h1.length - 1].ts);

  const reasons: string[] = [];
  let quality = 0;

  if (dir !== 'NONE') {
    quality += 25;
    reasons.push(`H4 trend ${dir}`);
  }
  if (h1Str.isHotZone && h1Str.hotDir === dir) {
    quality += 20;
    reasons.push('Price in HTF discount/premium zone');
  }
  if (h1Str.h1Trend === dir) {
    quality += 10;
    reasons.push('H1 aligned');
  }
  quality += m15Rev.passCount * 6; // up to 24
  if (m15Rev.isValid) reasons.push(`M15 reversal ${m15Rev.passCount}/4`);
  quality += m5Entry.passCount * 4; // up to 16
  if (m5Entry.confirmed) reasons.push(`M5 entry ${m5Entry.passCount}/4`);
  quality = Math.min(100, Math.round(quality * (0.7 + sess.power / 333)));

  // ATR-based risk model
  const a = Math.max(h4Map.atr, 0.5);
  const riskPts = a * 1.2;
  const stop = dir === 'BUY' ? price - riskPts : price + riskPts;
  const tp1 = dir === 'BUY' ? price + riskPts * 1.5 : price - riskPts * 1.5;
  const tp2 = dir === 'BUY' ? price + riskPts * 3.0 : price - riskPts * 3.0;

  // Position sizing from risk %
  const riskDollars = balance * (riskPerTrade / 100);
  const lot = Math.max(0.01, +(riskDollars / (riskPts * 100)).toFixed(2));

  const isReady =
    dir !== 'NONE' &&
    h1Str.isHotZone &&
    m15Rev.isValid &&
    m5Entry.passCount >= 1 &&
    quality >= 55;

  return {
    isReady,
    dir,
    quality,
    entry: price,
    stop: +stop.toFixed(2),
    tp1: +tp1.toFixed(2),
    tp2: +tp2.toFixed(2),
    lot,
    h4Map,
    h1Str,
    m15Rev,
    m5Entry,
    sess,
    reasons,
  };
}
