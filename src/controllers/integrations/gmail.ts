import { Context } from "hono";
import { prisma } from "../../utils/prisma";
import { google } from "googleapis";
import { Email } from "../../types/intergrations/integrationTypes";

export const getRecentEmail = async (c: Context) => {
  try {
    const user = c.get('user');
    const { maxResults = 10 } = c.req.query();
  
    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'google' }
    });
  
    if (!token) return c.json({ error: 'Google not connected' }, 401);
  
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    auth.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken
    });
  
    const gmailClient = google.gmail({ version: 'v1', auth });
    const res = await gmailClient.users.messages.list({
      userId: 'me',
      maxResults: Number(maxResults)
    });

    const emails = await Promise.all(
      res.data.messages?.map(async (m) => {
        const msg = await gmailClient.users.messages.get({
          userId: 'me',
          id: m.id!
        });

        const headers = msg.data.payload?.headers || [];
        return {
          id: m.id!,
          subject: headers.find(h => h.name === 'Subject')?.value || 'No Subject',
          from: headers.find(h => h.name === 'From')?.value || 'Unknown',
          snippet: msg.data.snippet!,
          date: headers.find(h => h.name === 'Date')?.value || ''
        };
      }) || []
    );

    return c.json({ emails });
  } catch (error) {
    console.error('Send email error:', error);
    return c.json({ error: 'Failed to fetch emails' }, 500);
  }
}

export const sendEmail = async (userId: string, to: string, subject: string, body: string, options: { cc?: string; bcc?: string } = {}): Promise<{ messageId: string }> => {
  try {
    const token = await prisma.oAuthToken.findFirst({
      where: { userId, provider: 'google' }
    });

    if (!token) throw new Error('Google not connected');

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    
    auth.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken
    });

    const gmailClient = google.gmail({ version: 'v1', auth });

    const rawMessage = [
      `To: ${to}`,
      ...(options.cc ? [`Cc: ${options.cc}`] : []),
      ...(options.bcc ? [`Bcc: ${options.bcc}`] : []),
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${subject}`,
      '',
      body
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmailClient.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    return { messageId: res.data.id! };
  } catch (error) {
    console.error('Send email error:', error);
    throw new Error('Failed to send email');
  }
}

export const sendEmailEndpoint = async (c: Context) => {
  try {
    const user = c.get('user');
    const { to, subject, body, cc, bcc } = await c.req.json();

    const result = await sendEmail(user.id, to, subject, body, { cc, bcc });
    return c.json({ message: 'Email sent', id: result.messageId });
  } catch (error) {
    console.error('Send email error:', error);
    return c.json({ error: 'Failed to send email' }, 500);
  }
};