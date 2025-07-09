import { Outlet } from 'react-router-dom';
import { useIframe } from '../hooks/useIframeListener';
import Header from '../components/Header';

const Layout = () => {
  useIframe();

  return (
    <>
      <Header />
      <main>
        <Outlet />
      </main>
    </>
  );
};

export default Layout;
