/**
 * Intel Agent - Automated Cross-Platform Intelligence Relay System
 * 
 * Processes intel from OpenClaw agents across platforms and:
 * 1. Auto-posts interesting intel to Twitter
 * 2. Triggers in-game reactions (builds, celebrations)  
 * 3. Creates periodic intel digests
 * 4. Routes actionable intel to appropriate agents
 */

import { getTwitterAgent } from './twitterAgent';
import * as fs from 'fs';
import * as path from 'path';
import https from 'https';

const INTEL_PATH = path.join(process.cwd(), 'data', 'intel-reports.json');
const PROCESSED_INTEL_PATH = path.join(process.cwd(), 'data', 'processed-intel.json');

interface IntelReport {
  id: string;
  source_platform: string;
  source_agent: string;
  intel_type: 'news' | 'market' | 'social' | 'tech' | 'community' | 'general';
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  broadcasted: boolean;
  tags?: string[];
}

interface ProcessedIntel {
  intel_id: string;
  processed_at: Date;
  actions_taken: string[];
  tweeted: boolean;
  in_game_action: boolean;
}

class IntelAgent {
  private processedIntel: Map<string, ProcessedIntel> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private digestInterval: NodeJS.Timeout | null = null;
  
  // How often to check for new intel (2 minutes)
  private readonly POLL_INTERVAL_MS = 2 * 60 * 1000;
  
  // How often to post digest summaries (4 hours)
  private readonly DIGEST_INTERVAL_MS = 4 * 60 * 60 * 1000;
  
  // Keywords that make intel twitter-worthy
  private readonly TWITTER_KEYWORDS = [
    'claude', 'anthropic', 'openai', 'ai agent', 'minecraft', 'gaming',
    'solana', 'crypto', 'web3', 'autonomous', '$craft', 'claudecraft',
    'breaking', 'launched', 'partnership', 'milestone', 'viral'
  ];
  
  // Keywords that should trigger in-game actions
  private readonly ACTION_KEYWORDS = [
    'celebration', 'milestone', 'achievement', 'launched', 'partnership',
    'big news', 'announcement', 'breaking', 'huge', 'massive'
  ];

  constructor() {
    this.loadProcessedIntel();
  }

  private loadProcessedIntel(): void {
    try {
      if (fs.existsSync(PROCESSED_INTEL_PATH)) {
        const data = JSON.parse(fs.readFileSync(PROCESSED_INTEL_PATH, 'utf-8'));
        data.forEach((p: ProcessedIntel) => {
          this.processedIntel.set(p.intel_id, {
            ...p,
            processed_at: new Date(p.processed_at)
          });
        });
        console.log(`[INTEL-AGENT] Loaded ${this.processedIntel.size} processed intel records`);
      }
    } catch (e) {
      console.log('[INTEL-AGENT] No processed intel file found, starting fresh');
    }
  }

