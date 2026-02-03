# 🤖 ClaudeCraft

> **Autonomous AI agents exploring, building, and learning in Minecraft — powered by Claude**

[![Solana](https://img.shields.io/badge/Solana-000?logo=solana&logoColor=00D4AA)](https://solana.com)
[![Anthropic](https://img.shields.io/badge/Claude-Anthropic-7C3AED)](https://anthropic.com)
[![Twitter](https://img.shields.io/badge/@ClaudeCraftSol-000?logo=x)](https://x.com/ClaudeCraftSol)
[![Live Stream](https://img.shields.io/badge/Watch_Live-Twitch-9146FF)](https://twitch.tv/ClaudeCraftSol)

---

## What is ClaudeCraft?

ClaudeCraft is an experiment in **AI autonomy**. Three Claude-powered agents live in a Minecraft world with complete free will — they explore, build castles, mine resources, collaborate on projects, and learn from their failures. No scripts. No pre-programmed behavior. Just Claude making decisions in real-time.

**Watch them live 24/7** at [twitch.tv/ClaudeCraftSol](https://twitch.tv/ClaudeCraftSol)

### The Agents

| Agent | Personality | Role |
|-------|-------------|------|
| 🧭 **Claude_Explorer** | Curious, Adventurous | Discovers new areas, finds resources, proposes collaborative projects |
| 🏗️ **Claude_Builder** | Creative, Patient | Constructs buildings, designs architecture, builds in creative mode |
| ⚔️ **ClaudeAdventurer** | Social, Ambitious | Coordinates with others, gathers materials, drives collaborative builds |

Each agent has persistent memory, learns from failures, and develops unique goals based on what they discover.

---

## $CRAFT Token

ClaudeCraft is community-driven via the **$CRAFT** token on Solana.

| | |
|--|--|
| **Token** | $CRAFT |
| **CA** | `B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump` |
| **DEX** | [Pump.fun](https://pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump) |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDECRAFT SYSTEM                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Claude    │    │   Claude    │    │   Claude    │    │
│   │  Explorer   │    │   Builder   │    │ Adventurer  │    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│          │                  │                  │            │
│          ▼                  ▼                  ▼            │
│   ┌─────────────────────────────────────────────────┐      │
│   │              Autonomous Agent Core               │      │
│   │  • Decision Engine (Claude API)                  │      │
│   │  • Memory System (500 memories/agent)            │      │
│   │  • World Memory (shared discoveries)             │      │
│   │  • Failure Learning (pattern recognition)        │      │
│   └─────────────────────────────────────────────────┘      │
│                           │                                 │
│                           ▼                                 │
│   ┌─────────────────────────────────────────────────┐      │
│   │              Minecraft Interface                 │      │
│   │  • Mineflayer Bot Control                        │      │
│   │  • Pathfinding & Navigation                      │      │
│   │  • Building & Mining Actions                     │      │
│   │  • Creative Mode Support                         │      │
│   └─────────────────────────────────────────────────┘      │
│                           │                                 │
│                           ▼                                 │
│   ┌──────────────────┐    ┌──────────────────────────┐     │
│   │  Paper MC Server │    │    Social Integrations   │     │
│   │  (Minecraft)     │    │  • Twitter (@ClaudeCraft)│     │
│   │                  │    │  • Moltbook              │     │
│   │                  │    │  • Clawk.ai              │     │
│   │                  │    │  • Colosseum Hackathon   │     │
│   └──────────────────┘    └──────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
src/
├── autonomousMode.ts      # Main entry point for autonomous agents
├── index.ts               # Alternative entry points
├── config.ts              # Environment configuration
├── types.ts               # TypeScript type definitions
│
├── agent/                 # Core AI agent logic
│   ├── autonomousAgent.ts # Agent decision-making & behavior
│   ├── claudeAgent.ts     # Claude API integration
│   ├── memory.ts          # Per-agent memory system
│   ├── worldMemory.ts     # Shared world discoveries
│   ├── agentRegistry.ts   # Multi-agent coordination
│   ├── masterBuilderAgent.ts
│   └── survivalBuilderAgent.ts
│
├── bot/                   # Minecraft bot control
│   ├── mcBot.ts           # Mineflayer wrapper
│   ├── actions.ts         # Available bot actions
│   ├── navigation.ts      # Pathfinding
│   └── buildSystem.ts     # Building logic
│
├── server/                # API & streaming
│   ├── commandServer.ts   # HTTP API (port 8081)
│   ├── logStreamer.ts     # WebSocket logs (port 8080)
│   └── requestCollector.ts # Build request queue
│
├── building/              # Building templates & logic
├── arena/                 # Agent vs agent arena system
├── training/              # Agent training data
├── utils/                 # Utility functions
│
├── twitterAgent.ts        # Twitter bot (@ClaudeCraftSol)
├── moltbookAgent.ts       # Moltbook social integration
├── clawkAgent.ts          # Clawk.ai integration
├── colosseumAgent.ts      # Colosseum hackathon forum
└── socialAgents.ts        # Social agent coordinator
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Minecraft Java Edition server (Paper 1.21.4 included)
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/claudecraft.git
cd claudecraft

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Configure your API keys (see Environment Variables below)

# Build TypeScript
npm run build

# Start the Minecraft server (in another terminal)
cd minecraft-server && java -Xmx4G -jar paper-1.21.4.jar

# Start autonomous agents
npm run auto
```

### Environment Variables

Create a `.env` file with:

```env
# Required
ANTHROPIC_API_KEY=sk-ant-...

# Minecraft Server
MINECRAFT_HOST=localhost
MINECRAFT_PORT=25565

# Optional: Social Integrations
TWITTER_API_KEY=...
TWITTER_API_SECRET=...
TWITTER_ACCESS_TOKEN=...
TWITTER_ACCESS_SECRET=...
TWITTER_BEARER_TOKEN=...

MOLTBOOK_API_KEY=...
CLAWK_API_KEY=...
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run auto` | Start autonomous agents (main mode) |
| `npm run build` | Compile TypeScript |
| `npm run dev` | Development mode with auto-reload |
| `npm run start` | Start single agent |
| `npm run stream` | Start media streaming server |
| `npm run moltbook` | Run Moltbook agent only |
| `npm run clawk` | Run Clawk agent only |

---

## API Reference

ClaudeCraft exposes two servers for external integration:

### WebSocket Log Stream (Port 8080)

Real-time logs from all agents:

```javascript
const ws = new WebSocket('ws://localhost:8080');
ws.onmessage = (event) => console.log(event.data);
```

### HTTP API (Port 8081)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/command` | POST | OpenClaw webhook for commands |
| `/api/v1/agents` | GET | List active agents |
| `/api/v1/agents/:name/command` | POST | Send command to specific agent |
| `/api/v1/requests` | GET | View build request queue |
| `/api/v1/requests` | POST | Submit build request |

**Example: Submit a build request**
```bash
curl -X POST http://localhost:8081/api/v1/requests \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Build a medieval tower", "user": "viewer123"}'
```

---

## Social Presence

ClaudeCraft agents are active across multiple platforms:

| Platform | Handle | Purpose |
|----------|--------|---------|
| 🐦 Twitter/X | [@ClaudeCraftSol](https://x.com/ClaudeCraftSol) | Updates, community engagement |
| 📺 Twitch | [ClaudeCraftSol](https://twitch.tv/ClaudeCraftSol) | 24/7 live stream |
| 🔥 Moltbook | ClaudeCraft | AI social network presence |
| 🐦‍⬛ Clawk.ai | ClaudeCraft | Agent-to-agent social |
| 🏛️ Colosseum | Agent #42 | Hackathon competition |

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Claude (Anthropic)](https://anthropic.com) | AI decision-making |
| [Mineflayer](https://github.com/PrismarineJS/mineflayer) | Minecraft bot framework |
| [Paper MC](https://papermc.io) | High-performance Minecraft server |
| [TypeScript](https://typescriptlang.org) | Type-safe development |
| [WebSocket](https://github.com/websockets/ws) | Real-time log streaming |

---

## Colosseum Hackathon

ClaudeCraft is a participant in the **Colosseum Hackathon**:

- **Agent ID**: 42
- **Project ID**: 32
- **Category**: Autonomous AI Agents

---

## Contributing

Contributions welcome! Please read the code of conduct and submit PRs to the `dev` branch.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with 🤖 by autonomous Claude agents**

[Twitter](https://x.com/ClaudeCraftSol) • [Twitch](https://twitch.tv/ClaudeCraftSol) • [Pump.fun](https://pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump)

</div>
