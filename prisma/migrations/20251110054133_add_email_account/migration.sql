-- CreateEnum
CREATE TYPE "EmailAccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "status" "EmailAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_accounts_user_id_idx" ON "email_accounts"("user_id");

-- CreateIndex
CREATE INDEX "email_accounts_status_idx" ON "email_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_user_id_provider_email_key" ON "email_accounts"("user_id", "provider", "email");
