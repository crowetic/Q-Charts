import { useTradeData } from '../context/TradeDataProvider';
import { Box, Typography, Divider, Pagination, useTheme } from '@mui/material';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';

const PER_PAGE = 100;

export default function Stats() {
  const theme = useTheme();
  const { allChainTrades, accountNames, namesLoading, namesRemaining } =
    useTradeData();
  const [page, setPage] = useState(1);

  const mergedRawTrades = useMemo(() => {
    return Object.entries(allChainTrades)
      .flatMap(([chain, trades]) => trades.map((t) => ({ ...t, chain })))
      .sort((a, b) => b.tradeTimestamp - a.tradeTimestamp);
  }, [allChainTrades]);

  const totalPages = Math.ceil(mergedRawTrades.length / PER_PAGE);
  const tradesOnPage = mergedRawTrades.slice(
    (page - 1) * PER_PAGE,
    page * PER_PAGE
  );

  if (mergedRawTrades.length === 0) {
    return <div>Loading…</div>;
  }

  return (
    <Box p={2}>
      <Typography variant="h4" gutterBottom>
        Merged Trade History
      </Typography>
      <Divider sx={{ mb: 2 }} />

      {namesLoading && (
        <Typography variant="body2" color="warning.main" sx={{ mb: 2 }}>
          Resolving account names… {namesRemaining} remaining
        </Typography>
      )}

      {tradesOnPage.map((trade, idx) => {
        const date = format(trade.tradeTimestamp, 'yyyy-MM-dd HH:mm');
        const buyerAddr = trade.buyerReceivingAddress ?? '';
        const sellerAddr = trade.sellerAddress ?? '';
        const buyerName = buyerAddr ? accountNames[buyerAddr] || '—' : '—';
        const sellerName = sellerAddr ? accountNames[sellerAddr] || '—' : '—';

        return (
          <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
            <span style={{ color: theme.palette.error.main }}>
              <strong>{sellerName}</strong> ({sellerAddr})
            </span>{' '}
            →{' '}
            <span style={{ color: theme.palette.success.main }}>
              <strong>{buyerName}</strong> ({buyerAddr})
            </span>{' '}
            sold{' '}
            <strong>
              {parseFloat(trade.qortAmount).toFixed(4)} QORT →{' '}
              {parseFloat(trade.foreignAmount).toFixed(4)}
            </strong>{' '}
            <strong>{trade.chain}</strong> at {date}
          </Typography>
        );
      })}

      <Divider sx={{ my: 2 }} />

      <Pagination
        count={totalPages}
        page={page}
        onChange={(_, val) => setPage(val)}
        variant="outlined"
        shape="rounded"
      />
    </Box>
  );
}
