import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient, User as PrismaUser } from '@prisma/client';
import type { Context } from 'hono';
import nodemailer from "nodemailer";
import { OAuth2Client } from 'google-auth-library';
import type { UserData, SignInUserData, PasswordData } from '../types/auth/authTypes.ts';
import { InstallProvider } from '@slack/oauth';

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

const prisma = new PrismaClient();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const generateVerificationCode = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

const sendVerificationEmail = async (email: string, code: string) => {
  const appName = process.env.APP_NAME || 'Loh.AI';
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
  });
};

export const register = async (c: Context) => {
  try {
    const { name, email, password }: UserData = await c.req.json();

    if (!name || !email || !password) {
      return c.json({ error: "All fields are required" }, 400);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return c.json({ error: "User already exists" }, 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationCodeExpiry = new Date(Date.now() + 10 * 60 * 1000);

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
          title: "First Session",
          isPinned: true
        }
      }
      },
      include: { chatSessions: true }
    }) as PrismaUser & { chatSessions: { id: string }[] };

    await sendVerificationEmail(email, verificationCode);

    console.log(`Created user with ID: ${user.id}`);

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    );

    return c.json({
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        defaultSessionId: user.chatSessions[0].id
      }
    }, 201);

  } catch (error) {
    console.error("Registration error:", error);
    return c.json({ error: "Registration failed. Please try again later." }, 500);
  }
}

export const verifyEmail = async (c: Context) => {
  try {
    const { email, code } = await c.req.json();

    if (!email || !code) {
      return c.json({ error: "Email and code are required" }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (user.isEmailVerified) {
      return c.json({ message: "Email already verified" }, 200);
    }

    if (user.verificationCode !== code) {
      return c.json({ error: "Invalid verification code" }, 400);
    }

    if (user.verificationCodeExpiry && user.verificationCodeExpiry < new Date()) {
      return c.json({ error: "Verification code expired" }, 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationCode: null,
        verificationCodeExpiry: null
      }
    });

    return c.json({ message: "Email verified successfully" }, 200);

  } catch (error) {
    console.error("Email verification error:", error);
    return c.json({ error: "Email verification failed" }, 500);
  }
};

export const getCurrentUser = async (c: Context) => {
  const user = c.get('user');
  return c.json({ user }, 200);
}

export const googleRegister = async (c: Context) => {
  try {
    const { token: googleToken }: { token: string } = await c.req.json();

    if (!googleToken) {
      return c.json({ error: "Google token is required" }, 400);
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      return c.json({ error: "Invalid Google token" }, 401);
    }

    const { email, name, picture, sub: googleId } = payload;

    if (!email) {
      return c.json({ error: "Email not provided by Google" }, 400);
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || "Google User",
          email,
          googleId,
          avatar: picture,
          isEmailVerified: true,
          password: null,
          chatSessions: {
            create: { title: "First Session" }
          }
        },
      });
    } else if (!user.googleId) {
      user = await prisma.user.update({
        where: { email },
        data: {
          googleId,
          avatar: picture,
        },
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    );

    return c.json({
      message: "User registered successfully via Google",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    }, 201);

  } catch (error) {
    console.error("Google registration error:", error);
    return c.json({ 
      error: "Google registration failed",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

export const forgotPassword = async (c: Context) => {
  try {
    const { email }: PasswordData = await c.req.json();

    if (!email) {
      return c.json({ 
        message: 'Email is required' 
      }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return c.json({ 
        message: 'No user found with that email' 
      }, 400);
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 10800000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry
      }
    });

    const resetLink = `${process.env.FRONTEND_URL}/forgot_password/${resetToken}`;
    const appName = process.env.APP_NAME || 'Our Application';
    
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
            
            <p><strong>Important:</strong> If you did not request this password reset, please disregard this email and ensure you can still log in to your account. If you have concerns about your account security, please contact our support team immediately.</p>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    });

    return c.json({ 
      message: 'Password reset link sent to your email'
    }, 200);

  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json({ 
      message: 'Error processing password reset request' 
    }, 500);
  }
};

export const resetPassword = async (c: Context) => {
  try {
    const { token, password } = await c.req.json();

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() }
      }
    });

    if (!user) {
      return c.json({ 
        message: 'Invalid or expired reset token' 
      }, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    const appName = process.env.APP_NAME || 'Our Application';
    
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Account Security" <noreply@yourapp.com>',
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
            
            <p>This change was made on ${new Date().toLocaleString()} from IP address ${c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'}.</p>
            
            <p><strong>If you did not initiate this password change</strong>, please contact our support team immediately as your account may have been compromised.</p>
            
            <p>For enhanced security, we recommend:</p>
            <ul>
              <li>Using unique passwords for different services</li>
              <li>Enabling two-factor authentication if available</li>
              <li>Regularly checking your account for any unusual activity</li>
            </ul>
          </div>
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    });

    return c.json({ 
      message: 'Password reset successful' 
    }, 200);

  } catch (error) {
    console.error('Reset password error:', error);
    return c.json({ 
      message: 'Error resetting password' 
    }, 500);
  }
};

