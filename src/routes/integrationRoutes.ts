import { Hono } from 'hono'
import { googleCalendar, googleWatchCalendar } from '../controllers/integrationController.js'
import { authMiddleware } from '../middleware/auth.js'
import { getWeatherForecast } from '../controllers/integrations/weather.js'
import { createNotionPage, searchNotionPages } from '../controllers/integrations/notion.js'
import { getSlackMessages, sendSlackMessage } from '../controllers/integrations/slack.js'
import { getRecentEmail, sendEmail } from '../controllers/integrations/gmail.js'
import { googleCalendarNotification, googleCalendarOwnership } from '../controllers/webhooks/google.js'
import { slackWebhook } from '../controllers/webhooks/slack.js'
import { Email } from '../types/intergrations/integrationTypes.js'

const integrationRoutes = new Hono()

integrationRoutes.get('/webhooks/google/calendar', googleCalendarOwnership)
integrationRoutes.post('/webhooks/google/calendar', googleCalendarNotification)
integrationRoutes.post('/webhooks/slack/events', slackWebhook)

integrationRoutes.post('/google/calendar', authMiddleware, googleCalendar)
integrationRoutes.post('/google/watch', authMiddleware, googleWatchCalendar)
integrationRoutes.get('/weather/forecast', authMiddleware, getWeatherForecast)
integrationRoutes.get('/notion/search', authMiddleware, searchNotionPages)
integrationRoutes.post('/notion/pages', authMiddleware, createNotionPage)
integrationRoutes.post('/slack/send', authMiddleware, sendSlackMessage)
integrationRoutes.get('/slack/messages', authMiddleware, getSlackMessages)
integrationRoutes.get('/gmail/emails', authMiddleware, getRecentEmail)
integrationRoutes.post('/gmail/send', authMiddleware, sendEmail)

export default integrationRoutesmessages.list({
  userId: 'me',
  maxResults: Number(maxResults)
})

const emails: Email[] = await Promise.all(
  res.data.messages?.map(async (m) => {
    const msg = await gmailClient.users.messages.get({
      userId: 'me',
      id: m.id!
    })
    const payload = msg.data.payload!
    const headers = payload.headers!
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject'
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender'
    return {
      id: m.id!,
      subject,
      from,
      snippet: msg.data.snippet!,
      date: headers.find(h => h.name === 'Date')?.value || ''
    }
  }) || []
)
