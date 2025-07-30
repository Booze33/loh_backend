import { prisma } from '../utils/prisma.js'
import crypto from 'crypto'

export const createWebhookSubscription = async (
  userId: string,
  provider: string,
  resourceId: string,
  callbackPath: string
) => {
  const secret = crypto.randomBytes(16).toString('hex')
  const callbackUrl = `${process.env.BASE_URL}${callbackPath}`

  return prisma.webhookSubscription.create({
    data: {
      userId,
      provider,
      resourceId,
      callbackUrl,
      secret
    }
  })
}

export const verifyWebhookSignature = (
  secret: string,
  signature: string,
  body: string
) => {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = `sha256=${hmac.update(body).digest('hex')}`
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
}

export const storeWebhookEvent = async (
  subscriptionId: string,
  provider: string,
  eventType: string,
  payload: any
) => {
  return prisma.webhookEvent.create({
    data: {
      subscriptionId,
      provider,
      eventType,
      payload
    }
  })
}