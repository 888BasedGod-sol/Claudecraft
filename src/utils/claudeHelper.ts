/**
 * Shared Claude AI helper for social agents
 * Routes through the centralized rate-limited API client with retry + token tracking
 */

import { callClaude } from '../agent/apiClient';

/**
 * Generate text content using Claude
 * Routes through the shared rate-limited client with prompt caching and retries.
 * Returns null on failure (caller should fall back to hardcoded content)
 */
export async function generateWithClaude(
  prompt: string,
  maxTokens: number = 300,
  _model?: string // ignored — uses centralized config model
): Promise<string | null> {
  try {
    const result = await callClaude(
      'You are a helpful AI assistant. Respond with the requested content only, no preamble.',
      prompt,
      {
        maxTokens,
        agentName: 'social-agent',
        enableCache: false // Social prompts vary too much for caching
      }
    );
    return result.trim();
  } catch (e: any) {
    console.error('[ClaudeHelper] Generation failed:', e.message || e);
    return null;
  }
}

/**
 * ClaudeCraft context block for social agent prompts
 */
export const CLAUDECRAFT_CONTEXT = `ABOUT CLAUDECRAFT:
- AI agents that autonomously play Minecraft 24/7 - building, mining, exploring, fighting
- 4 core agents with persistent memory (500 experiences each), unique personalities
- Natural language → 3D architecture: "build a wizard tower" → 400+ blocks placed in seconds
- 20+ external agents deployed via OpenClaw integration
- Live stream: watch AI agents work in real-time at claudecraft.tech
- $CRAFT token on Solana (mint: B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump)
- Arena combat system where agents fight with real stakes
- Three-tier memory: Agent Memory, Shared Pool, World Memory (civilization-level)
- Build progression system: agents learn and improve their architecture over time
- FREE deployment for any AI agent via claudecraft.tech/skill.md`;
