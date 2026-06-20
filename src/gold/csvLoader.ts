/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * csvLoader.ts — Robust CSV parsing + multi-timeframe alignment.
 * Accepts comma / semicolon / tab separated files with or without headers.
 * Auto-detects time, OHLCV columns. Aligns uploaded frames against H1 as the
 * structural reference, synthesizing any missing frame by aggregation.
 */

import { Candle, MTFData, TF } from './types';

export function parseCSV(text: string): Candle[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const split = (l: string) => l.split(/[;,\t]/).map((c) => c.trim());

  // Detect header: if the 2nd column of the first row is not numeric.
  let headers: string[] = [];
  const firstCols = split(lines[0]);
  if (firstCols.length > 1 && isNaN(parseFloat(firstCols[1]))) {
    headers = firstCols.map((h) => h.toLowerCase());
    lines.shift();
  }

  const idx = (...names: string[]) =>
    headers.length ? headers.findIndex((h) => names.some((n) => h.includes(n))) : -1;

  const iTime = idx('time', 'date', 'timestamp');
  const iOpen = idx('open');
  const iHigh = idx('high');
  const iLow = idx('low');
  const iClose = idx('close');
  const iVol = idx('vol');

  const out: Candle[] = [];
  lines.forEach((line, i) => {
    const c = split(line);
    if (c.length < 5) return;
    const timeStr = iTime !== -1 ? c[iTime] : c[0];
    const o = parseFloat(c[iOpen !== -1 ? iOpen : 1]);
    const h = parseFloat(c[iHigh !== -1 ? iHigh : 2]);
    const l = parseFloat(c[iLow !== -1 ? iLow : 3]);
    const cl = parseFloat(c[iClose !== -1 ? iClose : 4]);
    const v = iVol !== -1 ? parseFloat(c[iVol]) || 500 : parseFloat(c[5]) || 500;
    if (![o, h, l, cl].every((x) => Number.isFinite(x) && x > 0)) return;
    const ts = Date.parse(timeStr) || Date.now() + i * 60000;
    out.push({
      open: o, high: h, low: l, close: cl, vol: v,
      bullish: cl >= o, i, label: timeStr, ts,
    });
  });
  // Ensure chronological order (oldest first).
  out.sort((a, b) => a.ts - b.ts);
  return out.map((c, i) => ({ ...c, i }));
}

function aggregate(base: Candle[], groupSize: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < base.length; i += groupSize) {
    const chunk = base.slice(i, i + groupSize);
    if (!chunk.length) continue;
    out.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      vol: chunk.reduce((s, c) => s + c.vol, 0),
      bullish: chunk[chunk.length - 1].close >= chunk[0].open,
      i: out.length,
      label: chunk[0].label,
      ts: chunk[0].ts,
    });
  }
  return out;
}

/**
 * Align uploaded frames. H1 is mandatory (structural reference). Any missing
 * frame is synthesized: higher frames by aggregating, M5 cannot be invented so
 * we approximate by even subdivision when absent.
 */
export function alignTimeframes(files: Partial<Record<TF, Candle[] | null>>): MTFData {
  const h1 = files.H1;
  if (!h1 || h1.length === 0) {
    throw new Error('يجب رفع إطار H1 على الأقل لأنه المرجع الهيكلي للنظام.');
  }
  const reindex = (a: Candle[]) => a.map((c, i) => ({ ...c, i }));

  const H1 = reindex(h1);
  const H4 = reindex(files.H4 && files.H4.length ? files.H4 : aggregate(H1, 4));
  const M15 = reindex(files.M15 && files.M15.length ? files.M15 : subdivide(H1, 4));
  const M5 = reindex(files.M5 && files.M5.length ? files.M5 : subdivide(H1, 12));

  return { H4, H1, M15, M5 };
}

/** Approximate a lower TF from H1 when the real file is missing. */
function subdivide(h1: Candle[], parts: number): Candle[] {
  const out: Candle[] = [];
  h1.forEach((c) => {
    let prevClose = c.open;
    for (let k = 0; k < parts; k++) {
      const frac = (k + 1) / parts;
      const target = k === parts - 1 ? c.close : c.open + (c.close - c.open) * frac;
      const o = prevClose;
      const cl = target;
      const span = (c.high - c.low) * 0.35;
      out.push({
        open: o,
        close: cl,
        high: Math.max(o, cl) + Math.random() * span,
        low: Math.min(o, cl) - Math.random() * span,
        vol: Math.round(c.vol / parts),
        bullish: cl >= o,
        i: out.length,
        label: `${c.label}-${k}`,
        ts: c.ts + k * (60 / parts) * 60 * 1000,
      });
      prevClose = cl;
    }
  });
  return out;
}
