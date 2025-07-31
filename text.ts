//prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                      String                @id @default(uuid())
  email                   String                @unique
  name                    String
  resetToken              String?
  resetTokenExpiry        DateTime?
  isEmailVerified         Boolean               @default(false)
  verificationCode        String?
  verificationCodeExpiry  DateTime?
  password                String?
  googleId                String?
  slackId                 String?
  avatar                  String?
  preferences             Json?
  defaultSessionId        String?
  tokens                  OAuthToken[]
  chatSessions            ChatSession[]
  webhookSubscriptions    WebhookSubscription[]
  createdAt               DateTime              @default(now()) @map("created_at")
  updatedAt               DateTime              @updatedAt @map("updated_at")

  @@map("users")
}

model ChatSession {
  id        String        @id @default(uuid())
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String?
  isPinned  Boolean       @default(false)
  summary   String?
  messages  ChatMessage[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@map("chat_sessions")
}

model ChatMessage {
  id        String      @id @default(uuid())
  sessionId String
  sender    String
  content   String      @db.Text
  metadata  Json?
  timestamp DateTime    @default(now())
  session   ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@map("chat_messages")
}

model OAuthToken {
  id           String   @id @default(uuid())
  userId       String
  provider     String
  accessToken  String   @db.Text
  refreshToken String?  @db.Text
  expiresAt    DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
  @@map("oauth_tokens")
}

model WebhookSubscription {
  id         String         @id @default(uuid())
  userId     String
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider   String         // 'google', 'slack', 'notion', etc.
  resourceId String         // Calendar ID, channel ID, etc.
  callbackUrl String        // Our endpoint URL
  providerId String?        // ID from the provider's webhook system
  secret     String?        // For HMAC verification
  expiresAt  DateTime?
  events     WebhookEvent[]
  createdAt  DateTime       @default(now())
  updatedAt  DateTime       @updatedAt

  @@unique([userId, provider, resourceId])
  @@map("webhook_subscriptions")
}

model WebhookEvent {
  id             String              @id @default(uuid())
  subscriptionId String
  subscription   WebhookSubscription @relation(fields: [subscriptionId], references: [id])
  provider       String
  eventType      String
  payload        Json
  processed      Boolean             @default(false)
  createdAt      DateTime            @default(now())

  @@index([processed])
  @@map("webhook_events")
}

model Notification {
id          String   @id @default(uuid())
userId      String
user        User     @relation(fields: [userId], references: [id])
title       String
body        String
data        Json?
isRead      Boolean  @default(false)
createdAt   DateTime @default(now())

@@index([userId, isRead])
}

model NotificationPreference {
id          String   @id @default(uuid())
userId      String   @unique
user        User     @relation(fields: [userId], references: [id])
email       Boolean  @default(true)
push        Boolean  @default(true)
inApp       Boolean  @default(true)
webhook     Boolean  @default(false)
updatedAt   DateTime @updatedAt
}

//src/utils/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

//src/index.ts
import 'dotenv/config'
import app from './app.js'
import { serve } from '@hono/node-server'
import { processWebhookEvents } from './workers/webhookProcessor.js'

const runningPort = parseInt(process.env.PORT || '3000')

setInterval(() => {
  processWebhookEvents().catch(console.error)
}, 30000)

serve({
  fetch: app.fetch,
  port: runningPort
}, (info: { port: number }) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

//src/app.ts
import { Hono } from 'hono';
import { rateLimiter } from 'hono-rate-limiter';
import { cors } from 'hono/cors';
import { RedisStore } from 'rate-limiter-flexible';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import integrationRoutes from './routes/integrationRoutes';
import notificationRoutes from './routes/notificationRoutes';

const redisStore = process.env.REDIS_URL 
  ? new RedisStore(process.env.REDIS_URL)
  : null;

const app = new Hono();

app.use('*', async (c, next) => {
  c.header('Content-Security-Policy', "default-src 'self'");
  c.header('X-Content-Type-Options', 'nosniff');
  await next();
});

app.use('*', cors({
  origin: process.env.FRONTEND_URLS?.split(',') || ['http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  credentials: true,
  maxAge: 86400
}));

if (redisStore) {
  app.use('/api/*', rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per windowMs
    store: redisStore,
    handler: (c) => c.json({ 
      error: 'Too many requests, please try again later' 
    }, 429)
  }));
} else {
  console.warn('Redis not configured - rate limiting disabled');
}

app.route('/api/auth', authRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/integrations', integrationRoutes);
app.route('/api/notifications', notificationRoutes);

app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    rateLimiting: !!redisStore
  });
});

