# Database Migration: Add System Info to Local Sessions

## Overview
This migration adds a `systemInfo` JSONB field to the `local_sessions` table to store system environment information collected when MCP sessions start.

## Migration Steps

### 1. Update Prisma Schema

**File:** `prisma/schema.prisma`

Add the `systemInfo` field to the `LocalSession` model:

```prisma
model LocalSession {
  id              String        @id @default(uuid())
  deviceId        String        @map("device_id")
  userId          String        @map("user_id")
  sessionSecret   String        @map("session_secret") @db.Text
  mcpPort         Int           @map("mcp_port")
  mode            SessionMode?
  durationMinutes Int?          @map("duration_minutes")
  status          SessionStatus @default(ACTIVE)
  startedAt       DateTime      @map("started_at")
  endedAt         DateTime?     @map("ended_at")
  systemInfo      Json?         @map("system_info")  // NEW FIELD
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  device   Device    @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  toolRuns ToolRun[]

  @@index([deviceId])
  @@index([userId])
  @@index([status])
  @@map("local_sessions")
}
```

### 2. Create Migration

Run Prisma migration:

```bash
npx prisma migrate dev --name add_system_info_to_local_sessions
```

This will:
- Create a migration file in `prisma/migrations/`
- Add the `system_info` JSONB column to the database
- Update the Prisma client

### 3. Manual SQL Migration (Alternative)

If you prefer to run SQL directly:

```sql
-- Add system_info JSONB column to local_sessions
ALTER TABLE local_sessions 
ADD COLUMN system_info JSONB;

-- Optional: Add GIN index for querying system_info (if needed)
CREATE INDEX idx_local_sessions_system_info ON local_sessions USING GIN (system_info);
```

### 4. Verify Migration

After migration, verify the column exists:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'local_sessions' 
AND column_name = 'system_info';
```

## System Info JSON Structure

The `systemInfo` field will store JSON in this format:

```json
{
  "os": {
    "platform": "linux",
    "arch": "x64",
    "version": "6.14.0-35-generic",
    "hostname": "dp-desktop"
  },
  "user": {
    "homeDirectory": "/home/dp",
    "username": "dp",
    "shell": "/usr/bin/bash"
  },
  "environment": {
    "path": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin",
    "cwd": "/home/dp/Desktop/operastudio-11.0",
    "nodeVersion": "v20.10.0"
  }
}
```

## Backwards Compatibility

- The field is **nullable** (`Json?`), so existing sessions without system info will work fine
- The API endpoint gracefully handles missing system info
- Frontend hook handles null system info gracefully
- Old sessions will simply not have system context until restarted

## Rollback (If Needed)

To rollback this migration:

```sql
ALTER TABLE local_sessions DROP COLUMN system_info;
```

Or using Prisma:

```bash
npx prisma migrate reset  # WARNING: This will reset all migrations
```

## Testing

After migration:

1. Start a new MCP session
2. Check database: `SELECT system_info FROM local_sessions WHERE status = 'ACTIVE' LIMIT 1;`
3. Verify system info is populated with correct data
4. Test API endpoint: `GET /api/system/info`
5. Verify frontend receives system info in chat interface

