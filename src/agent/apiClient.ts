/**
 * Anthropic API Client with Rate Limiting
 * 
 * Provides a shared, rate-limited client for all agents to prevent
 * hitting API limits when multiple agents make simultaneous requests.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from '../config';

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
 */
export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
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
  } = {}
): Promise<string> {
  const {
    maxTokens = CONFIG.api.maxTokens,
    timeoutMs = CONFIG.api.timeoutMs,
    agentName = 'unknown'
  } = options;

  return apiRateLimiter.run(async () => {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`API request timeout after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    // Create API call promise
    const apiPromise = getAnthropicClient().messages.create({
      model: CONFIG.api.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    // Race between timeout and API call
    const response = await Promise.race([apiPromise, timeoutPromise]);

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    return content.text;
  });
}

/**
 * Parse JSON from Claude's response
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

  return JSON.parse(match[0]) as T;
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
  } = {}
): Promise<T> {
  const response = await callClaude(systemPrompt, userMessage, options);
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
