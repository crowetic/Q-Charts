import React, { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Box } from '@mui/material';
import { Candle } from '../utils/qortTrades';

interface Props {
  candles: Candle[];
  showSMA?: boolean;
  themeMode: 'light' | 'dark';
  background: string;
  textColor: string;
  pairLabel: string;
  interval: number;
}

// helper for SMA
function rawSMA(data: Candle[], period = 7) {
  const out: { x: number; y: number }[] = [];
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((sum, c) => sum + c.y[3], 0) / period;
    out.push({ x: data[i].x, y: avg });
  }
  return out;
}

export const QortMultiChart: React.FC<Props> = ({
  candles,
  showSMA = true,
  themeMode,
  background,
  textColor,
  pairLabel,
  interval,
}) => {
  // compute price bounds
  const [priceMin, priceMax] = useMemo(() => {
    if (!candles.length) return [0, 1];
    const highs = candles.map((c) => c.y[1]);
    const lows = candles.map((c) => c.y[2]);
    return [Math.min(...lows), Math.max(...highs)];
  }, [candles]);
  const pad = (priceMax - priceMin) * 0.02;

  // volume data for tooltip
  const volumeData = useMemo(
    () => candles.map((c) => ({ x: c.x, y: c.volume ?? 0 })),
    [candles]
  );

  // SMA padded series
  const smaRaw = useMemo(() => rawSMA(candles, 7), [candles]);
  const smaSeries = useMemo(
    () =>
      candles.map((c) => {
        const pt = smaRaw.find((s) => s.x === c.x);
        return { x: c.x, y: pt ? pt.y : null };
      }),
    [candles, smaRaw]
  );

  // combined series (candlestick + SMA)
  const series = useMemo(
    () => [
      { name: 'Price', type: 'candlestick', data: candles },
      ...(showSMA ? [{ name: 'SMA(7)', type: 'line', data: smaSeries }] : []),
    ],
    [candles, smaSeries, showSMA]
  );

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: 'candlestick',
        background,
        toolbar: { show: true, autoSelected: 'zoom' },
        zoom: { enabled: true, type: 'xy', autoScaleYaxis: false },
      },
      title: {
        text: `QORT/${pairLabel} — ${interval === 864e5 ? '1d' : '1h'} candles`,
        align: 'center',
        style: { color: textColor },
      },
      xaxis: { type: 'datetime', labels: { style: { colors: textColor } } },
      yaxis: [
        {
          min: priceMin - pad,
          max: priceMax + pad,
          tickAmount: 6,
          labels: {
            style: { colors: textColor },
            formatter: (v) => v.toFixed(8),
          },
          title: { text: 'Price' },
        },
      ],
      tooltip: {
        shared: false,
        custom: ({ dataPointIndex, w }) => {
          const ohlc = w.config.series[0].data[dataPointIndex].y;
          const vol = volumeData[dataPointIndex]?.y ?? 0;
          return `
            <div style="padding:8px;">
              <div>Open : ${ohlc[0].toFixed(8)}</div>
              <div>High : ${ohlc[1].toFixed(8)}</div>
              <div>Low  : ${ohlc[2].toFixed(8)}</div>
              <div>Close: ${ohlc[3].toFixed(8)}</div>
              <div>Volume: ${vol.toLocaleString()}</div>
            </div>
          `;
        },
        theme: themeMode,
      },
      plotOptions: { bar: { columnWidth: '80%' } },
      dataLabels: { enabled: false },
      theme: { mode: themeMode },
    }),
    [
      background,
      pairLabel,
      interval,
      priceMin,
      priceMax,
      pad,
      textColor,
      themeMode,
      volumeData,
    ]
  );

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <Chart
        options={options}
        series={series}
        type="candlestick"
        width="100%"
        height="100%"
      />
    </Box>
  );
};

export default QortMultiChart;
