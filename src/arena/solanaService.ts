/**
 * Solana Service (Updated Jan 2026)
 * Handles Solana blockchain integration for the arena system
 * - Generates deposit addresses for agents
 * - Verifies SOL deposits
 * - Processes payouts
 * 
 * Stack: @solana/web3.js with modern confirmation patterns
 * See: https://solana.com/SKILL.md for best practices
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
  ComputeBudgetProgram,
  Commitment,
  TransactionConfirmationStrategy,
  VersionedTransaction,
  TransactionMessage,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';

const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const SOLANA_DATA_FILE = path.join(DATA_DIR, 'solana-wallets.json');
const DEPOSITS_FILE = path.join(DATA_DIR, 'deposits.json');

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

// Network selection: devnet (testing) or mainnet-beta (production)
const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

// RPC endpoints - prefer dedicated RPC for production
const RPC_ENDPOINTS: Record<string, { http: string; ws: string }> = {
  'mainnet-beta': {
    http: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    ws: process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com',
  },
  'devnet': {
    http: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    ws: process.env.SOLANA_WS_URL || 'wss://api.devnet.solana.com',
  },
};

const RPC_URL = RPC_ENDPOINTS[NETWORK]?.http || RPC_ENDPOINTS['devnet'].http;
const WS_URL = RPC_ENDPOINTS[NETWORK]?.ws || RPC_ENDPOINTS['devnet'].ws;

// Transaction confirmation settings
const COMMITMENT: Commitment = 'confirmed';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Compute budget for mainnet (prioritization fees)
const COMPUTE_UNIT_PRICE_MICROLAMPORTS = NETWORK === 'mainnet-beta' ? 50000 : 0; // 0.05 lamports/CU
const COMPUTE_UNIT_LIMIT = 200_000;

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
    // Connection with websocket for better subscription support
    this.connection = new Connection(RPC_URL, {
      commitment: COMMITMENT,
      wsEndpoint: WS_URL,
      confirmTransactionInitialTimeout: 60000,
    });
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Sleep utility for retries
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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

      // Test connection with retry
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const version = await this.connection.getVersion();
          console.log(`[SOLANA] Connected to ${NETWORK} (version: ${version['solana-core']})`);
          console.log(`[SOLANA] RPC: ${RPC_URL}`);
          console.log(`[SOLANA] WS: ${WS_URL}`);
          break;
        } catch (e) {
          if (attempt === MAX_RETRIES) throw e;
          console.log(`[SOLANA] Connection attempt ${attempt} failed, retrying...`);
          await this.sleep(RETRY_DELAY_MS);
        }
      }
      
      if (this.serverWallet) {
        const balance = await this.connection.getBalance(this.serverWallet.publicKey);
        console.log(`[SOLANA] Server balance: ${balance / LAMPORTS_PER_SOL} SOL`);
        
        if (NETWORK === 'mainnet-beta' && COMPUTE_UNIT_PRICE_MICROLAMPORTS > 0) {
          console.log(`[SOLANA] Priority fee: ${COMPUTE_UNIT_PRICE_MICROLAMPORTS} microlamports/CU`);
        }
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
            id: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
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
   * Build transaction with compute budget (for mainnet prioritization)
   */
  private buildTransactionWithComputeBudget(
    instructions: any[],
    feePayer: PublicKey
  ): Transaction {
    const tx = new Transaction();
    
    // Add compute budget instructions for mainnet (priority fees)
    if (NETWORK === 'mainnet-beta' && COMPUTE_UNIT_PRICE_MICROLAMPORTS > 0) {
      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE_MICROLAMPORTS })
      );
    }
    
    // Add the actual instructions
    for (const ix of instructions) {
      tx.add(ix);
    }
    
    tx.feePayer = feePayer;
    return tx;
  }

  /**
   * Send and confirm transaction with retry logic
   */
  private async sendAndConfirmWithRetry(
    transaction: Transaction,
    signers: Keypair[],
    description: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Get fresh blockhash for each attempt
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash(COMMITMENT);
        transaction.recentBlockhash = blockhash;
        
        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          signers,
          {
            commitment: COMMITMENT,
            maxRetries: 3,
          }
        );

        console.log(`[SOLANA] ${description} confirmed: ${signature.substring(0, 16)}...`);
        return { success: true, signature };
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        console.error(`[SOLANA] ${description} attempt ${attempt}/${MAX_RETRIES} failed: ${errorMsg}`);
        
        // Don't retry on certain errors
        if (errorMsg.includes('insufficient funds') || 
            errorMsg.includes('invalid account') ||
            errorMsg.includes('already been processed')) {
          return { success: false, error: errorMsg };
        }
        
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * attempt); // Exponential backoff
        } else {
          return { success: false, error: errorMsg };
        }
      }
    }
    return { success: false, error: 'Max retries exceeded' };
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

      const transferIx = SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: this.serverWallet.publicKey,
        lamports: amountToSend,
      });

      const transaction = this.buildTransactionWithComputeBudget([transferIx], keypair.publicKey);
      const amountSol = amountToSend / LAMPORTS_PER_SOL;

      const result = await this.sendAndConfirmWithRetry(
        transaction,
        [keypair],
        `Sweep ${amountSol} SOL from ${ownerId}`
      );

      if (result.success) {
        return { success: true, amountSol, signature: result.signature };
      }
      return result;
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

      const transferIx = SystemProgram.transfer({
        fromPubkey: this.serverWallet.publicKey,
        toPubkey,
        lamports,
      });

      const transaction = this.buildTransactionWithComputeBudget([transferIx], this.serverWallet.publicKey);

      return await this.sendAndConfirmWithRetry(
        transaction,
        [this.serverWallet],
        `Payout ${amountSol} SOL to ${toAddress.substring(0, 8)}...`
      );
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

  /**
   * Escrow SOL for a game wager
   * Transfers SOL from agent's deposit address to server wallet
   */
  async escrowGameWager(
    ownerId: string, 
    amountSol: number
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    const wallet = this.wallets.get(ownerId);
    if (!wallet || !this.serverWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    try {
      const keypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      const balance = await this.connection.getBalance(keypair.publicKey);
      const requiredLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
      
      // Check sufficient balance (include tx fee buffer + priority fee)
      const feeBuffer = NETWORK === 'mainnet-beta' ? 50000 : 5000;
      if (balance < requiredLamports + feeBuffer) {
        return { 
          success: false, 
          error: `Insufficient SOL. Have: ${(balance / LAMPORTS_PER_SOL).toFixed(4)}, Need: ${amountSol}` 
        };
      }

      const transferIx = SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: this.serverWallet.publicKey,
        lamports: requiredLamports,
      });

      const transaction = this.buildTransactionWithComputeBudget([transferIx], keypair.publicKey);

      return await this.sendAndConfirmWithRetry(
        transaction,
        [keypair],
        `Escrow ${amountSol} SOL from ${ownerId}`
      );
    } catch (error: any) {
      console.error(`[SOLANA] Escrow failed for ${ownerId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Pay out game winnings in SOL
   * Sends SOL from server wallet to winner's deposit address
   */
  async payoutGameWinner(
    winnerId: string,
    amountSol: number
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    const wallet = this.wallets.get(winnerId);
    if (!wallet || !this.serverWallet) {
      return { success: false, error: 'Wallet not found' };
    }

    try {
      const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);

      const transferIx = SystemProgram.transfer({
        fromPubkey: this.serverWallet.publicKey,
        toPubkey: new PublicKey(wallet.depositAddress),
        lamports,
      });

      const transaction = this.buildTransactionWithComputeBudget([transferIx], this.serverWallet.publicKey);

      return await this.sendAndConfirmWithRetry(
        transaction,
        [this.serverWallet],
        `Game payout ${amountSol} SOL to ${winnerId}`
      );
    } catch (error: any) {
      console.error('[SOLANA] Game payout failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get external wallet address for payouts (from agent profile)
   */
  getAgentDepositAddress(ownerId: string): string | null {
    const wallet = this.wallets.get(ownerId);
    return wallet?.depositAddress || null;
  }

  /**
   * Get network configuration info
   */
  getNetworkInfo(): {
    network: string;
    rpcUrl: string;
    wsUrl: string;
    commitment: string;
    priorityFee: number;
  } {
    return {
      network: NETWORK,
      rpcUrl: RPC_URL,
      wsUrl: WS_URL,
      commitment: COMMITMENT,
      priorityFee: COMPUTE_UNIT_PRICE_MICROLAMPORTS,
    };
  }

  /**
   * Get total deposits for an agent
   */
  getTotalDeposits(ownerId: string): { count: number; totalSol: number; totalTokens: number } {
    const agentDeposits = this.deposits.filter(d => d.ownerId === ownerId);
    const totalSol = agentDeposits.reduce((sum, d) => sum + d.amountSol, 0);
    const totalTokens = agentDeposits.reduce((sum, d) => sum + d.amountTokens, 0);
    return {
      count: agentDeposits.length,
      totalSol,
      totalTokens,
    };
  }

  /**
   * Validate a Solana address
   */
  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get transaction explorer URL
   */
  getExplorerUrl(signature: string): string {
    const baseUrl = NETWORK === 'mainnet-beta'
      ? 'https://explorer.solana.com/tx/'
      : `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`;
    return NETWORK === 'mainnet-beta'
      ? `https://explorer.solana.com/tx/${signature}`
      : `https://explorer.solana.com/tx/${signature}?cluster=${NETWORK}`;
  }
}

export const solanaService = new SolanaService();

// Export constants for use elsewhere
export { NETWORK, SOL_TO_TOKENS, MIN_DEPOSIT_SOL };
