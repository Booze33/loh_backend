import 'dotenv/config'
import app from './app.js'
import { serve } from '@hono/node-server'
import { processWebhookEvents } from './workers/webhookProcessor.js'

const runningPort = parseInt(process.env.PORT || '3000')

setInterval(() => {
  processWebhookEvents().catch(console.error)
}, 30000)

serve({
  fetch: app.fetch,
  port: runningPort
}, (info: { port: number }) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
