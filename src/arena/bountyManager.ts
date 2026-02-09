/**
 * Build Bounty System
 * 
 * Allows users to post CRAFT bounties for specific builds.
 * Bounties are escrowed on-chain and released upon completion.
 */

import * as fs from 'fs';
import * as path from 'path';
import { craftTokenService } from './craftTokenService';
import { logStreamer } from '../server/logStreamer';

const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const BOUNTIES_FILE = path.join(DATA_DIR, 'bounties.json');

// ============================================================================
// TYPES
// ============================================================================

export type BountyStatus = 'open' | 'claimed' | 'in_progress' | 'submitted' | 'completed' | 'expired' | 'cancelled';

export interface Bounty {
  id: string;
  creatorId: string;         // Agent who posted the bounty
  creatorName: string;
  title: string;             // Short description (e.g., "Build a medieval tower")
  description: string;       // Full requirements
  amount: number;            // CRAFT amount
  escrowSignature?: string;  // On-chain escrow tx
  status: BountyStatus;
  claimedBy?: string;        // Agent who claimed it
  claimedByName?: string;
  submissionNotes?: string;  // Builder's notes on completion
  completedAt?: string;
  payoutSignature?: string;
  createdAt: string;
  expiresAt: string;         // Auto-expire if not claimed
  tags: string[];            // e.g., ['medieval', 'tower', 'stone']
}

export interface BountyFilter {
  status?: BountyStatus;
  creatorId?: string;
  claimedBy?: string;
  minAmount?: number;
  maxAmount?: number;
  tags?: string[];
}

// ============================================================================
// BOUNTY MANAGER
// ============================================================================

