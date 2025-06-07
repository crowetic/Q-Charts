import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { useAtom } from 'jotai';
import { EnumTheme, themeAtom } from '../../state/global/system';
import { lightTheme, darkTheme } from './theme';

const ThemeProviderWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [themeMode] = useAtom(themeAtom);
  const theme = React.useMemo(
    () => (themeMode === EnumTheme.LIGHT ? lightTheme : darkTheme),
    [themeMode]
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};
export default ThemeProviderWrapper;
