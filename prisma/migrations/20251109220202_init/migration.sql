-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('SAFE', 'BALANCED', 'UNRESTRICTED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ToolRunStatus" AS ENUM ('SUCCESS', 'ERROR', 'CANCELLED');

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "device_public_key" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PENDING',
    "os" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "launcher_version" TEXT,
    "paired_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" TEXT,
    "rotation_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_keys" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "private_key_encrypted" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_sessions" (
    "id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_secret" TEXT NOT NULL,
    "mcp_port" INTEGER NOT NULL,
    "mode" "SessionMode",
    "duration_minutes" INTEGER,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_runs" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args_hash" TEXT NOT NULL,
    "paths_touched_count" INTEGER NOT NULL DEFAULT 0,
    "bytes_read" BIGINT NOT NULL DEFAULT 0,
    "bytes_written" BIGINT NOT NULL DEFAULT 0,
    "exit_code" INTEGER,
    "status" "ToolRunStatus" NOT NULL,
    "elevated" BOOLEAN NOT NULL DEFAULT false,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devices_user_id_idx" ON "devices"("user_id");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE INDEX "device_keys_device_id_idx" ON "device_keys"("device_id");

-- CreateIndex
CREATE INDEX "local_sessions_device_id_idx" ON "local_sessions"("device_id");

-- CreateIndex
CREATE INDEX "local_sessions_user_id_idx" ON "local_sessions"("user_id");

-- CreateIndex
CREATE INDEX "local_sessions_status_idx" ON "local_sessions"("status");

-- CreateIndex
CREATE INDEX "tool_runs_session_id_idx" ON "tool_runs"("session_id");

-- CreateIndex
CREATE INDEX "tool_runs_user_id_idx" ON "tool_runs"("user_id");

-- CreateIndex
CREATE INDEX "tool_runs_device_id_idx" ON "tool_runs"("device_id");

-- CreateIndex
CREATE INDEX "tool_runs_tool_idx" ON "tool_runs"("tool");

-- CreateIndex
CREATE INDEX "tool_runs_created_at_idx" ON "tool_runs"("created_at");

-- AddForeignKey
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_sessions" ADD CONSTRAINT "local_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "local_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_runs" ADD CONSTRAINT "tool_runs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
