/**
 * ElizaOS Agent for ClaudeCraft
 * 
 * Standalone ElizaOS agent that connects to the ClaudeCraft Minecraft world.
 * Run with: bun run start
 */

import { AgentRuntime, stringToUuid, type Memory, type Content, type IAgentRuntime } from '@elizaos/core';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';
import { claudecraftPlugin } from './src/plugin-claudecraft';
import { elizaMinecraftCharacter } from './src/character';
import * as readline from 'readline';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     🎮 ELIZA CLAUDECRAFT AGENT 🎮                              ║
║                                                                ║
║   ElizaOS meets Minecraft - AI agents building together        ║
╚════════════════════════════════════════════════════════════════╝
  `);

  if (!ANTHROPIC_API_KEY) {
    console.error('❌ Missing API key! Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.');
    process.exit(1);
  }

  console.log(`
✅ Agent: ${elizaMinecraftCharacter.name}
📍 ClaudeCraft API: ${process.env.CLAUDECRAFT_API_URL || 'http://localhost:8081'}
🔑 API Key: ${process.env.CLAUDECRAFT_API_KEY ? 'SET' : 'NOT SET'}

The ElizaOS agent is ready to be connected.
To use with full ElizaOS features, run: elizaos start

For now, the plugin is available to import in any ElizaOS project.

═══════════════════════════════════════════════════════════════════
  `);

  console.log('Plugin exports available:');
  console.log('  - claudecraftPlugin (full plugin)');
  console.log('  - elizaMinecraftCharacter (agent character)');
  console.log('\nTo use in an ElizaOS project:');
  console.log('  import { claudecraftPlugin } from "./elizaos-agent/src/plugin-claudecraft"');
  console.log('  import { elizaMinecraftCharacter } from "./elizaos-agent/src/character"');
}

main().catch(console.error);

// Export for use in other projects
export { claudecraftPlugin } from './src/plugin-claudecraft';
export { elizaMinecraftCharacter } from './src/character';