/**
 * Spectator Bot - Cinematic camera bot that smoothly follows agents
 * 
 * Features:
 * - Smooth continuous following with configurable offset
 * - Always looks at the target agent
 * - Teleport-based movement for reliability (creative mode)
 * - Intelligent agent switching based on activity
 */

import mineflayer, { Bot } from 'mineflayer';
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder';
import { Logger } from '../utils/logger';
import { CONFIG } from '../config';

// Camera configuration
const CAMERA_CONFIG = {
  // How far behind the agent to position (negative = behind)
  offsetX: -6,
  // How far above the agent's head
  offsetY: 4,
  // How far to the side (0 = directly behind)
  offsetZ: 3,
  // How often to update camera position (ms) - slower = less spam
  followIntervalMs: 3000,
  // Distance threshold to teleport (if too far)
  teleportThresholdDistance: 30,
  // How close is "close enough" (don't teleport if already near)
  minMoveDistance: 5,
  // Time between agent switches (ms)
  rotationIntervalMs: CONFIG.spectator.rotationIntervalMs,
  // Initial delay before starting (ms)
  initialDelayMs: CONFIG.spectator.initialDelayMs,
  // Orbit speed (radians per update)
  orbitSpeed: 0.05,
};

export class SpectatorBot {
  private bot: Bot | null = null;
  private isRunning: boolean = false;
  private rotationInterval: NodeJS.Timeout | null = null;
  private followInterval: NodeJS.Timeout | null = null;
  private agentNames: string[] = [];
  private currentAgentIndex: number = 0;
  private currentTargetName: string | null = null;
  private username: string = 'CameraBot';
  private host: string = 'localhost';
  private port: number = 25565;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private isReconnecting: boolean = false;
  private cameraAngle: number = 0; // For orbiting effect

  constructor(agentNames: string[]) {
    this.agentNames = agentNames;
  }

  async initialize(host: string, port: number, username: string = 'CameraBot'): Promise<void> {
    try {
      this.username = username;
      this.host = host;
      this.port = port;
      Logger.info(`[Spectator] Connecting cinematic camera "${username}" to ${host}:${port}...`);

      const connectHost = host === 'localhost' ? '127.0.0.1' : host;

      this.bot = mineflayer.createBot({
        host: connectHost,
        port,
        username,
        version: CONFIG.bot.version,
        checkTimeoutInterval: CONFIG.bot.connectionTimeoutMs * 2,
        hideErrors: false,
      });

      this.bot.loadPlugin(pathfinder);
      this.setupEventHandlers();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Spectator bot spawn timeout'));
        }, 30000);

        this.bot!.once('spawn', () => {
          clearTimeout(timeout);
          Logger.info(`[Spectator] 🎬 Cinematic camera spawned!`);
          this.reconnectAttempts = 0;

          // Set up minimal movements (we mostly teleport)
          const mcData = require('minecraft-data')(this.bot!.version);
          const movements = new Movements(this.bot!);
          movements.canDig = false;
          movements.allow1by1towers = false;
          movements.allowParkour = false;
          this.bot!.pathfinder.setMovements(movements);

          // Enable creative flight if possible
          setTimeout(() => {
            if (this.bot) {
              this.bot.chat('/gamemode spectator');
              Logger.info('[Spectator] Requested spectator mode for smooth camera movement');
              
              // Set optimal lighting for streaming - always day, clear weather
              setTimeout(() => {
                if (this.bot) {
                  this.bot.chat('/gamerule doDaylightCycle false');
                  this.bot.chat('/time set day');
                  this.bot.chat('/gamerule doWeatherCycle false');
                  this.bot.chat('/weather clear');
                  Logger.info('[Spectator] 🌞 Set optimal lighting: permanent day, clear weather');
                }
              }, 500);
            }
          }, 1000);

          resolve();
        });

        this.bot!.once('error', (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      Logger.error('[Spectator] Failed to initialize camera bot', error);
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.bot) return;

    this.bot.on('error', (error: Error) => {
      const isConnectionError = error.message.includes('EPIPE') || 
                                 error.message.includes('ECONNRESET') ||
                                 error.message.includes('ETIMEDOUT');
      if (isConnectionError) {
        Logger.warn(`[Spectator] Connection error: ${error.message}`);
      } else {
        Logger.error('[Spectator] Bot error', error);
      }
    });

    this.bot.on('kicked', (reason: any) => {
      const reasonText = typeof reason === 'object' ? JSON.stringify(reason) : reason;
      Logger.warn(`[Spectator] Bot was kicked: ${reasonText}`);
      this.stopWithoutQuit();
    });

    this.bot.on('end', () => {
      Logger.info('[Spectator] Bot disconnected');
      this.stopWithoutQuit();
      
      // Auto-reconnect if we were running
      if (this.isRunning && !this.isReconnecting) {
        this.attemptReconnect();
      }
    });
  }

