#!/bin/bash
# Arena Builder Script
# Executes arena build commands via Minecraft server console

# Read commands from JSON
COMMANDS_FILE="/Users/zach/Claudecraft/data/arena/build-commands.json"

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "jq is required. Install with: brew install jq"
    exit 1
fi

# Extract commands from JSON
echo "📦 Extracting commands..."
COMMANDS=$(cat "$COMMANDS_FILE" | jq -r '.commands[]')

# Count commands
TOTAL=$(cat "$COMMANDS_FILE" | jq '.commandCount')
echo "🏗️ Building arena with $TOTAL commands..."

# Execute each command in the Minecraft server
COUNT=0
echo "$COMMANDS" | while read -r cmd; do
    COUNT=$((COUNT + 1))
    # Remove leading slash for server console
    CMD_CLEAN="${cmd#/}"
    
    # Send to screen session
    screen -S minecraft -p 0 -X stuff "$CMD_CLEAN$(printf '\r')"
    
    # Progress every 50 commands
    if [ $((COUNT % 50)) -eq 0 ]; then
        echo "  Progress: $COUNT / $TOTAL commands executed"
        sleep 0.5
    fi
    
    # Small delay to avoid flooding
    sleep 0.05
done

echo "✅ Arena construction complete!"
echo "📍 Location: (500, 70, 500)"
echo "🎮 Teleport there with: /tp @p 500 71 500"
