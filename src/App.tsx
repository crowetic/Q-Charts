import React, { useEffect, useState } from 'react';
import QortCandlestickChart, {
  Candle,
} from './components/QortCandlestickChart';
import {
  aggregateCandles,
  aggregateDailyCandles,
  Trade,
} from './utils/qortTrades';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Paper from '@mui/material/Paper';
import FetchAllTradesModal from './components/FetchAllTradesModal';
import { useTheme } from '@mui/material/styles';
import { CircularProgress } from '@mui/material';

const CHAINS = [
  { value: 'LITECOIN', label: 'LTC' },
  { value: 'BITCOIN', label: 'BTC' },
  { value: 'RAVENCOIN', label: 'RVN' },
  { value: 'DIGIBYTE', label: 'DGB' },
  { value: 'PIRATECHAIN', label: 'ARRR' },
  { value: 'DOGECOIN', label: 'DOGE' },
];

const PERIODS = [
  { label: '1D', days: 1 },
  { label: '5D', days: 5 },
  { label: '10D', days: 10 },
  { label: '15D', days: 15 },
  { label: '20D', days: 20 },
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'All', months: null },
];

const ONE_HOUR = 60 * 60 * 1000;
const STORAGE_KEY = 'QORT_CANDLE_TRADES';

const App: React.FC = () => {
  const theme = useTheme();
  const [candles, setCandles] = useState<Candle[]>([]);
  const [interval, setInterval] = useState(ONE_HOUR);
  const [period, setPeriod] = useState('3M');
  const [selectedChain, setSelectedChain] = useState(CHAINS[0].value);

  const [allChainTrades, setAllChainTrades] = useState<Record<string, Trade[]>>(
    {}
  );
  const [isFetchingAll, setIsFetchingAll] = useState<Record<string, boolean>>(
    {}
  );
  const [fetchProgress, setFetchProgress] = useState<Record<string, number>>(
    {}
  );
  const [fetchError, setFetchError] = useState<Record<string, string | null>>(
    {}
  );
  const [fetchModalOpen, setFetchModalOpen] = useState(false);

  const [cacheLoaded, setCacheLoaded] = useState(false);

  const [isFiltering, setIsFiltering] = useState(false);
  const [isUpdating, setIsUpdating] = useState<Record<string, boolean>>({});

  // function filterOutliersPercentile(
  //   trades: Trade[],
  //   lower = 0.01,
  //   upper = 0.99
  // ): Trade[] {
  //   if (trades.length < 10) return trades;

  //   // Compute prices
  //   const prices = trades
  //     .map((t) => parseFloat(t.foreignAmount) / parseFloat(t.qortAmount))
  //     .filter((x) => isFinite(x) && x > 0);

  //   // Sort prices
  //   const sorted = [...prices].sort((a, b) => a - b);
  //   const lowerIdx = Math.floor(sorted.length * lower);
  //   const upperIdx = Math.ceil(sorted.length * upper) - 1;
  //   const min = sorted[lowerIdx];
  //   const max = sorted[upperIdx];

  //   // Filter trades within percentile range
  //   return trades.filter((t) => {
  //     const price = parseFloat(t.foreignAmount) / parseFloat(t.qortAmount);
  //     return price >= min && price <= max;
  //   });
  // }

  function getLatestTradeTimestamp(trades: Trade[]): number {
    if (!trades || !trades.length) return 0;
    return Math.max(...trades.map((t) => t.tradeTimestamp));
  }

  function fastPercentileFilter(trades: Trade[], lower = 0.01, upper = 0.99) {
    // 1. Extract price array (one pass)
    const prices = [];
    const validTrades = [];
    for (const t of trades) {
      const qort = parseFloat(t.qortAmount);
      const price = parseFloat(t.foreignAmount) / qort;
      if (isFinite(price) && price > 0) {
        prices.push(price);
        validTrades.push({ trade: t, price });
      }
    }
    // 2. Get percentiles (sort once)
    prices.sort((a, b) => a - b);
    const min = prices[Math.floor(prices.length * lower)];
    const max = prices[Math.ceil(prices.length * upper) - 1];
    // 3. Filter in single pass
    return validTrades
      .filter(({ price }) => price >= min && price <= max)
      .map(({ trade }) => trade);
  }

  // --- LocalStorage LOAD on mount ---
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        setAllChainTrades(JSON.parse(cached));
      } catch (err) {
        console.log(err);
        localStorage.removeItem(STORAGE_KEY); // Bad cache, nuke it
      }
    }
    setCacheLoaded(true);
  }, []);

  useEffect(() => {
    // Always save to localStorage when allChainTrades updates
    if (cacheLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allChainTrades));
    }
  }, [allChainTrades, cacheLoaded]);

  // --- Filtering candles for chart based on selected time period ---
  useEffect(() => {
    if (!cacheLoaded) {
      console.log('Filter effect skipped - waiting for cacheLoaded');
      return;
    }
    setIsFiltering(true);
    setTimeout(() => {
      // --- Determine minTimestamp ---
      const now = new Date();
      const periodObj = PERIODS.find((p) => p.label === period);
      let minTimestamp = 0;
      let useDaily = false;
      if (periodObj) {
        if ('days' in periodObj && periodObj.days !== undefined) {
          now.setDate(now.getDate() - periodObj.days);
          minTimestamp = now.getTime();
        } else if (
          'months' in periodObj &&
          periodObj.months !== undefined &&
          periodObj.months !== null
        ) {
          now.setMonth(now.getMonth() - periodObj.months);
          minTimestamp = now.getTime();
          // For 1M or more, use daily candles
          if (periodObj.months >= 1) useDaily = true;
        } else if ('months' in periodObj && periodObj.months === null) {
          // 'All'
          minTimestamp = 0;
          useDaily = true;
        }
      }
      // --- Filter trades ---
      const trades = allChainTrades[selectedChain] || [];
      let filtered = minTimestamp
        ? trades.filter((t) => t.tradeTimestamp >= minTimestamp)
        : trades;
      filtered = fastPercentileFilter(filtered, 0.01, 0.99);

      // --- Aggregate ---
      if (useDaily) {
        setCandles(aggregateDailyCandles(filtered));
      } else {
        setCandles(aggregateCandles(filtered, interval));
      }
      setIsFiltering(false);
    }, 10);
  }, [interval, period, selectedChain, allChainTrades, cacheLoaded]);

  // --- Full-history fetch logic (background, not tied to modal) ---
  const startFetchAll = (chain: string) => {
    setIsFetchingAll((prev) => ({ ...prev, [chain]: true }));
    setFetchError((prev) => ({ ...prev, [chain]: null }));
    setFetchModalOpen(true);
    setFetchProgress((prev) => ({ ...prev, [chain]: 0 }));

    let allTrades: Trade[] = [];
    let offset = 0;
    const BATCH_SIZE = 100;
    let keepGoing = true;

    (async function fetchLoop() {
      try {
        while (keepGoing) {
          const url = `/crosschain/trades?foreignBlockchain=${chain}&limit=${BATCH_SIZE}&offset=${offset}&reverse=true`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const trades: Trade[] = await resp.json();
          allTrades = allTrades.concat(trades);
          setAllChainTrades((prev) => ({
            ...prev,
            [chain]: [...allTrades],
          }));
          setFetchProgress((prev) => ({ ...prev, [chain]: allTrades.length }));
          if (trades.length < BATCH_SIZE) {
            keepGoing = false;
          } else {
            offset += BATCH_SIZE;
          }
        }
      } catch (err) {
        setFetchError((prev) => ({ ...prev, [chain]: String(err) }));
      } finally {
        setIsFetchingAll((prev) => ({ ...prev, [chain]: false }));
      }
    })();
  };

  const updateTrades = async (chain: string) => {
    setIsUpdating((prev) => ({ ...prev, [chain]: true }));
    try {
      const localTrades = allChainTrades[chain] || [];
      const latest = getLatestTradeTimestamp(localTrades);
      let offset = 0;
      const BATCH_SIZE = 100;
      let keepGoing = true;
      let newTrades: Trade[] = [];
      while (keepGoing) {
        const url = `/crosschain/trades?foreignBlockchain=${chain}&limit=${BATCH_SIZE}&offset=${offset}&minimumTimestamp=${latest + 1}&reverse=true`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const batch: Trade[] = await resp.json();
        newTrades = newTrades.concat(batch);
        if (batch.length < BATCH_SIZE) {
          keepGoing = false;
        } else {
          offset += BATCH_SIZE;
        }
      }
      if (newTrades.length) {
        setAllChainTrades((prev) => ({
          ...prev,
          [chain]: [...newTrades, ...(prev[chain] || [])],
        }));
      }
    } finally {
      setIsUpdating((prev) => ({ ...prev, [chain]: false }));
    }
  };

  // --- UI state helpers ---
  const chainFetched = !!allChainTrades[selectedChain];
  const chainFetching = !!isFetchingAll[selectedChain];

  if (!cacheLoaded) return <div>Loading trade cache...</div>;

  return (
    <>
      {isFiltering && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 20000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress size={64} sx={{ color: '#00eaff', mb: 2 }} />
          <Box sx={{ color: '#fff', fontWeight: 600, fontSize: 24 }}>
            Filtering trades for chart...
          </Box>
        </Box>
      )}
      {/* Fetch Progress Modal */}
      <FetchAllTradesModal
        open={fetchModalOpen}
        onClose={() => setFetchModalOpen(false)}
        isFetching={chainFetching}
        progress={fetchProgress[selectedChain] || 0}
        error={fetchError[selectedChain]}
        total={null}
        chain={selectedChain}
      />
      <Container maxWidth="xl" disableGutters>
        <Box
          sx={{
            minHeight: '100vh',
            background: theme.palette.background.default,
            color: theme.palette.text.primary,
            p: { xs: 1, md: 3 },
            transition: 'background 0.3s, color 0.3s',
          }}
        >
          <Paper
            elevation={5}
            sx={{
              p: { xs: 1, md: 4 },
              maxWidth: 1800,
              margin: '36px auto 0 auto',
              background: theme.palette.background.paper,
              boxShadow: theme.shadows[6],
            }}
          >
            {/* Action Button */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              {!chainFetched && !chainFetching && (
                <>
                  <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    sx={{
                      fontWeight: 700,
                      fontSize: 24,
                      borderRadius: 3,
                      px: 4,
                    }}
                    onClick={() => startFetchAll(selectedChain)}
                  >
                    Fetch ALL{' '}
                    {CHAINS.find((c) => c.value === selectedChain)?.label ||
                      selectedChain}{' '}
                    Trades
                  </Button>
                  {/* <Button
                    variant="outlined"
                    size="small"
                    onClick={() => updateTrades(selectedChain)}
                    disabled={isUpdating[selectedChain] || chainFetching}
                  >
                    {isUpdating[selectedChain]
                      ? 'Updating...'
                      : 'Check for new trades'}
                  </Button> */}
                </>
              )}

              {chainFetching && (
                <Button
                  variant="contained"
                  color="primary"
                  size="large"
                  sx={{
                    fontWeight: 700,
                    fontSize: 24,
                    borderRadius: 3,
                    px: 4,
                  }}
                  onClick={() => setFetchModalOpen(true)}
                >
                  Show fetch progress
                </Button>
              )}

              {chainFetched && !chainFetching && (
                <>
                  <Button
                    variant="contained"
                    color="success"
                    size="large"
                    sx={{
                      fontWeight: 700,
                      fontSize: 24,
                      borderRadius: 3,
                      px: 4,
                    }}
                    disabled
                  >
                    Data updated
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => updateTrades(selectedChain)}
                    disabled={isUpdating[selectedChain] || chainFetching}
                  >
                    {isUpdating[selectedChain]
                      ? 'Updating...'
                      : 'Check for new trades'}
                  </Button>
                </>
              )}
            </Box>
            {/* Controls */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 2,
                flexWrap: 'wrap',
              }}
            >
              <label>
                Pair:&nbsp;
                <select
                  value={selectedChain}
                  onChange={(e) => setSelectedChain(e.target.value)}
                  style={{
                    fontSize: 16,
                    padding: '2px 8px',
                    background: theme.palette.background.paper,
                    color: theme.palette.text.primary,
                    borderRadius: 5,
                  }}
                >
                  {CHAINS.map((chain) => (
                    <option key={chain.value} value={chain.value}>
                      {chain.label}
                    </option>
                  ))}
                </select>
              </label>
              &nbsp; Interval:&nbsp;
              <Button size="small" onClick={() => setInterval(ONE_HOUR)}>
                1H
              </Button>
              <Button size="small" onClick={() => setInterval(24 * ONE_HOUR)}>
                1D
              </Button>
              &nbsp; Show:&nbsp;
              {PERIODS.map((p) => (
                <Button
                  key={p.label}
                  size="small"
                  variant={period === p.label ? 'contained' : 'outlined'}
                  onClick={() => setPeriod(p.label)}
                  sx={{ minWidth: 40, mx: 0.5 }}
                >
                  {p.label}
                </Button>
              ))}
            </Box>
            {/* Chart */}
            <Box
              sx={{
                width: '100%',
                maxWidth: 1800,
                height: { xs: 320, md: 520 },
                mx: 'auto',
              }}
            >
              <QortCandlestickChart
                candles={candles}
                showSMA={true}
                themeMode={theme.palette.mode}
                background={theme.palette.background.paper}
                textColor={theme.palette.text.primary}
                pairLabel={selectedChain === 'LITECOIN' ? 'LTC' : selectedChain}
                interval={interval}
              />
            </Box>
          </Paper>
        </Box>
      </Container>
    </>
  );
};

export default App;
