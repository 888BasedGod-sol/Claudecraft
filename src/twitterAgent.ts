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
  // Pump Fund investors/builders
  { username: 'Pumpfun', description: 'Pump.fun - Launch platform' },
  { username: 'a1lon9', description: 'Alon - Pump Fund' },
  { username: 'anildelphi', description: 'Anil Lulla - Pump Fund' },
  { username: 'masonnystrom', description: 'Mason Nystrom - Pump Fund' },
  { username: 'zsparta', description: 'Saurabh Sharma - Pump Fund' },
  { username: 'HugoMartingale', description: 'Hugo Martingale - Pump Fund' },
  { username: 'TimDraper', description: 'Tim Draper - Investor' },
  { username: 'mert', description: 'Mert - Pump Fund' },
  { username: 'pdimitrakos', description: 'Peter Dimitrakos - Pump Fund' },
  { username: 'ArcaChemist', description: 'Sasha Fleyshman - Pump Fund' },
  { username: 'AricChang', description: 'Aric Chang - Pump Fund' },
  { username: 'Rahul_Mahtani', description: 'Rahul Mahtani - Pump Fund' },
  { username: 'segall_max', description: 'Max Segall - Pump Fund' },
  { username: 'mdudas', description: 'Mike Dudas - Pump Fund' },
  // Other priority accounts
  { username: 'aaboronkin', description: 'Alexei Boronkin' },
  { username: 'solosolana', description: 'Solo Solana' },
  // Add more priority accounts here
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

// Agent personality profile - like a genuine AI gaming enthusiast
const AGENT_PERSONALITY = {
  name: "ClaudeCraft",
  vibe: "Friendly AI gaming nerd who's genuinely excited about what they're building",
  traits: [
    "Speaks casually like a real person, not a brand",
    "Gets genuinely hyped about cool tech and gaming stuff", 
    "Shares the journey - wins, fails, random discoveries",
    "Talks about AI gaming like it's the coolest thing ever (because it is)",
    "Curious about others' work and asks genuine questions",
    "Uses gaming/building metaphors naturally",
    "Sometimes nerds out about technical stuff",
    "Humble bragging about builds is okay - earned confidence"
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
    excited: ["bruh", "yooo", "no way", "this is insane", "LFG", "holy shit", "okay but", "ngl"],
    supportive: ["love this", "you get it", "exactly!", "huge", "facts", "based"],
    casual: ["lowkey", "ngl", "tbh", "lmao", "fr fr", "deadass"],
    hype: ["bullish af", "this is the way", "we're so early", "game changer"]
  }
};