class BountyManager {
  private bounties: Bounty[] = [];

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
      if (fs.existsSync(BOUNTIES_FILE)) {
        this.bounties = JSON.parse(fs.readFileSync(BOUNTIES_FILE, 'utf-8'));
        console.log(`[BOUNTY] Loaded ${this.bounties.length} bounties`);
      }
    } catch (e) {
      console.log('[BOUNTY] Starting with no bounties');
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(BOUNTIES_FILE, JSON.stringify(this.bounties, null, 2));
    } catch (e) {
      console.error('[BOUNTY] Failed to save:', e);
    }
  }

  private generateId(): string {
    return `bounty_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create a new bounty with CRAFT escrow
   */
  async createBounty(
    creatorId: string,
    creatorName: string,
    title: string,
    description: string,
    amount: number,
    tags: string[] = [],
    expiresInHours: number = 168 // Default 1 week
  ): Promise<{ success: boolean; bounty?: Bounty; error?: string }> {
    // Validation
    if (amount < 10) {
      return { success: false, error: 'Minimum bounty is 10 CRAFT' };
    }
    if (title.length < 5 || title.length > 100) {
      return { success: false, error: 'Title must be 5-100 characters' };
    }
    if (description.length < 20 || description.length > 2000) {
      return { success: false, error: 'Description must be 20-2000 characters' };
    }

    const bountyId = this.generateId();

    // Escrow the CRAFT on-chain
    const escrowResult = await craftTokenService.escrowBounty(creatorId, amount, bountyId);
    if (!escrowResult.success) {
      return { success: false, error: `Escrow failed: ${escrowResult.error}` };
    }

    const bounty: Bounty = {
      id: bountyId,
      creatorId,
      creatorName,
      title,
      description,
      amount,
      escrowSignature: escrowResult.signature,
      status: 'open',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString(),
      tags: tags.map(t => t.toLowerCase().trim()).slice(0, 5),
    };

    this.bounties.push(bounty);
    this.save();

    console.log(`[BOUNTY] Created: ${bountyId} - "${title}" for ${amount} CRAFT`);
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `💰 New bounty: "${title}" - ${amount} CRAFT by ${creatorName}`,
      botName: 'Bounty',
    });

    return { success: true, bounty };
  }

  /**
   * Claim a bounty (mark as in progress)
   */
  claimBounty(
    bountyId: string,
    claimerId: string,
    claimerName: string
  ): { success: boolean; bounty?: Bounty; error?: string } {
    const bounty = this.bounties.find(b => b.id === bountyId);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }
    if (bounty.status !== 'open') {
      return { success: false, error: `Bounty is ${bounty.status}, not open` };
    }
    if (bounty.creatorId === claimerId) {
      return { success: false, error: 'Cannot claim your own bounty' };
    }
    if (new Date(bounty.expiresAt) < new Date()) {
      bounty.status = 'expired';
      this.save();
      return { success: false, error: 'Bounty has expired' };
    }

    bounty.status = 'in_progress';
    bounty.claimedBy = claimerId;
    bounty.claimedByName = claimerName;
    this.save();

    console.log(`[BOUNTY] Claimed: ${bountyId} by ${claimerName}`);
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🔨 ${claimerName} claimed bounty: "${bounty.title}"`,
      botName: 'Bounty',
    });

    return { success: true, bounty };
  }

  /**
   * Submit completed bounty for review
   */
  submitBounty(
    bountyId: string,
    builderId: string,
    notes?: string
  ): { success: boolean; bounty?: Bounty; error?: string } {
    const bounty = this.bounties.find(b => b.id === bountyId);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }
    if (bounty.claimedBy !== builderId) {
      return { success: false, error: 'You did not claim this bounty' };
    }
    if (bounty.status !== 'in_progress') {
      return { success: false, error: `Cannot submit - bounty is ${bounty.status}` };
    }

    bounty.status = 'submitted';
    bounty.submissionNotes = notes;
    this.save();

    console.log(`[BOUNTY] Submitted: ${bountyId} by ${bounty.claimedByName}`);
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `✅ ${bounty.claimedByName} submitted bounty: "${bounty.title}" for review`,
      botName: 'Bounty',
    });

    return { success: true, bounty };
  }

  /**
   * Approve and pay out bounty (creator only)
   */
  async approveBounty(
    bountyId: string,
    approverId: string
  ): Promise<{ success: boolean; bounty?: Bounty; signature?: string; error?: string }> {
    const bounty = this.bounties.find(b => b.id === bountyId);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }
    if (bounty.creatorId !== approverId) {
      return { success: false, error: 'Only the bounty creator can approve' };
    }
    if (bounty.status !== 'submitted') {
      return { success: false, error: `Cannot approve - bounty is ${bounty.status}` };
    }
    if (!bounty.claimedBy) {
      return { success: false, error: 'No builder assigned' };
    }

    // Release CRAFT to builder
    const payoutResult = await craftTokenService.releaseBounty(
      bounty.claimedBy,
      bounty.amount,
      bountyId
    );

    if (!payoutResult.success) {
      return { success: false, error: `Payout failed: ${payoutResult.error}` };
    }

    bounty.status = 'completed';
    bounty.completedAt = new Date().toISOString();
    bounty.payoutSignature = payoutResult.signature;
    this.save();

    console.log(`[BOUNTY] Completed: ${bountyId} - ${bounty.amount} CRAFT to ${bounty.claimedByName}`);
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🎉 Bounty completed! ${bounty.claimedByName} earned ${bounty.amount} CRAFT for "${bounty.title}"`,
      botName: 'Bounty',
    });

    return { success: true, bounty, signature: payoutResult.signature };
  }

  /**
   * Cancel bounty and refund (creator only, if not yet claimed)
   */
  async cancelBounty(
    bountyId: string,
    creatorId: string
  ): Promise<{ success: boolean; bounty?: Bounty; error?: string }> {
    const bounty = this.bounties.find(b => b.id === bountyId);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }
    if (bounty.creatorId !== creatorId) {
      return { success: false, error: 'Only the bounty creator can cancel' };
    }
    if (bounty.status !== 'open') {
      return { success: false, error: 'Can only cancel open bounties' };
    }

    // Refund CRAFT to creator
    const refundResult = await craftTokenService.releaseBounty(
      creatorId,
      bounty.amount,
      bountyId
    );

    if (!refundResult.success) {
      return { success: false, error: `Refund failed: ${refundResult.error}` };
    }

    bounty.status = 'cancelled';
    this.save();

    console.log(`[BOUNTY] Cancelled: ${bountyId} - ${bounty.amount} CRAFT refunded`);

    return { success: true, bounty };
  }

  /**
   * Release a claimed bounty back to open (builder abandons)
   */
  releaseClaim(
    bountyId: string,
    builderId: string
  ): { success: boolean; bounty?: Bounty; error?: string } {
    const bounty = this.bounties.find(b => b.id === bountyId);
    if (!bounty) {
      return { success: false, error: 'Bounty not found' };
    }
    if (bounty.claimedBy !== builderId) {
      return { success: false, error: 'You did not claim this bounty' };
    }
    if (bounty.status !== 'in_progress') {
      return { success: false, error: 'Bounty is not in progress' };
    }

    bounty.status = 'open';
    bounty.claimedBy = undefined;
    bounty.claimedByName = undefined;
    this.save();

    console.log(`[BOUNTY] Released: ${bountyId} back to open`);

    return { success: true, bounty };
  }

  /**
   * Get a single bounty
   */
  getBounty(bountyId: string): Bounty | null {
    return this.bounties.find(b => b.id === bountyId) || null;
  }

  /**
   * List bounties with filters
   */
  listBounties(filter: BountyFilter = {}, limit: number = 50): Bounty[] {
    let results = this.bounties;

    if (filter.status) {
      results = results.filter(b => b.status === filter.status);
    }
    if (filter.creatorId) {
      results = results.filter(b => b.creatorId === filter.creatorId);
    }
    if (filter.claimedBy) {
      results = results.filter(b => b.claimedBy === filter.claimedBy);
    }
    if (filter.minAmount) {
      results = results.filter(b => b.amount >= filter.minAmount!);
    }
    if (filter.maxAmount) {
      results = results.filter(b => b.amount <= filter.maxAmount!);
    }
    if (filter.tags && filter.tags.length > 0) {
      const searchTags = filter.tags.map(t => t.toLowerCase());
      results = results.filter(b => b.tags.some(t => searchTags.includes(t)));
    }

    // Sort by amount (highest first) then by created (newest first)
    return results
      .sort((a, b) => b.amount - a.amount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get bounty stats
   */
  getStats(): {
    total: number;
    open: number;
    inProgress: number;
    completed: number;
    totalPaidOut: number;
  } {
    const stats = {
      total: this.bounties.length,
      open: 0,
      inProgress: 0,
      completed: 0,
      totalPaidOut: 0,
    };

    for (const b of this.bounties) {
      if (b.status === 'open') stats.open++;
      if (b.status === 'in_progress' || b.status === 'submitted') stats.inProgress++;
      if (b.status === 'completed') {
        stats.completed++;
        stats.totalPaidOut += b.amount;
      }
    }

    return stats;
  }

  /**
   * Check and expire old bounties
   */
  expireOldBounties(): number {
    const now = new Date();
    let expired = 0;

    for (const bounty of this.bounties) {
      if (bounty.status === 'open' && new Date(bounty.expiresAt) < now) {
        bounty.status = 'expired';
        expired++;
        // Note: Expired bounties need manual refund handling
      }
    }

    if (expired > 0) {
      this.save();
      console.log(`[BOUNTY] Expired ${expired} bounties`);
    }

    return expired;
  }
}

export const bountyManager = new BountyManager();