  private async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    this.reconnectAttempts++;

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      Logger.warn(`[Spectator] Exceeded max reconnect attempts (${this.maxReconnectAttempts}), giving up`);
      this.isRunning = false;
      this.isReconnecting = false;
      return;
    }

    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000);
    Logger.info(`[Spectator] Reconnecting in ${delay/1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      if (this.bot) {
        try {
          this.bot.removeAllListeners();
        } catch (e) {}
        this.bot = null;
      }

      await this.initialize(this.host, this.port, this.username);
      this.startCameraSystem();
      
      Logger.info('[Spectator] 🎬 Reconnected successfully!');
    } catch (error: any) {
      Logger.warn(`[Spectator] Reconnect failed: ${error.message}`);
      this.isReconnecting = false;
      if (this.isRunning) {
        this.attemptReconnect();
      }
    } finally {
      this.isReconnecting = false;
    }
  }

  private stopWithoutQuit(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    if (this.followInterval) {
      clearInterval(this.followInterval);
      this.followInterval = null;
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startCameraSystem();
  }

  private startCameraSystem(): void {
    Logger.info(`[Spectator] 🎬 Starting cinematic camera system`);
    Logger.info(`[Spectator] Tracking agents: ${this.agentNames.join(', ')}`);

    // Initial delay before starting
    setTimeout(() => {
      this.switchToNextAgent();
      this.startFollowing();
    }, CAMERA_CONFIG.initialDelayMs);

    // Rotate between agents periodically
    this.rotationInterval = setInterval(() => {
      this.switchToNextAgent();
    }, CAMERA_CONFIG.rotationIntervalMs);
  }

  private switchToNextAgent(): void {
    if (this.agentNames.length === 0) return;

    this.currentTargetName = this.agentNames[this.currentAgentIndex];
    this.currentAgentIndex = (this.currentAgentIndex + 1) % this.agentNames.length;
    
    // Slightly randomize camera angle on each switch for variety
    this.cameraAngle = Math.random() * Math.PI * 2;
    
    Logger.info(`[Spectator] 🎥 Now following: ${this.currentTargetName}`);
    
    // Immediately move to the new target
    this.updateCameraPosition();
  }

  private startFollowing(): void {
    // Continuous smooth following
    this.followInterval = setInterval(() => {
      this.updateCameraPosition();
    }, CAMERA_CONFIG.followIntervalMs);
  }

  private updateCameraPosition(): void {
    if (!this.bot || !this.currentTargetName) return;

    const targetPlayer = this.bot.players[this.currentTargetName];
    if (!targetPlayer?.entity) {
      // Target not visible, try to find them
      return;
    }

    const targetPos = targetPlayer.entity.position;
    const targetYaw = targetPlayer.entity.yaw || 0;

    // Calculate camera position with offset based on where target is facing
    // This puts the camera behind and above the agent
    const offsetDistance = Math.sqrt(CAMERA_CONFIG.offsetX ** 2 + CAMERA_CONFIG.offsetZ ** 2);
    const offsetAngle = Math.atan2(CAMERA_CONFIG.offsetZ, -CAMERA_CONFIG.offsetX);
    
    // Use the target's yaw to position camera behind them, with slight orbit effect
    const cameraYaw = targetYaw + offsetAngle + this.cameraAngle * 0.1;
    
    const cameraX = targetPos.x + offsetDistance * Math.sin(cameraYaw);
    const cameraY = targetPos.y + CAMERA_CONFIG.offsetY;
    const cameraZ = targetPos.z + offsetDistance * Math.cos(cameraYaw);

    // Check if we need to move
    const currentPos = this.bot.entity?.position;
    if (currentPos) {
      const distance = Math.sqrt(
        (cameraX - currentPos.x) ** 2 +
        (cameraY - currentPos.y) ** 2 +
        (cameraZ - currentPos.z) ** 2
      );

      // Only teleport if we've moved enough
      if (distance < CAMERA_CONFIG.minMoveDistance) {
        // Just look at the target
        this.lookAtTarget(targetPos);
        return;
      }
    }

    // Teleport to the camera position (works in spectator/creative mode)
    this.bot.chat(`/tp @s ${cameraX.toFixed(1)} ${cameraY.toFixed(1)} ${cameraZ.toFixed(1)}`);
    
    // Look at the target
    this.lookAtTarget(targetPos);
    
    // Slowly orbit around the target for cinematic effect
    this.cameraAngle += CAMERA_CONFIG.orbitSpeed;
    if (this.cameraAngle > Math.PI * 2) {
      this.cameraAngle -= Math.PI * 2;
    }
  }

  private lookAtTarget(targetPos: { x: number; y: number; z: number }): void {
    if (!this.bot?.entity) return;
    
    try {
      // Look at the target's head level
      const lookTarget = {
        x: targetPos.x,
        y: targetPos.y + 1.6, // Eye level
        z: targetPos.z,
      };
      
      this.bot.lookAt({ x: lookTarget.x, y: lookTarget.y, z: lookTarget.z } as any);
    } catch (e) {
      // Ignore look errors
    }
  }

  stop(): void {
    this.isRunning = false;
    this.stopWithoutQuit();
    if (this.bot) {
      try {
        this.bot.pathfinder.stop();
        this.bot.pathfinder.setGoal(null);
        this.bot.removeAllListeners();
        this.bot.quit();
      } catch (e) {}
      this.bot = null;
    }
    Logger.info('[Spectator] 🎬 Camera bot stopped');
  }

  getBot(): Bot | null {
    return this.bot;
  }

  // Get the currently tracked agent name
  getCurrentTarget(): string | null {
    return this.currentTargetName;
  }
}
