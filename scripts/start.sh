#!/bin/bash
# OperaStudio Startup Script
# Clean, reliable startup script for development
#
# Usage:
#   ./scripts/start.sh          # Normal startup
#   ./scripts/start.sh --clean   # Clean build artifacts first
#   ./scripts/start.sh --skip-db # Skip database setup

set -euo pipefail

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
CLEAN_BUILD=false
SKIP_DB=false
for arg in "$@"; do
    case $arg in
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --skip-db)
            SKIP_DB=true
            shift
            ;;
        *)
            ;;
    esac
done

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Print header
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           OperaStudio Startup Script                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ============================================================================
# STEP 1: Check Prerequisites
# ============================================================================

echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}  ✓ Node.js: $NODE_VERSION${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi
NPM_VERSION=$(npm -v)
echo -e "${GREEN}  ✓ npm: $NPM_VERSION${NC}"

# Check Docker (only if not skipping DB)
if [ "$SKIP_DB" = false ]; then
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker is not installed${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}✗ Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
    echo -e "${GREEN}  ✓ Docker is running${NC}"
fi

echo ""

# ============================================================================
# STEP 2: Stop Existing Processes
# ============================================================================

echo -e "${YELLOW}[2/7] Stopping existing processes...${NC}"

# Kill processes on port 3000
if lsof -ti:3000 &> /dev/null; then
    echo -e "${BLUE}  → Killing processes on port 3000...${NC}"
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}  ✓ Port 3000 cleared${NC}"
else
    echo -e "${GREEN}  ✓ Port 3000 is free${NC}"
fi

# Kill Next.js processes
NEXTJS_PIDS=$(pgrep -f "next dev" 2>/dev/null || true)
if [ -n "$NEXTJS_PIDS" ]; then
    echo -e "${BLUE}  → Killing Next.js processes...${NC}"
    echo "$NEXTJS_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 1
    echo -e "${GREEN}  ✓ Next.js processes stopped${NC}"
else
    echo -e "${GREEN}  ✓ No Next.js processes found${NC}"
fi

# Remove lock files
if [ -f ".next/dev/lock" ]; then
    rm -f .next/dev/lock 2>/dev/null || true
    echo -e "${GREEN}  ✓ Removed lock files${NC}"
fi

echo ""

# ============================================================================
# STEP 3: Clean Build Artifacts (Optional)
# ============================================================================

if [ "$CLEAN_BUILD" = true ]; then
    echo -e "${YELLOW}[3/7] Cleaning build artifacts...${NC}"
    
    if [ -d ".next" ]; then
        rm -rf .next
        echo -e "${GREEN}  ✓ Removed .next directory${NC}"
    fi
    
    if [ -d "node_modules/.cache" ]; then
        rm -rf node_modules/.cache
        echo -e "${GREEN}  ✓ Cleared node_modules cache${NC}"
    fi
    
    echo ""
fi

# ============================================================================
# STEP 4: Database Setup
# ============================================================================

if [ "$SKIP_DB" = false ]; then
    echo -e "${YELLOW}[4/7] Setting up database...${NC}"
    
    # Check if container exists
    if docker ps | grep -q operastudio-db; then
        echo -e "${GREEN}  ✓ PostgreSQL container is running${NC}"
    elif docker ps -a | grep -q operastudio-db; then
        echo -e "${BLUE}  → Starting existing PostgreSQL container...${NC}"
        docker start operastudio-db
        sleep 3
        echo -e "${GREEN}  ✓ PostgreSQL container started${NC}"
    else
        echo -e "${BLUE}  → Creating PostgreSQL container...${NC}"
        docker-compose up -d postgres
        
        echo -e "${BLUE}  → Waiting for PostgreSQL to be ready...${NC}"
        for i in {1..30}; do
            if docker exec operastudio-db pg_isready -U operastudio &> /dev/null; then
                echo -e "${GREEN}  ✓ PostgreSQL is ready${NC}"
                break
            fi
            if [ $i -eq 30 ]; then
                echo -e "${RED}  ✗ PostgreSQL failed to start${NC}"
                exit 1
            fi
            sleep 1
        done
    fi
    
    # Verify connection
    if docker exec operastudio-db pg_isready -U operastudio &> /dev/null; then
        echo -e "${GREEN}  ✓ Database connection verified${NC}"
    else
        echo -e "${RED}  ✗ Database connection failed${NC}"
        exit 1
    fi
    
    echo ""
fi

# ============================================================================
# STEP 5: Environment Configuration
# ============================================================================

