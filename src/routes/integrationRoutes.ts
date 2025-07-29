import { Hono } from 'hono';
import { googleCalendar } from '../controllers/integrationController';
import { authMiddleware } from '../middleware/auth.ts';

const integrationRoutes = new Hono();

integrationRoutes.post('/calendar/events', authMiddleware, googleCalendar);

export default integrationRoutes;