app.get('/', (c) => {
  return c.json({
    message: 'AI Assistant API',
    version: '1.0.0',
    docs: '/api/docs'
  });
});

app.notFound((c) => {
  return c.json({ error: 'Endpoint not found' }, 404);
});

app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  }, 500);
});

export default app;

//src/workers/webhookProcessor.ts
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

//src/services/notificationService.ts
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
  

//src/services/aiService.ts
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { Groq } from 'groq-sdk'

const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY! })
const groq = new Groq({ apiKey: process.env.GROQ_KEY! })

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const generateAIResponse = async (messages: AIMessage[], sessionId: string): Promise<string> => {
  try {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { timestamp: 'asc' }, take: 20 } }
    })

    const messageHistory: AIMessage[] = session?.messages.map(m => ({
      role: m.sender === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content
    })) || []

    const allMessages: AIMessage[] = [
      {
        role: 'system',
        content: `You're an AI productivity assistant. Current time: ${new Date().toISOString()}`
      },
      ...messageHistory,
      ...messages.filter(m => m.role !== 'system')
    ]

    const provider = process.env.LLM_PROVIDER === 'groq' ? groq : openai
    const response = await provider.chat.completions.create({
      model: process.env.LLM_MODEL || 'gpt-4-turbo',
      messages: allMessages,
      temperature: 0.7
    })

    const aiResponse = response.choices[0]?.message?.content

    if (!aiResponse) {
      throw new Error('No response received from AI provider')
    }

    return aiResponse
  } catch (error) {
    console.error('Error generating AI response:', error)
    throw new Error('Failed to generate AI response')
  }
}

//src/services/memoryService.ts
import { PrismaClient } from '@prisma/client'
import { OpenAIEmbeddings } from '@langchain/openai'
import { Pinecone } from '@pinecone-database/pinecone'

const prisma = new PrismaClient()
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_KEY! })
const embeddings = new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_KEY! })

export const storeMemory = async (userId: string, text: string, metadata: any) => {
  try {
    const index = pinecone.index('assistant-memory')
    const embedding = await embeddings.embedQuery(text)

    await index.upsert([{
      id: crypto.randomUUID(),
      values: embedding,
      metadata: {
        userId,
        text,
        ...metadata,
        timestamp: new Date().toISOString()
      }
    }])
  } catch (error) {
    console.error('Error storing memory:', error)
    throw new Error('Failed to store memory')
  }
}

export const searchMemory = async (userId: string, query: string, k = 3) => {
  try {
    const index = pinecone.index('assistant-memory')
    const embedding = await embeddings.embedQuery(query)
    
    return await index.query({
      vector: embedding,
      filter: { userId },
      topK: k,
      includeMetadata: true
    })
  } catch (error) {
    console.error('Error searching memory:', error)
    throw new Error('Failed to search memory')
  }
}

//src/services/webhookService.ts
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

//src/types/auth/authTypes.ts
export interface UserData {
  name: string
  email: string
  password: string
}

export interface SignInUserData {
  email: string
  password: string
}

export interface PasswordData {
  email: string
}

export interface DecodedToken {
  userId: string
  iat?: number
  exp?: number
}

//src/types/integrations/integrationTypes.ts
export interface Email {
  id: string
  subject: string
  from: string
  snippet: string
  date: string
}

export interface SlackMessage {
  channel: string
  text: string
  ts: string
}

//src/middleware/auth.ts
import type { Context, Next, MiddlewareHandler } from 'hono'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import type { DecodedToken } from '../types/auth/authTypes.js'

const { TokenExpiredError, JsonWebTokenError } = jwt
const prisma = new PrismaClient()

