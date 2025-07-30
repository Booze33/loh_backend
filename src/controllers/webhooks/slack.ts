import { Context } from 'hono'
import { storeWebhookEvent } from '../../services/webhookService.js'
import { prisma } from '../../utils/prisma.js'
import crypto from 'crypto'

export const slackWebhook = async (c: Context) => {
  try {
    const payload = await c.req.json()

    // URL verification challenge
    if (payload.type === 'url_verification') {
      return c.json({ challenge: payload.challenge })
    }

    // Verify signing secret
    const signature = c.req.header('x-slack-signature')
    const timestamp = c.req.header('x-slack-request-timestamp')
    const signingSecret = process.env.SLACK_SIGNING_SECRET!

    if (!signature || !timestamp) {
      return c.json({ error: 'Missing headers' }, 401)
    }

    const body = await c.req.text()
    const sigBasestring = `v0:${timestamp}:${body}`
    const hmac = crypto.createHmac('sha256', signingSecret)
    const computedSig = `v0=${hmac.update(sigBasestring).digest('hex')}`

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSig))) {
      return c.json({ error: 'Invalid signature' }, 401)
    }

    // Store event
    const subscription = await prisma.webhookSubscription.findFirst({
      where: { provider: 'slack' }
    })

    if (!subscription) return c.json({ error: 'No subscription' }, 404)

    await storeWebhookEvent(
      subscription.id,
      'slack',
      payload.event?.type || payload.type,
      payload
    )

    // Acknowledge receipt immediately
    return c.json({ ok: true })
  } catch (error) {
    console.error('Slack webhook error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}