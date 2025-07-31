import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { getSlackMessages, sendSlackMessage } from '../controllers/integrations/slack'
import { getRecentEmail, sendEmail } from '../controllers/integrations/gmail'

const integrationRoutes = new Hono()

integrationRoutes.post('/slack/send', authMiddleware, sendSlackMessage)
integrationRoutes.get('/slack/messages', authMiddleware, getSlackMessages)
integrationRoutes.get('/gmail/emails', authMiddleware, getRecentEmail)
integrationRoutes.post('/gmail/send', authMiddleware, sendEmail)

export default integrationRoutes