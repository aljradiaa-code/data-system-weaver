/**
 * TwelveData client — fetches XAU/USD candles directly from the browser
 * using the user's API key. CORS is allowed by TwelveData when ?apikey= is
 * included in the URL.
 */
import { Candle, MTFData, TF } from "./types";

const INTERVAL: Record<TF, string> = {
  H4: "4h",
  H1: "1h",
  M15: "15min",
  M5: "5min",
};

export const TD_KEY_STORAGE = "twelvedata_api_key";

interface TDValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
}

interface TDResponse {
  status?: string;
  code?: number;
  message?: string;
  values?: TDValue[];
}

function toCandles(values: TDValue[]): Candle[] {
  // TwelveData returns newest first → reverse to chronological.
  const ascending = [...values].reverse();
  return ascending.map((v, i) => {
    const open = parseFloat(v.open);
    const close = parseFloat(v.close);
    const ts = new Date(v.datetime.replace(" ", "T") + "Z").getTime();
    return {
      open,
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close,
      vol: v.volume ? parseFloat(v.volume) : 0,
      bullish: close >= open,
      i,
      label: v.datetime,
      ts,
    };
  });
}

export async function fetchTwelveData(
  apiKey: string,
  tf: TF,
  outputsize = 200,
  symbol = "XAU/USD",
): Promise<Candle[]> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", INTERVAL[tf]);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as TDResponse;
  if (json.status === "error" || !json.values) {
    throw new Error(json.message || "فشل التحميل من TwelveData");
  }
  return toCandles(json.values);
}

export async function fetchAllFrames(
  apiKey: string,
  outputsize = 200,
): Promise<MTFData> {
  // Sequential (not parallel) to stay under the free-plan 8 req/min limit.
  const frames: TF[] = ["H4", "H1", "M15", "M5"];
  const out: MTFData = { H4: [], H1: [], M15: [], M5: [] };
  for (const tf of frames) {
    out[tf] = await fetchTwelveData(apiKey, tf, outputsize);
  }
  return out;
}