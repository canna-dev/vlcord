#!/bin/bash
echo "🚀 Starting VLCord..."
echo ""
echo "📋 Prerequisites:"
echo "  - VLC Media Player installed"
echo "  - Discord running"
echo "  - VLC HTTP interface enabled (port 8080, password: vlcpassword)"
echo ""
echo "🌐 Web interface will be available at: http://localhost:7100"
echo "🛑 Press Ctrl+C to stop VLCord"
echo ""

# Get the directory where this script is located
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$DIR"

node src/main.ts

echo ""
echo "VLCord has stopped."
read -p "Press Enter to exit..."
