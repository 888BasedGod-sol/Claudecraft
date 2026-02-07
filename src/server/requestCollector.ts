/**
 * Request Collector - Collects viewer requests and processes them periodically
 * 
 * Instead of immediately executing viewer commands, this system:
 * 1. Collects all incoming requests from Telegram/OpenClaw
 * 2. Every 3 hours, sends them to Claude for analysis
 * 3. Claude decides what agents should actually do
 * 4. Dispatches those decisions to the agents
 */

import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { logStreamer } from './logStreamer';
import { callClaude } from '../agent/apiClient';
import { generateId } from '../utils/helpers';
import { CONFIG } from '../config';

export interface ViewerRequest {
  id: string;
  sender: string;
  request: string;
  channel: string;
  timestamp: Date;
  processed: boolean;
  upvotes: number; // Track popularity
}

export interface AgentDirective {
  agentName: string;
  action: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
  basedOnRequests: string[]; // IDs of requests that influenced this
}

export interface ProcessingResult {
  timestamp: Date;
  requestsProcessed: number;
  directives: AgentDirective[];
  summary: string;
}

// Public interface for the request collector
export interface IRequestCollector {
  start(): void;
  stop(): void;
  addRequest(sender: string, request: string, channel?: string): ViewerRequest;
  upvoteRequest(requestId: string, sender: string): boolean;
  getPendingRequests(): ViewerRequest[];
  getTimeUntilNextProcessing(): { hours: number; minutes: number; seconds: number };
  onDirectives(callback: (directives: AgentDirective[]) => void): void;
  forceProcess(): Promise<ProcessingResult>;
  getStatus(): {
    pendingRequests: number;
    totalProcessed: number;
    lastProcessing: Date | null;
    nextProcessing: { hours: number; minutes: number; seconds: number };
    recentDirectives: AgentDirective[];
  };
}

class RequestCollector implements IRequestCollector {
  private requests: ViewerRequest[] = [];
  private processingHistory: ProcessingResult[] = [];
  private dataPath: string = path.join(process.cwd(), 'data', 'viewer-requests.json');
  private historyPath: string = path.join(process.cwd(), 'data', 'request-history.json');
  
  // Processing interval: 10 minutes in milliseconds (was 3 hours)
  private processingIntervalMs: number = 10 * 60 * 1000;
  private processingTimer: NodeJS.Timeout | null = null;
  
  // Callback for when directives are ready
  private directiveCallbacks: ((directives: AgentDirective[]) => void)[] = [];
  
  private isProcessing: boolean = false;
  private lastProcessingTime: Date | null = null;

  constructor() {
    this.loadRequests();
    this.loadHistory();
  }

