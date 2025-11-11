#!/bin/bash

# Start OperaStudio HTTPS MCP Server for Claude Code
# Usage: ./start-https-server.sh [MODE] [PORT] [--https]

set -e

# Default values
MODE="${1:-BALANCED}"
PORT="${2:-3000}"
USE_HTTPS="${3:-}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}OperaStudio HTTPS MCP Server${NC}"
echo -e "${BLUE}============================${NC}"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Error: Node.js is not installed${NC}"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Build if dist doesn't exist
if [ ! -f "dist/https-server.js" ]; then
    echo -e "${YELLOW}Building server...${NC}"
    npm run build
fi

# Set environment variables
export MCP_MODE="$MODE"
export MCP_PORT="$PORT"

if [ "$USE_HTTPS" == "--https" ]; then
    export MCP_HTTPS="true"
    
    # Check for certificate files
    if [ -z "$MCP_CERT_PATH" ] || [ -z "$MCP_KEY_PATH" ]; then
        echo -e "${YELLOW}Warning: HTTPS enabled but certificates not set${NC}"
        echo -e "${YELLOW}Set MCP_CERT_PATH and MCP_KEY_PATH environment variables${NC}"
        echo -e "${YELLOW}Or use HTTP mode (remove --https flag)${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Starting HTTPS server on port $PORT (mode: $MODE)${NC}"
else
    export MCP_HTTPS="false"
    echo -e "${GREEN}Starting HTTP server on port $PORT (mode: $MODE)${NC}"
fi

echo ""
echo -e "${BLUE}Server endpoints:${NC}"
if [ "$USE_HTTPS" == "--https" ]; then
    echo -e "  MCP: ${GREEN}https://localhost:$PORT/mcp${NC}"
    echo -e "  Health: ${GREEN}https://localhost:$PORT/health${NC}"
    echo -e "  Updates: ${GREEN}https://localhost:$PORT/updates${NC}"
else
    echo -e "  MCP: ${GREEN}http://localhost:$PORT/mcp${NC}"
    echo -e "  Health: ${GREEN}http://localhost:$PORT/health${NC}"
    echo -e "  Updates: ${GREEN}http://localhost:$PORT/updates${NC}"
fi
echo ""
echo -e "${BLUE}Press Ctrl+C to stop${NC}"
echo ""

# Start the server
if [ "$USE_HTTPS" == "--https" ]; then
    node dist/https-server.js "$MODE" "$PORT" --https
else
    node dist/https-server.js "$MODE" "$PORT"
fi

