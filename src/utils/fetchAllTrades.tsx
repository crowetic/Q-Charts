/* eslint-disable prettier/prettier */
import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

export interface Trade {
  tradeTimestamp: number;
  qortAmount: string;
  btcAmount: string;
  foreignAmount: string;
}

interface FetchAllTradesModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (allTrades: Trade[]) => void;
  foreignBlockchain: string;
  batchSize?: number;
  minTimestamp?: number;
}

const FetchAllTradesModal: React.FC<FetchAllTradesModalProps> = ({
  open,
  onClose,
  onComplete,
  foreignBlockchain,
  batchSize = 200,
  minTimestamp = 0,
}) => {
  const [progress, setProgress] = useState(0);
  const [totalFetched, setTotalFetched] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!open) return;

    async function fetchAllTrades() {
      setError(null);
      setProgress(0);
      setTotalFetched(0);
      setIsFetching(true);

      let allTrades: Trade[] = [];
      let offset = 0;
      let keepFetching = true;

      try {
        while (keepFetching && !cancelled) {
          const params = new URLSearchParams({
            foreignBlockchain,
            offset: offset.toString(),
            limit: batchSize.toString(),
            minimumTimestamp: minTimestamp.toString(),
            reverse: 'false',
          });
          const url = `/crosschain/trades?${params.toString()}`;
          const resp = await fetch(url);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const trades: Trade[] = await resp.json();

          allTrades = allTrades.concat(trades);
          setTotalFetched(allTrades.length);
          setProgress(trades.length);

          offset += trades.length;
          if (trades.length < batchSize) keepFetching = false;
        }
        if (!cancelled) {
          onComplete(allTrades);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }

    fetchAllTrades();

    return () => {
      cancelled = true;
    };
  }, [open, foreignBlockchain, batchSize, minTimestamp, onComplete]);

  return (
    <Dialog open={open} onClose={isFetching ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Fetching All Trades</DialogTitle>
      <DialogContent>
        {isFetching ? (
          <>
            <Typography gutterBottom>
              Obtaining all trades for <b>{foreignBlockchain}</b>.<br />
              This could take a while, please be patient...
            </Typography>
            <Typography gutterBottom>
              <b>{totalFetched}</b> trades fetched (last batch: {progress})
            </Typography>
            <CircularProgress />
          </>
        ) : error ? (
          <Typography color="error" gutterBottom>
            Error: {error}
          </Typography>
        ) : (
          <Typography color="success.main" gutterBottom>
            Fetch complete.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          onClick={onClose}
          disabled={isFetching}
          variant="contained"
          color={isFetching ? 'inherit' : 'primary'}
        >
          {isFetching ? 'Fetching...' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FetchAllTradesModal;
