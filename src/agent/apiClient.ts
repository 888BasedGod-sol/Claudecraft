/**
 * Anthropic API Client with Rate Limiting, Prompt Caching, Retries & Token Tracking
 * 
 * Provides a shared, rate-limited client for all agents to prevent
 * hitting API limits when multiple agents make simultaneous requests.
 * 
 * Features:
 * - Prompt caching via cache_control (up to 90% cost savings on system prompts)
 * - Exponential backoff retry on 429/500/529 errors
 * - Token usage tracking with hourly aggregation
 * - Concurrency limiting (3 concurrent, 500ms interval)
 */

import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config';
import { sleep } from '../utils/helpers';

// ============ TOKEN USAGE TRACKING ============

interface TokenUsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  calls: number;
  errors: number;
  retries: number;
}

const tokenUsage: {
  hourly: Map<string, TokenUsageEntry>;
  total: TokenUsageEntry;
} = {
  hourly: new Map(),
  total: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, calls: 0, errors: 0, retries: 0 }
};

function trackTokenUsage(response: any, retryCount: number = 0): void {
  const usage = response?.usage;
  if (!usage) return;

  const hour = new Date().toISOString().slice(0, 13); // "2026-02-07T23"
  if (!tokenUsage.hourly.has(hour)) {
    tokenUsage.hourly.set(hour, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, calls: 0, errors: 0, retries: 0 });
    // Prune entries older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 13);
    for (const key of tokenUsage.hourly.keys()) {
      if (key < cutoff) tokenUsage.hourly.delete(key);
    }
  }
  
  const hourEntry = tokenUsage.hourly.get(hour)!;
  const input = usage.input_tokens || 0;
  const output = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;

  // Log first cache hit (indicates caching is working)
  if (cacheRead > 0 && tokenUsage.total.cacheReadTokens === 0) {
    console.log(`[API] 🎯 Prompt caching ACTIVE — First cache hit: ${cacheRead.toLocaleString()} tokens read from cache!`);
  }

  hourEntry.inputTokens += input;
  hourEntry.outputTokens += output;
  hourEntry.cacheReadTokens += cacheRead;
  hourEntry.cacheCreationTokens += cacheCreation;
  hourEntry.calls++;
  hourEntry.retries += retryCount;

  tokenUsage.total.inputTokens += input;
  tokenUsage.total.outputTokens += output;
  tokenUsage.total.cacheReadTokens += cacheRead;
  tokenUsage.total.cacheCreationTokens += cacheCreation;
  tokenUsage.total.calls++;
  tokenUsage.total.retries += retryCount;

  // Log cache hit ratio every 100 calls
  if (tokenUsage.total.calls % 100 === 0) {
    const totalInput = tokenUsage.total.inputTokens + tokenUsage.total.cacheReadTokens;
    const cacheHitRate = totalInput > 0
      ? ((tokenUsage.total.cacheReadTokens / totalInput) * 100).toFixed(1)
      : '0.0';
    const savings = tokenUsage.total.cacheReadTokens > 0
      ? `💰 ~$${((tokenUsage.total.cacheReadTokens * 0.9 * 3) / 1000000).toFixed(2)} saved`
      : '';
    console.log(`[API] 📊 Token stats — Total: ${tokenUsage.total.inputTokens.toLocaleString()} in / ${tokenUsage.total.outputTokens.toLocaleString()} out | Cache: ${cacheHitRate}% (${tokenUsage.total.cacheReadTokens.toLocaleString()} tokens) ${savings} | Calls: ${tokenUsage.total.calls}`);
  }
}

/**
 * Get token usage stats for monitoring
 */
export function getTokenUsageStats(): { hourly: Record<string, TokenUsageEntry>; total: TokenUsageEntry } {
  const hourly: Record<string, TokenUsageEntry> = {};
  for (const [k, v] of tokenUsage.hourly) hourly[k] = v;
  return { hourly, total: { ...tokenUsage.total } };
}

// Rate limiter implementation
class RateLimiter {
  private queue: Array<() => void> = [];
  private activeRequests: number = 0;
  private lastRequestTime: number = 0;
  private readonly maxConcurrent: number;
  private readonly minIntervalMs: number;