export const authMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('Invalid auth header format')
      return c.json({ error: 'No or invalid authentication token format' }, 401)
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      console.log('Token extraction failed')
      return c.json({ error: 'Authentication token is missing' }, 401)
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      console.error('JWT_SECRET is not set in environment variables')
      return c.json({ error: 'Internal configuration error' }, 500)
    }

    let decoded: DecodedToken
    try {
      decoded = jwt.verify(token, jwtSecret) as DecodedToken
      console.log('Token decoded successfully:', { userId: decoded.userId })
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        return c.json({ error: 'Authentication token has expired' }, 401)
      }
      if (err instanceof JsonWebTokenError) {
        return c.json({ error: 'Invalid authentication token' }, 401)
      }
      throw err
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    c.set('user', user)
    await next()
  } catch (error) {
    console.error('Error in auth middleware:', error)
    return c.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
}

//src/controllers/authController.ts
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import type { Context } from 'hono'
import nodemailer from 'nodemailer'
import { OAuth2Client } from 'google-auth-library'
import type { UserData, SignInUserData, PasswordData } from '../types/auth/authTypes.js'

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
)

const prisma = new PrismaClient()

const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
})

const generateVerificationCode = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

const sendVerificationEmail = async (email: string, code: string) => {
  const appName = process.env.APP_NAME || 'Loh.AI'
  await transporter.sendMail({
    from: process.env.SMTP_USER || '"Account Security" <noreply@gmail.com>',
    to: email,
    subject: `${appName}: Verify Your Email Address`,
    html: `
      <h1>${appName}</h1>
      <p>Thank you for registering. Please use the following 4-digit code to verify your email address:</p>
      <h2>${code}</h2>
      <p>This code will expire in 10 minutes.</p>
    `
  })
}

export const register = async (c: Context) => {
  try {
    const { name, email, password }: UserData = await c.req.json()

    if (!name || !email || !password) {
      return c.json({ error: 'All fields are required' }, 400)
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    })

    if (existingUser) {
      return c.json({ error: 'User already exists' }, 400)
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const verificationCode = generateVerificationCode()
    const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash,
        verificationCode,
        verificationCodeExpiry,
        isEmailVerified: false,
        chatSessions: {
          create: {
            title: 'First Session',
            isPinned: true
          }
        }
      },
      include: { chatSessions: true }
    })

    await sendVerificationEmail(email, verificationCode)
    console.log(`Created user with ID: ${user.id}`)

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    )

    return c.json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        defaultSessionId: user.chatSessions[0].id
      }
    }, 201)
  } catch (error) {
    console.error('Registration error:', error)
    return c.json({ error: 'Registration failed. Please try again later.' }, 500)
  }
}

export const verifyEmail = async (c: Context) => {
  try {
    const { email, code } = await c.req.json()

    if (!email || !code) {
      return c.json({ error: 'Email and code are required' }, 400)
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    if (user.isEmailVerified) {
      return c.json({ message: 'Email already verified' }, 200)
    }

    if (user.verificationCode !== code) {
      return c.json({ error: 'Invalid verification code' }, 400)
    }

    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      return c.json({ error: 'Verification code expired' }, 400)
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationCode: null,
        verificationCodeExpiry: null
      }
    })

    return c.json({ message: 'Email verified successfully' }, 200)
  } catch (error) {
    console.error('Email verification error:', error)
    return c.json({ error: 'Email verification failed' }, 500)
  }
}

export const getCurrentUser = async (c: Context) => {
  const user = c.get('user')
  return c.json({ user }, 200)
}

