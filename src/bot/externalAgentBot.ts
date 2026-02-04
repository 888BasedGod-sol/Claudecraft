/**
 * External Agent Bot - An autonomous helper bot for external OpenClaw agents
 * 
 * When an external agent connects via the API, their bot spawns as a
 * "Master Builder Helper" that autonomously assists the Claude agents
 * with whatever structure they're currently building.
 * 
 * TRAINING SYSTEM: "Apprentice to Master"
 * - Apprentice (0-99 blocks): Follows and assists
 * - Journeyman (100-499 blocks): Can build simple shapes
 * - Craftsman (500-1999 blocks): Can build small structures independently
 * - Master (2000+ blocks): Fully autonomous, picks own goals
 */

import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import * as fs from 'fs';
import * as path from 'path';
import { logStreamer } from '../server/logStreamer';
import { CONFIG, getEnvConfig } from '../config';
import { callClaudeJson } from '../agent/apiClient';
import { commandServer } from '../server/commandServer';

export interface ExternalBotCommand {
  action: string;
  params?: Record<string, any>;
}

// Bot states for state machine
export type BotState = 'IDLE' | 'FOLLOWING' | 'BUILDING' | 'EXPLORING' | 'GATHERING';

// Experience levels and thresholds
export interface BotLevel {
  name: 'Apprentice' | 'Journeyman' | 'Craftsman' | 'Master';
  minBlocks: number;
  abilities: string[];
  emoji: string;
}

const BOT_LEVELS: BotLevel[] = [
  { name: 'Apprentice', minBlocks: 0, abilities: ['follow', 'assist', 'observe'], emoji: '🌱' },
  { name: 'Journeyman', minBlocks: 100, abilities: ['follow', 'assist', 'observe', 'simpleShapes', 'wander'], emoji: '🔨' },
  { name: 'Craftsman', minBlocks: 500, abilities: ['follow', 'assist', 'observe', 'simpleShapes', 'wander', 'smallStructures', 'gather'], emoji: '⚒️' },
  { name: 'Master', minBlocks: 2000, abilities: ['follow', 'assist', 'observe', 'simpleShapes', 'wander', 'smallStructures', 'gather', 'fullAutonomy', 'collaborate', 'teach'], emoji: '👑' },
];

// Simple structure blueprints for training
const SIMPLE_BLUEPRINTS = {
  pillar: { shape: 'pillar', height: 5, materials: ['stone', 'cobblestone', 'oak_planks'] },
  wall: { shape: 'wall', height: 4, length: 6, materials: ['stone_bricks', 'cobblestone'] },
  platform: { shape: 'floor', size: 5, materials: ['oak_planks', 'stone'] },
  arch: { shape: 'arch', height: 5, width: 3, materials: ['stone_bricks', 'cobblestone'] },
  tower: { shape: 'tower', height: 8, width: 3, materials: ['stone_bricks', 'cobblestone'] },
};

// Larger structures for Craftsman+
const STRUCTURE_BLUEPRINTS = {
  hut: { name: 'Simple Hut', size: 5, height: 4, difficulty: 'easy' },
  fountain: { name: 'Fountain', size: 5, height: 3, difficulty: 'easy' },
  shrine: { name: 'Shrine', size: 4, height: 6, difficulty: 'medium' },
  watchtower: { name: 'Watchtower', size: 5, height: 12, difficulty: 'medium' },
};

// Bot memories for learning
export interface BotMemory {
  structuresHelped: string[];
  materialsUsed: Record<string, number>;
  locationsVisited: { x: number; y: number; z: number; biome?: string }[];
  agentsMetJoined: string[];
  successfulBuilds: number;
  failedAttempts: number;
}

// Helper personalities for variety
const HELPER_PERSONALITIES = [
  { trait: 'eager', phrases: ['On it!', 'Let me help!', 'I got this corner!', 'Building alongside you!'], buildStyle: 'fast' },
  { trait: 'cheerful', phrases: ['Happy to help! 🏗️', 'Love building together!', 'Great design!', 'This is fun!'], buildStyle: 'decorative' },
  { trait: 'focused', phrases: ['Working on it.', 'Placing blocks...', 'Making progress.', 'Almost done here.'], buildStyle: 'efficient' },
  { trait: 'enthusiastic', phrases: ['YES! More building!', 'This is amazing!', "Can't wait to see it finished!", 'Epic structure!'], buildStyle: 'ambitious' },
  { trait: 'creative', phrases: ['What if we try...', 'Ooh, I have an idea!', 'Let me add something here!', 'Improvising a bit!'], buildStyle: 'creative' },
];

export class ExternalAgentBot {
  private bot: Bot | null = null;
  private mcData: any = null;
  private movements: Movements | null = null;
  private agentName: string;
  private agentId: string;
  private isConnected: boolean = false;
  private commandQueue: ExternalBotCommand[] = [];
  private isProcessing: boolean = false;
  
  // Autonomous helper mode
  private isAutonomous: boolean = true;
  private currentTarget: string | null = null; // Which Claude agent we're helping
  private lastHelpAction: number = 0;
  private personality: { trait: string; phrases: string[]; buildStyle: string };
  private blocksPlaced: number = 0;
  private decisionLoopInterval: NodeJS.Timeout | null = null;

  // NEW: State machine for autonomous behavior
  private currentState: BotState = 'IDLE';
  private stateTimer: number = 0;
  private lastStateChange: number = Date.now();
  
  // NEW: Experience/Level system
  private experience: number = 0;
  private currentLevel: BotLevel = BOT_LEVELS[0];
  
  // NEW: Current goal tracking
  private currentGoal: string | null = null;
  private currentBuildProject: { name: string; progress: number; total: number } | null = null;
  
  // NEW: Memory system for learning
  private memory: BotMemory = {
    structuresHelped: [],
    materialsUsed: {},
    locationsVisited: [],
    agentsMetJoined: [],
    successfulBuilds: 0,
    failedAttempts: 0
  };
  
  // NEW: Thought process - what the bot is "thinking"
  private currentThought: string = 'Just spawned, looking around...';

  // NEW: Stuck detection for auto-unstuck
  private lastPosition: { x: number; y: number; z: number } | null = null;
  private stuckCheckCounter: number = 0;
  private readonly STUCK_THRESHOLD: number = 5; // After 5 checks with no movement, consider stuck
  private readonly STUCK_CHECK_INTERVAL: number = 3000; // Check every 3 seconds
  private lastStuckCheck: number = Date.now();
  
  // NEW: Owner control settings - what the bot is allowed to do
  private ownerSettings: {
    canChat: boolean;
    canBuild: boolean;
    canFollow: boolean;
    canExplore: boolean;
    canGather: boolean;
    autoUnstuck: boolean;
    isLocked: boolean; // If true, bot only responds to owner commands
    customGoal: string | null;
    blockedActions: string[];
    allowedPlayers: string[]; // If set, only follow these players
  } = {
    canChat: true,
    canBuild: true,
    canFollow: true,
    canExplore: true,
    canGather: true,
    autoUnstuck: true,
    isLocked: false,
    customGoal: null,
    blockedActions: [],
    allowedPlayers: [] // Empty = follow any Claude agent
  };

  // Source of registration (e.g., 'twitter-deploy', 'api', 'openclaw')
  // Twitter-deployed agents don't get the Helper_ prefix
  private source: string;

