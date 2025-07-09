import { useEffect, useState, useMemo } from 'react';
import { Trade, aggregateCandles } from './utils/qortTrades';
import { Candle } from './utils/qortTrades';
import { QortMultiChart } from './components/QortMultiChart';
// import { QortalAccountName } from './utils/qortTrades';
import { useTradeData, useTradeActions } from './context/TradeDataProvider';

import {
  Button,
  Box,
  Container,
  Paper,
  Divider,
  CircularProgress,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';

// --- Constants ---
const CHAINS = [
  { value: 'LITECOIN', label: 'LTC' },
  { value: 'BITCOIN', label: 'BTC' },
  { value: 'RAVENCOIN', label: 'RVN' },
  { value: 'DIGIBYTE', label: 'DGB' },
  { value: 'PIRATECHAIN', label: 'ARRR' },
  { value: 'DOGECOIN', label: 'DOGE' },
];

const PERIODS = [
  { label: '1M', months: 1 },
  { label: '2M', months: 2 },
  { label: '3M', months: 3 },
  { label: '4M', months: 4 },
  { label: '5M', months: 5 },
  { label: '6M', months: 6 },
  { label: '7M', months: 7 },
  { label: '8M', months: 8 },
  { label: '9M', months: 9 },
  { label: '10M', months: 12 },
  { label: '11M', months: 12 },
  { label: '1Y', months: 12 },
  { label: '1.5Y', months: 18 },
  { label: '2Y', months: 24 },
  { label: '2.5Y', months: 30 },
  { label: '3Y', months: 36 },
  { label: 'All', months: null },
];

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;
const LS_KEY = 'QORT_CANDLE_TRADES';
const LS_VERSION = 1;

export default function App() {
  const theme = useTheme();

  // --- UI state ---
  const [selectedChain, setSelectedChain] = useState<string>(CHAINS[0].value);
  const [interval, setInterval] = useState<number>(ONE_DAY);
  const [period, setPeriod] = useState<string>('1Y');
  const [fetchedChains, setFetchedChains] = useState<Record<string, boolean>>(
    {}
  );

  const {
    allChainTrades,
    isFetching,
    needsUpdate,
    fetchProgress,
    showCacheStaleWarning,
    cacheLoaded,
  } = useTradeData();

  const { doFullFetch, doIncrementalFetch, doHistoricalFetch, clearCache } =
    useTradeActions();

  // --- Top Buyer/Seller account names state ---
  // const [accountNames, setAccountNames] = useState<Record<string, string>>({});

  // --- Helpers ---
  const getLatest = (trades: Trade[]) =>
    trades.length ? Math.max(...trades.map((t) => t.tradeTimestamp)) : 0;

  // --- 1) Load cache ---

  // --- 2) Save cache ---
  useEffect(() => {
    if (!cacheLoaded) return;
    const payload = { version: LS_VERSION, allChainTrades };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }, [allChainTrades, cacheLoaded]);

  useEffect(() => {
    const trades = allChainTrades[selectedChain] || [];
    if (
      cacheLoaded &&
      !isFetching[selectedChain] &&
      trades.length === 0 &&
      !fetchedChains[selectedChain]
    ) {
      console.log(`Auto-fetching ${selectedChain} trades...`);
      doFullFetch(selectedChain);
      setFetchedChains((prev) => ({ ...prev, [selectedChain]: true }));
    }
  }, [
    cacheLoaded,
    selectedChain,
    allChainTrades,
    isFetching,
    fetchedChains,
    doFullFetch,
  ]);

  function filterByWeightedAverage(trades: Trade[], tolerance = 1.0): Trade[] {
    const validTrades = trades.filter((t) => {
      const fq = parseFloat(t.qortAmount);
      const ff = parseFloat(t.foreignAmount);
      return isFinite(fq) && isFinite(ff) && fq > 0 && ff > 0;
    });

    if (!validTrades.length) return [];

    // Step 1: Calculate weighted average
    let totalWeight = 0;
    let weightedSum = 0;

    for (const t of validTrades) {
      const fq = parseFloat(t.qortAmount);
      const ff = parseFloat(t.foreignAmount);
      const price = ff / fq;

      totalWeight += fq;
      weightedSum += fq * price;
    }

    const weightedAvg = weightedSum / totalWeight;

    // Step 2: Reject outliers
    const minPrice = weightedAvg / (1 + tolerance);
    const maxPrice = weightedAvg * (1 + tolerance);

    return validTrades.filter((t) => {
      const fq = parseFloat(t.qortAmount);
      const ff = parseFloat(t.foreignAmount);
      const price = ff / fq;
      return price >= minPrice && price <= maxPrice;
    });
  }

  function filterTradesByPeriod(trades: Trade[], periodLabel: string): Trade[] {
    const now = Date.now();
    const p = PERIODS.find((p) => p.label === periodLabel);
    let cutoff = 0;

    if (p) {
      if (p.months != null) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - p.months);
        cutoff = d.getTime();
      }
    }

    return cutoff
      ? trades.filter(
          (t) =>
            typeof t.tradeTimestamp === 'number' && t.tradeTimestamp >= cutoff
        )
      : trades;
  }

  const {
    candles,
    filteredTrades,
  }: { candles: Candle[]; filteredTrades: Trade[] } = useMemo(() => {
    const trades = allChainTrades[selectedChain] || [];
    if (!cacheLoaded || !trades.length)
      return { candles: [], filteredTrades: [] };

    // cutoff by period
    const now = Date.now();
    const p = PERIODS.find((p) => p.label === period);
    let cutoff = 0;
    if (p) {
      if (p.months != null) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - p.months);
        cutoff = d.getTime();
      }
    }
    const timeFiltered = cutoff
      ? trades.filter((t) => t.tradeTimestamp >= cutoff)
      : trades;

    // clean and aggregate for chart
    // const cleaned = fastPercentileFilter(filtered, 0.01, 0.99);
    const cleaned = filterByWeightedAverage(timeFiltered, 6.3);
    const agg = aggregateCandles(cleaned, interval);

    return { candles: agg, filteredTrades: cleaned };
  }, [allChainTrades, selectedChain, period, interval, cacheLoaded]);

  const rawTrades = useMemo(() => {
    return filterTradesByPeriod(allChainTrades[selectedChain] || [], period);
  }, [allChainTrades, selectedChain, period]);

  // compute metrics
  const tradeCount = rawTrades.length;
  const totalQ = useMemo(
    () => rawTrades.reduce((s, t) => s + parseFloat(t.qortAmount), 0),
    [rawTrades]
  );
  const totalF = useMemo(
    () => rawTrades.reduce((s, t) => s + parseFloat(t.foreignAmount), 0),
    [rawTrades]
  );
  const prices = useMemo(
    () =>
      rawTrades
        .map((t) => parseFloat(t.foreignAmount) / parseFloat(t.qortAmount))
        .filter((v) => isFinite(v)),
    [rawTrades]
  );

  const highPrice = prices.length ? Math.max(...prices) : 0;
  const lowPrice = prices.length ? Math.min(...prices) : 0;
  // biggest buyer/seller
  // compute buyer/seller aggregates
  const { buyerStats, sellerStats } = useMemo(() => {
    type Agg = { q: number; f: number };
    const b: Record<string, Agg> = {};
    const s: Record<string, Agg> = {};

    for (const t of filteredTrades) {
      const q = parseFloat(t.qortAmount);
      const f = parseFloat(t.foreignAmount);

      const buyer = t.buyerReceivingAddress || 'unknown';
      const seller = t.sellerAddress || 'unknown';

      if (!b[buyer]) b[buyer] = { q: 0, f: 0 };
      b[buyer].q += q;
      b[buyer].f += f;

      if (!s[seller]) s[seller] = { q: 0, f: 0 };
      s[seller].q += q;
      s[seller].f += f;
    }
    // helper to pick top
    function top(agg: Record<string, Agg>) {
      let bestAddr = 'N/A';
      let bestQ = 0;
      for (const [addr, { q }] of Object.entries(agg)) {
        if (q > bestQ) {
          bestQ = q;
          bestAddr = addr;
        }
      }
      const { q, f } = agg[bestAddr] || { q: 0, f: 0 };
      return {
        addr: bestAddr,
        totalQ: q,
        avgPrice: q ? f / q : 0,
      };
    }
    return {
      buyerStats: top(b),
      sellerStats: top(s),
    };
  }, [filteredTrades]);

  const { resolveAccountNames } = useTradeActions();
  const { accountNames } = useTradeData();

  useEffect(() => {
    const addrs = [buyerStats.addr, sellerStats.addr].filter(
      (a) => a && a !== 'N/A'
    );
    if (!addrs.length) return;

    resolveAccountNames(addrs);
  }, [buyerStats.addr, sellerStats.addr, resolveAccountNames]);

  if (!cacheLoaded) {
    const prog = fetchProgress[selectedChain] || 0;
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height="100vh"
      >
        <Typography variant="h6">Loading trades…</Typography>
        <Typography variant="body2">
          Fetched: {prog.toLocaleString()} trades
        </Typography>
        <CircularProgress sx={{ my: 2 }} />
        {prog > 0 && (
          <Box width="90%" height={300}>
            <QortMultiChart
              candles={aggregateCandles(
                allChainTrades[selectedChain] || [],
                interval
              )}
              showSMA
              themeMode={theme.palette.mode as 'light' | 'dark'}
              background={theme.palette.background.paper}
              textColor={theme.palette.text.primary}
              pairLabel={selectedChain}
              interval={interval}
            />
          </Box>
        )}
      </Box>
    );
  }

  const tradesCount = (allChainTrades[selectedChain] || []).length;
  const latestTS = getLatest(allChainTrades[selectedChain] || []);
  const latestDate = latestTS ? new Date(latestTS).toLocaleString() : 'N/A';
  const stale = needsUpdate[selectedChain];
  const loading = isFetching[selectedChain];

  return (
    // <TradeContext.Provider value={{ allChainTrades, accountNames }}>
    <Container maxWidth={false} disableGutters>
      <Container
        maxWidth={false}
        disableGutters
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh', // take full viewport height
          // overflow: 'hidden',
          // background: theme.palette.background.default,
        }}
      >
        {/* Top bar: status, controls, fetch buttons */}
        <Box
          sx={{
            flex: '0 0 auto',
            p: 2,
            position: 'relative',
            background: theme.palette.background.default,
          }}
        >
          {/* Status & Clear */}
          {/* <Box position="absolute" top={16} right={16} textAlign="right"> */}
          <Box
            mx={1}
            display="flex"
            alignItems="center"
            alignContent="flex-end"
            flexDirection="row"
          >
            <Typography variant="caption">
              Trades: {tradesCount.toLocaleString()}
              <br />
              Latest: {latestDate}
            </Typography>
            <Button
              size="small"
              variant="contained"
              color="warning"
              onClick={clearCache}
              sx={{ mt: 1 }}
            >
              Clear Cache
            </Button>
            <Button
              variant="contained"
              size="small"
              color="secondary"
              onClick={() => doHistoricalFetch(selectedChain)}
              disabled={isFetching[selectedChain]}
              sx={{ ml: 2 }}
            >
              Fetch Older Trades
            </Button>
            {/* Manual Update button */}
            <Button
              variant="outlined"
              size="small"
              color="info"
              onClick={() => doIncrementalFetch(selectedChain)}
              disabled={isFetching[selectedChain]}
              sx={{ ml: 2 }}
            >
              Fetch Newer Trades
            </Button>
          </Box>

          {/* Controls */}
          <Box mb={2} display="flex" alignItems="center" flexWrap="wrap">
            <label>
              Pair:&nbsp;
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value)}
              >
                {CHAINS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            &nbsp;&nbsp;Interval:
            <Button size="small" onClick={() => setInterval(ONE_HOUR)}>
              1H
            </Button>
            <Button size="small" onClick={() => setInterval(24 * ONE_HOUR)}>
              1D
            </Button>
            &nbsp;&nbsp;Show:
            {PERIODS.map((p) => (
              <Button
                key={p.label}
                size="small"
                variant={period === p.label ? 'contained' : 'outlined'}
                onClick={() => setPeriod(p.label)}
                sx={{ mx: 0.1 }}
              >
                {p.label}
              </Button>
            ))}
          </Box>

          {/* Fetch Buttons */}
          <Box mx={2}>
            {!tradesCount && !loading && (
              <Button
                variant="contained"
                onClick={() => doFullFetch(selectedChain)}
              >
                Fetch ALL {selectedChain} Trades
              </Button>
            )}
            {stale && !loading && (
              <Button
                variant="contained"
                color="warning"
                onClick={() => doIncrementalFetch(selectedChain)}
                sx={{ ml: 2 }}
              >
                Fetch new trades (notice!)
              </Button>
            )}
            {/*display cache state warning */}
            {showCacheStaleWarning && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  border: '1px dashed orange',
                  borderRadius: 2,
                }}
              >
                <Typography variant="body2" color="warning.main">
                  The cached trade data may be outdated.
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => doIncrementalFetch(selectedChain)}
                  sx={{ mt: 1 }}
                >
                  Fetch Newer Trades
                </Button>
              </Box>
            )}
            {loading && <CircularProgress size={24} sx={{ ml: 2 }} />}
          </Box>
        </Box>
        {/* --- Pretty Metrics Row --- */}
        <Paper
          elevation={1}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr', // single column on mobile
              sm: 'repeat(3, 1fr)', // three columns on tablet+
              md: 'repeat(6, auto)', // six auto‐sized columns on desktop
            },
            alignItems: 'center',
            gap: 2,
            px: 2,
            py: 1,
            mb: 2,
            background: theme.palette.background.paper,
          }}
        >
          <Typography variant="body2" noWrap>
            <strong>{period} Trades:</strong> {tradeCount.toLocaleString()}
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Typography variant="body2" noWrap>
            <strong>{period} Vol (QORT):</strong> {totalQ.toFixed(4)}
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Typography variant="body2" noWrap>
            <strong>
              {period} Vol ({selectedChain}):
            </strong>{' '}
            {totalF.toFixed(4)}
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Typography variant="body2" noWrap>
            <strong> {period} High:</strong> {highPrice.toFixed(8)}
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Typography variant="body2" noWrap>
            <strong> {period} Low:</strong> {lowPrice.toFixed(8)}
          </Typography>
          <Divider orientation="vertical" flexItem />
          <Typography>
            <strong>Top Buyer:</strong> {accountNames[buyerStats.addr]} |{' '}
            {buyerStats.addr}
            <br />
            <em>Bought:</em> {buyerStats.totalQ.toFixed(4)} QORT @ (avg/Q){' '}
            {buyerStats.avgPrice.toFixed(8)} {selectedChain}
          </Typography>
          <Typography>
            <strong>Top Seller:</strong> {accountNames[sellerStats.addr]} |{' '}
            {sellerStats.addr}
            <br />
            <em>Sold:</em> {sellerStats.totalQ.toFixed(4)} QORT @ (avg/Q){' '}
            {sellerStats.avgPrice.toFixed(8)} {selectedChain}
          </Typography>
        </Paper>

        {/* Chart */}
        <Box
          sx={{
            flex: 1, // fill all leftover space
            display: 'flex',
            overflow: 'hidden', // clip any chart overflow
            p: 2,
            background: theme.palette.background.paper,
          }}
        >
          {candles.length ? (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'transparent', // or theme.palette.background.default
                p: 2,
              }}
            >
              <QortMultiChart
                candles={candles}
                showSMA
                themeMode={theme.palette.mode as 'light' | 'dark'}
                background={theme.palette.background.paper}
                textColor={theme.palette.text.primary}
                pairLabel={
                  CHAINS.find((c) => c.value === selectedChain)?.label ||
                  selectedChain
                }
                interval={interval}
              />
            </Box>
          ) : (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CircularProgress />
            </Box>
          )}
        </Box>
      </Container>
    </Container>
    // </TradeContext.Provider>
  );
}
