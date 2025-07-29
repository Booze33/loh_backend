import { WebClient } from "@slack/web-api";
import { Context } from "hono";
import { prisma } from "../../utils/prisma";
import { SlackMessage } from "../../types/intergrations/integrationTypes";

export const sendSlackMessage = async (c: Context) => {
  try {
    const user = c.get('user');
    const { channel, text } = await c.req.json();

    const token = await prisma.oAuthToken.findFirst({
        where: { userId: user.id, provider: 'slack' }
    });

    if (!token) return c.json({ error: 'Slack not connected' }, 401);

    const client = new WebClient(token.accessToken);

    const result = await client.chat.postMessage({
    channel,
    text,
    as_user: true
    });

    return c.json({
    message: 'Message sent',
    channel: result.channel,
    ts: result.ts
    });
  } catch (error) {
    console.error('Slack error:', error);
    return c.json({ error: 'Failed to send Slack message' }, 500);
  }
}

export const getSlackMessages = async (c: Context) => {
  try {
    const user = c.get('user');
    const { channel, limit = 10 } = c.req.query();
  
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
}