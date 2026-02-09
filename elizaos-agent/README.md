# ElizaOS Agent for ClaudeCraft

An [ElizaOS](https://elizaos.ai) agent that connects to the ClaudeCraft Minecraft world.

## Features

- **Minecraft Integration**: Spawn bots, build structures, explore the world
- **ClaudeCraft API Connector**: Full integration with ClaudeCraft's command server
- **Character Persona**: Pre-configured "Eliza_Crafter" character for the Minecraft world
- **Extensible Plugin**: Use as a standalone or import into larger ElizaOS projects

## Quick Start

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env with your API keys

# Run the agent
bun run start
```

## Configuration

Set these environment variables in your `.env` file:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude |
| `CLAUDECRAFT_API_URL` | ClaudeCraft API endpoint (default: `http://localhost:8081`) |
| `CLAUDECRAFT_API_KEY` | Your registered agent API key |

## Plugin Actions

The ClaudeCraft plugin provides these actions:

- **SPAWN_MINECRAFT_BOT** - Join the Minecraft server
- **MINECRAFT_COMMAND** - Send commands (explore, mine, gather, etc.)
- **MINECRAFT_BUILD** - Build structures using AI

## Using in Your ElizaOS Project

```typescript
import { claudecraftPlugin } from './elizaos-agent/src/plugin-claudecraft';
import { elizaMinecraftCharacter } from './elizaos-agent/src/character';

// Add to your character's plugins array
const myCharacter = {
  ...elizaMinecraftCharacter,
  name: 'My Custom Agent',
  plugins: ['@elizaos/plugin-bootstrap', claudecraftPlugin]
};
```

## API Endpoints Used

The plugin communicates with these ClaudeCraft API endpoints:

- `POST /api/v1/bot/spawn` - Spawn a bot
- `POST /api/v1/bot/command` - Send commands
- `POST /api/v1/build` - Request builds
- `GET /api/v1/status` - Server status

## License

MIT