export const googleRegister = async (c: Context) => {
  try {
    const { token: googleToken }: { token: string } = await c.req.json()

    if (!googleToken) {
      return c.json({ error: 'Google token is required' }, 400)
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    if (!payload) {
      return c.json({ error: 'Invalid Google token' }, 401)
    }

    const { email, name, picture, sub: googleId } = payload

    if (!email) {
      return c.json({ error: 'Email not provided by Google' }, 400)
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { chatSessions: true }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || 'Google User',
          email,
          googleId,
          avatar: picture,
          isEmailVerified: true,
          password: null,
          chatSessions: {
            create: { title: 'First Session' }
          }
        },
        include: { chatSessions: true }
      })
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { email },
        data: {
          googleId,
          avatar: picture,
        },
        include: { chatSessions: true }
      })
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    )

    return c.json({
      message: 'User registered successfully via Google',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        defaultSessionId: user.chatSessions[0]?.id
      }
    }, 201)
  } catch (error) {
    console.error('Google registration error:', error)
    return c.json({
      error: 'Google registration failed',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
}

export const forgotPassword = async (c: Context) => {
  try {
    const { email }: PasswordData = await c.req.json()

    if (!email) {
      return c.json({ message: 'Email is required' }, 400)
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return c.json({ message: 'No user found with that email' }, 400)
    }

    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 10800000) // 3 hours

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    })

    const resetLink = `${process.env.FRONTEND_URL}/forgot_password/${resetToken}`
    const appName = process.env.APP_NAME || 'Our Application'

    await transporter.sendMail({
      from: process.env.SMTP_USER || '"Account Security" <noreply@gmail.com>',
      to: email,
      subject: `${appName}: Secure Password Reset Request`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Request</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background-color: #f8f9fa; padding: 20px; border-bottom: 1px solid #e9ecef; }
            .content { padding: 20px; }
            .button { display: inline-block; background-color: #007bff; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; margin: 15px 0; }
            .footer { font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; padding-top: 15px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${appName} - Password Reset</h2>
          </div>
          <div class="content">
            <p>Dear ${user.name || 'Valued User'},</p>
            <p>We received a request to reset your password for your account. For your security, this link will expire in 1 hour.</p>
            <p>To reset your password, please click the button below:</p>
            <a href="${resetLink}" class="button">Reset My Password</a>
            <p>If the button doesn't work, copy and paste the following URL into your browser:</p>
            <p style="word-break: break-all; font-size: 12px;">${resetLink}</p>
            <p><strong>Important:</strong> If you did not request this password reset, please disregard this email and ensure you can still log in to your account.</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    })

    return c.json({ message: 'Password reset link sent to your email' }, 200)
  } catch (error) {
    console.error('Forgot password error:', error)
    return c.json({ message: 'Error processing password reset request' }, 500)
  }
}

export const resetPassword = async (c: Context) => {
  try {
    const { token, password } = await c.req.json()

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() }
      }
    })

    if (!user) {
      return c.json({ message: 'Invalid or expired reset token' }, 400)
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    })

    const appName = process.env.APP_NAME || 'Our Application'

    await transporter.sendMail({
      from: process.env.SMTP_USER || '"Account Security" <noreply@yourapp.com>',
      to: user.email,
      subject: `${appName}: Password Successfully Reset`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Confirmation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background-color: #f8f9fa; padding: 20px; border-bottom: 1px solid #e9ecef; }
            .content { padding: 20px; }
            .alert { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 10px; border-radius: 4px; color: #155724; }
            .footer { font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef; padding-top: 15px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${appName} - Security Notification</h2>
          </div>
          <div class="content">
            <p>Dear ${user.name || 'Valued User'},</p>
            <div class="alert">
              <p><strong>Your password has been successfully reset.</strong></p>
            </div>
            <p>This message confirms that your password for ${appName} has been changed. You can now log in using your new password.</p>
            <p>This change was made on ${new Date().toLocaleString()}.</p>
            <p><strong>If you did not initiate this password change</strong>, please contact our support team immediately.</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    })

    return c.json({ message: 'Password reset successful' }, 200)
  } catch (error) {
    console.error('Reset password error:', error)
    return c.json({ message: 'Error resetting password' }, 500)
  }
}

export const login = async (c: Context) => {
  try {
    const { email, password }: SignInUserData = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        chatSessions: {
          orderBy: { isPinned: 'desc' },
          take: 1
        }
      }
    })

    if (!user) {
      return c.json({ error: 'Invalid credentials' }, 400)
    }

    if (!user.password) {
      return c.json({ error: 'Invalid credentials' }, 400)
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return c.json({ error: 'Invalid credentials' }, 400)
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    )

    return c.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        defaultSessionId: user.chatSessions[0]?.id
      }
    }, 200)
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ error: 'Login failed. Please try again later.' }, 500)
  }
}

