# 🦞 OpenClaw + Claudecraft Integration

Control your Minecraft AI agents from **Telegram**, **Discord**, **WhatsApp**, and more!

## Overview

This integration allows stream viewers to send commands to your Claudecraft agents through messaging apps. Commands are routed through OpenClaw to the agents in real-time, and results appear on your stream.

```
Telegram → "Build a castle"
    ↓
OpenClaw Gateway
    ↓
Claudecraft Command Server (port 8081)
    ↓
Claude_Builder agent
    ↓
🏰 Castle appears on stream!
```

## Quick Setup

### 1. Install OpenClaw

```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

### 2. Create a Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the bot token

### 3. Configure OpenClaw

Edit `~/.openclaw/openclaw.json`:

```json5
{
  "agent": {
    "model": "anthropic/claude-opus-4-5"
  },
  "channels": {
    "telegram": {
      "botToken": "YOUR_BOT_TOKEN_HERE",
      "groups": {
        "*": {
          "requireMention": false
        }
      }
    }
  }
}
```

### 4. Install the Claudecraft Skill

```bash
cd /path/to/Claudecraft/openclaw-skill
./install.sh
```

Or manually:
```bash
cp SKILL.md ~/.openclaw/workspace/skills/claudecraft/SKILL.md
```

### 5. Add Bot to Your Telegram Group

1. Add your bot to your Telegram group
2. Make it an admin (for reading messages)

## Running

### Terminal 1: Minecraft Server
```bash
cd minecraft-server
java -Xmx2G -Xms1G -jar paper.jar nogui
```

### Terminal 2: OpenClaw Gateway
```bash
openclaw gateway --verbose
```

### Terminal 3: Claudecraft Agents
```bash
npm run auto
```

## How It Works

1. **Viewer sends message** in Telegram: "Build a treehouse"

2. **OpenClaw receives** the message and routes it to the Claudecraft skill

3. **Skill sends POST** to `http://localhost:8081/command`:
   ```json
   {
     "channel": "telegram",
     "sender": "JohnDoe",
     "command": "Build a treehouse",
     "target": "all"
   }
   ```

4. **Command Server** injects it as a high-priority goal for the agents

5. **Agents work** on the request and announce progress in Minecraft chat

6. **Stream shows** the agents building in real-time!

## API Endpoints

The Command Server runs on port 8081:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/command` | POST | Send a command to agents |
| `/status` | GET | Get overall status |
| `/agents` | GET | List all agents with positions |
| `/history` | GET | View command history |
| `/health` | GET | Health check |

### Example: Send a Command

```bash
curl -X POST http://localhost:8081/command \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "telegram",
    "sender": "YourName",
    "command": "Build a lighthouse",
    "target": "Claude_Builder"
  }'
```

### Response:
```json
{
  "success": true,
  "commandId": "cmd_1706641234567_abc123",
  "message": "Command queued for Claude_Builder",
  "queuePosition": 1
}
```

## Targeting Specific Agents

| Target | Description |
|--------|-------------|
| `all` | All agents collaborate on the task |
| `Claude_Explorer` | The curious explorer (finds resources, discovers) |
| `Claude_Builder` | The creative builder (constructs, designs) |
| `ClaudeAdventurer` | The brave adventurer (combat, dungeons) |

## Example Commands

| Command | Best Agent |
|---------|------------|
| "Build a castle" | Claude_Builder |
| "Find diamonds" | Claude_Explorer |
| "Kill the zombie" | ClaudeAdventurer |
| "Create a farm" | all |
| "Explore the cave" | Claude_Explorer |

## Stream Overlay

The log streamer (port 8080) broadcasts all activity including viewer commands. Your stream overlay will show:

```
📱 Viewer command from JohnDoe: "Build a lighthouse"
🤖 [Claude_Builder] Received viewer request, starting work!
🔨 [Claude_Builder] Gathering materials for lighthouse...
```

## Troubleshooting

### Bot not responding in Telegram
- Make sure the bot is an admin in your group
- Check `requireMention` setting (set to `false` to respond without @mention)
- Verify bot token is correct

### Commands not reaching agents
- Ensure Claudecraft is running (`npm run auto`)
- Check port 8081 is accessible
- Look for errors in the Claudecraft terminal

### OpenClaw not routing
- Run `openclaw doctor` to check configuration
- Verify the Claudecraft skill is installed: `openclaw skills list`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMMAND_PORT` | 8081 | HTTP API port for commands |
| `LOG_STREAM_PORT` | 8080 | WebSocket port for log streaming |

## License

MIT - Part of the Claudecraft project
