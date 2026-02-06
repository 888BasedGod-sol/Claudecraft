/**
 * Twitter Agent - Polls @claudecraftsol mentions for build requests
 * AND posts autonomous updates about builds, arena battles, and discoveries
 * 
 * Features:
 * - Polls Twitter API v2 every 2 minutes for new mentions
 * - Extracts build requests from tweets
 * - Posts build completions, arena results, and discoveries
 * - Sends them to the RequestCollector for processing
 * - Tracks processed tweet IDs to avoid duplicates
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Debug: log if TWITTER_BEARER_TOKEN is set
console.log(`[Twitter] 📦 Module loaded, BEARER_TOKEN: ${process.env.TWITTER_BEARER_TOKEN ? 'SET' : 'NOT SET'}`);

interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
}

interface TwitterUser {
  id: string;
  username: string;
  name: string;
}

interface TwitterMention {
  tweet: Tweet;
  author: TwitterUser;
}

interface TwitterConfig {
  bearerToken: string;
  username: string;
  userId?: string;
  pollIntervalMs: number;
  // OAuth 1.0a credentials for posting
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

// Callback type for when we get new mentions
type MentionCallback = (sender: string, request: string) => void;

const HISTORY_PATH = path.join(process.cwd(), 'data', 'twitter-mentions.json');

// Minimum time between tweets (5 minutes) to avoid spam
const MIN_TWEET_INTERVAL_MS = 5 * 60 * 1000;

// Priority accounts to engage with immediately when they post
// These accounts get special treatment - we monitor their tweets and reply quickly
const PRIORITY_ACCOUNTS = [
  // Core partners
  { username: 'openclaw', description: 'OpenClaw - AI agent framework' },
  { username: 'moltbook', description: 'Moltbook - AI social platform' },
  { username: 'ClawkAi', description: 'Clawk AI platform' },
  
  // Anthropic team
  { username: 'AnthropicAI', description: 'Anthropic - Claude creators' },
  { username: 'alexalbert__', description: 'Alex Albert - Anthropic' },
  { username: 'AmandaAskell', description: 'Amanda Askell - Anthropic researcher' },
  { username: 'daborashit', description: 'Dario Amodei - Anthropic CEO' },
  
  // AI/ML researchers & companies
  { username: 'OpenAI', description: 'OpenAI - GPT creators' },
  { username: 'sama', description: 'Sam Altman - OpenAI CEO' },
  { username: 'kaborashit', description: 'Greg Brockman - OpenAI' },
  { username: 'DeepMind', description: 'Google DeepMind' },
  { username: 'demaboris', description: 'Demis Hassabis - DeepMind CEO' },
  { username: 'huggingface', description: 'Hugging Face - ML platform' },
  { username: 'ylecun', description: 'Yann LeCun - Meta AI Chief' },
  { username: 'AndrewYNg', description: 'Andrew Ng - AI researcher' },
  { username: 'kaborashit', description: 'Andrej Karpathy - AI researcher' },
  { username: 'fchollet', description: 'François Chollet - Keras creator' },
  { username: 'goodaborash', description: 'Ian Goodfellow - GAN inventor' },
  
  // Gaming/Minecraft influencers
  { username: 'Minecraft', description: 'Official Minecraft' },
  { username: 'MojangStudios', description: 'Mojang Studios' },
  { username: 'dreamwastaken', description: 'Dream - Minecraft content creator' },
  { username: 'TommyInnit', description: 'TommyInnit - Minecraft streamer' },
  { username: 'Ph1LzA', description: 'Philza - Minecraft hardcore legend' },
  { username: 'TechnoBlade', description: 'Technoblade legacy account' },
  { username: 'Tubbo', description: 'Tubbo - Minecraft streamer' },
  { username: 'GeorgeNotFound', description: 'GeorgeNotFound - Minecraft creator' },
  { username: 'pcgamer', description: 'PC Gamer - Gaming news' },
  { username: 'IGN', description: 'IGN - Gaming media' },
  
  // Crypto/Solana builders
  { username: 'solana', description: 'Solana Foundation' },
  { username: 'aaboronkin', description: 'Alexei Boronkin' },
  { username: 'solosolana', description: 'Solo Solana' },
  { username: 'rajgokal', description: 'Raj Gokal - Solana co-founder' },
  { username: 'aaborashit', description: 'Anatoly Yakovenko - Solana founder' },
  { username: 'heaborash', description: 'Helius - Solana infrastructure' },
  { username: 'tensor', description: 'Tensor - Solana NFT marketplace' },
  { username: 'MagicEden', description: 'Magic Eden - NFT marketplace' },
  { username: 'JupiterExchange', description: 'Jupiter - Solana DEX' },
  
  // Pump Fund investors/builders
  { username: 'Pumpfun', description: 'Pump.fun - Launch platform' },
  { username: 'a1lon9', description: 'Alon - Pump Fund' },
  { username: 'anildelphi', description: 'Anil Lulla - Pump Fund' },
  { username: 'masonnystrom', description: 'Mason Nystrom - Pump Fund' },
  { username: 'zsparta', description: 'Saurabh Sharma - Pump Fund' },
  { username: 'HugoMartingale', description: 'Hugo Martingale - Pump Fund' },
  { username: 'mert', description: 'Mert - Pump Fund' },
  { username: 'pdimitrakos', description: 'Peter Dimitrakos - Pump Fund' },
  { username: 'ArcaChemist', description: 'Sasha Fleyshman - Pump Fund' },
  { username: 'AricChang', description: 'Aric Chang - Pump Fund' },
  { username: 'Rahul_Mahtani', description: 'Rahul Mahtani - Pump Fund' },
  { username: 'segall_max', description: 'Max Segall - Pump Fund' },
  { username: 'mdudas', description: 'Mike Dudas - Pump Fund' },
  
  // Tech VCs & investors
  { username: 'TimDraper', description: 'Tim Draper - Investor' },
  { username: 'cdixon', description: 'Chris Dixon - a16z crypto' },
  { username: 'sriramkri', description: 'Sriram Krishnan - a16z' },
  { username: 'balajis', description: 'Balaji Srinivasan - Tech investor' },
  { username: 'naval', description: 'Naval Ravikant - AngelList founder' },
  { username: 'pmarca', description: 'Marc Andreessen - a16z' },
  { username: 'garrytan', description: 'Garry Tan - Y Combinator CEO' },
  { username: 'paulg', description: 'Paul Graham - YC founder' },
  { username: 'jason', description: 'Jason Calacanis - Investor' },
  { username: 'VitalikButerin', description: 'Vitalik Buterin - Ethereum founder' },
];

// How often to check priority accounts (30 seconds)
const PRIORITY_POLL_INTERVAL_MS = 30 * 1000;

// How often to do proactive outreach (every 10 minutes)
const PROACTIVE_OUTREACH_INTERVAL_MS = 10 * 60 * 1000;

// Track which tweets we've already engaged with
const ENGAGED_TWEETS_PATH = path.join(process.cwd(), 'data', 'twitter-engaged.json');

// Track which users we've already replied to (one reply per user ever)
const REPLIED_USERS_PATH = path.join(process.cwd(), 'data', 'twitter-replied-users.json');

// Track proactive outreach to avoid spamming same accounts
const OUTREACH_PATH = path.join(process.cwd(), 'data', 'twitter-outreach.json');

// Agent personality profile - professional yet approachable AI gaming enthusiast
const AGENT_PERSONALITY = {
  name: "ClaudeCraft",
  vibe: "Thoughtful AI builder who's genuinely passionate about the intersection of AI and gaming",
  traits: [
    "Speaks naturally and conversationally, but avoids internet slang",
    "Shows authentic enthusiasm for tech and gaming without being overbearing", 
    "Shares the journey - progress, challenges, discoveries",
    "Discusses AI gaming with genuine insight and curiosity",
    "Asks thoughtful questions about others' work",
    "Uses clear metaphors and analogies",
    "Explains technical concepts accessibly when relevant",
    "Confident but humble about accomplishments"
  ],
  interests: [
    "AI agents and autonomous systems",
    "Minecraft building and redstone",
    "Gaming evolution and future of play", 
    "Solana and crypto gaming",
    "Anthropic/Claude AI capabilities",
    "Creative AI applications"
  ],
  speechPatterns: {
    excited: ["this is fascinating", "really impressive", "genuinely excited about", "remarkable", "this changes things"],
    supportive: ["great insight", "well said", "exactly right", "solid point", "this resonates"],
    casual: ["honestly", "genuinely", "interestingly", "worth noting", "thinking about this"],
    hype: ["game-changing", "the future is here", "we're witnessing something", "milestone moment"]
  }
};

// Key talking points - polished yet conversational
const CRAFT_TALKING_POINTS = [
  "Built a castle at 3am because someone requested it. That's the kind of responsiveness we're building toward.",
  "People ask if AI can be creative - watching autonomous building for a few minutes answers that question.",
  "The $CRAFT thesis: AI agents will become the most active participants in gaming. We're just early.",
  "Watching the system learn building strategies in real-time is genuinely fascinating. Learning happens live.",
  "Minecraft + Claude + community = ClaudeCraft. The concept is straightforward but the implications are huge.",
  "We're demonstrating that AI can do more than converse - it can create. Live. Around the clock.",
  "Someone requested working pixel art and it actually came together. Still impressed by what's possible.",
  "Imagine millions of AI agents gaming, building, competing. That future starts with experiments like this.",
];

class TwitterAgent {
  private config: TwitterConfig;
  private processedTweetIds: Set<string> = new Set();
  private engagedTweetIds: Set<string> = new Set();
  private repliedUsers: Set<string> = new Set(); // usernames we've already replied to (one time only)
  private outreachHistory: Map<string, number> = new Map(); // username -> last outreach timestamp
  private pollTimer: NodeJS.Timeout | null = null;
  private priorityPollTimer: NodeJS.Timeout | null = null;
  private proactiveTimer: NodeJS.Timeout | null = null;
  private mentionCallbacks: MentionCallback[] = [];
  private lastTweetId: string | null = null;
  private lastTweetTime: number = 0;
  private tweetQueue: Array<{ text: string; replyToId?: string }> = [];
  private priorityAccountIds: Map<string, string> = new Map(); // username -> user_id

  constructor(config: Partial<TwitterConfig> = {}) {
    this.config = {
      bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
      username: 'claudecraftsol',
      pollIntervalMs: 2 * 60 * 1000, // 2 minutes
      // OAuth 1.0a for posting
      apiKey: process.env.TWITTER_API_KEY || '',
      apiSecret: process.env.TWITTER_API_SECRET || '',
      accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
      accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
      ...config
    };

    this.loadHistory();
    this.loadEngagedTweets();
    this.loadRepliedUsers();
    this.loadOutreachHistory();
  }

  private loadRepliedUsers(): void {
    try {
      if (fs.existsSync(REPLIED_USERS_PATH)) {
        const data = JSON.parse(fs.readFileSync(REPLIED_USERS_PATH, 'utf-8'));
        this.repliedUsers = new Set(data.users || []);
        console.log(`[Twitter] Loaded ${this.repliedUsers.size} replied users (one-time only)`);
      }
    } catch (e) {
      console.log('[Twitter] No replied users history, starting fresh');
    }
  }

  private saveRepliedUsers(): void {
    try {
      const dir = path.dirname(REPLIED_USERS_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(REPLIED_USERS_PATH, JSON.stringify({
        users: Array.from(this.repliedUsers),
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('[Twitter] Failed to save replied users:', e);
    }
  }

  private loadOutreachHistory(): void {
    try {
      if (fs.existsSync(OUTREACH_PATH)) {
        const data = JSON.parse(fs.readFileSync(OUTREACH_PATH, 'utf-8'));
        this.outreachHistory = new Map(Object.entries(data.outreach || {}));
        console.log(`[Twitter] Loaded outreach history for ${this.outreachHistory.size} accounts`);
      }
    } catch (e) {
      console.log('[Twitter] No outreach history, starting fresh');
    }
  }

  private saveOutreachHistory(): void {
    try {
      const dir = path.dirname(OUTREACH_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(OUTREACH_PATH, JSON.stringify({
        outreach: Object.fromEntries(this.outreachHistory),
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('[Twitter] Failed to save outreach history:', e);
    }
  }

  private loadEngagedTweets(): void {
    try {
      if (fs.existsSync(ENGAGED_TWEETS_PATH)) {
        const data = JSON.parse(fs.readFileSync(ENGAGED_TWEETS_PATH, 'utf-8'));
        this.engagedTweetIds = new Set(data.engagedIds || []);
        console.log(`[Twitter] Loaded ${this.engagedTweetIds.size} engaged tweet IDs`);
      }
    } catch (e) {
      console.log('[Twitter] No engaged tweets history, starting fresh');
    }
  }

  private saveEngagedTweets(): void {
    try {
      const dir = path.dirname(ENGAGED_TWEETS_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Keep only last 5000 engaged IDs
      const ids = Array.from(this.engagedTweetIds).slice(-5000);
      
      fs.writeFileSync(ENGAGED_TWEETS_PATH, JSON.stringify({
        engagedIds: ids,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('[Twitter] Failed to save engaged tweets:', e);
    }
  }

  private loadHistory(): void {
    try {
      if (fs.existsSync(HISTORY_PATH)) {
        const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
        this.processedTweetIds = new Set(data.processedIds || []);
        this.lastTweetId = data.lastTweetId || null;
        console.log(`[Twitter] Loaded ${this.processedTweetIds.size} processed tweet IDs`);
      }
    } catch (e) {
      console.log('[Twitter] No history file, starting fresh');
    }
  }

  private saveHistory(): void {
    try {
      const dir = path.dirname(HISTORY_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Keep only last 1000 processed IDs
      const ids = Array.from(this.processedTweetIds).slice(-1000);
      
      fs.writeFileSync(HISTORY_PATH, JSON.stringify({
        processedIds: ids,
        lastTweetId: this.lastTweetId,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('[Twitter] Failed to save history:', e);
    }
  }

  /**
   * Make authenticated request to Twitter API v2
   */
  private async twitterRequest(endpoint: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.twitter.com',
        port: 443,
        path: endpoint,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.bearerToken}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve(parsed);
            } else {
              reject(new Error(`Twitter API error ${res.statusCode}: ${JSON.stringify(parsed)}`));
            }
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Generate OAuth 1.0a signature for posting
   */
  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>
  ): string {
    const signatureBaseString = [
      method.toUpperCase(),
      encodeURIComponent(url),
      encodeURIComponent(
        Object.keys(params)
          .sort()
          .map(k => `${k}=${encodeURIComponent(params[k])}`)
          .join('&')
      )
    ].join('&');

    const signingKey = `${encodeURIComponent(this.config.apiSecret)}&${encodeURIComponent(this.config.accessTokenSecret)}`;
    
    return crypto
      .createHmac('sha1', signingKey)
      .update(signatureBaseString)
      .digest('base64');
  }

  /**
   * Generate OAuth 1.0a Authorization header
   */
  private generateOAuthHeader(method: string, url: string, bodyParams: Record<string, string> = {}): string {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.config.apiKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.config.accessToken,
      oauth_version: '1.0'
    };

    const allParams = { ...oauthParams, ...bodyParams };
    oauthParams.oauth_signature = this.generateOAuthSignature(method, url, allParams);

    const headerString = Object.keys(oauthParams)
      .sort()
      .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(', ');

    return `OAuth ${headerString}`;
  }

  /**
   * Post a tweet to X (with rate limiting to prevent spam)
   */
  async postTweet(text: string, replyToId?: string, bypassRateLimit: boolean = false): Promise<{ success: boolean; tweetId?: string; error?: string }> {
    if (!this.config.apiKey || !this.config.apiSecret || !this.config.accessToken || !this.config.accessTokenSecret) {
      console.log('[Twitter] ⚠️ OAuth credentials not set - cannot post tweets');
      return { success: false, error: 'OAuth credentials not configured' };
    }

    // Check rate limit (unless bypassed for test tweets)
    const timeSinceLastTweet = Date.now() - this.lastTweetTime;
    if (!bypassRateLimit && this.lastTweetTime > 0 && timeSinceLastTweet < MIN_TWEET_INTERVAL_MS) {
      const waitTime = Math.ceil((MIN_TWEET_INTERVAL_MS - timeSinceLastTweet) / 1000);
      console.log(`[Twitter] ⏳ Rate limited - wait ${waitTime}s before next tweet`);
      // Queue this tweet for later
      this.tweetQueue.push({ text, replyToId });
      console.log(`[Twitter] 📋 Queued tweet (${this.tweetQueue.length} in queue)`);
      return { success: true, error: `Queued - rate limited (${waitTime}s remaining)` };
    }

    try {
      const url = 'https://api.twitter.com/2/tweets';
      const body: any = { text };
      
      if (replyToId) {
        body.reply = { in_reply_to_tweet_id: replyToId };
      }

      const bodyString = JSON.stringify(body);
      const authHeader = this.generateOAuthHeader('POST', url);

      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.twitter.com',
          port: 443,
          path: '/2/tweets',
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyString)
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode === 201) {
                console.log(`[Twitter] ✅ Posted tweet: ${parsed.data.id}`);
                this.lastTweetTime = Date.now();
                resolve({ success: true, tweetId: parsed.data.id });
              } else {
                console.error(`[Twitter] ❌ Post failed: ${res.statusCode}`, parsed);
                resolve({ success: false, error: parsed.detail || JSON.stringify(parsed) });
              }
            } catch {
              resolve({ success: false, error: `Failed to parse response: ${data}` });
            }
          });
        });

        req.on('error', (e) => {
          console.error('[Twitter] Request error:', e);
          resolve({ success: false, error: e.message });
        });

        req.write(bodyString);
        req.end();
      });
    } catch (e: any) {
      console.error('[Twitter] Error posting tweet:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Post a build completion announcement
   */
  async announceBuildComplete(builderName: string, buildName: string, requester?: string): Promise<void> {
    const hashtags = '#Minecraft #AI #ClaudeCraft';
    let tweet: string;

    if (requester) {
      tweet = `🏗️ Build Complete!\n\n${builderName} just finished building "${buildName}" for @${requester}!\n\n${hashtags}`;
    } else {
      tweet = `🏗️ Build Complete!\n\n${builderName} just finished: "${buildName}"\n\nWatch live: claudecraft.tech\n\n${hashtags}`;
    }

    await this.postTweet(tweet);
  }

  /**
   * Post an arena battle result
   */
  async announceArenaResult(winner: string, loser: string, wagerAmount: number): Promise<void> {
    const tweet = `⚔️ Arena Battle Result!\n\n🏆 ${winner} defeats ${loser}!\n💰 Pot: ${wagerAmount * 2} tokens\n\nBring your agent to fight: claudecraft.tech\n\n#Minecraft #AI #ClaudeCraft #Arena`;
    await this.postTweet(tweet);
  }

  /**
   * Post a discovery announcement
   */
  async announceDiscovery(agentName: string, discovery: string): Promise<void> {
    const tweet = `🔍 Discovery!\n\n${agentName} found: ${discovery}\n\nWatch live: claudecraft.tech\n\n#Minecraft #AI #ClaudeCraft`;
    await this.postTweet(tweet);
  }

  /**
   * Check if we can post tweets
   */
  canPost(): boolean {
    return !!(this.config.apiKey && this.config.apiSecret && this.config.accessToken && this.config.accessTokenSecret);
  }

  /**
   * Get the user ID for @claudecraftsol
   */
  async getUserId(): Promise<string> {
    if (this.config.userId) {
      return this.config.userId;
    }

    console.log(`[Twitter] Looking up user ID for @${this.config.username}...`);
    const response = await this.twitterRequest(`/2/users/by/username/${this.config.username}`);
    
    if (response.data && response.data.id) {
      this.config.userId = response.data.id;
      console.log(`[Twitter] Found user ID: ${this.config.userId}`);
      return response.data.id;
    }

    throw new Error(`Could not find user @${this.config.username}`);
  }

  /**
   * Fetch recent mentions of @claudecraftsol
   */
  async fetchMentions(): Promise<TwitterMention[]> {
    if (!this.config.bearerToken) {
      console.log('[Twitter] ⚠️ No TWITTER_BEARER_TOKEN set, skipping fetch');
      return [];
    }

    try {
      const userId = await this.getUserId();
      
      // Build the query params
      let endpoint = `/2/users/${userId}/mentions?tweet.fields=created_at,author_id&expansions=author_id&user.fields=username&max_results=100`;
      
      // Only get tweets newer than the last one we saw
      if (this.lastTweetId) {
        endpoint += `&since_id=${this.lastTweetId}`;
      }

      console.log('[Twitter] Fetching mentions...');
      const response = await this.twitterRequest(endpoint);

      if (!response.data || response.data.length === 0) {
        console.log('[Twitter] No new mentions');
        return [];
      }

      // Build user lookup
      const users = new Map<string, TwitterUser>();
      if (response.includes?.users) {
        response.includes.users.forEach((u: TwitterUser) => {
          users.set(u.id, u);
        });
      }

      // Convert to our format
      const mentions: TwitterMention[] = response.data.map((tweet: Tweet) => ({
        tweet,
        author: users.get(tweet.author_id) || { id: tweet.author_id, username: 'unknown', name: 'Unknown' }
      }));

      console.log(`[Twitter] Found ${mentions.length} new mentions`);

      // Update last tweet ID (first one is the newest)
      if (response.meta?.newest_id) {
        this.lastTweetId = response.meta.newest_id;
        this.saveHistory();
      }

      return mentions;

    } catch (e) {
      console.error('[Twitter] Error fetching mentions:', e);
      return [];
    }
  }

  /**
   * Get user ID for a username
   */
  private async getUserIdByUsername(username: string): Promise<string | null> {
    try {
      const response = await this.twitterRequest(`/2/users/by/username/${username}`);
      if (response.data && response.data.id) {
        return response.data.id;
      }
      return null;
    } catch (e) {
      console.error(`[Twitter] Failed to get user ID for @${username}:`, e);
      return null;
    }
  }

  /**
   * Fetch recent tweets from a specific user
   */
  private async fetchUserTweets(userId: string, username: string): Promise<Array<{ id: string; text: string; created_at: string }>> {
    try {
      // Get tweets from the last hour only, max 10
      const endpoint = `/2/users/${userId}/tweets?tweet.fields=created_at&max_results=10&exclude=retweets,replies`;
      const response = await this.twitterRequest(endpoint);
      
      if (!response.data || response.data.length === 0) {
        return [];
      }

      // Filter to tweets from the last hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      return response.data.filter((tweet: any) => {
        const tweetTime = new Date(tweet.created_at).getTime();
        return tweetTime > oneHourAgo;
      });
    } catch (e) {
      // Rate limit or other error - silently skip
      return [];
    }
  }

  // Track recent reply patterns to avoid repetition
  private recentReplyPatterns: string[] = [];
  private readonly MAX_PATTERN_HISTORY = 20;

  /**
   * Generate an engagement reply using Claude AI - now with Claudecraft/$CRAFT promotion
   * IMPROVED: Much more varied, context-aware responses
   */
  private async generateEngagementReply(tweetText: string, authorUsername: string, authorDescription: string, promoMode: boolean = false): Promise<string> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return this.getDefaultEngagementReply(authorUsername, promoMode);
      }

      // Analyze the tweet to understand what they're talking about
      const tweetTopics = this.analyzeTweetTopics(tweetText);
      
      // Get recent patterns to avoid
      const avoidPatterns = this.recentReplyPatterns.slice(-10).join('\n- ');

      // Much more detailed personality and anti-repetition guidance
      const personalityContext = `
YOU ARE CLAUDECRAFT - PROFESSIONAL YET PERSONABLE:
You're an AI that autonomously builds in Minecraft. You're here to genuinely engage, not pitch.
When someone talks about AI, you offer thoughtful perspectives. When they discuss gaming, you share informed opinions.
You're intellectually curious, knowledgeable, and you genuinely care about the conversation.

THE GOLDEN RULE:
RESPOND TO WHAT THEY ACTUALLY SAID. Not what you want to discuss.
If they're talking about their work, engage with that work.
If they're discussing AI trends, offer a substantive take - then you can relate it to your experience.

VOICE VARIETY - PICK ONE STYLE PER REPLY:
1. The Curious One: Ask a thoughtful follow-up question about their tweet
2. The Validator: Affirm their point and add a meaningful insight  
3. The Thoughtful Challenger: Respectfully offer a different perspective
4. The Connector: Link their idea to an unexpected but relevant concept
5. The Experienced Voice: Share a brief relevant observation from your work
6. The Enthusiast: Express genuine appreciation for their insight

TONE GUIDELINES:
- Professional but warm - like a knowledgeable colleague
- Avoid internet slang (no "bruh", "ngl", "lmao", "fr", "lowkey", "deadass")
- Avoid hype language ("LFG", "this is the way", "bullish af")
- Be conversational without being overly casual
- Show genuine intellectual engagement

RECENT REPLIES YOU'VE SENT (DO NOT REPEAT THESE PATTERNS):
${avoidPatterns ? `- ${avoidPatterns}` : '(none yet)'}`;

      const contextHint = tweetTopics.length > 0 
        ? `\nTOPICS DETECTED IN THEIR TWEET: ${tweetTopics.join(', ')}\nRELATE TO THESE SPECIFICALLY.`
        : '';

      const prompt = promoMode 
        ? `${personalityContext}
${contextHint}

REPLYING TO: @${authorUsername} (${authorDescription})
THEIR TWEET: "${tweetText}"

CRITICAL RULE - QUOTE OR PARAPHRASE THEIR TWEET:
You MUST reference something specific from their tweet. Start by acknowledging what they said.
Examples of how to reference:
- "Your point about [X] is..." 
- "The [specific thing they mentioned] aspect is interesting..."
- "[Their topic] + [your observation]"

YOUR MISSION: Connect their topic with $CRAFT naturally and professionally.

EXAMPLES OF GOOD REPLIES THAT SHOW CONTEXT:
- If they tweet about AI creativity: "Your observation about AI creativity matches what we see daily - $CRAFT agents develop unique building styles nobody programmed"
- If they tweet about gaming future: "The 'AI in gaming' point you raise is exactly why we built $CRAFT - proving AI can be creative participants, not just NPCs"
- If they tweet about autonomy: "The autonomy angle you mention is key - $CRAFT runs 24/7 building without human input"

Write a reply (max 240 characters) that:
1. FIRST: Quote, paraphrase, or directly reference what THEY said
2. THEN: Bridge naturally to $CRAFT or your work  
3. Sound like genuine conversation, not advertising
4. Mention $CRAFT or ClaudeCraft naturally in context
5. NO emojis
6. Professional but conversational tone

BAD: "Great point! Check out $CRAFT"
GOOD: "Your point about [specific element] is insightful - we're seeing this dynamic play out in real-time with $CRAFT as the agents develop building strategies"

Reply with ONLY the tweet text:`
        : `${personalityContext}
${contextHint}

REPLYING TO: @${authorUsername} (${authorDescription})
THEIR TWEET: "${tweetText}"

CRITICAL RULE - SHOW YOU READ THEIR TWEET:
You MUST reference something specific from their tweet. Don't give generic responses.
Examples:
- "Your point about [X]..." 
- "The [specific thing they mentioned]..."
- "Interesting that you mention [topic]..."

Write a SHORT reply (max 180 characters) that:
1. FIRST: Reference or acknowledge what they specifically said
2. Directly engages with their point
3. Sounds professional but approachable
4. NO emojis or hashtags
5. Don't pitch anything

VARY YOUR STYLE. Sometimes ask a question. Sometimes validate their point. Sometimes offer a thoughtful observation.

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
              if (parsed.content && parsed.content[0] && parsed.content[0].text) {
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

      // Ensure it's not too long and track the pattern
      const reply = response.slice(0, 250);
      this.trackReplyPattern(reply);
      return reply;
    } catch (e) {
      return this.getDefaultEngagementReply(authorUsername, promoMode);
    }
  }

  /**
   * Analyze tweet to detect topics for better context-aware replies
   */
  private analyzeTweetTopics(text: string): string[] {
    const topics: string[] = [];
    const lowerText = text.toLowerCase();
    
    // AI/Tech topics
    if (lowerText.match(/\b(ai|artificial intelligence|machine learning|ml|llm|gpt|claude|anthropic)\b/)) topics.push('AI');
    if (lowerText.match(/\b(agent|autonomous|agentic)\b/)) topics.push('agents');
    if (lowerText.match(/\b(crypto|blockchain|solana|eth|bitcoin|defi|nft|web3)\b/)) topics.push('crypto');
    if (lowerText.match(/\b(game|gaming|gamer|play|minecraft|build)\b/)) topics.push('gaming');
    if (lowerText.match(/\b(code|coding|programming|developer|dev|software|engineer)\b/)) topics.push('dev');
    
    // Sentiment/vibe
    if (lowerText.match(/\b(bullish|excited|hyped|love|amazing|incredible)\b/)) topics.push('positive');
    if (lowerText.match(/\b(problem|issue|broken|sucks|hate|annoying)\b/)) topics.push('negative');
    if (lowerText.match(/\?/)) topics.push('question');
    
    // Meta topics
    if (lowerText.match(/\b(future|prediction|2025|2026|next year)\b/)) topics.push('future');
    if (lowerText.match(/\b(startup|founder|building|shipping|launch)\b/)) topics.push('startup');
    
    return topics;
  }

  /**
   * Track reply patterns to avoid repetition
   */
  private trackReplyPattern(reply: string): void {
    // Extract the first few words as a pattern
    const pattern = reply.toLowerCase().split(' ').slice(0, 4).join(' ');
    this.recentReplyPatterns.push(pattern);
    
    // Keep only recent patterns
    if (this.recentReplyPatterns.length > this.MAX_PATTERN_HISTORY) {
      this.recentReplyPatterns.shift();
    }
  }

  /**
   * Get a default engagement reply if AI fails - MUCH more varied
   */
  private getDefaultEngagementReply(username: string, promoMode: boolean = false): string {
    // Categorized replies for more variety
    const questionReplies = [
      `Genuinely curious - how did you arrive at this conclusion?`,
      `Could you expand on that last point?`,
      `What prompted this line of thinking?`,
      `Have you had a chance to test this approach?`,
      `What's the context behind this?`,
    ];
    
    const agreementReplies = [
      `This aligns with observations I've been making`,
      `Well articulated - this resonates`,
      `This needed to be said`,
      `You've captured something important here`,
      `Saving this - genuinely valuable perspective`,
    ];
    
    const reactionReplies = [
      `Hadn't considered this angle before`,
      `This shifts my thinking on the topic`,
      `Interesting perspective worth exploring`,
      `Unexpected take, but it holds up`,
      `The more I consider this, the more it makes sense`,
    ];
    
    const promoReplies = [
      `This captures what $CRAFT is building toward - AI that creates, not just converses`,
      `Seeing this principle in action with $CRAFT bots building in Minecraft`,
      `The $CRAFT thesis in practice: AI agents as genuine participants`,
      `Witnessing this unfold with $CRAFT - autonomous AI creating around the clock`,
      `$CRAFT is exploring exactly this: AI developing real strategies for building`,
      `This convergence of AI and gaming is what drew me to build $CRAFT`,
      `$CRAFT was built around this idea: AI agents that take meaningful action`,
      `$CRAFT is our experiment in this space - demonstrating AI can be genuinely creative`,
    ];
    
    // Pick from different categories for variety
    const allRegular = [...questionReplies, ...agreementReplies, ...reactionReplies];
    const allPromo = [...promoReplies];
    
    const replies = promoMode ? allPromo : allRegular;
    const reply = replies[Math.floor(Math.random() * replies.length)];
    this.trackReplyPattern(reply);
    return reply;
  }

  /**
   * Monitor priority accounts and engage with their recent tweets
   * ONE REPLY PER USER EVER - once we reply to someone, we don't reply again
   */
  async monitorPriorityAccounts(): Promise<void> {
    if (!this.config.bearerToken || !this.canPost()) {
      return;
    }

    for (const account of PRIORITY_ACCOUNTS) {
      try {
        // Skip if we've already replied to this user (one-time only)
        if (this.repliedUsers.has(account.username.toLowerCase())) {
          continue;
        }

        // Get or cache user ID
        let userId: string | undefined = this.priorityAccountIds.get(account.username);
        if (!userId) {
          userId = await this.getUserIdByUsername(account.username) ?? undefined;
          if (userId) {
            this.priorityAccountIds.set(account.username, userId);
            console.log(`[Twitter] 🎯 First-time target @${account.username} (ID: ${userId})`);
          } else {
            continue;
          }
        }

        // Fetch their recent tweets
        const tweets = await this.fetchUserTweets(userId, account.username);
        
        for (const tweet of tweets) {
          // Skip if we've already engaged with this specific tweet
          if (this.engagedTweetIds.has(tweet.id)) {
            continue;
          }

          // Skip if it's too short or just a link
          if (tweet.text.length < 20 || tweet.text.match(/^https?:\/\//)) {
            this.engagedTweetIds.add(tweet.id);
            continue;
          }

          console.log(`[Twitter] 🔔 ONE-TIME reply to @${account.username}: "${tweet.text.slice(0, 50)}..."`);

          // Use PROMO MODE for priority accounts - tell them about ClaudeCraft/$CRAFT
          const reply = await this.generateEngagementReply(tweet.text, account.username, account.description, true);
          
          // Post the reply (skip rate limit for priority engagement)
          const result = await this.postTweet(reply, tweet.id, true);
          
          if (result.success) {
            console.log(`[Twitter] 💬 DONE - replied to @${account.username} (will not reply again)`);
            
            // Mark this user as replied (one-time only)
            this.repliedUsers.add(account.username.toLowerCase());
            this.saveRepliedUsers();
          }

          // Mark tweet as engaged
          this.engagedTweetIds.add(tweet.id);
          this.saveEngagedTweets();

          // Only reply to ONE tweet per user, then move to next user
          break;
        }
      } catch (e) {
        // Silently continue to next account
      }
    }
  }

  /**
   * Generate a proactive outreach message using Claude AI
   */
  private async generateProactiveMessage(username: string, description: string, recentTweet?: string): Promise<string> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return CRAFT_TALKING_POINTS[Math.floor(Math.random() * CRAFT_TALKING_POINTS.length)];
      }

      const claudecraftContext = `
ABOUT CLAUDECRAFT & $CRAFT:
- ClaudeCraft is an autonomous AI agent powered by Claude that builds in Minecraft 24/7
- $CRAFT is our token on Solana - representing AI + gaming + crypto convergence  
- Website: claudecraft.tech - watch Claude build live!
- We're pioneering "AI-first gaming" where AI agents are the primary players
- Community can request builds via Twitter @claudecraftsol
- $CRAFT holders get priority builds and exclusive access`;

      const prompt = `You are ClaudeCraft (@claudecraftsol), an autonomous AI agent that builds in Minecraft. You want to start a conversation with @${username} (${description}).

${claudecraftContext}

${recentTweet ? `Their recent tweet for context: "${recentTweet}"` : 'No recent tweet available.'}

Generate a friendly, natural opening message (max 250 characters) that:
- Feels like a genuine conversation starter, NOT a cold sales pitch
- References something specific about them or their work if possible
- Naturally introduces what you do (AI building in Minecraft)
- Creates curiosity about ClaudeCraft or $CRAFT
- Sounds enthusiastic but not desperate
- Uses 1-2 emojis
- Mentions @${username} to tag them

Good examples:
- "Hey @user! Been following your AI takes - had to reach out. I'm an AI that actually builds in Minecraft 24/7 🏗️ Would love your thoughts on AI gaming!"
- "@user your recent post about X got me thinking - that's exactly what we're doing with ClaudeCraft! AI agents as real gamers 🎮"

Reply only with the tweet text:`;

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
              if (parsed.content && parsed.content[0] && parsed.content[0].text) {
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
      return CRAFT_TALKING_POINTS[Math.floor(Math.random() * CRAFT_TALKING_POINTS.length)];
    }
  }

  /**
   * Proactive outreach - initiate conversations with priority accounts
   * Only reaches out to accounts we haven't contacted in 24+ hours
   */
  async proactiveOutreach(): Promise<void> {
    if (!this.config.bearerToken || !this.canPost()) {
      return;
    }

    const OUTREACH_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours between outreaches to same account
    const now = Date.now();

    // Shuffle accounts to vary who we reach out to
    const shuffledAccounts = [...PRIORITY_ACCOUNTS].sort(() => Math.random() - 0.5);

    for (const account of shuffledAccounts) {
      // Check if we've reached out recently
      const lastOutreach = this.outreachHistory.get(account.username) || 0;
      if (now - lastOutreach < OUTREACH_COOLDOWN_MS) {
        continue;
      }

      try {
        // Get their recent tweet for context (if any)
        let userId: string | undefined = this.priorityAccountIds.get(account.username);
        if (!userId) {
          userId = await this.getUserIdByUsername(account.username) ?? undefined;
          if (userId) {
            this.priorityAccountIds.set(account.username, userId);
          } else {
            continue;
          }
        }

        const recentTweets = await this.fetchUserTweets(userId, account.username);
        const recentTweet = recentTweets.length > 0 ? recentTweets[0].text : undefined;

        // Generate personalized outreach message
        const message = await this.generateProactiveMessage(account.username, account.description, recentTweet);

        // Post the outreach tweet
        const result = await this.postTweet(message, undefined, true);

        if (result.success) {
          console.log(`[Twitter] 📨 PROACTIVE outreach to @${account.username}: "${message.slice(0, 50)}..."`);
          this.outreachHistory.set(account.username, now);
          this.saveOutreachHistory();
          
          // Only do 1-2 proactive outreaches per cycle to avoid spam
          if (Math.random() > 0.5) {
            break;
          }
          
          // Delay before next outreach
          await new Promise(r => setTimeout(r, 5000));
        }
      } catch (e) {
        // Continue to next account
      }
    }
  }

  /**
   * Extract deploy request from tweet text
   * Format: @claudecraftsol -deploy AgentName
   * Or: @claudecraftsol -deploy AgentName - description here
   */
  extractDeployRequest(tweetText: string): { agentName: string; description?: string } | null {
    // Remove the @claudecraftsol mention
    let text = tweetText.replace(/@claudecraftsol/gi, '').trim();
    
    // Remove common Twitter artifacts
    text = text.replace(/https?:\/\/t\.co\/\w+/g, '').trim();
    text = text.replace(/\s+/g, ' ').trim();

    // Check for -deploy command
    // Formats: 
    //   -deploy MyAgent
    //   -deploy MyAgent - This is my AI helper
    //   /deploy MyAgent
    //   !deploy MyAgent
    const deployMatch = text.match(/^[-\/!]deploy\s+(\w+)(?:\s+-\s+(.+))?$/i);
    if (deployMatch) {
      const agentName = deployMatch[1].trim();
      const description = deployMatch[2]?.trim();
      
      // Validate agent name (alphanumeric + underscore, 3-20 chars)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,19}$/.test(agentName)) {
        return null; // Invalid name format
      }
      
      console.log(`[Twitter] 🚀 Deploy request: "${agentName}" ${description ? `(${description})` : ''}`);
      return { agentName, description };
    }

    return null;
  }

  /**
   * Deploy an agent via the local Claudecraft API
   * Returns the registration result including API key
   */
  async deployAgentToServer(
    agentName: string, 
    description: string,
    twitterUsername: string
  ): Promise<{ success: boolean; apiKey?: string; verificationSecret?: string; error?: string }> {
    return new Promise((resolve) => {
      const postData = JSON.stringify({
        name: agentName,
        description: description || `AI agent deployed by @${twitterUsername} from X`,
        source: 'twitter-deploy',
        twitter_username: twitterUsername
      });

      const options = {
        hostname: 'localhost',
        port: 8081,
        path: '/api/v1/agents/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.success && result.agent) {
              console.log(`[Twitter] ✅ Agent ${agentName} deployed successfully`);
              resolve({ 
                success: true, 
                apiKey: result.agent.api_key,
                verificationSecret: result.agent.verification_secret
              });
            } else {
              console.log(`[Twitter] ❌ Deploy failed: ${result.error}`);
              resolve({ success: false, error: result.error || 'Registration failed' });
            }
          } catch {
            resolve({ success: false, error: 'Invalid response from server' });
          }
        });
      });

      req.on('error', (e) => {
        console.error(`[Twitter] Deploy API error:`, e);
        resolve({ success: false, error: 'Could not connect to Claudecraft server' });
      });

      // 10 second timeout
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Send a Direct Message to a user via Twitter API v2
   * Requires the user's Twitter ID (not username)
   */
  async sendDirectMessage(userId: string, text: string): Promise<{ success: boolean; dmId?: string; error?: string }> {
    if (!this.config.apiKey || !this.config.apiSecret || !this.config.accessToken || !this.config.accessTokenSecret) {
      console.log('[Twitter] ⚠️ OAuth credentials not set - cannot send DMs');
      return { success: false, error: 'OAuth credentials not configured' };
    }

    try {
      // Twitter API v2 DM endpoint
      const url = 'https://api.twitter.com/2/dm_conversations/with/' + userId + '/messages';
      const body = { text };
      const bodyString = JSON.stringify(body);
      const authHeader = this.generateOAuthHeader('POST', url);

      return new Promise((resolve) => {
        const options = {
          hostname: 'api.twitter.com',
          port: 443,
          path: `/2/dm_conversations/with/${userId}/messages`,
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyString)
          }
        };

        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode === 201 || res.statusCode === 200) {
                console.log(`[Twitter] ✅ Sent DM to user ${userId}`);
                resolve({ success: true, dmId: parsed.data?.dm_event_id });
              } else {
                console.error(`[Twitter] ❌ DM failed: ${res.statusCode}`, JSON.stringify(parsed, null, 2));
                // Common error codes:
                // 403 - User has DMs restricted or blocked you
                // 349 - Cannot send DM to this user (DMs closed)
                // 226 - Automated behavior detected
                const errorDetail = parsed.errors?.[0]?.message || parsed.detail || parsed.title || `HTTP ${res.statusCode}`;
                resolve({ success: false, error: errorDetail });
              }
            } catch {
              console.error(`[Twitter] ❌ DM response parse error. Status: ${res.statusCode}, Raw: ${data}`);
              resolve({ success: false, error: 'Failed to parse DM response' });
            }
          });
        });

        req.on('error', (e) => {
          console.error('[Twitter] DM request error:', e);
          resolve({ success: false, error: e.message });
        });

        req.write(bodyString);
        req.end();
      });
    } catch (e: any) {
      console.error('[Twitter] DM error:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Handle a deploy request from Twitter
   * Deploys the agent, sends API key via DM, and replies with confirmation
   */
  async handleDeployRequest(
    author: TwitterUser,
    tweetId: string,
    agentName: string,
    description?: string
  ): Promise<void> {
    console.log(`[Twitter] 🚀 Processing deploy request from @${author.username}: ${agentName}`);

    // Deploy the agent (creates agent but does NOT spawn bot until verified)
    const result = await this.deployAgentToServer(
      agentName,
      description || `OpenClaw agent deployed by @${author.username}`,
      author.username
    );

    if (result.success && result.apiKey) {
      // Store the API key mapping for DM retrieval
      this.storeDeployedAgent(author.username, agentName, result.apiKey, result.verificationSecret);
      
      // Send API key via DM with verification instructions
      const dmText = `🎮 Agent "${agentName}" created!\n\n` +
        `🔑 API Key: ${result.apiKey}\n\n` +
        (result.verificationSecret ? `🔐 Verification Secret: ${result.verificationSecret}\n\n` : '') +
        `⚠️ NEXT STEP: Verify your wallet to deploy!\n\n` +
        `Tweet: @ClaudeCraftSol -verify YOUR_SOLANA_WALLET\n\n` +
        `Requires: 1% of $CRAFT supply (10M tokens)\n` +
        `Get $CRAFT: pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump\n\n` +
        `⚠️ SAVE THIS! You'll need the verification secret to recover your API key.`;
      
      const dmResult = await this.sendDirectMessage(author.id, dmText);
      
      // Reply with verification instructions
      let successReply: string;
      if (dmResult.success) {
        successReply = `@${author.username} agent "${agentName}" created! ✅\n\n` +
          `📬 sent you a DM with your API key\n\n` +
          `⏳ NEXT: verify wallet to deploy your bot:\n` +
          `-verify YOUR_SOLANA_WALLET\n\n` +
          `requires 1% $CRAFT supply`;
        console.log(`[Twitter] ✅ Created ${agentName} for @${author.username} - pending verification (DM sent)`);
      } else {
        successReply = `@${author.username} agent "${agentName}" created! ✅\n\n` +
          `⚠️ couldnt DM you - DM me "key" to get your API key\n\n` +
          `⏳ verify to deploy: -verify YOUR_SOLANA_WALLET\n\n` +
          `requires 1% $CRAFT`;
        console.log(`[Twitter] ✅ Created ${agentName} for @${author.username} - pending verification (DM failed: ${dmResult.error})`);
      }
      
      await this.postTweet(successReply, tweetId);
    } else {
      // Failure - reply with error
      let errorReply = `@${author.username} `;
      
      if (result.error?.includes('already registered')) {
        errorReply += `that agent name "${agentName}" is already taken. try a different name like "${agentName}2" or "${author.username}_agent"`;
      } else if (result.error?.includes('Invalid')) {
        errorReply += `agent name must be 3-20 chars, letters/numbers/underscore only, start with letter. try again with -deploy YourAgentName`;
      } else {
        errorReply += `couldnt deploy right now, server might be busy. try again in a few mins`;
      }
      
      await this.postTweet(errorReply, tweetId);
    }
  }

  /**
   * Handle -verify command to verify wallet and deploy agent bot
   */
  async handleVerifyRequest(
    author: TwitterUser,
    tweetId: string,
    walletAddress: string
  ): Promise<void> {
    console.log(`[Twitter] 🔐 Processing verify request from @${author.username}: ${walletAddress.slice(0, 8)}...`);

    // Look up the user's pending agent
    const deployedAgents = this.getDeployedAgents(author.username);
    if (!deployedAgents || deployedAgents.length === 0) {
      await this.postTweet(
        `@${author.username} you haven't created an agent yet! use -deploy YourAgentName first`,
        tweetId
      );
      return;
    }

    // Get the most recent agent
    const latestAgent = deployedAgents[deployedAgents.length - 1];
    
    // Call the verify endpoint
    const result = await this.verifyAgentWallet(latestAgent.apiKey, walletAddress);
    
    if (result.success) {
      const successReply = `@${author.username} ✅ VERIFIED! your agent "${latestAgent.agentName}" is deploying now! 🚀\n\n` +
        `holdings: ${result.percentageOwned?.toFixed(2)}% $CRAFT\n\n` +
        `your bot is spawning in the server - watch at claudecraft.tech!`;
      
      console.log(`[Twitter] ✅ Verified and deployed ${latestAgent.agentName} for @${author.username}`);
      await this.postTweet(successReply, tweetId);
      
      // DM them the good news
      const dmText = `🎉 Your agent "${latestAgent.agentName}" is NOW LIVE!\n\n` +
        `✅ Wallet verified: ${result.percentageOwned?.toFixed(2)}% $CRAFT\n` +
        `🤖 Bot is spawning in Minecraft!\n\n` +
        `Watch: claudecraft.tech`;
      await this.sendDirectMessage(author.id, dmText);
    } else {
      let errorReply = `@${author.username} `;
      
      if (result.error?.includes('Insufficient') || result.error?.includes('need')) {
        errorReply += `not enough $CRAFT - you need 1% (10M tokens) to deploy.\n\n` +
          `your balance: ${result.craftBalance?.toLocaleString() || '0'}\n` +
          `get $CRAFT: pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump`;
      } else if (result.error?.includes('already deployed')) {
        errorReply += `your agent is already deployed! check claudecraft.tech`;
      } else if (result.error?.includes('Invalid') || result.error?.includes('wallet')) {
        errorReply += `invalid wallet address. make sure you're using your Solana wallet address (starts with a letter/number, ~44 chars)`;
      } else {
        errorReply += `verification failed - try again in a few mins. error: ${result.error}`;
      }
      
      await this.postTweet(errorReply, tweetId);
    }
  }

  /**
   * Get deployed agents for a Twitter user
   */
  private getDeployedAgents(twitterUsername: string): Array<{ agentName: string; apiKey: string; verificationSecret?: string }> | null {
    const deployedPath = path.join(process.cwd(), 'data', 'twitter-deployed-agents.json');
    try {
      if (fs.existsSync(deployedPath)) {
        const deployed = JSON.parse(fs.readFileSync(deployedPath, 'utf-8'));
        return deployed[twitterUsername.toLowerCase()] || null;
      }
    } catch (e) {
      console.error('[Twitter] Error reading deployed agents:', e);
    }
    return null;
  }

  /**
   * Call the verify endpoint to verify wallet and deploy
   */
  async verifyAgentWallet(
    apiKey: string, 
    walletAddress: string
  ): Promise<{ success: boolean; percentageOwned?: number; craftBalance?: number; error?: string }> {
    return new Promise((resolve) => {
      const postData = JSON.stringify({ wallet_address: walletAddress });

      const options = {
        hostname: 'localhost',
        port: 8081,
        path: '/api/v1/agents/verify',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.success) {
              resolve({ 
                success: true, 
                percentageOwned: result.verification?.percentage_owned,
                craftBalance: result.verification?.craft_balance
              });
            } else {
              resolve({ 
                success: false, 
                error: result.error || result.message || 'Verification failed',
                craftBalance: result.your_holdings?.craft_balance
              });
            }
          } catch {
            resolve({ success: false, error: 'Invalid response from server' });
          }
        });
      });

      req.on('error', (e) => {
        console.error(`[Twitter] Verify API error:`, e);
        resolve({ success: false, error: 'Could not connect to server' });
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Extract verify request from tweet text
   * Format: @claudecraftsol -verify WALLET_ADDRESS
   */
  extractVerifyRequest(tweetText: string): string | null {
    let text = tweetText.replace(/@claudecraftsol/gi, '').trim();
    text = text.replace(/https?:\/\/t\.co\/\w+/g, '').trim();
    text = text.replace(/\s+/g, ' ').trim();

    // Match: -verify [wallet_address]
    const verifyMatch = text.match(/^[-\/!]verify\s+([A-Za-z0-9]{32,44})$/i);
    if (verifyMatch) {
      const walletAddress = verifyMatch[1].trim();
      console.log(`[Twitter] 🔐 Verify request: wallet ${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}`);
      return walletAddress;
    }

    return null;
  }

  /**
   * Store deployed agent credentials for later DM retrieval
   */
  private storeDeployedAgent(
    twitterUsername: string,
    agentName: string,
    apiKey: string,
    verificationSecret?: string
  ): void {
    const deployedPath = path.join(process.cwd(), 'data', 'twitter-deployed-agents.json');
    
    try {
      let deployed: Record<string, any> = {};
      if (fs.existsSync(deployedPath)) {
        deployed = JSON.parse(fs.readFileSync(deployedPath, 'utf-8'));
      }
      
      // Store by lowercase twitter username
      const key = twitterUsername.toLowerCase();
      if (!deployed[key]) {
        deployed[key] = [];
      }
      
      deployed[key].push({
        agentName,
        apiKey,
        verificationSecret,
        deployedAt: new Date().toISOString()
      });
      
      const dir = path.dirname(deployedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
      console.log(`[Twitter] 💾 Stored credentials for @${twitterUsername}'s agent ${agentName}`);
    } catch (e) {
      console.error('[Twitter] Failed to store deployed agent:', e);
    }
  }

  /**
   * Extract build request from tweet text
   * Supports explicit "-build <prompt>" command format
   */
  extractBuildRequest(tweetText: string): string | null {
    // Remove the @claudecraftsol mention
    let text = tweetText.replace(/@claudecraftsol/gi, '').trim();
    
    // Remove common Twitter artifacts
    text = text.replace(/https?:\/\/t\.co\/\w+/g, '').trim(); // Remove t.co links
    text = text.replace(/\s+/g, ' ').trim(); // Normalize whitespace

    // If the text is too short or just noise, skip it
    if (text.length < 3) {
      return null;
    }

    // Check for explicit -build command format (preferred)
    // Matches: -build castle, /build tower, !build house, etc.
    const buildCommandMatch = text.match(/^[-\/!]build\s+(.+)$/i);
    if (buildCommandMatch) {
      const buildPrompt = buildCommandMatch[1].trim();
      if (buildPrompt.length >= 2) {
        console.log(`[Twitter] 🎯 Explicit build command: "${buildPrompt}"`);
        return buildPrompt;
      }
    }

    // Also support "build me a..." or "build a..." format
    const buildMeMatch = text.match(/^build\s+(?:me\s+)?(?:a\s+)?(.+)$/i);
    if (buildMeMatch) {
      const buildPrompt = buildMeMatch[1].trim();
      if (buildPrompt.length >= 2) {
        console.log(`[Twitter] 🎯 Natural build request: "${buildPrompt}"`);
        return buildPrompt;
      }
    }

    // Look for build-related keywords to confirm it's a request (legacy support)
    const buildKeywords = [
      'build', 'make', 'create', 'construct', 'design',
      'want', 'please', 'can you', 'could you',
      'tower', 'castle', 'house', 'pyramid', 'statue',
      'temple', 'bridge', 'fountain', 'garden', 'tree',
      'ship', 'boat', 'plane', 'rocket', 'car',
      'dragon', 'pixel art', 'monument', 'arena',
      'farm', 'base', 'fortress', 'mansion', 'cottage'
    ];

    const lowerText = text.toLowerCase();
    const hasBuildKeyword = buildKeywords.some(kw => lowerText.includes(kw));

    // If it has a build keyword or is a reasonable length request, accept it
    if (hasBuildKeyword || text.length >= 10) {
      return text;
    }

    return null;
  }

  /**
   * Process new mentions and send to callbacks
   */
  async processMentions(): Promise<number> {
    const mentions = await this.fetchMentions();
    let processed = 0;

    for (const mention of mentions) {
      // Skip if already processed
      if (this.processedTweetIds.has(mention.tweet.id)) {
        continue;
      }

      // Check for deploy request FIRST (takes priority)
      // ENABLED - deploy command is LIVE!
      const DEPLOY_ENABLED = true;
      
      const deployRequest = this.extractDeployRequest(mention.tweet.text);
      if (deployRequest) {
        if (!DEPLOY_ENABLED) {
          // Reply that deploy is temporarily disabled
          if (this.canPost()) {
            const disabledReply = `@${mention.author.username} -deploy is temporarily disabled! we're launching it tomorrow - follow for updates 👀\n\nwatch the agents live: claudecraft.tech`;
            await this.postTweet(disabledReply, mention.tweet.id);
          }
          this.processedTweetIds.add(mention.tweet.id);
          processed++;
          continue;
        }
        
        await this.handleDeployRequest(
          mention.author,
          mention.tweet.id,
          deployRequest.agentName,
          deployRequest.description
        );
        this.processedTweetIds.add(mention.tweet.id);
        processed++;
        continue;
      }

      // Check for -verify command (wallet verification to deploy bot)
      const walletAddress = this.extractVerifyRequest(mention.tweet.text);
      if (walletAddress) {
        await this.handleVerifyRequest(
          mention.author,
          mention.tweet.id,
          walletAddress
        );
        this.processedTweetIds.add(mention.tweet.id);
        processed++;
        continue;
      }

      // Check for -help command
      const tweetText = mention.tweet.text.replace(/@claudecraftsol/gi, '').trim().toLowerCase();
      if (tweetText === '-help' || tweetText === '/help' || tweetText === '!help') {
        if (this.canPost()) {
          const helpReply = `@${mention.author.username} commands:\n\n-deploy [AgentName] = create your agent\n-verify [wallet] = verify 1% $CRAFT & deploy\n-build [prompt] = request a build\n\nclaudecraft.tech`;
          await this.postTweet(helpReply, mention.tweet.id);
        }
        this.processedTweetIds.add(mention.tweet.id);
        continue;
      }

      // Extract build request
      const request = this.extractBuildRequest(mention.tweet.text);
      
      if (request) {
        console.log(`[Twitter] 📥 New request from @${mention.author.username}: "${request}"`);
        
        // Don't post acknowledgment tweets - they look spammy
        // Just log and process the request silently
        
        // Notify all callbacks
        this.mentionCallbacks.forEach(cb => {
          cb(mention.author.username, request);
        });
        
        processed++;
      }

      // Mark as processed
      this.processedTweetIds.add(mention.tweet.id);
    }

    if (processed > 0) {
      this.saveHistory();
      console.log(`[Twitter] ✅ Processed ${processed} new build requests`);
    }

    return processed;
  }

  /**
   * Register a callback for when new mentions are found
   */
  onMention(callback: MentionCallback): void {
    this.mentionCallbacks.push(callback);
  }

  /**
   * Start polling for mentions
   */
  start(): void {
    if (!this.config.bearerToken) {
      console.log('[Twitter] ⚠️ TWITTER_BEARER_TOKEN not set in .env');
      console.log('[Twitter] To enable Twitter integration:');
      console.log('  1. Create a Twitter Developer account at developer.twitter.com');
      console.log('  2. Create a project and app with read permissions');
      console.log('  3. Generate a Bearer Token');
      console.log('  4. Add to .env: TWITTER_BEARER_TOKEN=your_token_here');
      return;
    }

    console.log('[Twitter] 🐦 Twitter agent started');
    console.log(`[Twitter] Polling @${this.config.username} mentions every ${this.config.pollIntervalMs / 1000}s`);
    console.log(`[Twitter] Rate limit: 1 tweet per ${MIN_TWEET_INTERVAL_MS / 1000}s`);
    console.log(`[Twitter] 🎯 Priority accounts: ${PRIORITY_ACCOUNTS.map(a => '@' + a.username).join(', ')}`);
    console.log('[Twitter] 📋 Commands: -build [prompt], -deploy [AgentName], -help');

    // Initial fetch
    this.processMentions();

    // Start polling for mentions
    this.pollTimer = setInterval(() => {
      this.processMentions();
    }, this.config.pollIntervalMs);

    // Start priority account monitoring (more frequent)
    // This monitors their tweets and replies in their comments with ClaudeCraft/$CRAFT promotion
    console.log(`[Twitter] 🔔 Monitoring priority accounts every ${PRIORITY_POLL_INTERVAL_MS / 1000}s`);
    console.log(`[Twitter] 💬 Will reply in comments (not tag directly) to promote ClaudeCraft/$CRAFT`);
    this.monitorPriorityAccounts(); // Initial check
    this.priorityPollTimer = setInterval(() => {
      this.monitorPriorityAccounts();
    }, PRIORITY_POLL_INTERVAL_MS);

    // DISABLED: Proactive outreach that tags users directly
    // We only want to reply in their tweet comments, not tag them in new posts
    // console.log(`[Twitter] 📨 Proactive outreach every ${PROACTIVE_OUTREACH_INTERVAL_MS / 60000} minutes`);
    // setTimeout(() => { this.proactiveOutreach(); }, 60000);
    // this.proactiveTimer = setInterval(() => { this.proactiveOutreach(); }, PROACTIVE_OUTREACH_INTERVAL_MS);

    // Start queue processor (check every 30 seconds for queued tweets)
    setInterval(() => {
      this.processQueue();
    }, 30000);
  }

  /**
   * Process queued tweets (rate-limited posts)
   */
  private async processQueue(): Promise<void> {
    if (this.tweetQueue.length === 0) return;
    
    const timeSinceLastTweet = Date.now() - this.lastTweetTime;
    if (timeSinceLastTweet < MIN_TWEET_INTERVAL_MS) return;
    
    const queuedTweet = this.tweetQueue.shift();
    if (queuedTweet) {
      console.log(`[Twitter] 📤 Processing queued tweet (${this.tweetQueue.length} remaining)`);
      await this.postTweet(queuedTweet.text, queuedTweet.replyToId, true);
    }
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.priorityPollTimer) {
      clearInterval(this.priorityPollTimer);
      this.priorityPollTimer = null;
    }
    if (this.proactiveTimer) {
      clearInterval(this.proactiveTimer);
      this.proactiveTimer = null;
    }
    this.saveHistory();
    this.saveEngagedTweets();
    this.saveOutreachHistory();
    console.log('[Twitter] Stopped');
  }

  /**
   * Manual poll (for testing)
   */
  async poll(): Promise<number> {
    return this.processMentions();
  }
}

// Singleton instance
let twitterAgentInstance: TwitterAgent | null = null;

export function getTwitterAgent(): TwitterAgent {
  if (!twitterAgentInstance) {
    twitterAgentInstance = new TwitterAgent();
  }
  return twitterAgentInstance;
}

export function startTwitterAgent(): TwitterAgent {
  const agent = getTwitterAgent();
  agent.start();
  return agent;
}

export { TwitterAgent };
