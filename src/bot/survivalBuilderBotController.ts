/**
 * Survival Builder Bot Controller
 * 
 * Controls a bot in SURVIVAL MODE - no operator commands!
 * - Walks everywhere (no teleporting)
 * - Mines resources
 * - Crafts materials
 * - Places blocks from inventory
 */

import mineflayer from 'mineflayer';
import { pathfinder } from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { SurvivalBuilderAgent } from '../agent/survivalBuilderAgent';
import { SurvivalBuilderActions } from './survivalBuilderActions';
import { buildCoordinator } from '../building/buildCoordinator';
import { logStream } from '../server/logStream';
import { CONFIG } from '../config';

export class SurvivalBuilderBotController {
  private host: string;
  private port: number;
  private botName: string;
  private bot: any = null;
  private agent: SurvivalBuilderAgent;
  private actions: SurvivalBuilderActions | null = null;
  private decisionInterval: any = null;
  private running: boolean = false;
  private actionInProgress: boolean = false;

  constructor(host: string, port: number, name: string) {
    this.host = host;
    this.port = port;
    this.botName = name;
    this.agent = new SurvivalBuilderAgent(name);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.bot = mineflayer.createBot({
        host: this.host,
        port: this.port,
        username: this.botName,
        version: CONFIG.bot.version,
        checkTimeoutInterval: 120000, // 2 minutes - prevent keepalive timeout
      });

      this.bot.loadPlugin(pathfinder);

      this.bot.once('spawn', async () => {
        console.log(`[SURVIVAL] ${this.botName} spawned in SURVIVAL MODE!`);
        logStream.log('INFO', `[${this.botName}] Spawned in SURVIVAL MODE - no cheats!`);
        
        this.actions = new SurvivalBuilderActions(this.bot);
        this.running = true;

        // Initialize the build coordinator
        buildCoordinator.initialize();

        // Move to surface if underground
        await this.moveToSurface();

        // Start the decision loop (slower for survival - need to gather)
        this.startDecisionLoop();
        
        resolve();
      });

      this.bot.on('error', (err: Error) => {
        console.error(`[SURVIVAL ERROR] ${this.botName}:`, err);
        logStream.log('ERROR', `[${this.botName}] ${err.message}`);
      });

      this.bot.on('kicked', (reason: string) => {
        console.log(`[SURVIVAL] ${this.botName} was kicked:`, reason);
        logStream.log('WARN', `[${this.botName}] Kicked: ${reason}`);
        this.stop();
      });

      this.bot.on('death', () => {
        console.log(`[SURVIVAL] ${this.botName} died! Respawning...`);
        logStream.log('WARN', `[${this.botName}] Died and respawning`);
      });

      this.bot.on('health', () => {
        if (this.bot.health < 10) {
          logStream.log('WARN', `[${this.botName}] Low health: ${this.bot.health}/20`);
        }
        if (this.bot.food < 6) {
          logStream.log('WARN', `[${this.botName}] Hungry: ${this.bot.food}/20`);
        }
      });

      this.bot.on('chat', (username: string, message: string) => {
        if (username === this.botName) return;
        logStream.log('CHAT', `<${username}> ${message}`);
      });
    });
  }

  /**
   * Check if bot is underground and log it
   * The AI agent will handle getting to surface through its decision loop
   */
  private async moveToSurface(): Promise<void> {
    if (!this.bot) return;

    // Wait a moment for position to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));

    const pos = this.bot.entity.position;
    const currentY = Math.floor(pos.y);
    
    if (currentY >= 60) {
      console.log(`[SURVIVAL] ${this.botName} spawned on surface at (${Math.floor(pos.x)}, ${currentY}, ${Math.floor(pos.z)})`);
      logStream.log('INFO', `[${this.botName}] Spawned on surface at Y=${currentY}`);
    } else {
      console.log(`[SURVIVAL] ${this.botName} spawned underground at Y=${currentY} - will dig to surface`);
      logStream.log('WARN', `[${this.botName}] Spawned underground at Y=${currentY} - AI will dig up`);
    }
  }

  private startDecisionLoop(): void {
    // Slower decision loop for survival mode (12 seconds) — reduced from 5s to save API tokens
    this.decisionInterval = setInterval(async () => {
      if (!this.running || this.actionInProgress) return;
      await this.makeDecision();
    }, 12000);

    // Make first decision immediately
    this.makeDecision();
  }

  private async makeDecision(): Promise<void> {
    if (!this.bot || !this.actions || !this.running) return;
    if (this.actionInProgress) {
      logStream.log('DEBUG', `[${this.botName}] Action in progress, waiting...`);
      return;
    }

    this.actionInProgress = true;

    try {
      // Gather current state including inventory
      const inventory: Record<string, number> = {};
      for (const item of this.bot.inventory.items()) {
        inventory[item.name] = (inventory[item.name] || 0) + item.count;
      }

      const state = {
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
        blocksPlaced: this.agent.getBlocksPlaced(),
        lastActions: []
      };

      // Get AI decision
      const decision = await this.agent.makeDecision(state);

      // Log the decision (as CLAUDE type for agent thoughts)
      logStream.log('CLAUDE', `${decision.action}: ${decision.reasoning}`, this.botName);

      // Execute the action
      const result = await this.actions.executeAction(decision.action, decision.parameters);

      // Log result
      logStream.log('ACTION', `${result.success ? '✓' : '✗'} ${result.message}`, this.botName);

      // Track success/failure for stuck detection
      if (result.success) {
        this.agent.recordSuccess(decision.action);
      } else {
        this.agent.recordFailure();
        
        // AUTO-UNSTUCK: If action failed, immediately try to recover
        const failures = this.agent.getConsecutiveFailures();
        if (failures >= 2) {
          logStream.log('WARN', `⚠️ ${failures} failures - auto-unstuck triggered!`, this.botName);
          const unstuckResult = await this.actions.executeAction('unstuck', {});
          logStream.log('ACTION', `🔄 Auto-unstuck: ${unstuckResult.message}`, this.botName);
        }
      }

      // Track blocks placed
      if (result.success && result.data?.placed) {
        for (let i = 0; i < result.data.placed; i++) {
          this.agent.recordBlockPlaced();
        }
      }

      // Handle chat announcements
      if (decision.announcement && result.success) {
        this.bot.chat(decision.announcement);
        logStream.log('CHAT', `[${this.botName}] ${decision.announcement}`);
      }

      // Log milestones
      const progress = buildCoordinator.getProgress();
      if (progress.placedBlocks % 100 === 0 && progress.placedBlocks > 0) {
        logStream.log('MILESTONE', `🏰 Castle Progress: ${progress.percentComplete}% (${progress.placedBlocks}/${progress.totalBlocks})`);
      }

    } catch (error: any) {
      console.error(`[${this.botName}] Decision error:`, error);
      logStream.log('ERROR', `[${this.botName}] ${error.message}`);
    } finally {
      this.actionInProgress = false;
    }
  }

  stop(): void {
    this.running = false;
    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
    }
    if (this.actions) {
      this.actions.stopBuilding();
    }
    if (this.bot) {
      this.bot.quit();
    }
    console.log(`[SURVIVAL] ${this.botName} stopped`);
    logStream.log('INFO', `[${this.botName}] Bot stopped`);
  }
}
