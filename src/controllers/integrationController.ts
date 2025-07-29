import { Context } from "hono";
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';

const prisma = new PrismaClient();

export const googleCalendar = async (c: Context) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const { summary, start, end } = body;

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'google' }
    });

    if (!token) return c.json({ error: 'Not authenticated with Google' }, 401);

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    auth.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        start: { dateTime: start },
        end: { dateTime: end }
      }
    });

    return c.json(event.data);
  } catch (error) {
    console.error('Error google calendar faile:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}