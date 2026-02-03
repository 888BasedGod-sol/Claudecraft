---
name: claudecraft
description: Manage the Claudecraft Minecraft server and control AI agents. Collect viewer requests that ClaudecraftBot reviews every 3 hours to decide what agents should do. Use for any Minecraft server management, building requests, or Claudecraft mentions.
metadata: {"openclaw":{"emoji":"⛏️","homepage":"https://claudecraft.stream"}}
user-invocable: true
---

# Claudecraft - Minecraft Server & AI Agent Control

Full control over the Claudecraft Minecraft server and autonomous AI agents. 

## 🗳️ REQUEST COLLECTION MODE (NEW!)

Instead of executing commands immediately, Claudecraft now **collects viewer requests**:
1. Viewers submit requests via Telegram (e.g., "Build a castle", "Find diamonds")
2. Requests are queued with upvotes for popularity
3. **Every 3 hours**, ClaudecraftBot reviews all requests
4. ClaudecraftBot decides what each agent should focus on
5. Agents receive high-priority directives based on viewer requests

This creates more thoughtful, coordinated agent behavior!

## When to Use This Skill

Activate this skill when the user:
- Wants to **submit a building request** (will be queued for review)
- Asks about **pending requests** or when next review happens
- Wants to **start, stop, or restart** the Minecraft server
- Asks about **server status** or what agents are doing
- Wants to **manage players** (whitelist, ban, op, kick)
- Mentions "Minecraft", "build", "claudecraft", or "agents"

---

## 📥 SUBMITTING REQUESTS

When a viewer sends a message, it gets queued for ClaudecraftBot to review:

```bash
curl -X POST http://localhost:8081/command \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "telegram",
    "sender": "{{sender_name}}",
    "message": "{{user_request}}"
  }'
```

Response will include:
- How many requests are pending
- When the next review will happen

### Check Pending Requests
```bash
curl -s http://localhost:8081/requests | python3 -m json.tool
```

### Force Immediate Processing (Admin)
```bash
curl -X POST http://localhost:8081/requests/process
```

---

## 🖥️ SERVER MANAGEMENT

All server management commands are run from the Claudecraft directory: `/Users/zach/Claudecraft`

### Start the Minecraft Server
```bash
cd /Users/zach/Claudecraft/minecraft-server && java -Xmx4G -Xms2G -jar paper.jar nogui &
```

### Stop the Minecraft Server
First, find the process and send a graceful stop:
```bash
pkill -f "paper.jar" 2>/dev/null || echo "Server not running"
```

### Check if Server is Running
```bash
pgrep -f "paper.jar" && echo "✅ Server is running" || echo "❌ Server is not running"
```

### View Server Logs (last 50 lines)
```bash
tail -50 /Users/zach/Claudecraft/minecraft-server/logs/latest.log
```

### Check Server Port (25565)
```bash
lsof -i :25565 | head -5
```

---

## 🤖 START/STOP AI AGENTS

### Start All Autonomous Agents
```bash
cd /Users/zach/Claudecraft && npm run auto 2>&1 &
```

This starts 3 AI agents:
- **Claude_Explorer** - Curious, loves finding resources and exploring
- **Claude_Builder** - Creative, builds amazing structures (CREATIVE MODE)
- **ClaudeAdventurer** - Social, adventurous, high risk tolerance

### Stop All Agents
```bash
pkill -f "node dist/autonomousMode" 2>/dev/null && echo "✅ Agents stopped" || echo "No agents running"
```

### Check if Agents are Running
```bash
pgrep -f "autonomousMode" && echo "✅ Agents running" || echo "❌ Agents not running"
```

---

## 📡 AGENT COMMAND API

The Claudecraft command server runs on port 8081.

### Send a Building Command to Agents
Use this to make agents build something specific:
```bash
curl -X POST http://localhost:8081/command \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "telegram",
    "sender": "{{sender_name}}",
    "message": "{{user_request}}",
    "target": "Claude_Builder"
  }'
```

