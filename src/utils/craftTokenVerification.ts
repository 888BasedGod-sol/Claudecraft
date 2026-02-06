/**
 * CRAFT Token Wallet Verification
 * 
 * Verifies that a wallet holds at least 1% of CRAFT supply
 * Required for agent deployment eligibility
 */

import { Connection, PublicKey } from '@solana/web3.js';

// CRAFT Token Configuration
const CRAFT_TOKEN_MINT = 'B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump';
const TOTAL_SUPPLY = 1_000_000_000; // 1 billion tokens
const REQUIRED_PERCENTAGE = 1; // 1% required
const REQUIRED_AMOUNT = (TOTAL_SUPPLY * REQUIRED_PERCENTAGE) / 100; // 10 million tokens

// Token decimals (pump.fun tokens typically have 6 decimals)
const TOKEN_DECIMALS = 6;
const REQUIRED_RAW_AMOUNT = REQUIRED_AMOUNT * Math.pow(10, TOKEN_DECIMALS);

// RPC Configuration - multiple endpoints for fallback
const RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.ankr.com/solana'
];

// Token Program ID
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export interface VerificationResult {
  eligible: boolean;
  walletAddress: string;
  tokenBalance: number;
  requiredBalance: number;
  percentageOwned: number;
  error?: string;
}

/**
 * Verify that a wallet holds at least 1% of CRAFT supply
 */
export async function verifyCraftHolding(walletAddress: string): Promise<VerificationResult> {
  // Validate wallet address first
  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(walletAddress);
  } catch {
    return {
      eligible: false,
      walletAddress,
      tokenBalance: 0,
      requiredBalance: REQUIRED_AMOUNT,
      percentageOwned: 0,
      error: 'Invalid wallet address format'
    };
  }

  const mintPubkey = new PublicKey(CRAFT_TOKEN_MINT);
  let lastError: string = '';

  // Try each RPC endpoint
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const rpcUrl = RPC_ENDPOINTS[i];
    try {
      console.log(`[CRAFT-VERIFY] Trying RPC ${i + 1}/${RPC_ENDPOINTS.length}: ${rpcUrl.slice(0, 40)}...`);
      const connection = new Connection(rpcUrl, 'confirmed');

      // Find the associated token account for this wallet
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubkey,
        { mint: mintPubkey }
      );

      let rawBalance = 0;
      
      if (tokenAccounts.value.length > 0) {
        // Sum up all token accounts (should typically be just one)
        for (const account of tokenAccounts.value) {
          const parsedInfo = account.account.data.parsed?.info;
          if (parsedInfo && parsedInfo.tokenAmount) {
            rawBalance += Number(parsedInfo.tokenAmount.amount);
          }
        }
      }

      const tokenBalance = rawBalance / Math.pow(10, TOKEN_DECIMALS);
      const percentageOwned = (tokenBalance / TOTAL_SUPPLY) * 100;
      const eligible = rawBalance >= REQUIRED_RAW_AMOUNT;

      console.log(`[CRAFT-VERIFY] Wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}: ${tokenBalance.toLocaleString()} CRAFT (${percentageOwned.toFixed(4)}%) - ${eligible ? 'ELIGIBLE ✓' : 'NOT ELIGIBLE ✗'}`);

      return {
        eligible,
        walletAddress,
        tokenBalance,
        requiredBalance: REQUIRED_AMOUNT,
        percentageOwned,
      };

    } catch (error: any) {
      lastError = error.message;
      console.error(`[CRAFT-VERIFY] RPC ${i + 1} failed: ${error.message}`);
      // Continue to next RPC
    }
  }

  // All RPCs failed
  console.error('[CRAFT-VERIFY] All RPC endpoints failed');
  return {
    eligible: false,
    walletAddress,
    tokenBalance: 0,
    requiredBalance: REQUIRED_AMOUNT,
    percentageOwned: 0,
    error: `All RPC endpoints failed. Last error: ${lastError}`
  };
}

/**
 * Quick check if a wallet is verified (cached)
 * For performance, we can cache verification results
 */
const verificationCache = new Map<string, { result: VerificationResult; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function verifyCraftHoldingCached(walletAddress: string): Promise<VerificationResult> {
  const cached = verificationCache.get(walletAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const result = await verifyCraftHolding(walletAddress);
  verificationCache.set(walletAddress, { result, timestamp: Date.now() });
  return result;
}

/**
 * Get verification requirements info
 */
export function getVerificationRequirements() {
  return {
    tokenMint: CRAFT_TOKEN_MINT,
    tokenName: 'CRAFT',
    totalSupply: TOTAL_SUPPLY,
    requiredPercentage: REQUIRED_PERCENTAGE,
    requiredAmount: REQUIRED_AMOUNT,
    description: `Hold at least ${REQUIRED_PERCENTAGE}% of CRAFT supply (${REQUIRED_AMOUNT.toLocaleString()} tokens) to deploy an agent`
  };
}
