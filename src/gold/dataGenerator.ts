/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * dataGenerator.ts — Produces perfectly synchronized multi-timeframe gold
 * candles (H4/H1/M15/M5) from a single underlying tick process so that the
 * four frames are logically consistent (1 H4 = 4 H1 = 16 M15 = 48 M5).
 *
 * The price process blends trend, mean-reversion and volatility-clustering
 * (GARCH-like) so the synthetic data resembles real XAUUSD behaviour far more
 * than a naive random walk.
 */

import { Candle, MTFData, TF } from './types';

function makeCandle(open: number, close: number, high: number, low: number, vol: number, i: number, ts: number, label: string): Candle {
  return {
    open: +open.toFixed(2),
    high: +high.toFixed(2),
    low: +low.toFixed(2),
    close: +close.toFixed(2),
    vol: Math.round(vol),
    bullish: close >= open,
    i,
    label,
    ts,
  };
}

/** Aggregate a list of base candles into `groupSize`-sized higher-TF candles. */
function aggregate(base: Candle[], groupSize: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < base.length; i += groupSize) {
    const chunk = base.slice(i, i + groupSize);
    if (chunk.length === 0) continue;
    const open = chunk[0].open;
    const close = chunk[chunk.length - 1].close;
    const high = Math.max(...chunk.map((c) => c.high));
    const low = Math.min(...chunk.map((c) => c.low));
    const vol = chunk.reduce((s, c) => s + c.vol, 0);
    out.push(makeCandle(open, close, high, low, vol, out.length, chunk[0].ts, chunk[0].label));
  }
  return out;
}

/**
 * Generate `h1Count` H1 candles plus the aligned H4/M15/M5 frames.
 * M5 is the base process (12 M5 per H1).
 */
export function generateSynchronizedCandles(h1Count = 220): MTFData {
  const m5PerH1 = 12;
  const totalM5 = h1Count * m5PerH1;
  const startTs = Date.now() - totalM5 * 5 * 60 * 1000;

  let price = 2300 + Math.random() * 60;
  let trend = (Math.random() - 0.5) * 0.04; // slow drift
  let vol = 0.6; // current volatility (GARCH state)

  const m5: Candle[] = [];
  for (let i = 0; i < totalM5; i++) {
    // Occasionally flip / decay the macro trend.
    if (i % 90 === 0) trend = (Math.random() - 0.5) * 0.05;
    trend *= 0.997;

    // Volatility clustering: vol reverts to 0.6 but gets shocked sometimes.
    const shock = Math.random() < 0.03 ? Math.random() * 1.8 : 0;
    vol = 0.6 + (vol - 0.6) * 0.94 + shock;
    vol = Math.max(0.2, Math.min(4, vol));

    const open = price;
    const drift = trend + (2330 - price) * 0.0002; // gentle mean reversion to 2330
    const move = drift + (Math.random() - 0.5) * vol;
    const close = open + move;
    const wick = vol * (0.4 + Math.random() * 0.8);
    const high = Math.max(open, close) + Math.random() * wick;
    const low = Math.min(open, close) - Math.random() * wick;
    const volume = 300 + Math.random() * 700 + vol * 200;
    const ts = startTs + i * 5 * 60 * 1000;
    m5.push(makeCandle(open, close, high, low, volume, i, ts, new Date(ts).toISOString().slice(0, 16)));
    price = close;
  }

  const m15 = aggregate(m5, 3); // 3 x M5 = M15
  const h1 = aggregate(m5, 12); // 12 x M5 = H1
  const h4 = aggregate(m5, 48); // 48 x M5 = H4

  // Re-index for stable keys.
  const reindex = (arr: Candle[]): Candle[] => arr.map((c, idx) => ({ ...c, i: idx }));

  return {
    H4: reindex(h4),
    H1: reindex(h1),
    M15: reindex(m15),
    M5: reindex(m5),
  } as MTFData;
}

export const TF_LIST: TF[] = ['H4', 'H1', 'M15', 'M5'];
