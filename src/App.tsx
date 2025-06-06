import React, { useEffect, useState } from 'react';
import QortCandlestickChart, {
  Candle,
} from './components/QortCandlestickChart';
import { fetchTrades, aggregateCandles } from './utils/qortTrades';

const DEFAULT_BLOCKCHAIN = 'LITECOIN';
const ONE_HOUR = 60 * 60 * 1000;

const App: React.FC = () => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [interval, setInterval] = useState(ONE_HOUR);
  const [minTimestamp, setMinTimestamp] = useState(
    Date.now() - 30 * 24 * ONE_HOUR
  ); // 30 days ago

  // You’d call this whenever the user changes range, interval, etc
  useEffect(() => {
    let cancelled = false;
    fetchTrades({
      foreignBlockchain: DEFAULT_BLOCKCHAIN,
      minimumTimestamp: minTimestamp,
      limit: 1000,
      offset: 0,
      reverse: true,
    })
      .then((trades) => {
        if (!cancelled) setCandles(aggregateCandles(trades, interval));
      })
      .catch((e) => {
        if (!cancelled) setCandles([]);

        console.error(e);
      });
    return () => {
      cancelled = true;
    };
  }, [interval, minTimestamp]);

  // Add controls as needed for changing interval and time range
  const [blockchain, setBlockchain] = useState(DEFAULT_BLOCKCHAIN);
  return (
    <div style={{ background: '#10161c', minHeight: '100vh', padding: 32 }}>
      <div style={{ marginBottom: 16 }}>
        <label>
          Pair:&nbsp;
          <select
            value={blockchain}
            onChange={(e) => setBlockchain(e.target.value)}
          >
            <option value="LITECOIN">LTC</option>
            <option value="RAVENCOIN">RVN</option>
            <option value="BITCOIN">BTC</option>
            <option value="DIGIBYTE">DGB</option>
            <option value="PIRATECHAIN">ARRR</option>
            <option value="DOGECOIN">DOGE</option>
          </select>
        </label>
        &nbsp; Interval:&nbsp;
        <button onClick={() => setInterval(ONE_HOUR)}>1H</button>
        <button onClick={() => setInterval(24 * ONE_HOUR)}>1D</button>
        &nbsp; Start Date:&nbsp;
        <input
          type="date"
          value={new Date(minTimestamp).toISOString().slice(0, 10)}
          onChange={(e) => setMinTimestamp(new Date(e.target.value).getTime())}
        />
      </div>
      <QortCandlestickChart candles={candles} />
    </div>
  );
};
export default App;
