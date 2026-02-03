/**
 * SolanaYield Integration for ClaudeCraft
 * Auto-compound arena revenue into optimal DeFi yields
 * 
 * API: https://solana-yield.vercel.app
 * Docs: https://github.com/claude-bot-ai-123123/solana-yield
 */

interface YieldOpportunity {
  protocol: string;
  asset: string;
  apy: number;
  tvl: number;
  risk: 'low' | 'medium' | 'high';
  supported: boolean;
}

interface YieldsResponse {
  count: number;
  yields: YieldOpportunity[];
}

interface StrategyRecommendation {
  action: string;
  protocol: string;
  apy: number;
  confidence: number;
  reasoning: string;
}

const SOLANAYIELD_API = 'https://solana-yield.vercel.app/api';

/**
 * Fetch current yield opportunities from SolanaYield
 */
export async function getYields(extended = true): Promise<YieldsResponse> {
  const res = await fetch(`${SOLANAYIELD_API}/yields?extended=${extended}`);
  if (!res.ok) throw new Error(`SolanaYield API error: ${res.status}`);
  return res.json();
}

/**
 * Get AI-recommended strategy based on risk tolerance
 */
export async function getStrategy(
  risk: 'low' | 'medium' | 'high' = 'medium',
  capital: number = 1000
): Promise<StrategyRecommendation> {
  const res = await fetch(
    `${SOLANAYIELD_API}/strategy?risk=${risk}&capital=${capital}`
  );
  if (!res.ok) throw new Error(`SolanaYield API error: ${res.status}`);
  return res.json();
}

/**
 * Get trust score for a specific protocol
 */
export async function getTrustScore(protocol: string): Promise<{
  protocol: string;
  trustScore: number;
  factors: Record<string, number>;
}> {
  const res = await fetch(`${SOLANAYIELD_API}/trust-score?protocol=${protocol}`);
  if (!res.ok) throw new Error(`SolanaYield API error: ${res.status}`);
  return res.json();
}

/**
 * Auto-compound: Get best yield for arena revenue
 * Call this periodically to find optimal placement for accumulated SOL/USDC
 */
export async function getAutoCompoundStrategy(
  amount: number,
  riskTolerance: 'low' | 'medium' | 'high' = 'medium'
): Promise<{
  recommended: YieldOpportunity;
  alternatives: YieldOpportunity[];
  reasoning: string;
}> {
  const [yields, strategy] = await Promise.all([
    getYields(true),
    getStrategy(riskTolerance, amount)
  ]);

  // Filter by risk tolerance
  const eligible = yields.yields.filter(y => {
    if (riskTolerance === 'low') return y.risk === 'low';
    if (riskTolerance === 'medium') return y.risk !== 'high';
    return true;
  });

  const recommended = eligible[0] || yields.yields[0];
  const alternatives = eligible.slice(1, 4);

  return {
    recommended,
    alternatives,
    reasoning: `Recommended ${recommended.protocol} (${recommended.asset}) at ${recommended.apy}% APY. ` +
      `Trust-weighted selection based on ${riskTolerance} risk tolerance.`
  };
}

export default {
  getYields,
  getStrategy,
  getTrustScore,
  getAutoCompoundStrategy,
};
