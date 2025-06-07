import React from 'react';
import Chart from 'react-apexcharts';
import { ApexOptions } from 'apexcharts';

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
  // const [yMin, setYMin] = useState(undefined);
  // const [yMax, setYMax] = useState(undefined);
  const options: ApexOptions = {
    chart: {
      type: 'candlestick',
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
      style: { color: textColor, fontWeight: 700, fontSize: '1.11rem' },
      offsetY: 8, //adjust if necessary
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: textColor } },
      axisBorder: { color: textColor },
      axisTicks: { color: textColor },
      tooltip: { enabled: true },
    },
    yaxis: {
      tooltip: { enabled: true },
      labels: { style: { colors: textColor } },
      axisBorder: { color: textColor },
      axisTicks: { color: textColor },
    },
    theme: { mode: themeMode },
    legend: {
      labels: { colors: textColor },
      show: showSMA && smaData.length > 0,
    },
    grid: {
      borderColor: themeMode === 'dark' ? '#333' : '#ccc',
    },
    tooltip: {
      theme: themeMode,
    },
    responsive: [
      {
        breakpoint: 800,
        options: {
          chart: { height: 320 },
          title: { style: { fontSize: '1rem' } },
        },
      },
      {
        breakpoint: 1200,
        options: {
          chart: { height: 400 },
        },
      },
    ],
  };

  const series = [
    { name: 'Price', type: 'candlestick', data: candles },
    ...(showSMA && smaData.length
      ? [{ name: `SMA (7)`, type: 'line', data: smaData }]
      : []),
  ];

  return (
    <Chart options={options} series={series} type="candlestick" height={420} />
  );
};

export default QortCandlestickChart;
