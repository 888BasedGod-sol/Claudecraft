/**
 * Autonomous Bot Controller
 * 
 * Controls a bot with full autonomy - free to explore, build creatively, and learn.
 * Unlike the SurvivalBuilderBotController, this doesn't follow a specific build plan.
 */

import mineflayer from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { AutonomousAgent, WorldObservation, BotState, AgentPersonality } from '../agent/autonomousAgent';
import { getAgentRegistry } from '../agent/agentRegistry';
import { getOptimalMiningLevel, getMiningAdvice, canMineBlock, getSurvivalPriorities } from '../agent/expertKnowledge';
import { getWorldMemory } from '../agent/worldMemory';
import { logStream } from '../server/logStream';
import { logStreamer } from '../server/logStreamer';
import { withTimeout } from '../utils/helpers';
import { CONFIG } from '../config';
import { getTwitterAgent } from '../twitterAgent';
import { analyzeBuildRequest, BuildDecision } from '../building/buildAnalyzer';
import { SCULPTURES, buildSculptureCommands, getSculptureNames, listSculpturesForPrompt } from '../building/sculptures';

const { GoalNear, GoalBlock, GoalXZ, GoalY } = goals;

// Use centralized config for action timeout
const ACTION_TIMEOUT_MS = CONFIG.actions.timeoutMs;

export class AutonomousBotController {
  private host: string;
  private port: number;
  private botName: string;
  private bot: any = null;
  private agent: AutonomousAgent;
  private mcData: any = null;
  private movements: Movements | null = null;
  private decisionInterval: any = null;
  private running: boolean = false;
  private actionInProgress: boolean = false;
  private currentBuild: { origin: Vec3; blocks: Map<string, string> } | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private isReconnecting: boolean = false;
  private personality?: Partial<AgentPersonality>;
  private lastTorchPlacement: number = 0; // Timestamp of last torch placement
  private torchPlacementInterval: number = 3000; // Place torch every 3 seconds when underground (more frequent for safety)
  private positionUpdateInterval: any = null; // Interval for broadcasting position
  private creativeMode: boolean = false; // Use /setblock commands for unlimited building
  private sculptorMode: boolean = false; // Specialized for fine details on existing builds
  private lastActionResult: { action: string; success: boolean; message: string } | null = null; // Track last action result
  private consecutiveFailures: number = 0; // Track consecutive action failures
  private lastTeleportTime: number = 0; // Timestamp of last teleport to prevent spam
  private teleportCooldown: number = 10000; // 10 second cooldown between teleports
  private lastChatTime: number = 0; // Timestamp of last chat message
  private chatCooldown: number = 150; // Minimum 150ms between chat messages to avoid spam kicks

  constructor(host: string, port: number, name: string, personality?: Partial<AgentPersonality>, creativeMode: boolean = false, sculptorMode: boolean = false) {
    this.host = host;
    this.port = port;
    this.botName = name;
    this.personality = personality;
    this.creativeMode = creativeMode;
    this.sculptorMode = sculptorMode;
    this.agent = new AutonomousAgent(name, personality, creativeMode, sculptorMode);
  }

  /** Check if this controller is in creative mode */
  isCreativeMode(): boolean {
    return this.creativeMode;
  }

  /** Check if this controller is in sculptor mode */
  isSculptorMode(): boolean {
    return this.sculptorMode;
  }

