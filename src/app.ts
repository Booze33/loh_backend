import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import integrationRoutes from './routes/integrationRoutes';

const app = new Hono();

app.use('*', async (c, next) => {
  c.header('Content-Security-Policy', "default-src 'self' https://accounts.google.com; frame-src 'self' https://accounts.google.com");
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  await next();
});

app.use('*', cors({
  origin: process.env.FRONTEND_URL?.split(',') || ['http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
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