import { createBrowserRouter } from 'react-router-dom';
import HomePage from '@/pages/home';
import ChatPage from '@/pages/chat';
import { ROUTES } from '@/constants/routes';

export const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: <HomePage />,
  },
  {
    path: ROUTES.CHAT,
    element: <ChatPage />,
  },
]);