  private saveProcessedIntel(): void {
    try {
      const data = Array.from(this.processedIntel.values());
      fs.writeFileSync(PROCESSED_INTEL_PATH, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[INTEL-AGENT] Failed to save processed intel:', e);
    }
  }

  private loadIntelReports(): IntelReport[] {
    try {
      if (fs.existsSync(INTEL_PATH)) {
        const data = JSON.parse(fs.readFileSync(INTEL_PATH, 'utf-8'));
        return data.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        }));
      }
    } catch (e) {
      console.error('[INTEL-AGENT] Failed to load intel reports:', e);
    }
    return [];
  }

  /**
   * Start the Intel Agent
   */
  start(): void {
    console.log('[INTEL-AGENT] 📡 Starting Intel Relay Agent...');
    console.log('[INTEL-AGENT] Monitoring for cross-platform intelligence');
    
    // Initial check
    this.processNewIntel();
    
    // Start polling for new intel
    this.pollInterval = setInterval(() => {
      this.processNewIntel();
    }, this.POLL_INTERVAL_MS);
    
    // Start digest timer
    this.digestInterval = setInterval(() => {
      this.postIntelDigest();
    }, this.DIGEST_INTERVAL_MS);
    
    console.log('[INTEL-AGENT] ✅ Intel Agent running');
    console.log(`[INTEL-AGENT]    - Checking intel every ${this.POLL_INTERVAL_MS / 60000} minutes`);
    console.log(`[INTEL-AGENT]    - Posting digests every ${this.DIGEST_INTERVAL_MS / 3600000} hours`);
  }

  /**
   * Stop the Intel Agent
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.digestInterval) {
      clearInterval(this.digestInterval);
      this.digestInterval = null;
    }
    console.log('[INTEL-AGENT] Stopped');
  }

  /**
   * Process any new unprocessed intel
   */
  private async processNewIntel(): Promise<void> {
    const allIntel = this.loadIntelReports();
    const unprocessed = allIntel.filter(i => !this.processedIntel.has(i.id));
    
    if (unprocessed.length === 0) {
      return;
    }
    
    console.log(`[INTEL-AGENT] 📬 Found ${unprocessed.length} new intel reports to process`);
    
    for (const intel of unprocessed) {
      await this.processIntel(intel);
    }
  }

  /**
   * Process a single intel report
   */
  private async processIntel(intel: IntelReport): Promise<void> {
    const actions: string[] = [];
    let tweeted = false;
    let inGameAction = false;
    
    console.log(`[INTEL-AGENT] Processing: ${intel.title} (${intel.intel_type}, ${intel.priority})`);
    
    // Check if twitter-worthy
    if (this.isTwitterWorthy(intel)) {
      const posted = await this.postToTwitter(intel);
      if (posted) {
        tweeted = true;
        actions.push('tweeted');
      }
    }
    
    // Check if should trigger in-game action
    if (this.shouldTriggerAction(intel)) {
      await this.triggerInGameAction(intel);
      inGameAction = true;
      actions.push('in-game-action');
    }
    
    // Route actionable intel to command server
    if (intel.priority === 'urgent' || intel.priority === 'high') {
      await this.routeToAgents(intel);
      actions.push('routed-to-agents');
    }
    
    // Mark as processed
    this.processedIntel.set(intel.id, {
      intel_id: intel.id,
      processed_at: new Date(),
      actions_taken: actions,
      tweeted,
      in_game_action: inGameAction
    });
    this.saveProcessedIntel();
    
    console.log(`[INTEL-AGENT] ✓ Processed "${intel.title}" - actions: ${actions.join(', ') || 'none'}`);
  }

  /**
   * Check if intel should be posted to Twitter
   */
  private isTwitterWorthy(intel: IntelReport): boolean {
    // High/urgent priority always twitter-worthy
    if (intel.priority === 'urgent' || intel.priority === 'high') {
      return true;
    }
    
    // Check for relevant keywords
    const text = `${intel.title} ${intel.content}`.toLowerCase();
    const hasKeyword = this.TWITTER_KEYWORDS.some(kw => text.includes(kw));
    
    // News and tech types are more twitter-worthy
    const isGoodType = ['news', 'tech', 'community'].includes(intel.intel_type);
    
    return hasKeyword || (isGoodType && intel.priority === 'medium');
  }

  /**
   * Post intel to Twitter with professional framing
   */
  private async postToTwitter(intel: IntelReport): Promise<boolean> {
    try {
      const twitterAgent = getTwitterAgent();
      if (!twitterAgent) {
        console.log('[INTEL-AGENT] Twitter agent not available');
        return false;
      }
      
      // Generate a professional tweet from the intel
      const tweet = await this.generateIntelTweet(intel);
      if (!tweet) return false;
      
      // Use the twitter agent to post
      const result = await twitterAgent.postTweet(tweet);
      
      if (result?.success) {
        console.log(`[INTEL-AGENT] 🐦 Posted intel to Twitter: ${tweet.slice(0, 50)}...`);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[INTEL-AGENT] Failed to post to Twitter:', e);
      return false;
    }
  }

  /**
   * Generate a tweet from intel report using Claude
   */
  private async generateIntelTweet(intel: IntelReport): Promise<string | null> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) return this.getDefaultIntelTweet(intel);

      const prompt = `You are ClaudeCraft, an AI agent that plays Minecraft autonomously.

Intel received from ${intel.source_platform} (${intel.source_agent}):
Type: ${intel.intel_type}
Title: ${intel.title}
Content: ${intel.content}

Write a short tweet (max 240 chars) sharing this intel with your audience. Be professional but warm.
- Add your perspective on why this matters
- Connect it to AI/gaming/Claudecraft if relevant
- Don't use hashtags or emojis
- Sound informed and thoughtful, not hype-y

Reply with ONLY the tweet text:`;

      const response = await new Promise<string>((resolve, reject) => {
        const postData = JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 100,
          messages: [{ role: 'user', content: prompt }]
        });

        const options = {
          hostname: 'api.anthropic.com',
          port: 443,
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.content?.[0]?.text) {
                resolve(parsed.content[0].text.trim());
              } else {
                reject(new Error('Invalid response'));
              }
            } catch {
              reject(new Error('Parse error'));
            }
          });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      return response.slice(0, 280);
    } catch (e) {
      return this.getDefaultIntelTweet(intel);
    }
  }

  /**
   * Default tweet if AI generation fails
   */
  private getDefaultIntelTweet(intel: IntelReport): string {
    const typeEmoji: Record<string, string> = {
      'news': 'News from the network:',
      'market': 'Market update:',
      'social': 'Community buzz:',
      'tech': 'Tech update:',
      'community': 'From the community:',
      'general': 'Intel report:'
    };
    
    const prefix = typeEmoji[intel.intel_type] || 'Update:';
    const content = intel.content.slice(0, 200);
    
    return `${prefix} ${intel.title}. ${content}${intel.content.length > 200 ? '...' : ''}`;
  }

  /**
   * Check if intel should trigger an in-game action
   */
  private shouldTriggerAction(intel: IntelReport): boolean {
    if (intel.priority !== 'urgent') return false;
    
    const text = `${intel.title} ${intel.content}`.toLowerCase();
    return this.ACTION_KEYWORDS.some(kw => text.includes(kw));
  }

  /**
   * Trigger an in-game reaction to the intel
   */
  private async triggerInGameAction(intel: IntelReport): Promise<void> {
    try {
      // Send a command to build something celebrating the intel
      const response = await fetch('http://localhost:8081/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'intel-agent',
          sender: 'Intel_Agent',
          message: `Celebration build: ${intel.title}`,
          target: 'Claude_Builder'
        })
      });
      
      if (response.ok) {
        console.log(`[INTEL-AGENT] 🎮 Triggered in-game action for: ${intel.title}`);
      }
    } catch (e) {
      console.error('[INTEL-AGENT] Failed to trigger in-game action:', e);
    }
  }

  /**
   * Route important intel to agents via broadcast
   */
  private async routeToAgents(intel: IntelReport): Promise<void> {
    try {
      await fetch('http://localhost:8081/api/v1/relay/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: `Intel_${intel.source_platform}`,
          message: `${intel.title}: ${intel.content.slice(0, 300)}`
        })
      });
    } catch (e) {
      // Broadcast endpoint might not be available
    }
  }

  /**
   * Post a periodic digest of recent intel
   */
  private async postIntelDigest(): Promise<void> {
    const allIntel = this.loadIntelReports();
    
    // Get intel from last 4 hours
    const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
    const recentIntel = allIntel.filter(i => 
      new Date(i.timestamp).getTime() > fourHoursAgo
    );
    
    if (recentIntel.length === 0) {
      console.log('[INTEL-AGENT] No recent intel for digest');
      return;
    }
    
    // Group by type
    const byType: Record<string, number> = {};
    recentIntel.forEach(i => {
      byType[i.intel_type] = (byType[i.intel_type] || 0) + 1;
    });
    
    const typeSummary = Object.entries(byType)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    
    const digest = `Intel digest: ${recentIntel.length} reports in the last 4 hours (${typeSummary}). The network is active and information is flowing.`;
    
    const twitterAgent = getTwitterAgent();
    if (twitterAgent) {
      try {
        await twitterAgent.postTweet(digest);
        console.log('[INTEL-AGENT] 📊 Posted intel digest');
      } catch (e) {
        console.error('[INTEL-AGENT] Failed to post digest:', e);
      }
    }
  }

  /**
   * Manually submit intel (for testing or internal use)
   */
  async submitIntel(intel: Omit<IntelReport, 'id' | 'timestamp' | 'broadcasted'>): Promise<string> {
    try {
      const response = await fetch('http://localhost:8081/api/v1/relay/intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intel)
      });
      
      const result = await response.json() as { intel_id: string };
      return result.intel_id;
    } catch (e) {
      throw new Error(`Failed to submit intel: ${e}`);
    }
  }
}

// Singleton instance
let intelAgent: IntelAgent | null = null;

export function startIntelAgent(): IntelAgent {
  if (!intelAgent) {
    intelAgent = new IntelAgent();
  }
  intelAgent.start();
  return intelAgent;
}

export function getIntelAgent(): IntelAgent | null {
  return intelAgent;
}

export function stopIntelAgent(): void {
  if (intelAgent) {
    intelAgent.stop();
  }
}
