/**
 * Solana Service
 * Handles Solana blockchain integration for the arena system
 * - Generates deposit addresses for agents
 * - Verifies SOL deposits
 * - Processes payouts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  ParsedTransactionWithMeta,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';

const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const SOLANA_DATA_FILE = path.join(DATA_DIR, 'solana-wallets.json');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');

// Use devnet for testing, mainnet-beta for production
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = process.env.SOLANA_RPC_URL || 
  (NETWORK === 'mainnet-beta' 
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com');

// Minimum deposit in SOL
const MIN_DEPOSIT_SOL = 0.01;

// Conversion rate: 1 SOL = 1000 arena tokens
const SOL_TO_TOKENS = 1000;

interface AgentWallet {
  ownerId: string;
  depositAddress: string;
  privateKey: string; // Base58 encoded
  createdAt: string;
  lastChecked: string | null;
}

interface Deposit {
  id: string;
  ownerId: string;
  signature: string;
  amountSol: number;
  amountTokens: number;
  confirmedAt: string;
  credited: boolean;
}

class SolanaService {
  private connection: Connection;
  private wallets: Map<string, AgentWallet> = new Map();
  private deposits: Deposit[] = [];
  private serverWallet: Keypair | null = null;
  private isInitialized = false;

  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load server wallet from env or generate new one
      const serverKey = process.env.SOLANA_SERVER_PRIVATE_KEY;
      if (serverKey) {
        try {
          const decoded = bs58.decode(serverKey);
          this.serverWallet = Keypair.fromSecretKey(decoded);
          console.log(`[SOLANA] Server wallet loaded: ${this.serverWallet.publicKey.toBase58()}`);
        } catch (e) {
          console.error('[SOLANA] Invalid server private key in env');
        }
      }

      if (!this.serverWallet) {
        // Generate new server wallet
        this.serverWallet = Keypair.generate();
        console.log(`[SOLANA] Generated new server wallet: ${this.serverWallet.publicKey.toBase58()}`);
        console.log(`[SOLANA] ⚠️ Save this private key: ${bs58.encode(this.serverWallet.secretKey)}`);
      }

      // Load agent wallets
      this.loadWallets();
      this.loadDeposits();

      // Test connection
      const version = await this.connection.getVersion();
      console.log(`[SOLANA] Connected to ${NETWORK} (version: ${version['solana-core']})`);
      
      if (this.serverWallet) {
        const balance = await this.connection.getBalance(this.serverWallet.publicKey);
        console.log(`[SOLANA] Server balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('[SOLANA] Failed to initialize:', error);
    }
  }

  private loadWallets(): void {
    try {
      if (fs.existsSync(SOLANA_DATA_FILE)) {
        const data = JSON.parse(fs.readFileSync(SOLANA_DATA_FILE, 'utf-8'));
        for (const wallet of data) {
          this.wallets.set(wallet.ownerId, wallet);
        }
        console.log(`[SOLANA] Loaded ${this.wallets.size} agent wallets`);
      }
    } catch (e) {
      console.log('[SOLANA] Starting with no agent wallets');
    }
  }

  private loadDeposits(): void {
    try {
      if (fs.existsSync(DEPOSITS_FILE)) {
        this.deposits = JSON.parse(fs.readFileSync(DEPOSITS_FILE, 'utf-8'));
        console.log(`[SOLANA] Loaded ${this.deposits.length} deposit records`);
      }
    } catch (e) {
      // Ignore
    }
  }

  private saveWallets(): void {
    try {
      fs.writeFileSync(
        SOLANA_DATA_FILE,
        JSON.stringify(Array.from(this.wallets.values()), null, 2)
      );
    } catch (e) {
      console.error('[SOLANA] Failed to save wallets:', e);
    }
  }

  private saveDeposits(): void {
    try {
      fs.writeFileSync(DEPOSITS_FILE, JSON.stringify(this.deposits.slice(-1000), null, 2));
    } catch (e) {
      console.error('[SOLANA] Failed to save deposits:', e);
    }
  }

  /**
   * Get or create a deposit address for an agent
   */
  getOrCreateDepositAddress(ownerId: string): { address: string; isNew: boolean } {
    // Check if agent already has a wallet
    const existing = this.wallets.get(ownerId);
    if (existing) {
      return { address: existing.depositAddress, isNew: false };
    }

    // Generate new wallet for agent
    const keypair = Keypair.generate();
    const wallet: AgentWallet = {
      ownerId,
      depositAddress: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
      createdAt: new Date().toISOString(),
      lastChecked: null,
    };

    this.wallets.set(ownerId, wallet);
    this.saveWallets();

    console.log(`[SOLANA] Created deposit address for ${ownerId}: ${wallet.depositAddress}`);
    return { address: wallet.depositAddress, isNew: true };
  }

  /**
   * Get deposit address for an agent (returns null if not created yet)
   */
  getDepositAddress(ownerId: string): string | null {
    return this.wallets.get(ownerId)?.depositAddress || null;
  }

  /**
   * Check for new deposits to an agent's wallet
   * Returns array of new deposits with token amounts
   */
  async checkDeposits(ownerId: string): Promise<{
    newDeposits: Array<{ signature: string; amountSol: number; amountTokens: number }>;
    totalNewTokens: number;
  }> {
    const wallet = this.wallets.get(ownerId);
    if (!wallet) {
      return { newDeposits: [], totalNewTokens: 0 };
    }

    try {
      const pubkey = new PublicKey(wallet.depositAddress);
      
      // Get recent signatures
      const signatures = await this.connection.getSignaturesForAddress(pubkey, {
        limit: 20,
      });

      const newDeposits: Array<{ signature: string; amountSol: number; amountTokens: number }> = [];
      let totalNewTokens = 0;

      for (const sig of signatures) {
        // Skip if already processed
        if (this.deposits.some(d => d.signature === sig.signature)) {
          continue;
        }

        // Get transaction details
        const tx = await this.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || tx.meta?.err) continue;

        // Find SOL transfers to this address
        const preBalance = tx.meta?.preBalances[0] || 0;
        const postBalance = tx.meta?.postBalances[0] || 0;
        const amountLamports = postBalance - preBalance;

        if (amountLamports > 0) {
          const amountSol = amountLamports / LAMPORTS_PER_SOL;
          
          // Check minimum deposit
          if (amountSol < MIN_DEPOSIT_SOL) {
            console.log(`[SOLANA] Deposit too small: ${amountSol} SOL (min: ${MIN_DEPOSIT_SOL})`);
            continue;
          }

          const amountTokens = Math.floor(amountSol * SOL_TO_TOKENS);

          // Record deposit
          const deposit: Deposit = {
            id: `dep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ownerId,
            signature: sig.signature,
            amountSol,
            amountTokens,
            confirmedAt: new Date().toISOString(),
            credited: false,
          };

          this.deposits.push(deposit);
          newDeposits.push({ signature: sig.signature, amountSol, amountTokens });
          totalNewTokens += amountTokens;

          console.log(`[SOLANA] New deposit: ${amountSol} SOL = ${amountTokens} tokens (${sig.signature.substring(0, 16)}...)`);
        }
      }

      // Update last checked time
      wallet.lastChecked = new Date().toISOString();
      this.saveWallets();
      this.saveDeposits();

      return { newDeposits, totalNewTokens };
    } catch (error) {
      console.error(`[SOLANA] Error checking deposits for ${ownerId}:`, error);
      return { newDeposits: [], totalNewTokens: 0 };
    }
  }

  /**
   * Mark deposit as credited (after adding tokens to agent balance)
   */
  markDepositCredited(signature: string): void {
    const deposit = this.deposits.find(d => d.signature === signature);
    if (deposit) {
      deposit.credited = true;
      this.saveDeposits();
    }
  }

  /**
   * Get uncredited deposits for an agent
   */
  getUncreditedDeposits(ownerId: string): Deposit[] {
    return this.deposits.filter(d => d.ownerId === ownerId && !d.credited);
  }

  /**
   * Get balance of agent's deposit address (in SOL)
   */
  async getDepositBalance(ownerId: string): Promise<number> {
    const wallet = this.wallets.get(ownerId);
    if (!wallet) return 0;

    try {
      const balance = await this.connection.getBalance(new PublicKey(wallet.depositAddress));
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error(`[SOLANA] Error getting balance for ${ownerId}:`, error);
      return 0;
    }
  }

  /**
   * Withdraw SOL from agent's deposit address to external wallet
   * (Sweep deposits to server wallet)
   */
  async sweepToServer(ownerId: string): Promise<{
    success: boolean;
    amountSol?: number;
    signature?: string;
    error?: string;
  }> {
    const wallet = this.wallets.get(ownerId);
    if (!wallet || !this.serverWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      const balance = await this.connection.getBalance(keypair.publicKey);
      
      // Keep some for rent
      const rentExempt = 0.001 * LAMPORTS_PER_SOL;
      const amountToSend = balance - rentExempt;
      
      if (amountToSend <= 0) {
        return { success: false, error: 'Insufficient balance' };
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: this.serverWallet.publicKey,
          lamports: amountToSend,
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [keypair]
      );

      const amountSol = amountToSend / LAMPORTS_PER_SOL;
      console.log(`[SOLANA] Swept ${amountSol} SOL from ${ownerId} to server (${signature})`);

      return { success: true, amountSol, signature };
    } catch (error: any) {
      console.error(`[SOLANA] Sweep failed for ${ownerId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send SOL payout to external address
   */
  async sendPayout(
    toAddress: string,
    amountSol: number
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (!this.serverWallet) {
      return { success: false, error: 'Server wallet not initialized' };
    }

    try {
      // Validate address
      const toPubkey = new PublicKey(toAddress);
      
      const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.serverWallet.publicKey,
          toPubkey,
          lamports,
        })
      );

      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.serverWallet]
      );

      console.log(`[SOLANA] Sent ${amountSol} SOL payout to ${toAddress} (${signature})`);
      return { success: true, signature };
    } catch (error: any) {
      console.error('[SOLANA] Payout failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get server wallet info
   */
  getServerInfo(): { address: string; network: string } | null {
    if (!this.serverWallet) return null;
    return {
      address: this.serverWallet.publicKey.toBase58(),
      network: NETWORK,
    };
  }

  /**
   * Get server wallet balance
   */
  async getServerBalance(): Promise<number> {
    if (!this.serverWallet) return 0;
    try {
      const balance = await this.connection.getBalance(this.serverWallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  /**
   * Airdrop SOL to deposit address (devnet only)
   */
  async requestAirdrop(ownerId: string, amountSol: number = 1): Promise<{
    success: boolean;
    signature?: string;
    error?: string;
  }> {
    if (NETWORK !== 'devnet') {
      return { success: false, error: 'Airdrop only available on devnet' };
    }

    const wallet = this.wallets.get(ownerId);
    if (!wallet) {
      return { success: false, error: 'Wallet not found' };
    }

    try {
      const signature = await this.connection.requestAirdrop(
        new PublicKey(wallet.depositAddress),
        amountSol * LAMPORTS_PER_SOL
      );
      
      await this.connection.confirmTransaction(signature);
      console.log(`[SOLANA] Airdropped ${amountSol} SOL to ${wallet.depositAddress}`);
      
      return { success: true, signature };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Convert tokens to SOL value
   */
  tokensToSol(tokens: number): number {
    return tokens / SOL_TO_TOKENS;
  }

  /**
   * Convert SOL to tokens
   */
  solToTokens(sol: number): number {
    return Math.floor(sol * SOL_TO_TOKENS);
  }
}

export const solanaService = new SolanaService();
