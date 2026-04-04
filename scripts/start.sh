#!/bin/bash
# Kira startup script — starts tunnel + server
# Usage: bash scripts/start.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "🔧 Starting localhost.run tunnel..."

# Kill any existing tunnel/server
pkill -f "ssh.*localhost.run" 2>/dev/null || true
pkill -f "tsx server/index" 2>/dev/null || true
sleep 1

# Start tunnel in background, capture the URL
TUNNEL_LOG=$(mktemp)
ssh -o StrictHostKeyChecking=accept-new -i ~/.ssh/localhost_run -R 80:localhost:3000 ssh.localhost.run > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL to appear
echo "   Waiting for tunnel URL..."
for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -oP 'https://[a-z0-9]+\.lhr\.life' "$TUNNEL_LOG" | head -1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Failed to get tunnel URL after 30s"
    cat "$TUNNEL_LOG"
    exit 1
fi

echo "   ✅ Tunnel: $TUNNEL_URL (PID: $TUNNEL_PID)"

# Update .env with the tunnel URL
sed -i "s|^WEBHOOK_BASE_URL=.*|WEBHOOK_BASE_URL=$TUNNEL_URL|" .env
sed -i "s|^AVATAR_PUBLIC_URL=.*|AVATAR_PUBLIC_URL=$TUNNEL_URL|" .env
echo "   ✅ Updated .env"

# Save tunnel URL for other scripts
echo "$TUNNEL_URL" > /tmp/kira_tunnel_url

echo ""
echo "🤖 Starting Kira server..."
exec npx tsx server/index.ts