  private loadRequests(): void {
    try {
      if (fs.existsSync(this.dataPath)) {
        const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf-8'));
        this.requests = data.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        }));
        console.log(`[REQUEST-COLLECTOR] Loaded ${this.requests.length} pending requests`);
      }
    } catch (e) {
      console.log('[REQUEST-COLLECTOR] No existing requests file, starting fresh');
    }
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(this.historyPath)) {
        const data = JSON.parse(fs.readFileSync(this.historyPath, 'utf-8'));
        this.processingHistory = data.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        }));
      }
    } catch (e) {
      // Ignore
    }
  }

  private async saveRequests(): Promise<void> {
    try {
      const dir = path.dirname(this.dataPath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(this.dataPath, JSON.stringify(this.requests, null, 2));
    } catch (e) {
      console.error('[REQUEST-COLLECTOR] Failed to save requests:', e);
    }
  }

  private async saveHistory(): Promise<void> {
    try {
      const dir = path.dirname(this.historyPath);
      await fsp.mkdir(dir, { recursive: true });
      // Keep only last 50 processing results
      const recentHistory = this.processingHistory.slice(-50);
      await fsp.writeFile(this.historyPath, JSON.stringify(recentHistory, null, 2));
    } catch (e) {
      console.error('[REQUEST-COLLECTOR] Failed to save history:', e);
    }
  }

  /**
   * Start the periodic processing timer
   */
  start(): void {
    console.log(`[REQUEST-COLLECTOR] 🗳️ Request collection system started`);
    console.log(`[REQUEST-COLLECTOR] Will process requests every 10 minutes`);
    
    // Start the timer
    this.processingTimer = setInterval(() => {
      this.processRequests();
    }, this.processingIntervalMs);

    // Log next processing time
    const nextProcess = new Date(Date.now() + this.processingIntervalMs);
    console.log(`[REQUEST-COLLECTOR] Next processing at: ${nextProcess.toLocaleTimeString()}`);

    // Broadcast to stream
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🗳️ Request collection active! Submit ideas via Twitter @claudecraftsol or Telegram. Next review: ${nextProcess.toLocaleTimeString()}`,
      botName: 'ClaudecraftBot'
    });
  }

  /**
   * Stop the periodic processing
   */
  stop(): void {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }
    this.saveRequests();
    console.log('[REQUEST-COLLECTOR] Stopped');
  }

  /**
   * Add a new viewer request
   */
  addRequest(sender: string, request: string, channel: string = 'telegram'): ViewerRequest {
    const viewerRequest: ViewerRequest = {
      id: generateId('req'),
      sender,
      request: request.trim(),
      channel,
      timestamp: new Date(),
      processed: false,
      upvotes: 1
    };

    this.requests.push(viewerRequest);
    this.saveRequests();

    const pendingCount = this.requests.filter(r => !r.processed).length;
    
    console.log(`[REQUEST-COLLECTOR] 📥 New request from ${sender}: "${request}" (${pendingCount} pending)`);
    
    // Broadcast to stream
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `📥 @${sender} requested: "${request}" (${pendingCount} in queue)`,
      botName: 'ClaudecraftBot'
    });

    return viewerRequest;
  }

  /**
   * Upvote a request (increases its priority)
   */
  upvoteRequest(requestId: string, sender: string): boolean {
    const request = this.requests.find(r => r.id === requestId);
    if (request && !request.processed) {
      request.upvotes++;
      this.saveRequests();
      console.log(`[REQUEST-COLLECTOR] ⬆️ Request upvoted by ${sender} (now ${request.upvotes} votes)`);
      return true;
    }
    return false;
  }

  /**
   * Get pending requests summary
   */
  getPendingRequests(): ViewerRequest[] {
    return this.requests.filter(r => !r.processed);
  }

  /**
   * Get time until next processing
   */
  getTimeUntilNextProcessing(): { hours: number; minutes: number; seconds: number } {
    if (!this.lastProcessingTime) {
      // First run - use start time
      const elapsed = Date.now() % this.processingIntervalMs;
      const remaining = this.processingIntervalMs - elapsed;
      return this.msToTime(remaining);
    }
    
    const nextProcessing = this.lastProcessingTime.getTime() + this.processingIntervalMs;
    const remaining = Math.max(0, nextProcessing - Date.now());
    return this.msToTime(remaining);
  }

  private msToTime(ms: number): { hours: number; minutes: number; seconds: number } {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return { hours, minutes, seconds };
  }

  /**
   * Register callback for when directives are ready
   */
  onDirectives(callback: (directives: AgentDirective[]) => void): void {
    this.directiveCallbacks.push(callback);
  }

  /**
   * Force immediate processing (for testing or admin commands)
   */
  async forceProcess(): Promise<ProcessingResult> {
    return this.processRequests();
  }

  /**
   * Main processing function - runs every 3 hours
   */
  private async processRequests(): Promise<ProcessingResult> {
    if (this.isProcessing) {
      console.log('[REQUEST-COLLECTOR] Already processing, skipping...');
      return {
        timestamp: new Date(),
        requestsProcessed: 0,
        directives: [],
        summary: 'Already processing'
      };
    }

    this.isProcessing = true;
    this.lastProcessingTime = new Date();

    const pendingRequests = this.requests.filter(r => !r.processed);
    
    console.log(`\n[REQUEST-COLLECTOR] 🧠 PROCESSING ${pendingRequests.length} REQUESTS`);
    console.log('[REQUEST-COLLECTOR] ='.repeat(50));

    // Broadcast to stream
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `🧠 ClaudecraftBot is reviewing ${pendingRequests.length} viewer requests...`,
      botName: 'ClaudecraftBot'
    });

    if (pendingRequests.length === 0) {
      console.log('[REQUEST-COLLECTOR] No pending requests to process');
      this.isProcessing = false;
      
      const result: ProcessingResult = {
        timestamp: new Date(),
        requestsProcessed: 0,
        directives: [],
        summary: 'No pending requests'
      };

      // Still notify callbacks with empty directives (agents can do their own thing)
      this.directiveCallbacks.forEach(cb => cb([]));
      
      return result;
    }

    try {
      // Build the prompt for Claude
      const directives = await this.analyzeRequestsWithClaude(pendingRequests);

      // Mark requests as processed
      pendingRequests.forEach(r => {
        r.processed = true;
      });

      // Prune old processed requests (keep last 200)
      const processedCount = this.requests.filter(r => r.processed).length;
      if (processedCount > 200) {
        this.requests = [
          ...this.requests.filter(r => !r.processed),
          ...this.requests.filter(r => r.processed).slice(-200)
        ];
      }
      this.saveRequests();

      // Create processing result
      const result: ProcessingResult = {
        timestamp: new Date(),
        requestsProcessed: pendingRequests.length,
        directives,
        summary: `Processed ${pendingRequests.length} requests, created ${directives.length} directives`
      };

      this.processingHistory.push(result);
      this.saveHistory();

      // Log directives
      console.log(`[REQUEST-COLLECTOR] ✅ Created ${directives.length} agent directives:`);
      directives.forEach(d => {
        console.log(`  - ${d.agentName}: ${d.action} (${d.priority})`);
      });

      // Broadcast summary to stream
      logStreamer.broadcast({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `✅ ClaudecraftBot decided: ${directives.map(d => `${d.agentName} will ${d.action}`).join(', ')}`,
        botName: 'ClaudecraftBot'
      });

      // Notify all callbacks
      this.directiveCallbacks.forEach(cb => cb(directives));

      this.isProcessing = false;
      return result;

    } catch (error) {
      console.error('[REQUEST-COLLECTOR] Error processing requests:', error);
      this.isProcessing = false;
      
      return {
        timestamp: new Date(),
        requestsProcessed: 0,
        directives: [],
        summary: `Error: ${error}`
      };
    }
  }

  /**
   * Use Claude to analyze requests and decide what agents should do
   */
  private async analyzeRequestsWithClaude(requests: ViewerRequest[]): Promise<AgentDirective[]> {
    // Sort by upvotes (most popular first)
    const sortedRequests = [...requests].sort((a, b) => b.upvotes - a.upvotes);

    // Format requests for the prompt
    const requestsSummary = sortedRequests.map((r, i) => 
      `${i + 1}. "${r.request}" by @${r.sender} (${r.upvotes} vote${r.upvotes > 1 ? 's' : ''}, ${this.formatTimeAgo(r.timestamp)})`
    ).join('\n');

    const prompt = `You are ClaudecraftBot, the director of 3 autonomous AI agents playing Minecraft.

YOUR AGENTS:
1. Claude_Explorer - Curious explorer, loves discovering resources, caves, and treasures. SURVIVAL MODE.
2. Claude_Builder - Creative architect, builds amazing structures. CREATIVE MODE (can build anything instantly).
3. ClaudeAdventurer - Adventurous spirit, social, takes risks. SURVIVAL MODE.

VIEWER REQUESTS (${requests.length} total, sorted by popularity):
${requestsSummary}

YOUR TASK:
Analyze these viewer requests and decide what each agent should focus on for the next 3 hours.
Consider:
- Popular requests (more upvotes) should get more attention
- Group similar requests together
- Balance between different activities (building, exploring, adventures)
- Claude_Builder is best for building requests
- Claude_Explorer is best for resource gathering and exploration
- ClaudeAdventurer is best for risky adventures and social activities

Respond with a JSON array of directives. Each directive should have:
- agentName: "Claude_Explorer" | "Claude_Builder" | "ClaudeAdventurer"
- action: A specific actionable goal (e.g., "Build a medieval castle with towers")
- description: Detailed description of what to do
- priority: "high" | "medium" | "low"
- reasoning: Why you chose this based on the requests
- basedOnRequests: Array of request numbers that influenced this (e.g., ["1", "3"])

Example response:
[
  {
    "agentName": "Claude_Builder",
    "action": "Build a golden pyramid with sphinx",
    "description": "Create an Egyptian-themed pyramid complex with a golden pyramid (at least 30 blocks tall), a sphinx statue guarding it, and decorated pathways",
    "priority": "high",
    "reasoning": "Most popular request - 5 people asked for pyramid-related builds",
    "basedOnRequests": ["1", "4", "7"]
  }
]

If there are no relevant requests for an agent, you can skip them or give them a general exploration/building goal.

RESPOND WITH ONLY THE JSON ARRAY, NO OTHER TEXT.`;

    const responseText = await callClaude(
      'You are ClaudecraftBot, the director of autonomous AI agents in Minecraft.',
      prompt,
      { maxTokens: 2000, agentName: 'ClaudecraftBot' }
    );

    try {
      // Extract JSON from response (handle potential markdown code blocks)
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }
      
      const directives: AgentDirective[] = JSON.parse(jsonStr);
      return directives;
    } catch (parseError) {
      console.error('[REQUEST-COLLECTOR] Failed to parse Claude response:', responseText);
      throw new Error('Failed to parse directives from Claude');
    }
  }

  private formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  /**
   * Get status for API
   */
  getStatus(): {
    pendingRequests: number;
    totalProcessed: number;
    lastProcessing: Date | null;
    nextProcessing: { hours: number; minutes: number; seconds: number };
    recentDirectives: AgentDirective[];
  } {
    const lastResult = this.processingHistory[this.processingHistory.length - 1];
    
    return {
      pendingRequests: this.requests.filter(r => !r.processed).length,
      totalProcessed: this.requests.filter(r => r.processed).length,
      lastProcessing: this.lastProcessingTime,
      nextProcessing: this.getTimeUntilNextProcessing(),
      recentDirectives: lastResult?.directives || []
    };
  }
}

// Export singleton
export const requestCollector = new RequestCollector();
