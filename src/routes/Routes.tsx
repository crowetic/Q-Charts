import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Layout from '../styles/Layout';
import App from '../App';
import Stats from '../pages/Stats';

// Use a custom type if you need it
interface CustomWindow extends Window {
  _qdnBase: string;
}
const customWindow = window as unknown as CustomWindow;
const baseUrl = customWindow?._qdnBase || '';

export function Routes() {
  const router = createBrowserRouter(
    [
      {
        path: '/',
        element: <Layout />,
        children: [
          {
            index: true,
            element: <App />,
          },
          {
            path: 'stats',
            element: <Stats />,
          },
        ],
      },
    ],
    {
      basename: baseUrl,
    }
  );

  return <RouterProvider router={router} />;
}
