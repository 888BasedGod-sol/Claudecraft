/**
 * Base Bot Controller - Shared functionality for all bot controllers
 * 
 * Provides common functionality:
 * - Connection management with reconnection logic
 * - Event handling
 * - Decision loop management
 * - Pathfinder initialization
 */

import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements } from 'mineflayer-pathfinder';
import { logStream } from '../server/logStream';
import { CONFIG } from '../config';
import { sleep } from '../utils/helpers';

export interface BotControllerOptions {
  host: string;
  port: number;
  username: string;
  decisionIntervalMs?: number;
  staggerDecisions?: boolean;
}

export abstract class BaseBotController {
  protected host: string;
  protected port: number;
  protected botName: string;
  protected bot: Bot | null = null;
  protected mcData: any = null;
  protected movements: Movements | null = null;
  protected decisionInterval: NodeJS.Timeout | null = null;
  protected running: boolean = false;
  protected actionInProgress: boolean = false;
  protected reconnectAttempts: number = 0;
  protected isReconnecting: boolean = false;
  protected decisionIntervalMs: number;
  protected staggerDecisions: boolean;

  constructor(options: BotControllerOptions) {
    this.host = options.host;
    this.port = options.port;
    this.botName = options.username;
    this.decisionIntervalMs = options.decisionIntervalMs || CONFIG.decisionLoop.autonomousIntervalMs;
    this.staggerDecisions = options.staggerDecisions ?? true;
  }

  /**
   * Initialize the bot connection
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          logStream.log('ERROR', `${this.botName} connection timed out`, this.botName);
          reject(new Error('Connection timed out'));
        }
      }, CONFIG.bot.connectionTimeoutMs);

      this.bot = mineflayer.createBot({
        host: this.host,
        port: this.port,
        username: this.botName,
        version: CONFIG.bot.version,
        hideErrors: false,
        checkTimeoutInterval: 120000, // 2 minutes - prevent keepalive timeout
      });

      this.bot.loadPlugin(pathfinder);

      let settled = false;

      this.bot.once('spawn', async () => {
        clearTimeout(connectionTimeout);
        if (settled) return;
        settled = true;

        logStream.log('INFO', `${this.botName} spawned`, this.botName);

        this.mcData = require('minecraft-data')(this.bot!.version);
        this.movements = new Movements(this.bot!);
        this.movements.allowSprinting = true;
        this.movements.canDig = true;
        this.movements.allow1by1towers = true;

        this.running = true;

        await this.onSpawn();
        this.startDecisionLoop();
        this.reconnectAttempts = 0;

        resolve();
      });

      this.bot.on('error', (err: Error) => {
        clearTimeout(connectionTimeout);
        this.handleError(err, settled);
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      this.bot.on('kicked', (reason: string) => {
        clearTimeout(connectionTimeout);
        logStream.log('WARN', `${this.botName} was kicked: ${reason}`, this.botName);
        if (!settled) {
          settled = true;
          reject(new Error(`Kicked: ${reason}`));
        }
        this.running = false;
        this.stopDecisionLoop();
      });

      this.bot.on('end', () => {
        logStream.log('WARN', `${this.botName} connection ended`, this.botName);
        this.stopDecisionLoop();

        if (this.running && !this.isReconnecting) {
          this.attemptReconnect();
        }
      });

      this.bot.on('death', () => {
        logStream.log('WARN', `${this.botName} died - respawning`, this.botName);
        this.onDeath();
      });

      this.bot.on('chat', (username: string, message: string) => {
        if (username === this.botName) return;
        logStream.log('CHAT', `<${username}> ${message}`);
        this.onChat(username, message);
      });
    });
  }

  /**
   * Handle connection errors
   */
  private handleError(err: Error, alreadySettled: boolean): void {
    const isConnectionError = 
      err.message.includes('EPIPE') ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ETIMEDOUT');

    if (isConnectionError) {
      logStream.log('WARN', `${this.botName} connection error: ${err.message}`, this.botName);
    } else {
      logStream.log('ERROR', `${this.botName} error: ${err.message}`, this.botName);
    }
  }

