/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * stats.ts — Real performance analytics computed from the trade ledger.
 * No hardcoded values: Profit Factor, Max Drawdown, Expectancy, Sharpe.
 */

import { Backtrade, PerfStats } from './types';

export function computeStats(trades: Backtrade[], equityHistory: number[]): PerfStats {
  const closed = trades.filter((t) => t.status !== 'OPEN');
  const wins = closed.filter((t) => t.status.includes('WIN'));
  const losses = closed.filter((t) => t.status === 'LOSS');

  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnL = closed.reduce((s, t) => s + t.pnl, 0);

  const winRate = closed.length ? Math.round((wins.length / closed.length) * 100) : 0;
  const profitFactor = grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? 99 : 0;

  // Max drawdown from the equity curve.
  let peak = equityHistory[0] || 0;
  let maxDD = 0;
  let maxDDPct = 0;
  for (const eq of equityHistory) {
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  // Expectancy and average R.
  const rValues = closed.map((t) => t.pnlR || 0);
  const avgR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;
  const winRateFrac = closed.length ? wins.length / closed.length : 0;
  const avgWinR = wins.length ? wins.reduce((s, t) => s + (t.pnlR || 0), 0) / wins.length : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((s, t) => s + (t.pnlR || 0), 0) / losses.length) : 0;
  const expectancyR = +(winRateFrac * avgWinR - (1 - winRateFrac) * avgLossR).toFixed(2);

  // Sharpe-like ratio on per-trade R returns.
  const mean = avgR;
  const variance = rValues.length
    ? rValues.reduce((s, r) => s + (r - mean) ** 2, 0) / rValues.length
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? +((mean / std) * Math.sqrt(closed.length || 1)).toFixed(2) : 0;

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    netPnL: +netPnL.toFixed(2),
    grossWin: +grossWin.toFixed(2),
    grossLoss: +grossLoss.toFixed(2),
    profitFactor,
    maxDrawdown: +maxDD.toFixed(2),
    maxDrawdownPct: +maxDDPct.toFixed(2),
    expectancyR,
    avgR: +avgR.toFixed(2),
    sharpe,
  };
}
