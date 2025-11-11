-- CreateEnum
CREATE TYPE "GitHubAccountStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');

-- CreateTable
CREATE TABLE "github_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'GITHUB',
    "username" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "refresh_token_enc" TEXT,
    "expires_at" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "status" "GitHubAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "github_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "github_accounts_user_id_idx" ON "github_accounts"("user_id");

-- CreateIndex
CREATE INDEX "github_accounts_status_idx" ON "github_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "github_accounts_user_id_provider_username_key" ON "github_accounts"("user_id", "provider", "username");
