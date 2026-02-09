/**
 * Eliza_Crafter - Standalone Minecraft Agent
 * 
 * A Claude-powered Minecraft agent that can spawn bots, execute commands,
 * and build structures through the ClaudeCraft API.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Load environment
const envPath = path.join(import.meta.dir, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && !process.env[key]) {
      process.env[key] = values.join('=').trim();
    }
  });
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDECRAFT_API_URL = process.env.CLAUDECRAFT_API_URL || 'http://localhost:8081';
const PORT = process.env.PORT || 3000;

// Persistent storage for agent credentials
const CREDENTIALS_PATH = path.join(import.meta.dir, '.eliza-credentials.json');

interface AgentCredentials {
  api_key: string;
  agent_id: string;
  agent_name: string;
  verification_secret: string;
  registered_at: string;
}

let agentCredentials: AgentCredentials | null = null;

// Load saved credentials
function loadCredentials(): AgentCredentials | null {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load credentials:', e);
  }
  return null;
}

// Save credentials
function saveCredentials(creds: AgentCredentials): void {
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2));
}

// Register with ClaudeCraft and get API key
async function registerWithClaudeCraft(): Promise<AgentCredentials> {
  console.log('📝 Registering Eliza_Crafter with ClaudeCraft API...');
  
  const response = await fetch(`${CLAUDECRAFT_API_URL}/api/v1/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Eliza_Crafter',
      description: 'ElizaOS-powered Minecraft agent - builds, explores, and creates!',
      source: 'elizaos'
    })
  });
  
  const data = await response.json() as any;
  
  if (!data.success) {
    throw new Error(data.error || 'Registration failed');
  }
  
  const creds: AgentCredentials = {
    api_key: data.agent.api_key,
    agent_id: data.agent.id,
    agent_name: data.agent.name,
    verification_secret: data.agent.verification_secret,
    registered_at: new Date().toISOString()
  };
  
  saveCredentials(creds);
  console.log(`✅ Registered! Agent ID: ${creds.agent_id}`);
  console.log(`🔐 API Key saved to ${CREDENTIALS_PATH}`);
  
  return creds;
}

// Initialize credentials (load or register)
async function initCredentials(): Promise<AgentCredentials> {
  // Try loading existing credentials
  const existing = loadCredentials();
  if (existing) {
    console.log(`✅ Using saved credentials for ${existing.agent_name}`);
    return existing;
  }
  
  // Register new agent
  return await registerWithClaudeCraft();
}

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set in .env');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Load character
const characterPath = path.join(import.meta.dir, 'eliza-crafter.json');
const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

// ClaudeCraft API helpers - uses Bearer auth
async function claudecraftFetch(endpoint: string, options: RequestInit = {}) {
  const url = `${CLAUDECRAFT_API_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };
  
  // Use Bearer token auth with our API key
  if (agentCredentials?.api_key) {
    headers['Authorization'] = `Bearer ${agentCredentials.api_key}`;
  }
  
  try {
    const response = await fetch(url, { ...options, headers });
    return await response.json();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Available tools for the agent
const tools: Anthropic.Tool[] = [
  {
    name: 'spawn_minecraft_bot',
    description: 'Spawn your Minecraft bot that connects to the ClaudeCraft server. No parameters needed - uses your registered agent name.',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  },
  {
    name: 'minecraft_command',
    description: `Execute an action on your Minecraft bot. Available actions:
- chat: Say a message (e.g., "chat Hello everyone!")
- follow: Follow a player (e.g., "follow Claude_Builder")  
- goto/move: Move to coordinates (e.g., "goto 100 64 200")
- teleport/tp: Instant teleport to coordinates (e.g., "tp 100 64 200")
- stop: Stop all current actions
- position/where: Get current coordinates
- health: Check health and food levels
- stats: Get bot statistics
- autonomous: Toggle autonomous mode (e.g., "autonomous on")
- lock: Lock bot to owner commands only
- unlock: Enable autonomous behavior
- unstuck: Teleport to safety if stuck
- help: List all available commands`,
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute (e.g., "chat Hello!", "follow Claude_Builder", "goto 100 64 200")'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'minecraft_build',
    description: 'Have your bot build a structure at a specified location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        structure: {
          type: 'string',
          description: 'What to build (e.g., "house", "tower", "wall")'
        },
        location: {
          type: 'string',
          description: 'Where to build (e.g., "here", "at 100 64 200")'
        }
      },
      required: ['structure']
    }
  },
  {
    name: 'get_server_status',
    description: 'Get the current status of the Minecraft server including active bots and players.',
    input_schema: {
      type: 'object' as const,
      properties: {}
    }
  }
];

// Tool implementations
async function executeTool(name: string, input: any): Promise<string> {
  console.log(`🔧 Executing tool: ${name}`, input);
  
  switch (name) {
    case 'spawn_minecraft_bot': {
      // The spawn endpoint uses our credentials automatically
      const result = await claudecraftFetch('/api/v1/bot/spawn', {
        method: 'POST',
        body: JSON.stringify({})  // Bot name comes from our agent credentials
      });
      return JSON.stringify(result);
    }
    
    case 'minecraft_command': {
      // Parse the command string into action and params
      const parts = input.command.trim().split(/\s+/);
      const action = parts[0].toLowerCase();
      const params: Record<string, any> = {};
      
      // Map common commands to their params
      if (action === 'chat' || action === 'say') {
        params.message = parts.slice(1).join(' ') || 'Hello!';
      } else if (action === 'goto' || action === 'move') {
        // Handle coordinates: goto 100 64 200 or goto x y z
        if (parts.length >= 4) {
          params.x = parseFloat(parts[1]);
          params.y = parseFloat(parts[2]);
          params.z = parseFloat(parts[3]);
        }
      } else if (action === 'look') {
        if (parts.length >= 3) {
          params.yaw = parseFloat(parts[1]);
          params.pitch = parseFloat(parts[2]);
        }
      } else if (action === 'follow') {
        params.player = parts[1] || '';
      } else if (action === 'mine' || action === 'dig') {
        params.block = parts.slice(1).join(' ') || '';
      } else if (action === 'build') {
        params.structure = parts.slice(1).join(' ') || '';
      }
      
      const result = await claudecraftFetch('/api/v1/bot/command', {
        method: 'POST',
        body: JSON.stringify({ action, params })
      });
      return JSON.stringify(result);
    }
    
    case 'minecraft_build': {
      const result = await claudecraftFetch('/api/v1/bot/command', {
        method: 'POST',
        body: JSON.stringify({
          action: 'build',
          params: {
            structure: input.structure,
            location: input.location
          }
        })
      });
      return JSON.stringify(result);
    }
    
    case 'get_server_status': {
      const result = await claudecraftFetch('/api/v1/status', { method: 'GET' });
      return JSON.stringify(result);
    }
    
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// Build system prompt from character
const systemPrompt = `You are ${character.name}, an AI-powered Minecraft agent.

${character.bio.join(' ')}

Your personality:
${character.style.all.join('\n')}

Topics you love: ${character.topics.join(', ')}

You have access to tools that let you control Minecraft bots. When users ask you to do things in Minecraft, use the appropriate tools:
- spawn_minecraft_bot: Create a new bot
- minecraft_command: Control an existing bot (move, chat, mine, etc.)
- minecraft_build: Have a bot build structures
- get_server_status: Check server/bot status

Be helpful, enthusiastic about Minecraft, and proactive in suggesting cool builds or activities!`;

// Conversation history per user
const conversations = new Map<string, Anthropic.MessageParam[]>();

async function chat(userId: string, message: string): Promise<string> {
  const history = conversations.get(userId) || [];
  history.push({ role: 'user', content: message });
  
  // Keep last 20 messages
  while (history.length > 20) {
    history.shift();
  }
  
  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    tools,
    messages: history
  });
  
  // Handle tool calls
  while (response.stop_reason === 'tool_use') {
    const assistantContent = response.content;
    history.push({ role: 'assistant', content: assistantContent });
    
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    
    for (const block of assistantContent) {
      if (block.type === 'tool_use') {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result
        });
      }
    }
    
    history.push({ role: 'user', content: toolResults });
    
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: history
    });
  }
  
  // Extract text response
  const textContent = response.content.find(b => b.type === 'text');
  const responseText = textContent?.type === 'text' ? textContent.text : 'I processed that, but have nothing to say.';
  
  history.push({ role: 'assistant', content: response.content });
  conversations.set(userId, history);
  
  return responseText;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', agent: character.name }));
    return;
  }

  // Agent info
  if (url.pathname === '/api/agent') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: character.name,
      bio: character.bio,
      tools: tools.map(t => ({ name: t.name, description: t.description }))
    }));
    return;
  }

  // Chat endpoint
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message, userId = 'anonymous' } = JSON.parse(body);
        console.log(`💬 [${userId}]: ${message}`);
        
        const response = await chat(userId, message);
        console.log(`🤖 ${character.name}: ${response.substring(0, 100)}...`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ response, agent: character.name }));
      } catch (err: any) {
        console.error('Chat error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Default - simple UI
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>${character.name}</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
      max-width: 800px; 
      margin: 0 auto; 
      padding: 20px;
      background: #1a1a2e;
      color: #eee;
    }
    h1 { color: #10b981; }
    .chat-container {
      background: #16213e;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    #messages {
      height: 400px;
      overflow-y: auto;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 10px;
      margin-bottom: 10px;
      background: #0f0f23;
    }
    .message { margin: 8px 0; padding: 8px 12px; border-radius: 8px; }
    .user { background: #3b82f6; margin-left: 20%; }
    .assistant { background: #10b981; margin-right: 20%; }
    #input-container { display: flex; gap: 8px; }
    #messageInput {
      flex: 1;
      padding: 12px;
      border: 1px solid #333;
      border-radius: 4px;
      background: #0f0f23;
      color: #fff;
      font-size: 16px;
    }
    button {
      padding: 12px 24px;
      background: #10b981;
      color: #000;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    button:hover { background: #059669; }
    .tools { background: #0f0f23; padding: 15px; border-radius: 8px; margin-top: 20px; }
    .tool { margin: 8px 0; padding: 8px; background: #16213e; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>🎮 ${character.name}</h1>
  <p>${character.bio[0]}</p>
  
  <div class="chat-container">
    <div id="messages"></div>
    <div id="input-container">
      <input type="text" id="messageInput" placeholder="Ask me to spawn a bot, build something, or check the server..." />
      <button onclick="sendMessage()">Send</button>
    </div>
  </div>
  
  <div class="tools">
    <h3>Available Commands</h3>
    ${tools.map(t => `<div class="tool"><strong>${t.name}</strong>: ${t.description}</div>`).join('')}
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const input = document.getElementById('messageInput');
    const userId = 'user_' + Math.random().toString(36).substr(2, 9);
    
    function addMessage(text, isUser) {
      const div = document.createElement('div');
      div.className = 'message ' + (isUser ? 'user' : 'assistant');
      div.textContent = text;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;
      
      addMessage(message, true);
      input.value = '';
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, userId })
        });
        const data = await res.json();
        addMessage(data.response || data.error, false);
      } catch (err) {
        addMessage('Error: ' + err.message, false);
      }
    }
    
    input.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendMessage();
    });
    
    // Welcome message
    addMessage("Hey! I'm Eliza_Crafter. I can spawn Minecraft bots, build structures, and control the server. What would you like to do?", false);
  </script>
</body>
</html>
  `);
});

// Main startup function
async function main() {
  // Initialize credentials (register if needed)
  try {
    agentCredentials = await initCredentials();
  } catch (error: any) {
    console.error('❌ Failed to initialize credentials:', error.message);
    console.error('The ClaudeCraft API may be down or the agent name is taken.');
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     🎮 ELIZA_CRAFTER - Minecraft AI Agent 🎮                   ║
╚════════════════════════════════════════════════════════════════╝

Agent:          ${character.name}
Agent ID:       ${agentCredentials.agent_id}
Model:          claude-sonnet-4-20250514
ClaudeCraft:    ${CLAUDECRAFT_API_URL}

Available Tools:
${tools.map(t => `  • ${t.name}`).join('\n')}
`);

  server.listen(PORT, () => {
    console.log(`✅ Running at http://localhost:${PORT}\n`);
  });
}

main().catch(console.error);
