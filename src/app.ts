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