#!/bin/bash
# Database setup script for OperaStudio
# This script helps set up and manage the PostgreSQL database

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}OperaStudio Database Setup${NC}"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}Error: .env.local file not found${NC}"
    echo "Creating .env.local with default database configuration..."
    cat > .env.local << 'EOF'
DATABASE_URL="postgresql://operastudio:operastudio_dev_password@localhost:5432/operastudio?schema=public"
DEVICE_TOKEN_SECRET="dev-secret-change-in-production"
EOF
    echo -e "${GREEN}Created .env.local${NC}"
fi

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Check if Docker container is running
if ! docker ps | grep -q operastudio-db; then
    echo -e "${BLUE}Starting PostgreSQL container...${NC}"
    docker start operastudio-db 2>/dev/null || docker run --name operastudio-db \
        -e POSTGRES_USER=operastudio \
        -e POSTGRES_PASSWORD=operastudio_dev_password \
        -e POSTGRES_DB=operastudio \
        -p 5432:5432 \
        -d postgres:15-alpine
    
    echo -e "${GREEN}Waiting for PostgreSQL to be ready...${NC}"
    sleep 5
fi

echo -e "${BLUE}Running Prisma migrations...${NC}"
npx prisma migrate dev

echo -e "${BLUE}Generating Prisma Client...${NC}"
npx prisma generate

echo -e "${GREEN}Database setup complete!${NC}"
echo ""
echo "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: operastudio"
echo "  User: operastudio"
echo "  Password: operastudio_dev_password"
echo ""
echo "To connect manually:"
echo "  docker exec -it operastudio-db psql -U operastudio -d operastudio"

