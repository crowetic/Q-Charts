import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

interface FetchAllTradesModalProps {
  open: boolean;
  onClose: () => void;
  isFetching: boolean;
  progress: number;
  total?: number | null;
  error?: string | null;
  chain: string;
}

const FetchAllTradesModal: React.FC<FetchAllTradesModalProps> = ({
  open,
  onClose,
  isFetching,
  progress,
  total,
  error,
  chain,
}) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Fetching All {chain} Trades</DialogTitle>
      <DialogContent>
        {isFetching ? (
          <>
            <Typography gutterBottom>
              Obtaining all trades for <b>{chain}</b>.<br />
              This could take a while, please be patient...
            </Typography>
            <Typography gutterBottom>
              <b>{progress}</b> trades fetched{total ? ` / ${total}` : ''}.
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
          color={isFetching ? 'inherit' : 'primary'}
          variant="contained"
        >
          {isFetching ? 'Hide' : 'Close'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FetchAllTradesModal;