  /**
   * Start the decision loop with optional stagger
   */
  protected startDecisionLoop(): void {
    const staggerMs = this.staggerDecisions ? Math.random() * CONFIG.decisionLoop.staggerMaxMs : 0;

    setTimeout(() => {
      this.decisionInterval = setInterval(async () => {
        if (!this.running || this.actionInProgress) return;
        await this.makeDecision();
      }, this.decisionIntervalMs);
    }, staggerMs);

    // Make first decision after stagger delay
    setTimeout(() => this.makeDecision(), 1000 + staggerMs);
  }

  /**
   * Stop the decision loop
   */
  protected stopDecisionLoop(): void {
    if (this.decisionInterval) {
      clearInterval(this.decisionInterval);
      this.decisionInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  protected async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > CONFIG.bot.reconnectMaxAttempts) {
      logStream.log('ERROR', 
        `${this.botName} exceeded max reconnect attempts (${CONFIG.bot.reconnectMaxAttempts})`,
        this.botName
      );
      this.running = false;
      this.isReconnecting = false;
      return;
    }

    const delay = Math.min(
      Math.pow(2, this.reconnectAttempts) * CONFIG.bot.reconnectBaseDelayMs,
      CONFIG.bot.reconnectMaxDelayMs
    );

    logStream.log('INFO',
      `${this.botName} reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${CONFIG.bot.reconnectMaxAttempts})`,
      this.botName
    );

    await sleep(delay);

    try {
      this.cleanupBot();
      await this.start();
      this.reconnectAttempts = 0;
      logStream.log('INFO', `${this.botName} reconnected successfully`, this.botName);
    } catch (error: any) {
      logStream.log('ERROR', `${this.botName} reconnect failed: ${error.message}`, this.botName);
      this.isReconnecting = false;
      if (this.running) {
        this.attemptReconnect();
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  /**
   * Clean up bot resources
   */
  protected cleanupBot(): void {
    if (this.bot) {
      try {
        this.bot.removeAllListeners();
        this.bot.quit();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.bot = null;
    }
  }

  /**
   * Stop the bot
   */
  stop(): void {
    this.running = false;
    this.stopDecisionLoop();
    this.cleanupBot();
    logStream.log('INFO', `${this.botName} stopped`, this.botName);
  }

  /**
   * Get current bot state
   */
  protected getBotState(): {
    position: { x: number; y: number; z: number };
    health: number;
    food: number;
    inventory: Record<string, number>;
    nearbyPlayers: string[];
    heldItem: string | null;
    experience: number;
    gameMode: string;
  } {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }

    const inventory: Record<string, number> = {};
    for (const item of this.bot.inventory.items()) {
      inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    return {
      position: {
        x: this.bot.entity.position.x,
        y: this.bot.entity.position.y,
        z: this.bot.entity.position.z,
      },
      health: this.bot.health,
      food: this.bot.food,
      inventory,
      nearbyPlayers: Object.values(this.bot.players)
        .filter((p: any) => p.entity && p.username !== this.botName)
        .map((p: any) => p.username),
      heldItem: this.bot.heldItem?.name || null,
      experience: this.bot.experience?.level || 0,
      gameMode: this.bot.game?.gameMode || 'survival',
    };
  }

  // Abstract methods to be implemented by subclasses

  /**
   * Called when the bot spawns
   */
  protected abstract onSpawn(): Promise<void>;

  /**
   * Make a decision - called on each decision loop iteration
   */
  protected abstract makeDecision(): Promise<void>;

  /**
   * Called when the bot dies (optional override)
   */
  protected onDeath(): void {}

  /**
   * Called when a chat message is received (optional override)
   */
  protected onChat(username: string, message: string): void {}
}
