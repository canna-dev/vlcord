#!/bin/bash
# VLCord Quick-Start Deployment Script
# Automates setup and deployment process

set -e

echo "========================================="
echo "VLCord Quick-Start Deployment"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Node.js is installed
echo "[1/7] Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js ${NODE_VERSION} detected${NC}"
echo ""

# Check if npm is installed
echo "[2/7] Checking npm installation..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✓ npm ${NPM_VERSION} detected${NC}"
echo ""

# Copy .env.example if .env doesn't exist
echo "[3/7] Setting up environment configuration..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ Created .env from template${NC}"
    else
        echo -e "${YELLOW}! .env.example not found, creating basic .env${NC}"
        cat > .env << 'EOF'
WEB_PORT=7100
NODE_ENV=development
DISCORD_CLIENT_ID=your-discord-client-id
VLCORD_ADMIN_TOKEN=your-secure-token
TMDB_API_KEY=your-tmdb-api-key
VLC_HOST=localhost
VLC_PORT=8080
REDIS_ENABLED=false
EOF
    fi
    echo "⚠️  Please edit .env with your actual credentials:"
    echo "   nano .env"
    echo ""
    read -p "Press Enter to continue after updating .env..."
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi
echo ""

# Install dependencies
echo "[4/7] Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi
echo ""

# Check for Redis
echo "[5/7] Checking Redis availability (optional)..."
if command -v redis-cli &> /dev/null; then
    echo -e "${GREEN}✓ Redis CLI found${NC}"
    if redis-cli ping &> /dev/null; then
        echo -e "${GREEN}✓ Redis server is running${NC}"
        echo "   To enable caching, set REDIS_ENABLED=true in .env"
    else
        echo -e "${YELLOW}! Redis CLI found but server not running${NC}"
        echo "   To start Redis:"
        echo "   - macOS: brew services start redis"
        echo "   - Linux: sudo systemctl start redis-server"
        echo "   - Docker: docker run -d -p 6379:6379 redis:latest"
    fi
elif command -v docker &> /dev/null; then
    echo -e "${YELLOW}! Redis not found locally, but Docker is available${NC}"
    echo "   To use Redis with Docker:"
    echo "   docker run -d -p 6379:6379 --name vlcord-redis redis:latest"
else
    echo -e "${YELLOW}! Redis not installed (optional, caching disabled)${NC}"
fi
echo ""

# Validate configuration
echo "[6/7] Validating configuration..."
ERRORS=0

# Check required environment variables
if grep -q "your-discord-client-id" .env; then
    echo -e "${RED}✗ DISCORD_CLIENT_ID not configured${NC}"
    ERRORS=$((ERRORS+1))
fi

if grep -q "your-secure-token" .env; then
    echo -e "${RED}✗ VLCORD_ADMIN_TOKEN not configured${NC}"
    ERRORS=$((ERRORS+1))
fi

if grep -q "your-tmdb-api-key" .env; then
    echo -e "${RED}✗ TMDB_API_KEY not configured${NC}"
    ERRORS=$((ERRORS+1))
fi

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ Please configure missing environment variables in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Configuration validated${NC}"
echo ""

# Ready to start
echo "[7/7] Deployment preparation complete!"
echo ""
echo "========================================="
echo "Ready to start VLCord!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Review your configuration:"
echo "   cat .env"
echo ""
echo "2. Start the application:"
echo "   npm start"
echo ""
echo "3. Access the dashboard:"
echo "   http://localhost:7100"
echo ""
echo "4. (Optional) Install PM2 for production:"
echo "   npm install -g pm2"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "For detailed deployment instructions, see DEPLOYMENT.md"
echo ""

read -p "Do you want to start the application now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting VLCord..."
    npm start
fi
