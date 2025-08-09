import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { getSlackMessages, sendSlackMessageEndpoint } from '../controllers/integrations/slack'
import { getRecentEmail, sendEmailEndpoint } from '../controllers/integrations/gmail'

const integrationRoutes = new Hono()

integrationRoutes.post('/slack/send', authMiddleware, sendSlackMessageEndpoint)
integrationRoutes.get('/slack/messages', authMiddleware, getSlackMessages)
integrationRoutes.get('/gmail/emails', authMiddleware, getRecentEmail)
integrationRoutes.post('/gmail/send', authMiddleware, sendEmailEndpoint)

export default integrationRoutes