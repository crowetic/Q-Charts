import { useEffect, useState, useMemo } from 'react';
import { Trade, fetchTrades, aggregateCandles } from './utils/qortTrades';
import { Candle } from './utils/qortTrades';
import { QortMultiChart } from './components/QortMultiChart';
import { QortalAccountName } from './utils/qortTrades';

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
  const [fetchProgress, setFetchProgress] = useState<Record<string, number>>(
    {}
  );

  // --- Top Buyer/Seller account names state ---
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});

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

  // // --- 4) Prepare candles ---
  // const candles = useMemo<Candle[]>(() => {
  //   if (!cacheLoaded) return [];
  //   const trades = allChainTrades[selectedChain] || [];
  //   if (!trades.length) return [];

  //   // apply period filter
  //   const now = Date.now();
  //   const p = PERIODS.find((p) => p.label === period);
  //   let cutoff = 0;
  //   if (p) {
  //     if (p.days != null) cutoff = now - p.days * ONE_DAY;
  //     else if (p.months != null) {
  //       const d = new Date(now);
  //       d.setMonth(d.getMonth() - p.months);
  //       cutoff = d.getTime();
  //     }
  //   }
  //   const filtered = cutoff
  //     ? trades.filter((t) => t.tradeTimestamp >= cutoff)
  //     : trades;

  //   // percentile filter
  //   const cleaned = fastPercentileFilter(filtered, 0.00005, 0.995);
  //   return aggregateCandles(cleaned, interval);
  // }, [allChainTrades, selectedChain, period, interval, cacheLoaded]);

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
        setFetchProgress((m) => ({ ...m, [chain]: all.length }));
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
        setFetchProgress((m) => ({ ...m, [chain]: newTrades.length }));
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

  async function doHistoricalFetch(chain: string) {
    const existing = allChainTrades[chain] || [];
    if (!existing.length) return doFullFetch(chain);

    const earliest = Math.min(...existing.map((t) => t.tradeTimestamp));
    let allOld: Trade[] = [];
    let offset = 0;
    const BATCH = 100;
    while (true) {
      const batch = await fetchTrades({
        foreignBlockchain: chain,
        minimumTimestamp: 0,
        maximumTimestamp: earliest - 1,
        limit: BATCH,
        offset,
        reverse: false, // ascending older trades
      });
      if (!batch.length) break;
      allOld = allOld.concat(batch);
      offset += BATCH;
    }
    if (allOld.length) {
      setAllChainTrades((prev) => ({
        ...prev,
        [chain]: [...prev[chain], ...allOld],
      }));
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
    const filtered = cutoff
      ? trades.filter((t) => t.tradeTimestamp >= cutoff)
      : trades;

    // clean and aggregate for chart
    const cleaned = fastPercentileFilter(filtered, 0.00005, 0.995);
    const agg = aggregateCandles(cleaned, interval);
    return { candles: agg, filteredTrades: cleaned };
  }, [allChainTrades, selectedChain, period, interval, cacheLoaded]);

  // compute metrics
  const tradeCount = filteredTrades.length;
  const totalQ = useMemo(
    () => filteredTrades.reduce((s, t) => s + parseFloat(t.qortAmount), 0),
    [filteredTrades]
  );
  const totalF = useMemo(
    () => filteredTrades.reduce((s, t) => s + parseFloat(t.foreignAmount), 0),
    [filteredTrades]
  );
  const prices = useMemo(
    () =>
      filteredTrades
        .map((t) => parseFloat(t.foreignAmount) / parseFloat(t.qortAmount))
        .filter((v) => isFinite(v)),
    [filteredTrades]
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

  function isQortalAccountNameArray(arr: unknown): arr is QortalAccountName[] {
    return (
      Array.isArray(arr) &&
      // every element is an object with string `name` and `owner`
      arr.every(
        (el) =>
          typeof el === 'object' &&
          el !== null &&
          typeof el.name === 'string' &&
          typeof el.owner === 'string'
      )
    );
  }

  useEffect(() => {
    const addrs = [buyerStats.addr, sellerStats.addr].filter(
      (a) => a && a !== 'N/A'
    );
    if (!addrs.length) return;

    Promise.all(
      addrs.map(async (addr) => {
        try {
          const resp = await qortalRequest({
            action: 'GET_ACCOUNT_NAMES',
            address: addr, // or `account: addr` if that’s what your node expects
            limit: 1,
            offset: 0,
            reverse: false,
          });
          if (!isQortalAccountNameArray(resp)) {
            console.warn('Unexpected GET_ACCOUNT_NAMES response:', resp);
            return { addr, name: 'No Name' };
          }
          const list = Array.isArray(resp) ? resp : [];
          // find the entry matching our address, or fallback to the first
          const entry = list.find((x) => x.owner === addr) || list[0] || {};
          const name = entry.name?.trim() || 'No Name';
          return { addr, name };
        } catch (err) {
          console.error('Name lookup failed for', addr, err);
          return { addr, name: 'No Name' };
        }
      })
    ).then((pairs) => {
      const map: Record<string, string> = {};
      pairs.forEach(({ addr, name }) => {
        map[addr] = name;
      });
      setAccountNames(map);
    });
  }, [buyerStats.addr, sellerStats.addr]);

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
  );
}
