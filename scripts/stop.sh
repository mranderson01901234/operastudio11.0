#!/bin/bash
# OperaStudio Stop Script
# Kills all related processes

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          OperaStudio Stop - Killing All Processes         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

cd "$PROJECT_ROOT"

# Kill Next.js dev server (port 3000)
echo -e "${YELLOW}Killing processes on port 3000...${NC}"
if lsof -ti:3000 > /dev/null 2>&1; then
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}  ✓ Port 3000 cleared${NC}"
else
    echo -e "${GREEN}  ✓ Port 3000 is free${NC}"
fi

# Kill any Node.js processes related to this project
echo -e "${YELLOW}Killing Node.js processes in project directory...${NC}"
NODE_PIDS=$(pgrep -f "node.*$PROJECT_ROOT" 2>/dev/null || true)
if [ -n "$NODE_PIDS" ]; then
    echo "$NODE_PIDS" | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}  ✓ Node.js processes killed${NC}"
else
    echo -e "${GREEN}  ✓ No Node.js processes found${NC}"
fi

# Kill MCP server processes
echo -e "${YELLOW}Killing MCP server processes...${NC}"
MCP_PIDS=$(pgrep -f "mcp-server.*index.js" 2>/dev/null || true)
if [ -n "$MCP_PIDS" ]; then
    echo "$MCP_PIDS" | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}  ✓ MCP server processes killed${NC}"
else
    echo -e "${GREEN}  ✓ No MCP server processes found${NC}"
fi

# Kill any processes using project ports (except PostgreSQL in Docker)
echo -e "${YELLOW}Checking for processes on common ports...${NC}"
for port in 3000 5432; do
    if lsof -ti:$port > /dev/null 2>&1; then
        PID=$(lsof -ti:$port)
        # Don't kill PostgreSQL if it's in Docker
        if [ "$port" = "5432" ] && docker ps | grep -q operastudio-db; then
            echo -e "${BLUE}  → Port $port: PostgreSQL Docker container (keeping)${NC}"
        else
            kill -9 $PID 2>/dev/null || true
            echo -e "${GREEN}  ✓ Port $port cleared${NC}"
        fi
    else
        echo -e "${GREEN}  ✓ Port $port is free${NC}"
    fi
done

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✓ All Processes Stopped Successfully!         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

