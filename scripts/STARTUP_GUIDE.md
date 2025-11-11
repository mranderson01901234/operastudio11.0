# OperaStudio Startup Guide

## Quick Start

### Basic Startup
```bash
npm run start:dev
# or
./scripts/start.sh
```

### Clean Build Startup
```bash
npm run start:clean
# or
./scripts/start.sh --clean
```

### Skip Database Setup
```bash
./scripts/start.sh --skip-db
```

## What the Startup Script Does

The `start.sh` script performs the following steps:

1. **Prerequisites Check**
   - Verifies Node.js and npm are installed
   - Checks Docker is running (if database setup is enabled)

2. **Stop Existing Processes**
   - Kills any processes on port 3000
   - Stops any running Next.js dev servers
   - Removes lock files

3. **Clean Build Artifacts** (optional with `--clean`)
   - Removes `.next` directory
   - Clears `node_modules/.cache`

4. **Database Setup** (skipped with `--skip-db`)
   - Starts or creates PostgreSQL Docker container
   - Waits for database to be ready
   - Verifies database connection

5. **Environment Configuration**
   - Checks for `.env.local` or `.env` file
   - Creates `.env.local` from template if missing
   - Prompts to update API keys

6. **Install Dependencies & Build**
   - Installs root dependencies if needed
   - Builds MCP server
   - Generates Prisma Client
   - Runs database migrations

7. **Start Development Server**
   - Starts Next.js dev server on port 3000
   - Shows server logs

## Prerequisites

- **Node.js** 20+ installed
- **npm** installed
- **Docker** installed and running (for database)
- **API Keys** configured in `.env.local`:
  - `GEMINI_API_KEY` (required)
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (required)
  - `CLERK_SECRET_KEY` (required)

## Troubleshooting

### Port 3000 Already in Use
```bash
# Kill processes on port 3000
lsof -ti:3000 | xargs kill -9

# Or use the stop script
npm run stop
```

### Database Issues
```bash
# Check if database container is running
docker ps | grep operastudio-db

# Start database container
docker start operastudio-db

# Or recreate it
docker-compose up -d postgres
```

### Migration Issues
```bash
# Reset database (WARNING: deletes all data)
npm run db:reset

# Or run migrations manually
npm run db:migrate
```

### Build Issues
```bash
# Clean everything and rebuild
npm run start:clean

# Or manually clean
rm -rf .next node_modules/.cache
npm install
```

## Script Comparison

| Script | Purpose | Clean Build | Database Setup |
|--------|---------|------------|----------------|
| `start.sh` | Clean, reliable startup | Optional (`--clean`) | Yes (skip with `--skip-db`) |
| `start-fresh.sh` | Comprehensive startup with more options | Interactive prompt | Yes |

## Environment Variables

Create `.env.local` with:

```bash
# Required
GEMINI_API_KEY=your-gemini-api-key
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-clerk-key
CLERK_SECRET_KEY=your-clerk-secret

# Database (auto-configured)
DATABASE_URL="postgresql://operastudio:operastudio_dev_password@localhost:5432/operastudio?schema=public"

# Optional
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
REDIS_URL=your-redis-url
REDIS_TOKEN=your-redis-token
```

## Next Steps

After startup:
1. Open http://localhost:3000
2. Sign in with Clerk
3. Connect your GitHub account (optional)
4. Connect your Gmail account (optional)
5. Start using OperaStudio!

