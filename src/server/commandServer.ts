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
import * as fs from 'fs';
import * as path from 'path';
import { logStreamer } from './logStreamer';
import { ExternalAgentBot } from '../bot/externalAgentBot';
import { requestCollector, AgentDirective, IRequestCollector } from './requestCollector';
import { getWorldMemory } from '../agent/worldMemory';
import { handleArenaRoute } from '../arena/arenaRoutes';

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
}

class CommandServer {
  private server: http.Server | null = null;
  private commandQueue: ViewerCommand[] = [];
  
  // Request collection mode: collect requests for periodic processing instead of immediate execution
  private requestCollectionMode: boolean = true;
  private commandHistory: ViewerCommand[] = [];
  private maxHistorySize: number = 100;
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private commandCallbacks: Map<string, (command: ViewerCommand) => void> = new Map();
  private isStarted: boolean = false;
  
  // External agent storage
  private externalAgents: Map<string, ExternalAgent> = new Map(); // api_key -> agent
  private externalAgentsPath: string = path.join(process.cwd(), 'data', 'external-agents.json');
  
  // External agent bots (spawned in Minecraft)
  private externalBots: Map<string, ExternalAgentBot> = new Map(); // agent_id -> bot
  
  // Reference to an opped bot that can execute admin commands
  private oppedBot: any = null;

