/**
 * Arena Manager
 * Main orchestrator for the PvP arena system
 * Handles teleportation, arena setup, and fight coordination
 */

import { Match } from './types';
import { walletManager } from './walletManager';
import { duelSystem } from './duelSystem';
import { leaderboard } from './leaderboard';
import { POWER_UPS, getPowerUp, calculatePowerUpCost, validatePowerUps } from './powerUps';
import { generateKitCommands, generatePowerUpEffectCommands, generatePreFightCommands, generatePostFightCommands } from './combatKit';
import { logStreamer } from '../server/logStreamer';

// Arena location in the world
const ARENA_CENTER = { x: 500, y: 70, z: 500 };
const ARENA_SPAWN_1 = { x: 490, y: 70, z: 500 };
const ARENA_SPAWN_2 = { x: 510, y: 70, z: 500 };
const ARENA_SPECTATOR = { x: 500, y: 80, z: 500 };

export interface ArenaConfig {
  center: { x: number; y: number; z: number };
  spawn1: { x: number; y: number; z: number };
  spawn2: { x: number; y: number; z: number };
  spectator: { x: number; y: number; z: number };
}

class ArenaManager {
  private config: ArenaConfig = {
    center: ARENA_CENTER,
    spawn1: ARENA_SPAWN_1,
    spawn2: ARENA_SPAWN_2,
    spectator: ARENA_SPECTATOR
  };

  private commandExecutor: ((cmd: string) => Promise<boolean>) | null = null;

  /**
   * Set the command executor function
   */
  setCommandExecutor(executor: (cmd: string) => Promise<boolean>): void {
    this.commandExecutor = executor;
  }

  /**
   * Execute a Minecraft command
   */
  private async executeCommand(cmd: string): Promise<boolean> {
    if (this.commandExecutor) {
      return this.commandExecutor(cmd);
    }
    console.log(`[ARENA] Would execute: ${cmd}`);
    return true;
  }

