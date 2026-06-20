/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App.tsx — Gold AI Backtester v2.
 * Tabs: Backtest · Neural · Portfolio · Live · Data(CSV) · Audit.
 * The strategy engine, neural network, stats and CSV loader live in separate
 * modules; this component orchestrates state and rendering.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play, Pause, RefreshCw, Cpu, Brain, LineChart, ShieldAlert, Activity,
  Settings, Database, Upload, Save, Zap, TrendingUp,
} from 'lucide-react';
import { Candle, Backtrade, MasterSignal, MTFData, TF } from './types';
import { generateSynchronizedCandles } from './dataGenerator';
import { NeuralNetwork, BAYES } from './neural';
import { masterSignal, extractFeatures } from './indicators';
import { computeStats } from './stats';
import { alignTimeframes } from './csvLoader';
import { auditData } from './auditData';
import CandleChart from './components/CandleChart';
import StatCard from './components/StatCard';
import CSVUploader from './components/CSVUploader';
import { fetchAllFrames, fetchTwelveData, TD_KEY_STORAGE } from './twelvedata';

type Tab = 'bt' | 'neural' | 'portfolio' | 'live' | 'data' | 'audit';
const SPEED_MS = [400, 250, 120, 45, 10];
const emptyMTF = (): MTFData => ({ H4: [], H1: [], M15: [], M5: [] });