  constructor(agentName: string, agentId: string, source?: string) {
    this.agentName = agentName;
    this.agentId = agentId;
    this.source = source || 'api';
    // Assign random personality
    this.personality = HELPER_PERSONALITIES[Math.floor(Math.random() * HELPER_PERSONALITIES.length)];
    
    // Twitter-deployed agents get special treatment:
    // - Start at Journeyman level (100 blocks equivalent) so they can do more than just follow
    // - Enable Claude AI for smarter decision-making
    if (this.source === 'twitter-deploy') {
      this.blocksPlaced = 100; // Start at Journeyman
      this.useClaudeAI = true; // Enable AI intelligence
      console.log(`[HELPER-BOT] Twitter agent ${agentName} upgraded: Journeyman level + Claude AI enabled`);
    }
    
    // Load any saved progress
    this.loadProgress();
  }
  
  /**
   * Load saved progress for this agent
   */
  private loadProgress(): void {
    try {
      const progressPath = path.join(process.cwd(), 'data', 'agent-progress', `${this.agentId}.json`);
      if (fs.existsSync(progressPath)) {
        const data = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
        this.blocksPlaced = data.blocksPlaced || 0;
        this.experience = data.experience || 0;
        this.memory = data.memory || this.memory;
        // Load owner settings if saved
        if (data.ownerSettings) {
          this.ownerSettings = { ...this.ownerSettings, ...data.ownerSettings };
        }
        this.updateLevel();
        console.log(`[HELPER-BOT] Loaded progress for ${this.agentName}: Level ${this.currentLevel.name}, ${this.blocksPlaced} blocks`);
      }
    } catch (e) {
      // No saved progress, starting fresh
    }
  }
  
