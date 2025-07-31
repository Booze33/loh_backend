import { prisma } from "../utils/prisma";
import { WebSocketServer } from 'ws';
import { transporter } from './mailer';
import type { User } from '@prisma/client';

const activeConnections = new Map<string, WebSocket>();

export const sendNotification = async (
  userId: string,
  payload: {
    title: string;
    body: string;
    data?: any;
  }
) => {
  const notification = await prisma.notification.create({
    data: {
      userId,
      title: payload.title,
      body: payload.body,
      data: payload.data || {}
    }
  });

  // 2. Get user preferences
  const preferences = await prisma.notificationPreference.findUnique({
    where: { userId }
  }) || {
    email: true,
    push: true,
    inApp: true,
    webhook: false
  };

  // 3. Deliver via preferred channels
  const deliveryPromises = [];

  if (preferences.inApp) {
    deliveryPromises.push(sendInAppNotification(userId, notification));
  }

  if (preferences.email) {
    deliveryPromises.push(sendEmailNotification(userId, notification));
  }

  if (preferences.push) {
    deliveryPromises.push(sendPushNotification(userId, notification));
  }

  await Promise.allSettled(deliveryPromises);
  return notification;
}

async function sendInAppNotification(userId: string, notification: any) {
  const ws = activeConnections.get(userId);
  if (ws?.readyState === 1) { // 1 = OPEN
    ws.send(JSON.stringify({
      type: 'notification',
      data: notification
    }));
  }
}

async function sendInAppNotification(userId: string, notification: any) {
  const ws = activeConnections.get(userId);
  if (ws?.readyState === 1) { // 1 = OPEN
    ws.send(JSON.stringify({
      type: 'notification',
      data: notification
    }));
  }
}

async function sendEmailNotification(userId: string, notification: any) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.email) return;

  await transporter.sendMail({
    to: user.email,
    subject: notification.title,
    html: `
      <h1>${notification.title}</h1>
      <p>${notification.body}</p>
      ${notification.data ? `<pre>${JSON.stringify(notification.data, null, 2)}</pre>` : ''}
      <p><small>You can adjust notification settings in your account preferences.</small></p>
    `
  });
}

async function sendPushNotification(userId: string, notification: any) {
  // Implementation would use Firebase Admin SDK or similar
  // This is a simplified example
  console.log(`Would send push notification to user ${userId}`);
}
  