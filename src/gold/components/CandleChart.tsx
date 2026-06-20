/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CandleChart — lightweight dependency-free SVG candlestick renderer with SMC
 * zone overlays and trade lines (entry / TP / SL).
 */

import React, { useMemo } from 'react';
import { Candle, Backtrade } from '../types';

interface Zone {
  kind: 'OB' | 'FVG' | 'OTE';
  type?: string;
  top?: number;
  bot?: number;
}

interface Props {
  candles: Candle[];
  zones?: Zone[];
  trade?: Backtrade | null;
  height?: number;
}

export default function CandleChart({ candles, zones = [], trade, height = 330 }: Props) {
  const view = candles.slice(-60);
  const { min, max, range } = useMemo(() => {
    if (!view.length) return { min: 2300, max: 2350, range: 50 };
    const mn = Math.min(...view.map((c) => c.low)) - 1.5;
    const mx = Math.max(...view.map((c) => c.high)) + 1.5;
    return { min: mn, max: mx, range: mx - mn || 1 };
  }, [view]);

  const Y = (p: number) => 20 + (260 * (max - p)) / range;

  if (!view.length) {
    return (
      <div className="flex items-center justify-center text-gray-600" style={{ height }}>
        بانتظار البيانات...
      </div>
    );
  }

  return (
    <svg className="w-full" style={{ height }} viewBox="0 0 600 300" preserveAspectRatio="none">
      {[0, 1, 2, 3, 4].map((g) => {
        const y = 20 + (260 / 4) * g;
        return (
          <g key={g}>
            <line x1="0" y1={y} x2="550" y2={y} stroke="rgba(255,185,0,0.04)" strokeWidth="0.5" />
            <text x="555" y={y + 3} fill="#2d4a68" fontSize="8">
              {(max - (range / 4) * g).toFixed(1)}
            </text>
          </g>
        );
      })}

      {zones.map((z, i) => {
        if (z.top == null || z.bot == null) return null;
        const tY = Y(z.top);
        const bY = Y(z.bot);
        const fill =
          z.kind === 'OB'
            ? z.type === 'bull_ob'
              ? 'rgba(0,223,162,0.06)'
              : 'rgba(255,61,90,0.06)'
            : z.kind === 'FVG'
            ? 'rgba(95,158,160,0.05)'
            : 'rgba(167,139,250,0.06)';
        return (
          <rect
            key={i}
            x="15"
            y={Math.min(tY, bY)}
            width="530"
            height={Math.abs(bY - tY) || 1}
            fill={fill}
            stroke="rgba(167,139,250,0.18)"
            strokeWidth="0.6"
            strokeDasharray="2,3"
          />
        );
      })}

      {trade && (
        <g>
          <line x1="15" y1={Y(trade.entry)} x2="545" y2={Y(trade.entry)} stroke="#ffd900" strokeWidth="1.1" />
          <line x1="15" y1={Y(trade.tp1)} x2="545" y2={Y(trade.tp1)} stroke="#00dfa2" strokeWidth="1" strokeDasharray="3,3" />
          <line x1="15" y1={Y(trade.stop)} x2="545" y2={Y(trade.stop)} stroke="#ff3d5a" strokeWidth="1" strokeDasharray="2,2" />
        </g>
      )}

      {view.map((c, idx) => {
        const sp = 500 / view.length;
        const x = 30 + idx * sp;
        const tY = Y(Math.max(c.open, c.close));
        const bY = Y(Math.min(c.open, c.close));
        const w = Math.max(2, sp - 3);
        const col = c.bullish ? '#00dfa2' : '#ff3d5a';
        return (
          <g key={c.i}>
            <line x1={x + w / 2} y1={Y(c.high)} x2={x + w / 2} y2={Y(c.low)} stroke={col} strokeWidth="0.8" />
            <rect x={x} y={tY} width={w} height={Math.max(1, Math.abs(bY - tY))} fill={col} />
          </g>
        );
      })}
    </svg>
  );
}
