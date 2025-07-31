import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { getNotification, getPreferences, markAsRead, updatePreferences } from '../controllers/notifications.ts';

const notificationRoutes = new Hono();

notificationRoutes.get('/', authMiddleware, getNotification);
notificationRoutes.patch('/:id/read', authMiddleware, markAsRead);
notificationRoutes.get('/preferences', authMiddleware, getPreferences);
notificationRoutes.put('/preferences', authMiddleware, updatePreferences);

export default notificationRoutes;