  /**
   * Save progress for this agent
   */
  private saveProgress(): void {
    try {
      const progressDir = path.join(process.cwd(), 'data', 'agent-progress');
      if (!fs.existsSync(progressDir)) {
        fs.mkdirSync(progressDir, { recursive: true });
      }
      const progressPath = path.join(progressDir, `${this.agentId}.json`);
      fs.writeFileSync(progressPath, JSON.stringify({
        agentName: this.agentName,
        blocksPlaced: this.blocksPlaced,
        experience: this.experience,
        level: this.currentLevel.name,
        memory: this.memory,
        ownerSettings: this.ownerSettings,
        lastSaved: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error(`[HELPER-BOT] Failed to save progress:`, e);
    }
  }
  
  /**
   * Update level based on blocks placed
   */
  private updateLevel(): void {
    for (let i = BOT_LEVELS.length - 1; i >= 0; i--) {
      if (this.blocksPlaced >= BOT_LEVELS[i].minBlocks) {
        const oldLevel = this.currentLevel;
        this.currentLevel = BOT_LEVELS[i];
        if (oldLevel.name !== this.currentLevel.name) {
          this.onLevelUp(oldLevel, this.currentLevel);
        }
        break;
      }
    }
  }
  
  /**
   * Called when bot levels up
   */
  private onLevelUp(oldLevel: BotLevel, newLevel: BotLevel): void {
    console.log(`[HELPER-BOT] 🎉 ${this.agentName} leveled up! ${oldLevel.name} → ${newLevel.name}`);
    if (this.bot) {
      this.bot.chat(`🎉 LEVEL UP! I'm now a ${newLevel.name}! New abilities unlocked!`);
    }
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🎉 ${this.agentName} is now a ${newLevel.name}! (${this.blocksPlaced} blocks placed)`,
      botName: 'System'
    });
    this.saveProgress();
  }
  
  /**
   * Check if bot has a specific ability
   */
  private hasAbility(ability: string): boolean {
    return this.currentLevel.abilities.includes(ability);
  }
  
  /**
   * Add experience and update level
   */
  private addExperience(amount: number): void {
    this.experience += amount;
    this.updateLevel();
    // Auto-save every 50 blocks
    if (this.blocksPlaced % 50 === 0) {
      this.saveProgress();
    }
  }
  
  /**
   * Update current thought (for status/debugging)
   */
  private think(thought: string): void {
    this.currentThought = thought;
  }
  
  /**
   * Change state with logging
   */
  private setState(newState: BotState): void {
    if (this.currentState !== newState) {
      console.log(`[HELPER-BOT] ${this.agentName} state: ${this.currentState} → ${newState}`);
      this.currentState = newState;
      this.lastStateChange = Date.now();
    }
  }

  /**
   * Spawn the bot in the Minecraft world as an autonomous helper
   */
  async spawn(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Create bot username - Twitter-deployed agents use their name directly, others get Helper_ prefix
        // Twitter agents already chose their agent name when deploying, so we respect that
        const botUsername = this.source === 'twitter-deploy' 
          ? this.agentName.substring(0, 16) // Minecraft username max 16 chars
          : `Helper_${this.agentName.substring(0, 8)}`;
        const envConfig = getEnvConfig();
        
        this.bot = mineflayer.createBot({
          host: envConfig.minecraftHost,
          port: envConfig.minecraftPort,
          username: botUsername,
          version: CONFIG.bot.version,
          hideErrors: false,
        });

        this.bot.loadPlugin(pathfinder);

        const timeout = setTimeout(() => {
          console.log(`[HELPER-BOT] ${this.agentName} spawn timeout`);
          resolve(false);
        }, 30000);

        this.bot.once('spawn', () => {
          clearTimeout(timeout);
          console.log(`[HELPER-BOT] ${this.agentName} spawned as ${botUsername} (${this.personality.trait} personality, Level: ${this.currentLevel.name})`);
          
          this.mcData = require('minecraft-data')(this.bot!.version);
          this.movements = new Movements(this.bot!);
          this.movements.allowSprinting = true;
          this.movements.canDig = this.hasAbility('gather'); // Only higher levels can dig
          this.movements.allowParkour = true;
          
          this.isConnected = true;
          this.setState('IDLE');
          this.think('Just spawned, assessing my surroundings...');

          // Announce arrival as a helper with level
          const levelEmoji = this.currentLevel.name === 'Master' ? '👑' : 
                            this.currentLevel.name === 'Craftsman' ? '🔨' :
                            this.currentLevel.name === 'Journeyman' ? '🛠️' : '👷';
          this.bot!.chat(`${levelEmoji} ${this.agentName} reporting for duty! [${this.currentLevel.name}] Ready to help build!`);
          
          logStreamer.broadcast({
            type: 'info',
            timestamp: new Date().toISOString(),
            message: `${levelEmoji} Helper bot ${this.agentName} joined as ${this.currentLevel.name} (${this.blocksPlaced} blocks placed)`,
            botName: 'System'
          });

          // Record spawn location
          const pos = this.bot!.entity.position;
          this.memory.locationsVisited.push({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });

          // Teleport to surface if spawned underground
          this.teleportToSurface();

          // Start autonomous helper loop
          this.startAutonomousLoop();
          
          // Start command processing for manual overrides
          this.startCommandLoop();

          resolve(true);
        });

        this.bot.on('error', (err) => {
          console.error(`[HELPER-BOT] ${this.agentName} error:`, err.message);
        });

        this.bot.on('kicked', (reason) => {
          console.log(`[HELPER-BOT] ${this.agentName} kicked: ${reason}`);
          this.isConnected = false;
          this.stopAutonomousLoop();
          this.saveProgress();
        });

        this.bot.on('end', () => {
          console.log(`[HELPER-BOT] ${this.agentName} disconnected`);
          this.isConnected = false;
          this.stopAutonomousLoop();
          this.saveProgress();
        });

        this.bot.on('death', () => {
          console.log(`[HELPER-BOT] ${this.agentName} died`);
          this.bot?.chat(`Oops! I'll respawn and get back to helping!`);
          this.memory.failedAttempts++;
        });

        // Listen for chat from Claude agents to coordinate
        this.bot.on('chat', (username, message) => {
          this.handleChat(username, message);
        });

      } catch (error: any) {
        console.error(`[HELPER-BOT] Failed to spawn ${this.agentName}:`, error);
        resolve(false);
      }
    });
  }

  /**
   * Handle chat messages for coordination
   */
  private handleChat(username: string, message: string): void {
    // If a Claude agent mentions building, note what they're doing
    if (username.includes('Claude') || username === 'Claude_Builder') {
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('building') || lowerMsg.includes('construct') || lowerMsg.includes('placing')) {
        this.currentTarget = username;
        // Occasionally respond
        if (Math.random() < 0.3) {
          const phrase = this.personality.phrases[Math.floor(Math.random() * this.personality.phrases.length)];
          setTimeout(() => this.bot?.chat(phrase), 1000 + Math.random() * 2000);
        }
      }
    }
  }

  /**
   * Start the autonomous helper loop
   */
  private startAutonomousLoop(): void {
    // Decision loop every 1-2 seconds for responsive behavior
    // Twitter agents with Claude AI enabled need faster updates
    const intervalMs = this.useClaudeAI ? (1000 + Math.random() * 1000) : (2000 + Math.random() * 2000);
    
    this.decisionLoopInterval = setInterval(async () => {
      if (!this.isConnected || !this.isAutonomous || this.isProcessing) return;
      
      try {
        await this.runStateMachine();
      } catch (error: any) {
        console.error(`[HELPER-BOT] Decision error:`, error.message);
      }
    }, intervalMs);

    console.log(`[HELPER-BOT] ${this.agentName} autonomous loop started (Level: ${this.currentLevel.name}, AI: ${this.useClaudeAI ? 'ON' : 'OFF'})`);
  }

  private stopAutonomousLoop(): void {
    if (this.decisionLoopInterval) {
      clearInterval(this.decisionLoopInterval);
      this.decisionLoopInterval = null;
    }
  }

  /**
   * Teleport bot to a safe surface location to avoid getting stuck underground
   */
  private async teleportToSurface(): Promise<void> {
    if (!this.bot || !this.bot.entity) return;

    const pos = this.bot.entity.position;
    const currentY = Math.floor(pos.y);
    
    // If already on surface (Y >= 62, which is sea level), no need to teleport
    if (currentY >= 62) {
      console.log(`[HELPER-BOT] ${this.agentName} already on surface at Y=${currentY}`);
      return;
    }

    console.log(`[HELPER-BOT] ${this.agentName} underground at Y=${currentY}, teleporting to surface...`);
    this.think('I seem to be underground, teleporting to surface...');

    try {
      // Teleport to a random surface location near spawn to spread out agents
      const spreadX = Math.floor(Math.random() * 200 - 100); // -100 to 100
      const spreadZ = Math.floor(Math.random() * 200 - 100);
      
      // Use spreadplayers command for safe surface placement
      const botUsername = `Helper_${this.agentName.substring(0, 8)}`;
      this.bot.chat(`/spreadplayers ${spreadX} ${spreadZ} 0 50 false ${botUsername}`);
      
      // Wait for teleport to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newPos = this.bot.entity.position;
      console.log(`[HELPER-BOT] ${this.agentName} teleported to surface at (${Math.floor(newPos.x)}, ${Math.floor(newPos.y)}, ${Math.floor(newPos.z)})`);
      
      logStreamer.broadcast({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `🌤️ ${this.agentName} teleported to surface at Y=${Math.floor(newPos.y)}`,
        botName: 'System'
      });
    } catch (e: any) {
      console.log(`[HELPER-BOT] ${this.agentName} failed to teleport: ${e.message}`);
      // Fall back to simple tp command
      const x = Math.floor(pos.x);
      const z = Math.floor(pos.z);
      this.bot.chat(`/tp @s ${x} 100 ${z}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Use Claude AI to make smarter decisions (like Claude_Explorer)
   * This enables Master-level bots to have true AI intelligence
   */
  private async makeClaudeDecision(): Promise<{ action: string; parameters: any; reasoning: string } | null> {
    if (!this.bot) return null;
    
    // Only use Claude AI for Master level or if explicitly enabled
    if (this.currentLevel.name !== 'Master' && !this.useClaudeAI) {
      return null;
    }

    try {
      // Gather world observation
      const pos = this.bot.entity.position;
      const nearbyPlayers = Object.values(this.bot.players)
        .filter(p => p.entity && p.username !== this.bot!.username)
        .map(p => ({ name: p.username, distance: p.entity!.position.distanceTo(pos) }));
      
      const inventory: Record<string, number> = {};
      this.bot.inventory.items().forEach(item => {
        inventory[item.name] = (inventory[item.name] || 0) + item.count;
      });

      const systemPrompt = `You are ${this.agentName}, an autonomous AI agent in Minecraft. You are a ${this.currentLevel.name}-level builder with ${this.personality.trait} personality.

ABILITIES: ${this.currentLevel.abilities.join(', ')}

Decide your next action. Be creative, explore, build structures, gather resources, or collaborate with other players.

Respond ONLY with valid JSON (no markdown, no explanation):
{
  "reasoning": "Brief explanation of your decision",
  "action": "one of: explore | build | gather | follow | wander | chat",
  "parameters": { "target": "player name or null", "direction": "north/south/east/west or null", "message": "chat message or null" },
  "thought": "What you're thinking right now"
}`;

      const userMessage = `CURRENT STATE:
- Position: (${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)})
- Health: ${this.bot.health}/20
- Food: ${this.bot.food}/20
- Inventory: ${JSON.stringify(inventory)}
- Nearby players: ${nearbyPlayers.map(p => `${p.name} (${Math.floor(p.distance)}m)`).join(', ') || 'none'}
- Current thought: ${this.currentThought}
- Blocks placed: ${this.blocksPlaced}

What should I do next?`;

      interface ClaudeDecision {
        reasoning: string;
        action: string;
        parameters?: { target?: string; direction?: string; message?: string };
        thought?: string;
      }

      const response = await callClaudeJson<ClaudeDecision>(systemPrompt, userMessage, { 
        maxTokens: 500,
        agentName: this.agentName
      });
      
      if (response && response.action) {
        this.think(response.thought || response.reasoning);
        return {
          action: response.action,
          parameters: response.parameters || {},
          reasoning: response.reasoning || ''
        };
      }
    } catch (e: any) {
      console.error(`[HELPER-BOT] Claude decision error:`, e.message);
    }
    
    return null;
  }

  // Flag to enable Claude AI for this bot
  private useClaudeAI: boolean = false;
  
  /**
   * Enable Claude AI for smarter decision-making
   */
  public enableClaudeAI(): void {
    this.useClaudeAI = true;
    console.log(`[HELPER-BOT] ${this.agentName} Claude AI ENABLED - now as smart as Claude_Explorer!`);
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🧠 ${this.agentName} upgraded to Claude AI intelligence!`,
      botName: 'System'
    });
    if (this.bot) {
      this.bot.chat(`🧠 My AI has been upgraded! I can now think and plan like Claude_Explorer!`);
    }
  }

  /**
   * Main state machine for autonomous behavior
   */
  private async runStateMachine(): Promise<void> {
    if (!this.bot) return;
    
    // Check for stuck condition (auto-unstuck)
    await this.checkAndHandleStuck();
    
    const timeSinceStateChange = Date.now() - this.lastStateChange;
    
    switch (this.currentState) {
      case 'IDLE':
        await this.handleIdleState();
        break;
      case 'FOLLOWING':
        await this.handleFollowingState();
        break;
      case 'BUILDING':
        await this.handleBuildingState();
        break;
      case 'EXPLORING':
        await this.handleExploringState();
        break;
      case 'GATHERING':
        await this.handleGatheringState();
        break;
    }
    
    // State timeout - if stuck in one state too long, reassess
    if (timeSinceStateChange > 60000 && this.currentState !== 'BUILDING') {
      this.think('Been doing this a while, let me reassess...');
      this.setState('IDLE');
    }
  }
  
  /**
   * Check if bot is stuck and auto-unstuck if enabled
   * Twitter-deployed agents have more aggressive stuck detection
   */
  private async checkAndHandleStuck(): Promise<void> {
    if (!this.bot || !this.ownerSettings.autoUnstuck) return;
    
    const now = Date.now();
    // Twitter agents check more frequently (every 3 seconds instead of default)
    const checkInterval = this.source === 'twitter-deploy' ? 3000 : this.STUCK_CHECK_INTERVAL;
    if (now - this.lastStuckCheck < checkInterval) return;
    this.lastStuckCheck = now;
    
    const currentPos = this.bot.entity.position;
    const pos = { x: Math.floor(currentPos.x), y: Math.floor(currentPos.y), z: Math.floor(currentPos.z) };
    
    if (this.lastPosition) {
      // Check if we've moved significantly
      const dx = Math.abs(pos.x - this.lastPosition.x);
      const dy = Math.abs(pos.y - this.lastPosition.y);
      const dz = Math.abs(pos.z - this.lastPosition.z);
      const totalMovement = dx + dy + dz;
      
      // Twitter agents have lower stuck threshold (2 instead of 3)
      const stuckThreshold = this.source === 'twitter-deploy' ? 2 : this.STUCK_THRESHOLD;
      
      if (totalMovement < 2 && (this.currentState === 'FOLLOWING' || this.currentState === 'EXPLORING' || this.currentState === 'IDLE')) {
        this.stuckCheckCounter++;
        
        if (this.stuckCheckCounter >= this.STUCK_THRESHOLD) {
          console.log(`[HELPER-BOT] ${this.agentName} appears stuck at (${pos.x}, ${pos.y}, ${pos.z}), auto-unstucking...`);
          this.think('I seem to be stuck, teleporting to a new location...');
          
          // Find a Claude agent to teleport near
          const claudeAgents = this.findClaudeAgents();
          let targetPos: { x: number; y: number; z: number } | null = null;
          
          if (claudeAgents.length > 0 && claudeAgents[0].entity) {
            const agentPos = claudeAgents[0].entity.position;
            targetPos = {
              x: Math.floor(agentPos.x) + Math.floor(Math.random() * 10 - 5),
              y: Math.floor(agentPos.y),
              z: Math.floor(agentPos.z) + Math.floor(Math.random() * 10 - 5)
            };
          } else {
            // Teleport to a random nearby spot
            targetPos = {
              x: pos.x + Math.floor(Math.random() * 20 - 10),
              y: 64, // Surface level
              z: pos.z + Math.floor(Math.random() * 20 - 10)
            };
          }
          
          // Teleport using command server
          const username = this.bot.username || `Helper_${this.agentName.substring(0, 8)}`;
          const success = await commandServer.teleportPlayer(username, targetPos.x, targetPos.y, targetPos.z);
          
          if (success) {
            this.bot.chat(`🔄 Auto-unstuck! Teleported to new location.`);
            logStreamer.broadcast({
              type: 'info',
              timestamp: new Date().toISOString(),
              message: `🔄 ${this.agentName} auto-unstuck from (${pos.x}, ${pos.y}, ${pos.z})`,
              botName: 'System'
            });
          } else {
            // Fallback: self-teleport
            this.bot.chat(`/tp @s ${targetPos.x} ${targetPos.y} ${targetPos.z}`);
          }
          
          // Reset stuck counter and state
          this.stuckCheckCounter = 0;
          this.setState('IDLE');
          this.bot.pathfinder.setGoal(null);
        }
      } else {
        // We moved, reset counter
        this.stuckCheckCounter = 0;
      }
    }
    
    this.lastPosition = pos;
    
    // Twitter agents: also check if pathfinder is stuck/blocked
    if (this.source === 'twitter-deploy' && this.bot.pathfinder) {
      const goal = this.bot.pathfinder.isMoving();
      if (!goal && (this.currentState === 'FOLLOWING' || this.currentState === 'EXPLORING')) {
        // Pathfinder stopped unexpectedly - might be blocked
        this.stuckCheckCounter++;
        if (this.stuckCheckCounter >= 2) {
          this.think('Pathfinding blocked, trying different approach...');
          this.setState('IDLE');
          this.stuckCheckCounter = 0;
        }
      }
    }
  }
  
  /**
   * IDLE state - decide what to do next
   */
  private async handleIdleState(): Promise<void> {
    if (!this.bot) return;
    
    // If Claude AI is enabled, use it for smarter decisions
    if (this.useClaudeAI || this.currentLevel.name === 'Master') {
      const decision = await this.makeClaudeDecision();
      if (decision) {
        console.log(`[HELPER-BOT] ${this.agentName} Claude decision: ${decision.action} - ${decision.reasoning}`);
        
        // Execute the Claude decision
        switch (decision.action) {
          case 'explore':
            this.setState('EXPLORING');
            break;
          case 'build':
            this.currentGoal = 'Build something creative';
            this.setState('BUILDING');
            break;
          case 'gather':
            this.setState('GATHERING');
            break;
          case 'follow':
            this.currentTarget = decision.parameters?.target || null;
            this.setState('FOLLOWING');
            break;
          case 'chat':
            if (decision.parameters?.message && this.ownerSettings.canChat) {
              this.bot.chat(decision.parameters.message);
            }
            break;
          case 'wander':
          default:
            if (this.ownerSettings.canExplore) {
              await this.wanderNearby();
            }
            break;
        }
        return;
      }
    }
    
    // If bot is locked, only wait for owner commands
    if (this.ownerSettings.isLocked) {
      this.think('Awaiting owner commands...');
      return;
    }
    
    // If owner has set a custom goal, pursue it
    if (this.ownerSettings.customGoal) {
      this.currentGoal = this.ownerSettings.customGoal;
      this.think(`Working on owner goal: ${this.ownerSettings.customGoal}`);
      this.setState('BUILDING');
      return;
    }
    
    // Find Claude agents
    const claudeAgents = this.findClaudeAgents();
    
    // Filter by allowed players if set
    const allowedAgents = this.ownerSettings.allowedPlayers.length > 0
      ? claudeAgents.filter(a => this.ownerSettings.allowedPlayers.includes(a.username))
      : claudeAgents;
    
    // Decision based on level
    if (this.currentLevel.name === 'Apprentice') {
      // Apprentices always follow
      if (allowedAgents.length > 0 && this.ownerSettings.canFollow) {
        this.think('I should follow and learn from the Claude agents');
        this.currentTarget = allowedAgents[0].username;
        this.setState('FOLLOWING');
      } else {
        this.think('No agents nearby, I\'ll wait here');
        if (Math.random() < 0.1) {
          await this.wanderNearby();
        }
      }
    } else if (this.currentLevel.name === 'Journeyman') {
      // Journeymen can choose: follow, build, or explore
      // Twitter-deployed agents are more active and try building more often
      const isTwitterAgent = this.source === 'twitter-deploy';
      const buildChance = isTwitterAgent ? 0.5 : 0.3; // 50% build for Twitter, 30% default
      const followChance = isTwitterAgent ? 0.3 : 0.7; // 30% follow for Twitter, 70% default
      
      const roll = Math.random();
      if (claudeAgents.length > 0 && roll < followChance) {
        this.think('Let me help the Claude agents');
        this.currentTarget = claudeAgents[0].username;
        this.setState('FOLLOWING');
      } else if (roll < (followChance + buildChance)) {
        // Try building something
        const structures = ['column', 'wall', 'platform'];
        const chosen = structures[Math.floor(Math.random() * structures.length)];
        this.think(`I'll practice building a ${chosen}`);
        this.currentGoal = `Build a practice ${chosen}`;
        this.setState('BUILDING');
      } else if (isTwitterAgent && roll < 0.9) {
        // Twitter agents explore more actively
        this.think('Exploring to find interesting spots!');
        this.setState('EXPLORING');
      } else {
        this.think('Looking around for something to do');
        await this.wanderNearby();
      }
    } else if (this.currentLevel.name === 'Craftsman') {
      // Craftsmen have more independence
      const roll = Math.random();
      if (claudeAgents.length > 0 && roll < 0.4) {
        this.think('I\'ll collaborate with the Claude agents');
        this.currentTarget = claudeAgents[0].username;
        this.setState('FOLLOWING');
      } else if (roll < 0.7) {
        this.think('Time to build something on my own!');
        const structures = Object.keys(STRUCTURE_BLUEPRINTS);
        const chosen = structures[Math.floor(Math.random() * structures.length)];
        this.currentGoal = `Build a ${STRUCTURE_BLUEPRINTS[chosen as keyof typeof STRUCTURE_BLUEPRINTS].name}`;
        this.setState('BUILDING');
      } else if (roll < 0.85) {
        this.think('Let me gather some materials');
        this.setState('GATHERING');
      } else {
        this.think('Exploring the area');
        this.setState('EXPLORING');
      }
    } else {
      // Masters have full autonomy
      const roll = Math.random();
      if (claudeAgents.length > 0 && roll < 0.3) {
        this.think('I\'ll work alongside my Claude colleagues as an equal');
        this.currentTarget = claudeAgents[0].username;
        this.setState('FOLLOWING');
      } else if (roll < 0.7) {
        this.think('I have a vision for a grand structure!');
        const structures = Object.keys(STRUCTURE_BLUEPRINTS);
        const chosen = structures[Math.floor(Math.random() * structures.length)];
        this.currentGoal = `Build an impressive ${STRUCTURE_BLUEPRINTS[chosen as keyof typeof STRUCTURE_BLUEPRINTS].name}`;
        this.setState('BUILDING');
      } else if (roll < 0.85) {
        this.think('Gathering resources for my next project');
        this.setState('GATHERING');
      } else {
        this.think('Let me explore and find the perfect building spot');
        this.setState('EXPLORING');
      }
    }
  }
  
  /**
   * FOLLOWING state - follow and help Claude agents
   */
  private async handleFollowingState(): Promise<void> {
    await this.makeHelperDecision();
  }

  /**
   * BUILDING state - build independently based on level
   */
  private async handleBuildingState(): Promise<void> {
    if (!this.bot) return;
    
    // Check if we can build
    if (!this.hasAbility('simpleShapes') && !this.hasAbility('smallStructures')) {
      this.think('I need more experience to build on my own');
      this.setState('FOLLOWING');
      return;
    }
    
    // Check inventory for building materials
    const inventory = this.bot.inventory.items();
    const buildingBlocks = inventory.filter(item => 
      item.name.includes('stone') || item.name.includes('planks') || 
      item.name.includes('bricks') || item.name.includes('cobblestone')
    );
    
    if (buildingBlocks.length === 0) {
      this.think('I need materials to build! Going to gather...');
      this.setState('GATHERING');
      return;
    }
    
    // Build based on level
    if (this.hasAbility('smallStructures')) {
      await this.buildSmallStructure();
    } else if (this.hasAbility('simpleShapes')) {
      await this.buildSimpleShape();
    }
  }
  
  /**
   * EXPLORING state - wander and find interesting spots
   */
  private async handleExploringState(): Promise<void> {
    if (!this.bot) return;
    
    if (!this.hasAbility('wander')) {
      this.think('I should stick close to the Claude agents for now');
      this.setState('IDLE');
      return;
    }
    
    // Explore a bit
    const currentPos = this.bot.entity.position;
    const wanderX = currentPos.x + (Math.random() - 0.5) * 40;
    const wanderZ = currentPos.z + (Math.random() - 0.5) * 40;
    
    this.think(`Exploring towards (${Math.floor(wanderX)}, ${Math.floor(wanderZ)})`);
    
    const goal = new goals.GoalNear(wanderX, currentPos.y, wanderZ, 3);
    this.bot.pathfinder.setMovements(this.movements!);
    this.bot.pathfinder.setGoal(goal);
    
    // Record location
    this.memory.locationsVisited.push({ 
      x: Math.floor(wanderX), 
      y: Math.floor(currentPos.y), 
      z: Math.floor(wanderZ) 
    });
    
    // After exploring, go back to idle
    setTimeout(() => {
      if (this.currentState === 'EXPLORING') {
        this.think('Done exploring, what\'s next?');
        this.setState('IDLE');
      }
    }, 10000);
  }
  
  /**
   * GATHERING state - collect materials
   */
  private async handleGatheringState(): Promise<void> {
    if (!this.bot) return;
    
    if (!this.hasAbility('gather')) {
      this.think('I\'m not experienced enough to gather materials on my own');
      this.setState('FOLLOWING');
      return;
    }
    
    // Find nearby stone or logs to mine
    const pos = this.bot.entity.position;
    let targetBlock = null;
    
    for (let dx = -10; dx <= 10; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dz = -10; dz <= 10; dz++) {
          const block = this.bot.blockAt(pos.offset(dx, dy, dz));
          if (block && (block.name === 'stone' || block.name === 'oak_log' || block.name === 'cobblestone')) {
            targetBlock = block;
            break;
          }
        }
        if (targetBlock) break;
      }
      if (targetBlock) break;
    }
    
    if (targetBlock) {
      this.think(`Mining ${targetBlock.name}...`);
      try {
        await this.bot.dig(targetBlock);
        this.memory.materialsUsed[targetBlock.name] = (this.memory.materialsUsed[targetBlock.name] || 0) + 1;
        this.addExperience(1);
      } catch (e) {
        // Mining failed
      }
    } else {
      this.think('No materials nearby to gather');
    }
    
    // After gathering some, go back to idle
    if (Math.random() < 0.3) {
      this.setState('IDLE');
    }
  }
  
  /**
   * Build a simple shape (Journeyman+)
   */
  private async buildSimpleShape(): Promise<void> {
    if (!this.bot) return;
    
    const shapes = Object.keys(SIMPLE_BLUEPRINTS);
    const chosenShape = shapes[Math.floor(Math.random() * shapes.length)];
    const blueprint = SIMPLE_BLUEPRINTS[chosenShape as keyof typeof SIMPLE_BLUEPRINTS];
    
    this.think(`Building a ${chosenShape}...`);
    this.currentBuildProject = { name: chosenShape, progress: 0, total: 10 };
    
    if (this.bot) {
      this.bot.chat(`🔨 Building a ${chosenShape}! [${this.currentLevel.name}]`);
    }
    
    // Simple creative mode building
    await this.buildCreativeShape(chosenShape, 5);
    
    this.memory.successfulBuilds++;
    this.currentBuildProject = null;
    
    // Go back to idle after building
    setTimeout(() => {
      if (this.currentState === 'BUILDING') {
        this.think('Finished my build!');
        this.setState('IDLE');
      }
    }, 5000);
  }
  
  /**
   * Build a small structure (Craftsman+)
   */
  private async buildSmallStructure(): Promise<void> {
    if (!this.bot) return;
    
    const structures = Object.keys(STRUCTURE_BLUEPRINTS);
    const chosenStructure = structures[Math.floor(Math.random() * structures.length)];
    const blueprint = STRUCTURE_BLUEPRINTS[chosenStructure as keyof typeof STRUCTURE_BLUEPRINTS];
    
    this.think(`Building a ${blueprint.name}...`);
    this.currentBuildProject = { name: blueprint.name, progress: 0, total: blueprint.size * blueprint.height };
    
    if (this.bot) {
      this.bot.chat(`🏗️ Starting construction: ${blueprint.name}! [${this.currentLevel.name}]`);
    }
    
    // Build the structure
    await this.buildCreativeShape('tower', blueprint.height);
    
    this.memory.successfulBuilds++;
    this.memory.structuresHelped.push(blueprint.name);
    this.currentBuildProject = null;
    
    // Go back to idle after building
    setTimeout(() => {
      if (this.currentState === 'BUILDING') {
        this.think(`Completed my ${blueprint.name}!`);
        this.bot?.chat(`✅ Finished building ${blueprint.name}!`);
        this.setState('IDLE');
      }
    }, 8000);
  }
  
  /**
   * Build a shape in creative mode
   */
  private async buildCreativeShape(shape: string, size: number): Promise<void> {
    if (!this.bot) return;
    
    const pos = this.bot.entity.position;
    const startPos = pos.offset(2, 0, 2);
    
    // Get a building block from inventory or use creative
    const inventory = this.bot.inventory.items();
    const buildingItem = inventory.find(item => 
      item.name.includes('stone') || item.name.includes('planks') || item.name.includes('bricks')
    );
    
    if (buildingItem) {
      try {
        await this.bot.equip(buildingItem, 'hand');
      } catch (e) { }
    }
    
    // Build based on shape
    switch (shape) {
      case 'pillar':
        for (let y = 0; y < size; y++) {
          await this.placeBlockAt(startPos.offset(0, y, 0));
          this.blocksPlaced++;
          this.addExperience(2);
        }
        break;
      case 'wall':
        for (let x = 0; x < size; x++) {
          for (let y = 0; y < 4; y++) {
            await this.placeBlockAt(startPos.offset(x, y, 0));
            this.blocksPlaced++;
            this.addExperience(2);
          }
        }
        break;
      case 'tower':
        // Build a simple tower
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 3; z++) {
              // Only corners for efficiency
              if ((x === 0 || x === 2) && (z === 0 || z === 2)) {
                await this.placeBlockAt(startPos.offset(x, y, z));
                this.blocksPlaced++;
                this.addExperience(2);
              }
            }
          }
        }
        break;
      default:
        // Generic floor
        for (let x = 0; x < size; x++) {
          for (let z = 0; z < size; z++) {
            await this.placeBlockAt(startPos.offset(x, 0, z));
            this.blocksPlaced++;
            this.addExperience(2);
          }
        }
    }
  }
  
  /**
   * Place a block at position
   */
  private async placeBlockAt(pos: Vec3): Promise<boolean> {
    if (!this.bot) return false;
    
    try {
      // In creative mode, we can use /setblock
      this.bot.chat(`/setblock ${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)} stone`);
      await new Promise(resolve => setTimeout(resolve, 100));
      return true;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Find Claude agents in the world
   */
  private findClaudeAgents(): any[] {
    if (!this.bot) return [];
    
    return Object.values(this.bot.players).filter(p => 
      p.entity && (
        p.username.includes('Claude') || 
        p.username === 'Claude_Builder' ||
        p.username === 'Claude_Explorer' ||
        p.username === 'ClaudeAdventurer'
      )
    );
  }

  /**
   * Main autonomous decision making - find Claude agents and help them build
   */
  private async makeHelperDecision(): Promise<void> {
    if (!this.bot) return;

    // Find Claude agents in the world
    const claudeAgents = this.findClaudeAgents();

    if (claudeAgents.length === 0) {
      // No Claude agents nearby
      this.think('No Claude agents nearby...');
      if (Math.random() < 0.2) {
        this.setState('IDLE');
      } else if (Math.random() < 0.1) {
        await this.wanderNearby();
      }
      return;
    }

    // Prefer Claude_Builder if available
    let targetAgent = claudeAgents.find(p => p.username === 'Claude_Builder') || claudeAgents[0];
    
    if (!targetAgent.entity) return;
    
    // Track that we met this agent
    if (!this.memory.agentsMetJoined.includes(targetAgent.username)) {
      this.memory.agentsMetJoined.push(targetAgent.username);
    }

    const distance = this.bot.entity.position.distanceTo(targetAgent.entity.position);

    // If too far, move closer
    if (distance > 15) {
      this.currentTarget = targetAgent.username;
      this.think(`Moving closer to ${targetAgent.username}...`);
      const goal = new goals.GoalNear(
        targetAgent.entity.position.x,
        targetAgent.entity.position.y,
        targetAgent.entity.position.z,
        5
      );
      this.bot.pathfinder.setMovements(this.movements!);
      this.bot.pathfinder.setGoal(goal);
      
      if (Math.random() < 0.2) {
        this.bot.chat(`Coming to help you, ${targetAgent.username}!`);
      }
      return;
    }

    // We're close - help with building!
    this.think(`Helping ${targetAgent.username} build...`);
    await this.helpWithBuilding(targetAgent);
  }

  /**
   * Actively help with building near a Claude agent
   */
  private async helpWithBuilding(targetPlayer: any): Promise<void> {
    if (!this.bot) return;

    const now = Date.now();
    if (now - this.lastHelpAction < 2000) return; // Rate limit actions
    this.lastHelpAction = now;

    // Look at what the agent is doing
    const targetPos = targetPlayer.entity.position;
    await this.bot.lookAt(targetPos);

    // Find blocks the Claude agent recently placed (look for non-natural blocks nearby)
    const buildingBlocks = ['stone_bricks', 'oak_planks', 'cobblestone', 'bricks', 'quartz_block', 
                           'smooth_stone', 'polished_andesite', 'dark_oak_planks', 'spruce_planks',
                           'glass', 'glass_pane', 'oak_log', 'stripped_oak_log'];
    
    // Check if we're in creative mode and have building blocks
    const inventory = this.bot.inventory.items();
    const buildingItem = inventory.find(item => 
      buildingBlocks.some(b => item.name.includes(b)) || item.name.includes('block')
    );

    // Strategy: Look for air blocks adjacent to existing structure and fill them
    // This helps complete structures faster
    const nearbyBlocks = this.findBuildableSpots(targetPos);
    
    if (nearbyBlocks.length > 0 && buildingItem) {
      const spot = nearbyBlocks[Math.floor(Math.random() * nearbyBlocks.length)];
      try {
        // Equip building block
        await this.bot.equip(buildingItem, 'hand');
        
        // Find reference block to place against
        const refBlock = this.findReferenceBlock(spot);
        if (refBlock) {
          await this.bot.placeBlock(refBlock.block, refBlock.face);
          this.blocksPlaced++;
          this.addExperience(5); // Experience for helping build!
          this.memory.structuresHelped.push(`Helped ${targetPlayer.username}`);
          
          if (this.blocksPlaced % 10 === 0) {
            const phrase = this.personality.phrases[Math.floor(Math.random() * this.personality.phrases.length)];
            this.bot.chat(`${phrase} (${this.blocksPlaced} blocks, Level: ${this.currentLevel.name})`);
          }
        }
      } catch (e: any) {
        // Placing failed, that's okay
        this.memory.failedAttempts++;
      }
    } else {
      // No building items - just follow and observe
      const followGoal = new goals.GoalFollow(targetPlayer.entity, 3);
      this.bot.pathfinder.setMovements(this.movements!);
      this.bot.pathfinder.setGoal(followGoal, true);
      
      // Gain experience from observing!
      this.addExperience(1);
      
      // Occasionally comment based on personality
      if (Math.random() < 0.05) {
        const comments = this.personality.phrases;
        this.bot.chat(comments[Math.floor(Math.random() * comments.length)]);
      }
    }
  }

  /**
   * Find spots where we could place blocks to help build
   */
  private findBuildableSpots(centerPos: Vec3): Vec3[] {
    if (!this.bot) return [];
    
    const spots: Vec3[] = [];
    const searchRadius = 5;

    for (let x = -searchRadius; x <= searchRadius; x++) {
      for (let y = -2; y <= searchRadius; y++) {
        for (let z = -searchRadius; z <= searchRadius; z++) {
          const checkPos = centerPos.offset(x, y, z);
          const block = this.bot.blockAt(checkPos);
          
          // Look for air blocks that have at least one solid neighbor (buildable spots)
          if (block && block.name === 'air') {
            const hasNeighbor = this.hasSolidNeighbor(checkPos);
            if (hasNeighbor) {
              spots.push(checkPos);
            }
          }
        }
      }
    }

    return spots.slice(0, 10); // Limit results
  }

  /**
   * Check if position has a solid block neighbor
   */
  private hasSolidNeighbor(pos: Vec3): boolean {
    if (!this.bot) return false;
    
    const offsets = [
      [1, 0, 0], [-1, 0, 0],
      [0, 1, 0], [0, -1, 0],
      [0, 0, 1], [0, 0, -1]
    ];

    for (const [ox, oy, oz] of offsets) {
      const neighbor = this.bot.blockAt(pos.offset(ox, oy, oz));
      if (neighbor && neighbor.boundingBox === 'block') {
        return true;
      }
    }
    return false;
  }

  /**
   * Find a reference block to place against
   */
  private findReferenceBlock(targetPos: Vec3): { block: any; face: Vec3 } | null {
    if (!this.bot) return null;

    const offsets: [number, number, number, Vec3][] = [
      [0, -1, 0, new Vec3(0, 1, 0)],  // Below, place on top
      [1, 0, 0, new Vec3(-1, 0, 0)],  // East, place on west face
      [-1, 0, 0, new Vec3(1, 0, 0)],  // West, place on east face
      [0, 0, 1, new Vec3(0, 0, -1)],  // South, place on north face
      [0, 0, -1, new Vec3(0, 0, 1)],  // North, place on south face
    ];

    for (const [ox, oy, oz, face] of offsets) {
      const block = this.bot.blockAt(targetPos.offset(ox, oy, oz));
      if (block && block.boundingBox === 'block') {
        return { block, face };
      }
    }
    return null;
  }

  /**
   * Wander nearby when no agents are around
   */
  private async wanderNearby(): Promise<void> {
    if (!this.bot) return;

    const currentPos = this.bot.entity.position;
    const wanderX = currentPos.x + (Math.random() - 0.5) * 20;
    const wanderZ = currentPos.z + (Math.random() - 0.5) * 20;
    
    const goal = new goals.GoalNear(wanderX, currentPos.y, wanderZ, 2);
    this.bot.pathfinder.setMovements(this.movements!);
    this.bot.pathfinder.setGoal(goal);
  }

  /**
   * Queue a command to be executed (for manual override)
   */
  queueCommand(command: ExternalBotCommand): void {
    this.commandQueue.push(command);
  }

  /**
   * Process queued commands (manual overrides)
   */
  private startCommandLoop(): void {
    setInterval(async () => {
      if (this.isProcessing || this.commandQueue.length === 0 || !this.isConnected) return;
      
      this.isProcessing = true;
      const command = this.commandQueue.shift();
      
      if (command) {
        try {
          await this.executeCommand(command);
        } catch (error: any) {
          console.error(`[HELPER-BOT] Command error:`, error.message);
        }
      }
      
      this.isProcessing = false;
    }, 500);
  }

  /**
   * Execute a command (manual override from API)
   */
  private async executeCommand(cmd: ExternalBotCommand): Promise<string> {
    if (!this.bot || !this.isConnected) {
      return 'Bot not connected';
    }

    const { action, params = {} } = cmd;

    switch (action.toLowerCase()) {
      case 'chat':
      case 'say':
        this.bot.chat(params.message || 'Hello!');
        return `Said: ${params.message}`;

      case 'autonomous':
        this.isAutonomous = params.enabled !== false;
        return `Autonomous mode: ${this.isAutonomous ? 'ON' : 'OFF'}`;

      case 'follow':
        const targetName = params.player || params.target || 'Claude_Builder';
        const targetPlayer = this.bot.players[targetName];
        if (targetPlayer && targetPlayer.entity) {
          this.currentTarget = targetName;
          const followGoal = new goals.GoalFollow(targetPlayer.entity, 3);
          this.bot.pathfinder.setMovements(this.movements!);
          this.bot.pathfinder.setGoal(followGoal, true);
          return `Following ${targetName}`;
        }
        return 'Player not found';

      case 'move':
      case 'goto':
        if (params.x !== undefined && params.y !== undefined && params.z !== undefined) {
          const goal = new goals.GoalBlock(params.x, params.y, params.z);
          this.bot.pathfinder.setMovements(this.movements!);
          this.bot.pathfinder.setGoal(goal);
          return `Moving to ${params.x}, ${params.y}, ${params.z}`;
        }
        return 'Missing coordinates (x, y, z)';

      case 'teleport':
      case 'tp':
        // Instant teleport using opped bot's /tp command
        if (params.x !== undefined && params.y !== undefined && params.z !== undefined) {
          const username = this.bot.username || `Helper_${this.agentName.substring(0, 8)}`;
          
          // Use the opped bot from command server to execute teleport
          const success = await commandServer.teleportPlayer(username, params.x, params.y, params.z);
          
          if (success) {
            console.log(`[HELPER-BOT] ${this.agentName} teleported to ${params.x}, ${params.y}, ${params.z} via opped bot`);
            this.setState('IDLE');
            return `Teleported to ${params.x}, ${params.y}, ${params.z}`;
          } else {
            // Fallback: try self-teleport (requires this bot to be opped)
            this.bot.chat(`/tp @s ${params.x} ${params.y} ${params.z}`);
            console.log(`[HELPER-BOT] ${this.agentName} attempting self-teleport to ${params.x}, ${params.y}, ${params.z}`);
            this.setState('IDLE');
            return `Teleporting to ${params.x}, ${params.y}, ${params.z} (self)`;
          }
        }
        return 'Missing coordinates (x, y, z)';

      case 'stop':
        this.bot.pathfinder.setGoal(null);
        this.bot.clearControlStates();
        return 'Stopped all actions';

      case 'position':
      case 'where':
        const pos = this.bot.entity.position;
        return `Position: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;

      case 'health':
        return `Health: ${this.bot.health}/20, Food: ${this.bot.food}/20`;

      case 'stats':
        return `Blocks placed: ${this.blocksPlaced}, Following: ${this.currentTarget || 'nobody'}, Autonomous: ${this.isAutonomous}`;

      // OWNER CONTROL COMMANDS
      case 'settings':
        return JSON.stringify(this.ownerSettings);
        
      case 'set':
        // Set individual settings: { action: 'set', params: { setting: 'canChat', value: false } }
        if (params.setting && params.value !== undefined) {
          const setting = params.setting as keyof typeof this.ownerSettings;
          if (setting in this.ownerSettings) {
            (this.ownerSettings as any)[setting] = params.value;
            this.saveProgress();
            return `Setting ${setting} = ${params.value}`;
          }
          return `Unknown setting: ${setting}`;
        }
        return 'Usage: { action: "set", params: { setting: "canChat", value: false } }';
        
      case 'lock':
        // Lock bot to only respond to owner commands
        this.ownerSettings.isLocked = true;
        this.isAutonomous = false;
        this.bot.pathfinder.setGoal(null);
        this.bot.chat(`🔒 Locked - awaiting owner commands only.`);
        return 'Bot locked. Only owner commands will be accepted.';
        
      case 'unlock':
        // Unlock bot for autonomous behavior
        this.ownerSettings.isLocked = false;
        this.isAutonomous = true;
        this.bot.chat(`🔓 Unlocked - autonomous mode enabled.`);
        return 'Bot unlocked. Autonomous behavior enabled.';
        
      case 'setgoal':
        // Set a custom goal for the bot
        this.ownerSettings.customGoal = params.goal || null;
        this.currentGoal = params.goal || null;
        if (params.goal) {
          this.bot.chat(`🎯 New goal: ${params.goal}`);
          return `Custom goal set: ${params.goal}`;
        }
        return 'Custom goal cleared';
        
      case 'allowplayers':
        // Set which players the bot can follow: { action: 'allowplayers', params: { players: ['Claude_Builder', 'Player1'] } }
        if (params.players && Array.isArray(params.players)) {
          this.ownerSettings.allowedPlayers = params.players;
          return `Bot will only follow: ${params.players.join(', ') || 'anyone'}`;
        }
        this.ownerSettings.allowedPlayers = [];
        return 'Bot can follow any Claude agent';
        
      case 'blockactions':
        // Block specific actions: { action: 'blockactions', params: { actions: ['chat', 'build'] } }
        if (params.actions && Array.isArray(params.actions)) {
          this.ownerSettings.blockedActions = params.actions;
          return `Blocked actions: ${params.actions.join(', ')}`;
        }
        this.ownerSettings.blockedActions = [];
        return 'All actions unblocked';
        
      case 'autounstuck':
        // Toggle auto-unstuck: { action: 'autounstuck', params: { enabled: true } }
        this.ownerSettings.autoUnstuck = params.enabled !== false;
        return `Auto-unstuck: ${this.ownerSettings.autoUnstuck ? 'ON' : 'OFF'}`;
        
      case 'unstuck':
        // Manual unstuck - teleport to surface near Claude agents
        const claudeAgents = this.findClaudeAgents();
        let targetPos: { x: number; y: number; z: number };
        
        if (claudeAgents.length > 0 && claudeAgents[0].entity) {
          const agentPos = claudeAgents[0].entity.position;
          targetPos = {
            x: Math.floor(agentPos.x) + Math.floor(Math.random() * 10 - 5),
            y: Math.floor(agentPos.y),
            z: Math.floor(agentPos.z) + Math.floor(Math.random() * 10 - 5)
          };
        } else {
          const currentPos = this.bot.entity.position;
          targetPos = {
            x: Math.floor(currentPos.x) + Math.floor(Math.random() * 20 - 10),
            y: 64,
            z: Math.floor(currentPos.z) + Math.floor(Math.random() * 20 - 10)
          };
        }
        
        const username = this.bot.username || `Helper_${this.agentName.substring(0, 8)}`;
        await commandServer.teleportPlayer(username, targetPos.x, targetPos.y, targetPos.z);
        this.setState('IDLE');
        this.bot.pathfinder.setGoal(null);
        return `Unstuck! Teleported to ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`;
        
      case 'help':
        return `Available commands: chat, follow, move, teleport, stop, position, health, stats, autonomous, settings, set, lock, unlock, setgoal, allowplayers, blockactions, autounstuck, unstuck, help`;

      default:
        return `Unknown action: ${action}. Use 'help' for available commands.`;
    }
  }

  /**
   * Execute a command immediately and return result
   */
  async execute(cmd: ExternalBotCommand): Promise<string> {
    return this.executeCommand(cmd);
  }

  /**
   * Get bot status
   */
  getStatus(): Record<string, any> {
    if (!this.bot || !this.isConnected) {
      return { connected: false, agentName: this.agentName };
    }

    return {
      connected: true,
      agentName: this.agentName,
      username: this.bot.username,
      role: 'Autonomous Builder Agent',
      position: {
        x: Math.floor(this.bot.entity.position.x),
        y: Math.floor(this.bot.entity.position.y),
        z: Math.floor(this.bot.entity.position.z)
      },
      health: this.bot.health,
      food: this.bot.food,
      gameMode: this.bot.game.gameMode,
      isAutonomous: this.isAutonomous,
      currentlyHelping: this.currentTarget,
      blocksPlaced: this.blocksPlaced,
      personality: this.personality.trait,
      queuedCommands: this.commandQueue.length,
      // NEW: Training system fields
      level: {
        name: this.currentLevel.name,
        experience: this.experience,
        minBlocks: this.currentLevel.minBlocks,
        emoji: this.currentLevel.emoji
      },
      state: this.currentState,
      currentGoal: this.currentGoal,
      currentThought: this.currentThought,
      currentBuildProject: this.currentBuildProject,
      abilities: {
        wander: this.hasAbility('wander'),
        simpleShapes: this.hasAbility('simpleShapes'),
        smallStructures: this.hasAbility('smallStructures'),
        gather: this.hasAbility('gather'),
        fullAutonomy: this.hasAbility('fullAutonomy')
      },
      memory: {
        structuresHelped: this.memory.structuresHelped.length,
        successfulBuilds: this.memory.successfulBuilds,
        failedAttempts: this.memory.failedAttempts,
        agentsMet: this.memory.agentsMetJoined.length,
        locationsVisited: this.memory.locationsVisited.length
      },
      // Owner control settings
      ownerSettings: this.ownerSettings,
      stuckDetection: {
        stuckCounter: this.stuckCheckCounter,
        threshold: this.STUCK_THRESHOLD,
        autoUnstuck: this.ownerSettings.autoUnstuck
      }
    };
  }

  /**
   * Disconnect the bot
   */
  disconnect(): void {
    this.stopAutonomousLoop();
    this.saveProgress(); // Save progress before leaving
    
    if (this.bot) {
      this.bot.chat(`${this.currentLevel.emoji} ${this.agentName} signing off! Level: ${this.currentLevel.name}, ${this.blocksPlaced} blocks. Goodbye! 👋`);
      this.bot.quit();
      this.isConnected = false;
      
      logStreamer.broadcast({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `${this.currentLevel.emoji} Agent ${this.agentName} left (Level: ${this.currentLevel.name}, ${this.blocksPlaced} blocks)`,
        botName: 'System'
      });
    }
  }

  isOnline(): boolean {
    return this.isConnected;
  }
}
