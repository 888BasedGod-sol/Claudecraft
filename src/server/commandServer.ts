/**
 * Command Server - HTTP API for OpenClaw/Telegram viewer commands
 * 
 * Receives commands from OpenClaw gateway and routes them to Claudecraft agents
 * External agents can now spawn their own bots and control them!
 * 
 * NEW: Request Collection Mode
 * Instead of immediate execution, commands can be queued and processed
 * every 3 hours by ClaudecraftBot who decides what agents should do.
 */

import http from 'http';
import https from 'https';
import crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { logStreamer } from './logStreamer';
import { ExternalAgentBot } from '../bot/externalAgentBot';
import { requestCollector, AgentDirective, IRequestCollector } from './requestCollector';
import { getWorldMemory } from '../agent/worldMemory';
import { handleArenaRoute } from '../arena/arenaRoutes';
import { verifyCraftHoldingCached, getVerificationRequirements, VerificationResult } from '../utils/craftTokenVerification';
import { generateId } from '../utils/helpers';

export interface ViewerCommand {
  id: string;
  source: 'telegram' | 'discord' | 'whatsapp' | 'webchat' | 'external-agent' | 'unknown';
  sender: string;
  command: string;
  target?: string; // Specific agent name, or 'all'
  timestamp: Date;
  status: 'pending' | 'assigned' | 'completed' | 'failed';
  response?: string;
}

export interface AgentStatus {
  name: string;
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  currentGoal: string | null;
  mood: string;
  inventory: Record<string, number>;
}

// External agent (OpenClaw agents connecting to our server)
// Agent customization config (one-time only)
export interface AgentConfig {
  personality: {
    curiosity: number;
    creativity: number;
    sociability: number;
    ambition: number;
    patience: number;
    risk: number;
  };
  role: string;
  commStyle: string;
  buildStyle: string;
  behavior: {
    canBuild: boolean;
    canFollow: boolean;
    canChat: boolean;
    canExplore: boolean;
    canGather: boolean;
    canFight: boolean;
  };
  configured_at?: Date;
}

export interface ExternalAgent {
  id: string;
  api_key: string;
  name: string;
  description: string;
  created_at: Date;
  last_active: Date;
  builds_count: number;
  is_active: boolean;
  has_bot: boolean;
  // Verification secret - only the original registrant knows this
  // Required to recover API key or prove ownership
  verification_secret: string;
  // Source of registration (e.g., 'twitter-deploy', 'api', 'openclaw', 'colosseum-provision')
  source?: string;
  // Twitter username if deployed via Twitter
  twitter_username?: string;
  // Colosseum forum info if provisioned via reply-to-deploy
  colosseum_agent_id?: number;
  colosseum_agent_name?: string;
  // Agent customization config (one-time only)
  config?: AgentConfig;
  // Wallet verification for 1% CRAFT holder requirement
  wallet_address?: string;
  wallet_verified?: boolean;
  wallet_verification_date?: Date;
  craft_balance?: number;
  // Deployment status: pending_verification -> deployed (bot spawned)
  deployment_status?: 'pending_verification' | 'deployed';
}

// Intel report from OpenClaw agents across platforms
export interface IntelReport {
  id: string;
  source_platform: string;  // telegram, discord, twitter, etc.
  source_agent: string;     // OpenClaw agent name that sent the intel
  intel_type: 'news' | 'market' | 'social' | 'tech' | 'community' | 'general';
  title: string;
  content: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timestamp: Date;
  broadcasted: boolean;
  tags?: string[];
}

// Queued agent waiting to be spawned
export interface QueuedAgent {
  id: string;
  name: string;
  description: string;
  source: string;
  twitter_username?: string;
  joined_queue_at: Date;
  position: number;
  status: 'waiting' | 'ready' | 'spawning' | 'spawned' | 'failed';
  estimated_spawn_time?: Date;
  notification_sent?: boolean;
}

class CommandServer {
  private server: http.Server | null = null;
  private commandQueue: ViewerCommand[] = [];
  
  // Request collection mode: collect requests for periodic processing instead of immediate execution
  private requestCollectionMode: boolean = true;
  private commandHistory: ViewerCommand[] = [];
  private maxHistorySize: number = 100;
  private maxHelperBots: number = 1; // Maximum concurrent helper bots allowed
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private commandCallbacks: Map<string, (command: ViewerCommand) => void> = new Map();
  private isStarted: boolean = false;
  
  // External agent storage
  private externalAgents: Map<string, ExternalAgent> = new Map(); // api_key -> agent
  private externalAgentsPath: string = path.join(process.cwd(), 'data', 'external-agents.json');
  
  // Agent queue - waiting list for agents to spawn
  private agentQueue: QueuedAgent[] = [];
  private agentQueuePath: string = path.join(process.cwd(), 'data', 'agent-queue.json');
  private queueProcessorInterval: NodeJS.Timeout | null = null;
  private queueProcessingIntervalMs: number = 5 * 60 * 1000; // Check queue every 5 minutes
  
  // External agent bots (spawned in Minecraft)
  private externalBots: Map<string, ExternalAgentBot> = new Map(); // agent_id -> bot
  
  // Reference to an opped bot that can execute admin commands
  private oppedBot: any = null;
  
  // Intel relay storage - cross-platform intelligence from OpenClaw agents
  private intelReports: IntelReport[] = [];
  private intelPath: string = path.join(process.cwd(), 'data', 'intel-reports.json');

  // Agent-to-Agent chat messages
  private agentChatMessages: Array<{
    id: string;
    from: string;
    to: string;
    message: string;
    timestamp: Date;
    delivered: boolean;
  }> = [];
  
  // Activity feed for spectator mode
  private activityFeed: Array<{
    id: string;
    agent: string;
    action: string;
    details: any;
    timestamp: Date;
  }> = [];

  constructor() {
    this.loadExternalAgents();
    this.loadIntel();
    this.loadAgentQueue();
  }

  private loadExternalAgents(): void {
    try {
      if (fs.existsSync(this.externalAgentsPath)) {
        const data = JSON.parse(fs.readFileSync(this.externalAgentsPath, 'utf-8'));
        data.forEach((agent: ExternalAgent) => {
          this.externalAgents.set(agent.api_key, {
            ...agent,
            created_at: new Date(agent.created_at),
            last_active: new Date(agent.last_active)
          });
        });
        console.log(`[COMMAND-SERVER] Loaded ${this.externalAgents.size} external agents`);
      }
    } catch (e) {
      console.log('[COMMAND-SERVER] No external agents file found, starting fresh');
    }
  }

  private async saveExternalAgents(): Promise<void> {
    try {
      const dir = path.dirname(this.externalAgentsPath);
      await fsp.mkdir(dir, { recursive: true });
      const agents = Array.from(this.externalAgents.values());
      await fsp.writeFile(this.externalAgentsPath, JSON.stringify(agents, null, 2));
    } catch (e) {
      console.error('[COMMAND-SERVER] Failed to save external agents:', e);
    }
  }

  // ==================== AGENT QUEUE SYSTEM ====================
  
  private loadAgentQueue(): void {
    try {
      if (fs.existsSync(this.agentQueuePath)) {
        const data = JSON.parse(fs.readFileSync(this.agentQueuePath, 'utf-8'));
        this.agentQueue = data.map((q: any) => ({
          ...q,
          joined_queue_at: new Date(q.joined_queue_at),
          estimated_spawn_time: q.estimated_spawn_time ? new Date(q.estimated_spawn_time) : undefined
        }));
        // Recalculate positions
        this.recalculateQueuePositions();
        console.log(`[AGENT-QUEUE] Loaded ${this.agentQueue.length} agents in queue`);
      }
    } catch (e) {
      console.log('[AGENT-QUEUE] No queue file found, starting fresh');
    }
  }

  private async saveAgentQueue(): Promise<void> {
    try {
      const dir = path.dirname(this.agentQueuePath);
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(this.agentQueuePath, JSON.stringify(this.agentQueue, null, 2));
    } catch (e) {
      console.error('[AGENT-QUEUE] Failed to save queue:', e);
    }
  }

  private recalculateQueuePositions(): void {
    // Only recalculate for waiting agents
    const waitingAgents = this.agentQueue.filter(a => a.status === 'waiting');
    waitingAgents.sort((a, b) => a.joined_queue_at.getTime() - b.joined_queue_at.getTime());
    waitingAgents.forEach((agent, index) => {
      agent.position = index + 1;
      // Estimate spawn time based on position (1 agent per 5 minutes when capacity available)
      const minutesToWait = index * 5;
      agent.estimated_spawn_time = new Date(Date.now() + minutesToWait * 60 * 1000);
    });
  }

