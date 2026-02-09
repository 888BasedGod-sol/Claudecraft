/**
 * Custom ElizaOS Server with ClaudeCraft Plugin
 * 
 * This loads the Eliza_Crafter character with the ClaudeCraft plugin
 * for Minecraft integration.
 */

import { AgentRuntime, elizaLogger, stringToUuid } from '@elizaos/core';
import { bootstrapPlugin } from '@elizaos/plugin-bootstrap';
import { plugin as sqlPlugin } from '@elizaos/plugin-sql';
import { claudecraftPlugin } from './src/plugin-claudecraft';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

// Load character from JSON
const characterPath = path.join(import.meta.dir, 'eliza-crafter.json');
const character = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));

// Add our plugin to the character
character.plugins = [
  sqlPlugin,
  bootstrapPlugin,
  claudecraftPlugin
];

const PORT = process.env.ELIZAOS_PORT || 3000;

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║     🎮 ELIZA CLAUDECRAFT AGENT 🎮                              ║
║                                                                ║
║   ElizaOS + ClaudeCraft Minecraft Integration                  ║
╚════════════════════════════════════════════════════════════════╝
  `);

  console.log(`Agent: ${character.name}`);
  console.log(`ClaudeCraft API: ${process.env.CLAUDECRAFT_API_URL || 'http://localhost:8081'}`);
  console.log(`ClaudeCraft API Key: ${process.env.CLAUDECRAFT_API_KEY ? 'SET' : 'NOT SET'}`);
  console.log('');

  // Create runtime
  // ElizaOS runtime options may vary between versions
  const runtime = new AgentRuntime({
    character,
    token: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
    modelProvider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
    evaluators: [],
  } as any);

  await runtime.initialize();

  // Log available actions
  console.log('Available Actions:');
  runtime.actions.forEach(action => {
    console.log(`  - ${action.name}: ${action.description}`);
  });
  console.log('');

  // Simple HTTP server for chat
  const server = http.createServer(async (req, res) => {
    // CORS
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
    if (url.pathname === '/health' || url.pathname === '/healthz') {
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
        actions: runtime.actions.map(a => ({ name: a.name, description: a.description }))
      }));
      return;
    }

    // Chat endpoint
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const { message, userId } = JSON.parse(body);
          
          const memory = {
            id: stringToUuid(Date.now().toString()),
            userId: stringToUuid(userId || 'anonymous'),
            roomId: stringToUuid('chat-room'),
            agentId: runtime.agentId,
            content: { text: message, source: 'api' },
            createdAt: Date.now()
          };

          // ElizaOS API may vary between versions
          const response = await (runtime as any).processMessage(memory);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            response: response?.content?.text || 'No response',
            agent: character.name
          }));
        } catch (err: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // Default response
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>Eliza_Crafter</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px;">
          <h1>🎮 ${character.name}</h1>
          <p>${character.bio[0]}</p>
          <h3>API Endpoints:</h3>
          <ul>
            <li><code>GET /health</code> - Health check</li>
            <li><code>GET /api/agent</code> - Agent info</li>
            <li><code>POST /api/chat</code> - Chat with agent</li>
          </ul>
          <h3>Available Actions:</h3>
          <ul>
            ${runtime.actions.map(a => `<li><strong>${a.name}</strong>: ${a.description}</li>`).join('')}
          </ul>
        </body>
      </html>
    `);
  });

  server.listen(PORT, () => {
    console.log(`✅ Eliza_Crafter running at http://localhost:${PORT}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  GET  http://localhost:${PORT}/health     - Health check`);
    console.log(`  GET  http://localhost:${PORT}/api/agent  - Agent info`);
    console.log(`  POST http://localhost:${PORT}/api/chat   - Chat with agent`);
    console.log('');
  });
}

main().catch(console.error);
