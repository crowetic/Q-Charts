import React, { useMemo } from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Box, useTheme } from '@mui/material';

export interface Candle {
  x: number; // timestamp
  y: [number, number, number, number]; // [open, high, low, close]
  volume?: number;
}

interface Props {
  candles: Candle[];
  showSMA?: boolean;
  themeMode?: 'dark' | 'light';
  background?: string;
  textColor?: string;
  pairLabel?: string; // e.g. 'LTC'
  interval?: number;
}

function calculateSMA(data: Candle[], windowSize = 7) {
  const sma = [];
  for (let i = windowSize - 1; i < data.length; i++) {
    const sum = data
      .slice(i - windowSize + 1, i + 1)
      .reduce((acc, c) => acc + c.y[3], 0);
    sma.push({ x: data[i].x, y: sum / windowSize });
  }
  return sma;
}

function calculateRSI(data: Candle[], period = 14) {
  // not enough data → no RSI
  if (data.length < period + 1) return [];

  const closes = data.map((c) => c.y[3]);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }

  const rsi: { x: number; y: number }[] = [];
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  // first RSI datapoint at data[period]
  rsi.push({
    x: data[period].x,
    y: 100 - 100 / (1 + avgGain / (avgLoss || 1)),
  });

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs = avgGain / (avgLoss || 1);
    rsi.push({ x: data[i + 1].x, y: 100 - 100 / (1 + rs) });
  }

  return rsi;
}

const QortCandlestickChart: React.FC<Props> = ({
  candles,
  showSMA = true,
  themeMode = 'dark',
  background = '#10161c',
  textColor = '#fff',
  pairLabel = 'LTC',
  interval = 60 * 60 * 1000,
}) => {
  const smaData = showSMA ? calculateSMA(candles, 7) : [];
  const intervalLabel = interval === 24 * 60 * 60 * 1000 ? '1d' : '1h';
  const theme = useTheme();
  const volumeData = useMemo(
    () => candles.map((c) => ({ x: c.x, y: c.volume })),
    [candles]
  );
  const rsiData = useMemo(() => calculateRSI(candles, 14), [candles]);

  const series = [
    { name: 'Price', type: 'candlestick', data: candles, yAxis: 0 },
    ...(showSMA && smaData.length
      ? [{ name: 'SMA (7)', type: 'line', data: smaData, yAxis: 0 }]
      : []),
    { name: 'Volume', type: 'bar', data: volumeData, yAxis: 1 },
    { name: 'RSI (14)', type: 'line', data: rsiData, yAxis: 2 },
  ];

  const options: ApexOptions = {
    chart: {
      type: 'candlestick',
      width: '100%',
      height: '100%',
      background: background,
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: true,
          // zoom: true,
          pan: true,
          reset: true,
        },
        autoSelected: 'zoom',
      },
      zoom: {
        enabled: true,
        type: 'xy',
        autoScaleYaxis: true,
      },
      animations: { enabled: true },
    },
    title: {
      text: `QORT/${pairLabel} Price (${intervalLabel} Candles) (${themeMode === 'dark' ? 'Dark' : 'Light'} Theme)`,
      align: 'center',
      style: {
        color: theme.palette.text.primary,
        fontWeight: 700,
        fontSize: '1.11rem',
      },
      offsetY: 8, //adjust if necessary
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: theme.palette.text.primary } },
      axisBorder: { color: textColor },
      axisTicks: { color: textColor },
      tooltip: { enabled: true },
    },
    yaxis: {
      tooltip: { enabled: true },
      labels: { style: { colors: theme.palette.text.primary } },
      axisBorder: { color: textColor },
      axisTicks: { color: textColor },
    },
    theme: { mode: themeMode },
    legend: {
      labels: { colors: theme.palette.text.primary },
      show: showSMA && smaData.length > 0,
    },
    grid: {
      borderColor: themeMode === 'dark' ? '#333' : '#ccc',
    },
    tooltip: {
      theme: themeMode,
    },
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: { xs: 280, sm: 420, md: 540, lg: '60vh' },
        minHeight: 240,
        maxWidth: '100vw',
      }}
    >
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

export default QortCandlestickChart;
