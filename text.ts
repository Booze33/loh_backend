import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import integrationRoutes from './routes/integrationRoutes';

const app = new Hono();

app.use('*', async (c, next) => {
  // More permissive CSP for OAuth flows
  c.header('Content-Security-Policy', "default-src 'self' https://accounts.google.com; frame-src 'self' https://accounts.google.com");
  c.header('X-Content-Type-Options', 'nosniff');
  // Allow cross-origin popups for OAuth
  c.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  await next();
});

app.use('*', cors({
  origin: (origin) => {
    const allowedOrigins = process.env.FRONTEND_URLS?.split(',') || ['http://localhost:3000'];
    // Allow requests with no origin (like mobile apps) or from allowed origins
    return !origin || allowedOrigins.includes(origin);
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposeHeaders: ['Content-Length', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  credentials: true,
  maxAge: 86400
}));

app.route('/api/auth', authRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/integrations', integrationRoutes);

app.get('/health', (c) => c.json({ status: 'healthy' }));
app.get('/', (c) => c.json({ message: 'AI Assistant API', version: '1.0.0' }));

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