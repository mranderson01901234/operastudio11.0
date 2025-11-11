# Quick Start Guide: Local Environment Connector

**Purpose:** Actionable steps to begin Phase 0 and Phase 1 implementation

---

## Prerequisites Checklist

Before starting development, ensure you have:

- [ ] Node.js 20+ installed
- [ ] PostgreSQL installed (or Docker for PostgreSQL)
- [ ] Git configured
- [ ] Development environment ready

---

## Step 1: Database Setup (Day 1-2)

### 1.1 Install Prisma

```bash
npm install prisma @prisma/client
npm install -D prisma
```

### 1.2 Initialize Prisma

```bash
npx prisma init
```

### 1.3 Configure Database Connection

Edit `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}
```

### 1.4 Set Environment Variable

Add to `.env.local`:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/operastudio?schema=public"
```

### 1.5 Create Initial Schema

Create `prisma/schema.prisma` with tables from Phase 1:
- `devices`
- `device_keys`
- `local_sessions`
- `tool_runs`

### 1.6 Run Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

---

## Step 2: Launcher Project Setup (Day 3-4)

### 2.1 Choose Electron (Recommended)

Create new directory for launcher:

```bash
mkdir operastudio-launcher
cd operastudio-launcher
npm init -y
```

### 2.2 Install Electron Dependencies

```bash
npm install electron electron-builder --save-dev
npm install express ws crypto-js
```

### 2.3 Create Basic Structure

```
operastudio-launcher/
├── src/
│   ├── main.ts          # Main process
│   ├── preload.ts       # Preload script
│   └── renderer/        # UI (optional for MVP)
├── package.json
└── electron-builder.yml
```

### 2.4 Configure package.json

Add to `package.json`:

```json
{
  "main": "dist/main.js",
  "scripts": {
    "dev": "electron .",
    "build": "tsc && electron-builder",
    "start": "electron dist/main.js"
  }
}
```

---

## Step 3: Protocol Handler Research (Day 5)

### 3.1 macOS Protocol Handler

**Info.plist:**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>operastudio</string>
    </array>
  </dict>
</array>
```

**Registration:**
```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user
```

### 3.2 Linux Protocol Handler

**Create `.desktop` file:**
```ini
[Desktop Entry]
Name=OperaStudio Launcher
Exec=/path/to/launcher %u
Type=Application
MimeType=x-scheme-handler/operastudio;
```

**Register:**
```bash
xdg-mime default operastudio.desktop x-scheme-handler/operastudio
```

### 3.3 Windows Protocol Handler

**Registry Entry:**
```
HKEY_CLASSES_ROOT\operastudio
  (Default) = "URL:OperaStudio Protocol"
  URL Protocol = ""
  
HKEY_CLASSES_ROOT\operastudio\shell\open\command
  (Default) = "C:\Path\To\launcher.exe" "%1"
```

---

## Step 4: Begin Phase 1 Implementation (Week 2)

### 4.1 Create Database Schema

Use the schema from `IMPLEMENTATION_PLAN.md` Phase 1:

```prisma
model Device {
  id                String   @id @default(uuid())
  userId            String
  deviceName        String
  devicePublicKey   String   @db.Text
  status            DeviceStatus @default(PENDING)
  os                String
  arch              String
  hostname          String
  launcherVersion   String?
  pairedAt          DateTime?
  lastSeenAt        DateTime?
  revokedAt         DateTime?
  revocationReason  String?
  rotationCount     Int      @default(0)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  deviceKeys        DeviceKey[]
  sessions          LocalSession[]
  toolRuns          ToolRun[]
  
  @@index([userId])
  @@index([status])
}

enum DeviceStatus {
  PENDING
  ACTIVE
  REVOKED
}
```

### 4.2 Create API Route Structure

```
app/api/
├── devices/
│   ├── pair/
│   │   └── route.ts
│   └── revoke/
│       └── route.ts
└── sessions/
    ├── start/
    │   └── route.ts
    ├── stop/
    │   └── route.ts
    └── heartbeat/
        └── route.ts
```

### 4.3 Implement First Endpoint

Start with `POST /api/devices/pair`:

```typescript
// app/api/devices/pair/route.ts
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { userId } = await auth();
  
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  
  const body = await request.json();
  // Implement pairing logic
}
```

---

## Step 5: Testing Setup

### 5.1 Install Testing Dependencies

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

### 5.2 Create Test Structure

```
__tests__/
├── api/
│   ├── devices/
│   │   └── pair.test.ts
│   └── sessions/
│       └── start.test.ts
└── launcher/
    └── protocol-handler.test.ts
```

---

## Development Workflow

### Daily Workflow

1. **Morning:** Review yesterday's progress, plan today's tasks
2. **Development:** Implement features, write tests
3. **Afternoon:** Test on all platforms, fix bugs
4. **Evening:** Commit changes, update documentation

### Weekly Milestones

- **Week 1:** Database + Launcher setup complete
- **Week 2:** Phase 1 API endpoints working
- **Week 3:** Phase 2 launcher MVP functional
- **Week 4:** Protocol handler working on all platforms

---

## Common Issues & Solutions

### Issue: Database Connection Fails

**Solution:**
- Check `DATABASE_URL` format
- Ensure PostgreSQL is running
- Verify network/firewall settings

### Issue: Protocol Handler Not Working

**Solution:**
- Check OS-specific registration
- Test with `operastudio://test` URL
- Verify launcher binary path

### Issue: Electron Build Fails

**Solution:**
- Check electron-builder configuration
- Verify platform-specific dependencies
- Review build logs for errors

---

## Resources

- **Prisma Docs:** https://www.prisma.io/docs
- **Electron Docs:** https://www.electronjs.org/docs
- **Protocol Handlers:** OS-specific documentation
- **HMAC Transport:** See `ARCHITECTURE_BLUEPRINT.md` Section 5

---

## Next Steps After Setup

1. Implement Phase 1 database schema
2. Create API endpoints
3. Build launcher MVP
4. Test protocol handler
5. Begin Phase 2 implementation

---

**Last Updated:** 2025-01-27

