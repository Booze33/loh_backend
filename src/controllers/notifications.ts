import { Context } from "hono"
import { prisma } from "../utils/prisma";

export const getNotification = async (c: Context) => {
  try {
    const user = c.get('user');
    const { limit = 20, offset = 0 } = c.req.query();

    const results = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    return c.json({ notifications: results });
  } catch (error) {
    console.error('Error getting notifications:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const markAsRead = async (c: Context) => {
  const user = c.get('user');
  const { id } = c.req.param();

  await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { isRead: true }
  });

  return c.json({ success: true });
}

export const getPreferences = async (c: Context) => {
  const user = c.get('user');
  const prefs = await prisma.notificationPreference.findUnique({
    where: { userId: user.id }
  });

  return c.json(prefs || {
    email: true,
    push: true,
    inApp: true,
    webhook: false
  });
}

export const updatePreferences = async (c: Context) => {
  const user = c.get('user');
  const data = await c.req.json();

  const prefs = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data
  });

  return c.json(prefs);
}