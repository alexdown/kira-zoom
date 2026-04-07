#!/bin/bash
# Kira startup script — starts cloudflared tunnel + server
# Usage: bash scripts/start.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Load token from .env
source .env

echo "🔧 Starting Cloudflare tunnel..."
pkill -f "cloudflared" 2>/dev/null || true
pkill -f "tsx server/index" 2>/dev/null || true
sleep 1

# Ensure stable URL in .env
sed -i "s|^WEBHOOK_BASE_URL=.*|WEBHOOK_BASE_URL=https://kira-zoom.alessiobasso.com|" .env
sed -i "s|^AVATAR_PUBLIC_URL=.*|AVATAR_PUBLIC_URL=https://kira-zoom.alessiobasso.com|" .env

# Start cloudflared in background
/home/ubuntu/cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
TUNNEL_PID=$!
echo "   ✅ Tunnel started (PID: $TUNNEL_PID)"
echo "   ✅ URL: https://kira-zoom.alessiobasso.com"

sleep 2

echo ""
echo "🤖 Starting Kira server..."
exec npx tsx server/index.ts
