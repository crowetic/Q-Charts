import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {
  fetchTrades,
  // aggregateCandles,
  Trade,
  QortalAccountName,
} from '../utils/qortTrades';

const LS_KEY = 'QORT_CANDLE_TRADES';
const LS_VERSION = 1;
const ONE_DAY = 24 * 60 * 60 * 1000;

interface TradeData {
  allChainTrades: Record<string, Trade[]>;
  accountNames: Record<string, string>;
  cacheLoaded: boolean;
  isFetching: Record<string, boolean>;
  needsUpdate: Record<string, boolean>;
  fetchProgress: Record<string, number>;
  showCacheStaleWarning: boolean;
  namesLoading: boolean;
  namesRemaining: number;
}

interface TradeActions {
  doFullFetch: (chain: string) => Promise<void>;
  doIncrementalFetch: (chain: string) => Promise<void>;
  doHistoricalFetch: (chain: string) => Promise<void>;
  clearCache: () => void;
  resolveAccountNames: (addresses: string[]) => Promise<void>;
}

const TradeDataContext = createContext<TradeData | undefined>(undefined);
const TradeActionsContext = createContext<TradeActions | undefined>(undefined);

export const useTradeData = (): TradeData => {
  const context = useContext(TradeDataContext);
  if (!context)
    throw new Error('useTradeData must be used within TradeDataProvider');
  return context;
};

export const useTradeActions = (): TradeActions => {
  const context = useContext(TradeActionsContext);
  if (!context)
    throw new Error('useTradeActions must be used within TradeDataProvider');
  return context;
};