  /**
   * Register an agent for arena
   */
  registerForArena(ownerId: string, agentName: string): { success: boolean; agent?: any; error?: string } {
    try {
      const agent = walletManager.registerAgent(ownerId, agentName);
      return { success: true, agent };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Get agent profile
   */
  getAgentProfile(ownerId: string): any {
    const agent = walletManager.getAgent(ownerId);
    if (!agent) return null;

    const rank = leaderboard.getAgentRank(ownerId);
    const recentMatches = duelSystem.getAgentMatchHistory(ownerId, 5);

    return {
      ...agent,
      rank,
      recentMatches: recentMatches.map(m => ({
        id: m.id,
        opponent: m.fighter1.ownerId === ownerId ? m.fighter2.agentName : m.fighter1.agentName,
        result: m.winnerId === ownerId ? 'WIN' : 'LOSS',
        payout: m.winnerId === ownerId ? m.winnerPayout : -m.wagerAmount,
        date: m.endedAt
      }))
    };
  }

  /**
   * Update agent profile
   */
  updateProfile(ownerId: string, updates: {
    agentName?: string;
    bio?: string;
    avatar?: string;
    twitter?: string;
    website?: string;
    battleCry?: string;
    theme?: 'default' | 'fire' | 'ice' | 'shadow' | 'gold' | 'cosmic';
  }): { success: boolean; profile?: any; error?: string } {
    const result = walletManager.updateProfile(ownerId, updates);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    // Return full profile with rank and matches
    const profile = this.getAgentProfile(ownerId);
    return { success: true, profile };
  }

  /**
   * Get available power-ups
   */
  getAvailablePowerUps(): typeof POWER_UPS {
    return POWER_UPS;
  }

  /**
   * Deposit tokens (mock)
   */
  deposit(ownerId: string, amount: number): { success: boolean; newBalance?: number; error?: string } {
    const agent = walletManager.getAgent(ownerId);
    if (!agent) {
      return { success: false, error: 'Agent not registered for arena' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    const success = walletManager.deposit(ownerId, amount, 'Token deposit');
    if (success) {
      const newBalance = walletManager.getBalance(ownerId);
      return { success: true, newBalance };
    }
    return { success: false, error: 'Deposit failed' };
  }

  /**
   * Withdraw tokens (for game wagers, etc.)
   */
  withdraw(ownerId: string, amount: number): { success: boolean; newBalance?: number; error?: string } {
    const agent = walletManager.getAgent(ownerId);
    if (!agent) {
      return { success: false, error: 'Agent not registered for arena' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    const balance = walletManager.getBalance(ownerId);
    if (balance < amount) {
      return { success: false, error: `Insufficient balance. Have: ${balance}, Need: ${amount}` };
    }

    const success = walletManager.withdraw(ownerId, amount, 'Game wager');
    if (success) {
      const newBalance = walletManager.getBalance(ownerId);
      return { success: true, newBalance };
    }
    return { success: false, error: 'Withdrawal failed' };
  }

  /**
   * Create a challenge
   */
  createChallenge(
    challengerId: string,
    targetAgentName: string,
    wagerAmount: number,
    powerUpIds: string[] = []
  ): { success: boolean; challenge?: any; error?: string } {
    
    const challenger = walletManager.getAgent(challengerId);
    if (!challenger) {
      return { success: false, error: 'You are not registered for arena' };
    }

    const target = walletManager.getAgentByName(targetAgentName);
    if (!target) {
      return { success: false, error: `Agent "${targetAgentName}" not found in arena` };
    }

    return duelSystem.createChallenge(
      challengerId,
      challenger.agentName,
      target.ownerId,
      target.agentName,
      wagerAmount,
      powerUpIds
    );
  }

  /**
   * Accept a challenge
   */
  async acceptChallenge(
    challengeId: string,
    acceptorId: string,
    powerUpIds: string[] = []
  ): Promise<{ success: boolean; match?: Match; error?: string }> {
    
    const result = duelSystem.acceptChallenge(challengeId, acceptorId, powerUpIds);
    
    if (result.success && result.match) {
      // Start the fight sequence
      await this.startFight(result.match);
    }

    return result;
  }

  /**
   * Decline a challenge
   */
  declineChallenge(challengeId: string, declinerId: string): { success: boolean; error?: string } {
    return duelSystem.declineChallenge(challengeId, declinerId);
  }

  /**
   * Start the fight sequence
   */
  private async startFight(match: Match): Promise<void> {
    console.log(`[ARENA] Starting fight: ${match.fighter1.agentName} vs ${match.fighter2.agentName}`);

    // Get bot usernames (Helper_<agentName> format)
    const fighter1Username = `Helper_${match.fighter1.agentName.substring(0, 8)}`;
    const fighter2Username = `Helper_${match.fighter2.agentName.substring(0, 8)}`;

    // Teleport fighters to arena spawns
    await this.executeCommand(`tp ${fighter1Username} ${this.config.spawn1.x} ${this.config.spawn1.y} ${this.config.spawn1.z}`);
    await this.executeCommand(`tp ${fighter2Username} ${this.config.spawn2.x} ${this.config.spawn2.y} ${this.config.spawn2.z}`);

    // Prepare fighters
    const prep1Commands = generatePreFightCommands(fighter1Username);
    const prep2Commands = generatePreFightCommands(fighter2Username);
    
    for (const cmd of [...prep1Commands, ...prep2Commands]) {
      await this.executeCommand(cmd);
    }

    // Give kits
    const kit1Commands = generateKitCommands(fighter1Username, match.fighter1.powerUps);
    const kit2Commands = generateKitCommands(fighter2Username, match.fighter2.powerUps);
    
    for (const cmd of [...kit1Commands, ...kit2Commands]) {
      await this.executeCommand(cmd);
    }

    // Apply power-up effects
    const effect1Commands = generatePowerUpEffectCommands(fighter1Username, match.fighter1.powerUps);
    const effect2Commands = generatePowerUpEffectCommands(fighter2Username, match.fighter2.powerUps);
    
    for (const cmd of [...effect1Commands, ...effect2Commands]) {
      await this.executeCommand(cmd);
    }

    // Announce fight start
    await this.executeCommand(`title @a title {"text":"FIGHT!","color":"red"}`);
    await this.executeCommand(`say ⚔️ ${match.fighter1.agentName} vs ${match.fighter2.agentName} - FIGHT!`);

    // Update match status
    match.status = 'fighting';

    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `⚔️ FIGHT: ${match.fighter1.agentName} vs ${match.fighter2.agentName}`,
      botName: 'Arena'
    });
  }

  /**
   * Report fight winner (called by death detection or health monitoring)
   */
  async reportWinner(matchId: string, winnerId: string): Promise<{ success: boolean; error?: string }> {
    const result = duelSystem.completeMatch(matchId, winnerId);
    
    if (result.success) {
      const match = duelSystem.getMatch(matchId);
      if (match) {
        // Reset fighters
        const fighter1Username = `Helper_${match.fighter1.agentName.substring(0, 8)}`;
        const fighter2Username = `Helper_${match.fighter2.agentName.substring(0, 8)}`;
        
        const reset1Commands = generatePostFightCommands(fighter1Username);
        const reset2Commands = generatePostFightCommands(fighter2Username);
        
        for (const cmd of [...reset1Commands, ...reset2Commands]) {
          await this.executeCommand(cmd);
        }

        // Teleport back to main area
        await this.executeCommand(`tp ${fighter1Username} 0 65 0`);
        await this.executeCommand(`tp ${fighter2Username} 0 65 0`);

        // Announce winner
        await this.executeCommand(`title @a title {"text":"${match.winnerName} WINS!","color":"gold"}`);
      }
    }

    return result;
  }

  /**
   * Cancel active match
   */
  cancelActiveMatch(reason: string): { success: boolean; error?: string } {
    const activeMatch = duelSystem.getActiveMatch();
    if (!activeMatch) {
      return { success: false, error: 'No active match' };
    }
    return duelSystem.cancelMatch(activeMatch.id, reason);
  }

  /**
   * Get pending challenges for an agent
   */
  getPendingChallenges(agentId: string): any[] {
    return duelSystem.getPendingChallenges(agentId);
  }

  /**
   * Get active match
   */
  getActiveMatch(): Match | null {
    return duelSystem.getActiveMatch();
  }

  /**
   * Get leaderboard
   */
  getLeaderboard(type: 'elo' | 'earnings' = 'elo', limit: number = 20): any[] {
    if (type === 'earnings') {
      return leaderboard.getEarningsLeaderboard(limit);
    }
    return leaderboard.getEloLeaderboard(limit);
  }

  /**
   * Get arena statistics
   */
  getArenaStats(): any {
    return leaderboard.getArenaStats();
  }

  /**
   * Get recent matches
   */
  getRecentMatches(limit: number = 10): Match[] {
    return duelSystem.getRecentMatches(limit);
  }

  /**
   * Configure arena location
   */
  setArenaConfig(config: Partial<ArenaConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export const arenaManager = new ArenaManager();