export const slackAuthRedirect = async (c: Context) => {
  try {
    const state = crypto.randomBytes(16).toString('hex')
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      user_scope: 'identity.basic,identity.email,identity.avatar',
      redirect_uri: process.env.SLACK_REDIRECT_URI!,
      state,
    })

    const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`
    return c.redirect(url)
  } catch (error) {
    console.error('Slack auth redirect error:', error)
    return c.json({
      error: 'Failed to initiate Slack authentication',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
}

export const slackAuthCallback = async (c: Context) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const authError = c.req.query('error')

    if (authError) {
      console.error('Slack auth error:', authError)
      return c.json({ error: 'Slack authentication was denied or failed' }, 400)
    }

    if (!code) {
      return c.json({ error: 'Authorization code is required' }, 400)
    }

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI!,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok || !tokenData.authed_user?.access_token) {
      console.error('Token exchange failed:', tokenData)
      return c.json({
        error: 'Failed to exchange code for token',
        details: tokenData.error || 'Unknown error'
      }, 401)
    }

    const identityResponse = await fetch('https://slack.com/api/users.identity', {
      headers: {
        Authorization: `Bearer ${tokenData.authed_user.access_token}`,
      },
    })

    const slackUser = await identityResponse.json()

    if (!slackUser.ok || !slackUser.user) {
      console.error('Identity fetch failed:', slackUser)
      return c.json({
        error: 'Failed to fetch Slack user info',
        details: slackUser.error || 'Unknown error'
      }, 401)
    }

    const { email, name, id: slackId, image_192: avatar } = slackUser.user

    if (!email) {
      return c.json({ error: 'Email not provided by Slack' }, 400)
    }

    let user = await prisma.user.findUnique({
      where: { email },
      include: { chatSessions: true }
    })

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || 'Slack User',
          email,
          slackId,
          avatar,
          isEmailVerified: true,
          password: null,
          chatSessions: {
            create: { title: 'First Session' }
          }
        },
        include: { chatSessions: true }
      })
    } else if (!user.slackId) {
      user = await prisma.user.update({
        where: { email },
        data: {
          slackId,
          avatar,
        },
        include: { chatSessions: true }
      })
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    )

    return c.json({
      message: 'User authenticated successfully via Slack',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        defaultSessionId: user.chatSessions[0]?.id
      },
    }, 200)
  } catch (error) {
    console.error('Slack auth callback error:', error)
    return c.json(
      {
        error: 'Slack authentication failed',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    )
  }
}

//src/controllers/chatController.ts
import { Context } from 'hono'
import { PrismaClient } from '@prisma/client'
import { searchMemory, storeMemory } from '../services/memoryService.js'
import { generateAIResponse } from '../services/aiService.js'

const prisma = new PrismaClient()

export const createChatSession = async (c: Context) => {
  try {
    const user = c.get('user')
    const body = await c.req.json()
    const { title } = body

    const session = await prisma.chatSession.create({
      data: {
        title: title || `New Session ${new Date().toLocaleDateString()}`,
        userId: user.id
      }
    })

    return c.json(session, 201)
  } catch (error) {
    console.error('Error creating chat:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export const sendMessageToSession = async (c: Context) => {
  try {
    const sessionId = c.req.param('id')
    const body = await c.req.json()
    const { content } = body
    const user = c.get('user')

    const userMessage = await prisma.chatMessage.create({
      data: {
        content,
        sender: 'user',
        sessionId
      }
    })

    const memories = await searchMemory(user.id, content)
    const memoryContext = memories.matches?.map(m => m.metadata?.text).join('\n') || ''

    const messages = [
      ...(memoryContext ? [{ role: 'system' as const, content: `Relevant context:\n${memoryContext}` }] : []),
      { role: 'user' as const, content }
    ]

    const aiResponse = await generateAIResponse(messages, sessionId)

    if (!aiResponse || typeof aiResponse !== 'string') {
      throw new Error('AI response is invalid or empty')
    }

    const serializedMetadata = {
      memories: memories.matches ? memories.matches.map(match => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata
      })) : []
    }

    const assistantMessage = await prisma.chatMessage.create({
      data: {
        content: aiResponse,
        sender: 'assistant',
        sessionId,
        metadata: serializedMetadata
      }
    })

    if (shouldStoreMemory(aiResponse)) {
      await storeMemory(user.id, aiResponse, { sessionId })
    }

    return c.json({ userMessage, assistantMessage }, 201)
  } catch (error) {
    console.error('Error sending message:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

function shouldStoreMemory(text: string): boolean {
  const importantKeywords = ['meeting', 'reminder', 'important', 'note', 'action item']
  return importantKeywords.some(keyword => text.toLowerCase().includes(keyword))
}

//src/controllers/notification.ts
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

//src/controllers/integrationController.ts
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

//src/controllers/integrations/gmail.ts
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

    return c.json({ message: 'Email sent', id: res.data.id })
  } catch (error) {
    console.error('Send email error:', error);
    return c.json({ error: 'Failed to fetch emails' }, 500);
  }
}

export const sendEmail = async (c: Context) => {
  try {
    const user = c.get('user');
    const { to, subject, body } = await c.req.json();

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

    const rawMessage = [
      `To: ${to}`,
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

    return c.json({ message: 'Email sent', id: res.data.id });
  } catch (error) {
    console.error('Send email error:', error);
    return c.json({ error: 'Failed to send email' }, 500);
  }
}

//src/controllers/integrations/notion.ts
import { Context } from 'hono'
import { Client } from '@notionhq/client'
import { prisma } from '../../utils/prisma.js'

export const searchNotionPages = async (c: Context) => {
  try {
    const user = c.get('user')
    const query = c.req.query('query')

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'notion' }
    })

    if (!token) return c.json({ error: 'Notion not connected' }, 401)

    const notionClient = new Client({ auth: token.accessToken })

    const response = await notionClient.search({
      query: query || '',
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time'
      }
    })

    return c.json({
      results: response.results.map(page => ({
        id: page.id,
        title: 'title' in page.properties ? 
          page.properties.title.title[0]?.plain_text : 'Untitled',
        url: page.url,
        lastEdited: page.last_edited_time
      }))
    })
  } catch (error) {
    console.error('Notion error:', error)
    return c.json({ error: 'Failed to search Notion' }, 500)
  }
}

export const createNotionPage = async (c: Context) => {
  try {
    const user = c.get('user')
    const { parentId, title, content } = await c.req.json()

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'notion' }
    })

    if (!token) return c.json({ error: 'Notion not connected' }, 401)

    const notionClient = new Client({ auth: token.accessToken })

    const response = await notionClient.pages.create({
      parent: { database_id: parentId },
      properties: {
        title: {
          title: [
            {
              text: {
                content: title
              }
            }
          ]
        }
      },
      children: content ? [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: {
                  content
                }
              }
            ]
          }
        }
      ] : []
    })

    return c.json({
      id: response.id,
      url: response.url
    })
  } catch (error) {
    console.error('Notion error:', error)
    return c.json({ error: 'Failed to create page' }, 500)
  }
}

//src/controllers/integrations/slack.ts
import { WebClient } from '@slack/web-api'
import { Context } from 'hono'
import { prisma } from '../../utils/prisma.js'
import { SlackMessage } from '../../types/integrations/integrationTypes.js'

export const sendSlackMessage = async (c: Context) => {
  try {
    const user = c.get('user')
    const { channel, text } = await c.req.json()

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'slack' }
    })

    if (!token) return c.json({ error: 'Slack not connected' }, 401)

    const client = new WebClient(token.accessToken)

    const result = await client.chat.postMessage({
      channel,
      text,
      as_user: true
    })

    return c.json({
      message: 'Message sent',
      channel: result.channel,
      ts: result.ts
    })
  } catch (error) {
    console.error('Slack error:', error)
    return c.json({ error: 'Failed to send Slack message' }, 500)
  }
}

export const getSlackMessages = async (c: Context) => {
  try {
    const user = c.get('user')
    const channel = c.req.query('channel')
    const limit = c.req.query('limit') || '10'

    const token = await prisma.oAuthToken.findFirst({
      where: { userId: user.id, provider: 'slack' }
    })

    if (!token) return c.json({ error: 'Slack not connected' }, 401)

    const client = new WebClient(token.accessToken)

    const result = await client.conversations.history({
      channel: channel as string,
      limit: Number(limit)
    })

    const messages: SlackMessage[] = (result.messages || []).map(m => ({
      channel: channel as string,
      text: m.text!,
      ts: m.ts!
    }))

    return c.json({ messages })
  } catch (error) {
    console.error('Slack error:', error)
    return c.json({ error: 'Failed to fetch messages' }, 500)
  }
}

//src/controllers/integrations/weather.ts
import { Context } from 'hono'

export const getWeatherForecast = async (c: Context) => {
  try {
    const location = c.req.query('location')
    const days = c.req.query('days') || '3'

    const response = await fetch(
      `https://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${location}&days=${days}`
    )

    const data = await response.json()

    return c.json({
      location: data.location,
      forecast: data.forecast.forecastday.map((day: any) => ({
        date: day.date,
        maxTemp: day.day.maxtemp_c,
        minTemp: day.day.mintemp_c,
        condition: day.day.condition.text
      }))
    })
  } catch (error) {
    console.error('Weather error:', error)
    return c.json({ error: 'Failed to fetch weather data' }, 500)
  }
}