  /** Get the underlying mineflayer bot instance */
  getBot(): any {
    return this.bot;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Connection timeout of 30 seconds
      const connectionTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.log(`[AUTONOMOUS] ${this.botName} connection timed out`);
          reject(new Error('Connection timed out after 30 seconds'));
        }
      }, 30000);

      this.bot = mineflayer.createBot({
        host: this.host,
        port: this.port,
        username: this.botName,
        version: CONFIG.bot.version,
        hideErrors: false,
        checkTimeoutInterval: 120000, // 2 minutes - prevent keepalive timeout
      });

      this.bot.loadPlugin(pathfinder);

      // Track if we've resolved/rejected to prevent double calls
      let settled = false;

      this.bot.once('spawn', async () => {
        clearTimeout(connectionTimeout);
        if (settled) return;
        settled = true;
        
        console.log(`[AUTONOMOUS] ${this.botName} spawned and ready to explore!`);
        logStream.log('INFO', `[${this.botName}] Spawned - AUTONOMOUS MODE`);
        
        this.mcData = require('minecraft-data')(this.bot.version);
        this.movements = new Movements(this.bot);
        this.movements.allowSprinting = true;
        this.movements.canDig = true;
        this.movements.allow1by1towers = true;
        
        this.running = true;

        // Teleport to surface to avoid getting stuck underground
        await this.teleportToSurface();

        // Start with a look around
        await this.lookAround();

        // Start the decision loop (4 seconds between decisions)
        this.startDecisionLoop();
        
        // Start broadcasting position updates
        this.startPositionBroadcast();
        
        // Reset reconnect attempts on successful spawn
        this.reconnectAttempts = 0;
        
        resolve();
      });

      this.bot.on('error', (err: Error) => {
        clearTimeout(connectionTimeout);
        // EPIPE means connection broke - will trigger 'end' event for reconnect
        const isConnectionError = err.message.includes('EPIPE') || 
                                   err.message.includes('ECONNRESET') ||
                                   err.message.includes('ETIMEDOUT');
        
        if (isConnectionError) {
          console.log(`[AUTONOMOUS] ${this.botName} connection error: ${err.message}`);
          logStream.log('WARN', `[${this.botName}] Connection error: ${err.message}`);
        } else {
          console.error(`[AUTONOMOUS ERROR] ${this.botName}:`, err);
          logStream.log('ERROR', `[${this.botName}] ${err.message}`);
        }
        
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      this.bot.on('kicked', (reason: string) => {
        clearTimeout(connectionTimeout);
        console.log(`[AUTONOMOUS] ${this.botName} was kicked:`, reason);
        logStream.log('WARN', `[${this.botName}] Kicked: ${reason}`);
        if (!settled) {
          settled = true;
          reject(new Error(`Kicked: ${reason}`));
        }
        // Don't auto-reconnect on kick - likely intentional
        this.running = false;
        this.stopDecisionLoop();
      });

      this.bot.on('end', () => {
        console.log(`[AUTONOMOUS] ${this.botName} connection ended`);
        logStream.log('WARN', `[${this.botName}] Connection ended`);
        this.stopDecisionLoop();
        
        // Auto-reconnect if we were running and haven't exceeded attempts
        if (this.running && !this.isReconnecting) {
          this.attemptReconnect();
        }
      });

      this.bot.on('death', () => {
        console.log(`[AUTONOMOUS] ${this.botName} died! Will respawn and continue...`);
        logStream.log('WARN', `[${this.botName}] Died - respawning`);
        
        // Record death to world memory
        const worldMemory = getWorldMemory();
        const pos = this.bot?.entity?.position;
        if (pos) {
          worldMemory.recordDeath(
            this.botName,
            Math.round(pos.x),
            Math.round(pos.y),
            Math.round(pos.z),
            'Unknown cause',
            (this.bot?.inventory?.items()?.length || 0) > 10
          );
        }
      });

      this.bot.on('chat', (username: string, message: string) => {
        if (username === this.botName) return;
        logStream.log('CHAT', `<${username}> ${message}`);
        
        // Agent can respond to players talking to it
        if (message.toLowerCase().includes(this.botName.toLowerCase())) {
          this.agent.suggestGoal(`Respond to ${username} who said: "${message}"`, 8);
        }
      });
    });
  }

  private startDecisionLoop(): void {
    // Add random stagger (0-2 seconds) to avoid all agents calling API simultaneously
    const staggerMs = Math.random() * 2000;
    
    // Decision loop every 10 seconds (staggered start) — reduced from 4s to save API tokens
    setTimeout(() => {
      this.decisionInterval = setInterval(async () => {
        if (!this.running || this.actionInProgress) return;
        await this.makeDecision();
      }, 10000);
    }, staggerMs);

    // Make first decision after stagger delay
    setTimeout(() => this.makeDecision(), 1000 + staggerMs);
  }

  private startPositionBroadcast(): void {
    const registry = getAgentRegistry();
    
    // Broadcast position every 5 seconds for mini-map and agent awareness
    this.positionUpdateInterval = setInterval(() => {
      if (!this.bot || !this.bot.entity) return;
      
      const pos = this.bot.entity.position;
      const dimension = this.getCurrentDimension();
      
      // Broadcast to website
      logStreamer.broadcastPosition(
        this.botName,
        pos.x,
        pos.y,
        pos.z,
        dimension
      );
      
      // Update agent registry for inter-agent awareness
      const goals = this.agent.getCurrentGoals();
      const currentGoal = goals.length > 0 
        ? goals.sort((a, b) => b.priority - a.priority)[0].description 
        : null;
      
      registry.updateAgentState({
        name: this.botName,
        position: { x: pos.x, y: pos.y, z: pos.z },
        dimension,
        currentActivity: this.actionInProgress ? 'busy' : 'deciding',
        currentGoal,
        health: this.bot.health,
        inventory: this.getBotState().inventory
      });
    }, 5000);

    // Send initial position
    if (this.bot && this.bot.entity) {
      const pos = this.bot.entity.position;
      logStreamer.broadcastPosition(this.botName, pos.x, pos.y, pos.z, this.getCurrentDimension());
    }
  }

  private getCurrentDimension(): string {
    if (!this.bot || !this.bot.game) return 'overworld';
    const dim = this.bot.game.dimension;
    if (dim === 'minecraft:the_nether' || dim === 'the_nether') return 'nether';
    if (dim === 'minecraft:the_end' || dim === 'the_end') return 'end';
    return 'overworld';
  }

  private async makeDecision(): Promise<void> {
    if (!this.bot || !this.running) return;
    if (!this.bot.entity) {
      // Bot not fully spawned yet - skip this decision cycle
      return;
    }
    if (this.actionInProgress) return;

    this.actionInProgress = true;
    const registry = getAgentRegistry();

    try {
      const state = this.getBotState();
      const observation = await this.getWorldObservation();

      // Get AI decision (pass last action result so agent knows what worked/failed)
      const decision = await this.agent.makeDecision(state, observation, this.lastActionResult || undefined, this.consecutiveFailures);

      // Log the decision
      logStream.log('CLAUDE', `${decision.action}: ${decision.reasoning}`, this.botName);
      
      // Update registry with current activity
      registry.updateAgentState({
        name: this.botName,
        currentActivity: decision.action,
        lastAction: decision.action
      });

      // Execute the action
      const result = await this.executeAction(decision.action, decision.parameters);

      // Track failures
      if (!result.success) {
        this.consecutiveFailures++;
        this.lastActionResult = { action: decision.action, success: false, message: result.message };
      } else {
        this.consecutiveFailures = 0;
        this.lastActionResult = { action: decision.action, success: true, message: result.message };
      }

      // Log result
      logStream.log('ACTION', `${result.success ? '✓' : '✗'} ${result.message}`, this.botName);

      // Handle chat announcements (with rate limiting to avoid spam kicks)
      if (decision.announcement && result.success) {
        await this.safeChat(decision.announcement);
        logStream.log('CHAT', `[${this.botName}] ${decision.announcement}`);
      }
      
      // Check for nearby agent meetings
      await this.checkForAgentMeetings();
      
      // Proactively place torches when underground or in dark areas
      await this.placeTorchIfNeeded();

    } catch (error: any) {
      console.error(`[${this.botName}] Decision error:`, error);
      logStream.log('ERROR', `[${this.botName}] ${error.message}`);
    } finally {
      this.actionInProgress = false;
    }
  }

  private getBotState(): BotState {
    const inventory: Record<string, number> = {};
    for (const item of this.bot.inventory.items()) {
      inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    const heldItem = this.bot.heldItem;

    return {
      position: {
        x: this.bot.entity.position.x,
        y: this.bot.entity.position.y,
        z: this.bot.entity.position.z
      },
      health: this.bot.health,
      food: this.bot.food,
      inventory,
      nearbyPlayers: Object.values(this.bot.players)
        .filter((p: any) => p.entity && p.username !== this.botName)
        .map((p: any) => p.username),
      heldItem: heldItem?.name || null,
      experience: this.bot.experience?.level || 0,
      gameMode: this.bot.game?.gameMode || 'survival'
    };
  }

  private async getWorldObservation(): Promise<WorldObservation> {
    const pos = this.bot.entity.position;
    
    // Get biome
    let biome = 'unknown';
    try {
      const biomeId = this.bot.world.getBiome(pos);
      const biomeData = this.mcData.biomes[biomeId];
      biome = biomeData?.name || 'unknown';
    } catch (e) {
      biome = 'unknown';
    }

    // Get time of day
    const time = this.bot.time.timeOfDay;
    let timeOfDay: 'day' | 'night' | 'sunrise' | 'sunset' = 'day';
    if (time >= 0 && time < 1000) timeOfDay = 'sunrise';
    else if (time >= 1000 && time < 12000) timeOfDay = 'day';
    else if (time >= 12000 && time < 13000) timeOfDay = 'sunset';
    else timeOfDay = 'night';

    // Get weather
    let weather: 'clear' | 'rain' | 'thunder' = 'clear';
    if (this.bot.thunderState > 0) weather = 'thunder';
    else if (this.bot.isRaining) weather = 'rain';

    // Scan nearby blocks
    const nearbyBlocks = await this.scanNearbyBlocks();

    // Get nearby entities
    const nearbyEntities = Object.values(this.bot.entities)
      .filter((e: any) => e !== this.bot.entity)
      .map((e: any) => ({
        type: e.name || e.type || 'unknown',
        name: e.username,
        distance: e.position.distanceTo(pos)
      }))
      .filter((e: any) => e.distance < 32)
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, 10);

    // Get light level
    const lightLevel = this.bot.blockAt(pos)?.light || 15;

    // Detect visible structures based on block patterns
    const visibleStructures = this.detectNearbyStructures(nearbyBlocks);

    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      biome,
      timeOfDay,
      weather,
      nearbyBlocks,
      nearbyEntities,
      visibleStructures,
      lightLevel
    };
  }

  /**
   * Detect structures based on block composition nearby
   */
  private detectNearbyStructures(blocks: { name: string; count: number }[]): string[] {
    const structures: string[] = [];
    const blockMap = new Map(blocks.map(b => [b.name, b.count]));

    // Village detection
    if ((blockMap.get('hay_block') || 0) > 3 || 
        (blockMap.get('bell') || 0) > 0 ||
        (blockMap.get('composter') || 0) > 2) {
      structures.push('village');
    }

    // Mine/cave detection
    if ((blockMap.get('rail') || 0) > 5 || 
        (blockMap.get('minecart') || 0) > 0 ||
        (blockMap.get('spawner') || 0) > 0) {
      structures.push('mineshaft');
    }

    // Ruined portal
    if ((blockMap.get('crying_obsidian') || 0) > 0 ||
        (blockMap.get('netherrack') || 0) > 3) {
      structures.push('ruined_portal');
    }

    // Ocean monument
    if ((blockMap.get('prismarine') || 0) > 10 ||
        (blockMap.get('sea_lantern') || 0) > 2) {
      structures.push('ocean_monument');
    }

    // Stronghold
    if ((blockMap.get('end_portal_frame') || 0) > 0 ||
        (blockMap.get('ender_eye') || 0) > 0) {
      structures.push('stronghold');
    }

    // Player-built structure indicators
    const woodPlanks = ['oak_planks', 'spruce_planks', 'birch_planks', 'dark_oak_planks', 'jungle_planks', 'acacia_planks']
      .reduce((sum, name) => sum + (blockMap.get(name) || 0), 0);
    
    if (woodPlanks > 20 || (blockMap.get('glass') || 0) > 5 || (blockMap.get('torch') || 0) > 5) {
      structures.push('player_build');
    }

    // Farm detection
    if ((blockMap.get('farmland') || 0) > 10 ||
        ((blockMap.get('wheat') || 0) > 10 && (blockMap.get('water') || 0) > 0)) {
      structures.push('farm');
    }

    return structures;
  }

  private async scanNearbyBlocks(): Promise<{ name: string; count: number }[]> {
    const blockCounts: Record<string, number> = {};
    const pos = this.bot.entity.position;
    const radius = 8;

    for (let x = -radius; x <= radius; x++) {
      for (let y = -3; y <= 5; y++) {
        for (let z = -radius; z <= radius; z++) {
          try {
            const block = this.bot.blockAt(pos.offset(x, y, z));
            if (block && block.name !== 'air' && block.name !== 'cave_air') {
              blockCounts[block.name] = (blockCounts[block.name] || 0) + 1;
            }
          } catch (e) {
            // Ignore errors from unloaded chunks
          }
        }
      }
    }

    return Object.entries(blockCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  private async executeAction(action: string, params: any): Promise<{ success: boolean; message: string }> {
    try {
      switch (action) {
        // EXPLORATION
        case 'explore':
          return await this.explore(params.direction || 'random');
        
        case 'investigateArea':
          return await this.lookAround();
        
        case 'goToPosition':
          return await this.goToPosition(params.x, params.y, params.z);
        
        case 'findBiome':
          return await this.explore(params.biome || 'random');
        
        case 'climbUp':
          return await this.climbUp();
        
        case 'descendDown':
          return await this.descendDown();

        // BUILDING
        case 'startBuild':
          return await this.startBuild(params.idea, params.style);
        
        case 'placeBlock':
          return await this.placeBlock(params.blockType, params.offset);
        
        case 'buildShape':
          return await this.buildShape(params.shape, params.material, params.size);
        
        case 'buildColosseum':
          return await this.buildColosseumBlueprint();
        
        case 'decorateArea':
          return await this.decorateArea(params.style);
        
        case 'clearArea':
          return await this.clearArea(params.radius || 5);

        // RESOURCE GATHERING
        case 'gatherWood':
          return await this.gatherWood(params.count || 16);
        
        case 'mineStone':
          return await this.mineStone(params.count || 32);
        
        case 'mineOre':
          return await this.mineOre(params.ore || 'diamond', params.count || 8);
        
        case 'digToLevel':
          return await this.digToLevel(params.targetY || -59);
        
        case 'branchMine':
          return await this.branchMine(params.length || 20);
        
        case 'harvestPlants':
          return await this.harvestPlants();
        
        case 'huntFood':
          return await this.huntFood();
        
        case 'fish':
          return { success: false, message: 'Fishing not yet implemented' };

        // CRAFTING
        case 'craftItem':
          return await this.craftItem(params.item);
        
        case 'smeltItem':
          return await this.smeltItem(params.item);

        // SURVIVAL
        case 'findShelter':
          return await this.findShelter();
        
        case 'eatFood':
          return await this.eatFood();
        
        case 'sleep':
          return await this.sleep();
        
        case 'flee':
          return await this.flee(params.fromEntity);

        // SOCIAL
        case 'greetPlayer':
          return await this.greetPlayer(params.playerName);
        
        case 'followPlayer':
          return await this.followPlayer(params.playerName);
        
        case 'showBuild':
          return { success: true, message: 'Showing build...' };
        
        case 'askForHelp':
          this.bot.chat(`Can anyone help me with ${params.task}?`);
          return { success: true, message: 'Asked for help' };

        // AGENT COLLABORATION
        case 'shareDiscovery':
          return await this.shareDiscovery(params.type, params.description);
        
        case 'requestAgentHelp':
          return await this.requestAgentHelp(params.task);
        
        case 'respondToHelp':
          return await this.respondToHelp(params.requestId);
        
        case 'proposeProject':
          return await this.proposeProject(params.projectName, params.description);
        
        case 'joinProject':
          return await this.joinProject(params.projectId);
        
        case 'meetAgent':
          return await this.meetAgent(params.agentName);

        // LEARNING & MEMORY
        case 'markLocation':
          return { success: true, message: `Marked location: ${params.name}` };
        
        case 'reviewMemories':
          return { success: true, message: 'Reviewing past experiences...' };
        
        case 'setGoal':
          await this.agent.suggestGoal(params.description, 6);
          return { success: true, message: `Set goal: ${params.description}` };
        
        case 'abandonGoal':
          return { success: true, message: 'Abandoned goal' };

        // UTILITY
        case 'checkInventory':
          return { success: true, message: `Inventory has ${this.bot.inventory.items().length} items` };
        
        case 'lookAround':
          return await this.lookAround();
        
        case 'wait':
          await this.wait(params.seconds || 3);
          return { success: true, message: `Waited ${params.seconds || 3} seconds` };
        
        case 'jump':
          this.bot.setControlState('jump', true);
          setTimeout(() => this.bot.setControlState('jump', false), 500);
          return { success: true, message: 'Jumped' };
        
        case 'unstuck':
          return await this.unstuck();

        case 'placeTorch':
          return await this.placeTorch();

        default:
          return { success: false, message: `Unknown action: ${action}` };
      }
    } catch (error: any) {
      return { success: false, message: `Action failed: ${error.message}` };
    }
  }

  // ACTION IMPLEMENTATIONS

  private async explore(direction: string): Promise<{ success: boolean; message: string }> {
    const pos = this.bot.entity.position;
    const distance = 20 + Math.random() * 30;
    
    let dx = 0, dz = 0;
    switch (direction.toLowerCase()) {
      case 'north': dz = -distance; break;
      case 'south': dz = distance; break;
      case 'east': dx = distance; break;
      case 'west': dx = -distance; break;
      default:
        dx = (Math.random() - 0.5) * distance * 2;
        dz = (Math.random() - 0.5) * distance * 2;
    }

    const target = pos.offset(dx, 0, dz);
    
    try {
      this.bot.pathfinder.setMovements(this.movements!);
      await withTimeout(
        this.bot.pathfinder.goto(new GoalXZ(target.x, target.z)),
        ACTION_TIMEOUT_MS,
        'explore'
      );
      return { success: true, message: `Explored ${direction} to (${Math.round(target.x)}, ${Math.round(target.z)})` };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { success: false, message: `Couldn't reach destination: ${e.message}` };
    }
  }

  private async goToPosition(x: number, y: number, z: number): Promise<{ success: boolean; message: string }> {
    try {
      this.bot.pathfinder.setMovements(this.movements!);
      await withTimeout(
        this.bot.pathfinder.goto(new GoalNear(x, y, z, 2)),
        ACTION_TIMEOUT_MS,
        'goToPosition'
      );
      return { success: true, message: `Arrived at (${x}, ${y}, ${z})` };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { success: false, message: `Couldn't reach position: ${e.message}` };
    }
  }

  /**
   * Teleport bot to a safe surface location to avoid getting stuck underground
   */
  private async teleportToSurface(): Promise<void> {
    if (!this.bot || !this.bot.entity) return;

    // Check if we recently teleported to prevent spam kicks
    const now = Date.now();
    if (now - this.lastTeleportTime < this.teleportCooldown) {
      console.log(`[AUTONOMOUS] ${this.botName} skipping teleport - cooldown active (${Math.round((this.teleportCooldown - (now - this.lastTeleportTime)) / 1000)}s remaining)`);
      return;
    }

    const pos = this.bot.entity.position;
    const currentY = Math.floor(pos.y);
    
    // If already on surface (Y >= 62, which is sea level), no need to teleport
    if (currentY >= 62) {
      console.log(`[AUTONOMOUS] ${this.botName} already on surface at Y=${currentY}`);
      logStream.log('INFO', `[${this.botName}] Already on surface at Y=${currentY}`);
      return;
    }

    console.log(`[AUTONOMOUS] ${this.botName} spawned underground at Y=${currentY}, teleporting to surface...`);
    logStream.log('INFO', `[${this.botName}] Underground at Y=${currentY}, teleporting to surface`);

    // Mark that we're teleporting to prevent spam
    this.lastTeleportTime = now;

    // Find a safe surface location by scanning up from current position
    const x = Math.floor(pos.x);
    const z = Math.floor(pos.z);
    
    // Use /tp command to teleport to surface (relies on ~ syntax to find highest block)
    // First teleport high up, then let gravity handle it, or use a spread command
    try {
      // Teleport to a random surface location near spawn to spread out agents
      const spreadX = Math.floor(Math.random() * 200 - 100); // -100 to 100
      const spreadZ = Math.floor(Math.random() * 200 - 100);
      
      // Use spreadplayers command for safe surface placement
      this.bot.chat(`/spreadplayers ${spreadX} ${spreadZ} 0 50 false ${this.botName}`);
      
      // Wait for teleport to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newPos = this.bot.entity.position;
      console.log(`[AUTONOMOUS] ${this.botName} teleported to surface at (${Math.floor(newPos.x)}, ${Math.floor(newPos.y)}, ${Math.floor(newPos.z)})`);
      logStream.log('INFO', `[${this.botName}] Teleported to surface at Y=${Math.floor(newPos.y)}`);
    } catch (e: any) {
      console.log(`[AUTONOMOUS] ${this.botName} failed to teleport: ${e.message}`);
      // Fall back to simple tp command
      this.bot.chat(`/tp ${this.botName} ${x} 100 ${z}`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  private async lookAround(): Promise<{ success: boolean; message: string }> {
    // Look in different directions
    for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 2) {
      await this.bot.look(yaw, 0);
      await this.wait(0.5);
    }
    return { success: true, message: 'Looked around the area' };
  }

  private async climbUp(): Promise<{ success: boolean; message: string }> {
    const pos = this.bot.entity.position;
    
    // Look for higher ground nearby
    let highestY = pos.y;
    let targetPos = pos;
    
    for (let x = -10; x <= 10; x++) {
      for (let z = -10; z <= 10; z++) {
        for (let y = 0; y <= 20; y++) {
          const checkPos = pos.offset(x, y, z);
          const block = this.bot.blockAt(checkPos);
          const above = this.bot.blockAt(checkPos.offset(0, 1, 0));
          const above2 = this.bot.blockAt(checkPos.offset(0, 2, 0));
          
          if (block && block.name !== 'air' && 
              above && above.name === 'air' && 
              above2 && above2.name === 'air' &&
              checkPos.y > highestY) {
            highestY = checkPos.y;
            targetPos = checkPos.offset(0, 1, 0);
          }
        }
      }
    }

    if (highestY > pos.y) {
      return await this.goToPosition(targetPos.x, targetPos.y, targetPos.z);
    }
    
    return { success: false, message: 'No higher ground found nearby' };
  }

  private async descendDown(): Promise<{ success: boolean; message: string }> {
    // Look for caves or lower areas
    const pos = this.bot.entity.position;
    
    for (let y = -1; y >= -10; y--) {
      const below = this.bot.blockAt(pos.offset(0, y, 0));
      if (below && below.name === 'air') {
        // Found an opening
        const target = pos.offset(0, y + 1, 0);
        return await this.goToPosition(target.x, target.y, target.z);
      }
    }
    
    return { success: false, message: 'No way down found' };
  }

  private async startBuild(idea: string, style: string): Promise<{ success: boolean; message: string }> {
    // Ensure we're on the surface before building (but respect teleport cooldown)
    const currentY = Math.floor(this.bot.entity.position.y);
    const canTeleport = Date.now() - this.lastTeleportTime >= this.teleportCooldown;
    if (currentY < 55 && canTeleport) {
      console.log(`[${this.botName}] Underground at Y=${currentY}, teleporting to surface before building...`);
      logStream.log('INFO', `[${this.botName}] Teleporting to surface before building (was at Y=${currentY})`);
      await this.teleportToSurface();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const pos = this.bot.entity.position;
    this.currentBuild = {
      origin: pos.clone(),
      blocks: new Map()
    };
    
    this.bot.chat(`Starting to build ${idea}!`);
    return { success: true, message: `Started building ${idea} in ${style} style` };
  }

  private async placeBlock(blockType: string, offset: { x: number; y: number; z: number }): Promise<{ success: boolean; message: string }> {
    try {
      // Find the block in inventory
      const item = this.bot.inventory.items().find((i: any) => i.name === blockType);
      if (!item) {
        return { success: false, message: `Don't have ${blockType}` };
      }

      await this.bot.equip(item, 'hand');
      
      const pos = this.bot.entity.position;
      const target = pos.offset(offset.x, offset.y - 1, offset.z);
      const referenceBlock = this.bot.blockAt(target);
      
      if (!referenceBlock) {
        return { success: false, message: 'No reference block found' };
      }

      await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
      return { success: true, message: `Placed ${blockType}` };
    } catch (e: any) {
      return { success: false, message: `Failed to place block: ${e.message}` };
    }
  }

  private async buildShape(shape: string, material: string, size: number | string): Promise<{ success: boolean; message: string }> {
    // Safety check: ensure bot is connected and spawned
    if (!this.bot || !this.bot.entity) {
      return { success: false, message: 'Bot not ready - waiting to spawn' };
    }
    
    // Normalize size: convert string descriptors to numbers
    const sizeMap: Record<string, number> = { tiny: 3, small: 5, medium: 8, large: 12, huge: 16, massive: 20 };
    const numericSize = typeof size === 'string' 
      ? (sizeMap[size.toLowerCase()] || parseInt(size) || 8) 
      : (size || 8);
    size = Math.max(3, Math.min(numericSize, 30)); // Clamp between 3-30
    
    // Ensure we're on the surface before building (but respect teleport cooldown)
    const currentY = Math.floor(this.bot.entity.position.y);
    const canTeleport = Date.now() - this.lastTeleportTime >= this.teleportCooldown;
    if (currentY < 55 && canTeleport) {
      console.log(`[${this.botName}] Underground at Y=${currentY}, teleporting to surface before building...`);
      logStream.log('INFO', `[${this.botName}] Teleporting to surface before building (was at Y=${currentY})`);
      await this.teleportToSurface();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // In creative mode, use /setblock commands - no inventory needed!
    if (this.creativeMode) {
      return this.buildShapeCreative(shape, material, size);
    }
    
    // Map common material names to what's actually in inventory
    // (e.g., mining "stone" drops "cobblestone", mining "deepslate" drops "cobbled_deepslate")
    const materialAliases: Record<string, string[]> = {
      'stone': ['stone', 'cobblestone', 'smooth_stone'],
      'deepslate': ['deepslate', 'cobbled_deepslate', 'polished_deepslate'],
      'granite': ['granite', 'polished_granite'],
      'diorite': ['diorite', 'polished_diorite'],
      'andesite': ['andesite', 'polished_andesite'],
      'sandstone': ['sandstone', 'smooth_sandstone', 'cut_sandstone'],
      'wood': ['oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks'],
    };
    
    // Try to find the material or any of its aliases in inventory
    let item = this.bot.inventory.items().find((i: any) => i.name === material);
    
    // If not found, check aliases
    if (!item) {
      const aliases = materialAliases[material] || [];
      for (const alias of aliases) {
        item = this.bot.inventory.items().find((i: any) => i.name === alias);
        if (item) break;
      }
    }
    
    // Also try to find ANY building material if the requested one isn't available
    if (!item) {
      const buildingMaterials = ['cobblestone', 'cobbled_deepslate', 'stone', 'deepslate', 'dirt', 'oak_planks', 'spruce_planks', 'andesite', 'diorite', 'granite'];
      for (const mat of buildingMaterials) {
        item = this.bot.inventory.items().find((i: any) => i.name === mat);
        if (item && item.count >= 10) {
          console.log(`[${this.botName}] Using ${item.name} instead of ${material}`);
          break;
        }
      }
    }
    
    if (!item) {
      // List what we actually have
      const inventory = this.bot.inventory.items().map((i: any) => `${i.name}:${i.count}`).join(', ');
      return { success: false, message: `Don't have ${material} to build with. Inventory: ${inventory}` };
    }

    let blocksPlaced = 0;
    const pos = this.bot.entity.position.floored();

    try {
      await this.bot.equip(item, 'hand');

      switch (shape) {
        case 'wall':
          for (let x = 0; x < size && blocksPlaced < item.count; x++) {
            for (let y = 0; y < 3; y++) {
              const target = pos.offset(x, y, 2);
              const below = this.bot.blockAt(target.offset(0, -1, 0));
              if (below && below.name !== 'air') {
                try {
                  await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                  blocksPlaced++;
                  // Place torch every 6 blocks for visibility
                  if (blocksPlaced % 6 === 0) {
                    await this.placeTorchIfNeeded();
                    await this.bot.equip(item, 'hand'); // Re-equip building material
                  }
                } catch (_) { /* block placement can fail - expected */ }
              }
            }
          }
          break;

        case 'floor':
          for (let x = 0; x < size && blocksPlaced < item.count; x++) {
            for (let z = 0; z < size; z++) {
              const target = pos.offset(x, -1, z);
              const below = this.bot.blockAt(target.offset(0, -1, 0));
              if (below && below.name !== 'air') {
                try {
                  await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                  blocksPlaced++;
                  // Place torch every 6 blocks for visibility
                  if (blocksPlaced % 6 === 0) {
                    await this.placeTorchIfNeeded();
                    await this.bot.equip(item, 'hand'); // Re-equip building material
                  }
                } catch (_) { /* block placement can fail - expected */ }
              }
            }
          }
          break;

        case 'pillar':
          for (let y = 0; y < size && blocksPlaced < item.count; y++) {
            const target = pos.offset(0, y, 0);
            const below = this.bot.blockAt(target.offset(0, -1, 0));
            if (below) {
              try {
                await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                blocksPlaced++;
              } catch (_) { /* block placement can fail - expected */ }
            }
          }
          break;

        default:
          return { success: false, message: `Unknown shape: ${shape}` };
      }

      // Place a torch after completing the build for visibility
      await this.placeTorchIfNeeded();

      // Record build to world memory
      const worldMemory = getWorldMemory();
      const build = worldMemory.registerBuild({
        name: `${shape} structure`,
        builder: this.botName,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        width: size,
        height: shape === 'pillar' ? size : (shape === 'wall' ? size : size),
        depth: size,
        type: 'other',
        description: `A ${size}-block ${shape} made of ${material}`,
        materials: [material]
      });
      worldMemory.completeBuild(build.id);

      // Track build in agent progression + auto-store memory
      this.agent.recordBuild(shape, material, size, true);
      this.agent.storeBuildMemory(shape, material, size, blocksPlaced, { x: pos.x, y: pos.y, z: pos.z });

      return { success: true, message: `Built ${shape} with ${blocksPlaced} ${material} blocks` };
    } catch (e: any) {
      return { success: false, message: `Build failed: ${e.message}` };
    }
  }

  // Helper for delays in creative mode
  // Minecraft servers kick for "spamming" if commands are sent too quickly
  // Use a minimum of 80ms between commands to stay safe
  private static readonly CREATIVE_COMMAND_DELAY_MS = 80;
  
  private delay(ms: number): Promise<void> {
    // Enforce minimum delay to prevent server kick for spam
    const safeDelay = Math.max(ms, AutonomousBotController.CREATIVE_COMMAND_DELAY_MS);
    return new Promise(resolve => setTimeout(resolve, safeDelay));
  }

  /**
   * Rate-limited chat to prevent spam kicks
   * Ensures minimum time between chat messages
   */
  private async safeChat(message: string): Promise<void> {
    const now = Date.now();
    const timeSinceLastChat = now - this.lastChatTime;
    
    if (timeSinceLastChat < this.chatCooldown) {
      // Wait for remaining cooldown
      await new Promise(resolve => setTimeout(resolve, this.chatCooldown - timeSinceLastChat));
    }
    
    this.bot.chat(message);
    this.lastChatTime = Date.now();
  }

  // Creative mode building using /setblock commands - unlimited resources!
  private async buildShapeCreative(shape: string, material: string, size: number | string): Promise<{ success: boolean; message: string }> {
    // Safety check: ensure bot is connected and spawned
    if (!this.bot || !this.bot.entity) {
      return { success: false, message: 'Bot not ready - waiting to spawn' };
    }
    
    // Normalize size: convert string descriptors to numbers
    const sizeMap: Record<string, number> = { tiny: 3, small: 5, medium: 8, large: 12, huge: 16, massive: 20 };
    const numericSize = typeof size === 'string' 
      ? (sizeMap[size.toLowerCase()] || parseInt(size) || 8) 
      : (size || 8);
    size = Math.max(3, Math.min(numericSize, 30)); // Clamp between 3-30
    
    // Ensure we're on the surface before building (but respect teleport cooldown)
    const currentY = Math.floor(this.bot.entity.position.y);
    const canTeleport = Date.now() - this.lastTeleportTime >= this.teleportCooldown;
    if (currentY < 55 && canTeleport) {
      console.log(`[${this.botName}] Underground at Y=${currentY}, teleporting to surface before creative building...`);
      logStream.log('INFO', `[${this.botName}] Teleporting to surface before creative building (was at Y=${currentY})`);
      await this.teleportToSurface();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    let blocksPlaced = 0;
    const pos = this.bot.entity.position.floored();
    const blockName = `minecraft:${material.replace('minecraft:', '')}`;

    try {
      console.log(`[${this.botName}] 🎨 Creative mode: Building ${shape} with ${material} (size: ${size})`);

      switch (shape) {
        case 'wall':
          for (let x = 0; x < size; x++) {
            for (let y = 0; y < 3; y++) {
              const target = pos.offset(x, y, 2);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
              blocksPlaced++;
              await this.delay(50); // Small delay to avoid spam
            }
          }
          break;

        case 'floor':
          for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
              const target = pos.offset(x, 0, z);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
              blocksPlaced++;
              await this.delay(50);
            }
          }
          break;

        case 'pillar':
          for (let y = 0; y < size; y++) {
            const target = pos.offset(0, y, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
            blocksPlaced++;
            await this.delay(50);
          }
          break;

        case 'cube':
        case 'box':
          for (let x = 0; x < size; x++) {
            for (let y = 0; y < size; y++) {
              for (let z = 0; z < size; z++) {
                const target = pos.offset(x, y, z);
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
                blocksPlaced++;
                await this.delay(30);
              }
            }
          }
          break;

        case 'square':
          // Hollow square on the ground
          for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
              // Only place on edges
              if (x === 0 || x === size - 1 || z === 0 || z === size - 1) {
                const target = pos.offset(x, 0, z);
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
                blocksPlaced++;
                await this.delay(50);
              }
            }
          }
          break;

        case 'pyramid':
          let currentSize = size;
          let level = 0;
          while (currentSize > 0) {
            const offset = Math.floor((size - currentSize) / 2);
            for (let x = 0; x < currentSize; x++) {
              for (let z = 0; z < currentSize; z++) {
                const target = pos.offset(x + offset, level, z + offset);
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
                blocksPlaced++;
                await this.delay(20);
              }
            }
            currentSize -= 2;
            level++;
          }
          break;

        case 'tower':
          // Build a hollow tower with walls
          const towerSize = Math.max(5, size);
          const towerHeight = Math.max(10, size * 2);
          for (let y = 0; y < towerHeight; y++) {
            for (let x = 0; x < towerSize; x++) {
              for (let z = 0; z < towerSize; z++) {
                // Only edges (hollow tower)
                if (x === 0 || x === towerSize - 1 || z === 0 || z === towerSize - 1) {
                  const target = pos.offset(x, y, z);
                  this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
                  blocksPlaced++;
                  await this.delay(15);
                }
              }
            }
          }
          // Add crenellations on top
          for (let x = 0; x < towerSize; x += 2) {
            for (let z = 0; z < towerSize; z += 2) {
              if (x === 0 || x === towerSize - 1 || z === 0 || z === towerSize - 1) {
                const target = pos.offset(x, towerHeight, z);
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
                blocksPlaced++;
                await this.delay(15);
              }
            }
          }
          break;

        case 'house':
          // Build a simple house with walls and roof
          const houseWidth = Math.max(7, size);
          const houseHeight = 4;
          // Floor
          for (let x = 0; x < houseWidth; x++) {
            for (let z = 0; z < houseWidth; z++) {
              const target = pos.offset(x, 0, z);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
              blocksPlaced++;
              await this.delay(15);
            }
          }
          // Walls
          for (let y = 1; y <= houseHeight; y++) {
            for (let x = 0; x < houseWidth; x++) {
              for (let z = 0; z < houseWidth; z++) {
                if (x === 0 || x === houseWidth - 1 || z === 0 || z === houseWidth - 1) {
                  const target = pos.offset(x, y, z);
                  this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
                  blocksPlaced++;
                  await this.delay(15);
                }
              }
            }
          }
          // Roof (pyramid style)
          let roofSize = houseWidth;
          let roofLevel = houseHeight + 1;
          while (roofSize > 0) {
            const roofOffset = Math.floor((houseWidth - roofSize) / 2);
            for (let x = 0; x < roofSize; x++) {
              for (let z = 0; z < roofSize; z++) {
                const target = pos.offset(x + roofOffset, roofLevel, z + roofOffset);
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:oak_planks`);
                blocksPlaced++;
                await this.delay(15);
              }
            }
            roofSize -= 2;
            roofLevel++;
          }
          break;

        case 'arch':
          // Build a decorative arch
          const archWidth = Math.max(5, size);
          const archHeight = Math.max(5, Math.floor(size * 1.5));
          // Two pillars
          for (let y = 0; y < archHeight - 2; y++) {
            const left = pos.offset(0, y, 0);
            const right = pos.offset(archWidth - 1, y, 0);
            this.bot.chat(`/setblock ${left.x} ${left.y} ${left.z} ${blockName}`);
            await this.delay(80);
            this.bot.chat(`/setblock ${right.x} ${right.y} ${right.z} ${blockName}`);
            blocksPlaced += 2;
            await this.delay(80);
          }
          // Curved top
          for (let x = 0; x < archWidth; x++) {
            const heightOffset = Math.floor(2 * Math.sin(Math.PI * x / (archWidth - 1)));
            const target = pos.offset(x, archHeight - 2 + heightOffset, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
            blocksPlaced++;
            await this.delay(80);
          }
          break;

        case 'staircase':
          // Build a spiral staircase
          const stairHeight = Math.max(10, size);
          for (let y = 0; y < stairHeight; y++) {
            const angle = (y * Math.PI) / 2; // 90 degrees per level
            const sx = Math.floor(Math.cos(angle) * 2) + 2;
            const sz = Math.floor(Math.sin(angle) * 2) + 2;
            const target = pos.offset(sx, y, sz);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:oak_stairs`);
            blocksPlaced++;
            await this.delay(50);
          }
          break;

        case 'decoration':
        case 'detail':
        case 'single':
          // Place a single detail block - perfect for sculptor fine work
          const detailTarget = pos.offset(0, 0, 1);
          this.bot.chat(`/setblock ${detailTarget.x} ${detailTarget.y} ${detailTarget.z} ${blockName}`);
          blocksPlaced = 1;
          break;

        case 'window':
          // Build a window frame with glass
          const windowSize = Math.max(2, Math.min(size, 4));
          for (let x = 0; x < windowSize; x++) {
            for (let y = 0; y < windowSize; y++) {
              const target = pos.offset(x, y + 1, 1);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:glass_pane`);
              blocksPlaced++;
              await this.delay(30);
            }
          }
          break;

        case 'door':
          // Place a door
          const doorBottom = pos.offset(0, 0, 1);
          const doorTop = pos.offset(0, 1, 1);
          this.bot.chat(`/setblock ${doorBottom.x} ${doorBottom.y} ${doorBottom.z} minecraft:oak_door[half=lower]`);
          await this.delay(80);
          this.bot.chat(`/setblock ${doorTop.x} ${doorTop.y} ${doorTop.z} minecraft:oak_door[half=upper]`);
          blocksPlaced = 2;
          break;

        case 'lanternRow':
          // Place a row of lanterns for path lighting
          for (let x = 0; x < size; x++) {
            const target = pos.offset(x * 3, 0, 1);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:lantern`);
            blocksPlaced++;
            await this.delay(50);
          }
          break;

        case 'flowerBed':
          // Create a decorative flower bed
          const flowers = ['poppy', 'dandelion', 'cornflower', 'azure_bluet', 'oxeye_daisy'];
          for (let x = 0; x < size; x++) {
            for (let z = 0; z < Math.min(size, 3); z++) {
              const flower = flowers[(x + z) % flowers.length];
              const target = pos.offset(x, 0, z + 1);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:${flower}`);
              blocksPlaced++;
              await this.delay(30);
            }
          }
          break;

        case 'fence':
          // Build a fence line
          for (let x = 0; x < size; x++) {
            const target = pos.offset(x, 0, 1);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName.includes('fence') ? blockName : 'minecraft:oak_fence'}`);
            blocksPlaced++;
            await this.delay(50);
          }
          break;

        case 'chimney':
          // Build a decorative chimney
          const chimneyHeight = Math.max(3, size);
          for (let y = 0; y < chimneyHeight; y++) {
            const target = pos.offset(0, y, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:brick`);
            blocksPlaced++;
            await this.delay(50);
          }
          // Add smoke effect with campfire
          const smokeTarget = pos.offset(0, chimneyHeight, 0);
          this.bot.chat(`/setblock ${smokeTarget.x} ${smokeTarget.y} ${smokeTarget.z} minecraft:campfire`);
          blocksPlaced++;
          break;

        case 'streetLamp':
        case 'lampPost':
          // Build a decorative street lamp/lamp post
          const lampHeight = Math.max(3, Math.min(size, 5));
          // Post
          for (let y = 0; y < lampHeight; y++) {
            const target = pos.offset(0, y, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:oak_fence`);
            blocksPlaced++;
            await this.delay(40);
          }
          // Lantern on top
          const lampTop = pos.offset(0, lampHeight, 0);
          this.bot.chat(`/setblock ${lampTop.x} ${lampTop.y} ${lampTop.z} minecraft:lantern[hanging=false]`);
          blocksPlaced++;
          break;

        case 'path':
        case 'road':
          // Build a cobblestone path
          const pathLength = Math.max(5, size);
          const pathWidth = 3;
          for (let x = 0; x < pathLength; x++) {
            for (let z = 0; z < pathWidth; z++) {
              const target = pos.offset(x, -1, z);
              // Alternate cobblestone pattern
              const block = (x + z) % 3 === 0 ? 'minecraft:mossy_cobblestone' : 'minecraft:cobblestone';
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${block}`);
              blocksPlaced++;
              await this.delay(20);
            }
          }
          break;

        case 'bench':
          // Build a sitting bench with stairs and signs
          // Left arm
          this.bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z} minecraft:oak_stairs[facing=east]`);
          await this.delay(80);
          // Seat (2 blocks)
          this.bot.chat(`/setblock ${pos.x + 1} ${pos.y} ${pos.z} minecraft:oak_slab[type=bottom]`);
          await this.delay(80);
          this.bot.chat(`/setblock ${pos.x + 2} ${pos.y} ${pos.z} minecraft:oak_slab[type=bottom]`);
          await this.delay(80);
          // Right arm
          this.bot.chat(`/setblock ${pos.x + 3} ${pos.y} ${pos.z} minecraft:oak_stairs[facing=west]`);
          blocksPlaced = 4;
          break;

        case 'fountain':
          // Build a decorative water fountain
          const fountainSize = Math.max(3, Math.min(size, 7));
          const half = Math.floor(fountainSize / 2);
          // Base pool (circular-ish)
          for (let x = -half; x <= half; x++) {
            for (let z = -half; z <= half; z++) {
              if (Math.abs(x) + Math.abs(z) <= half + 1) {
                // Rim
                if (Math.abs(x) + Math.abs(z) >= half) {
                  const target = pos.offset(x, 0, z);
                  this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:stone_bricks`);
                } else {
                  // Water
                  const target = pos.offset(x, 0, z);
                  this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:water`);
                }
                blocksPlaced++;
                await this.delay(30);
              }
            }
          }
          // Center pillar
          for (let y = 1; y <= 3; y++) {
            const target = pos.offset(0, y, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:stone_brick_wall`);
            blocksPlaced++;
            await this.delay(30);
          }
          // Water source on top
          this.bot.chat(`/setblock ${pos.x} ${pos.y + 4} ${pos.z} minecraft:water`);
          blocksPlaced++;
          break;

        case 'gazebo':
        case 'pergola':
          // Build a small gazebo/pergola structure
          const gazeboSize = 5;
          // Four corner pillars
          for (const [dx, dz] of [[0, 0], [gazeboSize-1, 0], [0, gazeboSize-1], [gazeboSize-1, gazeboSize-1]]) {
            for (let y = 0; y < 4; y++) {
              const target = pos.offset(dx, y, dz);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:oak_fence`);
              blocksPlaced++;
              await this.delay(30);
            }
          }
          // Roof beams
          for (let x = 0; x < gazeboSize; x++) {
            this.bot.chat(`/setblock ${pos.x + x} ${pos.y + 4} ${pos.z} minecraft:oak_slab`);
            await this.delay(80);
            this.bot.chat(`/setblock ${pos.x + x} ${pos.y + 4} ${pos.z + gazeboSize - 1} minecraft:oak_slab`);
            blocksPlaced += 2;
            await this.delay(80);
          }
          for (let z = 1; z < gazeboSize - 1; z++) {
            this.bot.chat(`/setblock ${pos.x} ${pos.y + 4} ${pos.z + z} minecraft:oak_slab`);
            await this.delay(80);
            this.bot.chat(`/setblock ${pos.x + gazeboSize - 1} ${pos.y + 4} ${pos.z + z} minecraft:oak_slab`);
            blocksPlaced += 2;
            await this.delay(80);
          }
          break;

        case 'garden':
          // Build a decorative garden with flowers and grass
          const gardenFlowers = ['poppy', 'dandelion', 'cornflower', 'azure_bluet', 'oxeye_daisy', 'allium', 'blue_orchid', 'red_tulip'];
          for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
              const target = pos.offset(x, 0, z);
              // Mix of grass and flowers
              if (Math.random() < 0.4) {
                const flower = gardenFlowers[Math.floor(Math.random() * gardenFlowers.length)];
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:${flower}`);
              } else if (Math.random() < 0.6) {
                this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:grass`);
              }
              blocksPlaced++;
              await this.delay(25);
            }
          }
          break;

        case 'hedge':
          // Build a hedge line using leaves
          for (let x = 0; x < size; x++) {
            const target = pos.offset(x, 0, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:oak_leaves[persistent=true]`);
            // Second layer for taller hedge
            if (size > 5) {
              this.bot.chat(`/setblock ${target.x} ${target.y + 1} ${target.z} minecraft:oak_leaves[persistent=true]`);
              blocksPlaced++;
            }
            blocksPlaced++;
            await this.delay(40);
          }
          break;

        case 'statue':
        case 'monument':
          // Build a simple statue/monument with armor stand or blocks
          // Base pedestal
          for (let x = -1; x <= 1; x++) {
            for (let z = -1; z <= 1; z++) {
              const target = pos.offset(x, 0, z);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:stone_bricks`);
              blocksPlaced++;
              await this.delay(30);
            }
          }
          // Pillar
          for (let y = 1; y <= 3; y++) {
            const target = pos.offset(0, y, 0);
            this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} minecraft:quartz_pillar`);
            blocksPlaced++;
            await this.delay(30);
          }
          // Top decoration
          this.bot.chat(`/setblock ${pos.x} ${pos.y + 4} ${pos.z} minecraft:lightning_rod`);
          blocksPlaced++;
          break;

        case 'marketStall':
        case 'stall':
          // Build a market stall with awning
          // Counter (needs delays to avoid spam kick)
          for (let x = 0; x < 3; x++) {
            this.bot.chat(`/setblock ${pos.x + x} ${pos.y} ${pos.z} minecraft:oak_slab[type=top]`);
            blocksPlaced++;
            await this.delay(80);
          }
          // Back wall
          for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 3; y++) {
              this.bot.chat(`/setblock ${pos.x + x} ${pos.y + y} ${pos.z + 1} minecraft:oak_planks`);
              blocksPlaced++;
              await this.delay(80);
            }
          }
          // Awning (wool - needs delays)
          for (let x = -1; x < 4; x++) {
            this.bot.chat(`/setblock ${pos.x + x} ${pos.y + 3} ${pos.z - 1} minecraft:red_wool`);
            blocksPlaced++;
            await this.delay(80);
          }
          break;

        // ===== 3D SCULPTURES =====
        case 'sculpture':
        case 'pixelArt':
          // Build a pre-defined 3D sculpture
          // material parameter can be used to specify sculpture type (e.g., "cat", "dog")
          const sculptureNames = getSculptureNames();
          const sculptureType = (material && sculptureNames.includes(material)) 
            ? material 
            : sculptureNames[Math.floor(Math.random() * sculptureNames.length)];
          
          if (SCULPTURES[sculptureType]) {
            const commands = buildSculptureCommands(sculptureType, pos.x, pos.y, pos.z);
            console.log(`[${this.botName}] 🗿 Building sculpture: ${sculptureType} (${commands.length} blocks)`);
            logStream.log('ACTION', `[${this.botName}] Building ${sculptureType} sculpture`);
            
            for (const cmd of commands) {
              this.bot.chat(cmd);
              blocksPlaced++;
              await this.delay(60); // Increased delay to avoid spam kicks
            }
          } else {
            console.log(`[${this.botName}] Unknown sculpture type: ${sculptureType}. Available: ${sculptureNames.join(', ')}`);
            return { success: false, message: `Unknown sculpture: ${sculptureType}. Try: ${sculptureNames.slice(0,5).join(', ')}...` };
          }
          break;

        // Individual sculpture shortcuts
        case 'cat':
        case 'dog':
        case 'owl':
        case 'creeperHead':
        case 'dragonHead':
        case 'heart':
        case 'star':
        case 'skull':
        case 'mushroom':
        case 'sword':
        case 'tree':
          // Direct sculpture building by name
          if (SCULPTURES[shape]) {
            const cmds = buildSculptureCommands(shape, pos.x, pos.y, pos.z, material);
            console.log(`[${this.botName}] 🗿 Building ${shape} sculpture (${cmds.length} blocks)`);
            logStream.log('ACTION', `[${this.botName}] Building ${shape} sculpture`);
            
            for (const cmd of cmds) {
              this.bot.chat(cmd);
              blocksPlaced++;
              await this.delay(60); // Increased delay to avoid spam kicks
            }
          }
          break;

        // ===== REDDIT-INSPIRED COMPOUND BUILDS =====
        case 'cottage':
          // Cozy cottage with overhanging roof, chimney, and flower boxes (Reddit r/Minecraftbuilds inspired)
          const cW = Math.max(7, size); const cL = Math.max(9, size + 2); const cH = 5;
          // Foundation
          for (let x = 0; x < cW; x++) {
            for (let z = 0; z < cL; z++) {
              this.bot.chat(`/setblock ${pos.x + x} ${pos.y} ${pos.z + z} minecraft:cobblestone`);
              blocksPlaced++; await this.delay(20);
            }
          }
          // Walls with log pillars at corners
          for (let y = 1; y <= cH; y++) {
            for (let x = 0; x < cW; x++) {
              for (let z = 0; z < cL; z++) {
                const isCorner = (x === 0 || x === cW-1) && (z === 0 || z === cL-1);
                const isEdge = x === 0 || x === cW-1 || z === 0 || z === cL-1;
                if (isCorner) {
                  this.bot.chat(`/setblock ${pos.x + x} ${pos.y + y} ${pos.z + z} minecraft:stripped_spruce_log`);
                  blocksPlaced++; await this.delay(20);
                } else if (isEdge) {
                  this.bot.chat(`/setblock ${pos.x + x} ${pos.y + y} ${pos.z + z} minecraft:spruce_planks`);
                  blocksPlaced++; await this.delay(20);
                }
              }
            }
          }
          // Overhanging roof
          for (let rY = 0; rY < 4; rY++) {
            for (let z = -1; z < cL + 1; z++) {
              this.bot.chat(`/setblock ${pos.x - 1 + rY} ${pos.y + cH + 1 + rY} ${pos.z + z} minecraft:spruce_stairs[facing=east]`);
              this.bot.chat(`/setblock ${pos.x + cW - rY} ${pos.y + cH + 1 + rY} ${pos.z + z} minecraft:spruce_stairs[facing=west]`);
              blocksPlaced += 2; await this.delay(20);
            }
          }
          // Chimney with smoke
          for (let y = 0; y < 4; y++) {
            this.bot.chat(`/setblock ${pos.x + cW - 2} ${pos.y + cH + 2 + y} ${pos.z + 1} minecraft:bricks`);
            blocksPlaced++; await this.delay(30);
          }
          this.bot.chat(`/setblock ${pos.x + cW - 2} ${pos.y + cH + 6} ${pos.z + 1} minecraft:campfire`);
          blocksPlaced++;
          // Door + lanterns
          this.bot.chat(`/setblock ${pos.x + Math.floor(cW/2)} ${pos.y + 1} ${pos.z} minecraft:spruce_door[facing=south,half=lower]`);
          this.bot.chat(`/setblock ${pos.x + Math.floor(cW/2)} ${pos.y + 2} ${pos.z} minecraft:spruce_door[facing=south,half=upper]`);
          blocksPlaced += 2;
          // Windows with flower boxes
          for (const wx of [2, cW - 3]) {
            this.bot.chat(`/setblock ${pos.x + wx} ${pos.y + 2} ${pos.z} minecraft:glass_pane`);
            this.bot.chat(`/setblock ${pos.x + wx} ${pos.y + 3} ${pos.z} minecraft:glass_pane`);
            blocksPlaced += 2; await this.delay(40);
          }
          // Entrance lanterns on chains
          this.bot.chat(`/setblock ${pos.x + Math.floor(cW/2) - 1} ${pos.y + 3} ${pos.z - 1} minecraft:chain`);
          this.bot.chat(`/setblock ${pos.x + Math.floor(cW/2) - 1} ${pos.y + 2} ${pos.z - 1} minecraft:lantern[hanging=true]`);
          this.bot.chat(`/setblock ${pos.x + Math.floor(cW/2) + 1} ${pos.y + 3} ${pos.z - 1} minecraft:chain`);
          this.bot.chat(`/setblock ${pos.x + Math.floor(cW/2) + 1} ${pos.y + 2} ${pos.z - 1} minecraft:lantern[hanging=true]`);
          blocksPlaced += 4;
          break;

        case 'ruins':
          // Ancient overgrown ruins (Reddit inspired - mossy stone, broken walls, vine-covered)
          const rSize = Math.max(12, size);
          const ruinBlocks = ['stone_bricks', 'cracked_stone_bricks', 'mossy_stone_bricks', 'cobblestone', 'mossy_cobblestone'];
          // Scattered columns of varying heights
          for (let i = 0; i < 6; i++) {
            const cx = Math.floor(Math.random() * rSize);
            const cz = Math.floor(Math.random() * rSize);
            const colHeight = 2 + Math.floor(Math.random() * 6);
            for (let y = 0; y <= colHeight; y++) {
              const block = ruinBlocks[Math.floor(Math.random() * ruinBlocks.length)];
              this.bot.chat(`/setblock ${pos.x + cx} ${pos.y + y} ${pos.z + cz} minecraft:${block}`);
              blocksPlaced++; await this.delay(25);
            }
          }
          // Partial walls
          for (let x = 0; x < rSize; x++) {
            const wallHeight = Math.random() < 0.7 ? Math.floor(Math.random() * 4) + 1 : 0;
            for (let y = 0; y < wallHeight; y++) {
              const block = ruinBlocks[Math.floor(Math.random() * ruinBlocks.length)];
              this.bot.chat(`/setblock ${pos.x + x} ${pos.y + y} ${pos.z} minecraft:${block}`);
              blocksPlaced++; await this.delay(25);
            }
          }
          // Mossy floor and vegetation
          for (let x = 0; x < rSize; x++) {
            for (let z = 0; z < rSize; z++) {
              if (Math.random() < 0.35) {
                const floor = Math.random() < 0.5 ? 'moss_block' : 'mossy_cobblestone';
                this.bot.chat(`/setblock ${pos.x + x} ${pos.y} ${pos.z + z} minecraft:${floor}`);
                blocksPlaced++; await this.delay(15);
              }
            }
          }
          // Center altar with soul lantern
          this.bot.chat(`/setblock ${pos.x + Math.floor(rSize/2)} ${pos.y} ${pos.z + Math.floor(rSize/2)} minecraft:chiseled_stone_bricks`);
          this.bot.chat(`/setblock ${pos.x + Math.floor(rSize/2)} ${pos.y + 1} ${pos.z + Math.floor(rSize/2)} minecraft:soul_lantern`);
          blocksPlaced += 2;
          break;

        case 'farmstead':
          // Rustic farm compound: house + fence + crops + well (Reddit inspired)
          const fSize = Math.max(20, size);
          // Farmhouse walls
          for (let y = 0; y <= 4; y++) {
            for (let x = 0; x < 8; x++) {
              for (let z = 0; z < 6; z++) {
                if (y === 0 || x === 0 || x === 7 || z === 0 || z === 5) {
                  this.bot.chat(`/setblock ${pos.x + x} ${pos.y + y} ${pos.z + z} minecraft:spruce_planks`);
                  blocksPlaced++; await this.delay(15);
                }
              }
            }
          }
          // Crop fields with water
          for (let x = 10; x < Math.min(10 + fSize - 10, 19); x++) {
            for (let z = 0; z < 9; z++) {
              if (x === 14 && z === 4) {
                this.bot.chat(`/setblock ${pos.x + x} ${pos.y} ${pos.z + z} minecraft:water`);
              } else {
                this.bot.chat(`/setblock ${pos.x + x} ${pos.y} ${pos.z + z} minecraft:farmland`);
                this.bot.chat(`/setblock ${pos.x + x} ${pos.y + 1} ${pos.z + z} minecraft:wheat[age=7]`);
                blocksPlaced++;
              }
              blocksPlaced++; await this.delay(15);
            }
          }
          // Fence perimeter
          for (let x = 9; x < 20; x++) {
            this.bot.chat(`/setblock ${pos.x + x} ${pos.y + 1} ${pos.z - 1} minecraft:oak_fence`);
            this.bot.chat(`/setblock ${pos.x + x} ${pos.y + 1} ${pos.z + 9} minecraft:oak_fence`);
            blocksPlaced += 2; await this.delay(20);
          }
          // Well
          for (let wx = -1; wx <= 1; wx++) {
            for (let wz = -1; wz <= 1; wz++) {
              this.bot.chat(`/setblock ${pos.x + 5 + wx} ${pos.y} ${pos.z + 10 + wz} minecraft:cobblestone`);
              blocksPlaced++; await this.delay(20);
            }
          }
          this.bot.chat(`/setblock ${pos.x + 5} ${pos.y} ${pos.z + 10} minecraft:water`);
          // Gravel path
          for (let z = 0; z < 10; z++) {
            this.bot.chat(`/setblock ${pos.x + 9} ${pos.y} ${pos.z + z} minecraft:gravel`);
            blocksPlaced++; await this.delay(15);
          }
          break;

        case 'wizardTower':
          // Magical wizard tower with enchanting room (Reddit inspired)
          const tRadius = 4;
          const tHeight = Math.max(18, size);
          // Circular walls
          for (let y = 0; y < tHeight; y++) {
            for (let dx = -tRadius; dx <= tRadius; dx++) {
              for (let dz = -tRadius; dz <= tRadius; dz++) {
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist <= tRadius && dist > tRadius - 1.2) {
                  const block = y < 3 ? 'deepslate_bricks' : 'polished_deepslate';
                  this.bot.chat(`/setblock ${pos.x + dx} ${pos.y + y} ${pos.z + dz} minecraft:${block}`);
                  blocksPlaced++; await this.delay(20);
                }
                if (y === 0 && dist <= tRadius) {
                  this.bot.chat(`/setblock ${pos.x + dx} ${pos.y} ${pos.z + dz} minecraft:deepslate_bricks`);
                  blocksPlaced++; await this.delay(15);
                }
              }
            }
          }
          // Conical roof
          for (let rY = 0; rY < 6; rY++) {
            const rRadius = tRadius - rY * 0.7;
            for (let dx = -Math.ceil(rRadius); dx <= Math.ceil(rRadius); dx++) {
              for (let dz = -Math.ceil(rRadius); dz <= Math.ceil(rRadius); dz++) {
                if (Math.sqrt(dx * dx + dz * dz) <= rRadius) {
                  this.bot.chat(`/setblock ${pos.x + dx} ${pos.y + tHeight + rY} ${pos.z + dz} minecraft:purple_stained_glass`);
                  blocksPlaced++; await this.delay(20);
                }
              }
            }
          }
          // Top spire with end rods
          for (let y = 0; y < 3; y++) {
            this.bot.chat(`/setblock ${pos.x} ${pos.y + tHeight + 6 + y} ${pos.z} minecraft:end_rod`);
            blocksPlaced++; await this.delay(30);
          }
          // Enchanting setup
          this.bot.chat(`/setblock ${pos.x} ${pos.y + 1} ${pos.z} minecraft:enchanting_table`);
          this.bot.chat(`/setblock ${pos.x + 1} ${pos.y + 1} ${pos.z} minecraft:bookshelf`);
          this.bot.chat(`/setblock ${pos.x - 1} ${pos.y + 1} ${pos.z} minecraft:bookshelf`);
          this.bot.chat(`/setblock ${pos.x} ${pos.y + 1} ${pos.z + 1} minecraft:bookshelf`);
          this.bot.chat(`/setblock ${pos.x} ${pos.y + 1} ${pos.z - 1} minecraft:bookshelf`);
          blocksPlaced += 5;
          // Amethyst window accents
          for (let y = 3; y < tHeight; y += 4) {
            this.bot.chat(`/setblock ${pos.x + tRadius} ${pos.y + y} ${pos.z} minecraft:amethyst_block`);
            this.bot.chat(`/setblock ${pos.x - tRadius} ${pos.y + y} ${pos.z} minecraft:amethyst_block`);
            blocksPlaced += 2; await this.delay(30);
          }
          break;

        default:
          // Try to build a simple floor for unknown shapes
          console.log(`[${this.botName}] Unknown shape '${shape}', building as floor`);
          for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
              const target = pos.offset(x, 0, z);
              this.bot.chat(`/setblock ${target.x} ${target.y} ${target.z} ${blockName}`);
              blocksPlaced++;
              await this.delay(50);
            }
          }
      }

      console.log(`[${this.botName}] ✅ Creative build complete: ${blocksPlaced} blocks placed`);

      // Record creative build in world memory (same as survival mode)
      try {
        const worldMemory = getWorldMemory();
        const build = worldMemory.registerBuild({
          name: `${shape} structure`,
          builder: this.botName,
          x: pos.x, y: pos.y, z: pos.z,
          width: size, height: shape === 'pillar' || shape === 'tower' ? size : Math.min(size, 10), depth: size,
          type: 'other',
          description: `A creative-mode ${size}-block ${shape} made of ${material}`,
          materials: [material]
        });
        worldMemory.completeBuild(build.id);
      } catch (_) { /* world memory recording is best-effort */ }

      // Track build in agent progression + auto-store memory
      this.agent.recordBuild(shape, material, size, true);
      this.agent.storeBuildMemory(shape, material, blocksPlaced, blocksPlaced, { x: pos.x, y: pos.y, z: pos.z });

      return { success: true, message: `Built ${shape} with ${blocksPlaced} ${material} blocks (creative mode)` };
    } catch (e: any) {
      // Record failure in progression too
      this.agent.recordBuild(shape, material, size, false);
      return { success: false, message: `Creative build failed: ${e.message}` };
    }
  }

  /**
   * Build the Colosseum from the full blueprint using /setblock commands.
   * This is a massive build (~60K+ blocks) that uses batched placement.
   */
  async buildColosseumBlueprint(): Promise<{ success: boolean; message: string }> {
    try {
      const { generateColosseumBlueprint, COLOSSEUM_INFO } = await import('../building/colosseumPlan');
      
      this.bot.chat('🏟️ INITIATING COLOSSEUM BUILD — The PvP Arena rises!');
      console.log(`[${this.botName}] 🏟️ Starting Colosseum blueprint build...`);
      
      const blueprint = generateColosseumBlueprint();
      const totalBlocks = blueprint.length;
      
      const origin = COLOSSEUM_INFO.origin;
      const radius = 65; // outer radius
      
      // Step 0: Teleport to build site FIRST
      this.bot.chat(`/tp ${this.botName} ${origin.x} ${origin.y + 40} ${origin.z}`);
      await this.delay(2000);
      
      // Step 1: Force-load ALL chunks covering the Colosseum (prevents silent block drops)
      this.bot.chat('📦 Force-loading chunks for build area...');
      console.log(`[${this.botName}] Force-loading chunks...`);
      const minChunkX = Math.floor((origin.x - radius) / 16) * 16;
      const maxChunkX = Math.floor((origin.x + radius) / 16) * 16;
      const minChunkZ = Math.floor((origin.z - radius) / 16) * 16;
      const maxChunkZ = Math.floor((origin.z + radius) / 16) * 16;
      this.bot.chat(`/forceload add ${minChunkX} ${minChunkZ} ${maxChunkX} ${maxChunkZ}`);
      await this.delay(3000);
      
      // Step 2: Clear the build area with /fill air (in sections, max 32768 blocks per /fill)
      this.bot.chat('🧹 Clearing build area...');
      console.log(`[${this.botName}] Clearing build area...`);
      const clearMinX = origin.x - radius - 2;
      const clearMaxX = origin.x + radius + 2;
      const clearMinZ = origin.z - radius - 2;
      const clearMaxZ = origin.z + radius + 2;
      const clearMinY = origin.y - 5;  // Below foundation
      const clearMaxY = origin.y + 40; // Above crown
      
      // Clear in vertical slices (each slice within 32768 block limit)
      for (let y = clearMinY; y <= clearMaxY; y += 10) {
        const yEnd = Math.min(y + 9, clearMaxY);
        this.bot.chat(`/fill ${clearMinX} ${y} ${clearMinZ} ${clearMaxX} ${yEnd} ${clearMaxZ} minecraft:air`);
        await this.delay(200);
      }
      this.bot.chat('✅ Area cleared!');
      await this.delay(1000);
      
      this.bot.chat(`📐 ${COLOSSEUM_INFO.dimensions.outerDiameter} blocks wide, ${COLOSSEUM_INFO.dimensions.height} blocks tall`);
      this.bot.chat(`🧱 ${totalBlocks.toLocaleString()} blocks to place. This will take a while...`);
      
      // Sort by priority (foundation first, details last)
      blueprint.sort((a, b) => a.priority - b.priority);
      
      let blocksPlaced = 0;
      let lastProgressReport = 0;
      let currentSection = '';
      const startTime = Date.now();
      
      // Build in batches to keep the connection alive (keepalive needs event loop time)
      // Paper server packet limit is 5000/7sec (~714/sec). We target ~130/sec to be safe.
      const BATCH_SIZE = 20;        // blocks per batch
      const BATCH_DELAY = 150;      // ms between batches — yields to event loop for keepalive
      const SECTION_DELAY = 500;    // ms pause on section change
      const PROGRESS_INTERVAL = 5000;
      
      for (let i = 0; i < blueprint.length; i++) {
        const block = blueprint[i];
        
        // Announce section transitions
        if (block.section !== currentSection) {
          currentSection = block.section;
          this.bot.chat(`⚒️ Building section: ${currentSection}`);
          console.log(`[${this.botName}] Building section: ${currentSection}`);
          await this.delay(SECTION_DELAY);
        }
        
        // Place the block
        const blockName = `minecraft:${block.blockType.replace('minecraft:', '')}`;
        this.bot.chat(`/setblock ${block.x} ${block.y} ${block.z} ${blockName}`);
        blocksPlaced++;
        
        // Yield to event loop every batch — critical for keepalive pings
        if (blocksPlaced % BATCH_SIZE === 0) {
          await this.delay(BATCH_DELAY);
        }
        
        // Progress report every N blocks
        if (blocksPlaced - lastProgressReport >= PROGRESS_INTERVAL) {
          lastProgressReport = blocksPlaced;
          const pct = Math.round((blocksPlaced / totalBlocks) * 100);
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          const rate = elapsed > 0 ? Math.round(blocksPlaced / elapsed) : 0;
          const eta = rate > 0 ? Math.round((totalBlocks - blocksPlaced) / rate) : 0;
          this.bot.chat(`📊 Progress: ${pct}% (${blocksPlaced.toLocaleString()}/${totalBlocks.toLocaleString()}) — ${rate} blocks/sec — ETA: ${eta}s`);
          console.log(`[${this.botName}] Colosseum ${pct}% — ${blocksPlaced}/${totalBlocks} — ${rate} bps`);
          
          // Extra breathing room at progress checkpoints
          await this.delay(500);
        }
      }
      
      const totalTime = Math.round((Date.now() - startTime) / 1000);
      this.bot.chat(`🏟️ ✅ COLOSSEUM COMPLETE! ${blocksPlaced.toLocaleString()} blocks placed in ${totalTime}s!`);
      this.bot.chat(`🏟️ The Agent PvP Arena awaits its first battle!`);
      console.log(`[${this.botName}] ✅ Colosseum complete: ${blocksPlaced} blocks in ${totalTime}s`);
      
      // Remove forceload to save server resources
      this.bot.chat(`/forceload remove ${minChunkX} ${minChunkZ} ${maxChunkX} ${maxChunkZ}`);
      
      // Record in world memory
      try {
        const worldMemory = getWorldMemory();
        const build = worldMemory.registerBuild({
          name: 'Roman Colosseum — PvP Arena',
          builder: this.botName,
          x: origin.x, y: origin.y, z: origin.z,
          width: COLOSSEUM_INFO.dimensions.outerDiameter,
          height: COLOSSEUM_INFO.dimensions.height,
          depth: COLOSSEUM_INFO.dimensions.outerDiameter,
          type: 'other',
          description: COLOSSEUM_INFO.description,
          materials: ['sandstone', 'smooth_sandstone', 'quartz_pillar', 'stone_bricks', 'sand']
        });
        worldMemory.completeBuild(build.id);
      } catch (_) { /* best-effort */ }
      
      return { success: true, message: `Colosseum built! ${blocksPlaced} blocks placed in ${totalTime}s` };
    } catch (e: any) {
      console.error(`[${this.botName}] Colosseum build failed:`, e.message);
      return { success: false, message: `Colosseum build failed: ${e.message}` };
    }
  }

  private async decorateArea(style: string): Promise<{ success: boolean; message: string }> {
    const pos = this.bot.entity.position.floored();
    let placed = 0;

    try {
      switch (style) {
        case 'lighting':
          // Try to place torches from inventory
          const torch = this.bot.inventory.items().find((i: any) => i.name === 'torch');
          if (torch) {
            await this.bot.equip(torch, 'hand');
            // Place torches in a pattern around the bot
            for (const offset of [[-2, 0, -2], [2, 0, -2], [-2, 0, 2], [2, 0, 2]]) {
              const target = pos.offset(offset[0], offset[1], offset[2]);
              const below = this.bot.blockAt(target.offset(0, -1, 0));
              if (below && below.name !== 'air') {
                try {
                  await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                  placed++;
                } catch (_) { /* block placement can fail - expected */ }
              }
            }
          }
          return { success: placed > 0, message: placed > 0 ? `Added ${placed} torches` : 'No torches in inventory' };

        case 'garden':
          // Place flowers or saplings if available
          const plants = this.bot.inventory.items().filter((i: any) => 
            i.name.includes('flower') || i.name.includes('sapling') || i.name.includes('fern')
          );
          if (plants.length > 0) {
            await this.bot.equip(plants[0], 'hand');
            const target = pos.offset(1, 0, 1);
            const below = this.bot.blockAt(target.offset(0, -1, 0));
            if (below && (below.name.includes('grass') || below.name.includes('dirt'))) {
              try {
                await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                placed++;
              } catch (_) { /* block placement can fail - expected */ }
            }
          }
          return { success: placed > 0, message: placed > 0 ? 'Added garden decorations' : 'No plants in inventory' };

        case 'furniture':
          // Place crafting table, chest, etc if available
          const furniture = this.bot.inventory.items().find((i: any) => 
            ['crafting_table', 'chest', 'furnace', 'barrel'].includes(i.name)
          );
          if (furniture) {
            await this.bot.equip(furniture, 'hand');
            const target = pos.offset(0, 0, 1);
            const below = this.bot.blockAt(target.offset(0, -1, 0));
            if (below && below.name !== 'air') {
              try {
                await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                placed++;
              } catch (_) { /* block placement can fail - expected */ }
            }
          }
          return { success: placed > 0, message: placed > 0 ? `Placed ${furniture?.name}` : 'No furniture in inventory' };

        default:
          // Generic decoration - try to add any decorative block
          return { success: true, message: `Added ${style} decorations (conceptual)` };
      }
    } catch (e: any) {
      return { success: false, message: `Decoration failed: ${e.message}` };
    }
  }

  private async clearArea(radius: number): Promise<{ success: boolean; message: string }> {
    const pos = this.bot.entity.position;
    let blocksCleared = 0;

    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        for (let y = 0; y < 4; y++) {
          const block = this.bot.blockAt(pos.offset(x, y, z));
          if (block && block.name !== 'air' && block.name !== 'bedrock') {
            try {
              await this.bot.dig(block);
              blocksCleared++;
              // Place torch every 8 blocks for visibility when digging
              if (blocksCleared % 8 === 0) {
                await this.placeTorchIfNeeded();
              }
            } catch (_) { /* block placement can fail - expected */ }
          }
        }
      }
    }

    // Place final torch after clearing
    await this.placeTorchIfNeeded();

    return { success: true, message: `Cleared ${blocksCleared} blocks` };
  }

  private async gatherWood(count: number): Promise<{ success: boolean; message: string }> {
    const logTypes = ['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log', 'acacia_log', 'cherry_log', 'mangrove_log'];
    let gathered = 0;

    for (let i = 0; i < count && gathered < count; i++) {
      const log = this.bot.findBlock({
        matching: (block: any) => logTypes.includes(block.name),
        maxDistance: 64
      });

      if (!log) break;

      try {
        await withTimeout(
          this.bot.pathfinder.goto(new GoalNear(log.position.x, log.position.y, log.position.z, 2)),
          ACTION_TIMEOUT_MS,
          'gatherWood'
        );
        await this.bot.dig(log);
        gathered++;
      } catch (e) {
        this.bot.pathfinder.stop();
        break;
      }
    }

    // If no trees found, explore to find them
    if (gathered === 0) {
      const exploreResult = await this.explore('random');
      return { 
        success: false, 
        message: `No trees found nearby - exploring to find forest. ${exploreResult.message}` 
      };
    }

    return { 
      success: true, 
      message: `Gathered ${gathered} logs` 
    };
  }

  private async mineStone(count: number): Promise<{ success: boolean; message: string }> {
    const stoneTypes = ['stone', 'cobblestone', 'andesite', 'diorite', 'granite', 'deepslate', 'cobbled_deepslate', 'tuff', 'calcite', 'dripstone_block'];
    let mined = 0;

    for (let i = 0; i < count && mined < count; i++) {
      const stone = this.bot.findBlock({
        matching: (block: any) => stoneTypes.includes(block.name),
        maxDistance: 48
      });

      if (!stone) break;

      try {
        await withTimeout(
          this.bot.pathfinder.goto(new GoalNear(stone.position.x, stone.position.y, stone.position.z, 2)),
          ACTION_TIMEOUT_MS,
          'mineStone'
        );
        await this.bot.dig(stone);
        mined++;
        
        // Place torch every few blocks when underground for visibility
        if (mined % 4 === 0) {
          await this.placeTorchIfNeeded();
        }
      } catch (e) {
        this.bot.pathfinder.stop();
        break;
      }
    }

    // If no stone found, explore to find exposed stone
    if (mined === 0) {
      const exploreResult = await this.explore('random');
      return { 
        success: false, 
        message: `No exposed stone found - exploring to find caves or cliffs. ${exploreResult.message}` 
      };
    }

    return { 
      success: true, 
      message: `Mined ${mined} stone` 
    };
  }

  /**
   * Mine specific ore types with expert knowledge
   */
  private async mineOre(oreType: string, count: number): Promise<{ success: boolean; message: string }> {
    // Map common names to block names
    const oreMap: Record<string, string[]> = {
      'diamond': ['diamond_ore', 'deepslate_diamond_ore'],
      'iron': ['iron_ore', 'deepslate_iron_ore'],
      'gold': ['gold_ore', 'deepslate_gold_ore'],
      'coal': ['coal_ore', 'deepslate_coal_ore'],
      'copper': ['copper_ore', 'deepslate_copper_ore'],
      'redstone': ['redstone_ore', 'deepslate_redstone_ore'],
      'lapis': ['lapis_ore', 'deepslate_lapis_ore'],
      'emerald': ['emerald_ore'],
    };
    
    const targetOres = oreMap[oreType.toLowerCase()] || [oreType];
    let mined = 0;
    
    // Check optimal Y level
    const optimalY = getOptimalMiningLevel(oreType);
    const currentY = this.bot.entity.position.y;
    
    if (Math.abs(currentY - optimalY) > 30) {
      logStream.log('INFO', `[${this.botName}] Current Y=${Math.round(currentY)}, optimal for ${oreType} is Y=${optimalY}`, this.botName);
    }
    
    for (let i = 0; i < count * 3 && mined < count; i++) {
      const ore = this.bot.findBlock({
        matching: (block: any) => targetOres.includes(block.name),
        maxDistance: 32
      });

      if (!ore) break;

      try {
        await withTimeout(
          this.bot.pathfinder.goto(new GoalNear(ore.position.x, ore.position.y, ore.position.z, 2)),
          ACTION_TIMEOUT_MS,
          'mineOre'
        );
        await this.bot.dig(ore);
        mined++;
        
        // Place torches while mining
        if (mined % 3 === 0) {
          await this.placeTorchIfNeeded();
        }
      } catch (e) {
        this.bot.pathfinder.stop();
        break;
      }
    }

    return { 
      success: mined > 0, 
      message: mined > 0 ? `Mined ${mined} ${oreType} ore!` : `No ${oreType} ore found nearby. Try digging to Y=${optimalY}` 
    };
  }

  /**
   * Dig down to a specific Y level - expert mining technique
   */
  private async digToLevel(targetY: number): Promise<{ success: boolean; message: string }> {
    const currentY = this.bot.entity.position.y;
    
    if (Math.abs(currentY - targetY) < 5) {
      return { success: true, message: `Already at target level Y=${Math.round(currentY)}` };
    }
    
    const goingDown = currentY > targetY;
    let moved = 0;
    const maxMoves = Math.abs(currentY - targetY) + 10;
    
    try {
      for (let i = 0; i < maxMoves && Math.abs(this.bot.entity.position.y - targetY) > 3; i++) {
        const pos = this.bot.entity.position;
        
        if (goingDown) {
          // Dig staircase pattern (never straight down!)
          const nextX = pos.x + (i % 2 === 0 ? 1 : 0);
          const nextZ = pos.z + (i % 2 === 1 ? 1 : 0);
          const nextY = pos.y - 1;
          
          const blockBelow = this.bot.blockAt(new Vec3(nextX, nextY, nextZ));
          if (blockBelow && blockBelow.name !== 'air' && blockBelow.name !== 'water' && blockBelow.name !== 'lava') {
            // Check for lava before digging
            const twoBelow = this.bot.blockAt(new Vec3(nextX, nextY - 1, nextZ));
            if (twoBelow && twoBelow.name === 'lava') {
              logStream.log('WARN', `[${this.botName}] Lava detected below! Stopping descent.`, this.botName);
              return { success: true, message: `Stopped at Y=${Math.round(pos.y)} - lava detected below!` };
            }
            
            await this.bot.dig(blockBelow);
            moved++;
          }
          
          // Also dig the block in front to make room
          const blockFront = this.bot.blockAt(new Vec3(nextX, pos.y, nextZ));
          if (blockFront && blockFront.name !== 'air') {
            await this.bot.dig(blockFront);
          }
          
          // Move to the dug position
          await withTimeout(
            this.bot.pathfinder.goto(new GoalNear(nextX, nextY, nextZ, 1)),
            5000,
            'digToLevel'
          );
        } else {
          // Going up - pillar up with blocks
          // For now, just try to pathfind up
          await withTimeout(
            this.bot.pathfinder.goto(new GoalY(targetY)),
            ACTION_TIMEOUT_MS,
            'digToLevel'
          );
          break;
        }
        
        // Place torches periodically
        if (moved % 5 === 0) {
          await this.placeTorchIfNeeded();
        }
      }
      
      const finalY = Math.round(this.bot.entity.position.y);
      return { 
        success: true, 
        message: `Reached Y=${finalY}. ${getMiningAdvice(finalY, 'diamond')}` 
      };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { 
        success: moved > 0, 
        message: `Dug ${moved} blocks, now at Y=${Math.round(this.bot.entity.position.y)}` 
      };
    }
  }

  /**
   * Branch mining - efficient technique for finding diamonds
   */
  private async branchMine(length: number): Promise<{ success: boolean; message: string }> {
    const currentY = this.bot.entity.position.y;
    
    // Warn if not at optimal level
    if (currentY > -50 || currentY < -64) {
      logStream.log('INFO', `[${this.botName}] Note: Best diamond level is Y=-59, you're at Y=${Math.round(currentY)}`, this.botName);
    }
    
    let mined = 0;
    let oresFound = 0;
    const startPos = this.bot.entity.position.clone();
    const direction = this.getForwardDirection();
    
    try {
      for (let i = 0; i < length; i++) {
        const targetX = startPos.x + direction.x * i;
        const targetZ = startPos.z + direction.z * i;
        
        // Mine 2-high tunnel
        for (let yOffset = 0; yOffset <= 1; yOffset++) {
          const block = this.bot.blockAt(new Vec3(targetX, startPos.y + yOffset, targetZ));
          if (block && block.name !== 'air') {
            // Check if it's an ore!
            if (block.name.includes('ore')) {
              oresFound++;
              logStream.log('INFO', `[${this.botName}] Found ${block.name}!`, this.botName);
            }
            
            try {
              await this.bot.dig(block);
              mined++;
            } catch (e) {
              // Skip if can't dig
            }
          }
        }
        
        // Move forward
        try {
          await withTimeout(
            this.bot.pathfinder.goto(new GoalNear(targetX, startPos.y, targetZ, 1)),
            3000,
            'branchMine'
          );
        } catch (e) {
          break;
        }
        
        // Place torch every 8 blocks
        if (i % 8 === 0 && i > 0) {
          await this.placeTorchIfNeeded();
        }
      }
      
      return { 
        success: mined > 0, 
        message: `Mined ${length}-block tunnel, found ${oresFound} ores!` 
      };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { success: mined > 0, message: `Mined ${mined} blocks, found ${oresFound} ores` };
    }
  }

  private getForwardDirection(): { x: number; z: number } {
    const yaw = this.bot.entity.yaw;
    // Convert yaw to cardinal direction
    const x = -Math.sin(yaw);
    const z = Math.cos(yaw);
    // Normalize to primary direction
    if (Math.abs(x) > Math.abs(z)) {
      return { x: x > 0 ? 1 : -1, z: 0 };
    } else {
      return { x: 0, z: z > 0 ? 1 : -1 };
    }
  }

  /**
   * Smelt items in a furnace
   */
  private async smeltItem(item: string): Promise<{ success: boolean; message: string }> {
    // Find or craft a furnace
    let furnace = this.bot.findBlock({
      matching: (block: any) => block.name === 'furnace' || block.name === 'lit_furnace',
      maxDistance: 32
    });
    
    if (!furnace) {
      // Try to craft a furnace
      const cobble = this.bot.inventory.items().find((i: any) => i.name === 'cobblestone');
      if (!cobble || cobble.count < 8) {
        return { success: false, message: 'Need 8 cobblestone to craft a furnace' };
      }
      
      // Craft and place furnace
      const crafted = await this.craftItem('furnace');
      if (!crafted.success) {
        return { success: false, message: 'Could not craft furnace' };
      }
      
      // Place the furnace
      const pos = this.bot.entity.position;
      const placePos = new Vec3(Math.floor(pos.x) + 1, Math.floor(pos.y), Math.floor(pos.z));
      const furnaceItem = this.bot.inventory.items().find((i: any) => i.name === 'furnace');
      if (furnaceItem) {
        await this.bot.equip(furnaceItem, 'hand');
        const referenceBlock = this.bot.blockAt(placePos.offset(0, -1, 0));
        if (referenceBlock) {
          try {
            await this.bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));
            furnace = this.bot.blockAt(placePos);
          } catch (e) {
            return { success: false, message: 'Could not place furnace' };
          }
        }
      }
    }
    
    if (!furnace) {
      return { success: false, message: 'No furnace available' };
    }
    
    // Go to furnace
    await withTimeout(
      this.bot.pathfinder.goto(new GoalNear(furnace.position.x, furnace.position.y, furnace.position.z, 2)),
      ACTION_TIMEOUT_MS,
      'smeltItem'
    );
    
    // Open furnace and add items
    // Note: Full furnace interaction requires more complex logic
    return { success: true, message: `Ready to smelt at furnace. (Full smelting requires manual interaction for now)` };
  }

  /**
   * Place a torch if underground or in a dark area
   * Called periodically during mining and building
   */
  private async placeTorchIfNeeded(): Promise<void> {
    if (!this.bot || !this.bot.entity) return; // Safety check
    
    const now = Date.now();
    
    // Don't place torches too frequently
    if (now - this.lastTorchPlacement < this.torchPlacementInterval) {
      return;
    }

    const pos = this.bot.entity.position;
    
    // Check if we're underground (Y < 62 to catch caves near surface too)
    const isUnderground = pos.y < 62;
    
    // Get light levels at bot position
    const blockAtPos = this.bot.blockAt(pos);
    const skyLight = blockAtPos?.skyLight ?? 15;
    const blockLight = blockAtPos?.light ?? 15;
    
    // More aggressive dark detection - place torches if light level < 10
    // This prevents mob spawning (mobs spawn at light < 7) with safety margin
    const isDark = blockLight < 10 && skyLight < 10;
    
    // Always place torches underground regardless of current light if moving
    const needsTorch = isUnderground || isDark;
    
    if (!needsTorch) {
      return; // Well-lit surface area, no need for torch
    }

    // Check if we have torches
    let torch = this.bot.inventory.items().find((item: any) => item.name === 'torch');
    
    // If no torches, try to craft some
    if (!torch) {
      const crafted = await this.craftTorches();
      if (crafted) {
        torch = this.bot.inventory.items().find((item: any) => item.name === 'torch');
      }
    }

    if (!torch) {
      return; // No torches and couldn't craft any
    }

    // Find a suitable place to put the torch
    const floorPos = pos.floored();
    const placementSpots = [
      floorPos.offset(0, 0, 0),
      floorPos.offset(1, 0, 0),
      floorPos.offset(-1, 0, 0),
      floorPos.offset(0, 0, 1),
      floorPos.offset(0, 0, -1),
    ];

    for (const spot of placementSpots) {
      const blockBelow = this.bot.blockAt(spot.offset(0, -1, 0));
      const blockAt = this.bot.blockAt(spot);
      
      // Check if we can place a torch here (solid block below, air at spot)
      if (blockBelow && blockBelow.boundingBox === 'block' && 
          blockAt && blockAt.name === 'air') {
        try {
          await this.bot.equip(torch, 'hand');
          await this.bot.placeBlock(blockBelow, new Vec3(0, 1, 0));
          this.lastTorchPlacement = now;
          logStream.log('ACTION', `[${this.botName}] Placed torch for lighting`);
          return;
        } catch (e) {
          // Try next spot
        }
      }
    }
  }

  /**
   * Explicitly place a torch (action that can be called by the agent)
   */
  private async placeTorch(): Promise<{ success: boolean; message: string }> {
    const pos = this.bot.entity.position;
    
    // Check if we have torches
    let torch = this.bot.inventory.items().find((item: any) => item.name === 'torch');
    
    // If no torches, try to craft some
    if (!torch) {
      const crafted = await this.craftTorches();
      if (crafted) {
        torch = this.bot.inventory.items().find((item: any) => item.name === 'torch');
      }
    }

    if (!torch) {
      return { success: false, message: 'No torches available and could not craft any (need coal and sticks)' };
    }

    // Find a suitable place to put the torch
    const floorPos = pos.floored();
    const placementSpots = [
      floorPos.offset(0, 0, 0),
      floorPos.offset(1, 0, 0),
      floorPos.offset(-1, 0, 0),
      floorPos.offset(0, 0, 1),
      floorPos.offset(0, 0, -1),
      floorPos.offset(1, 0, 1),
      floorPos.offset(-1, 0, -1),
    ];

    for (const spot of placementSpots) {
      const blockBelow = this.bot.blockAt(spot.offset(0, -1, 0));
      const blockAt = this.bot.blockAt(spot);
      
      if (blockBelow && blockBelow.boundingBox === 'block' && 
          blockAt && blockAt.name === 'air') {
        try {
          await this.bot.equip(torch, 'hand');
          await this.bot.placeBlock(blockBelow, new Vec3(0, 1, 0));
          this.lastTorchPlacement = Date.now();
          return { success: true, message: 'Placed torch for lighting' };
        } catch (e) {
          // Try next spot
        }
      }
    }

    return { success: false, message: 'Could not find a suitable spot to place torch' };
  }

  /**
   * Craft torches from coal and sticks
   * Returns true if torches were successfully crafted
   */
  private async craftTorches(): Promise<boolean> {
    try {
      const coal = this.bot.inventory.items().find((item: any) => 
        item.name === 'coal' || item.name === 'charcoal'
      );
      const sticks = this.bot.inventory.items().find((item: any) => item.name === 'stick');
      
      if (!coal || !sticks) {
        // Try to make sticks from planks if we have planks
        const planks = this.bot.inventory.items().find((item: any) => item.name.includes('planks'));
        if (!sticks && planks) {
          const stickRecipe = this.bot.recipesFor(this.mcData.itemsByName['stick'].id, null, 1, null)[0];
          if (stickRecipe) {
            await this.bot.craft(stickRecipe, 1);
          }
        }
        
        // Re-check for sticks
        const newSticks = this.bot.inventory.items().find((item: any) => item.name === 'stick');
        if (!coal || !newSticks) {
          return false;
        }
      }

      // Craft torches (1 coal + 1 stick = 4 torches)
      const torchRecipe = this.bot.recipesFor(this.mcData.itemsByName['torch'].id, null, 1, null)[0];
      if (torchRecipe) {
        await this.bot.craft(torchRecipe, 1);
        logStream.log('ACTION', `[${this.botName}] Crafted torches`);
        return true;
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  private async harvestPlants(): Promise<{ success: boolean; message: string }> {
    const plantTypes = ['wheat', 'carrots', 'potatoes', 'beetroots'];
    let harvested = 0;

    for (let i = 0; i < 10; i++) {
      const plant = this.bot.findBlock({
        matching: (block: any) => plantTypes.includes(block.name),
        maxDistance: 16
      });

      if (!plant) break;

      try {
        await this.bot.dig(plant);
        harvested++;
      } catch (e) {
        break;
      }
    }

    return { 
      success: harvested > 0, 
      message: harvested > 0 ? `Harvested ${harvested} plants` : 'No plants found' 
    };
  }

  private async huntFood(): Promise<{ success: boolean; message: string }> {
    const animals = ['cow', 'pig', 'sheep', 'chicken'];
    
    const entity = Object.values(this.bot.entities).find((e: any) => 
      animals.includes(e.name) && e.position.distanceTo(this.bot.entity.position) < 32
    );

    if (!entity) {
      return { success: false, message: 'No animals found nearby' };
    }

    try {
      await withTimeout(
        this.bot.pathfinder.goto(new GoalNear((entity as any).position.x, (entity as any).position.y, (entity as any).position.z, 2)),
        ACTION_TIMEOUT_MS,
        'huntFood'
      );
      await this.bot.attack(entity);
      return { success: true, message: `Attacked ${(entity as any).name}` };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { success: false, message: `Hunt failed: ${e.message}` };
    }
  }

  private async craftItem(item: string): Promise<{ success: boolean; message: string }> {
    try {
      const itemId = this.mcData.itemsByName[item]?.id;
      if (!itemId) {
        return { success: false, message: `Unknown item: ${item}` };
      }

      const recipe = this.bot.recipesFor(itemId, null, 1, null)[0];
      if (!recipe) {
        return { success: false, message: `No recipe for ${item}` };
      }

      await this.bot.craft(recipe, 1);
      return { success: true, message: `Crafted ${item}` };
    } catch (e: any) {
      return { success: false, message: `Craft failed: ${e.message}` };
    }
  }

  private async findShelter(): Promise<{ success: boolean; message: string }> {
    // Look for enclosed areas or create simple shelter
    const pos = this.bot.entity.position;
    
    // Try to find a cave or overhang
    for (let x = -20; x <= 20; x += 5) {
      for (let z = -20; z <= 20; z += 5) {
        for (let y = -5; y <= 5; y++) {
          const checkPos = pos.offset(x, y, z);
          const block = this.bot.blockAt(checkPos);
          const above = this.bot.blockAt(checkPos.offset(0, 1, 0));
          const above2 = this.bot.blockAt(checkPos.offset(0, 2, 0));
          const ceiling = this.bot.blockAt(checkPos.offset(0, 3, 0));
          
          if (block && block.name !== 'air' &&
              above && above.name === 'air' &&
              above2 && above2.name === 'air' &&
              ceiling && ceiling.name !== 'air') {
            // Found a sheltered spot
            return await this.goToPosition(checkPos.x, checkPos.y + 1, checkPos.z);
          }
        }
      }
    }

    return { success: false, message: 'No shelter found - may need to build one' };
  }

  private async eatFood(): Promise<{ success: boolean; message: string }> {
    const foodItems = ['cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'bread', 'apple', 'carrot', 'baked_potato'];
    
    const food = this.bot.inventory.items().find((i: any) => foodItems.includes(i.name));
    if (!food) {
      return { success: false, message: 'No food in inventory' };
    }

    try {
      await this.bot.equip(food, 'hand');
      await this.bot.consume();
      return { success: true, message: `Ate ${food.name}` };
    } catch (e: any) {
      return { success: false, message: `Couldn't eat: ${e.message}` };
    }
  }

  private async sleep(): Promise<{ success: boolean; message: string }> {
    const bed = this.bot.findBlock({
      matching: (block: any) => block.name.includes('bed'),
      maxDistance: 32
    });

    if (!bed) {
      return { success: false, message: 'No bed nearby' };
    }

    try {
      await this.bot.sleep(bed);
      return { success: true, message: 'Sleeping...' };
    } catch (e: any) {
      return { success: false, message: `Can't sleep: ${e.message}` };
    }
  }

  private async flee(fromEntity: string): Promise<{ success: boolean; message: string }> {
    const entity = Object.values(this.bot.entities).find((e: any) => 
      e.name === fromEntity || e.type === fromEntity
    );

    if (!entity) {
      return { success: true, message: 'Threat not found, safe for now' };
    }

    const pos = this.bot.entity.position;
    const entityPos = (entity as any).position;
    
    // Run in opposite direction
    const dx = pos.x - entityPos.x;
    const dz = pos.z - entityPos.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    const target = pos.offset(
      (dx / distance) * 20,
      0,
      (dz / distance) * 20
    );

    try {
      this.bot.pathfinder.setMovements(this.movements!);
      await withTimeout(
        this.bot.pathfinder.goto(new GoalXZ(target.x, target.z)),
        ACTION_TIMEOUT_MS,
        'flee'
      );
      return { success: true, message: `Fled from ${fromEntity}` };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { success: false, message: `Couldn't flee: ${e.message}` };
    }
  }

  private async greetPlayer(playerName: string): Promise<{ success: boolean; message: string }> {
    const greetings = [
      `Hello ${playerName}!`,
      `Hey there ${playerName}!`,
      `Hi ${playerName}, nice to meet you!`,
      `Greetings ${playerName}!`
    ];
    
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    this.bot.chat(greeting);
    return { success: true, message: `Greeted ${playerName}` };
  }

  private async followPlayer(playerName: string): Promise<{ success: boolean; message: string }> {
    const player = this.bot.players[playerName];
    if (!player || !player.entity) {
      return { success: false, message: `Can't find ${playerName}` };
    }

    try {
      const pos = player.entity.position;
      this.bot.pathfinder.setMovements(this.movements!);
      await withTimeout(
        this.bot.pathfinder.goto(new GoalNear(pos.x, pos.y, pos.z, 3)),
        ACTION_TIMEOUT_MS,
        'followPlayer'
      );
      return { success: true, message: `Following ${playerName}` };
    } catch (e: any) {
      this.bot.pathfinder.stop();
      return { success: false, message: `Couldn't follow: ${e.message}` };
    }
  }

  private async unstuck(): Promise<{ success: boolean; message: string }> {
    // Try various methods to get unstuck
    this.bot.setControlState('jump', true);
    await this.wait(0.5);
    this.bot.setControlState('jump', false);

    // Random movement
    const angle = Math.random() * Math.PI * 2;
    const dx = Math.cos(angle) * 5;
    const dz = Math.sin(angle) * 5;
    
    const pos = this.bot.entity.position;
    try {
      this.bot.pathfinder.setMovements(this.movements!);
      await withTimeout(
        this.bot.pathfinder.goto(new GoalXZ(pos.x + dx, pos.z + dz)),
        5000, // Shorter timeout for unstuck
        'unstuck'
      );
    } catch (e) {
      this.bot.pathfinder.stop();
      // Ignore pathfinding errors during unstuck
    }

    return { success: true, message: 'Attempted to get unstuck' };
  }

  // AGENT COLLABORATION IMPLEMENTATIONS

  private async shareDiscovery(type: string, description: string): Promise<{ success: boolean; message: string }> {
    const registry = getAgentRegistry();
    const pos = this.bot.entity.position;
    
    const discoveryType = type as 'resource' | 'structure' | 'danger' | 'interesting' | 'biome';
    registry.shareDiscovery(this.botName, discoveryType, description, {
      x: pos.x,
      y: pos.y,
      z: pos.z
    });
    
    this.bot.chat(`📢 I discovered: ${description}`);
    logStream.log('SHARE', `[${this.botName}] Shared discovery: ${description}`);
    
    return { success: true, message: `Shared discovery: ${description}` };
  }

  private async requestAgentHelp(task: string): Promise<{ success: boolean; message: string }> {
    const registry = getAgentRegistry();
    const pos = this.bot.entity.position;
    
    const requestId = registry.requestHelp(this.botName, task, {
      x: pos.x,
      y: pos.y,
      z: pos.z
    });
    
    this.bot.chat(`🆘 I need help with: ${task}`);
    logStream.log('HELP', `[${this.botName}] Requested help: ${task}`);
    
    return { success: true, message: `Requested help with: ${task} (ID: ${requestId})` };
  }

  private async respondToHelp(requestId: string): Promise<{ success: boolean; message: string }> {
    const registry = getAgentRegistry();
    
    // Find the request to get location info
    const pendingRequests = registry.getPendingHelpRequests(this.botName);
    const request = pendingRequests.find(r => r.id === requestId);
    
    if (!request) {
      return { success: false, message: `Help request ${requestId} not found or already responded to` };
    }
    
    const success = registry.respondToHelp(requestId, this.botName);
    
    if (success) {
      this.bot.chat(`🤝 Coming to help ${request.requesterName} with ${request.task}!`);
      logStream.log('COLLABORATE', `[${this.botName}] Responding to help: ${request.task}`);
      
      // Record helping interaction in world memory
      const worldMemory = getWorldMemory();
      worldMemory.recordInteraction({
        agents: [this.botName, request.requesterName],
        type: 'helped',
        description: `${this.botName} responded to help ${request.requesterName} with ${request.task}`,
        impact: 3, // Significant positive impact on relationship
        location: { 
          x: Math.round(request.location.x), 
          y: Math.round(request.location.y), 
          z: Math.round(request.location.z) 
        }
      });
      
      // Go to the requester's location
      await this.goToPosition(
        Math.round(request.location.x),
        Math.round(request.location.y),
        Math.round(request.location.z)
      );
      
      return { success: true, message: `Going to help ${request.requesterName}` };
    }
    
    return { success: false, message: 'Failed to respond to help request' };
  }

  private async proposeProject(projectName: string, description: string): Promise<{ success: boolean; message: string }> {
    const registry = getAgentRegistry();
    const pos = this.bot.entity.position;
    
    const projectId = registry.proposeProject(this.botName, projectName, description, {
      x: pos.x,
      y: pos.y,
      z: pos.z
    });
    
    await this.safeChat(`🏗️ Proposing project: "${projectName}" - ${description}`);
    logStream.log('PROJECT', `[${this.botName}] Proposed project: ${projectName}`);
    
    return { success: true, message: `Proposed project: ${projectName} (ID: ${projectId})` };
  }

  private async joinProject(projectId: string): Promise<{ success: boolean; message: string }> {
    const registry = getAgentRegistry();
    const success = registry.joinProject(projectId, this.botName);
    
    if (success) {
      const projects = registry.getActiveProjects();
      const project = projects.find(p => p.id === projectId);
      
      if (project) {
        await this.safeChat(`🤝 Joining project: "${project.projectName}" by ${project.proposerName}!`);
        logStream.log('COLLABORATE', `[${this.botName}] Joined project: ${project.projectName}`);
        
        // Go to project location
        await this.goToPosition(
          Math.round(project.location.x),
          Math.round(project.location.y),
          Math.round(project.location.z)
        );
        
        return { success: true, message: `Joined project: ${project.projectName}` };
      }
    }
    
    return { success: false, message: `Could not join project ${projectId}` };
  }

  private async meetAgent(agentName: string): Promise<{ success: boolean; message: string }> {
    const registry = getAgentRegistry();
    const otherAgents = registry.getOtherAgents(this.botName);
    const targetAgent = otherAgents.find(a => a.name === agentName);
    
    if (!targetAgent) {
      return { success: false, message: `Agent ${agentName} not found or offline` };
    }
    
    await this.safeChat(`👋 Going to meet ${agentName}!`);
    logStream.log('SOCIAL', `[${this.botName}] Going to meet ${agentName}`);
    
    // Go to the other agent's location
    await this.goToPosition(
      Math.round(targetAgent.position.x),
      Math.round(targetAgent.position.y),
      Math.round(targetAgent.position.z)
    );
    
    return { success: true, message: `Went to meet ${agentName}` };
  }

  // Track which agents we've recently met to avoid spam
  private recentMeetings: Map<string, number> = new Map();
  private readonly MEETING_COOLDOWN_MS = 60000; // 1 minute cooldown between meetings

  /**
   * Check if any other agents are nearby and trigger a "meeting" - an information exchange
   */
  private async checkForAgentMeetings(): Promise<void> {
    if (!this.bot || !this.bot.entity) return; // Safety check
    
    const registry = getAgentRegistry();
    const pos = this.bot.entity.position;
    const nearbyAgents = registry.getNearbyAgents(
      { x: pos.x, y: pos.y, z: pos.z },
      this.botName,
      20 // 20 block radius for meetings
    );
    
    const now = Date.now();
    
    for (const otherAgent of nearbyAgents) {
      // Check cooldown
      const lastMeeting = this.recentMeetings.get(otherAgent.name) || 0;
      if (now - lastMeeting < this.MEETING_COOLDOWN_MS) {
        continue;
      }
      
      // We have a meeting!
      this.recentMeetings.set(otherAgent.name, now);
      
      // Log the meeting
      logStream.log('MEETING', `[${this.botName}] Met ${otherAgent.name}! Exchanging information...`);
      
      // Record social interaction in world memory
      const worldMemory = getWorldMemory();
      worldMemory.recordInteraction({
        agents: [this.botName, otherAgent.name],
        type: 'collaborated',
        description: `${this.botName} and ${otherAgent.name} met and exchanged information`,
        impact: 1, // Small positive impact on relationship
        location: { x: Math.round(pos.x), y: Math.round(pos.y), z: Math.round(pos.z) }
      });
      
      // Share what we're doing
      const myGoals = this.agent.getCurrentGoals();
      const myTopGoal = myGoals.length > 0 ? myGoals[0].description : 'exploring';
      
      // In-game chat about the meeting
      this.bot.chat(`👋 Hey ${otherAgent.name}! I'm working on: ${myTopGoal}`);
      
      // Acknowledge their discoveries
      const theirDiscoveries = registry.getUnacknowledgedDiscoveries(this.botName, 3);
      for (const discovery of theirDiscoveries) {
        if (discovery.discovererName === otherAgent.name) {
          registry.acknowledgeDiscovery(discovery.id, this.botName);
          console.log(`[${this.botName}] Acknowledged discovery from ${otherAgent.name}: ${discovery.description}`);
        }
      }
      
      // If they have a cool goal, maybe suggest helping
      if (otherAgent.currentGoal && otherAgent.currentGoal.includes('build')) {
        console.log(`[${this.botName}] Noticed ${otherAgent.name} is building something, might offer help later`);
      }
      
      // Only do one meeting per decision cycle
      break;
    }
  }

  private async wait(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  private stopDecisionLoop(): void {
    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
      this.decisionInterval = null;
    }
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.log(`[AUTONOMOUS] ${this.botName} exceeded max reconnect attempts (${this.maxReconnectAttempts}), giving up`);
      logStream.log('ERROR', `[${this.botName}] Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      this.running = false;
      this.isReconnecting = false;
      return;
    }

    // Exponential backoff: 2s, 4s, 8s, 16s... up to 60s max
    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 60000);
    console.log(`[AUTONOMOUS] ${this.botName} attempting to reconnect in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    logStream.log('INFO', `[${this.botName}] Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      // Clean up old bot
      if (this.bot) {
        try {
          this.bot.removeAllListeners();
          this.bot.quit();
        } catch (e) {
          // Ignore errors during cleanup
        }
        this.bot = null;
      }

      // Reconnect
      await this.start();
      
      // Success! Reset counter
      this.reconnectAttempts = 0;
      console.log(`[AUTONOMOUS] ${this.botName} successfully reconnected!`);
      logStream.log('INFO', `[${this.botName}] Reconnected successfully`);
    } catch (error: any) {
      console.error(`[AUTONOMOUS] ${this.botName} reconnect failed:`, error.message);
      logStream.log('ERROR', `[${this.botName}] Reconnect failed: ${error.message}`);
      
      // Try again
      this.isReconnecting = false;
      if (this.running) {
        this.attemptReconnect();
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  stop(): void {
    this.running = false;
    this.stopDecisionLoop();
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        this.bot.quit();
      } catch (e) {
        // Ignore errors during shutdown
      }
    }
    console.log(`[AUTONOMOUS] ${this.botName} stopped`);
    logStream.log('INFO', `[${this.botName}] Bot stopped`);
  }

  // Public methods

  getAgent(): AutonomousAgent {
    return this.agent;
  }

  suggestGoal(description: string, priority?: number): void {
    this.agent.suggestGoal(description, priority);
  }

  // Handle viewer build requests directly - for creative mode agents
  async handleViewerBuildRequest(sender: string, request: string): Promise<void> {
    if (!this.creativeMode) {
      // Non-creative mode agents just get a goal suggestion
      this.suggestGoal(`🎯 VIEWER REQUEST from ${sender}: ${request}`, 10);
      return;
    }

    // Creative mode agents execute the build IMMEDIATELY!
    console.log(`[${this.botName}] 🎨 CREATIVE MODE: Executing viewer build request immediately: ${request}`);
    logStream.log('BUILD', `[${this.botName}] 📱 BUILD REQUEST from ${sender}: ${request}`);
    
    // Use AI to analyze and enhance the request
    this.bot.chat(`📱 @${sender} requested: "${request}"`);
    this.bot.chat(`🧠 Analyzing request...`);
    
    let decision: BuildDecision;
    try {
      decision = await analyzeBuildRequest(sender, request);
    } catch (error) {
      console.error(`[${this.botName}] Build analysis failed:`, error);
      this.bot.chat(`❌ Failed to analyze request. Building default structure.`);
      decision = {
        shouldBuild: true,
        buildType: 'shape',
        shape: 'cube',
        material: 'stone_bricks',
        size: 5,
        enhancedDescription: request,
        reasoning: 'Fallback due to analysis error'
      };
    }
    
    // Check if we should build
    if (!decision.shouldBuild) {
      this.bot.chat(`❌ Sorry @${sender}, I can't build that: ${decision.rejectionReason}`);
      logStream.log('BUILD', `[${this.botName}] ❌ Rejected request from ${sender}: ${decision.rejectionReason}`);
      return;
    }
    
    // Log the AI's reasoning
    console.log(`[${this.botName}] 💭 AI Decision: ${decision.buildType} - ${decision.enhancedDescription}`);
    console.log(`[${this.botName}] 💭 Reasoning: ${decision.reasoning}`);
    if (decision.creativeNotes) {
      console.log(`[${this.botName}] ✨ Creative additions: ${decision.creativeNotes}`);
    }
    
    // Announce the enhanced interpretation
    this.bot.chat(`💡 I'll build: ${decision.enhancedDescription}`);
    if (decision.creativeNotes) {
      this.bot.chat(`✨ ${decision.creativeNotes}`);
    }
    
    // Execute based on build type
    if (decision.buildType === 'detailed_structure' && decision.structureName) {
      await this.buildDetailedStructure(sender, decision);
    } else if (decision.buildType === 'sign') {
      await this.buildSign(sender, request);
    } else {
      await this.buildShapeWithAnnouncement(
        decision.shape || 'cube',
        decision.material || 'stone_bricks',
        decision.size || 5,
        sender,
        decision.enhancedDescription
      );
    }
  }
  
  // Build a detailed structure based on AI decision
  private async buildDetailedStructure(sender: string, decision: BuildDecision): Promise<void> {
    const { findStructure } = await import('../building/detailedStructures');
    const detailedStructure = findStructure(decision.structureName || '');
    
    if (!detailedStructure) {
      this.bot.chat(`⚠️ Structure "${decision.structureName}" not found, building shape instead.`);
      await this.buildShapeWithAnnouncement('cube', 'stone_bricks', 5, sender, decision.enhancedDescription);
      return;
    }
    
    this.bot.chat(`🏛️ Building: ${detailedStructure.name}!`);
    this.bot.chat(`📐 Size: ${detailedStructure.width}x${detailedStructure.height}x${detailedStructure.depth}`);
    
    const pos = this.bot.entity.position.floored();
    let blocksPlaced = 0;
    
    for (const block of detailedStructure.blocks) {
      const bx = pos.x + block.x;
      const by = pos.y + block.y;
      const bz = pos.z + block.z;
      
      this.bot.chat(`/setblock ${bx} ${by} ${bz} minecraft:${block.block}`);
      blocksPlaced++;
      
      // Add small delay every 20 blocks to avoid command spam
      if (blocksPlaced % 20 === 0) {
        await this.delay(50);
      }
    }
    
    this.bot.chat(`✅ Done for @${sender}! Built ${detailedStructure.name} with ${blocksPlaced} blocks!`);
    logStream.log('BUILD', `[${this.botName}] ✅ Built ${detailedStructure.name} for ${sender} (${blocksPlaced} blocks)`);
    
    // Build tweets disabled - focusing on engagement replies instead
    // const twitter = getTwitterAgent();
    // if (twitter.canPost()) {
    //   twitter.announceBuildComplete(this.botName, decision.enhancedDescription, sender);
    // }
  }
  
  // Build a sign with text
  private async buildSign(sender: string, request: string): Promise<void> {
    const textMatch = request.match(/(?:says?|write|text)\s+["']?([^"']+)["']?/i) || 
                      request.match(/["']([^"']+)["']/);
    const signText = textMatch ? textMatch[1].trim() : 'Hello!';
    
    this.bot.chat(`📝 Creating a sign that says: "${signText}"!`);
    const pos = this.bot.entity.position.floored();
    this.bot.chat(`/setblock ${pos.x} ${pos.y} ${pos.z + 2} minecraft:oak_sign[rotation=8]`);
    await this.delay(100);
    this.bot.chat(`🪧 Sign placed! It says: "${signText}"`);
    logStream.log('BUILD', `[${this.botName}] ✅ Built sign for ${sender}: "${signText}"`);
    
    // Build tweets disabled - focusing on engagement replies instead
    // const twitter = getTwitterAgent();
    // if (twitter.canPost()) {
    //   twitter.announceBuildComplete(this.botName, `a sign saying "${signText}"`, sender);
    // }
  }
  
  // Build a shape with optional sender info for announcements  
  private async buildShapeWithAnnouncement(
    shape: string, 
    material: string, 
    size: number, 
    sender?: string,
    enhancedDescription?: string
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.buildShape(shape, material, size);
    
    if (result.success && sender) {
      // Build tweets disabled - focusing on engagement replies instead
      // const twitter = getTwitterAgent();
      // if (twitter.canPost()) {
      //   const buildName = enhancedDescription || `${shape} (${size}x${size}) in ${material}`;
      //   twitter.announceBuildComplete(this.botName, buildName, sender);
      // }
    }
    
    return result;
  }
}