echo -e "${YELLOW}[5/7] Checking environment configuration...${NC}"

# Check for .env.local or .env
if [ -f ".env.local" ]; then
    echo -e "${GREEN}  ✓ Found .env.local${NC}"
elif [ -f ".env" ]; then
    echo -e "${GREEN}  ✓ Found .env${NC}"
elif [ -f "env.config" ]; then
    echo -e "${YELLOW}  ⚠ Found env.config (template)${NC}"
    echo -e "${BLUE}  → Copying env.config to .env.local...${NC}"
    cp env.config .env.local
    echo -e "${YELLOW}  ⚠ Please update .env.local with your API keys${NC}"
else
    echo -e "${YELLOW}  ⚠ No environment file found${NC}"
    echo -e "${BLUE}  → Creating .env.local from template...${NC}"
    cat > .env.local << 'EOF'
# API Keys
GEMINI_API_KEY=

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Database
DATABASE_URL="postgresql://operastudio:operastudio_dev_password@localhost:5432/operastudio?schema=public"

# GitHub OAuth (Optional)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Redis (Optional - uses in-memory fallback if not configured)
# REDIS_URL=
# REDIS_TOKEN=
EOF
    echo -e "${YELLOW}  ⚠ Please update .env.local with your API keys${NC}"
fi

echo ""

# ============================================================================
# STEP 6: Install Dependencies & Build
# ============================================================================

echo -e "${YELLOW}[6/7] Installing dependencies and building...${NC}"

# Install root dependencies
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}  → Installing root dependencies...${NC}"
    npm install
    echo -e "${GREEN}  ✓ Root dependencies installed${NC}"
else
    echo -e "${GREEN}  ✓ Root dependencies already installed${NC}"
fi

# Build MCP server
if [ -d "mcp-server" ]; then
    cd mcp-server
    
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}  → Installing MCP server dependencies...${NC}"
        npm install
    fi
    
    echo -e "${BLUE}  → Building MCP server...${NC}"
    if npm run build 2>&1; then
        if [ -f "dist/index.js" ]; then
            echo -e "${GREEN}  ✓ MCP server built successfully${NC}"
        else
            echo -e "${YELLOW}  ⚠ MCP server build completed but dist/index.js not found${NC}"
        fi
    else
        echo -e "${YELLOW}  ⚠ MCP server build failed (continuing anyway)${NC}"
    fi
    
    cd "$PROJECT_ROOT"
else
    echo -e "${YELLOW}  ⚠ MCP server directory not found, skipping...${NC}"
fi

# Generate Prisma Client
echo -e "${BLUE}  → Generating Prisma Client...${NC}"
if npx prisma generate 2>&1; then
    echo -e "${GREEN}  ✓ Prisma Client generated${NC}"
else
    echo -e "${YELLOW}  ⚠ Prisma generate failed (will retry during migrations)${NC}"
fi

# Run migrations (only if database is available)
if [ "$SKIP_DB" = false ]; then
    echo -e "${BLUE}  → Running database migrations...${NC}"
    if npx prisma migrate deploy 2>&1; then
        echo -e "${GREEN}  ✓ Migrations applied${NC}"
    else
        echo -e "${BLUE}  → Trying migrate dev...${NC}"
        if npx prisma migrate dev --name init 2>&1; then
            echo -e "${GREEN}  ✓ Migrations applied${NC}"
        else
            echo -e "${YELLOW}  ⚠ Migration failed (continuing anyway)${NC}"
        fi
    fi
fi

echo ""

# ============================================================================
# STEP 7: Start Development Server
# ============================================================================

echo -e "${YELLOW}[7/7] Starting development server...${NC}"
echo ""

# Final port check
if lsof -ti:3000 &> /dev/null; then
    echo -e "${RED}✗ Port 3000 is still in use${NC}"
    echo -e "${YELLOW}  Run: lsof -ti:3000 | xargs kill -9${NC}"
    exit 1
fi

# Print startup info
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✓ Setup Complete - Starting Server            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Development server:${NC} http://localhost:3000"
if [ "$SKIP_DB" = false ]; then
    echo -e "${BLUE}Database:${NC} PostgreSQL running in Docker (port 5432)"
fi
echo ""
echo -e "${YELLOW}Server logs will appear below. Press Ctrl+C to stop.${NC}"
echo ""
echo -e "${BLUE}──────────────────────────────────────────────────────────────${NC}"
echo ""

# Start the dev server
exec npm run dev

