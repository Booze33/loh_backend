/*
  Warnings:

  - You are about to drop the column `isPinned` on the `chat_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `chat_sessions` table. All the data in the column will be lost.
  - You are about to drop the column `preferences` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "chat_sessions" DROP COLUMN "isPinned",
DROP COLUMN "summary";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "preferences";
