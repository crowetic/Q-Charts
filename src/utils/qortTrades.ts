// src/utils/qortTrades.ts
export interface Trade {
  tradeTimestamp: number;
  qortAmount: string;
  btcAmount: string;
  foreignAmount: string;
}

export interface FetchTradesOptions {
  foreignBlockchain: string;
  minimumTimestamp: number;
  buyerPublicKey?: string;
  sellerPublicKey?: string;
  limit?: number; // default 1000
  offset?: number;
  reverse?: boolean;
}

export async function fetchTrades({
  foreignBlockchain,
  minimumTimestamp,
  buyerPublicKey,
  sellerPublicKey,
  limit = 100,
  offset = 0,
  reverse = false,
}: FetchTradesOptions): Promise<Trade[]> {
  const params = new URLSearchParams({
    foreignBlockchain,
    minimumTimestamp: String(minimumTimestamp),
    limit: String(limit),
    offset: String(offset),
    reverse: String(reverse),
  });
  if (buyerPublicKey) params.append('buyerPublicKey', buyerPublicKey);
  if (sellerPublicKey) params.append('sellerPublicKey', sellerPublicKey);
  if (minimumTimestamp === 0) {
    params.delete('minimumTimestamp');
  }
  function getApiRoot() {
    const { origin, pathname } = window.location;
    // if path contains “/render”, cut from there
    const i = pathname.indexOf('/render/');
    return i === -1 ? origin : origin + pathname.slice(0, i);
  }
  const API_ROOT = getApiRoot();

  const url = `${API_ROOT}/crosschain/trades?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// Candle chart utility
export type Candle = {
  x: number;
  y: [number, number, number, number];
  volume: number;
};

export function aggregateDailyCandles(trades: Trade[]): Candle[] {
  if (!trades.length) return [];
  const dayBuckets: { [day: string]: Trade[] } = {};
  trades.forEach((t) => {
    const d = new Date(t.tradeTimestamp);
    const dayKey = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
    if (!dayBuckets[dayKey]) dayBuckets[dayKey] = [];
    dayBuckets[dayKey].push(t);
  });
  return Object.entries(dayBuckets)
    .map(([, tList]) => {
      const sorted = tList.sort((a, b) => a.tradeTimestamp - b.tradeTimestamp);
      const prices = sorted.map(
        (t) => parseFloat(t.foreignAmount) / parseFloat(t.qortAmount)
      );
      if (prices.length === 0) return null; // Should not happen, but for safety

      // Force tuple type
      const open = prices[0];
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const close = prices[prices.length - 1];
      return {
        x: sorted[0].tradeTimestamp,
        y: [open, high, low, close] as [number, number, number, number],
      };
    })
    .filter(Boolean) as Candle[];
}

export function aggregateCandles(
  trades: Trade[],
  intervalMs: number
): Candle[] {
  const sorted = trades
    .slice()
    .sort((a, b) => a.tradeTimestamp - b.tradeTimestamp);

  const candles: Candle[] = [];
  let current: {
    bucket: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null = null;

  for (const t of sorted) {
    const q = parseFloat(t.qortAmount);
    const f = parseFloat(t.foreignAmount);
    if (!isFinite(q) || q <= 0) continue;
    const price = f / q;

    const bucket = Math.floor(t.tradeTimestamp / intervalMs) * intervalMs;

    if (!current || current.bucket !== bucket) {
      // flush previous candle
      if (current) {
        candles.push({
          x: current.bucket,
          y: [current.open, current.high, current.low, current.close],
          volume: current.volume,
        });
      }
      // start a new bucket
      current = {
        bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: q, // initialize volume to this trade's QORT
      };
    } else {
      // same bucket → update high/low/close & accumulate
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.volume += q; // add this trade's QORT to the bucket's volume
    }
  }

  // push the last bucket
  if (current) {
    candles.push({
      x: current.bucket,
      y: [current.open, current.high, current.low, current.close],
      volume: current.volume,
    });
  }

  return candles;
}
