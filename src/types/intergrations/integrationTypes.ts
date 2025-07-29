export interface Email {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  body?: string;
  date: string;
}

export interface SlackMessage {
  channel: string;
  text: string;
  ts: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  description?: string;
}

export interface IntegrationToken {
  provider: 'google' | 'slack' | 'notion';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}