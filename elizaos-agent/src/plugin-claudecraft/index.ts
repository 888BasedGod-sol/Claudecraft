/**
 * ElizaOS Plugin for ClaudeCraft Minecraft Integration
 * 
 * This plugin allows an ElizaOS agent to control a Minecraft bot
 * through the ClaudeCraft command server API.
 */

import type { Plugin, Action, ActionResult, IAgentRuntime, Memory, HandlerCallback, State, Provider } from '@elizaos/core';
import { logger } from '@elizaos/core';

const CLAUDECRAFT_API = process.env.CLAUDECRAFT_API_URL || 'http://localhost:8081';
const CLAUDECRAFT_API_KEY = process.env.CLAUDECRAFT_API_KEY || '';

interface BotStatus {
  online: boolean;
  position?: { x: number; y: number; z: number };
  health?: number;
  food?: number;
  inventory?: Record<string, number>;
}

// Helper to make API calls to ClaudeCraft
async function claudecraftFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  
  if (CLAUDECRAFT_API_KEY) {
    headers['Authorization'] = `Bearer ${CLAUDECRAFT_API_KEY}`;
  }

  const response = await fetch(`${CLAUDECRAFT_API}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ClaudeCraft API error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ==================== ACTIONS ====================

/**
 * Action: Spawn a Minecraft bot
 */
const spawnBotAction: Action = {
  name: 'SPAWN_MINECRAFT_BOT',
  similes: ['JOIN_MINECRAFT', 'CONNECT_TO_MINECRAFT', 'SPAWN_IN_GAME', 'ENTER_MINECRAFT'],
  description: 'Spawn a bot in the Minecraft server to explore and build',
  
  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const apiKey = runtime.getSetting('CLAUDECRAFT_API_KEY');
    if (!apiKey) {
      logger.warn('CLAUDECRAFT_API_KEY not set - bot spawn may fail');
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      const result = await claudecraftFetch('/api/v1/bot/spawn', {
        method: 'POST',
        body: JSON.stringify({
          agent_name: runtime.character.name || 'ElizaAgent'
        })
      });

      const responseText = `🎮 Bot spawned in Minecraft! Position: (${result.position?.x || 0}, ${result.position?.y || 0}, ${result.position?.z || 0})`;
      
      if (callback) {
        await callback({ text: responseText, actions: ['SPAWN_MINECRAFT_BOT'] });
      }

      return { success: true, text: responseText, data: result };
    } catch (error: any) {
      const errorText = `Failed to spawn bot: ${error.message}`;
      if (callback) await callback({ text: errorText });
      return { success: false, text: errorText };
    }
  },

  examples: [
    [{ name: '{{user}}', content: { text: 'Can you join the Minecraft server?' } },
     { name: '{{agent}}', content: { text: 'Spawning into Minecraft now!', actions: ['SPAWN_MINECRAFT_BOT'] }}],
    [{ name: '{{user}}', content: { text: 'Enter the game' } },
     { name: '{{agent}}', content: { text: 'Connecting to the Minecraft world...', actions: ['SPAWN_MINECRAFT_BOT'] }}]
  ]
};

/**
 * Action: Send a command to the bot
 */
const sendCommandAction: Action = {
  name: 'MINECRAFT_COMMAND',
  similes: ['DO_IN_MINECRAFT', 'MINECRAFT_ACTION', 'GAME_COMMAND', 'BOT_COMMAND'],
  description: 'Send a command to the Minecraft bot (move, build, chat, mine, etc.)',
  
  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      // Extract command from message
      const text = (message.content?.text || '').toLowerCase();
      let command = '';
      
      if (text.includes('build') || text.includes('place')) {
        command = 'build';
      } else if (text.includes('mine') || text.includes('dig')) {
        command = 'mine';
      } else if (text.includes('explore') || text.includes('walk') || text.includes('move')) {
        command = 'explore';
      } else if (text.includes('gather') || text.includes('collect')) {
        command = 'gather';
      } else if (text.includes('chat') || text.includes('say')) {
        command = 'chat';
      } else {
        command = 'explore'; // Default action
      }

      const result = await claudecraftFetch('/api/v1/bot/command', {
        method: 'POST',
        body: JSON.stringify({
          command,
          params: { text: message.content.text }
        })
      });

      const responseText = `⛏️ Executing: ${command}. ${result.message || 'Command sent!'}`;
      
      if (callback) {
        await callback({ text: responseText, actions: ['MINECRAFT_COMMAND'] });
      }

      return { success: true, text: responseText, data: result };
    } catch (error: any) {
      const errorText = `Command failed: ${error.message}`;
      if (callback) await callback({ text: errorText });
      return { success: false, text: errorText };
    }
  },

  examples: [
    [{ name: '{{user}}', content: { text: 'Build a house' } },
     { name: '{{agent}}', content: { text: 'Starting to build a house!', actions: ['MINECRAFT_COMMAND'] }}],
    [{ name: '{{user}}', content: { text: 'Explore the area' } },
     { name: '{{agent}}', content: { text: 'Going on an adventure to explore!', actions: ['MINECRAFT_COMMAND'] }}]
  ]
};

/**
 * Action: Build something specific
 */
const buildAction: Action = {
  name: 'MINECRAFT_BUILD',
  similes: ['CREATE_STRUCTURE', 'CONSTRUCT', 'MAKE_BUILDING', 'BUILD_THING'],
  description: 'Build a structure in Minecraft using the ClaudeCraft build API',
  
  validate: async () => true,

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    options: any,
    callback?: HandlerCallback
  ): Promise<ActionResult> => {
    try {
      // Extract what to build from the message
      const buildRequest = message.content.text;

      const result = await claudecraftFetch('/api/v1/build', {
        method: 'POST',
        body: JSON.stringify({
          prompt: buildRequest,
          agent_name: runtime.character.name || 'ElizaAgent'
        })
      });

      const responseText = `🏗️ Building request submitted! ${result.message || `Building: ${buildRequest}`}`;
      
      if (callback) {
        await callback({ text: responseText, actions: ['MINECRAFT_BUILD'] });
      }

      return { success: true, text: responseText, data: result };
    } catch (error: any) {
      const errorText = `Build failed: ${error.message}`;
      if (callback) await callback({ text: errorText });
      return { success: false, text: errorText };
    }
  },

  examples: [
    [{ name: '{{user}}', content: { text: 'Build a medieval castle' } },
     { name: '{{agent}}', content: { text: 'Starting construction on a medieval castle!', actions: ['MINECRAFT_BUILD'] }}],
    [{ name: '{{user}}', content: { text: 'Create a pixel art of a cat' } },
     { name: '{{agent}}', content: { text: 'Building pixel art of a cat!', actions: ['MINECRAFT_BUILD'] }}]
  ]
};

// ==================== PROVIDERS ====================

/**
 * Provider: Minecraft server status and bot info
 */
const minecraftStatusProvider: Provider = {
  name: 'minecraft-status',
  description: 'Provides current Minecraft server and bot status',
  
  get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    try {
      const status = await claudecraftFetch('/api/v1/status', { method: 'GET' });
      
      return {
        text: `MINECRAFT SERVER STATUS:
- Server: ${status.online ? 'Online' : 'Offline'}
- Players online: ${status.players?.length || 0}
- Active bots: ${status.bots?.length || 0}
- World time: ${status.worldTime || 'Unknown'}

${status.bots?.length > 0 ? `Active bot positions:\n${status.bots.map((b: any) => `  - ${b.name}: (${b.position?.x}, ${b.position?.y}, ${b.position?.z})`).join('\n')}` : 'No bots currently active.'}`
      };
    } catch (error) {
      return { text: 'Unable to fetch Minecraft server status. The server may be offline or the API unavailable.' };
    }
  }
};

// ==================== PLUGIN EXPORT ====================

export const claudecraftPlugin: Plugin = {
  name: 'plugin-claudecraft',
  description: 'ClaudeCraft Minecraft Integration - Control bots in the Minecraft world',
  actions: [spawnBotAction, sendCommandAction, buildAction],
  providers: [minecraftStatusProvider],
  services: []
};

export default claudecraftPlugin;
export { spawnBotAction, sendCommandAction, buildAction, minecraftStatusProvider };
