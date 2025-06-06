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
  limit = 1000,
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

  const url = `crosschain/trades?${params.toString()}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.json();
}

// Candle chart utility
export type Candle = { x: number; y: [number, number, number, number] };

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
  } | null = null;

  const getPrice = (trade: Trade) => {
    const qort = parseFloat(trade.qortAmount);
    const ltc = parseFloat(trade.foreignAmount);
    return qort > 0 ? ltc / qort : null;
  };

  for (const trade of sorted) {
    const price = getPrice(trade);
    if (!price) continue;
    const bucket = Math.floor(trade.tradeTimestamp / intervalMs) * intervalMs;
    if (!current || current.bucket !== bucket) {
      if (current)
        candles.push({
          x: current.bucket,
          y: [current.open, current.high, current.low, current.close],
        });
      current = {
        bucket,
        open: price,
        high: price,
        low: price,
        close: price,
      };
    } else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
    }
  }
  if (current)
    candles.push({
      x: current.bucket,
      y: [current.open, current.high, current.low, current.close],
    });
  return candles;
}
