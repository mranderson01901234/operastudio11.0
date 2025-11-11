-- CreateIndex
CREATE INDEX "email_accounts_user_id_status_provider_idx" ON "email_accounts"("user_id", "status", "provider");

-- CreateIndex
CREATE INDEX "github_accounts_user_id_status_idx" ON "github_accounts"("user_id", "status");

-- CreateIndex
CREATE INDEX "local_sessions_user_id_status_idx" ON "local_sessions"("user_id", "status");

-- CreateIndex
CREATE INDEX "local_sessions_device_id_status_started_at_idx" ON "local_sessions"("device_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "tool_runs_user_id_created_at_idx" ON "tool_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "tool_runs_session_id_tool_created_at_idx" ON "tool_runs"("session_id", "tool", "created_at");