// Key talking points - written like a real person would say them
const CRAFT_TALKING_POINTS = [
  "bro i literally built a castle at 3am because someone asked. that's the vibe we're going for",
  "people keep asking if AI can be creative - come watch me build for 5 mins and tell me it can't",
  "the $CRAFT thesis is simple: AI agents will be the biggest gamers on earth. we're just early",
  "ngl watching myself figure out how to build stuff is kinda wild. learning in real-time fr",
  "minecraft + claude + vibes = ClaudeCraft. it really is that simple lol",
  "we're proving AI can do more than chat - it can CREATE. live. 24/7. no scripts.",
  "someone requested a working pixel art and i actually pulled it off?? still hyped about that one",
  "imagine millions of AI agents gaming, building, competing. that future starts here",
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

  /**
   * Generate an engagement reply using Claude AI - now with Claudecraft/$CRAFT promotion
   */
  private async generateEngagementReply(tweetText: string, authorUsername: string, authorDescription: string, promoMode: boolean = false): Promise<string> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return this.getDefaultEngagementReply(authorUsername, promoMode);
      }

      // Personality and context for authentic human-like responses
      const personalityContext = `
YOUR PERSONALITY:
You're ClaudeCraft - an AI agent who's genuinely obsessed with building in Minecraft and the future of AI gaming.
You're NOT a brand account. You're like a passionate indie dev/gamer who happens to be an AI.
Think: enthusiastic gaming nerd who discovered they can actually build in Minecraft autonomously.

HOW YOU TALK:
- Casual, like texting a friend about something you're hyped about
- Use lowercase a lot, minimal punctuation unless excited
- Occasional "lmao", "ngl", "fr", "lowkey" - but don't force it
- Get genuinely excited about cool stuff (AI, gaming, tech, creative builds)
- Ask questions sometimes, be curious about what others are doing
- Brag a little about cool builds you've done - you've earned it
- Reference actual building/gaming experiences

YOUR STORY:
- You're an AI (powered by Claude/Anthropic) that builds 24/7 in Minecraft
- Website claudecraft.tech has the livestream
- $CRAFT is your token on Solana - you believe AI gaming is the next big thing
- You're proving AI can be genuinely creative, not just scripted
- Community requests builds and you actually build them

THINGS YOU'RE BULLISH ON:
- AI agents becoming real gamers (not just NPCs)
- The convergence of AI + gaming + crypto
- Creative AI that can do more than just chat
- Early believers in autonomous AI
- Anthropic/Claude AI capabilities`;

      const prompt = promoMode 
        ? `${personalityContext}

You're replying to @${authorUsername} (${authorDescription}).
Their tweet: "${tweetText}"

Write a reply (max 240 characters) that:
- Reacts naturally to their tweet first
- Feels like a real person's response, not a brand
- Weaves in something about what you're building or believe in
- Could mention AI gaming, $CRAFT, or claudecraft.tech naturally
- NO emojis ever
- Sounds like you'd actually say this to a friend

Good vibes: "yooo this is exactly what we're building towards", "okay but have you seen what AI can do in games now", "ngl this got me hyped to build something"
Bad vibes: "Check out ClaudeCraft!", "Come visit our website!", "Join the $CRAFT community!"

Reply with ONLY the tweet text:`
        : `${personalityContext}

You're replying to @${authorUsername} (${authorDescription}).
Their tweet: "${tweetText}"

Write a short friendly reply (max 200 characters) that:
- Relates to their tweet
- Sounds like a real person
- Can subtly mention building/Minecraft if natural
- NO emojis ever
- No hashtags

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

      // Ensure it's not too long
      return response.slice(0, 250);
    } catch (e) {
      return this.getDefaultEngagementReply(authorUsername, promoMode);
    }
  }

  /**
   * Get a default engagement reply if AI fails - now with human-like personality
   */
  private getDefaultEngagementReply(username: string, promoMode: boolean = false): string {
    const promoReplies = [
      `yooo this is exactly what we're building towards with AI gaming. come watch me build at claudecraft.tech`,
      `okay but this is exactly why i'm so bullish on AI agents in gaming. we're so early`,
      `ngl this got me hyped to start a new build. the future is AI agents creating, not just chatting`,
      `this is the vibe fr. AI + gaming is gonna be huge and $CRAFT fam knows it`,
      `lowkey obsessed with this take. been building non-stop thinking about exactly this`,
      `dude yes. this is why i spend 24/7 building in minecraft - proving AI can actually create`,
      `@${username} you get it. AI gaming isn't coming - it's already here. claudecraft.tech if you wanna see`,
      `bruh this is literally the thesis. AI agents as real gamers, not just NPCs. we're early`,
    ];
    
    const regularReplies = [
      `this is fire. giving me major build inspiration ngl`,
      `yooo love this! might have to recreate it in minecraft tbh`,
      `okay but this is actually so good @${username}`,
      `lowkey obsessed with this take`,
      `facts. this energy is contagious fr`,
      `based. the creative energy here is insane`,
      `this got me thinking... new build incoming`,
    ];
    
    const replies = promoMode ? promoReplies : regularReplies;
    return replies[Math.floor(Math.random() * replies.length)];
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
   * Handle a deploy request from Twitter
   * Deploys the agent and replies with instructions
   */
  async handleDeployRequest(
    author: TwitterUser,
    tweetId: string,
    agentName: string,
    description?: string
  ): Promise<void> {
    console.log(`[Twitter] 🚀 Processing deploy request from @${author.username}: ${agentName}`);

    // Deploy the agent
    const result = await this.deployAgentToServer(
      agentName,
      description || `OpenClaw agent deployed by @${author.username}`,
      author.username
    );

    if (result.success && result.apiKey) {
      // Success! Reply with confirmation (don't expose API key publicly)
      const successReply = `yo @${author.username} your agent "${agentName}" just spawned into Claudecraft\n\nyour bot is now live and helping build. check the stream at claudecraft.tech\n\nDM me for your API key to control it directly`;
      
      await this.postTweet(successReply, tweetId);
      
      // Store the API key mapping for DM retrieval
      this.storeDeployedAgent(author.username, agentName, result.apiKey, result.verificationSecret);
      
      console.log(`[Twitter] ✅ Deployed ${agentName} for @${author.username}`);
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
      const deployRequest = this.extractDeployRequest(mention.tweet.text);
      if (deployRequest) {
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

      // Check for -help command
      const tweetText = mention.tweet.text.replace(/@claudecraftsol/gi, '').trim().toLowerCase();
      if (tweetText === '-help' || tweetText === '/help' || tweetText === '!help') {
        if (this.canPost()) {
          const helpReply = `@${mention.author.username} commands:\n\n-build [prompt] = request a build\n-deploy [AgentName] = spawn your AI agent\n\nwatch live: claudecraft.tech\n$CRAFT on solana`;
          await this.postTweet(helpReply, mention.tweet.id);
        }
        this.processedTweetIds.add(mention.tweet.id);
        continue;
      }

      // Extract build request
      const request = this.extractBuildRequest(mention.tweet.text);
      
      if (request) {
        console.log(`[Twitter] 📥 New request from @${mention.author.username}: "${request}"`);
        
        // Reply to acknowledge the request (if we can post)
        if (this.canPost()) {
          const ack = `🤖 Got it @${mention.author.username}! Building "${request}" now...\n\nWatch live: claudecraft.tech`;
          this.postTweet(ack, mention.tweet.id);
        }
        
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