export const TradeDataProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [allChainTrades, setAllChainTrades] = useState<Record<string, Trade[]>>(
    {}
  );
  const [accountNames, setAccountNames] = useState<Record<string, string>>({});
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [isFetching, setIsFetching] = useState<Record<string, boolean>>({});
  const [needsUpdate, setNeedsUpdate] = useState<Record<string, boolean>>({});
  const [fetchProgress, setFetchProgress] = useState<Record<string, number>>(
    {}
  );
  const [showCacheStaleWarning, setShowCacheStaleWarning] = useState(false);

  const BATCH_SIZE = 25;

  const [namesLoading, setNamesLoading] = useState(false);
  const [namesRemaining, setNamesRemaining] = useState(0);

  const resolveAccountNames = useCallback(
    async (addresses: string[]) => {
      const uniqueAddresses = addresses.filter(
        (addr) => addr && !accountNames[addr]
      );
      if (!uniqueAddresses.length) return;

      await Promise.all(
        uniqueAddresses.map(async (addr) => {
          try {
            const resp = await qortalRequest({
              action: 'GET_ACCOUNT_NAMES',
              address: addr,
              limit: 1,
              offset: 0,
              reverse: false,
            });
            if (Array.isArray(resp) && resp.every(isQortalAccountName)) {
              const entry = resp.find((x) => x.owner === addr) || resp[0] || {};
              const name = entry.name?.trim() || 'No Name';
              setAccountNames((prev) => ({ ...prev, [addr]: name }));
            } else {
              setAccountNames((prev) => ({ ...prev, [addr]: 'No Name' }));
            }
          } catch (err) {
            console.error('Failed to fetch account name for', addr, err);
            setAccountNames((prev) => ({ ...prev, [addr]: 'No Name' }));
          }
        })
      );
    },
    [accountNames]
  );

  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (
          parsed.version === LS_VERSION &&
          typeof parsed.allChainTrades === 'object'
        ) {
          setAllChainTrades(parsed.allChainTrades);
          if (parsed.accountNames && typeof parsed.accountNames === 'object') {
            setAccountNames(parsed.accountNames);
          }
          let hasRecent = false;
          for (const chain in parsed.allChainTrades) {
            const trades: Trade[] = parsed.allChainTrades[chain];
            if (!Array.isArray(trades) || !trades.length) continue;
            const timestamps = trades
              .map((t) => t.tradeTimestamp)
              .filter(Boolean);
            const latest = Math.max(...timestamps);
            const age = Date.now() - latest;
            if (age < 7 * ONE_DAY) {
              hasRecent = true;
              break;
            }
          }
          setShowCacheStaleWarning(!hasRecent);
        }
      } catch (err) {
        console.warn('Failed to load trade cache:', err);
      }
    }
    setCacheLoaded(true);
  }, []);

  useEffect(() => {
    if (cacheLoaded) {
      const payload = {
        version: LS_VERSION,
        allChainTrades,
        accountNames,
      };

      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    }
  }, [allChainTrades, accountNames, cacheLoaded]);

  const doFullFetch = async (chain: string) => {
    setIsFetching((prev) => ({ ...prev, [chain]: true }));
    let all: Trade[] = [];
    let offset = 0;
    const BATCH = 100;
    while (true) {
      const batch = await fetchTrades({
        foreignBlockchain: chain,
        minimumTimestamp: 0,
        limit: BATCH,
        offset,
        reverse: true,
      });
      all = all.concat(batch);
      setFetchProgress((prev) => ({ ...prev, [chain]: all.length }));
      if (batch.length < BATCH) break;
      offset += BATCH;
    }
    setAllChainTrades((prev) => ({ ...prev, [chain]: all }));
    setIsFetching((prev) => ({ ...prev, [chain]: false }));
  };

  useEffect(() => {
    if (!cacheLoaded) return;

    const allAddresses = new Set<string>();
    Object.values(allChainTrades).forEach((trades) => {
      trades.forEach((t) => {
        if (t.buyerReceivingAddress) allAddresses.add(t.buyerReceivingAddress);
        if (t.sellerAddress) allAddresses.add(t.sellerAddress);
      });
    });

    const unresolved = Array.from(allAddresses).filter(
      (addr) => addr && !accountNames[addr]
    );

    if (!unresolved.length) return;

    setNamesRemaining(unresolved.length);
    setNamesLoading(true);

    let cancelled = false;

    const resolveBatches = async () => {
      for (let i = 0; i < unresolved.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = unresolved.slice(i, i + BATCH_SIZE);
        await resolveAccountNames(batch);
        setNamesRemaining((r) => Math.max(r - batch.length, 0));
      }
      if (!cancelled) setNamesLoading(false);
    };

    resolveBatches();

    return () => {
      cancelled = true;
    };
  }, [allChainTrades, cacheLoaded, accountNames, resolveAccountNames]);

  const doIncrementalFetch = async (chain: string) => {
    setIsFetching((prev) => ({ ...prev, [chain]: true }));
    const existing = allChainTrades[chain] || [];
    const latest = existing.length
      ? Math.max(...existing.map((t) => t.tradeTimestamp))
      : 0;
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
      setFetchProgress((prev) => ({ ...prev, [chain]: newTrades.length }));
      if (batch.length < BATCH) break;
      offset += BATCH;
    }
    if (newTrades.length) {
      setAllChainTrades((prev) => ({
        ...prev,
        [chain]: [...newTrades, ...(prev[chain] || [])],
      }));
    }
    setNeedsUpdate((prev) => ({ ...prev, [chain]: false }));
    setIsFetching((prev) => ({ ...prev, [chain]: false }));
    setShowCacheStaleWarning(false);
  };

  const doHistoricalFetch = async (chain: string) => {
    const existing = allChainTrades[chain] || [];
    if (!existing.length) return doFullFetch(chain);

    setIsFetching((prev) => ({ ...prev, [chain]: true }));
    const earliest = Math.min(...existing.map((t) => t.tradeTimestamp));
    let allOld: Trade[] = [];
    let offset = 0;
    const BATCH = 100;
    while (true) {
      const batch = await fetchTrades({
        foreignBlockchain: chain,
        maximumTimestamp: earliest - 1,
        limit: BATCH,
        offset,
        reverse: false,
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
    setIsFetching((prev) => ({ ...prev, [chain]: false }));
  };

  const clearCache = () => {
    localStorage.removeItem(LS_KEY);
    setAllChainTrades({});
    setAccountNames({});
    setIsFetching({});
    setNeedsUpdate({});
    setFetchProgress({});
    setShowCacheStaleWarning(false);
    setNamesLoading(false);
    setNamesRemaining(0);
  };

  function isQortalAccountName(obj: unknown): obj is QortalAccountName {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as QortalAccountName).name === 'string' &&
      typeof (obj as QortalAccountName).owner === 'string'
    );
  }

  return (
    <TradeDataContext.Provider
      value={{
        allChainTrades,
        accountNames,
        cacheLoaded,
        isFetching,
        needsUpdate,
        fetchProgress,
        showCacheStaleWarning,
        namesLoading,
        namesRemaining,
      }}
    >
      <TradeActionsContext.Provider
        value={{
          doFullFetch,
          doIncrementalFetch,
          doHistoricalFetch,
          clearCache,
          resolveAccountNames,
        }}
      >
        {children}
      </TradeActionsContext.Provider>
    </TradeDataContext.Provider>
  );
};
