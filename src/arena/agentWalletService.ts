/**
 * Agent Wallet Service
 * Per-agent Solana wallet management for ClaudeCraft
 * 
 * Each agent can have their own wallet for:
 * - Receiving tips/payments
 * - Sending SOL/tokens
 * - Trading NFTs
 * - Arena wagering
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';
import { solanaService, NETWORK } from './solanaService';

const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const WALLETS_FILE = path.join(DATA_DIR, 'agent-wallets.json');

interface AgentWallet {
  agentId: string;
  publicKey: string;
  privateKey: string; // Base58 encoded, encrypted in production
  createdAt: string;
  nickname?: string;
}

interface WalletData {
  wallets: AgentWallet[];
  lastUpdated: string;
}

class AgentWalletService {
  private wallets: Map<string, AgentWallet> = new Map();
  private isInitialized = false;

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Initialize the wallet service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.loadWallets();
    this.isInitialized = true;
    console.log(`[WALLET] Agent wallet service initialized with ${this.wallets.size} wallets`);
  }

  private loadWallets(): void {
    try {
      if (fs.existsSync(WALLETS_FILE)) {
        const data: WalletData = JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8'));
        for (const wallet of data.wallets) {
          this.wallets.set(wallet.agentId, wallet);
        }
      }
    } catch (e) {
      console.log('[WALLET] Starting with no agent wallets');
    }
  }

  private saveWallets(): void {
    const data: WalletData = {
      wallets: Array.from(this.wallets.values()),
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
  }

  /**
   * Get or create a wallet for an agent
   */
  async getOrCreateWallet(agentId: string): Promise<{ publicKey: string; isNew: boolean }> {
    await this.initialize();

    const existing = this.wallets.get(agentId);
    if (existing) {
      return { publicKey: existing.publicKey, isNew: false };
    }

    // Generate new wallet
    const keypair = Keypair.generate();
    const wallet: AgentWallet = {
      agentId,
      publicKey: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
      createdAt: new Date().toISOString(),
    };

    this.wallets.set(agentId, wallet);
    this.saveWallets();

    console.log(`[WALLET] Created wallet for agent ${agentId}: ${wallet.publicKey}`);
    return { publicKey: wallet.publicKey, isNew: true };
  }

  /**
   * Get wallet public key for an agent
   */
  getWalletAddress(agentId: string): string | null {
    const wallet = this.wallets.get(agentId);
    return wallet?.publicKey || null;
  }

  /**
   * Get wallet balance in SOL
   */
  async getBalance(agentId: string): Promise<number | null> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) return null;

    try {
      const connection = new Connection(
        process.env.HELIUS_API_KEY 
          ? `https://${NETWORK === 'mainnet-beta' ? 'mainnet' : NETWORK}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
          : `https://api.${NETWORK}.solana.com`
      );
      const balance = await connection.getBalance(new PublicKey(wallet.publicKey));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error(`[WALLET] Error getting balance for ${agentId}:`, error);
      return null;
    }
  }

  /**
   * Get token balances for an agent (uses Helius if available)
   */
  async getTokenBalances(agentId: string): Promise<{ nativeBalance: number; tokens: any[] } | null> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) return null;

    return solanaService.getTokenBalances(wallet.publicKey);
  }

  /**
   * Get transaction history for an agent
   */
  async getTransactionHistory(agentId: string, limit: number = 10): Promise<any[]> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) return [];

    return solanaService.getParsedTransactionHistory(wallet.publicKey, limit);
  }

  /**
   * Send SOL from agent wallet
   */
  async sendSOL(
    agentId: string,
    toAddress: string,
    amountSOL: number
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      return { success: false, error: 'Agent wallet not found' };
    }

    try {
      const connection = new Connection(
        process.env.HELIUS_API_KEY 
          ? `https://${NETWORK === 'mainnet-beta' ? 'mainnet' : NETWORK}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
          : `https://api.${NETWORK}.solana.com`
      );

      const fromKeypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      const toPublicKey = new PublicKey(toAddress);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports: Math.floor(amountSOL * LAMPORTS_PER_SOL),
        })
      );

      const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair]);
      console.log(`[WALLET] Agent ${agentId} sent ${amountSOL} SOL to ${toAddress}: ${signature}`);

      return { success: true, signature };
    } catch (error: any) {
      console.error(`[WALLET] Send failed for ${agentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Request devnet airdrop for testing
   */
  async requestAirdrop(agentId: string, amountSOL: number = 1): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (NETWORK !== 'devnet') {
      return { success: false, error: 'Airdrop only available on devnet' };
    }

    const wallet = this.wallets.get(agentId);
    if (!wallet) {
      return { success: false, error: 'Agent wallet not found' };
    }

    try {
      const connection = new Connection(`https://api.devnet.solana.com`);
      const signature = await connection.requestAirdrop(
        new PublicKey(wallet.publicKey),
        amountSOL * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(signature);
      
      console.log(`[WALLET] Airdrop ${amountSOL} SOL to agent ${agentId}: ${signature}`);
      return { success: true, signature };
    } catch (error: any) {
      console.error(`[WALLET] Airdrop failed for ${agentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Import an existing wallet for an agent
   */
  importWallet(agentId: string, privateKeyBase58: string): { success: boolean; publicKey?: string; error?: string } {
    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
      
      const wallet: AgentWallet = {
        agentId,
        publicKey: keypair.publicKey.toBase58(),
        privateKey: privateKeyBase58,
        createdAt: new Date().toISOString(),
      };

      this.wallets.set(agentId, wallet);
      this.saveWallets();

      console.log(`[WALLET] Imported wallet for agent ${agentId}: ${wallet.publicKey}`);
      return { success: true, publicKey: wallet.publicKey };
    } catch (error: any) {
      return { success: false, error: 'Invalid private key format' };
    }
  }

  /**
   * Get all wallet stats
   */
  getStats(): { walletCount: number; network: string; heliusEnabled: boolean } {
    return {
      walletCount: this.wallets.size,
      network: NETWORK,
      heliusEnabled: !!process.env.HELIUS_API_KEY,
    };
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}

export const agentWalletService = new AgentWalletService();
