/**
 * Shared Claude AI helper for social agents
 * Provides a simple interface for generating content via Claude API
 */

import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * Generate text content using Claude
 * Returns null on failure (caller should fall back to hardcoded content)
 */
export async function generateWithClaude(
  prompt: string,
  maxTokens: number = 300,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0];
    if (text.type === 'text') {
      return text.text.trim();
    }
    return null;
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
