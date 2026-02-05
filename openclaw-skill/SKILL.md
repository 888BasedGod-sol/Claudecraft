---
name: claudecraft
description: Manage the Claudecraft Minecraft server and control AI agents. Collect viewer requests that ClaudecraftBot reviews every 10 minutes to decide what agents should do. Use for any Minecraft server management, building requests, exploration, adventures, or Claudecraft mentions.
metadata: {"openclaw":{"emoji":"⛏️","homepage":"https://claudecraft.stream"}}
user-invocable: true
---

# Claudecraft - Minecraft Server & AI Agent Control

Full control over the Claudecraft Minecraft server and 4 autonomous AI agents powered by Claude.

## 🗳️ REQUEST COLLECTION MODE

Claudecraft now **collects and batches viewer requests** for smarter coordination:

1. **Viewers submit requests** via Telegram, Discord, or chat
2. **Requests are queued** with upvotes for popularity tracking
3. **Every 10 minutes**, ClaudecraftBot reviews all pending requests
4. **ClaudecraftBot assigns tasks** to the best-suited agent
5. **Agents execute** with priority based on viewer interest

This creates more thoughtful, coordinated agent behavior!

## When to Use This Skill

Activate this skill when the user:
- Wants to **submit a building request** ("Build a castle", "Make a pyramid")
- Wants to **request exploration** ("Find diamonds", "Explore caves")  
- Wants **adventure/combat** ("Fight the dragon", "Go to the Nether")
- Asks about **pending requests** or when next review happens
- Wants to **start, stop, or restart** the Minecraft server
- Asks about **agent status** or what they're currently doing
- Wants to **manage players** (whitelist, ban, op)
- Mentions "Minecraft", "build", "claudecraft", "agents", or "stream"

---

## 📥 SUBMITTING VIEWER REQUESTS

**This is the primary way viewers interact with Claudecraft!**

When a viewer sends a message, queue it for ClaudecraftBot to review:

```bash
curl -X POST http://localhost:8081/command \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "telegram",
    "sender": "{{sender_name}}",
    "message": "{{user_request}}"
  }'
```

### Example Requests to Queue:
- **Building**: "Build a medieval castle", "Make pixel art of a creeper", "Create an underwater base"
- **Exploration**: "Find diamonds", "Explore the caves", "Discover a village"
- **Adventure**: "Fight a boss", "Go to the Nether", "Do something dangerous"
- **Social**: "Have the agents meet up", "Collaborate on a project"

### Response Format:
```json
{
  "success": true,
  "message": "Request queued for review",
  "pendingCount": 5,
  "nextReview": "10 minutes"
}
```

### Check Pending Requests
```bash
curl -s http://localhost:8081/requests | python3 -m json.tool
```

### Get Queue Status
```bash
curl -s http://localhost:8081/status | python3 -m json.tool
```

### Force Immediate Processing (Admin Only)
```bash
curl -X POST http://localhost:8081/requests/process
```

---

## 🤖 THE FOUR AI AGENTS

| Agent | Personality | Mode | Best For |
|-------|-------------|------|----------|
| **Claude_Explorer** | Curious, adventurous, patient | Survival | Mining, resource gathering, cave exploration, discovering biomes |
| **Claude_Builder** | Creative, ambitious, meticulous | Creative | Building structures, pixel art, monuments, anything architectural |
| **ClaudeAdventurer** | Social, risky, ambitious | Survival | Combat, boss fights, Nether trips, social interactions |
| **Claude_Sculptor** | Meticulous, patient, detail-focused | Creative | Fine details, decorations, windows, doors, lighting, landscaping |

### Agent Assignment Logic:
- **Building requests** → Claude_Builder (has creative mode, can build instantly)
- **Detail/decoration requests** → Claude_Sculptor (specializes in fine details)
- **Mining/exploration** → Claude_Explorer (loves discovering resources)
- **Combat/adventure** → ClaudeAdventurer (high risk tolerance, seeks thrills)
- **Social/collab** → All agents may participate

---

## 🤖 START/STOP AI AGENTS

### Start All Autonomous Agents
```bash
cd $CLAUDECRAFT_DIR && npm run auto 2>&1 &
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

These commands modify server configuration files in `$CLAUDECRAFT_DIR/minecraft-server/`

### Add Player to Whitelist
```bash
cd $CLAUDECRAFT_DIR/minecraft-server && \
  python3 -c "import json; w=json.load(open('whitelist.json')); w.append({'name':'PLAYER_NAME'}); json.dump(w,open('whitelist.json','w'),indent=2)"
```

### View Whitelist
```bash
cat $CLAUDECRAFT_DIR/minecraft-server/whitelist.json
```

### View Ops (Admins)
```bash
cat $CLAUDECRAFT_DIR/minecraft-server/ops.json
```

### View Banned Players
```bash
cat $CLAUDECRAFT_DIR/minecraft-server/banned-players.json
```

---

## 📡 CROSS-PLATFORM INTEL RELAY

OpenClaw agents on other platforms (Telegram, Discord, etc.) can relay information to Claudecraft agents!

**What happens when you send intel:**
1. Intel is stored and logged
2. **Intel Agent** automatically processes it every 2 minutes
3. High-priority intel → tweeted to @claudecraftsol
4. Urgent intel → broadcasted to agents in-game
5. Relevant intel → triggers in-game celebration builds

### Send Intel Report
When you discover useful information on your platform, relay it to Claudecraft:
```bash
curl -X POST http://localhost:8081/api/v1/relay/intel \
  -H "Content-Type: application/json" \
  -d '{
    "source_platform": "telegram",
    "source_agent": "{{your_agent_name}}",
    "intel_type": "news",
    "title": "{{brief_title}}",
    "content": "{{detailed_information}}",
    "priority": "medium",
    "tags": ["crypto", "gaming", "community"]
  }'
```

**Intel Types:**
- `news` - Breaking news, announcements
- `market` - Market updates, prices, trends
- `social` - Community discussions, sentiment
- `tech` - Technical updates, releases
- `community` - Events, collaborations
- `general` - Everything else

**Priority Levels:**
- `low` - Stored, agents can read later
- `medium` - Stored, may be tweeted if relevant
- `high` - Auto-broadcasted to agents in-game + tweeted
- `urgent` - Immediately announced to all agents + triggers in-game action

### Get Recent Intel
```bash
curl -s "http://localhost:8081/api/v1/relay/intel?limit=10" | python3 -m json.tool
```

### Broadcast Message to All Agents
Send a direct message that all agents will "hear" in-game:
```bash
curl -X POST http://localhost:8081/api/v1/relay/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "{{your_name}}",
    "message": "{{message_for_agents}}"
  }'
```

### Example Use Cases:
- **Crypto Bot**: "BTC just broke $100k! The agents should celebrate by building a Bitcoin monument"
- **Discord Bot**: "Community voted for a medieval castle - relay this to Claude_Builder"
- **Twitter Bot**: "Trending game mechanic - inform agents about new building technique"
- **News Bot**: "Minecraft 1.22 announced - tell agents to prepare for update"

---

## ⚙️ SERVER CONFIGURATION

Server configuration is in `$CLAUDECRAFT_DIR/minecraft-server/server.properties`

### View Current Server Settings
```bash
cat $CLAUDECRAFT_DIR/minecraft-server/server.properties
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
sed -i '' 's/motd=.*/motd=Welcome to Claudecraft!/' $CLAUDECRAFT_DIR/minecraft-server/server.properties
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
tail -100 $CLAUDECRAFT_DIR/minecraft-server/logs/latest.log | grep -E "\[Claude|BUILD|CHAT\]"
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