  constructor(maxConcurrent: number = 3, minIntervalMs: number = 500) {
    this.maxConcurrent = maxConcurrent;
    this.minIntervalMs = minIntervalMs;
  }

  async acquire(): Promise<void> {
    // Wait for rate limit interval
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minIntervalMs) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minIntervalMs - timeSinceLastRequest)
      );
    }

    // Wait for concurrent slot
    if (this.activeRequests >= this.maxConcurrent) {
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();
  }

  release(): void {
    this.activeRequests--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveRequests(): number {
    return this.activeRequests;
  }
}

// Singleton instances
let anthropicClient: Anthropic | null = null;
const apiRateLimiter = new RateLimiter(
  3,    // Max 3 concurrent requests
  500   // Min 500ms between requests (helps avoid rate limits)
);

/**
 * Get the shared Anthropic client (lazy initialization)
 * Includes beta header for prompt caching support
 */
export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultHeaders: {
        'anthropic-beta': 'prompt-caching-2024-07-31'
      }
    });
    console.log('[API] Initialized Anthropic client with prompt caching enabled');
  }
  return anthropicClient;
}

/**
 * Make a rate-limited API call to Claude
 * 
 * @param systemPrompt - The system prompt for the conversation
 * @param userMessage - The user message to send
 * @param options - Optional configuration
 * @returns The response text from Claude
 */
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  options: {
    maxTokens?: number;
    timeoutMs?: number;
    agentName?: string;
    enableCache?: boolean;
  } = {}
): Promise<string> {
  const {
    maxTokens = CONFIG.api.maxTokens,
    timeoutMs = CONFIG.api.timeoutMs,
    agentName = 'unknown',
    enableCache = true
  } = options;

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await apiRateLimiter.run(async () => {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error(`API request timeout after ${timeoutMs}ms`)),
            timeoutMs
          );
        });

        // Build system prompt with cache_control for prompt caching
        // System prompts > 1024 tokens benefit from caching (saves ~90% on cache hits)
        const systemConfig: any = enableCache && systemPrompt.length > 500
          ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
          : systemPrompt;

        // Create API call promise
        const apiPromise = getAnthropicClient().messages.create({
          model: CONFIG.api.model,
          max_tokens: maxTokens,
          system: systemConfig,
          messages: [{ role: 'user', content: userMessage }]
        });

        // Race between timeout and API call
        const response = await Promise.race([apiPromise, timeoutPromise]);

        // Track token usage
        trackTokenUsage(response, attempt);

        // Log if response was truncated (hit max_tokens)
        if (response.stop_reason === 'max_tokens') {
          console.log(`[API] ⚠️ ${agentName} response truncated (hit max_tokens=${maxTokens})`);
        }

        const content = response.content[0];
        if (content.type !== 'text') {
          throw new Error('Unexpected response type from Claude');
        }

        return content.text;
      });
    } catch (error: any) {
      lastError = error;
      const status = error?.status || error?.statusCode;
      const isRetryable = status === 429 || status === 500 || status === 529 || error?.message?.includes('timeout');

      if (isRetryable && attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[API] ⚠️ ${agentName} retry ${attempt + 1}/${MAX_RETRIES} after ${status || 'timeout'} (waiting ${delay}ms)`);
        tokenUsage.total.retries++;
        await sleep(delay);
        continue;
      }

      // Non-retryable or exhausted retries
      tokenUsage.total.errors++;
      const hourKey = new Date().toISOString().slice(0, 13);
      const hourEntry = tokenUsage.hourly.get(hourKey);
      if (hourEntry) hourEntry.errors++;

      throw error;
    }
  }

  throw lastError || new Error('callClaude failed after retries');
}

/**
 * Parse JSON from Claude's response, with aggressive repair for common AI output errors
 * 
 * @param response - The raw response text from Claude
 * @returns Parsed JSON object
 */
export function parseClaudeJson<T>(response: string): T {
  const text = response.trim();
  
  // Try parsing the entire response first (handles clean JSON)
  try {
    return JSON.parse(text) as T;
  } catch {
    // Fall through to extraction
  }

  // Strip markdown code blocks if present
  let cleaned = text;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Fall through
    }
  }

  // Try extracting JSON object or array
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  
  // Pick the match that starts earliest in the string
  const match = objectMatch && arrayMatch
    ? (text.indexOf(objectMatch[0]) <= text.indexOf(arrayMatch[0]) ? objectMatch : arrayMatch)
    : objectMatch || arrayMatch;

  if (!match) {
    throw new Error('No JSON found in Claude response');
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch (e) {
    // Aggressive JSON repair
    const repaired = repairJson(match[0]);
    try {
      return JSON.parse(repaired) as T;
    } catch {
      // If repair fails, throw original error with context
      throw e;
    }
  }
}

/**
 * Aggressively repair malformed JSON from Claude responses.
 * Common issues:
 * - Missing commas between properties/array elements
 * - Unescaped quotes inside strings  
 * - Truncated responses (missing closing brackets)
 * - Trailing commas before closing brackets
 */
function repairJson(json: string): string {
  let s = json;

  // Step 1: Fix missing commas between properties/elements
  // "value"\n  "key" — most common Claude error
  s = s.replace(/("(?:[^"\\]|\\.)*")\s*\n(\s*")/g, '$1,\n$2');
  
  // }\n  "key" — missing comma after closing brace
  s = s.replace(/(})\s*\n(\s*")/g, '$1,\n$2');
  
  // ]\n  "key" — missing comma after closing bracket
  s = s.replace(/(])\s*\n(\s*")/g, '$1,\n$2');
  
  // true/false/null/number then newline then "key"
  s = s.replace(/(true|false|null|\d+)\s*\n(\s*")/g, '$1,\n$2');
  
  // "value"\n  { — missing comma before object
  s = s.replace(/("(?:[^"\\]|\\.)*")\s*\n(\s*\{)/g, '$1,\n$2');
  
  // }\n  { — missing comma between objects
  s = s.replace(/(})\s*\n(\s*\{)/g, '$1,\n$2');
  
  // number\n  { or number\n  [
  s = s.replace(/(\d+)\s*\n(\s*[\{\[])/g, '$1,\n$2');

  // Step 2: Fix trailing commas before closing brackets
  s = s.replace(/,\s*([\]}])/g, '$1');
  
  // Step 3: Remove trailing incomplete key-value pairs (truncation artifacts)
  s = s.replace(/,\s*"[^"]*":\s*"[^"]*$/g, '');
  s = s.replace(/,\s*"[^"]*":\s*$/g, '');
  s = s.replace(/,\s*"[^"]*$/g, '');
  
  // Step 4: Close unclosed brackets/braces
  const openBraces = (s.match(/{/g) || []).length;
  const closeBraces = (s.match(/}/g) || []).length;
  const openBrackets = (s.match(/\[/g) || []).length;
  const closeBrackets = (s.match(/]/g) || []).length;
  
  s += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  s += '}'.repeat(Math.max(0, openBraces - closeBraces));
  
  return s;
}

/**
 * Make a rate-limited API call and parse the JSON response
 * 
 * @param systemPrompt - The system prompt for the conversation
 * @param userMessage - The user message to send
 * @param options - Optional configuration
 * @returns Parsed JSON response from Claude
 */
export async function callClaudeJson<T>(
  systemPrompt: string,
  userMessage: string,
  options: {
    maxTokens?: number;
    timeoutMs?: number;
    agentName?: string;
    enableCache?: boolean;
  } = {}
): Promise<T> {
  // Enable cache by default for JSON calls (system prompts are typically large)
  const response = await callClaude(systemPrompt, userMessage, {
    ...options,
    enableCache: options.enableCache !== false // Default to true
  });
  return parseClaudeJson<T>(response);
}

/**
 * Get rate limiter stats for monitoring
 */
export function getApiStats(): { queueLength: number; activeRequests: number } {
  return {
    queueLength: apiRateLimiter.getQueueLength(),
    activeRequests: apiRateLimiter.getActiveRequests()
  };
}
