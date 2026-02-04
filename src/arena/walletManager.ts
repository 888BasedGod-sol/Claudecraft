/**
 * Wallet Manager
 * Handles token balances for arena agents
 * Note: Uses mock balances until real token integration
 */

import * as fs from 'fs';
import * as path from 'path';
import { ArenaAgent, Transaction, STARTING_ELO } from './types';

const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const WALLETS_FILE = path.join(DATA_DIR, 'wallets.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');

class WalletManager {
  private agents: Map<string, ArenaAgent> = new Map();
  private transactions: Transaction[] = [];

  constructor() {
    this.ensureDataDir();
    this.load();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(WALLETS_FILE)) {
        const data = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
        for (const agent of data) {
          this.agents.set(agent.ownerId, {
            ...agent,
            createdAt: new Date(agent.createdAt),
            lastFight: agent.lastFight ? new Date(agent.lastFight) : null
          });
        }
        console.log(`[ARENA-WALLET] Loaded ${this.agents.size} agent wallets`);
      }
    } catch (e) {
      console.log('[ARENA-WALLET] Starting with empty wallets');
    }

    try {
      if (fs.existsSync(TRANSACTIONS_FILE)) {
        const data = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf-8'));
        this.transactions = data.map((t: any) => ({
          ...t,
          timestamp: new Date(t.timestamp)
        }));
      }
    } catch (e) {
      // Ignore
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(WALLETS_FILE, JSON.stringify(Array.from(this.agents.values()), null, 2));
      // Keep only last 1000 transactions
      const recentTransactions = this.transactions.slice(-1000);
      fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(recentTransactions, null, 2));
    } catch (e) {
      console.error('[ARENA-WALLET] Failed to save:', e);
    }
  }

  /**
   * Register an agent for arena (creates wallet if not exists)
   */
  registerAgent(ownerId: string, agentName: string): ArenaAgent {
    if (this.agents.has(ownerId)) {
      return this.agents.get(ownerId)!;
    }

    const agent: ArenaAgent = {
      agentName,
      ownerId,
      tokenBalance: 0,  // Start with 0, must deposit
      xp: 0,
      level: 1,
      wins: 0,
      losses: 0,
      elo: STARTING_ELO,
      totalEarnings: 0,
      totalLosses: 0,
      createdAt: new Date(),
      lastFight: null
    };

    this.agents.set(ownerId, agent);
    this.save();
    console.log(`[ARENA-WALLET] Registered agent ${agentName} for arena`);
    return agent;
  }

  /**
   * Get agent wallet
   */
  getAgent(ownerId: string): ArenaAgent | null {
    return this.agents.get(ownerId) || null;
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
  }): { success: boolean; agent?: ArenaAgent; error?: string } {
    const agent = this.agents.get(ownerId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    // Validate agentName if provided (must be unique)
    if (updates.agentName && updates.agentName !== agent.agentName) {
      const existing = this.getAgentByName(updates.agentName);
      if (existing && existing.ownerId !== ownerId) {
        return { success: false, error: `Agent name "${updates.agentName}" is already taken` };
      }
      // Validate name format
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(updates.agentName)) {
        return { success: false, error: 'Agent name must be 3-20 characters, alphanumeric with _ and - only' };
      }
      agent.agentName = updates.agentName;
    }

    // Update optional profile fields
    if (updates.bio !== undefined) {
      agent.bio = updates.bio.substring(0, 280); // Limit bio to 280 chars
    }
    if (updates.avatar !== undefined) {
      agent.avatar = updates.avatar;
    }
    if (updates.twitter !== undefined) {
      agent.twitter = updates.twitter.replace('@', ''); // Remove @ if present
    }
    if (updates.website !== undefined) {
      agent.website = updates.website;
    }
    if (updates.battleCry !== undefined) {
      agent.battleCry = updates.battleCry.substring(0, 100); // Limit battle cry
    }
    if (updates.theme !== undefined) {
      agent.theme = updates.theme;
    }

    this.save();
    console.log(`[ARENA-WALLET] Updated profile for ${agent.agentName}`);
    return { success: true, agent };
  }

  /**
   * Get agent by name
   */
  getAgentByName(agentName: string): ArenaAgent | null {
    for (const agent of this.agents.values()) {
      if (agent.agentName.toLowerCase() === agentName.toLowerCase()) {
        return agent;
      }
    }
    return null;
  }

  /**
   * Get balance
   */
  getBalance(ownerId: string): number {
    return this.agents.get(ownerId)?.tokenBalance || 0;
  }

  /**
   * Deposit tokens (mock - will be replaced with real token verification)
   */
  deposit(ownerId: string, amount: number, description: string = 'Deposit'): boolean {
    const agent = this.agents.get(ownerId);
    if (!agent || amount <= 0) return false;

    const balanceBefore = agent.tokenBalance;
    agent.tokenBalance += amount;

    this.recordTransaction({
      agentId: ownerId,
      type: 'deposit',
      amount,
      balanceBefore,
      balanceAfter: agent.tokenBalance,
      description
    });

    this.save();
    return true;
  }

  /**
   * Withdraw tokens (mock)
   */
  withdraw(ownerId: string, amount: number, description: string = 'Withdraw'): boolean {
    const agent = this.agents.get(ownerId);
    if (!agent || amount <= 0 || agent.tokenBalance < amount) return false;

    const balanceBefore = agent.tokenBalance;
    agent.tokenBalance -= amount;

    this.recordTransaction({
      agentId: ownerId,
      type: 'withdraw',
      amount: -amount,
      balanceBefore,
      balanceAfter: agent.tokenBalance,
      description
    });

    this.save();
    return true;
  }

  /**
   * Lock tokens for wager (deducts from balance)
   */
  lockWager(ownerId: string, amount: number, matchId: string): boolean {
    const agent = this.agents.get(ownerId);
    if (!agent || amount <= 0 || agent.tokenBalance < amount) return false;

    const balanceBefore = agent.tokenBalance;
    agent.tokenBalance -= amount;

    this.recordTransaction({
      agentId: ownerId,
      type: 'wager',
      amount: -amount,
      balanceBefore,
      balanceAfter: agent.tokenBalance,
      relatedMatchId: matchId,
      description: `Wager locked for match ${matchId}`
    });

    this.save();
    return true;
  }

  /**
   * Award winnings
   */
  awardWinnings(ownerId: string, amount: number, matchId: string): boolean {
    const agent = this.agents.get(ownerId);
    if (!agent) return false;

    const balanceBefore = agent.tokenBalance;
    agent.tokenBalance += amount;
    agent.totalEarnings += amount;

    this.recordTransaction({
      agentId: ownerId,
      type: 'win',
      amount,
      balanceBefore,
      balanceAfter: agent.tokenBalance,
      relatedMatchId: matchId,
      description: `Won match ${matchId}`
    });

    this.save();
    return true;
  }

  /**
   * Deduct for power-up purchase
   */
  purchasePowerUp(ownerId: string, powerUpId: string, price: number): boolean {
    const agent = this.agents.get(ownerId);
    if (!agent || price <= 0 || agent.tokenBalance < price) return false;

    const balanceBefore = agent.tokenBalance;
    agent.tokenBalance -= price;

    this.recordTransaction({
      agentId: ownerId,
      type: 'powerup',
      amount: -price,
      balanceBefore,
      balanceAfter: agent.tokenBalance,
      description: `Purchased power-up: ${powerUpId}`
    });

    this.save();
    return true;
  }

  /**
   * Record house fee
   */
  recordHouseFee(amount: number, matchId: string): void {
    this.recordTransaction({
      agentId: 'HOUSE',
      type: 'house_fee',
      amount,
      balanceBefore: 0,
      balanceAfter: 0,
      relatedMatchId: matchId,
      description: `3% house fee from match ${matchId}`
    });
    this.save();
  }

  /**
   * Update agent stats after match
   */
  updateStats(ownerId: string, won: boolean, xpGained: number, eloChange: number): void {
    const agent = this.agents.get(ownerId);
    if (!agent) return;

    if (won) {
      agent.wins++;
    } else {
      agent.losses++;
    }
    
    agent.xp += xpGained;
    agent.elo = Math.max(0, agent.elo + eloChange);
    agent.lastFight = new Date();

    // Level up check (simple: every 500 XP = 1 level)
    const newLevel = Math.floor(agent.xp / 500) + 1;
    if (newLevel > agent.level) {
      agent.level = newLevel;
      console.log(`[ARENA-WALLET] ${agent.agentName} leveled up to ${newLevel}!`);
    }

    this.save();
  }

  /**
   * Record loss amount
   */
  recordLoss(ownerId: string, amount: number): void {
    const agent = this.agents.get(ownerId);
    if (agent) {
      agent.totalLosses += amount;
      this.save();
    }
  }

  /**
   * Get all agents sorted by ELO
   */
  getLeaderboard(limit: number = 20): ArenaAgent[] {
    return Array.from(this.agents.values())
      .sort((a, b) => b.elo - a.elo)
      .slice(0, limit);
  }

  /**
   * Get transaction history for an agent
   */
  getTransactionHistory(ownerId: string, limit: number = 50): Transaction[] {
    return this.transactions
      .filter(t => t.agentId === ownerId)
      .slice(-limit);
  }

  private recordTransaction(tx: Omit<Transaction, 'id' | 'timestamp'>): void {
    this.transactions.push({
      ...tx,
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    });
  }
}

export const walletManager = new WalletManager();
