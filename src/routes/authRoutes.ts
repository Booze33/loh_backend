import { Hono } from 'hono';
import { register, getCurrentUser, verifyEmail, googleRegister, login, forgotPassword, resetPassword } from '../controllers/authController.ts';
import { authMiddleware } from '../middleware/auth.ts';

const authRoutes = new Hono();

authRoutes.post('/register', register);
authRoutes.post('/signin', login);
authRoutes.post('/google', googleRegister);
authRoutes.post('/forgot-password', forgotPassword);
authRoutes.post('/reset-password', resetPassword);
authRoutes.post('/verify-email', verifyEmail);
authRoutes.get('/me', authMiddleware, getCurrentUser);

export default authRoutes;