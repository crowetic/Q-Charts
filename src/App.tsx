import { useEffect, useState, useMemo } from 'react';
import { Trade, fetchTrades, aggregateCandles } from './utils/qortTrades';
import { Candle } from './utils/qortTrades';
import { QortMultiChart } from './components/QortMultiChart';

import {
  Button,
  Box,
  Container,
  // Paper,
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
  { label: '2W', days: 14 },
  { label: '3W', days: 21 },
  { label: '4W', days: 30 },
  { label: '5W', days: 38 },
  { label: '6W', days: 45 },
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
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

type ChainMap<T> = Record<string, T>;

export default function App() {
  const theme = useTheme();

  // --- UI state ---
  const [selectedChain, setSelectedChain] = useState<string>(CHAINS[0].value);
  const [interval, setInterval] = useState<number>(ONE_DAY);
  const [period, setPeriod] = useState<string>('1Y');

  // --- Data state ---
  const [allChainTrades, setAllChainTrades] = useState<ChainMap<Trade[]>>({});
  const [cacheLoaded, setCacheLoaded] = useState<boolean>(false);
  const [needsUpdate, setNeedsUpdate] = useState<ChainMap<boolean>>({});
  const [isFetching, setIsFetching] = useState<ChainMap<boolean>>({});

  // --- Helpers ---
  const getLatest = (trades: Trade[]) =>
    trades.length ? Math.max(...trades.map((t) => t.tradeTimestamp)) : 0;

  // --- 1) Load cache ---
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const { version, allChainTrades: saved } = JSON.parse(raw);
        if (version === LS_VERSION) setAllChainTrades(saved);
        else localStorage.removeItem(LS_KEY);
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
    setCacheLoaded(true);
  }, []);

  // --- 2) Save cache ---
  useEffect(() => {
    if (!cacheLoaded) return;
    const payload = { version: LS_VERSION, allChainTrades };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  }, [allChainTrades, cacheLoaded]);

  // --- 3) Decide fetch strategy ---
  useEffect(() => {
    if (!cacheLoaded) return;
    const trades = allChainTrades[selectedChain] || [];
    if (!trades.length) doFullFetch(selectedChain);
    else {
      const age = Date.now() - getLatest(trades);
      setNeedsUpdate((m) => ({ ...m, [selectedChain]: age > ONE_DAY }));
    }
  }, [cacheLoaded, selectedChain, allChainTrades]);

  // --- 4) Prepare candles ---
  const candles = useMemo<Candle[]>(() => {
    if (!cacheLoaded) return [];
    const trades = allChainTrades[selectedChain] || [];
    if (!trades.length) return [];

    // apply period filter
    const now = Date.now();
    const p = PERIODS.find((p) => p.label === period);
    let cutoff = 0;
    if (p) {
      if (p.days != null) cutoff = now - p.days * ONE_DAY;
      else if (p.months != null) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - p.months);
        cutoff = d.getTime();
      }
    }
    const filtered = cutoff
      ? trades.filter((t) => t.tradeTimestamp >= cutoff)
      : trades;

    // percentile filter
    const cleaned = fastPercentileFilter(filtered, 0.00005, 0.995);
    return aggregateCandles(cleaned, interval);
  }, [allChainTrades, selectedChain, period, interval, cacheLoaded]);

  // --- Full fetch ---
  async function doFullFetch(chain: string) {
    setIsFetching((m) => ({ ...m, [chain]: true }));
    let all: Trade[] = [];
    let offset = 0;
    const BATCH = 100;
    try {
      while (true) {
        const batch = await fetchTrades({
          foreignBlockchain: chain,
          minimumTimestamp: 0,
          limit: BATCH,
          offset,
          reverse: true,
        });
        all = all.concat(batch);
        setAllChainTrades((m) => ({ ...m, [chain]: all }));
        if (batch.length < BATCH) break;
        offset += BATCH;
      }
    } catch (e) {
      console.error('Full fetch error', e);
    } finally {
      setIsFetching((m) => ({ ...m, [chain]: false }));
    }
  }

  // --- Incremental fetch ---
  async function doIncrementalFetch(chain: string) {
    setIsFetching((m) => ({ ...m, [chain]: true }));
    try {
      const existing = allChainTrades[chain] || [];
      const latest = getLatest(existing);
      let newTrades: Trade[] = [];
      let offset = 0;
      const BATCH = 100;
      while (true) {
        const batch = await fetchTrades({
          foreignBlockchain: chain,
          minimumTimestamp: latest + 1,
          limit: BATCH,
          offset,
          reverse: true,
        });
        newTrades = newTrades.concat(batch);
        if (batch.length < BATCH) break;
        offset += BATCH;
      }
      if (newTrades.length)
        setAllChainTrades((m) => ({
          ...m,
          [chain]: [...newTrades, ...(m[chain] || [])],
        }));
      setNeedsUpdate((m) => ({ ...m, [chain]: false }));
    } catch (e) {
      console.error('Incremental fetch error', e);
    } finally {
      setIsFetching((m) => ({ ...m, [chain]: false }));
    }
  }

  // --- percentile filter ---
  function fastPercentileFilter(trades: Trade[], lower = 0.002, upper = 0.998) {
    if (trades.length < 200) return trades;
    const prices = trades
      .map((t) => parseFloat(t.foreignAmount) / parseFloat(t.qortAmount))
      .filter((x) => isFinite(x) && x > 0)
      .sort((a, b) => a - b);
    const lo = prices[Math.floor(prices.length * lower)];
    const hi = prices[Math.ceil(prices.length * upper) - 1];
    return trades.filter((t) => {
      const p = parseFloat(t.foreignAmount) / parseFloat(t.qortAmount);
      return p >= lo && p <= hi;
    });
  }

  if (!cacheLoaded)
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        height="100vh"
      >
        <CircularProgress />
      </Box>
    );

  const tradesCount = (allChainTrades[selectedChain] || []).length;
  const latestTS = getLatest(allChainTrades[selectedChain] || []);
  const latestDate = latestTS ? new Date(latestTS).toLocaleString() : 'N/A';
  const stale = needsUpdate[selectedChain];
  const loading = isFetching[selectedChain];

  // --- clear cache ---
  const clearCache = () => {
    localStorage.removeItem(LS_KEY);
    setAllChainTrades({});
    setNeedsUpdate({});
  };

  return (
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
        <Box position="absolute" top={16} right={16} textAlign="right">
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

          {/* Manual Update button */}
          <Button
            variant="outlined"
            size="small"
            color="info"
            onClick={() => doIncrementalFetch(selectedChain)}
            disabled={isFetching[selectedChain]}
            sx={{ ml: 2 }}
          >
            Obtain New Trades
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
              sx={{ mx: 0.5 }}
            >
              {p.label}
            </Button>
          ))}
        </Box>

        {/* Fetch Buttons */}
        <Box mb={2}>
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
              Fetch new trades (over 24h old)
            </Button>
          )}
          {loading && <CircularProgress size={24} sx={{ ml: 2 }} />}
        </Box>
      </Box>
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
  );
}
