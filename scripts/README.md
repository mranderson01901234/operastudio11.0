# OperaStudio Startup Scripts

Quick reference for managing the OperaStudio development environment.

## Available Scripts

### `start-fresh.sh` - Fresh Start Everything

Kills all existing processes and restarts everything fresh with a clean state.

**Usage:**
```bash
# Interactive mode (prompts for cleanup)
npm run start:fresh
# or
./scripts/start-fresh.sh

# Non-interactive with cleanup
./scripts/start-fresh.sh --clean

# Non-interactive without cleanup
./scripts/start-fresh.sh --no-clean
```

**What it does:**
1. ✅ Kills all Node.js processes related to the project
2. ✅ Kills processes on ports 3000 and 5432 (except PostgreSQL Docker container)
3. ✅ Optionally cleans build artifacts (.next, node_modules/.cache)
4. ✅ Ensures PostgreSQL Docker container is running
5. ✅ Builds MCP server
6. ✅ Runs database migrations
7. ✅ Starts Next.js development server

**Output:**
- Development server: http://localhost:3000
- Logs: `/tmp/operastudio-dev.log`
- Server PID: Displayed at the end (use `kill <PID>` to stop)

---

### `stop.sh` - Stop All Processes

Kills all related processes without restarting.

**Usage:**
```bash
npm run stop
# or
./scripts/stop.sh
```

**What it does:**
1. ✅ Kills Next.js dev server (port 3000)
2. ✅ Kills all Node.js processes in project directory
3. ✅ Kills MCP server processes
4. ✅ Clears ports (preserves PostgreSQL Docker container)

---

### `db-setup.sh` - Database Setup

Sets up and manages the PostgreSQL database.

**Usage:**
```bash
npm run db:setup
# or
./scripts/db-setup.sh
```

**What it does:**
1. ✅ Creates `.env.local` if missing
2. ✅ Starts PostgreSQL Docker container
3. ✅ Runs Prisma migrations
4. ✅ Generates Prisma Client

---

## Common Workflows

### Daily Development
```bash
# Start everything fresh
npm run start:fresh

# When done, stop everything
npm run stop
```

### After Pulling Changes
```bash
# Clean start with build artifact cleanup
./scripts/start-fresh.sh --clean
```

### Quick Restart (No Cleanup)
```bash
# Stop everything
npm run stop

# Start fresh without cleanup prompt
./scripts/start-fresh.sh --no-clean
```

### Database Issues
```bash
# Reset and setup database
npm run db:reset
npm run db:setup
```

---

## Troubleshooting

### Port Already in Use
```bash
# Check what's using port 3000
lsof -i:3000

# Kill it manually
kill -9 <PID>

# Or use the stop script
npm run stop
```

### Docker Not Running
```bash
# Start Docker service
sudo systemctl start docker  # Linux
# or start Docker Desktop (macOS/Windows)
```

### Database Connection Issues
```bash
# Check if PostgreSQL container is running
docker ps | grep operastudio-db

# Start it if stopped
docker start operastudio-db

# Check logs
docker logs operastudio-db
```

### Server Won't Start
```bash
# Check server logs
tail -f /tmp/operastudio-dev.log

# Check for TypeScript errors
npx tsc --noEmit

# Clean and rebuild
./scripts/start-fresh.sh --clean
```

---

## Notes

- The scripts preserve the PostgreSQL Docker container - they won't kill it
- Server logs are written to `/tmp/operastudio-dev.log`
- The dev server runs in the background after starting
- Use `npm run stop` or `kill <PID>` to stop the server

