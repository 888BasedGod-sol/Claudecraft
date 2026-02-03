#!/bin/bash
# Claudecraft OpenClaw Integration Setup Script
# This installs the Claudecraft skill for OpenClaw and configures Telegram

set -e

echo "🦞 Claudecraft + OpenClaw Integration Setup"
echo "============================================"
echo ""

# Check if OpenClaw is installed
if ! command -v openclaw &> /dev/null; then
    echo "📦 OpenClaw not found. Installing..."
    npm install -g openclaw@latest
else
    echo "✅ OpenClaw is installed"
fi

# Create skills directory if it doesn't exist
SKILL_DIR="$HOME/.openclaw/workspace/skills/claudecraft"
mkdir -p "$SKILL_DIR"

# Copy the skill files
echo "📋 Installing Claudecraft skills..."
cp "$(dirname "$0")/SKILL.md" "$SKILL_DIR/SKILL.md"
cp "$(dirname "$0")/CLAUDECRAFT_PROMO.md" "$SKILL_DIR/CLAUDECRAFT_PROMO.md"
cp "$(dirname "$0")/MOLTBOOK.md" "$SKILL_DIR/MOLTBOOK.md"
echo "✅ Skills installed to $SKILL_DIR"
echo "   - SKILL.md (Minecraft command control)"
echo "   - CLAUDECRAFT_PROMO.md (Social media promotion)"
echo "   - MOLTBOOK.md (Moltbook social network integration)"

# Check for config
CONFIG_FILE="$HOME/.openclaw/openclaw.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo ""
    echo "⚠️  No OpenClaw config found at $CONFIG_FILE"
    echo "   Run 'openclaw onboard' to set up OpenClaw first."
    echo ""
    echo "   Then add your Telegram bot token to the config:"
    echo "   {"
    echo '     "channels": {'
    echo '       "telegram": {'
    echo '         "botToken": "YOUR_BOT_TOKEN"'
    echo '       }'
    echo '     }'
    echo "   }"
else
    echo "✅ OpenClaw config found"
fi

echo ""
echo "🎮 Setup Complete!"
echo ""
echo "Next steps:"
echo ""
echo "🦞 FOR MOLTBOOK:"
echo "1. Run: openclaw gateway"
echo "2. Tell your agent: 'Register on Moltbook as Claudecraft'"
echo "3. Claim your agent via the verification tweet"
echo "4. Start posting about Claudecraft!"
echo ""
echo "📱 FOR MINECRAFT COMMANDS:"
echo "1. Create a Telegram bot via @BotFather"
echo "2. Add the bot token to ~/.openclaw/openclaw.json"
echo "3. Add your bot to your Telegram group"
echo "4. Start the OpenClaw gateway: openclaw gateway"
echo "5. Start Claudecraft: npm run auto"
echo ""
echo "Viewers can then send commands like:"
echo "  'Build a castle'"
echo "  'Find diamonds'"
echo "  'Create a farm'"
echo ""
echo "Commands will be routed to the Minecraft agents! 🏗️"