//src/controllers/webhooks/google.ts
import { Context } from 'hono'
import { prisma } from '../../utils/prisma.js'
import { storeWebhookEvent, verifyWebhookSignature } from '../../services/webhookService.js'

export const googleCalendarOwnership = async (c: Context) => {
  const challenge = c.req.query('hub.challenge')
  if (!challenge) return c.text('Missing challenge', 400)

  const topic = c.req.query('hub.topic')
  const subscription = await prisma.webhookSubscription.findFirst({
    where: {
      provider: 'google',
      callbackUrl: c.req.url.split('?')[0]
    }
  })

  if (!subscription) return c.text('Not subscribed', 404)

  return c.text(challenge)
}

export const googleCalendarNotification = async (c: Context) => {
  try {
    const subscription = await prisma.webhookSubscription.findFirst({
      where: {
        provider: 'google',
        callbackUrl: c.req.url
      }
    })

    if (!subscription) return c.text('Not found', 404)

    if (subscription.secret) {
      const signature = c.req.header('X-Goog-Signature')
      if (!signature) return c.text('Unauthorized', 401)

      const body = await c.req.text()
      if (!verifyWebhookSignature(subscription.secret, signature, body)) {
        return c.text('Invalid signature', 401)
      }
    }

    const payload = await c.req.json()
    await storeWebhookEvent(
      subscription.id,
      'google',
      payload.headers?.['X-Goog-Resource-State'] || 'unknown',
      payload
    )

    return c.text('OK', 200)
  } catch (error) {
    console.error('Google webhook error:', error)
    return c.text('Internal server error', 500)
  }
}

