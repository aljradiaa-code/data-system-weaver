/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CSVUploader — four drop slots (M5 / M15 / H1 / H4). H1 is required; the rest
 * are optional and synthesized if missing. Parses on selection and reports the
 * candle count per frame.
 */

import React, { useRef } from 'react';
import { Upload, CheckCircle2, Circle } from 'lucide-react';
import { TF, Candle } from '../types';
import { parseCSV } from '../csvLoader';

interface Props {
  files: Partial<Record<TF, Candle[] | null>>;
  onLoad: (tf: TF, candles: Candle[]) => void;
  onApply: () => void;
  onReset: () => void;
}

const SLOTS: { tf: TF; label: string }[] = [
  { tf: 'M5', label: 'M5 — 5 دقائق (الدخول)' },
  { tf: 'M15', label: 'M15 — 15 دقيقة (الانعكاس)' },
  { tf: 'H1', label: 'H1 — ساعة (الهيكل — إلزامي)' },
  { tf: 'H4', label: 'H4 — 4 ساعات (الاتجاه)' },
];

export default function CSVUploader({ files, onLoad, onApply, onReset }: Props) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleFile = (tf: TF, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      const candles = parseCSV(text);
      onLoad(tf, candles);
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-[#060b15] border border-gold/15 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-bold font-sans text-white flex items-center gap-2">
        <Upload size={16} className="text-gold" />
        رفع بيانات CSV للأطر الزمنية الأربعة
      </h3>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        الصيغة المدعومة: time,open,high,low,close,volume (بفاصلة أو فاصلة
        منقوطة أو Tab). إطار H1 إلزامي؛ باقي الأطر تُولّد تلقائياً إن لم تُرفع.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SLOTS.map(({ tf, label }) => {
          const loaded = files[tf];
          return (
            <div
              key={tf}
              className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                loaded ? 'border-[#00dfa2]/40 bg-[#00dfa2]/5' : 'border-slate-800 bg-[#09101d] hover:border-gold/40'
              }`}
              onClick={() => refs.current[tf]?.click()}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-300">{label}</span>
                {loaded ? (
                  <CheckCircle2 size={15} className="text-[#00dfa2]" />
                ) : (
                  <Circle size={15} className="text-slate-600" />
                )}
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {loaded ? `${loaded.length} شمعة محملة` : 'اضغط لاختيار ملف'}
              </div>
              <input
                ref={(el) => (refs.current[tf] = el)}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(tf, f);
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onApply}
          className="flex-1 bg-gold hover:bg-amber-400 text-black font-bold font-sans py-2.5 rounded-lg text-xs transition-colors"
        >
          ⚡ تطبيق ومزامنة البيانات
        </button>
        <button
          onClick={onReset}
          className="bg-rose-950/20 hover:bg-rose-900/40 border border-rose-900/30 text-rose-400 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors"
        >
          ↺ إعادة تعيين
        </button>
      </div>
    </div>
  );
}
