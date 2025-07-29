import type types from "hono"

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import authRoutes from "./routes/authRoutes.ts";

const app = new Hono();

app.use(cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-type', 'Authorization'],
  credentials: true,
}))

app.route("/api/auth", authRoutes);

app.get('/', (c: types.Context) => c.text('Hello Hono!'));

export default app;