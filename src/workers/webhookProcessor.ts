import { prisma } from '../utils/prisma.js'
import { sendNotification } from '../services/notificationService.js'

export async function processWebhookEvents() {
  const unprocessedEvents = await prisma.webhookEvent.findMany({
    where: { processed: false },
    include: { subscription: true },
    take: 10
  })

  for (const event of unprocessedEvents) {
    try {
      switch (event.provider) {
        case 'google':
          await handleGoogleEvent(event)
          break
        case 'slack':
          await handleSlackEvent(event)
          break
      }

      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processed: true }
      })
    } catch (error) {
      console.error(`Failed to process event ${event.id}:`, error)
    }
  }
}

async function handleGoogleEvent(event: any) {
  const payload = event.payload
  
  if (payload.headers?.['X-Goog-Resource-State'] === 'exists') {
    const calendarId = payload.headers?.['X-Goog-Resource-Id']
    const eventId = payload.headers?.['X-Goog-Resource-Id']

    await sendNotification(event.subscription.userId, {
      title: 'Calendar updated',
      body: `An event in your calendar was modified`,
      data: { calendarId, eventId }
    })
  }
}

async function handleSlackEvent(event: any) {
  const payload = event.payload;
  
  if (payload.event?.type === 'message') {
    await sendNotification(event.subscription.userId, {
      title: `New message in ${payload.event.channel}`,
      body: payload.event.text || 'No content',
      data: {
        type: 'slack_message',
        channel: payload.event.channel,
        timestamp: payload.event.ts
      }
    });
  }
}
