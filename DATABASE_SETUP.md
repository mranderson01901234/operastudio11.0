# Database Setup Guide

This guide explains how to set up and manage the PostgreSQL database for OperaStudio.

## Quick Start

The easiest way to set up the database is using the provided script:

```bash
npm run db:setup
```

This script will:
1. Create `.env.local` if it doesn't exist
2. Start the PostgreSQL Docker container
3. Run Prisma migrations
4. Generate Prisma Client

## Manual Setup

### Option 1: Docker (Recommended)

1. **Start PostgreSQL container:**
   ```bash
   docker run --name operastudio-db \
     -e POSTGRES_USER=operastudio \
     -e POSTGRES_PASSWORD=operastudio_dev_password \
     -e POSTGRES_DB=operastudio \
     -p 5432:5432 \
     -d postgres:15-alpine
   ```

2. **Create `.env.local` file:**
   ```bash
   DATABASE_URL="postgresql://operastudio:operastudio_dev_password@localhost:5432/operastudio?schema=public"
   DEVICE_TOKEN_SECRET="dev-secret-change-in-production"
   ```

3. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

### Option 2: Docker Compose

1. **Start services:**
   ```bash
   docker compose up -d
   ```

2. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

### Option 3: Local PostgreSQL

1. **Install PostgreSQL** (if not already installed)

2. **Create database and user:**
   ```sql
   CREATE USER operastudio WITH PASSWORD 'operastudio_dev_password';
   CREATE DATABASE operastudio OWNER operastudio;
   GRANT ALL PRIVILEGES ON DATABASE operastudio TO operastudio;
   ```

3. **Update `.env.local`:**
   ```bash
   DATABASE_URL="postgresql://operastudio:operastudio_dev_password@localhost:5432/operastudio?schema=public"
   ```

4. **Run migrations:**
   ```bash
   npm run db:migrate
   ```

## Database Credentials

**Development (Docker):**
- **Host:** localhost
- **Port:** 5432
- **Database:** operastudio
- **User:** operastudio
- **Password:** operastudio_dev_password

⚠️ **Important:** Change the password in production!

## Available Scripts

- `npm run db:migrate` - Run database migrations
- `npm run db:generate` - Generate Prisma Client
- `npm run db:studio` - Open Prisma Studio (database GUI)
- `npm run db:reset` - Reset database (⚠️ deletes all data)
- `npm run db:setup` - Run setup script

## Database Schema

The database includes the following tables:

1. **`devices`** - Device registration and pairing
2. **`device_keys`** - Device key management
3. **`local_sessions`** - Active session management
4. **`tool_runs`** - Tool execution audit log

See `prisma/schema.prisma` for the complete schema definition.

## Managing the Database

### View Database in Prisma Studio

```bash
npm run db:studio
```

This opens a web interface at `http://localhost:5555` where you can browse and edit data.

### Connect via psql

```bash
docker exec -it operastudio-db psql -U operastudio -d operastudio
```

### Stop Database Container

```bash
docker stop operastudio-db
```

### Start Database Container

```bash
docker start operastudio-db
```

### Remove Database Container (⚠️ deletes data)

```bash
docker stop operastudio-db
docker rm operastudio-db
```

## Troubleshooting

### Migration Fails

If migrations fail, check:
1. Database is running: `docker ps | grep operastudio-db`
2. DATABASE_URL is correct in `.env.local`
3. Database user has proper permissions

### Connection Refused

If you get connection refused:
1. Check if container is running: `docker ps`
2. Check if port 5432 is available: `lsof -i :5432`
3. Restart container: `docker restart operastudio-db`

### Reset Database

To completely reset the database:

```bash
npm run db:reset
```

This will:
- Drop all tables
- Run all migrations from scratch
- Seed the database (if seed script exists)

## Production Setup

For production, you should:

1. **Use a managed PostgreSQL service** (AWS RDS, Google Cloud SQL, etc.)
2. **Use strong passwords** (generate with `openssl rand -hex 32`)
3. **Enable SSL connections** in DATABASE_URL
4. **Set up backups** and monitoring
5. **Use connection pooling** (Prisma supports this)

Example production DATABASE_URL:
```
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public&sslmode=require"
```

## Environment Variables

Required in `.env.local`:

- `DATABASE_URL` - PostgreSQL connection string
- `DEVICE_TOKEN_SECRET` - Secret for device token signing (change in production)

Optional:

- `DATABASE_URL_NON_POOLING` - Direct connection URL (for migrations)

---

**Last Updated:** 2025-01-27

