/**
 * Duel System
 * Handles challenges, accepts, and fight orchestration
 */

import * as fs from 'fs';
import * as path from 'path';
import { 
  Challenge, 
  Match, 
  FightEvent, 
  HOUSE_CUT_PERCENT, 
  CHALLENGE_EXPIRY_MINUTES,
  XP_PER_WIN,
  XP_PER_LOSS
} from './types';
import { walletManager } from './walletManager';
import { calculatePowerUpCost, validatePowerUps } from './powerUps';
import { logStreamer } from '../server/logStreamer';
import { getTwitterAgent } from '../twitterAgent';

const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const CHALLENGES_FILE = path.join(DATA_DIR, 'challenges.json');
const MATCHES_FILE = path.join(DATA_DIR, 'matches.json');

class DuelSystem {
  private challenges: Map<string, Challenge> = new Map();
  private matches: Map<string, Match> = new Map();
  private activeMatch: Match | null = null;

  constructor() {
    this.ensureDataDir();
    this.load();
    this.startExpiryChecker();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(CHALLENGES_FILE)) {
        const data = JSON.parse(fs.readFileSync(CHALLENGES_FILE, 'utf-8'));
        for (const c of data) {
          this.challenges.set(c.id, {
            ...c,
            createdAt: new Date(c.createdAt),
            expiresAt: new Date(c.expiresAt),
            acceptedAt: c.acceptedAt ? new Date(c.acceptedAt) : null
          });
        }
      }
    } catch (e) {
      // Ignore
    }

    try {
      if (fs.existsSync(MATCHES_FILE)) {
        const data = JSON.parse(fs.readFileSync(MATCHES_FILE, 'utf-8'));
        for (const m of data) {
          this.matches.set(m.id, {
            ...m,
            startedAt: new Date(m.startedAt),
            endedAt: m.endedAt ? new Date(m.endedAt) : null,
            fightLog: m.fightLog.map((e: any) => ({
              ...e,
              timestamp: new Date(e.timestamp)
            }))
          });
        }
        console.log(`[ARENA-DUEL] Loaded ${this.matches.size} match records`);
      }
    } catch (e) {
      // Ignore
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(CHALLENGES_FILE, JSON.stringify(Array.from(this.challenges.values()), null, 2));
      // Keep only last 100 matches
      const recentMatches = Array.from(this.matches.values()).slice(-100);
      fs.writeFileSync(MATCHES_FILE, JSON.stringify(recentMatches, null, 2));
    } catch (e) {
      console.error('[ARENA-DUEL] Failed to save:', e);
    }
  }

  private startExpiryChecker(): void {
    // Check for expired challenges every minute
    setInterval(() => {
      const now = new Date();
      for (const [id, challenge] of this.challenges) {
        if (challenge.status === 'pending' && challenge.expiresAt < now) {
          challenge.status = 'expired';
          console.log(`[ARENA-DUEL] Challenge ${id} expired`);
        }
      }
      this.save();
    }, 60000);
  }

  /**
   * Create a challenge
   */
  createChallenge(
    challengerId: string,
    challengerName: string,
    targetId: string,
    targetName: string,
    wagerAmount: number,
    powerUpIds: string[] = []
  ): { success: boolean; challenge?: Challenge; error?: string } {
    
    // Validate challenger is registered
    const challenger = walletManager.getAgent(challengerId);
    if (!challenger) {
      return { success: false, error: 'Challenger not registered for arena' };
    }

    // Validate target is registered
    const target = walletManager.getAgent(targetId);
    if (!target) {
      return { success: false, error: 'Target not registered for arena' };
    }

    // Can't challenge yourself
    if (challengerId === targetId) {
      return { success: false, error: 'Cannot challenge yourself' };
    }

    // Validate power-ups
    const powerUpValidation = validatePowerUps(powerUpIds);
    if (!powerUpValidation.valid) {
      return { success: false, error: powerUpValidation.error };
    }

    // Calculate total cost (wager + power-ups)
    const powerUpCost = calculatePowerUpCost(powerUpIds);
    const totalCost = wagerAmount + powerUpCost;

    // Check challenger has enough balance
    if (challenger.tokenBalance < totalCost) {
      return { 
        success: false, 
        error: `Insufficient balance. Need ${totalCost} (${wagerAmount} wager + ${powerUpCost} power-ups), have ${challenger.tokenBalance}` 
      };
    }

    // Check if challenger already has a pending challenge
    for (const challenge of this.challenges.values()) {
      if (challenge.challengerId === challengerId && challenge.status === 'pending') {
        return { success: false, error: 'You already have a pending challenge' };
      }
    }

    // Check if there's an active match
    if (this.activeMatch) {
      return { success: false, error: 'A match is currently in progress' };
    }

    // Create challenge
    const challenge: Challenge = {
      id: `chal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      challengerId,
      challengerName,
      targetId,
      targetName,
      wagerAmount,
      challengerPowerUps: powerUpIds,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + CHALLENGE_EXPIRY_MINUTES * 60 * 1000),
      acceptedAt: null
    };

    this.challenges.set(challenge.id, challenge);
    this.save();

    // Broadcast to stream
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `⚔️ ARENA: ${challengerName} challenges ${targetName} for ${wagerAmount} tokens!`,
      botName: 'Arena'
    });

    console.log(`[ARENA-DUEL] Challenge created: ${challengerName} vs ${targetName} for ${wagerAmount}`);
    return { success: true, challenge };
  }

  /**
   * Accept a challenge
   */
  acceptChallenge(
    challengeId: string,
    acceptorId: string,
    powerUpIds: string[] = []
  ): { success: boolean; match?: Match; error?: string } {
    
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      return { success: false, error: 'Challenge not found' };
    }

    if (challenge.status !== 'pending') {
      return { success: false, error: `Challenge is ${challenge.status}` };
    }

    if (challenge.targetId !== acceptorId) {
      return { success: false, error: 'This challenge is not for you' };
    }

    if (challenge.expiresAt < new Date()) {
      challenge.status = 'expired';
      this.save();
      return { success: false, error: 'Challenge has expired' };
    }

    // Validate power-ups
    const powerUpValidation = validatePowerUps(powerUpIds);
    if (!powerUpValidation.valid) {
      return { success: false, error: powerUpValidation.error };
    }

    // Calculate total cost
    const powerUpCost = calculatePowerUpCost(powerUpIds);
    const totalCost = challenge.wagerAmount + powerUpCost;

    // Check acceptor has enough balance
    const acceptor = walletManager.getAgent(acceptorId);
    if (!acceptor || acceptor.tokenBalance < totalCost) {
      return { 
        success: false, 
        error: `Insufficient balance. Need ${totalCost} (${challenge.wagerAmount} wager + ${powerUpCost} power-ups)` 
      };
    }

    // Lock both wagers
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Deduct power-up costs first
    const challengerPowerUpCost = calculatePowerUpCost(challenge.challengerPowerUps);
    if (challengerPowerUpCost > 0) {
      for (const pId of challenge.challengerPowerUps) {
        const { getPowerUp } = require('./powerUps');
        const p = getPowerUp(pId);
        if (p) walletManager.purchasePowerUp(challenge.challengerId, pId, p.price);
      }
    }
    if (powerUpCost > 0) {
      for (const pId of powerUpIds) {
        const { getPowerUp } = require('./powerUps');
        const p = getPowerUp(pId);
        if (p) walletManager.purchasePowerUp(acceptorId, pId, p.price);
      }
    }

    // Lock wagers
    if (!walletManager.lockWager(challenge.challengerId, challenge.wagerAmount, matchId)) {
      return { success: false, error: 'Failed to lock challenger wager' };
    }
    if (!walletManager.lockWager(acceptorId, challenge.wagerAmount, matchId)) {
      // Refund challenger
      walletManager.deposit(challenge.challengerId, challenge.wagerAmount, 'Wager refund - opponent insufficient funds');
      return { success: false, error: 'Failed to lock acceptor wager' };
    }

    // Update challenge
    challenge.status = 'in_progress';
    challenge.acceptedAt = new Date();

    // Create match
    const match: Match = {
      id: matchId,
      challengeId: challenge.id,
      fighter1: {
        agentName: challenge.challengerName,
        ownerId: challenge.challengerId,
        powerUps: challenge.challengerPowerUps,
        startHealth: 20,
        endHealth: 20
      },
      fighter2: {
        agentName: challenge.targetName,
        ownerId: challenge.targetId,
        powerUps: powerUpIds,
        startHealth: 20,
        endHealth: 20
      },
      wagerAmount: challenge.wagerAmount,
      potTotal: challenge.wagerAmount * 2,
      houseCut: Math.floor(challenge.wagerAmount * 2 * (HOUSE_CUT_PERCENT / 100)),
      winnerPayout: 0,  // Calculated after house cut
      winnerId: null,
      winnerName: null,
      loserId: null,
      loserName: null,
      status: 'preparing',
      startedAt: new Date(),
      endedAt: null,
      fightLog: [{
        timestamp: new Date(),
        type: 'start',
        actorName: 'Arena',
        description: `Match started: ${challenge.challengerName} vs ${challenge.targetName} for ${challenge.wagerAmount * 2} tokens!`
      }]
    };

    match.winnerPayout = match.potTotal - match.houseCut;
    
    this.matches.set(match.id, match);
    this.activeMatch = match;
    this.save();

    // Broadcast
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `⚔️ MATCH STARTING: ${challenge.challengerName} vs ${challenge.targetName}! Pot: ${match.potTotal} tokens`,
      botName: 'Arena'
    });

    console.log(`[ARENA-DUEL] Match ${matchId} starting: ${challenge.challengerName} vs ${challenge.targetName}`);
    return { success: true, match };
  }

  /**
   * Decline a challenge
   */
  declineChallenge(challengeId: string, declinerId: string): { success: boolean; error?: string } {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      return { success: false, error: 'Challenge not found' };
    }

    if (challenge.targetId !== declinerId) {
      return { success: false, error: 'This challenge is not for you' };
    }

    if (challenge.status !== 'pending') {
      return { success: false, error: `Challenge is ${challenge.status}` };
    }

    challenge.status = 'declined';
    this.save();

    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `❌ ${challenge.targetName} declined challenge from ${challenge.challengerName}`,
      botName: 'Arena'
    });

    return { success: true };
  }

  /**
   * Complete a match (called when fight ends)
   */
  completeMatch(
    matchId: string, 
    winnerId: string,
    fighter1EndHealth: number = 0,
    fighter2EndHealth: number = 0
  ): { success: boolean; error?: string } {
    
    const match = this.matches.get(matchId);
    if (!match) {
      return { success: false, error: 'Match not found' };
    }

    if (match.status === 'completed') {
      return { success: false, error: 'Match already completed' };
    }

    // Determine winner/loser
    let winnerName: string;
    let loserId: string;
    let loserName: string;

    if (winnerId === match.fighter1.ownerId) {
      winnerName = match.fighter1.agentName;
      loserId = match.fighter2.ownerId;
      loserName = match.fighter2.agentName;
      match.fighter1.endHealth = fighter1EndHealth;
      match.fighter2.endHealth = fighter2EndHealth;
    } else if (winnerId === match.fighter2.ownerId) {
      winnerName = match.fighter2.agentName;
      loserId = match.fighter1.ownerId;
      loserName = match.fighter1.agentName;
      match.fighter1.endHealth = fighter1EndHealth;
      match.fighter2.endHealth = fighter2EndHealth;
    } else {
      return { success: false, error: 'Winner not a participant' };
    }

    // Update match
    match.winnerId = winnerId;
    match.winnerName = winnerName;
    match.loserId = loserId;
    match.loserName = loserName;
    match.status = 'completed';
    match.endedAt = new Date();
    
    match.fightLog.push({
      timestamp: new Date(),
      type: 'end',
      actorName: winnerName,
      description: `${winnerName} defeats ${loserName}! Payout: ${match.winnerPayout} tokens`
    });

    // Award winnings
    walletManager.awardWinnings(winnerId, match.winnerPayout, matchId);
    walletManager.recordHouseFee(match.houseCut, matchId);
    walletManager.recordLoss(loserId, match.wagerAmount);

    // Update stats
    const eloChange = this.calculateEloChange(winnerId, loserId);
    walletManager.updateStats(winnerId, true, XP_PER_WIN, eloChange);
    walletManager.updateStats(loserId, false, XP_PER_LOSS, -eloChange);

    // Update challenge
    const challenge = this.challenges.get(match.challengeId);
    if (challenge) {
      challenge.status = 'completed';
    }

    this.activeMatch = null;
    this.save();

    // Broadcast
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🏆 ${winnerName} WINS! Claimed ${match.winnerPayout} tokens (3% house fee: ${match.houseCut})`,
      botName: 'Arena'
    });

    // Arena tweets disabled - focusing on engagement replies instead
    // const twitter = getTwitterAgent();
    // if (twitter.canPost()) {
    //   twitter.announceArenaResult(winnerName, loserName, match.wagerAmount);
    // }

    console.log(`[ARENA-DUEL] Match ${matchId} completed. Winner: ${winnerName}`);
    return { success: true };
  }

  /**
   * Cancel an active match (refund both parties)
   */
  cancelMatch(matchId: string, reason: string): { success: boolean; error?: string } {
    const match = this.matches.get(matchId);
    if (!match) {
      return { success: false, error: 'Match not found' };
    }

    if (match.status === 'completed') {
      return { success: false, error: 'Cannot cancel completed match' };
    }

    // Refund both fighters
    walletManager.deposit(match.fighter1.ownerId, match.wagerAmount, `Match cancelled: ${reason}`);
    walletManager.deposit(match.fighter2.ownerId, match.wagerAmount, `Match cancelled: ${reason}`);

    match.status = 'cancelled';
    match.endedAt = new Date();
    match.fightLog.push({
      timestamp: new Date(),
      type: 'end',
      actorName: 'Arena',
      description: `Match cancelled: ${reason}`
    });

    const challenge = this.challenges.get(match.challengeId);
    if (challenge) {
      challenge.status = 'expired';
    }

    this.activeMatch = null;
    this.save();

    return { success: true };
  }

  /**
   * Calculate ELO change
   */
  private calculateEloChange(winnerId: string, loserId: string): number {
    const winner = walletManager.getAgent(winnerId);
    const loser = walletManager.getAgent(loserId);
    if (!winner || !loser) return 25;

    // Simple ELO calculation
    const expectedWin = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
    const kFactor = 32;
    
    return Math.round(kFactor * (1 - expectedWin));
  }

  /**
   * Get pending challenges for an agent
   */
  getPendingChallenges(agentId: string): Challenge[] {
    const challenges: Challenge[] = [];
    for (const challenge of this.challenges.values()) {
      if (challenge.status === 'pending') {
        if (challenge.targetId === agentId || challenge.challengerId === agentId) {
          challenges.push(challenge);
        }
      }
    }
    return challenges;
  }

  /**
   * Get active match
   */
  getActiveMatch(): Match | null {
    return this.activeMatch;
  }

  /**
   * Get match by ID
   */
  getMatch(matchId: string): Match | null {
    return this.matches.get(matchId) || null;
  }

  /**
   * Get recent matches
   */
  getRecentMatches(limit: number = 10): Match[] {
    return Array.from(this.matches.values())
      .filter(m => m.status === 'completed')
      .sort((a, b) => (b.endedAt?.getTime() || 0) - (a.endedAt?.getTime() || 0))
      .slice(0, limit);
  }

  /**
   * Get match history for an agent
   */
  getAgentMatchHistory(agentId: string, limit: number = 20): Match[] {
    return Array.from(this.matches.values())
      .filter(m => 
        m.status === 'completed' && 
        (m.fighter1.ownerId === agentId || m.fighter2.ownerId === agentId)
      )
      .sort((a, b) => (b.endedAt?.getTime() || 0) - (a.endedAt?.getTime() || 0))
      .slice(0, limit);
  }
}

export const duelSystem = new DuelSystem();