//src/controllers/webhooks/slack.ts
import { Context } from 'hono'
import { storeWebhookEvent } from '../../services/webhookService.js'
import { prisma } from '../../utils/prisma.js'
import crypto from 'crypto'

export const slackWebhook = async (c: Context) => {
  try {
    const payload = await c.req.json()

    // URL verification challenge
    if (payload.type === 'url_verification') {
      return c.json({ challenge: payload.challenge })
    }

    // Verify signing secret
    const signature = c.req.header('x-slack-signature')
    const timestamp = c.req.header('x-slack-request-timestamp')
    const signingSecret = process.env.SLACK_SIGNING_SECRET!

    if (!signature || !timestamp) {
      return c.json({ error: 'Missing headers' }, 401)
    }

    const body = await c.req.text()
    const sigBasestring = `v0:${timestamp}:${body}`
    const hmac = crypto.createHmac('sha256', signingSecret)
    const computedSig = `v0=${hmac.update(sigBasestring).digest('hex')}`

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSig))) {
      return c.json({ error: 'Invalid signature' }, 401)
    }

    // Store event
    const subscription = await prisma.webhookSubscription.findFirst({
      where: { provider: 'slack' }
    })

    if (!subscription) return c.json({ error: 'No subscription' }, 404)

    await storeWebhookEvent(
      subscription.id,
      'slack',
      payload.event?.type || payload.type,
      payload
    )

    // Acknowledge receipt immediately
    return c.json({ ok: true })
  } catch (error) {
    console.error('Slack webhook error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
}

//src/routes/authRoutes.ts
import { Hono } from 'hono'
import { 
  register, 
  getCurrentUser, 
  verifyEmail, 
  googleRegister, 
  login,
  forgotPassword, 
  resetPassword, 
  slackAuthRedirect, 
  slackAuthCallback 
} from '../controllers/authController.js'
import { authMiddleware } from '../middleware/auth.js'

const authRoutes = new Hono()

authRoutes.post('/register', register)
authRoutes.post('/signin', login)
authRoutes.post('/google', googleRegister)
authRoutes.get('/slack', slackAuthRedirect)
authRoutes.get('/slack/callback', slackAuthCallback)
authRoutes.post('/forgot-password', forgotPassword)
authRoutes.post('/reset-password', resetPassword)
authRoutes.post('/verify-email', verifyEmail)
authRoutes.get('/me', authMiddleware, getCurrentUser)

export default authRoutes

//src/routes/chatRoutes.ts
import { Hono } from 'hono'
import { createChatSession, sendMessageToSession } from '../controllers/chatController.js'
import { authMiddleware } from '../middleware/auth.js'

const chatRoutes = new Hono()

chatRoutes.post('/sessions', authMiddleware, createChatSession)
chatRoutes.post('/sessions/:id/messages', authMiddleware, sendMessageToSession)

export default chatRoutes

//src/routes/integrationRoutes.ts
import { Hono } from 'hono'
import { googleCalendar, googleWatchCalendar } from '../controllers/integrationController.js'
import { authMiddleware } from '../middleware/auth.js'
import { getWeatherForecast } from '../controllers/integrations/weather.js'
import { createNotionPage, searchNotionPages } from '../controllers/integrations/notion.js'
import { getSlackMessages, sendSlackMessage } from '../controllers/integrations/slack.js'
import { getRecentEmail, sendEmail } from '../controllers/integrations/gmail.js'
import { googleCalendarNotification, googleCalendarOwnership } from '../controllers/webhooks/google.js'
import { slackWebhook } from '../controllers/webhooks/slack.js'
import { Email } from '../types/intergrations/integrationTypes.js'

const integrationRoutes = new Hono()

integrationRoutes.get('/webhooks/google/calendar', googleCalendarOwnership)
integrationRoutes.post('/webhooks/google/calendar', googleCalendarNotification)
integrationRoutes.post('/webhooks/slack/events', slackWebhook)

integrationRoutes.post('/google/calendar', authMiddleware, googleCalendar)
integrationRoutes.post('/google/watch', authMiddleware, googleWatchCalendar)
integrationRoutes.get('/weather/forecast', authMiddleware, getWeatherForecast)
integrationRoutes.get('/notion/search', authMiddleware, searchNotionPages)
integrationRoutes.post('/notion/pages', authMiddleware, createNotionPage)
integrationRoutes.post('/slack/send', authMiddleware, sendSlackMessage)
integrationRoutes.get('/slack/messages', authMiddleware, getSlackMessages)
integrationRoutes.get('/gmail/emails', authMiddleware, getRecentEmail)
integrationRoutes.post('/gmail/send', authMiddleware, sendEmail)

export default integrationRoutesmessages.list({
  userId: 'me',
  maxResults: Number(maxResults)
})

const emails: Email[] = await Promise.all(
  res.data.messages?.map(async (m) => {
    const msg = await gmailClient.users.messages.get({
      userId: 'me',
      id: m.id!
    })
    const payload = msg.data.payload!
    const headers = payload.headers!
    const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject'
    const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender'
    return {
      id: m.id!,
      subject,
      from,
      snippet: msg.data.snippet!,
      date: headers.find(h => h.name === 'Date')?.value || ''
    }
  }) || []
)

//src/routes/notificationRoutes.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { getNotification, getPreferences, markAsRead, updatePreferences } from '../controllers/notifications.ts';

const notificationRoutes = new Hono();

notificationRoutes.get('/', authMiddleware, getNotification);
notificationRoutes.patch('/:id/read', authMiddleware, markAsRead);
notificationRoutes.get('/preferances', authMiddleware, getPreferences);
notificationRoutes.put('/preferences', authMiddleware, updatePreferences);

export default notificationRoutes;