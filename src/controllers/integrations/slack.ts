import { WebClient } from '@slack/web-api'
import { Context } from 'hono'
import { prisma } from '../../utils/prisma'
import { SlackMessage } from '../../types/intergrations/integrationTypes.ts'

export const sendSlackMessage = async (
  userId: string,
  channel: string,
  text: string,
  thread_ts?: string
): Promise<{ messageId: string; timestamp: string }> => {
  const token = await prisma.oAuthToken.findFirst({
    where: { userId, provider: 'slack' }
  });

  if (!token) throw new Error('Slack not connected');

  const client = new WebClient(token.accessToken);
  const result = await client.chat.postMessage({
    channel,
    text,
    thread_ts,
    as_user: true
  });

  return {
    messageId: result.ts!,
    timestamp: result.ts!
  };
};

export const sendSlackMessageEndpoint = async (c: Context) => {
  try {
    const user = c.get('user');
    const { channel, text, thread_ts } = await c.req.json();

    const result = await sendSlackMessage(user.id, channel, text, thread_ts);
    return c.json({
      message: 'Message sent',
      channel,
      ts: result.timestamp
    });
  } catch (error) {
    console.error('Slack error:', error);
    return c.json({ error: 'Failed to send Slack message' }, 500);
  }
};

export const getSlackMessages = async (c: Context) => {
  try {
    const user = c.get('user');
    const channel = c.req.query('channel');
    const limit = c.req.query('limit') || '10';

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'slack' }
    });

    if (!token) return c.json({ error: 'Slack not connected' }, 401);

    const client = new WebClient(token.accessToken);
    const result = await client.conversations.history({
      channel: channel as string,
      limit: Number(limit)
    });

    const messages: SlackMessage[] = (result.messages || []).map(m => ({
      channel: channel as string,
      text: m.text!,
      ts: m.ts!
    }));

    return c.json({ messages });
  } catch (error) {
    console.error('Slack error:', error);
    return c.json({ error: 'Failed to fetch messages' }, 500);
  }
};