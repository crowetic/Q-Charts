import React from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';
import { Box, useTheme } from '@mui/material';

export interface Candle {
  x: number; // timestamp
  y: [number, number, number, number]; // [open, high, low, close]
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
    // plotOptions: {
    //   candlestick: {
    //     // Width can be a number (pixels) or a string (percentage)
    //     // e.g., width: 8 (pixels) or width: '80%' (of grid slot)
    //     // @ts-expect-error: width is supported at runtime even if not in types
    //     width: '100%',
    //   },
    // },
  };

  const series = [
    { name: 'Price', type: 'candlestick', data: candles },
    ...(showSMA && smaData.length
      ? [{ name: `SMA (7)`, type: 'line', data: smaData }]
      : []),
  ];

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
