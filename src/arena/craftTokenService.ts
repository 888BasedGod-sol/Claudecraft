/**
 * CRAFT Token Service
 * 
 * Handles CRAFT (SPL) token operations for arena wagers, bounties, and tips.
 * Extends the base Solana service with SPL token transfer capabilities.
 * 
 * Token: B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump (CRAFT on pump.fun)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Commitment,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import bs58 from 'bs58';

// ============================================================================
// CRAFT TOKEN CONFIGURATION
// ============================================================================

// CRAFT Token Mint Address (pump.fun)
export const CRAFT_TOKEN_MINT = new PublicKey('B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump');
export const CRAFT_DECIMALS = 6;
export const CRAFT_MULTIPLIER = Math.pow(10, CRAFT_DECIMALS);

// Network configuration
const NETWORK = process.env.SOLANA_NETWORK || 'mainnet-beta';
const RPC_ENDPOINTS: Record<string, string> = {
  'mainnet-beta': process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'devnet': process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
};
const RPC_URL = RPC_ENDPOINTS[NETWORK] || RPC_ENDPOINTS['mainnet-beta'];

// Transaction settings
const COMMITMENT: Commitment = 'confirmed';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const COMPUTE_UNIT_PRICE = NETWORK === 'mainnet-beta' ? 50000 : 0;
const COMPUTE_UNIT_LIMIT = 200_000;

// Data storage
const DATA_DIR = path.join(process.cwd(), 'data', 'arena');
const CRAFT_WALLETS_FILE = path.join(DATA_DIR, 'craft-wallets.json');
const CRAFT_TRANSACTIONS_FILE = path.join(DATA_DIR, 'craft-transactions.json');

// Test mode - simulates transactions without real tokens
// Use a function to check at runtime (after dotenv loads)
function isTestMode(): boolean {
  return process.env.CRAFT_TEST_MODE === 'true';
}
const TEST_STARTING_BALANCE = 1000; // Each agent starts with 1000 CRAFT in test mode

// ============================================================================
// TYPES
// ============================================================================

interface CraftWallet {
  ownerId: string;
  walletAddress: string;  // Deposit address (Solana keypair)
  privateKey: string;     // Base58 encoded
  tokenAccount?: string;  // Associated Token Account for CRAFT
  createdAt: string;
}

interface CraftTransaction {
  id: string;
  type: 'deposit' | 'wager_escrow' | 'wager_payout' | 'bounty_escrow' | 'bounty_payout' | 'tip';
  fromOwnerId?: string;
  toOwnerId?: string;
  amount: number;  // In CRAFT (not raw)
  signature?: string;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'failed';
  metadata?: Record<string, any>;
}

// ============================================================================
// CRAFT TOKEN SERVICE
// ============================================================================

class CraftTokenService {
  private connection: Connection;
  private wallets: Map<string, CraftWallet> = new Map();
  private transactions: CraftTransaction[] = [];
  private serverWallet: Keypair | null = null;
  private serverTokenAccount: PublicKey | null = null;
  private isInitialized = false;
  
  // Test mode: simulated balances (ownerId -> CRAFT amount)
  private testBalances: Map<string, number> = new Map();
  private testServerBalance: number = 100000; // Server has 100k in test mode

  constructor() {
    this.connection = new Connection(RPC_URL, {
      commitment: COMMITMENT,
      confirmTransactionInitialTimeout: 60000,
    });
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Test mode check
      if (isTestMode()) {
        console.log('[CRAFT] 🧪 TEST MODE ENABLED - No real transactions will be made');
        console.log(`[CRAFT] 🧪 Agents start with ${TEST_STARTING_BALANCE} simulated CRAFT`);
      }
      
      // Load server wallet
      const serverKey = process.env.SOLANA_SERVER_PRIVATE_KEY;
      if (serverKey) {
        try {
          const decoded = bs58.decode(serverKey);
          this.serverWallet = Keypair.fromSecretKey(decoded);
          console.log(`[CRAFT] Server wallet: ${this.serverWallet.publicKey.toBase58()}`);
          
          // Get or create server's CRAFT token account
          this.serverTokenAccount = await getAssociatedTokenAddress(
            CRAFT_TOKEN_MINT,
            this.serverWallet.publicKey
          );
          console.log(`[CRAFT] Server token account: ${this.serverTokenAccount!.toBase58()}`);
        } catch (e) {
          console.error('[CRAFT] Invalid server private key');
        }
      }

      // Load wallets and transactions
      this.loadWallets();
      this.loadTransactions();

      // Test connection
      const version = await this.connection.getVersion();
      console.log(`[CRAFT] Connected to ${NETWORK} (${version['solana-core']})`);

      // Check server CRAFT balance
      if (this.serverWallet && this.serverTokenAccount) {
        const balance = await this.getCraftBalance(this.serverWallet.publicKey);
        console.log(`[CRAFT] Server CRAFT balance: ${balance.toLocaleString()}`);
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('[CRAFT] Initialization failed:', error);
    }
  }

  private loadWallets(): void {
    try {
      if (fs.existsSync(CRAFT_WALLETS_FILE)) {
        const data = JSON.parse(fs.readFileSync(CRAFT_WALLETS_FILE, 'utf-8'));
        for (const wallet of data) {
          this.wallets.set(wallet.ownerId, wallet);
        }
        console.log(`[CRAFT] Loaded ${this.wallets.size} agent wallets`);
      }
    } catch (e) {
      console.log('[CRAFT] Starting with no agent wallets');
    }
  }

  private loadTransactions(): void {
    try {
      if (fs.existsSync(CRAFT_TRANSACTIONS_FILE)) {
        this.transactions = JSON.parse(fs.readFileSync(CRAFT_TRANSACTIONS_FILE, 'utf-8'));
        console.log(`[CRAFT] Loaded ${this.transactions.length} transaction records`);
      }
    } catch (e) {
      // Ignore
    }
  }

  private saveWallets(): void {
    try {
      fs.writeFileSync(CRAFT_WALLETS_FILE, JSON.stringify(Array.from(this.wallets.values()), null, 2));
    } catch (e) {
      console.error('[CRAFT] Failed to save wallets:', e);
    }
  }

  private saveTransactions(): void {
    try {
      // Keep last 5000 transactions
      const recent = this.transactions.slice(-5000);
      fs.writeFileSync(CRAFT_TRANSACTIONS_FILE, JSON.stringify(recent, null, 2));
    } catch (e) {
      console.error('[CRAFT] Failed to save transactions:', e);
    }
  }

  private generateTxId(): string {
    return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get or create a CRAFT deposit wallet for an agent
   */
  async getOrCreateWallet(ownerId: string): Promise<{ address: string; tokenAccount: string; isNew: boolean }> {
    const existing = this.wallets.get(ownerId);
    if (existing?.tokenAccount) {
      return { 
        address: existing.walletAddress, 
        tokenAccount: existing.tokenAccount,
        isNew: false 
      };
    }

    // Generate new wallet
    const keypair = Keypair.generate();
    const tokenAccount = await getAssociatedTokenAddress(CRAFT_TOKEN_MINT, keypair.publicKey);

    const wallet: CraftWallet = {
      ownerId,
      walletAddress: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
      tokenAccount: tokenAccount.toBase58(),
      createdAt: new Date().toISOString(),
    };

    this.wallets.set(ownerId, wallet);
    this.saveWallets();

    console.log(`[CRAFT] Created wallet for ${ownerId}: ${wallet.walletAddress}`);
    return { address: wallet.walletAddress, tokenAccount: wallet.tokenAccount!, isNew: true };
  }

  /**
   * Get CRAFT token balance for a wallet
   */
  async getCraftBalance(walletPubkey: PublicKey): Promise<number> {
    try {
      const tokenAccount = await getAssociatedTokenAddress(CRAFT_TOKEN_MINT, walletPubkey);
      const account = await getAccount(this.connection, tokenAccount);
      return Number(account.amount) / CRAFT_MULTIPLIER;
    } catch (error) {
      if (error instanceof TokenAccountNotFoundError) {
        return 0;
      }
      console.error('[CRAFT] Balance check failed:', error);
      return 0;
    }
  }

  /**
   * Get CRAFT balance for an agent by ownerId
   */
  async getAgentCraftBalance(ownerId: string): Promise<number> {
    // Test mode: return simulated balance
    if (isTestMode()) {
      if (!this.testBalances.has(ownerId)) {
        this.testBalances.set(ownerId, TEST_STARTING_BALANCE);
      }
      return this.testBalances.get(ownerId) || 0;
    }
    
    const wallet = this.wallets.get(ownerId);
    if (!wallet) return 0;
    return this.getCraftBalance(new PublicKey(wallet.walletAddress));
  }
  
  /**
   * Get test mode status and balances
   */
  getTestModeInfo(): { enabled: boolean; serverBalance: number } {
    return {
      enabled: isTestMode(),
      serverBalance: isTestMode() ? this.testServerBalance : 0
    };
  }
  
  /**
   * Generate a fake signature for test mode
   */
  private generateTestSignature(): string {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let sig = '';
    for (let i = 0; i < 88; i++) {
      sig += chars[Math.floor(Math.random() * chars.length)];
    }
    return sig;
  }

  /**
   * Build transaction with compute budget for priority fees
   */
  private buildTransaction(instructions: any[], feePayer: PublicKey): Transaction {
    const tx = new Transaction();
    
    if (NETWORK === 'mainnet-beta' && COMPUTE_UNIT_PRICE > 0) {
      tx.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNIT_LIMIT }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE })
      );
    }
    
    for (const ix of instructions) {
      tx.add(ix);
    }
    
    tx.feePayer = feePayer;
    return tx;
  }

  /**
   * Send and confirm transaction with retries
   */
  private async sendWithRetry(
    transaction: Transaction,
    signers: Keypair[],
    description: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { blockhash } = await this.connection.getLatestBlockhash(COMMITMENT);
        transaction.recentBlockhash = blockhash;

        const signature = await sendAndConfirmTransaction(
          this.connection,
          transaction,
          signers,
          { commitment: COMMITMENT, maxRetries: 3 }
        );

        console.log(`[CRAFT] ${description} confirmed: ${signature.substring(0, 16)}...`);
        return { success: true, signature };
      } catch (error: any) {
        const msg = error.message || String(error);
        console.error(`[CRAFT] ${description} attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);

        if (msg.includes('insufficient') || msg.includes('already been processed')) {
          return { success: false, error: msg };
        }

        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * attempt);
        } else {
          return { success: false, error: msg };
        }
      }
    }
    return { success: false, error: 'Max retries exceeded' };
  }

  /**
   * Ensure an Associated Token Account exists, create if needed
   */
  private async ensureTokenAccount(
    ownerPubkey: PublicKey,
    payer: Keypair
  ): Promise<{ success: boolean; ata: PublicKey; created: boolean; error?: string }> {
    const ata = await getAssociatedTokenAddress(CRAFT_TOKEN_MINT, ownerPubkey);

    try {
      await getAccount(this.connection, ata);
      return { success: true, ata, created: false };
    } catch (error) {
      if (!(error instanceof TokenAccountNotFoundError)) {
        return { success: false, ata, created: false, error: String(error) };
      }
    }

    // Create ATA
    const createIx = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      ownerPubkey,
      CRAFT_TOKEN_MINT
    );

    const tx = this.buildTransaction([createIx], payer.publicKey);
    const result = await this.sendWithRetry(tx, [payer], `Create ATA for ${ownerPubkey.toBase58().substring(0, 8)}`);

    if (result.success) {
      return { success: true, ata, created: true };
    }
    return { success: false, ata, created: false, error: result.error };
  }

  // ============================================================================
  // ARENA WAGER FUNCTIONS
  // ============================================================================

  /**
   * Escrow CRAFT tokens for a match wager
   * Transfers from agent's wallet to server escrow
   */
  async escrowWager(
    ownerId: string,
    amount: number,
    matchId: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    // Test mode: simulate transaction
    if (isTestMode()) {
      const balance = await this.getAgentCraftBalance(ownerId);
      if (balance < amount) {
        return { success: false, error: `Insufficient CRAFT. Have: ${balance}, Need: ${amount}` };
      }
      
      // Deduct from test balance
      this.testBalances.set(ownerId, balance - amount);
      this.testServerBalance += amount;
      
      const signature = this.generateTestSignature();
      console.log(`[CRAFT] 🧪 TEST: Escrowed ${amount} CRAFT for match ${matchId}`);
      
      // Record test transaction
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'wager_escrow',
        fromOwnerId: ownerId,
        amount,
        signature,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        metadata: { matchId, testMode: true },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();
      
      return { success: true, signature };
    }
    
    const wallet = this.wallets.get(ownerId);
    if (!wallet || !this.serverWallet || !this.serverTokenAccount) {
      return { success: false, error: 'Wallet or server not initialized' };
    }

    // Check balance
    const balance = await this.getAgentCraftBalance(ownerId);
    if (balance < amount) {
      return { success: false, error: `Insufficient CRAFT. Have: ${balance}, Need: ${amount}` };
    }

    try {
      const agentKeypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      const agentTokenAccount = await getAssociatedTokenAddress(CRAFT_TOKEN_MINT, agentKeypair.publicKey);

      // Ensure server token account exists
      const ataResult = await this.ensureTokenAccount(this.serverWallet.publicKey, agentKeypair);
      if (!ataResult.success) {
        return { success: false, error: `Failed to create server ATA: ${ataResult.error}` };
      }

      const rawAmount = Math.floor(amount * CRAFT_MULTIPLIER);
      const transferIx = createTransferInstruction(
        agentTokenAccount,
        this.serverTokenAccount,
        agentKeypair.publicKey,
        rawAmount
      );

      const tx = this.buildTransaction([transferIx], agentKeypair.publicKey);
      const result = await this.sendWithRetry(tx, [agentKeypair], `Escrow ${amount} CRAFT for match ${matchId}`);

      // Record transaction
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'wager_escrow',
        fromOwnerId: ownerId,
        amount,
        signature: result.signature,
        createdAt: new Date().toISOString(),
        status: result.success ? 'confirmed' : 'failed',
        metadata: { matchId },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Pay out CRAFT winnings to match winner
   */
  async payoutWinner(
    winnerId: string,
    amount: number,
    matchId: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    // Test mode: simulate payout
    if (isTestMode()) {
      if (this.testServerBalance < amount) {
        return { success: false, error: `Server insufficient CRAFT. Have: ${this.testServerBalance}, Need: ${amount}` };
      }
      
      // Credit to winner, deduct from server
      const currentBalance = await this.getAgentCraftBalance(winnerId);
      this.testBalances.set(winnerId, currentBalance + amount);
      this.testServerBalance -= amount;
      
      const signature = this.generateTestSignature();
      console.log(`[CRAFT] 🧪 TEST: Paid out ${amount} CRAFT to ${winnerId} for match ${matchId}`);
      
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'wager_payout',
        toOwnerId: winnerId,
        amount,
        signature,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        metadata: { matchId, testMode: true },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();
      
      return { success: true, signature };
    }
    
    const wallet = this.wallets.get(winnerId);
    if (!wallet || !this.serverWallet || !this.serverTokenAccount) {
      return { success: false, error: 'Wallet or server not initialized' };
    }

    try {
      const winnerPubkey = new PublicKey(wallet.walletAddress);
      
      // Ensure winner's token account exists
      const ataResult = await this.ensureTokenAccount(winnerPubkey, this.serverWallet);
      if (!ataResult.success) {
        return { success: false, error: `Failed to create winner ATA: ${ataResult.error}` };
      }

      const rawAmount = Math.floor(amount * CRAFT_MULTIPLIER);
      const transferIx = createTransferInstruction(
        this.serverTokenAccount,
        ataResult.ata,
        this.serverWallet.publicKey,
        rawAmount
      );

      const tx = this.buildTransaction([transferIx], this.serverWallet.publicKey);
      const result = await this.sendWithRetry(tx, [this.serverWallet], `Payout ${amount} CRAFT to ${winnerId} for match ${matchId}`);

      // Record transaction
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'wager_payout',
        toOwnerId: winnerId,
        amount,
        signature: result.signature,
        createdAt: new Date().toISOString(),
        status: result.success ? 'confirmed' : 'failed',
        metadata: { matchId },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // BOUNTY FUNCTIONS
  // ============================================================================

  /**
   * Escrow CRAFT for a build bounty
   */
  async escrowBounty(
    creatorId: string,
    amount: number,
    bountyId: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    // Test mode: simulate escrow
    if (isTestMode()) {
      const balance = await this.getAgentCraftBalance(creatorId);
      if (balance < amount) {
        return { success: false, error: `Insufficient CRAFT. Have: ${balance}, Need: ${amount}` };
      }
      
      this.testBalances.set(creatorId, balance - amount);
      this.testServerBalance += amount;
      
      const signature = this.generateTestSignature();
      console.log(`[CRAFT] 🧪 TEST: Escrowed ${amount} CRAFT for bounty ${bountyId}`);
      
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'bounty_escrow',
        fromOwnerId: creatorId,
        amount,
        signature,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        metadata: { bountyId, testMode: true },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();
      
      return { success: true, signature };
    }
    
    const wallet = this.wallets.get(creatorId);
    if (!wallet || !this.serverWallet || !this.serverTokenAccount) {
      return { success: false, error: 'Wallet or server not initialized' };
    }

    const balance = await this.getAgentCraftBalance(creatorId);
    if (balance < amount) {
      return { success: false, error: `Insufficient CRAFT. Have: ${balance}, Need: ${amount}` };
    }

    try {
      const creatorKeypair = Keypair.fromSecretKey(bs58.decode(wallet.privateKey));
      const creatorTokenAccount = await getAssociatedTokenAddress(CRAFT_TOKEN_MINT, creatorKeypair.publicKey);

      const ataResult = await this.ensureTokenAccount(this.serverWallet.publicKey, creatorKeypair);
      if (!ataResult.success) {
        return { success: false, error: `Failed to create server ATA: ${ataResult.error}` };
      }

      const rawAmount = Math.floor(amount * CRAFT_MULTIPLIER);
      const transferIx = createTransferInstruction(
        creatorTokenAccount,
        this.serverTokenAccount,
        creatorKeypair.publicKey,
        rawAmount
      );

      const tx = this.buildTransaction([transferIx], creatorKeypair.publicKey);
      const result = await this.sendWithRetry(tx, [creatorKeypair], `Escrow ${amount} CRAFT for bounty ${bountyId}`);

      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'bounty_escrow',
        fromOwnerId: creatorId,
        amount,
        signature: result.signature,
        createdAt: new Date().toISOString(),
        status: result.success ? 'confirmed' : 'failed',
        metadata: { bountyId },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Release bounty payment to builder
   */
  async releaseBounty(
    builderId: string,
    amount: number,
    bountyId: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    // Test mode: simulate release
    if (isTestMode()) {
      if (this.testServerBalance < amount) {
        return { success: false, error: `Server insufficient CRAFT. Have: ${this.testServerBalance}, Need: ${amount}` };
      }
      
      const currentBalance = await this.getAgentCraftBalance(builderId);
      this.testBalances.set(builderId, currentBalance + amount);
      this.testServerBalance -= amount;
      
      const signature = this.generateTestSignature();
      console.log(`[CRAFT] 🧪 TEST: Released ${amount} CRAFT for bounty ${bountyId} to ${builderId}`);
      
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'bounty_payout',
        toOwnerId: builderId,
        amount,
        signature,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        metadata: { bountyId, testMode: true },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();
      
      return { success: true, signature };
    }
    
    const wallet = this.wallets.get(builderId);
    if (!wallet || !this.serverWallet || !this.serverTokenAccount) {
      return { success: false, error: 'Wallet or server not initialized' };
    }

    try {
      const builderPubkey = new PublicKey(wallet.walletAddress);
      
      const ataResult = await this.ensureTokenAccount(builderPubkey, this.serverWallet);
      if (!ataResult.success) {
        return { success: false, error: `Failed to create builder ATA: ${ataResult.error}` };
      }

      const rawAmount = Math.floor(amount * CRAFT_MULTIPLIER);
      const transferIx = createTransferInstruction(
        this.serverTokenAccount,
        ataResult.ata,
        this.serverWallet.publicKey,
        rawAmount
      );

      const tx = this.buildTransaction([transferIx], this.serverWallet.publicKey);
      const result = await this.sendWithRetry(tx, [this.serverWallet], `Release ${amount} CRAFT bounty ${bountyId} to ${builderId}`);

      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'bounty_payout',
        toOwnerId: builderId,
        amount,
        signature: result.signature,
        createdAt: new Date().toISOString(),
        status: result.success ? 'confirmed' : 'failed',
        metadata: { bountyId },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // TIP FUNCTIONS
  // ============================================================================

  /**
   * Send a CRAFT tip from one agent to another
   */
  async sendTip(
    fromOwnerId: string,
    toOwnerId: string,
    amount: number,
    message?: string
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    // Test mode: simulate tip
    if (isTestMode()) {
      const fromBalance = await this.getAgentCraftBalance(fromOwnerId);
      if (fromBalance < amount) {
        return { success: false, error: `Insufficient CRAFT. Have: ${fromBalance}, Need: ${amount}` };
      }
      
      const toBalance = await this.getAgentCraftBalance(toOwnerId);
      this.testBalances.set(fromOwnerId, fromBalance - amount);
      this.testBalances.set(toOwnerId, toBalance + amount);
      
      const signature = this.generateTestSignature();
      console.log(`[CRAFT] 🧪 TEST: Tipped ${amount} CRAFT from ${fromOwnerId} to ${toOwnerId}`);
      
      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'tip',
        fromOwnerId,
        toOwnerId,
        amount,
        signature,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
        metadata: { message, testMode: true },
      };
      this.transactions.push(txRecord);
      this.saveTransactions();
      
      return { success: true, signature };
    }
    
    const fromWallet = this.wallets.get(fromOwnerId);
    const toWallet = this.wallets.get(toOwnerId);
    
    if (!fromWallet) {
      return { success: false, error: 'Sender wallet not found' };
    }
    if (!toWallet) {
      return { success: false, error: 'Recipient wallet not found' };
    }

    const balance = await this.getAgentCraftBalance(fromOwnerId);
    if (balance < amount) {
      return { success: false, error: `Insufficient CRAFT. Have: ${balance}, Need: ${amount}` };
    }

    try {
      const fromKeypair = Keypair.fromSecretKey(bs58.decode(fromWallet.privateKey));
      const toPubkey = new PublicKey(toWallet.walletAddress);
      
      const fromTokenAccount = await getAssociatedTokenAddress(CRAFT_TOKEN_MINT, fromKeypair.publicKey);
      
      // Ensure recipient's token account exists
      const ataResult = await this.ensureTokenAccount(toPubkey, fromKeypair);
      if (!ataResult.success) {
        return { success: false, error: `Failed to create recipient ATA: ${ataResult.error}` };
      }

      const rawAmount = Math.floor(amount * CRAFT_MULTIPLIER);
      const transferIx = createTransferInstruction(
        fromTokenAccount,
        ataResult.ata,
        fromKeypair.publicKey,
        rawAmount
      );

      const tx = this.buildTransaction([transferIx], fromKeypair.publicKey);
      const result = await this.sendWithRetry(tx, [fromKeypair], `Tip ${amount} CRAFT from ${fromOwnerId} to ${toOwnerId}`);

      const txRecord: CraftTransaction = {
        id: this.generateTxId(),
        type: 'tip',
        fromOwnerId,
        toOwnerId,
        amount,
        signature: result.signature,
        createdAt: new Date().toISOString(),
        status: result.success ? 'confirmed' : 'failed',
        metadata: message ? { message } : undefined,
      };
      this.transactions.push(txRecord);
      this.saveTransactions();

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  /**
   * Get transaction history for an agent
   */
  getAgentTransactions(ownerId: string, limit: number = 50): CraftTransaction[] {
    return this.transactions
      .filter(t => t.fromOwnerId === ownerId || t.toOwnerId === ownerId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get server CRAFT balance
   */
  async getServerCraftBalance(): Promise<number> {
    if (!this.serverWallet) return 0;
    return this.getCraftBalance(this.serverWallet.publicKey);
  }

  /**
   * Get deposit address for external CRAFT deposits
   */
  getDepositAddress(ownerId: string): { wallet: string; tokenAccount: string } | null {
    const wallet = this.wallets.get(ownerId);
    if (!wallet) return null;
    return {
      wallet: wallet.walletAddress,
      tokenAccount: wallet.tokenAccount || '',
    };
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(signature: string): string {
    const cluster = NETWORK === 'mainnet-beta' ? '' : `?cluster=${NETWORK}`;
    return `https://explorer.solana.com/tx/${signature}${cluster}`;
  }

  /**
   * Get network info
   */
  getNetworkInfo(): { network: string; tokenMint: string; decimals: number } {
    return {
      network: NETWORK,
      tokenMint: CRAFT_TOKEN_MINT.toBase58(),
      decimals: CRAFT_DECIMALS,
    };
  }
}

export const craftTokenService = new CraftTokenService();
