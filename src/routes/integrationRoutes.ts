import { Hono } from 'hono';
import { googleCalendar } from '../controllers/integrationController';
import { authMiddleware } from '../middleware/auth.ts';
import { getWeatherForcast } from '../controllers/integrations/weather.ts';
import { createNotionPage, searchNotionPages } from '../controllers/integrations/notion.ts';
import { getSlackMessages, sendSlackMessage } from '../controllers/integrations/slack.ts';
import { getRecentEmail, sendEmail } from '../controllers/integrations/gmail.ts';

const integrationRoutes = new Hono();

integrationRoutes.post('/google/events', authMiddleware, googleCalendar);
integrationRoutes.post('/weather/forecast', authMiddleware, getWeatherForcast);
integrationRoutes.post('/notion/search', authMiddleware, searchNotionPages);
integrationRoutes.post('/notion/pages', authMiddleware, createNotionPage);
integrationRoutes.post('/slack/send', authMiddleware, sendSlackMessage);
integrationRoutes.post('/slack/messages', authMiddleware, getSlackMessages);
integrationRoutes.post('/gmail/emails', authMiddleware, getRecentEmail);
integrationRoutes.post('/gmail/send', authMiddleware, sendEmail);

export default integrationRoutes;