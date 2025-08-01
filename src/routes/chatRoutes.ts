import { Hono } from 'hono';
import { createChatSession, getChatSessions, sendMessageToSession } from '../controllers/chatController';
import { authMiddleware } from '../middleware/auth.ts';

const chatRoutes = new Hono();

chatRoutes.post('/sessions', authMiddleware, createChatSession);
chatRoutes.get('/sessions', authMiddleware, getChatSessions);
chatRoutes.post('/sessions/:id/messages', authMiddleware, sendMessageToSession);

export default chatRoutes;