export const login = async (c: Context) => {
  try {
    const { email, password }: SignInUserData = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { 
        chatSessions: {
          orderBy: { isPinned: 'desc' },
          take: 1
        }
      }
    });

    if (!user) {
      return c.json({ error: "Invalid credentials"}, 400);
    }

    if (!user.password) {
      return c.json({ error: "Invalid credentials" }, 400);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return c.json({ error: "Invalid credentials password is wrong. Check authControllers" }, 400);
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    );

    return c.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        defaultSessionId: user.chatSessions[0]?.id
      }
    }, 200);
  } catch (error) {
    console.error("Login error:", error);
    return c.json({ error: "Login failed. Please try again later." }, 500);
  }
}

export const slackAuthRedirect = async (c: Context) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');

    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      user_scope: 'identity.basic,identity.email,identity.avatar',
      redirect_uri: process.env.SLACK_REDIRECT_URI!,
      state,
    });

    const url = `https://slack.com/oauth/v2/authorize?${params.toString()}`;
    
    return c.redirect(url);
  } catch (error) {
    console.error('Slack auth redirect error:', error);
    return c.json({ 
      error: "Failed to initiate Slack authentication",
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}

export const slackAuthCallback = async (c: Context) => {
  try {
    const { code, state, error: authError } = c.req.query();

    if (authError) {
      console.error('Slack auth error:', authError);
      return c.json({ error: 'Slack authentication was denied or failed' }, 400);
    }

    if (!code) {
      return c.json({ error: 'Authorization code is required' }, 400);
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
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok || !tokenData.authed_user?.access_token) {
      console.error('Token exchange failed:', tokenData);
      return c.json({ 
        error: 'Failed to exchange code for token',
        details: tokenData.error || 'Unknown error'
      }, 401);
    }

    const identityResponse = await fetch('https://slack.com/api/users.identity', {
      headers: {
        Authorization: `Bearer ${tokenData.authed_user.access_token}`,
      },
    });

    const slackUser = await identityResponse.json();

    if (!slackUser.ok || !slackUser.user) {
      console.error('Identity fetch failed:', slackUser);
      return c.json({ 
        error: 'Failed to fetch Slack user info',
        details: slackUser.error || 'Unknown error'
      }, 401);
    }

    const { email, name, id: slackId, image_192: avatar } = slackUser.user;

    if (!email) {
      return c.json({ error: 'Email not provided by Slack' }, 400);
    }

    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          name: name || 'Slack User',
          email,
          slackId,
          avatar,
          isEmailVerified: true,
          password: null,
        },
      });
    } else if (!user.slackId) {
      user = await prisma.user.update({
        where: { email },
        data: {
          slackId,
          avatar,
        },
      });
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '3h' }
    );

    return c.json({
      message: "User authenticated successfully via Slack",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      },
    }, 200);
  } catch (error) {
    console.error('Slack auth callback error:', error);
    return c.json(
      {
        error: 'Slack authentication failed',
        details: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}