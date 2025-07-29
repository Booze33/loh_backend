-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "defaultSessionId" TEXT,
ADD COLUMN     "preferences" JSONB;