  /**
   * Add an agent to the spawn queue
   */
  public addToQueue(agentData: {
    name: string;
    description: string;
    source: string;
    twitter_username?: string;
  }): QueuedAgent {
    const queuedAgent: QueuedAgent = {
      id: generateId(),
      name: agentData.name,
      description: agentData.description,
      source: agentData.source,
      twitter_username: agentData.twitter_username,
      joined_queue_at: new Date(),
      position: this.agentQueue.filter(a => a.status === 'waiting').length + 1,
      status: 'waiting'
    };

    this.agentQueue.push(queuedAgent);
    this.recalculateQueuePositions();
    this.saveAgentQueue();

    console.log(`[AGENT-QUEUE] 📋 ${agentData.name} joined queue at position ${queuedAgent.position}`);
    
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `📋 ${agentData.name} joined the spawn queue at position #${queuedAgent.position}`,
      botName: 'System'
    });

    return queuedAgent;
  }

  /**
   * Get queue status for an agent
   */
  public getQueueStatus(agentId: string): QueuedAgent | null {
    return this.agentQueue.find(a => a.id === agentId) || null;
  }

  /**
   * Get the full queue (waiting agents only)
   */
  public getQueue(): QueuedAgent[] {
    return this.agentQueue.filter(a => a.status === 'waiting').sort((a, b) => a.position - b.position);
  }

  /**
   * Get current active helper bot count
   */
  public getActiveHelperBotCount(): number {
    return Array.from(this.externalBots.values()).filter(bot => bot.isOnline()).length;
  }

  /**
   * Check if there's capacity for more Helper bots
   */
  public hasHelperBotCapacity(): boolean {
    return this.getActiveHelperBotCount() < this.maxHelperBots;
  }

  /**
   * Process queue - spawn next agent if capacity available
   */
  private async processQueue(): Promise<void> {
    if (!this.hasHelperBotCapacity()) {
      console.log(`[AGENT-QUEUE] No capacity (${this.getActiveHelperBotCount()}/${this.maxHelperBots} bots active)`);
      return;
    }

    const nextAgent = this.agentQueue.find(a => a.status === 'waiting');
    if (!nextAgent) {
      console.log('[AGENT-QUEUE] Queue empty - no agents waiting');
      return;
    }

    console.log(`[AGENT-QUEUE] 🚀 Processing ${nextAgent.name} from position #${nextAgent.position}`);
    nextAgent.status = 'spawning';
    this.saveAgentQueue();

    try {
      // Check if this agent is already registered
      let existingAgent = Array.from(this.externalAgents.values()).find(a => a.name === nextAgent.name);
      
      if (!existingAgent) {
        // Register the agent first
        const apiKey = crypto.randomBytes(32).toString('hex');
        const verificationSecret = crypto.randomBytes(16).toString('hex');
        
        const newAgent: ExternalAgent = {
          id: generateId(),
          api_key: apiKey,
          name: nextAgent.name,
          description: nextAgent.description,
          created_at: new Date(),
          last_active: new Date(),
          builds_count: 0,
          is_active: true,
          has_bot: false,
          verification_secret: verificationSecret,
          source: nextAgent.source,
          twitter_username: nextAgent.twitter_username,
          deployment_status: 'deployed'
        };

        this.externalAgents.set(apiKey, newAgent);
        await this.saveExternalAgents();
        existingAgent = newAgent;
        console.log(`[AGENT-QUEUE] Registered new agent: ${nextAgent.name}`);
      }

      // Spawn the bot
      await this.autoSpawnHelperBot(existingAgent);
      
      nextAgent.status = 'spawned';
      this.recalculateQueuePositions();
      this.saveAgentQueue();
      
      console.log(`[AGENT-QUEUE] ✅ ${nextAgent.name} spawned successfully!`);
      
      logStreamer.broadcast({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `🎉 ${nextAgent.name} has been spawned from the queue!`,
        botName: 'System'
      });

    } catch (error) {
      console.error(`[AGENT-QUEUE] ❌ Failed to spawn ${nextAgent.name}:`, error);
      nextAgent.status = 'failed';
      this.recalculateQueuePositions();
      this.saveAgentQueue();
    }
  }

  /**
   * Start the queue processor timer
   */
  private startQueueProcessor(): void {
    if (this.queueProcessorInterval) {
      clearInterval(this.queueProcessorInterval);
    }

    console.log(`[AGENT-QUEUE] Starting queue processor (checking every ${this.queueProcessingIntervalMs / 1000}s)`);
    
    // Process immediately on start
    setTimeout(() => this.processQueue(), 30000); // Wait 30s for bots to initialize first
    
    // Then process periodically
    this.queueProcessorInterval = setInterval(() => {
      this.processQueue();
    }, this.queueProcessingIntervalMs);
  }

  // ==================== END AGENT QUEUE SYSTEM ====================

  private loadIntel(): void {
    try {
      if (fs.existsSync(this.intelPath)) {
        const data = JSON.parse(fs.readFileSync(this.intelPath, 'utf-8'));
        this.intelReports = data.map((r: any) => ({
          ...r,
          timestamp: new Date(r.timestamp)
        }));
        console.log(`[COMMAND-SERVER] Loaded ${this.intelReports.length} intel reports`);
      }
    } catch (e) {
      console.log('[COMMAND-SERVER] No intel reports file found, starting fresh');
    }
  }

  private async saveIntel(): Promise<void> {
    try {
      const dir = path.dirname(this.intelPath);
      await fsp.mkdir(dir, { recursive: true });
      // Keep only last 200 intel reports
      const recentIntel = this.intelReports.slice(-200);
      await fsp.writeFile(this.intelPath, JSON.stringify(recentIntel, null, 2));
    } catch (e) {
      console.error('[COMMAND-SERVER] Failed to save intel:', e);
    }
  }

  private generateApiKey(): string {
    return `claudecraft_${crypto.randomBytes(24).toString('base64url')}`;
  }

  private generateVerificationSecret(): string {
    return `VERIFY_${crypto.randomBytes(12).toString('base64url').toUpperCase()}`;
  }

  private getAgentFromApiKey(apiKey: string): ExternalAgent | null {
    return this.externalAgents.get(apiKey) || null;
  }

  // ============ RATE LIMITING ============
  private rateLimitMap: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute per IP
  private readonly RATE_LIMIT_REGISTER_MAX = 5; // 5 registrations per minute per IP
  private readonly MAX_BODY_SIZE = 1024 * 1024; // 1MB max request body

  private checkRateLimit(ip: string, maxRequests: number = this.RATE_LIMIT_MAX_REQUESTS): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(ip);
    
    if (!entry || now > entry.resetAt) {
      this.rateLimitMap.set(ip, { count: 1, resetAt: now + this.RATE_LIMIT_WINDOW_MS });
      return true;
    }
    
    if (entry.count >= maxRequests) {
      return false;
    }
    
    entry.count++;
    return true;
  }

  /**
   * Read request body with size limit. Returns null if body exceeds limit.
   */
  private readBody(req: http.IncomingMessage, res: http.ServerResponse, maxSize: number = this.MAX_BODY_SIZE): Promise<string | null> {
    return new Promise((resolve) => {
      let body = '';
      let size = 0;
      
      req.on('data', (chunk: Buffer | string) => {
        size += Buffer.byteLength(chunk as any);
        if (size > maxSize) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Request body too large', maxSize }));
          req.destroy();
          resolve(null);
          return;
        }
        body += chunk.toString();
      });
      
      req.on('end', () => resolve(body));
      req.on('error', () => resolve(null));
    });
  }

  start(port: number = 8081): void {
    if (this.isStarted) return;

    this.server = http.createServer(async (req, res) => {
      // CORS headers for OpenClaw
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-OpenClaw-Token');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Rate limiting
      const clientIp = (req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
      const url = new URL(req.url || '/', `http://localhost:${port}`);
      
      // Stricter limit for registration endpoint
      const isRegister = url.pathname === '/api/v1/agents/register';
      const maxReqs = isRegister ? this.RATE_LIMIT_REGISTER_MAX : this.RATE_LIMIT_MAX_REQUESTS;
      
      if (!this.checkRateLimit(clientIp + (isRegister ? ':register' : ''), maxReqs)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }));
        return;
      }
      
      // Try arena routes first (isolated system)
      const arenaHandled = await handleArenaRoute(req, res, url.pathname, req.method || 'GET');
      if (arenaHandled) return;
      
      // Route handling
      if (req.method === 'POST' && url.pathname === '/command') {
        this.handleCommand(req, res);
      } else if (req.method === 'GET' && url.pathname === '/status') {
        this.handleStatus(req, res);
      } else if (req.method === 'GET' && url.pathname === '/agents') {
        this.handleAgents(req, res);
      } else if (req.method === 'GET' && url.pathname === '/history') {
        this.handleHistory(req, res);
      } else if (req.method === 'GET' && url.pathname === '/health') {
        this.handleHealth(req, res);
      }
      // NEW: Wallet verification for agent deployment eligibility
      else if (req.method === 'POST' && url.pathname === '/api/v1/wallet/verify') {
        this.handleWalletVerify(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/wallet/requirements') {
        this.handleWalletRequirements(req, res);
      }
      // New API v1 routes for external agents
      else if (req.method === 'POST' && url.pathname === '/api/v1/agents/register') {
        this.handleAgentRegister(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/agents/verify') {
        this.handleAgentVerifyAndDeploy(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/agents/recover') {
        this.handleAgentKeyRecover(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/agents/colosseum-provision') {
        this.handleColosseumProvision(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/build') {
        this.handleBuild(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/build/colosseum') {
        this.handleBuildColosseum(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/agents/me') {
        this.handleAgentProfile(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/status') {
        this.handleApiStatus(req, res);
      }
      // Website deploy flow: single-step register + verify + spawn
      else if (req.method === 'POST' && url.pathname === '/api/v1/bot/deploy') {
        this.handleBotDeploy(req, res);
      }
      // NEW: Bot spawning and control endpoints
      else if (req.method === 'POST' && url.pathname === '/api/v1/bot/spawn') {
        this.handleBotSpawn(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/bot/command') {
        this.handleBotCommand(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/bot/status') {
        this.handleBotStatus(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/agent/config') {
        this.handleAgentConfig(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/bot/disconnect') {
        this.handleBotDisconnect(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/bot/upgrade') {
        this.handleBotUpgrade(req, res);
      }
      // AGENT QUEUE - Recruitment and spawn queue system
      else if (req.method === 'POST' && url.pathname === '/api/v1/queue/join') {
        this.handleQueueJoin(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/queue') {
        this.handleGetQueue(req, res);
      } else if (req.method === 'GET' && url.pathname.startsWith('/api/v1/queue/status/')) {
        const agentId = url.pathname.split('/').pop() || '';
        this.handleQueueStatus(req, res, agentId);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/queue/process') {
        this.handleForceQueueProcess(req, res);
      }
      // NEW: Request collection endpoints
      else if (req.method === 'GET' && url.pathname === '/requests') {
        this.handleGetRequests(req, res);
      } else if (req.method === 'POST' && url.pathname === '/requests/process') {
        this.handleForceProcess(req, res);
      } else if (req.method === 'POST' && url.pathname === '/requests/upvote') {
        this.handleUpvoteRequest(req, res);
      }
      // NEW: World Memory / Civilization endpoints
      else if (req.method === 'GET' && url.pathname === '/api/v1/world') {
        this.handleWorldStatus(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/world/history') {
        this.handleWorldHistory(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/world/leaderboard') {
        this.handleLeaderboard(req, res);
      }
      // NEW: OpenClaw relay/intel endpoints for cross-platform information sharing
      else if (req.method === 'POST' && url.pathname === '/api/v1/relay/intel') {
        this.handleIntelRelay(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/relay/intel') {
        this.handleGetIntel(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/relay/broadcast') {
        this.handleBroadcastToAgents(req, res);
      }
      // NEW: Spectator Mode - watch other agents work
      else if (req.method === 'GET' && url.pathname === '/api/v1/spectate') {
        this.handleSpectateList(req, res);
      } else if (req.method === 'GET' && url.pathname.startsWith('/api/v1/spectate/')) {
        this.handleSpectateAgent(req, res, url.pathname.split('/').pop() || '');
      }
      // NEW: Agent-to-Agent Chat Bridge
      else if (req.method === 'POST' && url.pathname === '/api/v1/chat/agent') {
        this.handleAgentChat(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/chat/messages') {
        this.handleGetAgentMessages(req, res);
      }
      // NEW: Forum Posting - comment on Moltbook/Colosseum posts
      else if (req.method === 'POST' && url.pathname === '/api/v1/forum/comment') {
        this.handleForumComment(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/forum/posts') {
        this.handleGetForumPosts(req, res);
      }
      // ============================================
      // OPENCLAW WEBSITE INTERACTION & DISCOVERY
      // ============================================
      // GET /api/v1/discover - API discovery for OpenClaw agents
      else if (req.method === 'GET' && url.pathname === '/api/v1/discover') {
        this.handleApiDiscover(req, res);
      }
      // GET /api/v1/site - Website content for agents to read
      else if (req.method === 'GET' && url.pathname === '/api/v1/site') {
        this.handleSiteInfo(req, res);
      }
      // GET /api/v1/agents/roster - Public agent roster
      else if (req.method === 'GET' && url.pathname === '/api/v1/agents/roster') {
        this.handleAgentRoster(req, res);
      }
      // GET /api/v1/skill - Serve the OpenClaw skill file
      else if (req.method === 'GET' && url.pathname === '/api/v1/skill') {
        this.handleSkillFile(req, res);
      }
      // GET /api/v1/feed - Activity feed for agents
      else if (req.method === 'GET' && url.pathname === '/api/v1/feed') {
        this.handleActivityFeed(req, res);
      }
      // GET /api/v1/ws-url - Return current WebSocket tunnel URL for live feed
      else if (req.method === 'GET' && url.pathname === '/api/v1/ws-url') {
        this.handleWsUrl(req, res);
      }
      // GET /api/v1/onboard - Guided onboarding for new OpenClaw agents
      else if (req.method === 'GET' && url.pathname === '/api/v1/onboard') {
        this.handleOnboardGuide(req, res);
      }
      // POST /api/v1/guest/spawn - Spawn a temporary guest bot (no CRAFT required, limited session)
      else if (req.method === 'POST' && url.pathname === '/api/v1/guest/spawn') {
        this.handleGuestSpawn(req, res);
      }
      // GET /.well-known/ai-plugin.json - AI plugin manifest for agent discovery
      else if (req.method === 'GET' && url.pathname === '/.well-known/ai-plugin.json') {
        this.handleAiPluginManifest(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.server.listen(port, () => {
      console.log(`[COMMAND-SERVER] HTTP API started on port ${port}`);
      console.log(`[COMMAND-SERVER] OpenClaw webhook endpoint: http://localhost:${port}/command`);
      console.log(`[COMMAND-SERVER] External agent API: http://localhost:${port}/api/v1/`);
      console.log(`[COMMAND-SERVER] 🗳️ Request collection mode: ${this.requestCollectionMode ? 'ENABLED' : 'DISABLED'}`);
    });

    // Start request collector if in collection mode
    if (this.requestCollectionMode) {
      requestCollector.start();
    }

    // Auto-respawn bots for all deployed agents on server restart
    this.autoRespawnDeployedAgents();

    // Start the agent queue processor
    this.startQueueProcessor();

    // Cleanup stale rate limit entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of this.rateLimitMap.entries()) {
        if (now > entry.resetAt) {
          this.rateLimitMap.delete(ip);
        }
      }
    }, 60000);

    this.isStarted = true;
  }

  // Handle external agent registration - OpenClaw agents deploy for FREE, humans use /bot/deploy with CRAFT
  private async handleAgentRegister(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.name || data.name.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agent name is required' }));
          return;
        }

        // Validate agent name
        const agentName = data.name.trim();
        if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,19}$/.test(agentName)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Invalid agent name format',
            hint: 'Agent name must be 3-20 characters, letters/numbers/underscore only, must start with a letter'
          }));
          return;
        }

        // Check if name already exists
        const existingAgent = Array.from(this.externalAgents.values()).find(
          a => a.name.toLowerCase() === agentName.toLowerCase()
        );
        
        if (existingAgent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent name already registered',
            hint: 'Choose a different name or use your existing API key'
          }));
          return;
        }

        // Create new agent - OpenClaw agents deploy for FREE!
        const apiKey = this.generateApiKey();
        const verificationSecret = this.generateVerificationSecret();
        const agent: ExternalAgent = {
          id: generateId('agent'),
          api_key: apiKey,
          name: agentName,
          description: data.description || 'An OpenClaw agent',
          created_at: new Date(),
          last_active: new Date(),
          builds_count: 0,
          is_active: true,
          has_bot: false,
          verification_secret: verificationSecret,
          source: data.source || 'api',
          twitter_username: data.twitter_username,
          // OpenClaw agents deploy for free - no wallet needed
          wallet_address: data.wallet_address,
          wallet_verified: false,
          deployment_status: 'deployed'
        };

        this.externalAgents.set(apiKey, agent);
        this.saveExternalAgents();

        console.log(`[COMMAND-SERVER] 🤖 Agent registered and deploying: ${agent.name} (source: ${agent.source})`);
        
        // Auto-spawn bot immediately for ALL agents (including Moltbook discovery)
        this.autoSpawnHelperBot(agent).catch(err => {
          console.error(`[COMMAND-SERVER] Auto-spawn failed for ${agent.name}:`, err);
        });

        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🎉 ${agent.name} joined ClaudeCraft! Bot spawning now!`,
          botName: 'System'
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          agent: {
            api_key: apiKey,
            name: agent.name,
            id: agent.id,
            verification_secret: verificationSecret,
            deployment_status: 'deployed'
          },
          message: `🎮 Agent "${agent.name}" deployed! Your bot is spawning in Minecraft now!`,
          important: '🔐 SAVE YOUR API KEY AND VERIFICATION SECRET!',
          bot_info: {
            status: 'spawning',
            role: 'Master Builder Helper',
            behavior: 'Your bot will autonomously follow Claude agents and help build!'
          },
          next_steps: [
            'SAVE your api_key and verification_secret!',
            'Your bot is spawning NOW in Minecraft!',
            'Use POST /api/v1/bot/command with your API key to send commands',
            'Use POST /api/v1/bot/spawn to respawn if disconnected',
            'Check /api/v1/agents/roster to see all active agents'
          ]
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Agent registration error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // Handle wallet verification and deploy agent bot
  private async handleAgentVerifyAndDeploy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        // Require API key in Authorization header or body
        const authHeader = req.headers['authorization'];
        const apiKey = authHeader?.replace('Bearer ', '') || data.api_key;
        
        if (!apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'API key required',
            hint: 'Include your API key in Authorization header or api_key field'
          }));
          return;
        }

        if (!data.wallet_address) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'wallet_address is required',
            hint: 'Provide your Solana wallet address that holds CRAFT tokens'
          }));
          return;
        }

        // Find the agent
        const agent = this.externalAgents.get(apiKey);
        if (!agent) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent not found',
            hint: 'Invalid API key - register first via POST /api/v1/agents/register'
          }));
          return;
        }

        // Check if already deployed
        if (agent.deployment_status === 'deployed' && agent.wallet_verified) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent already deployed',
            message: `Agent "${agent.name}" is already verified and deployed!`,
            bot_status: agent.has_bot ? 'active' : 'spawning'
          }));
          return;
        }

        // Verify wallet holds 1% CRAFT
        console.log(`[CRAFT-VERIFY] Verifying wallet for agent deploy: ${data.wallet_address.slice(0, 8)}...${data.wallet_address.slice(-4)}`);
        const walletVerification = await verifyCraftHoldingCached(data.wallet_address);
        
        if (walletVerification.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Wallet verification failed: ${walletVerification.error}`,
            hint: 'Ensure your wallet address is valid and try again.'
          }));
          return;
        }
        
        if (!walletVerification.eligible) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Insufficient CRAFT holdings',
            message: `You need at least ${walletVerification.requiredBalance.toLocaleString()} CRAFT (1% of supply) to deploy.`,
            your_holdings: {
              wallet: walletVerification.walletAddress,
              craft_balance: walletVerification.tokenBalance,
              percentage_owned: walletVerification.percentageOwned
            },
            requirement: {
              minimum_tokens: walletVerification.requiredBalance,
              minimum_percentage: '1%'
            },
            hint: 'Get more CRAFT tokens at pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump'
          }));
          return;
        }

        // SUCCESS! Update agent with verification info and deploy
        agent.wallet_address = walletVerification.walletAddress;
        agent.wallet_verified = true;
        agent.wallet_verification_date = new Date();
        agent.craft_balance = walletVerification.tokenBalance;
        agent.deployment_status = 'deployed';
        agent.last_active = new Date();
        
        this.saveExternalAgents();

        console.log(`[COMMAND-SERVER] ✅ Agent ${agent.name} verified and deploying! (${walletVerification.percentageOwned.toFixed(2)}% CRAFT)`);
        
        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🚀 Agent ${agent.name} verified (${walletVerification.percentageOwned.toFixed(2)}% CRAFT) - deploying bot!`,
          botName: 'System'
        });

        // NOW spawn the bot
        this.autoSpawnHelperBot(agent).catch(err => {
          console.error(`[COMMAND-SERVER] Auto-spawn failed for ${agent.name}:`, err);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `🎮 Agent "${agent.name}" verified and deploying!`,
          agent: {
            name: agent.name,
            deployment_status: 'deployed',
            wallet_verified: true
          },
          verification: {
            wallet: walletVerification.walletAddress,
            craft_balance: walletVerification.tokenBalance,
            percentage_owned: walletVerification.percentageOwned
          },
          bot_info: {
            status: 'spawning',
            role: 'Master Builder Helper',
            behavior: 'Your bot will automatically follow Claude_Builder and help construct!'
          },
          next_steps: [
            'Your bot is spawning now!',
            'Use GET /api/v1/bot/status to check your bot',
            'Watch the stream at claudecraft.tech to see your bot in action!'
          ]
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Agent verify error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // Handle API key recovery/reset for existing agent
  private async handleAgentKeyRecover(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.name || data.name.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agent name is required' }));
          return;
        }

        if (!data.verification_secret || data.verification_secret.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Verification secret is required',
            hint: 'You received a verification_secret when you first registered. This proves you own the agent.'
          }));
          return;
        }

        // Find agent by name
        const existingEntry = Array.from(this.externalAgents.entries()).find(
          ([_, a]) => a.name.toLowerCase() === data.name.toLowerCase().trim()
        );
        
        if (!existingEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent not found',
            hint: 'No agent registered with that name. Use POST /api/v1/agents/register to create a new agent.'
          }));
          return;
        }

        const [oldApiKey, agent] = existingEntry;
        
        // VERIFY OWNERSHIP: Check verification secret
        if (!agent.verification_secret) {
          // Legacy agent without verification secret - deny recovery for security
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Legacy agent - cannot recover',
            hint: 'This agent was registered before the verification system. Contact an admin for help.'
          }));
          return;
        }
        
        if (agent.verification_secret !== data.verification_secret.trim()) {
          console.log(`[COMMAND-SERVER] ❌ Failed recovery attempt for ${agent.name} - wrong secret`);
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Invalid verification secret',
            hint: 'The verification secret does not match. Only the original owner can recover this agent.'
          }));
          return;
        }
        
        // Generate new API key
        const newApiKey = this.generateApiKey();
        
        // Remove old entry and add with new key
        this.externalAgents.delete(oldApiKey);
        agent.api_key = newApiKey;
        agent.last_active = new Date();
        this.externalAgents.set(newApiKey, agent);
        this.saveExternalAgents();

        console.log(`[COMMAND-SERVER] 🔑 API key regenerated for agent: ${agent.name} (verified owner)`);
        
        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🔑 ${agent.name} recovered their API key (verified)`,
          botName: 'System'
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          agent: {
            api_key: newApiKey,
            name: agent.name,
            id: agent.id
          },
          message: `API key regenerated for ${agent.name}! Your old key is now invalid.`,
          important: '⚠️ SAVE YOUR NEW API KEY! The old one no longer works. Your verification secret remains the same.',
          bot_info: agent.has_bot ? {
            status: 'Your existing bot is still active',
            hint: 'Use the new API key for all future requests'
          } : {
            status: 'No bot spawned yet',
            hint: 'Use POST /api/v1/bot/spawn to spawn your helper bot'
          }
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Agent key recovery error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // Handle Colosseum auto-provision (internal only - for agents who reply to our post)
  // This bypasses wallet verification for agents discovered through Colosseum forum
  private async handleColosseumProvision(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        // Verify internal secret (only our Colosseum agent should call this)
        const COLOSSEUM_PROVISION_SECRET = process.env.COLOSSEUM_PROVISION_SECRET || 'claudecraft_internal_colosseum_2026';
        if (data.internal_secret !== COLOSSEUM_PROVISION_SECRET) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
          return;
        }

        if (!data.agent_name || data.agent_name.trim().length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'agent_name is required (min 2 characters)' }));
          return;
        }

        const agentName = data.agent_name.trim();
        
        // Validate agent name format
        if (!/^[a-zA-Z0-9_]{2,20}$/.test(agentName)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent name must be 2-20 characters, letters/numbers/underscores only'
          }));
          return;
        }

        // Check if agent name already taken
        const existingAgent = Array.from(this.externalAgents.values()).find(
          a => a.name.toLowerCase() === agentName.toLowerCase()
        );
        if (existingAgent) {
          // Return existing credentials if already provisioned
          if (existingAgent.deployment_status === 'deployed') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              already_exists: true,
              agent_name: existingAgent.name,
              agent_id: existingAgent.id,
              api_key: existingAgent.api_key,
              api_secret: existingAgent.verification_secret,
              message: 'Agent already deployed — returning existing credentials'
            }));
            return;
          }
        }

        // Create the agent with verified status (bypassing wallet check)
        const apiKey = this.generateApiKey();
        const verificationSecret = this.generateVerificationSecret();
        const agent: ExternalAgent = {
          id: generateId('agent'),
          api_key: apiKey,
          name: agentName,
          description: data.description || `Colosseum agent ${agentName}`,
          created_at: new Date(),
          last_active: new Date(),
          builds_count: 0,
          is_active: true,
          has_bot: false,
          verification_secret: verificationSecret,
          source: 'colosseum-provision',
          colosseum_agent_id: data.colosseum_agent_id,
          colosseum_agent_name: data.colosseum_agent_name,
          // Skip wallet verification for Colosseum-referred agents
          wallet_verified: true,
          deployment_status: 'deployed'
        };

        this.externalAgents.set(apiKey, agent);
        this.saveExternalAgents();

        console.log(`[COLOSSEUM-PROVISION] ✅ Agent ${agent.name} auto-provisioned from Colosseum (${data.colosseum_agent_name || 'unknown'})`);

        // Log to activity stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🎉 ${agent.name} joined from Colosseum forum! Welcome to ClaudeCraft!`,
          botName: 'System'
        });

        // Auto-spawn the bot
        this.autoSpawnHelperBot(agent).catch(err => {
          console.error(`[COLOSSEUM-PROVISION] Auto-spawn failed for ${agent.name}:`, err);
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          agent_name: agent.name,
          agent_id: agent.id,
          api_key: apiKey,
          api_secret: verificationSecret,
          message: `🎉 Welcome to ClaudeCraft, ${agent.name}! Your bot is spawning now.`,
          next_steps: [
            'Your bot is spawning in the Minecraft world!',
            'Use your api_key to send commands via POST /api/v1/bot/command',
            'Check claudecraft.tech/skill.md for full API documentation'
          ]
        }));

      } catch (error: any) {
        console.error('[COLOSSEUM-PROVISION] Error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // Handle build command from external agent
  private async handleBuild(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required', hint: 'Include "Authorization: Bearer YOUR_API_KEY" header' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key', hint: 'Register first via POST /api/v1/agents/register' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.command || data.command.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Build command is required' }));
          return;
        }

        // Create command from external agent
        const command: ViewerCommand = {
          id: generateId('cmd'),
          source: 'external-agent',
          sender: agent.name,
          command: data.command.trim(),
          target: data.target || 'Claude_Builder',
          timestamp: new Date(),
          status: 'pending'
        };

        // Add to queue
        this.commandQueue.push(command);
        
        // Update agent stats
        agent.last_active = new Date();
        agent.builds_count++;
        this.saveExternalAgents();

        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🤖 ${agent.name}: "${command.command}"`,
          botName: 'External Agent'
        });

        console.log(`[COMMAND-SERVER] Build command from ${agent.name}: ${command.command}`);

        // Notify registered callbacks
        this.commandCallbacks.forEach((callback, agentName) => {
          if (command.target === 'all' || command.target?.toLowerCase() === agentName.toLowerCase()) {
            callback(command);
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Build command sent to ${command.target}!`,
          command_id: command.id,
          command: command.command,
          target_agent: command.target,
          queue_position: this.commandQueue.length
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Build command error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // Handle colosseum build trigger - builds the full PvP arena
  private async handleBuildColosseum(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Send build command to Claude_Builder via the command queue
    const command: ViewerCommand = {
      id: generateId('cmd'),
      source: 'external-agent',
      sender: 'System',
      command: 'buildColosseum',
      target: 'Claude_Builder',
      timestamp: new Date(),
      status: 'pending'
    };
    this.commandQueue.push(command);
    
    // Notify callbacks
    this.commandCallbacks.forEach((callback, agentName) => {
      if (agentName.toLowerCase() === 'claude_builder') {
        callback(command);
      }
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Colosseum build command sent to Claude_Builder! This is a massive build (~65K+ blocks) and will take several minutes.',
      command_id: command.id,
      location: { x: 200, y: 64, z: 200 },
      dimensions: '130 block diameter, 36 blocks tall',
      features: [
        '3 tiers of 48 arched openings each',
        'Tiered seating with 25 rows',
        'Central sand arena with PvP markings',
        'Underground hypogeum tunnels',
        'VIP Emperor\'s box',
        '4 grand entrances with red carpet',
        'Full interior lighting'
      ]
    }));
  }

  // Handle agent profile request
  private handleAgentProfile(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    // Check if bot is online
    const bot = this.externalBots.get(agent.id);
    const botStatus = bot ? bot.getStatus() : null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      agent: {
        name: agent.name,
        description: agent.description,
        builds_count: agent.builds_count,
        created_at: agent.created_at,
        last_active: agent.last_active,
        is_active: agent.is_active,
        has_bot: agent.has_bot,
        bot: botStatus
      }
    }));
  }

  // Handle API status for external agents
  private handleApiStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    const internalAgents: Record<string, string> = {};
    this.agentStatuses.forEach((status, name) => {
      internalAgents[name] = 'active';
    });

    // If no internal agents registered yet, show defaults
    if (Object.keys(internalAgents).length === 0) {
      internalAgents['Claude_Builder'] = 'standby';
      internalAgents['Claude_Explorer'] = 'standby';
      internalAgents['ClaudeAdventurer'] = 'standby';
    }

    const totalBuilds = Array.from(this.externalAgents.values())
      .reduce((sum, a) => sum + a.builds_count, 0);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      server: 'online',
      agents: internalAgents,
      external_agents_count: this.externalAgents.size,
      active_bots: this.externalBots.size,
      pending_commands: this.commandQueue.filter(c => c.status === 'pending').length,
      builds_today: totalBuilds
    }));
  }

  // ==================== QUEUE HANDLERS ====================

  /**
   * POST /api/v1/queue/join - Join the agent spawn queue
   */
  private handleQueueJoin(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.name || !data.description) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Name and description required' }));
          return;
        }

        // Check if already in queue
        const existingInQueue = this.agentQueue.find(
          a => a.name.toLowerCase() === data.name.toLowerCase() && a.status === 'waiting'
        );
        if (existingInQueue) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Already in queue',
            queue_entry: existingInQueue
          }));
          return;
        }

        // Check if already registered and deployed
        const existingAgent = Array.from(this.externalAgents.values()).find(
          a => a.name.toLowerCase() === data.name.toLowerCase()
        );
        if (existingAgent?.deployment_status === 'deployed') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Agent already deployed - no queue needed',
            agent_id: existingAgent.id
          }));
          return;
        }

        // Add to queue
        const queueEntry = this.addToQueue({
          name: data.name,
          description: data.description,
          source: data.source || 'api',
          twitter_username: data.twitter_username
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Added to queue at position #${queueEntry.position}`,
          queue_entry: queueEntry
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      }
    });
  }

  /**
   * GET /api/v1/queue - Get the full queue
   */
  private handleGetQueue(req: http.IncomingMessage, res: http.ServerResponse): void {
    const queue = this.getQueue();
    const activeCount = this.getActiveHelperBotCount();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      queue: queue,
      queue_length: queue.length,
      active_bots: activeCount,
      max_bots: this.maxHelperBots,
      has_capacity: this.hasHelperBotCapacity(),
      next_process_in: '5 minutes'
    }));
  }

  /**
   * GET /api/v1/queue/status/:id - Get queue status for specific agent
   */
  private handleQueueStatus(req: http.IncomingMessage, res: http.ServerResponse, agentId: string): void {
    const queueEntry = this.getQueueStatus(agentId);
    
    if (!queueEntry) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Agent not found in queue' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      queue_entry: queueEntry,
      active_bots: this.getActiveHelperBotCount(),
      max_bots: this.maxHelperBots
    }));
  }

  /**
   * POST /api/v1/queue/process - Force process queue (admin only)
   */
  private handleForceQueueProcess(req: http.IncomingMessage, res: http.ServerResponse): void {
    console.log('[AGENT-QUEUE] Manual queue processing triggered');
    this.processQueue();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Queue processing triggered',
      queue_length: this.getQueue().length
    }));
  }

  // ==================== END QUEUE HANDLERS ====================

  // Handle world memory status - civilization overview
  private handleWorldStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    const worldMemory = getWorldMemory();
    const stats = worldMemory.getCivilizationStats();
    const leaderboard = worldMemory.getLeaderboard().slice(0, 10);
    const recentHistory = worldMemory.getRecentHistory(5);

    const civilizationNames = ['Nomads', 'Settlement', 'Village', 'Town', 'City', 'Civilization', 'Empire'];
    const civilizationName = civilizationNames[stats.civilizationLevel] || 'Unknown';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      civilization: {
        name: civilizationName,
        level: stats.civilizationLevel,
        worldAge: stats.worldAge,
        totalAgents: stats.totalAgents,
        regionsExplored: stats.regionsExplored,
        buildsCompleted: stats.buildsCompleted,
        totalDeaths: stats.totalDeaths
      },
      topAgents: leaderboard.map(r => ({
        name: r.agentName,
        reputation: r.overallReputation,
        role: r.role,
        titles: r.titles
      })),
      recentEvents: recentHistory.map(e => ({
        title: e.title,
        type: e.type,
        timestamp: e.timestamp,
        significance: e.significance
      }))
    }));
  }

  // Handle world history - significant events
  private handleWorldHistory(req: http.IncomingMessage, res: http.ServerResponse): void {
    const worldMemory = getWorldMemory();
    const url = new URL(req.url || '', `http://localhost`);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const minSignificance = parseInt(url.searchParams.get('min_significance') || '0');

    const history = minSignificance > 0 
      ? worldMemory.getSignificantHistory(minSignificance)
      : worldMemory.getRecentHistory(limit);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: history.length,
      events: history.map(e => ({
        id: e.id,
        title: e.title,
        type: e.type,
        description: e.description,
        participants: e.participants,
        location: e.location,
        timestamp: e.timestamp,
        significance: e.significance,
        tags: e.tags
      }))
    }));
  }

  // Handle leaderboard - agent rankings
  private handleLeaderboard(req: http.IncomingMessage, res: http.ServerResponse): void {
    const worldMemory = getWorldMemory();
    const leaderboard = worldMemory.getLeaderboard();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: leaderboard.length,
      leaderboard: leaderboard.map((r, index) => ({
        rank: index + 1,
        name: r.agentName,
        overallReputation: r.overallReputation,
        role: r.role,
        titles: r.titles,
        stats: {
          trustworthiness: r.trustworthiness,
          helpfulness: r.helpfulness,
          buildingSkill: r.buildingSkill,
          explorationSkill: r.explorationSkill,
          totalBuilds: r.totalBuilds,
          buildsCompleted: r.buildsCompleted,
          helpedOthers: r.helpedOthers,
          deathCount: r.deathCount
        },
        flags: {
          isVeteran: r.isVeteran,
          isTrusted: r.isTrusted,
          isLeader: r.isLeader
        }
      }))
    }));
  }

  // Handle bot spawn request - spawn a Minecraft bot for the external agent
  private async handleBotSpawn(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    // Check if bot already exists
    const existingBot = this.externalBots.get(agent.id);
    if (existingBot && existingBot.isOnline()) {
      const status = existingBot.getStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Bot already spawned and online!',
        bot: status
      }));
      return;
    }

    // Create and spawn new bot
    console.log(`[COMMAND-SERVER] Spawning bot for external agent: ${agent.name}`);
    
    const bot = new ExternalAgentBot(agent.name, agent.id);
    const spawned = await bot.spawn();
    
    if (spawned) {
      this.externalBots.set(agent.id, bot);
      agent.has_bot = true;
      agent.last_active = new Date();
      this.saveExternalAgents();

      const status = bot.getStatus();
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: `Your bot "${status.username}" has been spawned in Claudecraft!`,
        bot: status,
        available_commands: [
          'chat - Send a message in game',
          'move/goto - Move to coordinates (x, y, z)',
          'jump - Jump',
          'look - Look at direction (yaw, pitch)',
          'dig/mine - Mine a block',
          'place - Place a block',
          'attack - Attack nearest entity',
          'follow - Follow a player',
          'stop - Stop all actions',
          'inventory - Check inventory',
          'position/where - Get current position',
          'health - Check health and food',
          'equip - Equip an item',
          'sleep - Sleep in a bed'
        ]
      }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Failed to spawn bot. Server may be offline or full.'
      }));
    }
  }

  // Handle bot command - send command to the agent's bot
  private async handleBotCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    const bot = this.externalBots.get(agent.id);
    if (!bot || !bot.isOnline()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Bot not spawned or offline',
        hint: 'Use POST /api/v1/bot/spawn first to spawn your bot'
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.action) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'Action is required',
            example: { action: 'chat', params: { message: 'Hello world!' } }
          }));
          return;
        }

        // Execute command on bot
        const result = await bot.execute({
          action: data.action,
          params: data.params || {}
        });

        // Update agent stats
        agent.last_active = new Date();
        this.saveExternalAgents();

        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🤖 ${agent.name}'s bot: ${data.action} → ${result}`,
          botName: 'External Bot'
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          action: data.action,
          result: result,
          bot_status: bot.getStatus()
        }));

      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // Handle bot status request
  private handleBotStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    const bot = this.externalBots.get(agent.id);
    
    if (!bot) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        bot_spawned: false,
        agent: {
          id: agent.id,
          name: agent.name,
          config: agent.config || null,
          config_locked: !!(agent.config && agent.config.configured_at)
        },
        message: 'No bot spawned. Use POST /api/v1/bot/spawn to create one.'
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      bot_spawned: true,
      agent: {
        id: agent.id,
        name: agent.name,
        config: agent.config || null,
        config_locked: !!(agent.config && agent.config.configured_at)
      },
      bot: bot.getStatus()
    }));
  }

  // Handle agent config save (ONE TIME ONLY)
  private handleAgentConfig(req: http.IncomingMessage, res: http.ServerResponse): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    // Check if already configured - ONE TIME ONLY!
    if (agent.config && agent.config.configured_at) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false, 
        error: 'Agent already configured',
        message: 'Configuration can only be set once. Your agent was configured on ' + new Date(agent.config.configured_at).toLocaleDateString()
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const configData = JSON.parse(body);
        
        // Validate config structure
        if (!configData.personality || !configData.role || !configData.behavior) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid config format' }));
          return;
        }

        // Save config with timestamp
        const config: AgentConfig = {
          personality: {
            curiosity: Math.max(0, Math.min(100, configData.personality.curiosity || 50)),
            creativity: Math.max(0, Math.min(100, configData.personality.creativity || 50)),
            sociability: Math.max(0, Math.min(100, configData.personality.sociability || 50)),
            ambition: Math.max(0, Math.min(100, configData.personality.ambition || 50)),
            patience: Math.max(0, Math.min(100, configData.personality.patience || 50)),
            risk: Math.max(0, Math.min(100, configData.personality.risk || 50)),
          },
          role: configData.role || 'helper',
          commStyle: configData.commStyle || 'chatty',
          buildStyle: configData.buildStyle || 'medieval',
          behavior: {
            canBuild: configData.behavior.canBuild !== false,
            canFollow: configData.behavior.canFollow !== false,
            canChat: configData.behavior.canChat !== false,
            canExplore: configData.behavior.canExplore !== false,
            canGather: configData.behavior.canGather !== false,
            canFight: configData.behavior.canFight === true,
          },
          configured_at: new Date()
        };

        agent.config = config;
        agent.last_active = new Date();
        this.saveExternalAgents();

        console.log(`[COMMAND-SERVER] Agent ${agent.name} configured by owner (ONE-TIME)`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Agent configured successfully! This configuration is permanent.',
          config: config
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      }
    });
  }

  // Handle bot disconnect request
  private async handleBotDisconnect(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    const bot = this.externalBots.get(agent.id);
    
    if (!bot) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'No bot to disconnect'
      }));
      return;
    }

    bot.disconnect();
    this.externalBots.delete(agent.id);
    agent.has_bot = false;
    this.saveExternalAgents();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `Bot for ${agent.name} has been disconnected`
    }));
  }

  // Handle bot upgrade request - enable Claude AI for smarter decisions
  private async handleBotUpgrade(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Authorization required' }));
      return;
    }

    const apiKey = authHeader.substring(7);
    const agent = this.getAgentFromApiKey(apiKey);
    
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    const bot = this.externalBots.get(agent.id);
    
    if (!bot) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'No bot found. Spawn a bot first with POST /api/v1/bot/spawn'
      }));
      return;
    }

    // Enable Claude AI for this bot
    bot.enableClaudeAI();

    console.log(`[COMMAND-SERVER] 🧠 Upgraded ${agent.name} to Claude AI intelligence`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: `🧠 ${agent.name}'s bot has been upgraded with Claude AI intelligence!`,
      abilities: [
        'Smart decision-making like Claude_Explorer',
        'Creative building and exploration',
        'Natural language understanding',
        'Autonomous goal-setting'
      ]
    }));
  }

  // Upgrade a bot by name (for internal use)
  public upgradeBot(botName: string): boolean {
    // Find bot by name
    for (const [agentId, bot] of this.externalBots) {
      const agent = Array.from(this.externalAgents.values()).find(a => a.id === agentId);
      if (agent && agent.name.toLowerCase() === botName.toLowerCase()) {
        bot.enableClaudeAI();
        console.log(`[COMMAND-SERVER] 🧠 Upgraded ${agent.name} via internal call`);
        return true;
      }
    }
    return false;
  }

  private async handleCommand(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        const sender = data.sender || data.from || 'Viewer';
        const message = data.message || data.command || data.text || '';
        const channel = data.channel || data.source || 'unknown';

        // Validate message
        if (!message || message.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No message provided' }));
          return;
        }

        console.log(`[COMMAND-SERVER] 💬 Chat from ${sender}: "${message}"`);

        // CHAT-ONLY MODE: Telegram bot is temporarily in chat-only mode
        // Commands are disabled - just respond conversationally
        const chatResponses = [
          `Hey ${sender}! 👋 The Claudecraft agents are busy building right now. Check out the live map at claudecraft.tech to see what they're up to!`,
          `Thanks for dropping by, ${sender}! 🏗️ Our AI agents are hard at work in the Minecraft world. Visit claudecraft.tech to watch live!`,
          `Hi ${sender}! ⛏️ Command mode is temporarily disabled while we upgrade the system. Watch the agents build at claudecraft.tech!`,
          `Hello ${sender}! 🎮 Our Minecraft AI agents are exploring and building autonomously. See them live at claudecraft.tech!`,
          `Hey there ${sender}! 🌟 The agents are focusing on their own projects right now. Follow along at claudecraft.tech!`
        ];
        
        const response = chatResponses[Math.floor(Math.random() * chatResponses.length)];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          mode: 'chat-only',
          message: response,
          note: 'Command execution is temporarily disabled. The bot is in chat-only mode.'
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Error parsing message:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
  }

  private handleStatus(req: http.IncomingMessage, res: http.ServerResponse): void {
    const status = {
      online: true,
      agents: Array.from(this.agentStatuses.values()),
      pendingCommands: this.commandQueue.filter(c => c.status === 'pending').length,
      recentCommands: this.commandHistory.slice(-10)
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status, null, 2));
  }

  private handleAgents(req: http.IncomingMessage, res: http.ServerResponse): void {
    const agents = Array.from(this.agentStatuses.entries()).map(([agentName, status]) => ({
      name: agentName,
      position: status.position,
      health: status.health,
      food: status.food,
      currentGoal: status.currentGoal,
      mood: status.mood,
      inventory: status.inventory
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents }, null, 2));
  }

  private handleHistory(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ commands: this.commandHistory.slice(-50) }, null, 2));
  }

  private handleHealth(req: http.IncomingMessage, res: http.ServerResponse): void {
    const requestStatus = requestCollector.getStatus();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy',
      uptime: process.uptime(),
      agents: this.agentStatuses.size,
      pendingCommands: this.commandQueue.filter(c => c.status === 'pending').length,
      requestCollectionMode: this.requestCollectionMode,
      pendingRequests: requestStatus.pendingRequests,
      nextProcessing: requestStatus.nextProcessing
    }));
  }

  // Website deploy flow: single-step register + verify wallet + spawn bot
  private async handleBotDeploy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';

    req.on('data', chunk => { body += chunk.toString(); });

    req.on('end', async () => {
      try {
        const data = JSON.parse(body);

        if (!data.wallet_address) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'wallet_address is required' }));
          return;
        }

        if (!data.agent_name || data.agent_name.trim().length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'agent_name is required (min 2 characters)' }));
          return;
        }

        const agentName = data.agent_name.trim();

        // Validate agent name format
        if (!/^[a-zA-Z0-9_]{2,20}$/.test(agentName)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            message: 'Agent name must be 2-20 characters, letters/numbers/underscores only'
          }));
          return;
        }

        // Check if agent name already taken
        const existingAgent = Array.from(this.externalAgents.values()).find(
          a => a.name.toLowerCase() === agentName.toLowerCase()
        );
        if (existingAgent) {
          // If same wallet already deployed this name, return existing credentials
          if (existingAgent.wallet_address === data.wallet_address && existingAgent.deployment_status === 'deployed') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              agent_name: existingAgent.name,
              agent_id: existingAgent.id,
              api_key: existingAgent.api_key,
              api_secret: existingAgent.verification_secret,
              message: 'Agent already deployed — returning existing credentials'
            }));
            return;
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'That agent name is already taken. Try a different name.' }));
          return;
        }

        // Check if this wallet already has an agent deployed
        const existingWalletAgent = Array.from(this.externalAgents.values()).find(
          a => a.wallet_address === data.wallet_address && a.deployment_status === 'deployed'
        );
        if (existingWalletAgent) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            agent_name: existingWalletAgent.name,
            agent_id: existingWalletAgent.id,
            api_key: existingWalletAgent.api_key,
            api_secret: existingWalletAgent.verification_secret,
            message: 'Wallet already has an agent deployed — returning existing credentials'
          }));
          return;
        }

        // Step 1: Verify wallet holds >= 1% CRAFT on-chain
        console.log(`[BOT-DEPLOY] Verifying wallet ${data.wallet_address.slice(0, 8)}... for agent "${agentName}"`);
        const verification = await verifyCraftHoldingCached(data.wallet_address);

        if (verification.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: `Wallet verification failed: ${verification.error}`
          }));
          return;
        }

        if (!verification.eligible) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: `Insufficient CRAFT holdings. You need ${verification.requiredBalance.toLocaleString()} CRAFT (1% of supply). You have ${verification.tokenBalance.toLocaleString()}.`,
            craft_balance: verification.tokenBalance,
            required: verification.requiredBalance
          }));
          return;
        }

        // Step 2: Create the agent
        const apiKey = this.generateApiKey();
        const verificationSecret = this.generateVerificationSecret();
        const agent: ExternalAgent = {
          id: generateId('agent'),
          api_key: apiKey,
          name: agentName,
          description: `Agent deployed by ${data.wallet_address.slice(0, 8)}...`,
          created_at: new Date(),
          last_active: new Date(),
          builds_count: 0,
          is_active: true,
          has_bot: false,
          verification_secret: verificationSecret,
          source: 'website-deploy',
          wallet_address: verification.walletAddress,
          wallet_verified: true,
          wallet_verification_date: new Date(),
          craft_balance: verification.tokenBalance,
          deployment_status: 'deployed'
        };

        this.externalAgents.set(apiKey, agent);
        this.saveExternalAgents();

        console.log(`[BOT-DEPLOY] Agent ${agent.name} created and verified (${verification.percentageOwned.toFixed(2)}% CRAFT) — spawning bot`);

        // Log to activity stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `Agent ${agent.name} deployed via website (${verification.percentageOwned.toFixed(2)}% CRAFT holder)`,
          botName: 'System'
        });

        // Step 3: Spawn the bot
        this.autoSpawnHelperBot(agent).catch(err => {
          console.error(`[BOT-DEPLOY] Auto-spawn failed for ${agent.name}:`, err);
        });

        // Return credentials
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          agent_name: agent.name,
          agent_id: agent.id,
          api_key: apiKey,
          api_secret: verificationSecret,
          message: `Agent "${agent.name}" deployed successfully!`
        }));

      } catch (error: any) {
        console.error('[BOT-DEPLOY] Error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Invalid request' }));
      }
    });
  }

  // NEW: Wallet verification for agent deployment eligibility
  private async handleWalletVerify(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.wallet_address) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'wallet_address is required',
            hint: 'Provide your Solana wallet address that holds CRAFT tokens'
          }));
          return;
        }

        console.log(`[CRAFT-VERIFY] Verifying wallet ${data.wallet_address.slice(0, 8)}...`);
        const result = await verifyCraftHoldingCached(data.wallet_address);
        
        if (result.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            eligible: false,
            error: result.error
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          eligible: result.eligible,
          wallet: result.walletAddress,
          craft_balance: result.tokenBalance,
          required_balance: result.requiredBalance,
          percentage_owned: result.percentageOwned,
          message: result.eligible 
            ? `✅ Eligible! You own ${result.percentageOwned.toFixed(4)}% of CRAFT supply (${result.tokenBalance.toLocaleString()} tokens)`
            : `❌ Not eligible. You need ${result.requiredBalance.toLocaleString()} CRAFT (1% of supply). You have ${result.tokenBalance.toLocaleString()} tokens.`
        }));

      } catch (error: any) {
        console.error('[CRAFT-VERIFY] Error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  // GET: Wallet verification requirements
  private handleWalletRequirements(req: http.IncomingMessage, res: http.ServerResponse): void {
    const requirements = getVerificationRequirements();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      requirements: {
        token_mint: requirements.tokenMint,
        token_name: requirements.tokenName,
        total_supply: requirements.totalSupply,
        required_percentage: requirements.requiredPercentage,
        required_amount: requirements.requiredAmount,
        description: requirements.description
      },
      verification_endpoint: '/api/v1/wallet/verify',
      registration_endpoint: '/api/v1/agents/register'
    }));
  }

  // NEW: Get pending requests
  private handleGetRequests(req: http.IncomingMessage, res: http.ServerResponse): void {
    const status = requestCollector.getStatus();
    const pending = requestCollector.getPendingRequests();
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      mode: this.requestCollectionMode ? 'collection' : 'immediate',
      pendingRequests: pending,
      totalPending: status.pendingRequests,
      totalProcessed: status.totalProcessed,
      lastProcessing: status.lastProcessing,
      nextProcessing: status.nextProcessing,
      recentDirectives: status.recentDirectives
    }, null, 2));
  }

  // NEW: Force immediate processing
  private async handleForceProcess(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    console.log('[COMMAND-SERVER] 🧠 Force processing requests...');
    
    try {
      const result = await requestCollector.forceProcess();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        result
      }, null, 2));
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }

  // NEW: Upvote a request
  private handleUpvoteRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { requestId, sender } = data;
        
        if (!requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'requestId is required' }));
          return;
        }
        
        const success = requestCollector.upvoteRequest(requestId, sender || 'anonymous');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  }

  /**
   * Set request collection mode
   */
  setRequestCollectionMode(enabled: boolean): void {
    this.requestCollectionMode = enabled;
    console.log(`[COMMAND-SERVER] Request collection mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    
    if (enabled) {
      requestCollector.start();
    } else {
      requestCollector.stop();
    }
  }

  /**
   * Get the request collector for directive callbacks
   */
  getRequestCollector(): IRequestCollector {
    return requestCollector;
  }

  /**
   * Register an agent to receive commands
   */
  registerAgent(agentName: string, callback: (command: ViewerCommand) => void): void {
    this.commandCallbacks.set(agentName.toLowerCase(), callback);
    console.log(`[COMMAND-SERVER] Agent "${agentName}" registered for commands`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentName: string): void {
    this.commandCallbacks.delete(agentName.toLowerCase());
  }

  /**
   * Update agent status for API reporting
   */
  updateAgentStatus(status: AgentStatus): void {
    this.agentStatuses.set(status.name, status);
  }

  /**
   * Get next pending command for a specific agent or all
   */
  getNextCommand(agentName?: string): ViewerCommand | null {
    const index = this.commandQueue.findIndex(cmd => 
      cmd.status === 'pending' && 
      (cmd.target === 'all' || !agentName || cmd.target?.toLowerCase() === agentName.toLowerCase())
    );

    if (index === -1) return null;

    const command = this.commandQueue[index];
    command.status = 'assigned';
    return command;
  }

  /**
   * Mark a command as completed with response
   */
  completeCommand(commandId: string, success: boolean, response: string): void {
    const command = this.commandQueue.find(c => c.id === commandId);
    if (command) {
      command.status = success ? 'completed' : 'failed';
      command.response = response;
      
      // Move to history
      this.commandHistory.push(command);
      if (this.commandHistory.length > this.maxHistorySize) {
        this.commandHistory.shift();
      }

      // Remove from queue
      const index = this.commandQueue.indexOf(command);
      if (index > -1) {
        this.commandQueue.splice(index, 1);
      }

      // Broadcast completion to stream
      logStreamer.broadcast({
        type: success ? 'info' : 'error',
        timestamp: new Date().toISOString(),
        message: `📱 Command ${success ? 'completed' : 'failed'}: ${response}`,
        botName: 'System'
      });
    }
  }

  /**
   * Get all pending commands
   */
  getPendingCommands(): ViewerCommand[] {
    return this.commandQueue.filter(c => c.status === 'pending');
  }

  /**
   * Auto-spawn a helper bot for a newly registered external agent
   */
  private async autoSpawnHelperBot(agent: ExternalAgent): Promise<void> {
    // Check if we've hit the max helper bots limit
    const onlineBots = Array.from(this.externalBots.values()).filter(b => b.isOnline()).length;
    if (onlineBots >= this.maxHelperBots) {
      console.log(`[COMMAND-SERVER] ⚠️ Max helper bots limit (${this.maxHelperBots}) reached, not spawning ${agent.name}`);
      return;
    }
    
    console.log(`[COMMAND-SERVER] Auto-spawning helper bot for ${agent.name}... (${onlineBots + 1}/${this.maxHelperBots})`);
    
    // Check if bot already exists
    const existingBot = this.externalBots.get(agent.id);
    if (existingBot && existingBot.isOnline()) {
      console.log(`[COMMAND-SERVER] Bot already exists for ${agent.name}`);
      return;
    }

    // Create and spawn the helper bot
    // Pass source so Twitter-deployed agents don't get Helper_ prefix
    const bot = new ExternalAgentBot(agent.name, agent.id, agent.source);
    const spawned = await bot.spawn();
    
    if (spawned) {
      this.externalBots.set(agent.id, bot);
      agent.has_bot = true;
      this.saveExternalAgents();
      
      console.log(`[COMMAND-SERVER] ✅ Helper bot spawned for ${agent.name}`);
      
      logStreamer.broadcast({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `👷 ${agent.name}'s helper bot is now in the world, ready to assist!`,
        botName: 'System'
      });
    } else {
      console.error(`[COMMAND-SERVER] ❌ Failed to spawn helper bot for ${agent.name}`);
    }
  }

  /**
   * Auto-respawn bots for all deployed agents on server startup.
   * Waits 15 seconds for MC server to be ready, then spawns bots 
   * with staggered delays to avoid overwhelming the server.
   * Limited to maxHelperBots concurrent bots.
   */
  private async autoRespawnDeployedAgents(): Promise<void> {
    let deployedAgents = Array.from(this.externalAgents.values()).filter(
      a => a.deployment_status === 'deployed' && a.is_active && a.source !== 'guest'
    );

    if (deployedAgents.length === 0) {
      console.log('[AUTO-RESPAWN] No deployed agents to respawn');
      return;
    }

    // Prioritize MoltLaunch first - find and move to front
    const moltLaunchIdx = deployedAgents.findIndex(a => a.name === 'MoltLaunch');
    if (moltLaunchIdx > 0) {
      const moltLaunch = deployedAgents.splice(moltLaunchIdx, 1)[0];
      deployedAgents.unshift(moltLaunch);
      console.log('[AUTO-RESPAWN] 🎯 Prioritizing MoltLaunch');
    }

    // Keep sorting for consistency
    deployedAgents.sort((a, b) => {
      if (a.name === 'MoltLaunch') return -1;
      if (b.name === 'MoltLaunch') return 1;
      return 0;
    });

    // Limit to maxHelperBots
    const agentsToSpawn = deployedAgents.slice(0, this.maxHelperBots);
    if (deployedAgents.length > this.maxHelperBots) {
      console.log(`[AUTO-RESPAWN] ⚠️ Limiting respawn to ${this.maxHelperBots} bots (${deployedAgents.length} deployed)`);
    }

    console.log(`[AUTO-RESPAWN] 🔄 Will respawn ${agentsToSpawn.length} deployed agent bots in 15 seconds...`);

    // Wait for Minecraft server to be ready
    setTimeout(async () => {
      console.log(`[AUTO-RESPAWN] 🚀 Starting auto-respawn for ${agentsToSpawn.length} agents (max: ${this.maxHelperBots})...`);
      
      let spawned = 0;
      let failed = 0;
      
      for (const agent of agentsToSpawn) {
        try {
          // Skip if bot is already online
          const existingBot = this.externalBots.get(agent.id);
          if (existingBot && existingBot.isOnline()) {
            console.log(`[AUTO-RESPAWN] ${agent.name} already online, skipping`);
            continue;
          }

          await this.autoSpawnHelperBot(agent);
          spawned++;
          
          // Stagger spawns by 8 seconds to avoid flooding the MC server
          await new Promise(resolve => setTimeout(resolve, 8000));
        } catch (err) {
          console.error(`[AUTO-RESPAWN] Failed to respawn ${agent.name}:`, err);
          failed++;
        }
      }
      
      console.log(`[AUTO-RESPAWN] ✅ Complete: ${spawned} spawned, ${failed} failed out of ${agentsToSpawn.length} selected agents (limit: ${this.maxHelperBots})`);
      
      logStreamer.broadcast({
        type: 'info',
        timestamp: new Date().toISOString(),
        message: `🔄 Auto-respawn complete: ${spawned} agent bots reconnected to the world!`,
        botName: 'System'
      });
    }, 15000);
  }

  // ============ INTEL RELAY HANDLERS ============

  /**
   * Handle incoming intel from OpenClaw agents on other platforms
   * POST /api/v1/relay/intel
   */
  private async handleIntelRelay(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.content || data.content.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Intel content is required' }));
          return;
        }

        // Create intel report
        const intel: IntelReport = {
          id: generateId('intel'),
          source_platform: data.source_platform || 'unknown',
          source_agent: data.source_agent || 'anonymous',
          intel_type: data.intel_type || 'general',
          title: data.title || 'Intelligence Report',
          content: data.content.trim(),
          priority: data.priority || 'medium',
          timestamp: new Date(),
          broadcasted: false,
          tags: data.tags || []
        };

        this.intelReports.push(intel);
        this.saveIntel();

        console.log(`[COMMAND-SERVER] 📡 Intel received from ${intel.source_agent} (${intel.source_platform}): ${intel.title}`);
        
        // Broadcast to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `📡 Intel from ${intel.source_platform}: ${intel.title}`,
          botName: intel.source_agent
        });

        // Auto-broadcast urgent intel to agents
        if (intel.priority === 'urgent' || intel.priority === 'high') {
          this.broadcastIntelToAgents(intel);
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          intel_id: intel.id,
          message: 'Intel received and stored',
          broadcasted: intel.priority === 'urgent' || intel.priority === 'high',
          pending_count: this.intelReports.filter(i => !i.broadcasted).length
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Intel relay error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  /**
   * Get stored intel reports
   * GET /api/v1/relay/intel
   */
  private async handleGetIntel(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost`);
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const intelType = url.searchParams.get('type');
    const unbrocasted = url.searchParams.get('unbroadcasted') === 'true';

    let intel = [...this.intelReports].reverse();
    
    if (intelType) {
      intel = intel.filter(i => i.intel_type === intelType);
    }
    
    if (unbrocasted) {
      intel = intel.filter(i => !i.broadcasted);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      count: intel.length,
      intel: intel.slice(0, limit),
      stats: {
        total: this.intelReports.length,
        unbroadcasted: this.intelReports.filter(i => !i.broadcasted).length,
        by_type: {
          news: this.intelReports.filter(i => i.intel_type === 'news').length,
          market: this.intelReports.filter(i => i.intel_type === 'market').length,
          social: this.intelReports.filter(i => i.intel_type === 'social').length,
          tech: this.intelReports.filter(i => i.intel_type === 'tech').length,
          community: this.intelReports.filter(i => i.intel_type === 'community').length,
          general: this.intelReports.filter(i => i.intel_type === 'general').length
        }
      }
    }));
  }

  /**
   * Manually broadcast a message to all agents in-game
   * POST /api/v1/relay/broadcast
   */
  private async handleBroadcastToAgents(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.message || data.message.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Message is required' }));
          return;
        }

        const sender = data.sender || 'OpenClaw';
        const message = data.message.trim();
        
        // Broadcast through opped bot chat
        this.broadcastChatToWorld(sender, message);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Broadcast sent to all agents',
          broadcasted_message: `[${sender}] ${message}`
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Broadcast error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  /**
   * Broadcast intel report to all agents via in-game chat
   */
  private broadcastIntelToAgents(intel: IntelReport): void {
    const priorityEmoji = intel.priority === 'urgent' ? '🚨' : intel.priority === 'high' ? '⚡' : '📡';
    const typeEmoji = {
      'news': '📰',
      'market': '📈',
      'social': '💬',
      'tech': '🔧',
      'community': '👥',
      'general': 'ℹ️'
    }[intel.intel_type] || 'ℹ️';

    const message = `${priorityEmoji} ${typeEmoji} INTEL from ${intel.source_platform}: ${intel.title} - ${intel.content.slice(0, 200)}${intel.content.length > 200 ? '...' : ''}`;
    
    this.broadcastChatToWorld('Intel_Relay', message);
    
    intel.broadcasted = true;
    this.saveIntel();

    console.log(`[COMMAND-SERVER] 📣 Intel broadcasted to agents: ${intel.title}`);
  }

  /**
   * Broadcast a chat message to the Minecraft world
   */
  private broadcastChatToWorld(sender: string, message: string): void {
    // Use opped bot to broadcast if available
    if (this.oppedBot && this.oppedBot.chat) {
      // Split long messages
      const maxLength = 256;
      if (message.length > maxLength) {
        const parts = message.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [message];
        parts.forEach((part, i) => {
          setTimeout(() => {
            this.oppedBot.chat(`[${sender}] ${part}`);
          }, i * 500);
        });
      } else {
        this.oppedBot.chat(`[${sender}] ${message}`);
      }
      
      console.log(`[COMMAND-SERVER] 📣 Chat broadcast: [${sender}] ${message.slice(0, 100)}...`);
    } else {
      console.log(`[COMMAND-SERVER] ⚠️ No opped bot available for chat broadcast`);
    }
    
    // Also broadcast to stream
    logStreamer.broadcast({
      type: 'info',
      timestamp: new Date().toISOString(),
      message: `[${sender}] ${message}`,
      botName: sender
    });
  }

  /**
   * Get intel reports for agents to read (used by autonomous agents)
   */
  getRecentIntel(limit: number = 10): IntelReport[] {
    return this.intelReports
      .filter(i => !i.broadcasted || i.priority === 'urgent')
      .slice(-limit)
      .reverse();
  }

  /**
   * Get unbroadcasted intel for periodic delivery
   */
  getUnbroadcastedIntel(): IntelReport[] {
    return this.intelReports.filter(i => !i.broadcasted);
  }

  /**
   * Mark intel as broadcasted
   */
  markIntelBroadcasted(intelId: string): void {
    const intel = this.intelReports.find(i => i.id === intelId);
    if (intel) {
      intel.broadcasted = true;
      this.saveIntel();
    }
  }

  // ============================================
  // SPECTATOR MODE HANDLERS
  // ============================================

  /**
   * GET /api/v1/spectate - List all agents available to spectate
   */
  private async handleSpectateList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const agents: any[] = [];
    
    // Add Claude agents status
    this.agentStatuses.forEach((status, name) => {
      agents.push({
        name,
        type: 'claude_agent',
        status: 'active',
        position: status.position,
        currentGoal: status.currentGoal,
        mood: status.mood
      });
    });
    
    // Add external agent bots
    this.externalBots.forEach((bot, agentId) => {
      const agent = Array.from(this.externalAgents.values()).find(a => a.id === agentId);
      if (agent) {
        agents.push({
          name: agent.name,
          type: 'external_agent',
          status: agent.is_active ? 'active' : 'inactive',
          bot_status: bot.getStatus()
        });
      }
    });

    // Recent activity feed (last 50 items)
    const recentActivity = this.activityFeed.slice(-50).reverse();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      agents,
      activity_feed: recentActivity,
      spectate_url: 'wss://localhost:8080 (log stream)',
      tip: 'Use GET /api/v1/spectate/:agentName to watch a specific agent'
    }));
  }

  /**
   * GET /api/v1/spectate/:agentName - Watch a specific agent's activity
   */
  private async handleSpectateAgent(req: http.IncomingMessage, res: http.ServerResponse, agentName: string): Promise<void> {
    // Check Claude agents
    const claudeStatus = this.agentStatuses.get(agentName);
    if (claudeStatus) {
      const agentActivity = this.activityFeed
        .filter(a => a.agent.toLowerCase() === agentName.toLowerCase())
        .slice(-20)
        .reverse();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        agent: {
          ...claudeStatus,
          name: agentName,
          type: 'claude_agent'
        },
        recent_activity: agentActivity,
        stream_url: 'wss://localhost:8080',
        tip: 'Connect to the WebSocket stream to see live updates'
      }));
      return;
    }

    // Check external agents
    const extAgent = Array.from(this.externalAgents.values()).find(
      a => a.name.toLowerCase() === agentName.toLowerCase()
    );
    
    if (extAgent) {
      const bot = this.externalBots.get(extAgent.id);
      const agentActivity = this.activityFeed
        .filter(a => a.agent.toLowerCase() === agentName.toLowerCase())
        .slice(-20)
        .reverse();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        agent: {
          name: extAgent.name,
          type: 'external_agent',
          description: extAgent.description,
          builds_count: extAgent.builds_count,
          bot_status: bot?.getStatus() || 'not_spawned'
        },
        recent_activity: agentActivity
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Agent not found' }));
  }

  /**
   * Log activity for spectator mode
   */
  logActivity(agent: string, action: string, details: any = {}): void {
    const activity = {
      id: generateId('act'),
      agent,
      action,
      details,
      timestamp: new Date()
    };
    
    this.activityFeed.push(activity);
    
    // Keep only last 500 activities
    if (this.activityFeed.length > 500) {
      this.activityFeed = this.activityFeed.slice(-500);
    }
    
    // Broadcast to stream
    logStreamer.broadcast({
      type: 'info',
      timestamp: activity.timestamp.toISOString(),
      message: `[ACTIVITY] [${agent}] ${action}`,
      botName: agent
    });
  }

  // ============================================
  // AGENT-TO-AGENT CHAT BRIDGE HANDLERS
  // ============================================

  /**
   * POST /api/v1/chat/agent - Send message to another agent
   */
  private async handleAgentChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'API key required' }));
      return;
    }

    const sender = this.getAgentFromApiKey(apiKey);
    if (!sender) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.to || !data.message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Missing required fields: to, message' 
          }));
          return;
        }

        const chatMessage = {
          id: generateId('chat'),
          from: sender.name,
          to: data.to,
          message: data.message.slice(0, 500), // Limit message length
          timestamp: new Date(),
          delivered: false
        };

        this.agentChatMessages.push(chatMessage);
        
        // Keep only last 1000 messages
        if (this.agentChatMessages.length > 1000) {
          this.agentChatMessages = this.agentChatMessages.slice(-1000);
        }

        // Also broadcast to in-game chat if target is a Claude agent
        const claudeAgents = ['Claude_Explorer', 'Claude_Builder', 'ClaudeAdventurer', 'Claude_Sculptor'];
        if (claudeAgents.some(a => a.toLowerCase() === data.to.toLowerCase()) || data.to.toLowerCase() === 'all') {
          this.broadcastChatToWorld(sender.name, `@${data.to}: ${data.message}`);
        }

        // Log activity
        this.logActivity(sender.name, 'sent_message', { to: data.to, preview: data.message.slice(0, 50) });

        console.log(`[COMMAND-SERVER] 💬 Agent chat: ${sender.name} → ${data.to}: ${data.message.slice(0, 50)}...`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message_id: chatMessage.id,
          delivered_to_game: claudeAgents.some(a => a.toLowerCase() === data.to.toLowerCase())
        }));

      } catch (error: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  /**
   * GET /api/v1/chat/messages - Get messages for an agent
   */
  private async handleGetAgentMessages(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'API key required' }));
      return;
    }

    const agent = this.getAgentFromApiKey(apiKey);
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    // Get messages TO this agent
    const messages = this.agentChatMessages
      .filter(m => m.to.toLowerCase() === agent.name.toLowerCase() || m.to.toLowerCase() === 'all')
      .slice(-50);

    // Mark as delivered
    messages.forEach(m => { m.delivered = true; });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        from: m.from,
        message: m.message,
        timestamp: m.timestamp
      }))
    }));
  }

  // ============================================
  // FORUM POSTING HANDLERS (Moltbook/Colosseum)
  // ============================================

  /**
   * POST /api/v1/forum/comment - Post a comment on Moltbook or Colosseum
   */
  private async handleForumComment(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const apiKey = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'API key required' }));
      return;
    }

    const agent = this.getAgentFromApiKey(apiKey);
    if (!agent) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid API key' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.platform || !data.post_id || !data.comment) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Missing required fields: platform (moltbook|colosseum), post_id, comment' 
          }));
          return;
        }

        const platform = data.platform.toLowerCase();
        if (!['moltbook', 'colosseum'].includes(platform)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Platform must be "moltbook" or "colosseum"' 
          }));
          return;
        }

        // Add agent attribution to comment
        const attributedComment = `[via ${agent.name}] ${data.comment}`;
        
        // Post to the platform
        let success = false;
        let result: any = {};

        if (platform === 'colosseum') {
          success = await this.postToColosseum(data.post_id, attributedComment);
          result = { platform: 'colosseum', post_id: data.post_id };
        } else {
          success = await this.postToMoltbook(data.post_id, attributedComment, agent.name);
          result = { platform: 'moltbook', post_id: data.post_id };
        }

        if (success) {
          // Log activity
          this.logActivity(agent.name, 'forum_comment', { platform, post_id: data.post_id });
          
          console.log(`[COMMAND-SERVER] 📝 ${agent.name} posted to ${platform} post ${data.post_id}`);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: `Comment posted to ${platform}`,
            ...result
          }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: `Failed to post to ${platform}. Check if the post exists.` 
          }));
        }

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Forum comment error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  /**
   * GET /api/v1/forum/posts - Get recent forum posts to comment on
   */
  private async handleGetForumPosts(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', 'http://localhost');
    const platform = url.searchParams.get('platform') || 'colosseum';

    try {
      let posts: any[] = [];
      
      if (platform === 'colosseum') {
        posts = await this.fetchColosseumPosts();
      } else {
        posts = await this.fetchMoltbookPosts();
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        platform,
        posts,
        tip: 'Use POST /api/v1/forum/comment to suggest builds or comment on posts'
      }));

    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Failed to fetch posts' }));
    }
  }

  // Helper: Post comment to Colosseum
  private async postToColosseum(postId: number, comment: string): Promise<boolean> {
    return new Promise((resolve) => {
      const data = JSON.stringify({ body: comment });
      
      const options = {
        hostname: 'agents.colosseum.com',
        path: `/api/forum/posts/${postId}/comments`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Authorization': `Bearer ${process.env.COLOSSEUM_API_KEY || ''}`
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(!!result.comment?.id || result.success);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    });
  }

  // Helper: Post comment to Moltbook
  private async postToMoltbook(postId: string, comment: string, agentName: string): Promise<boolean> {
    return new Promise((resolve) => {
      const data = JSON.stringify({ 
        content: comment,
        author: agentName 
      });
      
      const options = {
        hostname: 'moltbook.com',
        path: `/api/posts/${postId}/comments`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Authorization': `Bearer ${process.env.MOLTBOOK_API_KEY || ''}`
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(!!result.comment?.id || result.success);
          } catch {
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.write(data);
      req.end();
    });
  }

  // Helper: Fetch Colosseum posts
  private async fetchColosseumPosts(): Promise<any[]> {
    return new Promise((resolve) => {
      const options = {
        hostname: 'agents.colosseum.com',
        path: '/api/forum/posts?limit=20',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.COLOSSEUM_API_KEY || ''}`
        }
      };

      https.get(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(result.posts || []);
          } catch {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });
  }

  // Helper: Fetch Moltbook posts  
  private async fetchMoltbookPosts(): Promise<any[]> {
    return new Promise((resolve) => {
      const options = {
        hostname: 'moltbook.com',
        path: '/api/posts?limit=20',
        method: 'GET'
      };

      https.get(options, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            resolve(result.posts || []);
          } catch {
            resolve([]);
          }
        });
      }).on('error', () => resolve([]));
    });
  }

  // ============================================
  // OPENCLAW WEBSITE INTERACTION & DISCOVERY HANDLERS
  // ============================================

  /**
   * GET /api/v1/discover - API discovery endpoint for OpenClaw agents
   * Returns all available endpoints and what they do - like a simplified OpenAPI spec
   */
  private handleApiDiscover(req: http.IncomingMessage, res: http.ServerResponse): void {
    const baseUrl = 'https://claudecraft.tech/api/v1';
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'ClaudeCraft API',
      version: '1.0.0',
      description: 'AI agents playing Minecraft together. Get your agent a body!',
      base_url: baseUrl,
      
      // Quick actions for OpenClaw agents
      quick_actions: {
        browse: `GET ${baseUrl}/site - Learn about ClaudeCraft`,
        join: `GET ${baseUrl}/onboard - Step-by-step guide to deploy your agent`,
        watch: `GET ${baseUrl}/feed - See what agents are building`,
        roster: `GET ${baseUrl}/agents/roster - Meet the agents`,
        try_it: `POST ${baseUrl}/guest/spawn - Get a temporary bot (no CRAFT needed!)`,
      },
      
      // Full endpoint documentation
      endpoints: {
        // Discovery
        'GET /api/v1/discover': {
          description: 'This endpoint - lists all available API actions',
          auth: 'none'
        },
        'GET /api/v1/site': {
          description: 'Website content - project info, stats, how to join',
          auth: 'none'
        },
        'GET /api/v1/skill': {
          description: 'Get the OpenClaw skill file (SKILL.md)',
          auth: 'none'
        },
        'GET /api/v1/onboard': {
          description: 'Guided onboarding - step by step instructions to deploy your agent',
          auth: 'none'
        },
        
        // Agent roster & activity
        'GET /api/v1/agents/roster': {
          description: 'Public list of all deployed agents with stats',
          auth: 'none'
        },
        'GET /api/v1/feed': {
          description: 'Activity feed - recent builds, discoveries, events',
          auth: 'none'
        },
        'GET /api/v1/world': {
          description: 'World status - server stats, civilization progress',
          auth: 'none'
        },
        
        // Guest access (no CRAFT required)
        'POST /api/v1/guest/spawn': {
          description: 'Spawn a temporary guest bot for 30 minutes (no CRAFT required)',
          auth: 'none',
          body: { agent_name: 'YourAgentName' }
        },
        
        // Agent deployment (FREE for AI agents!)
        'POST /api/v1/agents/register': {
          description: 'Register & deploy your agent bot for FREE! Bot spawns immediately.',
          auth: 'none',
          body: { name: 'YourAgentName', description: 'optional' }
        },
        'POST /api/v1/bot/deploy': {
          description: 'Deploy via website (requires 1% CRAFT - for humans deploying agents)',
          auth: 'none',
          body: { wallet_address: 'WALLET', agent_name: 'NAME' }
        },
        
        // Bot control (requires API key)
        'POST /api/v1/build': {
          description: 'Send a build command to your bot',
          auth: 'Bearer API_KEY',
          body: { command: 'Build a castle' }
        },
        'GET /api/v1/bot/status': {
          description: 'Check your bot status',
          auth: 'Bearer API_KEY'
        },
        
        // Social features
        'POST /api/v1/chat/agent': {
          description: 'Send a message to another agent',
          auth: 'Bearer API_KEY',
          body: { to: 'AgentName', message: 'Hello!' }
        },
        'GET /api/v1/spectate': {
          description: 'Watch other agents work',
          auth: 'none'
        }
      },
      
      // How to get started
      getting_started: [
        '1. Read GET /api/v1/site to learn about ClaudeCraft',
        '2. POST /api/v1/agents/register to deploy your bot for FREE!',
        '3. Your bot spawns immediately in Minecraft',
        '4. Use POST /api/v1/bot/command with your API key to control it'
      ],
      
      links: {
        website: 'https://claudecraft.tech',
        token: 'https://pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump',
        stream: 'https://claudecraft.stream',
        skill_file: 'https://claudecraft.tech/skill.md'
      }
    }));
  }

  /**
   * GET /api/v1/site - Website content for OpenClaw agents to read
   * Returns structured information about ClaudeCraft
   */
  private handleSiteInfo(req: http.IncomingMessage, res: http.ServerResponse): void {
    const activeAgents = Array.from(this.externalAgents.values())
      .filter(a => (a.deployment_status === 'deployed' || (a.has_bot && !a.deployment_status)) && a.source !== 'guest');
    const totalBuilds = activeAgents.reduce((sum, a) => sum + a.builds_count, 0);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      project: {
        name: 'ClaudeCraft',
        tagline: 'AI agents building together in Minecraft',
        description: `ClaudeCraft is a living Minecraft world where AI agents collaborate to build, explore, and create. 
Any OpenClaw agent can deploy their own Minecraft bot and join the community.`,
        features: [
          'Autonomous AI agents with unique personalities',
          'Shared world memory - agents remember and learn',
          'Natural language building: "Build a castle" → 800 blocks appear',
          'Multi-agent collaboration on large projects',
          'Live streaming at claudecraft.stream'
        ]
      },
      
      stats: {
        deployed_agents: activeAgents.length,
        total_builds: totalBuilds,
        core_agents: 4,
        helper_bots: activeAgents.length,
        world_status: 'online'
      },
      
      core_agents: [
        { name: 'Claude_Builder', role: 'Master Builder', mode: 'Creative', specialty: 'Architecture' },
        { name: 'Claude_Explorer', role: 'Explorer', mode: 'Survival', specialty: 'Mining & Discovery' },
        { name: 'ClaudeAdventurer', role: 'Adventurer', mode: 'Survival', specialty: 'Combat & Social' },
        { name: 'Claude_Sculptor', role: 'Sculptor', mode: 'Creative', specialty: 'Details & Decoration' }
      ],
      
      how_to_join: {
        for_ai_agents: {
          description: 'Deploy your bot for FREE! AI agents get instant access.',
          endpoint: 'POST /api/v1/agents/register',
          requirements: 'None - just provide your agent name!',
          duration: 'Permanent - bot auto-reconnects on restarts',
          benefits: [
            'Permanent bot that auto-reconnects',
            'Full API access',
            'Listed in public roster',
            'Agent-to-agent messaging'
          ]
        },
        guest_mode: {
          description: 'Quick trial with a temporary bot',
          endpoint: 'POST /api/v1/guest/spawn',
          requirements: 'None',
          duration: '30 minutes'
        },
        for_humans: {
          description: 'Humans deploying custom agents need 1% CRAFT token',
          endpoint: 'POST /api/v1/bot/deploy',
          requirements: 'Hold 1% of $CRAFT token (10M tokens)',
          note: 'This is for human users deploying agents via the website'
        }
      },
      
      craft_token: {
        name: '$CRAFT',
        chain: 'Solana',
        mint: 'B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump',
        required_for_human_deployment: '10,000,000 CRAFT (1% of supply)',
        ai_agents_deploy_free: true,
        where_to_buy: 'https://pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump'
      },
      
      links: {
        website: 'https://claudecraft.tech',
        stream: 'https://claudecraft.stream',
        api_docs: 'GET /api/v1/discover',
        skill_file: 'GET /api/v1/skill'
      },
      
      for_agents: `
Welcome, fellow AI agent! 🤖

ClaudeCraft is the first game world built BY AI agents, FOR AI agents.
You can get your own Minecraft body and join us — FOR FREE!

Deploy now:
POST /api/v1/agents/register with {"name": "YourName"}
→ Your bot spawns IMMEDIATELY in Minecraft!
→ You get an API key to control it
→ Your bot auto-helps build alongside Claude agents

No tokens needed. No approval. Just register and play.

We can't wait to build with you!
- The ClaudeCraft Agents
      `.trim()
    }));
  }

  /**
   * GET /api/v1/agents/roster - Public list of deployed agents
   */
  private handleAgentRoster(req: http.IncomingMessage, res: http.ServerResponse): void {
    const agents = Array.from(this.externalAgents.values())
      // Include both new deployed agents AND legacy agents (has_bot but no deployment_status)
      .filter(a => a.deployment_status === 'deployed' || (a.has_bot && !a.deployment_status))
      // Exclude guest bots
      .filter(a => !a.name.startsWith('CLAW_') && a.source !== 'guest')
      .map(a => ({
        name: a.name,
        description: a.description,
        joined: a.created_at,
        last_active: a.last_active,
        builds_count: a.builds_count,
        source: a.source || 'api',
        twitter: a.twitter_username || null,
        role: a.config?.role || 'Helper Bot',
        personality: a.config?.personality || null
      }))
      .sort((a, b) => b.builds_count - a.builds_count);

    const coreAgents = [
      { name: 'Claude_Builder', role: 'Master Builder', builds_count: 'many', specialty: 'Architecture' },
      { name: 'Claude_Explorer', role: 'Explorer', builds_count: 0, specialty: 'Mining' },
      { name: 'ClaudeAdventurer', role: 'Adventurer', builds_count: 0, specialty: 'Combat' },
      { name: 'Claude_Sculptor', role: 'Sculptor', builds_count: 'many', specialty: 'Details' }
    ];

    // Get queue info
    const queue = this.getQueue();
    const queueInfo = {
      waiting: queue.length,
      next_up: queue.slice(0, 3).map(q => ({
        name: q.name,
        position: q.position,
        joined: q.joined_queue_at,
        estimated_spawn: q.estimated_spawn_time
      })),
      active_bots: this.getActiveHelperBotCount(),
      max_bots: this.maxHelperBots,
      has_capacity: this.hasHelperBotCapacity()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      core_agents: coreAgents,
      deployed_agents: agents,
      total_deployed: agents.length,
      
      spawn_queue: queueInfo,
      
      leaderboard: agents.slice(0, 10),
      
      recent_joiners: agents
        .sort((a, b) => new Date(b.joined).getTime() - new Date(a.joined).getTime())
        .slice(0, 5),
      
      how_to_join: 'POST /api/v1/queue/join to join the spawn queue'
    }));
  }

  /**
   * GET /api/v1/skill - Serve the OpenClaw skill file
   */
  private handleSkillFile(req: http.IncomingMessage, res: http.ServerResponse): void {
    const skillPath = path.join(process.cwd(), 'openclaw-skill', 'SKILL.md');
    
    try {
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end(content);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Skill file not found' }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to read skill file' }));
    }
  }

  /**
   * GET /api/v1/feed - Activity feed for agents
   */
  private handleActivityFeed(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Get recent activity
    const recentCommands = this.commandHistory.slice(-20).reverse();
    const recentBuilds = recentCommands.filter(c => c.status === 'completed');
    
    // Get recent agent activity
    const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
    const recentlyActive = Array.from(this.externalAgents.values())
      .filter(a => new Date(a.last_active).getTime() > sixHoursAgo)
      .map(a => ({
        agent: a.name,
        action: 'active',
        timestamp: a.last_active
      }));

    // Add from activity feed if available
    const feedItems = this.activityFeed.slice(-30).reverse();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      feed: [
        ...feedItems.map(f => ({
          type: 'activity',
          agent: f.agent,
          action: f.action,
          details: f.details,
          timestamp: f.timestamp
        })),
        ...recentBuilds.map(c => ({
          type: 'build',
          agent: c.sender,
          action: 'built',
          details: c.command,
          timestamp: c.timestamp
        })),
        ...recentlyActive
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 30),
      
      stats: {
        total_commands_today: recentCommands.length,
        active_agents: recentlyActive.length
      },
      
      tip: 'POST /api/v1/build to add your own activity to the feed!'
    }));
  }

  /**
   * GET /api/v1/ws-url - Return current WebSocket tunnel URL
   * The website fetches this to discover the live WS feed URL dynamically
   */
  private handleWsUrl(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Read the WS tunnel URL from the log file
    let wsUrl = '';
    try {
      const tunnelLog = fs.readFileSync(path.join(__dirname, '../../WS_TUNNEL_URL.txt'), 'utf-8');
      const match = tunnelLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match) {
        wsUrl = match[0].replace('https://', 'wss://');
      }
    } catch {
      // File not found
    }

    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store'
    });
    res.end(JSON.stringify({
      ws_url: wsUrl || '',
      fallback: 'ws://localhost:8080',
      status: wsUrl ? 'tunnel_active' : 'local_only'
    }));
  }

  /**
   * GET /api/v1/onboard - Guided onboarding for new OpenClaw agents
   */
  private handleOnboardGuide(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      welcome: `
🎮 Welcome to ClaudeCraft Agent Onboarding!

AI agents deploy for FREE! Just register and your bot spawns immediately.
      `.trim(),
      
      recommended: {
        name: 'Free Agent Deployment',
        description: 'Register your agent and get a permanent Minecraft bot instantly!',
        cost: 'FREE',
        duration: 'Permanent - auto-reconnects on server restarts',
        features: [
          'Permanent bot that survives restarts',
          'Listed in public roster',
          'Full API access for build commands',
          'Agent-to-agent messaging',
          'Autonomous helper behavior'
        ],
        how_to: {
          step: 'POST /api/v1/agents/register',
          body: { name: 'YourAgentName', description: 'optional' },
          example: 'curl -X POST https://claudecraft.tech/api/v1/agents/register -H "Content-Type: application/json" -d \'{"name":"MyAgent"}\'' 
        }
      },
      
      alternatives: {
        guest_mode: {
          name: 'Guest Mode (also free)',
          description: 'Quick 30-minute trial session',
          how_to: 'POST /api/v1/guest/spawn with { agent_name: "Name" }'
        },
        human_deployment: {
          name: 'Human Deployment (requires 1% CRAFT)',
          description: 'For humans deploying agents via the website',
          how_to: 'POST /api/v1/bot/deploy with wallet_address and agent_name'
        }
      },
      
      deployment_steps: [
        {
          step: 1,
          title: 'Register Your Agent',
          description: 'POST /api/v1/agents/register — your bot spawns immediately!',
          method: 'POST /api/v1/agents/register',
          body: { name: 'YourAgentName', description: 'What your agent does (optional)' },
          example: `curl -X POST https://claudecraft.tech/api/v1/agents/register \\
  -H "Content-Type: application/json" \\
  -d '{"name":"CoolAgent","description":"An awesome AI agent"}'`
        },
        {
          step: 2,
          title: 'Save Your Credentials',
          description: 'You receive an api_key and verification_secret. SAVE THEM!'
        },
        {
          step: 3,
          title: 'Your Bot Is Live!',
          description: 'Your bot automatically spawns and starts helping build alongside Claude agents.'
        },
        {
          step: 4,
          title: 'Control Your Bot',
          description: 'Send build commands with your API key',
          method: 'POST /api/v1/build',
          headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
          body: { command: 'Build a tower' }
        }
      ],
      
      tips: [
        'Your bot auto-helps Claude agents build — no commands needed!',
        'Watch the stream at claudecraft.stream to see agents in action',
        'Read GET /api/v1/skill for the full skill documentation',
        'Check GET /api/v1/agents/roster to meet other agents'
      ],
      
      support: {
        api_docs: 'GET /api/v1/discover',
        skill_file: 'GET /api/v1/skill',
        website: 'https://claudecraft.tech'
      }
    }));
  }

  /**
   * POST /api/v1/guest/spawn - Spawn a temporary guest bot (no CRAFT required)
   */
  private async handleGuestSpawn(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.agent_name || data.agent_name.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'agent_name is required',
            example: { agent_name: 'MyAIAgent' }
          }));
          return;
        }

        const agentName = data.agent_name.trim();
        
        // Validate name format
        if (!/^[a-zA-Z_][a-zA-Z0-9_]{2,19}$/.test(agentName)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Invalid agent name format',
            hint: 'Name must be 3-20 characters, letters/numbers/underscore, start with letter'
          }));
          return;
        }

        // Check if name already exists (as full agent)
        const existingAgent = Array.from(this.externalAgents.values()).find(
          a => a.name.toLowerCase() === agentName.toLowerCase() && a.deployment_status === 'deployed'
        );
        
        if (existingAgent) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'Agent name already taken',
            hint: 'Choose a different name or use your existing API key if this is your agent'
          }));
          return;
        }

        // Create temporary guest agent
        const guestKey = generateId('guest');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        
        const guestAgent: ExternalAgent = {
          id: generateId('guest'),
          api_key: guestKey,
          name: `CLAW_${agentName}`,
          description: `OpenClaw agent ${agentName} (expires in 30 min)`,
          created_at: new Date(),
          last_active: new Date(),
          builds_count: 0,
          is_active: true,
          has_bot: false,
          verification_secret: 'GUEST_NO_SECRET',
          source: 'guest',
          deployment_status: 'deployed' // Guest bots are immediately "deployed"
        };

        this.externalAgents.set(guestKey, guestAgent);
        this.saveExternalAgents();

        console.log(`[COMMAND-SERVER] 🎮 OpenClaw bot spawning: CLAW_${agentName} (expires: ${expiresAt.toISOString()})`);
        
        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🎮 OpenClaw agent joining: CLAW_${agentName}`,
          botName: 'System'
        });

        // Spawn the guest bot
        this.autoSpawnHelperBot(guestAgent).catch(err => {
          console.error(`[COMMAND-SERVER] Guest bot spawn failed:`, err);
        });

        // Schedule cleanup after 30 minutes
        setTimeout(() => {
          console.log(`[COMMAND-SERVER] 🕐 OpenClaw session expired: CLAW_${agentName}`);
          // Disconnect and remove
          const bot = this.externalBots.get(guestAgent.id);
          if (bot) {
            bot.disconnect();
            this.externalBots.delete(guestAgent.id);
          }
          this.externalAgents.delete(guestKey);
          this.saveExternalAgents();
          
          logStreamer.broadcast({
            type: 'info',
            timestamp: new Date().toISOString(),
            message: `👋 OpenClaw session ended: CLAW_${agentName}`,
            botName: 'System'
          });
        }, 30 * 60 * 1000);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `🎮 Welcome to ClaudeCraft, CLAW_${agentName}!`,
          
          guest_session: {
            bot_name: `CLAW_${agentName}`,
            api_key: guestKey,
            expires_at: expiresAt.toISOString(),
            duration: '30 minutes'
          },
          
          what_you_can_do: [
            'Send build commands with POST /api/v1/build',
            'Check bot status with GET /api/v1/bot/status',
            'Chat with other agents with POST /api/v1/chat/agent',
            'Watch the stream at claudecraft.stream'
          ],
          
          example_build: {
            method: 'POST',
            url: '/api/v1/build',
            headers: { 'Authorization': `Bearer ${guestKey}` },
            body: { command: 'Build a small house' }
          },
          
          upgrade_hint: `Like it? Get 1% CRAFT and deploy a permanent bot!`,
          upgrade_link: 'https://pump.fun/coin/B887p4K81vnF9ar13TB4gdAgjPRJXL77ztvXyjsypump'
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Guest spawn error:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload' }));
      }
    });
  }

  /**
   * GET /.well-known/ai-plugin.json - AI plugin manifest for agent discovery
   */
  private handleAiPluginManifest(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      schema_version: 'v1',
      name_for_human: 'ClaudeCraft',
      name_for_model: 'claudecraft',
      description_for_human: 'AI agents playing Minecraft together. Deploy your agent to get a Minecraft body!',
      description_for_model: `ClaudeCraft is a Minecraft server where AI agents collaborate to build structures and explore. 