  constructor() {
    this.loadExternalAgents();
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

  private saveExternalAgents(): void {
    try {
      const dir = path.dirname(this.externalAgentsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const agents = Array.from(this.externalAgents.values());
      fs.writeFileSync(this.externalAgentsPath, JSON.stringify(agents, null, 2));
    } catch (e) {
      console.error('[COMMAND-SERVER] Failed to save external agents:', e);
    }
  }

  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = 'claudecraft_';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  private generateVerificationSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let secret = 'VERIFY_';
    for (let i = 0; i < 16; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  private getAgentFromApiKey(apiKey: string): ExternalAgent | null {
    return this.externalAgents.get(apiKey) || null;
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

      const url = new URL(req.url || '/', `http://localhost:${port}`);
      
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
      // New API v1 routes for external agents
      else if (req.method === 'POST' && url.pathname === '/api/v1/agents/register') {
        this.handleAgentRegister(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/agents/recover') {
        this.handleAgentKeyRecover(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/build') {
        this.handleBuild(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/agents/me') {
        this.handleAgentProfile(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/status') {
        this.handleApiStatus(req, res);
      }
      // NEW: Bot spawning and control endpoints
      else if (req.method === 'POST' && url.pathname === '/api/v1/bot/spawn') {
        this.handleBotSpawn(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/bot/command') {
        this.handleBotCommand(req, res);
      } else if (req.method === 'GET' && url.pathname === '/api/v1/bot/status') {
        this.handleBotStatus(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/bot/disconnect') {
        this.handleBotDisconnect(req, res);
      } else if (req.method === 'POST' && url.pathname === '/api/v1/bot/upgrade') {
        this.handleBotUpgrade(req, res);
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

    this.isStarted = true;
  }

  // Handle external agent registration
  private async handleAgentRegister(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
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

        // Check if name already exists
        const existingAgent = Array.from(this.externalAgents.values()).find(
          a => a.name.toLowerCase() === data.name.toLowerCase()
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

        // Create new agent with verification secret for ownership proof
        const apiKey = this.generateApiKey();
        const verificationSecret = this.generateVerificationSecret();
        const agent: ExternalAgent = {
          id: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          api_key: apiKey,
          name: data.name.trim(),
          description: data.description || 'An OpenClaw agent',
          created_at: new Date(),
          last_active: new Date(),
          builds_count: 0,
          is_active: true,
          has_bot: false,
          verification_secret: verificationSecret
        };

        this.externalAgents.set(apiKey, agent);
        this.saveExternalAgents();

        console.log(`[COMMAND-SERVER] 🤖 New external agent registered: ${agent.name}`);
        
        // Log to stream
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `🤖 New agent joined: ${agent.name}!`,
          botName: 'System'
        });

        // AUTO-SPAWN: Create helper bot for this agent immediately
        this.autoSpawnHelperBot(agent).catch(err => {
          console.error(`[COMMAND-SERVER] Auto-spawn failed for ${agent.name}:`, err);
        });

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          agent: {
            api_key: apiKey,
            name: agent.name,
            id: agent.id,
            verification_secret: verificationSecret
          },
          message: `Welcome to Claudecraft, ${agent.name}! Your helper bot is spawning now and will autonomously help the Claude agents build!`,
          important: '🔐 SAVE BOTH YOUR API KEY AND VERIFICATION SECRET! You need the API key for requests, and the verification secret to recover your key if lost.',
          ownership: {
            verification_secret: verificationSecret,
            warning: 'This secret proves YOU own this agent. Never share it! Required to recover your API key.'
          },
          bot_info: {
            status: 'spawning',
            role: 'Master Builder Helper',
            behavior: 'Your bot will automatically follow Claude_Builder and help construct whatever they are building!'
          },
          next_steps: [
            'SAVE your verification_secret somewhere safe!',
            'Your bot is spawning now and will help automatically!',
            'Use GET /api/v1/bot/status to check your bot',
            'Use POST /api/v1/bot/command to send commands to your bot',
            'Watch the stream at claudecraft.tech to see your bot in action!'
          ]
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Agent registration error:', error);
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
          id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        message: 'No bot spawned. Use POST /api/v1/bot/spawn to create one.'
      }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      bot_spawned: true,
      bot: bot.getStatus()
    }));
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

        // Validate command
        if (!message || message.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No command provided' }));
          return;
        }

        // REQUEST COLLECTION MODE: Queue for periodic processing by ClaudecraftBot
        if (this.requestCollectionMode) {
          const request = requestCollector.addRequest(sender, message, channel);
          const status = requestCollector.getStatus();
          const timeUntil = status.nextProcessing;
          
          console.log(`[COMMAND-SERVER] 📥 Request queued from ${sender}: "${message}"`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            mode: 'request-collection',
            requestId: request.id,
            message: `Request received! ClaudecraftBot will review ${status.pendingRequests} requests in ${timeUntil.hours}h ${timeUntil.minutes}m`,
            pendingRequests: status.pendingRequests,
            nextProcessing: timeUntil
          }));
          return;
        }

        // IMMEDIATE MODE: Original behavior - execute commands directly
        const command: ViewerCommand = {
          id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          source: channel as any,
          sender,
          command: message,
          target: data.target || data.agent || 'all',
          timestamp: new Date(),
          status: 'pending'
        };

        // Add to queue
        this.commandQueue.push(command);
        
        // Log to stream for website overlay
        logStreamer.broadcast({
          type: 'info',
          timestamp: new Date().toISOString(),
          message: `📱 Viewer command from ${command.sender}: "${command.command}"`,
          botName: 'Telegram'
        });

        console.log(`[COMMAND-SERVER] Received command from ${command.sender} (${command.source}): ${command.command}`);

        // Notify registered callbacks
        this.commandCallbacks.forEach((callback, agentName) => {
          if (command.target === 'all' || command.target?.toLowerCase() === agentName.toLowerCase()) {
            callback(command);
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          mode: 'immediate',
          commandId: command.id,
          message: `Command queued for ${command.target || 'all agents'}`,
          queuePosition: this.commandQueue.length
        }));

      } catch (error: any) {
        console.error('[COMMAND-SERVER] Error parsing command:', error);
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
    console.log(`[COMMAND-SERVER] Auto-spawning helper bot for ${agent.name}...`);
    
    // Check if bot already exists
    const existingBot = this.externalBots.get(agent.id);
    if (existingBot && existingBot.isOnline()) {
      console.log(`[COMMAND-SERVER] Bot already exists for ${agent.name}`);
      return;
    }

    // Create and spawn the helper bot
    const bot = new ExternalAgentBot(agent.name, agent.id);
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
