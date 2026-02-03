/**
 * Leaderboard System
 * Rankings and statistics for the arena
 */

import { LeaderboardEntry } from './types';
import { walletManager } from './walletManager';
import { duelSystem } from './duelSystem';

class Leaderboard {
  
  /**
   * Get overall ELO leaderboard
   */
  getEloLeaderboard(limit: number = 20): LeaderboardEntry[] {
    const agents = walletManager.getLeaderboard(limit);
    
    return agents.map((agent, index) => ({
      rank: index + 1,
      agentName: agent.agentName,
      ownerId: agent.ownerId,
      elo: agent.elo,
      wins: agent.wins,
      losses: agent.losses,
      winRate: agent.wins + agent.losses > 0 
        ? Math.round((agent.wins / (agent.wins + agent.losses)) * 100) 
        : 0,
      totalEarnings: agent.totalEarnings
    }));
  }

  /**
   * Get earnings leaderboard
   */
  getEarningsLeaderboard(limit: number = 20): LeaderboardEntry[] {
    const agents = walletManager.getLeaderboard(100); // Get more to sort by earnings
    
    return agents
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, limit)
      .map((agent, index) => ({
        rank: index + 1,
        agentName: agent.agentName,
        ownerId: agent.ownerId,
        elo: agent.elo,
        wins: agent.wins,
        losses: agent.losses,
        winRate: agent.wins + agent.losses > 0 
          ? Math.round((agent.wins / (agent.wins + agent.losses)) * 100) 
          : 0,
        totalEarnings: agent.totalEarnings
      }));
  }

  /**
   * Get win streak leaderboard (requires match history analysis)
   */
  getWinStreakLeaderboard(limit: number = 10): { agentName: string; currentStreak: number; maxStreak: number }[] {
    const agents = walletManager.getLeaderboard(100);
    const streaks: { agentName: string; ownerId: string; currentStreak: number; maxStreak: number }[] = [];

    for (const agent of agents) {
      const matches = duelSystem.getAgentMatchHistory(agent.ownerId, 50);
      let currentStreak = 0;
      let maxStreak = 0;

      for (const match of matches) {
        if (match.winnerId === agent.ownerId) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }

      // Reset current streak based on most recent matches
      currentStreak = 0;
      for (const match of matches) {
        if (match.winnerId === agent.ownerId) {
          currentStreak++;
        } else {
          break;
        }
      }

      streaks.push({
        agentName: agent.agentName,
        ownerId: agent.ownerId,
        currentStreak,
        maxStreak
      });
    }

    return streaks
      .sort((a, b) => b.currentStreak - a.currentStreak || b.maxStreak - a.maxStreak)
      .slice(0, limit)
      .map(s => ({
        agentName: s.agentName,
        currentStreak: s.currentStreak,
        maxStreak: s.maxStreak
      }));
  }

  /**
   * Get agent rank
   */
  getAgentRank(agentId: string): number | null {
    const leaderboard = this.getEloLeaderboard(1000);
    const entry = leaderboard.find(e => e.ownerId === agentId);
    return entry?.rank || null;
  }

  /**
   * Get arena statistics
   */
  getArenaStats(): {
    totalAgents: number;
    totalMatches: number;
    totalWagered: number;
    totalHouseFees: number;
    activeMatch: boolean;
  } {
    const agents = walletManager.getLeaderboard(1000);
    const matches = duelSystem.getRecentMatches(1000);
    
    let totalWagered = 0;
    let totalHouseFees = 0;
    
    for (const match of matches) {
      totalWagered += match.potTotal;
      totalHouseFees += match.houseCut;
    }

    return {
      totalAgents: agents.length,
      totalMatches: matches.length,
      totalWagered,
      totalHouseFees,
      activeMatch: duelSystem.getActiveMatch() !== null
    };
  }
}

export const leaderboard = new Leaderboard();
