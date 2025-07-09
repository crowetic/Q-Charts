import { Link as RouterLink } from 'react-router-dom';
import { AppBar, Toolbar, Button, Typography } from '@mui/material';

export default function Header() {
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Q-Charts
        </Typography>
        <Button color="inherit" component={RouterLink} to="/">
          Home
        </Button>
        <Button color="inherit" component={RouterLink} to="/stats">
          History
        </Button>
      </Toolbar>
    </AppBar>
  );
}
