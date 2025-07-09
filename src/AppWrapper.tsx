import { Routes } from './routes/Routes.tsx';
import { GlobalProvider } from 'qapp-core';
import { publicSalt } from './qapp-config.ts';
import { TradeDataProvider } from './context/TradeDataProvider';

export const AppWrapper = () => {
  return (
    <GlobalProvider
      config={{
        appName: 'Q-Charts',
        auth: {
          balanceSetting: {
            interval: 180000,
            onlyOnMount: false,
          },
          authenticateOnMount: true,
        },
        publicSalt: publicSalt,
      }}
    >
      <TradeDataProvider>
        <Routes />
      </TradeDataProvider>
    </GlobalProvider>
  );
};
