import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from './routes/authRoutes.js'
import chatRoutes from './routes/chatRoutes.js'
import integrationRoutes from './routes/integrationRoutes.js'

const app = new Hono()

app.use(cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.route('/api/auth', authRoutes)
app.route('/api/chat', chatRoutes)
app.route('/api', integrationRoutes)

app.get('/', (c) => c.text('Hello Hono!'))

export default app