export default function App() {
  const [tab, setTab] = useState<Tab>('bt');
  const [chartTF, setChartTF] = useState<TF>('H1');

  const [hist, setHist] = useState<MTFData>(emptyMTF());
  const [cursor, setCursor] = useState(40);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(3);
  const [trades, setTrades] = useState<Backtrade[]>([]);
  const [openTrade, setOpenTrade] = useState<Backtrade | null>(null);
  const [equity, setEquity] = useState<number[]>([10000]);
  const [status, setStatus] = useState('⚡ جاهز. ولّد سلسلة أو ارفع CSV للبدء.');

  const [nn, setNn] = useState<NeuralNetwork | null>(null);
  const [bayes, setBayes] = useState<Record<string, { w: number; l: number }>>({});
  const [nnEnabled, setNnEnabled] = useState(true);
  const [threshold, setThreshold] = useState(0.6);
  const [accuracy, setAccuracy] = useState(0);
  const [lastLoss, setLastLoss] = useState(0);

  const [portfolio, setPortfolio] = useState({ balance: 10000, initialBalance: 10000, riskPerTrade: 1.0, maxDailyTrades: 3 });
  const [balInput, setBalInput] = useState('10000');
  const [riskInput, setRiskInput] = useState('1.0');

  const [csvFiles, setCsvFiles] = useState<Partial<Record<TF, Candle[] | null>>>({});

  const [liveHist, setLiveHist] = useState<MTFData>(emptyMTF());
  const [liveActive, setLiveActive] = useState(false);
  const [liveTrades, setLiveTrades] = useState<Backtrade[]>([]);
  const [liveOpen, setLiveOpen] = useState<Backtrade | null>(null);
  const [liveBalance, setLiveBalance] = useState(10000);
  const [liveCountdown, setLiveCountdown] = useState(200);

  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const [tdKey, setTdKey] = useState('');
  const [tdBusy, setTdBusy] = useState(false);
  const [tdError, setTdError] = useState('');

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* -------------------------- boot -------------------------- */
  useEffect(() => {
    const net = new NeuralNetwork([28, 24, 12, 3]);
    const loaded = net.load();
    setNn(net);
    setAccuracy(net.accuracy());
    setBayes(BAYES.load());

    const data = generateSynchronizedCandles(220);
    setHist(data);
    const live = generateSynchronizedCandles(150);
    setLiveHist({
      H4: live.H4.slice(-100), H1: live.H1.slice(-100),
      M15: live.M15.slice(-100), M5: live.M5.slice(-100),
    });
    setStatus(`✅ تم توليد ${data.H1.length} شمعة هيكلية${loaded ? ' (أوزان الشبكة السابقة نشطة)' : ''}.`);
  }, []);

  /* ---------------------- TwelveData key boot ---------------------- */
  useEffect(() => {
    try {
      const k = localStorage.getItem(TD_KEY_STORAGE);
      if (k) setTdKey(k);
    } catch {}
  }, []);

  const saveTdKey = () => {
    try { localStorage.setItem(TD_KEY_STORAGE, tdKey.trim()); } catch {}
    setTdError('');
    setStatus('🔑 تم حفظ مفتاح TwelveData.');
  };

  const loadFromTD = async () => {
    const key = tdKey.trim();
    if (!key) { setTdError('أدخل مفتاح TwelveData أولاً.'); return; }
    setTdBusy(true); setTdError('');
    try {
      const mtf = await fetchAllFrames(key, 200);
      setLiveHist(mtf);
      setHist(mtf);
      setCursor(40);
      setTrades([]); setOpenTrade(null);
      setEquity([portfolio.initialBalance]);
      setPortfolio((p) => ({ ...p, balance: p.initialBalance }));
      setStatus(`📡 TwelveData: H4=${mtf.H4.length} · H1=${mtf.H1.length} · M15=${mtf.M15.length} · M5=${mtf.M5.length}`);
    } catch (e: any) {
      setTdError(e?.message || 'فشل التحميل.');
    } finally {
      setTdBusy(false);
    }
  };

  /* ------------------- derived signal / zones ------------------- */
  const activeH4 = useMemo(() => hist.H4.slice(0, Math.floor(cursor / 4) + 1), [cursor, hist]);
  const activeH1 = useMemo(() => hist.H1.slice(0, cursor + 1), [cursor, hist]);
  const activeM15 = useMemo(() => hist.M15.slice(0, cursor * 4 + 1), [cursor, hist]);
  const activeM5 = useMemo(() => hist.M5.slice(0, cursor * 12 + 1), [cursor, hist]);

  const signal: MasterSignal | null = useMemo(() => {
    return activeH1.length > 5 && activeH4.length > 5
      ? masterSignal(activeH4, activeH1, activeM15, activeM5, portfolio.balance, portfolio.riskPerTrade)
      : null;
  }, [activeH4, activeH1, activeM15, activeM5, portfolio.balance, portfolio.riskPerTrade]);

  const zones = useMemo(() => {
    if (!signal?.h4Map) return [];
    const m = signal.h4Map;
    return [
      ...m.orderBlocks.map((o) => ({ ...o, kind: 'OB' as const })),
      ...m.fvgs.map((f) => ({ ...f, kind: 'FVG' as const })),
      ...(m.oteZone ? [{ ...m.oteZone, kind: 'OTE' as const }] : []),
    ];
  }, [signal]);

  const stats = useMemo(() => computeStats(trades, equity), [trades, equity]);

  /* ------------------------ backtest step ------------------------ */
  const trainOutcome = useCallback((trade: Backtrade, won: boolean) => {
    if (!nn || !trade.features) return;
    const label = won ? (trade.dir === 'BUY' ? 0 : 1) : 2;
    const loss = nn.train(trade.features, label, 0.015);
    nn.remember(trade.features, label);
    if (nn.trainData.length % 10 === 0) nn.replay(1, 0.01); // periodic consolidation
    setLastLoss(loss);
    setAccuracy(nn.accuracy());
    BAYES.record(trade.features, won, bayes);
    setBayes({ ...bayes });
  }, [nn, bayes]);

  const step = useCallback(() => {
    const total = hist.H1.length;
    if (cursor >= total - 2) {
      setIsRunning(false);
      nn?.save();
      BAYES.save(bayes);
      setStatus('✅ اكتمل الاختبار وحُفظت أوزان الشبكة.');
      return;
    }
    const nc = cursor + 1;
    setCursor(nc);

    const h4 = hist.H4.slice(0, Math.floor(nc / 4) + 1);
    const h1 = hist.H1.slice(0, nc + 1);
    const m15 = hist.M15.slice(0, nc * 4 + 1);
    const m5 = hist.M5.slice(0, nc * 12 + 1);
    if (h4.length < 15 || h1.length < 8) return;
    const price = h1[h1.length - 1].close;

    if (openTrade) {
      let closed = false, reason = '', exit = price;
      const buy = openTrade.dir === 'BUY';
      if ((buy && price >= openTrade.tp1) || (!buy && price <= openTrade.tp1)) { closed = true; reason = 'WIN_TP1'; exit = openTrade.tp1; }
      else if ((buy && price <= openTrade.stop) || (!buy && price >= openTrade.stop)) { closed = true; reason = 'LOSS'; exit = openTrade.stop; }

      if (closed) {
        const raw = buy ? exit - openTrade.entry : openTrade.entry - exit;
        const pnl = +(raw * openTrade.lot * 100).toFixed(2);
        const r = +(raw / (Math.abs(openTrade.entry - openTrade.stop) || 1)).toFixed(2);
        const newBal = +(portfolio.balance + pnl).toFixed(2);
        const fin: Backtrade = { ...openTrade, status: reason as any, closePrice: exit, closeIdx: nc, pnl, pnlR: r };
        setTrades((p) => [...p.filter((t) => t.id !== fin.id), fin]);
        setEquity((p) => [...p, newBal]);
        setPortfolio((p) => ({ ...p, balance: newBal }));
        setOpenTrade(null);
        trainOutcome(fin, reason === 'WIN_TP1');
        setStatus(`${reason === 'WIN_TP1' ? '🟢 ربح' : '🔴 خسارة'} ${fin.dir} @ ${exit} — ${pnl}$`);
      } else {
        setOpenTrade({ ...openTrade, currentPrice: price });
      }
    } else {
      const sig = masterSignal(h4, h1, m15, m5, portfolio.balance, portfolio.riskPerTrade);
      if (sig.isReady && sig.quality >= 55) {
        const recent = trades.slice(-3).some((t) => t.dir === sig.dir && nc - (t.closeIdx || 0) < 4);
        if (!recent) {
          const feats = extractFeatures(sig.h4Map, sig.h1Str, sig.m15Rev, m5);
          let pass = true, conf = 0.5;
          if (nn && nnEnabled && nn.trainData.length > 5) {
            conf = nn.confidence(feats, sig.dir as 'BUY' | 'SELL');
            pass = conf >= threshold;
          }
          if (pass) {
            const pos: Backtrade = {
              id: Date.now() + Math.random(), dir: sig.dir as 'BUY' | 'SELL', entry: price,
              stop: sig.stop, tp1: sig.tp1, tp2: sig.tp2, lot: sig.lot, quality: sig.quality,
              openIdx: nc, closeIdx: null, status: 'OPEN', pnl: 0, pnlR: 0,
              zones: sig.reasons, m15Signals: sig.m15Rev.passCount, m5Signals: sig.m5Entry.passCount,
              currentPrice: price, features: feats, confidence: conf,
            };
            setOpenTrade(pos);
            setTrades((p) => [...p, pos]);
            setStatus(`🟢 فتح ${pos.dir} @ ${price} | جودة ${pos.quality}% | ثقة ${(conf * 100).toFixed(0)}%`);
          } else {
            setStatus(`🎚️ رفض الشبكة للإشارة (${(conf * 100).toFixed(0)}% < ${(threshold * 100).toFixed(0)}%)`);
          }
        }
      }
    }
  }, [cursor, hist, openTrade, trades, portfolio, nn, nnEnabled, threshold, bayes, trainOutcome]);

  useEffect(() => {
    if (isRunning) {
      timer.current = setTimeout(step, SPEED_MS[speed - 1] || 120);
    } else if (timer.current) {
      clearTimeout(timer.current);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [isRunning, cursor, speed, step]);

  /* ------------------------ controls ------------------------ */
  const regenerate = () => {
    const d = generateSynchronizedCandles(260);
    setHist(d); setCursor(40); setTrades([]); setOpenTrade(null);
    setEquity([portfolio.initialBalance]);
    setPortfolio((p) => ({ ...p, balance: p.initialBalance }));
    setStatus(`🔄 تم توليد ${d.H1.length} شمعة جديدة.`);
  };
  const reset = () => {
    setIsRunning(false); setCursor(40); setTrades([]); setOpenTrade(null);
    setEquity([portfolio.initialBalance]);
    setPortfolio((p) => ({ ...p, balance: p.initialBalance }));
    setStatus('↺ تم التصفير.');
  };
  const fullRun = () => {
    setIsRunning(false);
    const total = hist.H1.length;
    let c = cursor, open = openTrade, list = [...trades], bal = portfolio.balance, eq = [...equity];
    while (c < total - 2) {
      c++;
      const h4 = hist.H4.slice(0, Math.floor(c / 4) + 1);
      const h1 = hist.H1.slice(0, c + 1);
      const m15 = hist.M15.slice(0, c * 4 + 1);
      const m5 = hist.M5.slice(0, c * 12 + 1);
      if (h4.length < 15 || h1.length < 8) continue;
      const price = h1[h1.length - 1].close;
      if (open) {
        const buy = open.dir === 'BUY';
        let closed = false, reason = '', exit = price;
        if ((buy && price >= open.tp1) || (!buy && price <= open.tp1)) { closed = true; reason = 'WIN_TP1'; exit = open.tp1; }
        else if ((buy && price <= open.stop) || (!buy && price >= open.stop)) { closed = true; reason = 'LOSS'; exit = open.stop; }
        if (closed) {
          const raw = buy ? exit - open.entry : open.entry - exit;
          const pnl = +(raw * open.lot * 100).toFixed(2);
          const r = +(raw / (Math.abs(open.entry - open.stop) || 1)).toFixed(2);
          bal = +(bal + pnl).toFixed(2);
          const fin: Backtrade = { ...open, status: reason as any, closePrice: exit, closeIdx: c, pnl, pnlR: r };
          list = [...list.filter((t) => t.id !== fin.id), fin];
          eq.push(bal);
          if (nn && fin.features) { const lbl = reason === 'WIN_TP1' ? (buy ? 0 : 1) : 2; nn.train(fin.features, lbl, 0.015); nn.remember(fin.features, lbl); BAYES.record(fin.features, reason === 'WIN_TP1', bayes); }
          open = null;
        }
      } else {
        const sig = masterSignal(h4, h1, m15, m5, bal, portfolio.riskPerTrade);
        if (sig.isReady && sig.quality >= 55) {
          const recent = list.slice(-3).some((t) => t.dir === sig.dir && c - (t.closeIdx || 0) < 4);
          if (!recent) {
            const feats = extractFeatures(sig.h4Map, sig.h1Str, sig.m15Rev, m5);
            let pass = true;
            if (nn && nnEnabled && nn.trainData.length > 5) pass = nn.confidence(feats, sig.dir as 'BUY' | 'SELL') >= threshold;
            if (pass) {
              const pos: Backtrade = {
                id: Date.now() + Math.random(), dir: sig.dir as 'BUY' | 'SELL', entry: price,
                stop: sig.stop, tp1: sig.tp1, tp2: sig.tp2, lot: sig.lot, quality: sig.quality,
                openIdx: c, closeIdx: null, status: 'OPEN', pnl: 0, pnlR: 0, zones: sig.reasons,
                m15Signals: sig.m15Rev.passCount, m5Signals: sig.m5Entry.passCount, currentPrice: price, features: feats,
              };
              open = pos; list.push(pos);
            }
          }
        }
      }
    }
    setCursor(total - 2); setOpenTrade(open); setTrades(list);
    setPortfolio((p) => ({ ...p, balance: bal })); setEquity(eq);
    nn?.save(); BAYES.save(bayes); setBayes({ ...bayes }); if (nn) setAccuracy(nn.accuracy());
    const wins = list.filter((t) => t.status.includes('WIN')).length;
    const wr = list.length ? Math.round((wins / list.length) * 100) : 0;
    setStatus(`⚡ اكتمل الجريان الكامل — ${list.length} صفقة | نجاح ${wr}%`);
  };

  /* ------------------------ CSV ------------------------ */
  const onCsvLoad = (tf: TF, candles: Candle[]) => {
    setCsvFiles((p) => ({ ...p, [tf]: candles }));
    setStatus(`📁 تم قبول ${tf} (${candles.length} شمعة).`);
  };
  const onCsvApply = () => {
    try {
      const synced = alignTimeframes(csvFiles);
      setHist(synced); setCursor(40); setTrades([]); setOpenTrade(null);
      setEquity([portfolio.initialBalance]);
      setPortfolio((p) => ({ ...p, balance: p.initialBalance }));
      setTab('bt');
      setStatus(`⚡ تم ربط ومزامنة بيانات CSV (H1=${synced.H1.length}).`);
    } catch (e: any) {
      setStatus(`❌ ${e.message}`);
    }
  };
  const onCsvReset = () => { setCsvFiles({}); setStatus('↺ تم تفريغ ملفات CSV.'); };

  /* ------------------------ live ------------------------ */
  const liveTick = useCallback(() => {
    setLiveHist((prev) => {
      if (!prev.H1.length) return generateSynchronizedCandles(120);
      const H1 = [...prev.H1];
      const last = { ...H1[H1.length - 1] };
      last.close = +(last.close + (Math.random() - 0.48) * 1.8).toFixed(2);
      last.high = Math.max(last.high, last.close);
      last.low = Math.min(last.low, last.close);
      H1[H1.length - 1] = last;
      const next = { ...prev, H1 };
      const price = last.close;

      if (liveOpen) {
        const buy = liveOpen.dir === 'BUY';
        let closed = false, reason = '', exit = price;
        if ((buy && price >= liveOpen.tp1) || (!buy && price <= liveOpen.tp1)) { closed = true; reason = 'WIN_TP1'; exit = liveOpen.tp1; }
        else if ((buy && price <= liveOpen.stop) || (!buy && price >= liveOpen.stop)) { closed = true; reason = 'LOSS'; exit = liveOpen.stop; }
        if (closed) {
          const raw = buy ? exit - liveOpen.entry : liveOpen.entry - exit;
          const pnl = +(raw * liveOpen.lot * 100).toFixed(2);
          const fin: Backtrade = { ...liveOpen, status: reason as any, closePrice: exit, pnl, pnlR: +(raw / (Math.abs(liveOpen.entry - liveOpen.stop) || 1)).toFixed(2) };
          setLiveTrades((p) => [...p, fin]); setLiveBalance((b) => +(b + pnl).toFixed(2)); setLiveOpen(null);
          if (nn && fin.features) { const lbl = reason === 'WIN_TP1' ? (buy ? 0 : 1) : 2; nn.train(fin.features, lbl, 0.015); nn.remember(fin.features, lbl); nn.save(); setAccuracy(nn.accuracy()); }
        } else setLiveOpen({ ...liveOpen, currentPrice: price });
      } else {
        const sig = masterSignal(next.H4, next.H1, next.M15, next.M5, liveBalance, portfolio.riskPerTrade);
        if (sig.isReady && sig.quality >= 55) {
          const feats = extractFeatures(sig.h4Map, sig.h1Str, sig.m15Rev, next.M5);
          let pass = true;
          if (nn && nnEnabled && nn.trainData.length > 5) pass = nn.confidence(feats, sig.dir as 'BUY' | 'SELL') >= threshold;
          if (pass) {
            const pos: Backtrade = {
              id: Date.now() + Math.random(), dir: sig.dir as 'BUY' | 'SELL', entry: price,
              stop: sig.stop, tp1: sig.tp1, tp2: sig.tp2, lot: sig.lot, quality: sig.quality,
              openIdx: 0, closeIdx: null, status: 'OPEN', pnl: 0, pnlR: 0, zones: sig.reasons,
              m15Signals: sig.m15Rev.passCount, m5Signals: sig.m5Entry.passCount, currentPrice: price, features: feats,
            };
            setLiveOpen(pos); setLiveTrades((p) => [...p, pos]);
          }
        }
      }
      return next;
    });
  }, [liveOpen, liveBalance, nn, nnEnabled, threshold, portfolio.riskPerTrade]);

  useEffect(() => {
    if (!liveActive) { setLiveCountdown(200); return; }
    const iv = setInterval(() => {
      setLiveCountdown((p) => {
        if (p <= 1) {
          const key = tdKey.trim();
          if (key) {
            fetchTwelveData(key, 'H1', 200)
              .then((H1) => {
                setLiveHist((prev) => ({ ...prev, H1 }));
                setStatus(`📡 تحديث حي من TwelveData (${new Date().toLocaleTimeString('ar')})`);
              })
              .catch((e) => setTdError(e?.message || 'فشل التحديث الحي.'));
          } else {
            liveTick();
          }
          return 200;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [liveActive, liveTick, tdKey]);

  /* ------------------------ AI ------------------------ */
  const consult = async () => {
    if (!trades.length) { setAiError('شغّل الاختبار أولاً.'); return; }
    setAiBusy(true); setAiError(''); setAiText('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: { totalTrades: stats.totalTrades, pnl: stats.netPnL, winRate: stats.winRate },
          profitFactor: stats.profitFactor, maxDrawdown: `${stats.maxDrawdownPct}%`,
          expectancyR: stats.expectancyR, sharpe: stats.sharpe,
          lastTrades: trades.filter((t) => t.status !== 'OPEN').slice(-5),
        }),
      });
      const data = await res.json();
      if (res.ok) setAiText(data.analysis); else setAiError(data.error || 'خطأ غير متوقع.');
    } catch (e: any) { setAiError('فشل الاتصال بالخادم: ' + e.message); }
    finally { setAiBusy(false); }
  };

  const savePortfolio = (e: React.FormEvent) => {
    e.preventDefault();
    const bal = parseFloat(balInput) || 10000;
    const risk = parseFloat(riskInput) || 1.0;
    setPortfolio({ balance: bal, initialBalance: bal, riskPerTrade: risk, maxDailyTrades: 3 });
    setEquity([bal]); setTrades([]); setOpenTrade(null); setCursor(40);
    setStatus(`⚙️ تحديث المحفظة — رصيد $${bal}`);
  };

  const chartCandles =
    chartTF === 'H4' ? activeH4 : chartTF === 'H1' ? activeH1 : chartTF === 'M15' ? activeM15 : activeM5;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'bt', label: 'الاختبار والمحاكاة', icon: <LineChart size={14} /> },
    { id: 'neural', label: 'الشبكة العصبية', icon: <Cpu size={14} /> },
    { id: 'data', label: 'بيانات CSV', icon: <Upload size={14} /> },
    { id: 'portfolio', label: 'المحفظة والمخاطر', icon: <Settings size={14} /> },
    { id: 'live', label: 'البث الحي', icon: <Activity size={14} /> },
    { id: 'audit', label: 'التدقيق العلمي', icon: <ShieldAlert size={14} /> },
  ];

  return (
    <div className="min-h-screen text-[#c5d4e8] select-none font-mono text-xs flex flex-col bg-[#03060d]">
      <header className="bg-[#060b15]/95 border-b border-gold/10 shrink-0 py-3 px-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-gold to-gold2 rounded px-2.5 py-1 text-black font-extrabold font-sans tracking-wider">XAUUSD AI v2</div>
          <div>
            <div className="text-sm font-extrabold text-white flex items-center gap-2">
              <span className="text-gold font-sans">XAUUSD</span>
              <span className="text-[#a78bfa] text-[10px] bg-[#a78bfa]/10 px-1.5 py-0.5 rounded">ICT / SMC + Neural</span>
            </div>
            <div className="text-[9px] text-[#2d4a68] tracking-widest uppercase hidden sm:block">Order Blocks · FVG · OTE · Backtest · AI</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block">السعر الحالي</span>
            <div className="text-emerald-400 font-extrabold text-sm flex items-center gap-1.5 justify-end">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {activeH1.length ? activeH1[activeH1.length - 1].close.toFixed(2) : '---'}
            </div>
          </div>
          <button onClick={regenerate} className="border border-gold/20 hover:border-gold hover:bg-gold/10 bg-[#0d1424] px-2.5 py-1.5 rounded-lg flex items-center gap-1 text-[10px] text-gold">
            <RefreshCw size={11} /><span className="hidden sm:inline">سلسلة جديدة</span>
          </button>
        </div>
      </header>

      <nav className="bg-[#050a12] border-b border-gold/5 flex shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[120px] py-3 text-center font-sans font-bold text-xs flex items-center justify-center gap-2 border-b-2 transition-all ${
              tab === t.id ? 'text-gold border-gold bg-[#0d1424]/40' : 'text-[#2d4a68] border-transparent hover:text-white'}`}>
            {t.icon}<span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="bg-[#090f1c] py-2 px-4 border-b border-gold/5 text-[10px] text-gray-400 flex items-center gap-1.5 select-text">
        <span className="text-gold shrink-0">◀</span> {status}
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-4">
        {tab === 'bt' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#060b15] border border-gold/5 rounded-lg p-2 flex items-center justify-between flex-wrap gap-1.5">
                <div className="flex items-center gap-1">
                  {(['H4', 'H1', 'M15', 'M5'] as TF[]).map((tf) => (
                    <button key={tf} onClick={() => setChartTF(tf)}
                      className={`px-3 py-1 text-[10px] rounded font-bold ${chartTF === tf ? 'bg-gold/15 text-gold border border-gold/30' : 'bg-[#0d1424] text-gray-500 border border-gold/5 hover:text-white'}`}>{tf}</button>
                  ))}
                </div>
                <span className="bg-[#09101d] text-gray-400 px-2.5 py-1 text-[9px] rounded border border-gold/5">H1: {cursor} / {hist.H1.length}</span>
              </div>

              <div className="bg-[#040810] border border-gold/10 rounded-xl overflow-hidden shadow-2xl">
                <CandleChart candles={chartCandles} zones={zones} trade={openTrade} />
              </div>

              <div className="bg-[#060b15] border border-gold/10 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setIsRunning(!isRunning)}
                      className={`px-5 py-2.5 rounded-lg font-bold font-sans flex items-center gap-2 ${isRunning ? 'bg-amber-600 text-white' : 'bg-gold text-black'}`}>
                      {isRunning ? <Pause size={14} /> : <Play size={14} />}{isRunning ? 'إيقاف' : 'تشغيل'}
                    </button>
                    <button onClick={() => { setIsRunning(false); step(); }} className="bg-[#0f172a] border border-slate-700 px-3.5 py-2.5 rounded-lg font-bold">شمعة ←</button>
                    <button onClick={fullRun} className="bg-emerald-950/40 border border-emerald-800 text-emerald-300 px-3.5 py-2.5 rounded-lg font-bold">⚡ جريان كامل</button>
                    <button onClick={reset} className="bg-rose-950/20 border border-rose-900/30 text-rose-400 px-3.5 py-2.5 rounded-lg font-bold">↺ تصفير</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">السرعة:</span>
                    <input type="range" min="1" max="5" value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))} className="w-24 accent-gold" />
                    <span className="text-gold font-bold">x{speed}</span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gold/5 flex items-center gap-3">
                  <span className="text-[10px] text-gray-500 shrink-0">التقدم:</span>
                  <div className="flex-1 bg-[#09101d] h-2.5 rounded overflow-hidden border border-gold/5">
                    <div className="bg-gradient-to-r from-purple-500 to-gold h-full" style={{ width: `${Math.round((cursor / (hist.H1.length || 100)) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-gold shrink-0">{Math.round((cursor / (hist.H1.length || 100)) * 100)}%</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-[#060b15]/95 border border-gold/10 rounded-xl p-4">
                <h3 className="text-sm font-bold font-sans text-white border-b border-gold/10 pb-2 mb-3">مؤشرات الأداء (حقيقية)</h3>
                <div className="grid grid-cols-2 gap-2.5">
                  <StatCard label="إجمالي الصفقات" value={stats.totalTrades} tone="gold" />
                  <StatCard label="معدل النجاح" value={`${stats.winRate}%`} tone={stats.winRate >= 50 ? 'green' : 'red'} />
                  <StatCard label="صافي الربح" value={`$${stats.netPnL}`} tone={stats.netPnL >= 0 ? 'green' : 'red'} />
                  <StatCard label="Profit Factor" value={stats.profitFactor} tone="purple" />
                  <StatCard label="Max Drawdown" value={`${stats.maxDrawdownPct}%`} tone="red" />
                  <StatCard label="Expectancy R" value={stats.expectancyR} tone="gold" />
                  <StatCard label="Sharpe" value={stats.sharpe} tone="purple" />
                  <StatCard label="دقة الشبكة" value={`${(accuracy * 100).toFixed(0)}%`} tone="green" />
                </div>
              </div>

              <div className="bg-[#060b15]/95 border border-gold/15 rounded-xl p-4 space-y-2.5">
                <h3 className="text-sm font-bold font-sans text-white border-b border-gold/10 pb-2">ترابط الأطر (MTF)</h3>
                {[
                  { l: 'H4 الاتجاه', v: signal?.h4Map?.trend },
                  { l: 'H1 الهيكل', v: signal?.h1Str?.h1Trend },
                  { l: `M15 الانعكاس (${signal?.m15Rev?.passCount ?? 0}/4)`, v: signal?.m15Rev?.isValid ? 'OK' : '—' },
                  { l: `M5 الدخول (${signal?.m5Entry?.passCount ?? 0}/4)`, v: signal?.m5Entry?.confirmed ? 'OK' : '—' },
                ].map((row, i) => (
                  <div key={i} className="bg-[#09101d] border border-slate-800/60 p-2 rounded-lg flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">{row.l}</span>
                    <span className="text-xs font-bold text-white">{row.v ?? '—'}</span>
                  </div>
                ))}
                <div className="bg-[#0d1424] p-2 rounded-lg flex justify-between items-center text-[10px]">
                  <span className="text-gray-500">جودة الإشارة:</span>
                  <span className="text-gold font-bold">{signal?.quality || 0}%</span>
                </div>
              </div>

              <div className="bg-[#060b15] border border-gold/10 rounded-xl p-4">
                <h3 className="text-sm font-bold font-sans text-white border-b border-gold/10 pb-2 mb-2">سجل الصفقات</h3>
                <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                  {trades.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">لا صفقات بعد.</div>
                  ) : trades.slice().reverse().map((t) => {
                    const won = t.status.includes('WIN');
                    const col = t.status === 'OPEN' ? 'border-gold/20' : won ? 'border-[#00dfa2]/20 bg-[#00dfa2]/5' : 'border-[#ff3d5a]/25 bg-[#ff3d5a]/5';
                    return (
                      <div key={t.id} className={`p-2.5 border rounded-lg flex justify-between items-center text-[10px] ${col}`}>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${t.dir === 'BUY' ? 'bg-[#00dfa2]/15 text-[#00dfa2]' : 'bg-[#ff3d5a]/15 text-[#ff3d5a]'}`}>{t.dir}</span>
                        <span className="font-mono text-gray-300">@{t.entry.toFixed(1)}</span>
                        <span className="text-[#a78bfa]">{t.status === 'OPEN' ? '---' : t.pnlR + 'R'}</span>
                        <span className={`font-bold ${won ? 'text-[#00dfa2]' : t.status === 'OPEN' ? 'text-gold' : 'text-[#ff3d5a]'}`}>{t.status === 'OPEN' ? 'مفتوح' : (t.pnl >= 0 ? '+' : '') + t.pnl + '$'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'neural' && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-[#060b15] border border-gold/15 rounded-xl p-5 space-y-4">
              <h2 className="text-base font-extrabold font-sans text-white flex items-center gap-2"><Brain size={18} className="text-[#a78bfa]" /> الشبكة العصبية — تحفظ الماضي وتتنبأ بالمستقبل</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <StatCard label="حجم الذاكرة" value={nn?.trainData.length || 0} tone="gold" />
                <StatCard label="الدقة" value={`${(accuracy * 100).toFixed(0)}%`} tone="green" />
                <StatCard label="آخر خسارة" value={lastLoss.toFixed(3)} tone="purple" />
                <StatCard label="البنية" value="28-24-12-3" tone="neutral" />
              </div>
              <div className="space-y-3">
                <label className="flex items-center justify-between text-xs">
                  <span>تفعيل فلتر الشبكة العصبية</span>
                  <input type="checkbox" checked={nnEnabled} onChange={(e) => setNnEnabled(e.target.checked)} className="accent-gold w-4 h-4" />
                </label>
                <label className="block text-xs">
                  <span className="flex justify-between"><span>عتبة الثقة</span><span className="text-gold">{(threshold * 100).toFixed(0)}%</span></span>
                  <input type="range" min="0.3" max="0.9" step="0.05" value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} className="w-full accent-gold mt-1" />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { if (nn) { const l = nn.replay(5, 0.01); setLastLoss(l); setAccuracy(nn.accuracy()); nn.save(); setStatus('🧠 أعيد تدريب الشبكة على الذاكرة (Experience Replay).'); } }}
                  className="flex-1 bg-[#a78bfa]/20 border border-[#a78bfa]/40 text-[#a78bfa] py-2.5 rounded-lg font-bold flex items-center justify-center gap-2"><Zap size={14} /> إعادة تدريب (Replay)</button>
                <button onClick={() => { if (nn) { nn.save(); BAYES.save(bayes); setStatus('💾 تم حفظ الأوزان.'); } }}
                  className="flex-1 bg-gold/20 border border-gold/40 text-gold py-2.5 rounded-lg font-bold flex items-center justify-center gap-2"><Save size={14} /> حفظ</button>
                <button onClick={() => { if (nn) { nn.reset(); setAccuracy(0); setLastLoss(0); setStatus('⚠️ تم تصفير الشبكة.'); } }}
                  className="bg-rose-950/20 border border-rose-900/30 text-rose-400 px-4 py-2.5 rounded-lg font-bold">↺</button>
              </div>
            </div>
            <div className="bg-[#060b15] border border-gold/10 rounded-xl p-5">
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2"><TrendingUp size={15} className="text-gold" /> التوقع الحالي</h3>
              {signal ? (
                <div className="grid grid-cols-3 gap-2.5">
                  {(() => {
                    const f = extractFeatures(signal.h4Map, signal.h1Str, signal.m15Rev, activeM5);
                    const p = nn ? nn.predict(f) : [0.33, 0.33, 0.34];
                    return [
                      { l: 'شراء رابح', v: p[0], t: 'green' as const },
                      { l: 'بيع رابح', v: p[1], t: 'red' as const },
                      { l: 'خسارة', v: p[2], t: 'neutral' as const },
                    ].map((x, i) => <StatCard key={i} label={x.l} value={`${(x.v * 100).toFixed(1)}%`} tone={x.t} />);
                  })()}
                </div>
              ) : <div className="text-gray-500 text-center py-4">بانتظار إشارة...</div>}
            </div>
          </div>
        )}

        {tab === 'data' && (
          <div className="max-w-2xl mx-auto">
            <CSVUploader files={csvFiles} onLoad={onCsvLoad} onApply={onCsvApply} onReset={onCsvReset} />
          </div>
        )}

        {tab === 'portfolio' && (
          <div className="max-w-md mx-auto bg-[#060b15] border border-gold/15 rounded-xl p-5">
            <h2 className="text-base font-extrabold font-sans text-white mb-4 flex items-center gap-2"><Settings size={18} className="text-gold" /> إعداد المحفظة والمخاطر</h2>
            <form onSubmit={savePortfolio} className="space-y-4">
              <label className="block text-xs"><span className="text-gray-400">الرصيد الأساسي ($)</span>
                <input value={balInput} onChange={(e) => setBalInput(e.target.value)} className="w-full mt-1 bg-[#09101d] border border-slate-700 rounded-lg p-2.5 text-white" /></label>
              <label className="block text-xs"><span className="text-gray-400">المخاطرة لكل صفقة (%)</span>
                <input value={riskInput} onChange={(e) => setRiskInput(e.target.value)} className="w-full mt-1 bg-[#09101d] border border-slate-700 rounded-lg p-2.5 text-white" /></label>
              <button type="submit" className="w-full bg-gold hover:bg-amber-400 text-black font-bold font-sans py-3 rounded-lg">حفظ الإعدادات</button>
            </form>
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <StatCard label="الرصيد الحالي" value={`$${portfolio.balance.toFixed(0)}`} tone="green" />
              <StatCard label="المخاطرة" value={`${portfolio.riskPerTrade}%`} tone="gold" />
            </div>
          </div>
        )}

        {tab === 'live' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-[#040810] border border-gold/10 rounded-xl overflow-hidden">
                <CandleChart candles={liveHist[chartTF]} trade={liveOpen} />
              </div>
              <div className="bg-[#060b15] border border-gold/10 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
                <button onClick={() => setLiveActive(!liveActive)}
                  className={`px-5 py-2.5 rounded-lg font-bold font-sans flex items-center gap-2 ${liveActive ? 'bg-amber-600 text-white' : 'bg-gold text-black'}`}>
                  {liveActive ? <Pause size={14} /> : <Play size={14} />}{liveActive ? 'إيقاف البث' : 'تشغيل البث الحي (محاكاة)'}
                </button>
                <span className="text-[10px] text-gray-400">التحديث بعد: <span className="text-gold font-bold">{liveCountdown}ث</span></span>
                <span className="text-emerald-400 font-bold">الرصيد: ${liveBalance.toFixed(0)}</span>
              </div>
            </div>
            <div className="bg-[#060b15] border border-gold/10 rounded-xl p-4">
              <h3 className="text-sm font-bold text-white border-b border-gold/10 pb-2 mb-2">صفقات البث الحي</h3>
              <div className="max-h-[300px] overflow-y-auto space-y-2">
                {liveTrades.length === 0 ? <div className="text-center py-8 text-gray-500">لا صفقات حية بعد.</div> :
                  liveTrades.slice().reverse().map((t) => {
                    const won = t.status.includes('WIN');
                    return (<div key={t.id} className={`p-2 border rounded-lg flex justify-between text-[10px] ${t.status === 'OPEN' ? 'border-gold/20' : won ? 'border-[#00dfa2]/20' : 'border-[#ff3d5a]/25'}`}>
                      <span className={t.dir === 'BUY' ? 'text-[#00dfa2]' : 'text-[#ff3d5a]'}>{t.dir}</span>
                      <span className="text-gray-300">@{t.entry.toFixed(1)}</span>
                      <span className={won ? 'text-[#00dfa2]' : t.status === 'OPEN' ? 'text-gold' : 'text-[#ff3d5a]'}>{t.status === 'OPEN' ? 'مفتوح' : t.pnl + '$'}</span>
                    </div>);
                  })}
              </div>
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <div className="bg-[#060b15]/95 border border-gold/15 rounded-xl p-5">
                <h2 className="text-base font-extrabold font-sans text-rose-400 flex items-center gap-2 mb-4"><ShieldAlert size={18} /> التدقيق العلمي للكود الأصلي</h2>
                <div className="space-y-4">
                  {auditData.map((a, i) => (
                    <div key={a.id} className="bg-[#09101d] border border-rose-950/30 rounded-xl overflow-hidden">
                      <div className="bg-[#0e1728] px-4 py-3 flex items-center justify-between border-b border-rose-950/20">
                        <span className="font-bold text-sm flex items-center gap-2"><span className="text-gold">0{i + 1}.</span>{a.title}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div><span className="text-[#a78bfa] block font-bold mb-1">🔍 الخلل:</span><span className="text-gray-400 text-[11px] block border-r-2 border-red-500/20 bg-black/10 p-2 rounded">{a.defect}</span></div>
                        <div><span className="text-[#00dfa2] block font-bold mb-1">🛠️ الحل العلمي:</span><span className="text-gray-300">{a.scientificSolution}</span></div>
                        <div className="pt-2 border-t border-slate-800/40 flex justify-between text-[11px] text-gold/80"><span>النتيجة:</span><span className="font-bold">{a.revampedCodeOutcome}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-[#060b15]/90 border border-gold/10 rounded-xl p-5 sticky top-20">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3"><Brain size={18} className="text-[#a78bfa]" /> مستشار Gemini الكمي</h3>
                {trades.length === 0 ? (
                  <div className="bg-[#0d1424] p-4 text-center rounded-lg text-gray-500 border border-slate-800 border-dashed text-[11px]">شغّل الاختبار أولاً.</div>
                ) : (
                  <button onClick={consult} disabled={aiBusy} className="w-full bg-gradient-to-r from-gold to-gold2 text-black font-bold font-sans py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                    <Cpu size={14} className={aiBusy ? 'animate-spin' : ''} />{aiBusy ? 'جارٍ التحليل...' : 'تحليل بالذكاء الاصطناعي'}
                  </button>
                )}
                {aiError && <div className="mt-3 bg-red-950/20 border border-red-900/30 p-3 rounded-lg text-rose-400 text-[11px]">{aiError}</div>}
                {aiText && <div className="mt-4 bg-[#09101d] border border-gold/15 p-4 rounded-xl max-h-[360px] overflow-y-auto whitespace-pre-wrap text-xs text-gray-200 select-text">{aiText}</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
