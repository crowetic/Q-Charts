import React from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';

export interface Candle {
  x: number;
  y: [number, number, number, number];
}

interface Props {
  candles: Candle[];
}

const QortCandlestickChart: React.FC<Props> = ({ candles }) => {
  const options: ApexOptions = {
    chart: {
      type: 'candlestick',
      height: 420,
      background: '#181e24',
      toolbar: { show: true },
    },
    title: {
      text: 'QORT/LTC Price (1h Candles)',
      align: 'left',
      style: { color: '#fff' },
    },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#ccc' } },
    },
    yaxis: {
      tooltip: { enabled: true },
      labels: { style: { colors: '#ccc' } },
    },
    theme: { mode: 'dark' },
  };

  const series = [
    {
      data: candles,
    },
  ];

  return (
    <Chart options={options} series={series} type="candlestick" height={420} />
  );
};

export default QortCandlestickChart;
