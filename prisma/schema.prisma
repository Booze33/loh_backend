generator client {
    provider = "prisma-client-js"
    output   = "../generated/prisma"
  }
  
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
  }
  
  model User {
    id                     String    @id @default(uuid())
    email                  String    @unique
    name                   String
    resetToken             String?
    resetTokenExpiry       DateTime?
    isEmailVerified        Boolean   @default(false)
    verificationCode       String?
    verificationCodeExpiry DateTime?
    password               String
    tokens                 OAuthToken[]
    createdAt              DateTime  @default(now()) @map("created_at")
    updatedAt              DateTime  @updatedAt @map("updated_at")
    picture                String?
    chatSessions           ChatSession[]
  
    @@map("users")
  }
  
  model ChatSession {
    id        String     @id @default(uuid())
    userId    String
    user      User       @relation(fields: [userId], references: [id])
    messages  ChatMessage[]
    createdAt DateTime   @default(now())
  }
  
  model ChatMessage {
    id         String   @id @default(uuid())
    sessionId  String
    sender     String   // 'user' or 'assistant'
    content    String
    timestamp  DateTime @default(now())
    session    ChatSession @relation(fields: [sessionId], references: [id])
  }
  
  model OAuthToken {
    id          String   @id @default(uuid())
    userId      String
    provider    String   // 'google', 'slack', etc.
    accessToken String
    refreshToken String?
    expiresAt   DateTime?
    user        User     @relation(fields: [userId], references: [id])
  }
  
  