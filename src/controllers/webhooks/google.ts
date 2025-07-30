import { Context } from 'hono'
import { prisma } from '../../utils/prisma.js'
import { storeWebhookEvent, verifyWebhookSignature } from '../../services/webhookService.js'

export const googleCalendarOwnership = async (c: Context) => {
  const challenge = c.req.query('hub.challenge')
  if (!challenge) return c.text('Missing challenge', 400)

  const topic = c.req.query('hub.topic')
  const subscription = await prisma.webhookSubscription.findFirst({
    where: {
      provider: 'google',
      callbackUrl: c.req.url.split('?')[0]
    }
  })

  if (!subscription) return c.text('Not subscribed', 404)

  return c.text(challenge)
}

export const googleCalendarNotification = async (c: Context) => {
  try {
    const subscription = await prisma.webhookSubscription.findFirst({
      where: {
        provider: 'google',
        callbackUrl: c.req.url
      }
    })

    if (!subscription) return c.text('Not found', 404)

    if (subscription.secret) {
      const signature = c.req.header('X-Goog-Signature')
      if (!signature) return c.text('Unauthorized', 401)

      const body = await c.req.text()
      if (!verifyWebhookSignature(subscription.secret, signature, body)) {
        return c.text('Invalid signature', 401)
      }
    }

    const payload = await c.req.json()
    await storeWebhookEvent(
      subscription.id,
      'google',
      payload.headers?.['X-Goog-Resource-State'] || 'unknown',
      payload
    )

    return c.text('OK', 200)
  } catch (error) {
    console.error('Google webhook error:', error)
    return c.text('Internal server error', 500)
  }
}