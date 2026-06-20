/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';

interface Props {
  label: string;
  value: string | number;
  tone?: 'gold' | 'green' | 'red' | 'purple' | 'neutral';
}

const toneMap: Record<string, string> = {
  gold: 'text-gold',
  green: 'text-[#00dfa2]',
  red: 'text-[#ff3d5a]',
  purple: 'text-[#a78bfa]',
  neutral: 'text-white',
};

export default function StatCard({ label, value, tone = 'neutral' }: Props) {
  return (
    <div className="bg-[#09101d] border border-slate-800/60 p-2.5 rounded-lg text-center">
      <div className={`text-lg font-sans font-bold ${toneMap[tone]}`}>{value}</div>
      <div className="text-[9px] text-[#2d4a68]">{label}</div>
    </div>
  );
}
