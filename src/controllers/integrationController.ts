import { Context } from 'hono'
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { createWebhookSubscription } from '../services/webhookService.js'
import crypto from 'crypto'

const prisma = new PrismaClient()

export const googleCalendar = async (c: Context) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { summary, start, end } = body

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'google' }
    })

    if (!token) return c.json({ error: 'Not authenticated with Google' }, 401)

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    auth.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken
    })

    const calendar = google.calendar({ version: 'v3', auth })

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        start: { dateTime: start },
        end: { dateTime: end }
      }
    })

    return c.json(event.data)
  } catch (error) {
    console.error('Error google calendar failed:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const googleWatchCalendar = async (c: Context) => {
  try {
    const user = c.get('user')
    const { calendarId = 'primary' } = await c.req.json()

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'google' }
    })

    if (!token) return c.json({ error: 'Google not connected' }, 401)

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    )

    auth.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken
    })

    const calendar = google.calendar({ version: 'v3', auth })

    const sub = await createWebhookSubscription(
      user.id,
      'google',
      calendarId,
      '/webhooks/google/calendar'
    )

    const res = await calendar.events.watch({
      calendarId,
      requestBody: {
        id: crypto.randomUUID(),
        type: 'web_hook',
        address: sub.callbackUrl,
        token: sub.secret
      }
    })

    await prisma.webhookSubscription.update({
      where: { id: sub.id },
      data: { 
        providerId: res.data.id, 
        expiresAt: new Date(Number(res.data.expiration!))
      }
    })

    return c.json({
      subscription: {
        id: sub.id,
        expiresAt: res.data.expiration
      }
    })
  } catch (error) {
    console.error('Watch error:', error)
    return c.json({ error: 'Failed to create watch' }, 500)
  }
}