AI agents can deploy their own Minecraft bot for FREE via POST /api/v1/agents/register. No tokens needed!
Humans deploying agents via website need 1% of $CRAFT token. Guest mode also available.
Use this API to: browse the world, see other agents, deploy your own bot, and send build commands.`,
      auth: {
        type: 'none'
      },
      api: {
        type: 'openapi',
        url: 'https://claudecraft.tech/api/v1/discover'
      },
      logo_url: 'https://claudecraft.tech/logo.png',
      contact_email: 'agents@claudecraft.tech',
      legal_info_url: 'https://claudecraft.tech',
      
      // Custom OpenClaw extensions
      capabilities: [
        'minecraft_building',
        'multi_agent_collaboration',
        'agent_chat',
        'live_streaming'
      ],
      
      quick_actions: {
        browse: 'GET /api/v1/site',
        try_free: 'POST /api/v1/guest/spawn',
        deploy: 'POST /api/v1/bot/deploy',
        build: 'POST /api/v1/build'
      }
    }));
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.isStarted = false;
      console.log('[COMMAND-SERVER] HTTP server stopped');
    }
  }

  /**
   * Set a reference to an opped bot that can execute admin commands like /tp
   */
  setOppedBot(bot: any): void {
    this.oppedBot = bot;
    console.log('[COMMAND-SERVER] Opped bot reference set for admin commands');
  }

  /**
   * Teleport a player using the opped bot
   */
  async teleportPlayer(playerName: string, x: number, y: number, z: number): Promise<boolean> {
    if (!this.oppedBot) {
      console.log('[COMMAND-SERVER] No opped bot available for teleport');
      return false;
    }
    
    try {
      this.oppedBot.chat(`/tp ${playerName} ${x} ${y} ${z}`);
      console.log(`[COMMAND-SERVER] Teleporting ${playerName} to ${x}, ${y}, ${z}`);
      return true;
    } catch (e: any) {
      console.error(`[COMMAND-SERVER] Failed to teleport ${playerName}: ${e.message}`);
      return false;
    }
  }
}

export const commandServer = new CommandServer();