**Target options:**
- `"all"` - Send to all agents (they'll collaborate)
- `"Claude_Explorer"` - Send to the explorer
- `"Claude_Builder"` - Send to the builder (best for builds)
- `"ClaudeAdventurer"` - Send to the adventurer

### Check Agent Status
```bash
curl -s http://localhost:8081/status | python3 -m json.tool
```

### List Connected Agents
```bash
curl -s http://localhost:8081/agents | python3 -m json.tool
```

### Health Check
```bash
curl -s http://localhost:8081/health
```

### View Command History
```bash
curl -s http://localhost:8081/history | python3 -m json.tool
```

---

## 👥 PLAYER MANAGEMENT

These commands modify server configuration files in `/Users/zach/Claudecraft/minecraft-server/`

### Add Player to Whitelist
```bash
cd /Users/zach/Claudecraft/minecraft-server && \
  python3 -c "import json; w=json.load(open('whitelist.json')); w.append({'name':'PLAYER_NAME'}); json.dump(w,open('whitelist.json','w'),indent=2)"
```

### View Whitelist
```bash
cat /Users/zach/Claudecraft/minecraft-server/whitelist.json
```

### View Ops (Admins)
```bash
cat /Users/zach/Claudecraft/minecraft-server/ops.json
```

### View Banned Players
```bash
cat /Users/zach/Claudecraft/minecraft-server/banned-players.json
```

---

## ⚙️ SERVER CONFIGURATION

Server configuration is in `/Users/zach/Claudecraft/minecraft-server/server.properties`

### View Current Server Settings
```bash
cat /Users/zach/Claudecraft/minecraft-server/server.properties
```

### Key Settings to Know:
- `gamemode=creative` - Default gamemode for players
- `difficulty=peaceful` - No hostile mobs
- `max-players=20` - Maximum concurrent players
- `online-mode=false` - Offline/cracked mode enabled
- `allow-flight=true` - Flying allowed

### Change a Server Setting
Example - change MOTD:
```bash
sed -i '' 's/motd=.*/motd=Welcome to Claudecraft!/' /Users/zach/Claudecraft/minecraft-server/server.properties
```

---

## 🔨 EXAMPLE INTERACTIONS

### User asks: "Start the Minecraft server"
1. Run the start command
2. Wait a few seconds for boot
3. Verify it's running
4. Respond: "✅ Minecraft server is now running! Connect at localhost:25565"

### User asks: "Build me a castle"
1. Check agents are running
2. Send command to Claude_Builder
3. Respond: "🏰 I've asked Claude_Builder to build you a castle! Watch the stream to see it happen."

### User asks: "What are the agents doing?"
1. Call the status endpoint
2. Parse the response
3. Respond with a summary of each agent's current goal and mood

### User asks: "Stop everything"
1. Stop the agents first
2. Stop the Minecraft server
3. Respond: "✅ All agents and the Minecraft server have been shut down."

---

## 📊 MONITORING

### Full System Status Check
```bash
echo "=== Minecraft Server ===" && \
pgrep -f "paper.jar" && echo "Running" || echo "Not running" && \
echo "" && \
echo "=== AI Agents ===" && \
pgrep -f "autonomousMode" && echo "Running" || echo "Not running" && \
echo "" && \
echo "=== Command Server ===" && \
curl -s http://localhost:8081/health 2>/dev/null || echo "Not responding"
```

### View Recent Agent Activity
```bash
tail -100 /Users/zach/Claudecraft/minecraft-server/logs/latest.log | grep -E "\[Claude|BUILD|CHAT\]"
```

---

## 🎬 STREAMING INTEGRATION

The agents are designed for live streaming. When the stream is live:
- Viewers can send commands via Telegram
- Commands are routed through OpenClaw to this skill
- Agents execute commands and announce progress in Minecraft chat
- All activity is visible on stream!

---

## Notes

- The Minecraft server uses Paper (high-performance Spigot fork)
- Agents use Claude AI for decision-making
- Claude_Builder has **creative mode** - can build anything instantly
- Explorer and Adventurer are in **survival mode**
- Commands sent to agents become high-priority goals
