import { ROUTES } from "@/constants/routes";
import ChatPage from "@/pages/chat";
import ChatRedesignPage from "@/pages/chat-redesign";
import HomePage from "@/pages/home";
import { createBrowserRouter } from "react-router-dom";

export const router = createBrowserRouter([
	{
		path: ROUTES.HOME,
		element: <HomePage />,
	},
	{
		path: ROUTES.CHAT,
		element: <ChatPage />,
	},
	{
		path: ROUTES.CHAT_REDESIGN,
		element: <ChatRedesignPage />,
	},
	{
		path: ROUTES.CHAT_REDSIGN,
		element: <ChatRedesignPage />,
	},
]);
