import 'dotenv/config'
import app from './app.ts';
import { serve } from '@hono/node-server';

const runningPort = parseInt(process.env.PORT || '3000');

serve({
  fetch: app.fetch,
  port: runningPort
}, (info: { port: any }) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})