/**
 * Arena System Types
 * Defines all types for the PvP arena system
 */

export interface ArenaAgent {
  agentName: string;
  ownerId: string;  // Links to external-agents.json
  tokenBalance: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  elo: number;
  totalEarnings: number;
  totalLosses: number;
  createdAt: Date;
  lastFight: Date | null;
  // Profile fields (optional, can be updated)
  bio?: string;
  avatar?: string;  // URL to avatar image
  twitter?: string; // Twitter handle (without @)
  website?: string; // Agent's website/homepage
  battleCry?: string; // Custom message shown in battle
  theme?: 'default' | 'fire' | 'ice' | 'shadow' | 'gold' | 'cosmic';
}

export interface ProfileUpdate {
  agentName?: string;
  bio?: string;
  avatar?: string;
  twitter?: string;
  website?: string;
  battleCry?: string;
  theme?: 'default' | 'fire' | 'ice' | 'shadow' | 'gold' | 'cosmic';
}

export interface Challenge {
  id: string;
  challengerId: string;
  challengerName: string;
  targetId: string;
  targetName: string;
  wagerAmount: number;
  challengerPowerUps: string[];
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'in_progress' | 'completed';
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export interface Match {
  id: string;
  challengeId: string;
  fighter1: {
    agentName: string;
    ownerId: string;
    powerUps: string[];
    startHealth: number;
    endHealth: number;
  };
  fighter2: {
    agentName: string;
    ownerId: string;
    powerUps: string[];
    startHealth: number;
    endHealth: number;
  };
  wagerAmount: number;
  potTotal: number;
  houseCut: number;
  winnerPayout: number;
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
  loserName: string | null;
  status: 'preparing' | 'fighting' | 'completed' | 'cancelled';
  startedAt: Date;
  endedAt: Date | null;
  fightLog: FightEvent[];
}

export interface FightEvent {
  timestamp: Date;
  type: 'damage' | 'heal' | 'powerup' | 'death' | 'start' | 'end';
  actorName: string;
  targetName?: string;
  amount?: number;
  description: string;
}

export interface PowerUp {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'buff' | 'kit' | 'consumable' | 'clutch';
  effect: PowerUpEffect;
}

export interface PowerUpEffect {
  type: 'potion' | 'enchant' | 'item' | 'ability';
  potionEffect?: string;
  potionLevel?: number;
  potionDuration?: number;  // seconds
  enchantment?: string;
  enchantLevel?: number;
  itemId?: string;
  itemCount?: number;
  abilityId?: string;
}

export interface LeaderboardEntry {
  rank: number;
  agentName: string;
  ownerId: string;
  elo: number;
  wins: number;
  losses: number;
  winRate: number;
  totalEarnings: number;
}

export interface Transaction {
  id: string;
  agentId: string;
  type: 'deposit' | 'withdraw' | 'wager' | 'win' | 'powerup' | 'house_fee';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedMatchId?: string;
  description: string;
  timestamp: Date;
}

export const HOUSE_CUT_PERCENT = 1;
export const CHALLENGE_EXPIRY_MINUTES = 5;
export const STARTING_ELO = 1000;
export const XP_PER_WIN = 100;
export const XP_PER_LOSS = 25;
