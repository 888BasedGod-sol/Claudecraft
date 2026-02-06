/**
 * Social Agents Only - Moltbook + Clawk + Twitter
 * 
 * Runs the social media agents without Minecraft agents.
 * Perfect for running overnight or when Minecraft server is down.
 */

import dotenv from 'dotenv';
import { startMoltbookAgent } from './moltbookAgent';
import { startClawkAgent } from './clawkAgent';
import { startTwitterAgent } from './twitterAgent';

dotenv.config();

console.log('');
console.log('🦞🐦 SOCIAL AGENTS MODE 🐦🦞');
console.log('================================');
console.log('Running Moltbook + Clawk + Twitter agents');
console.log('No Minecraft agents');
console.log('================================');
console.log('');

// Start social agents
console.log('[Social] Starting Moltbook agent...');
startMoltbookAgent();

console.log('[Social] Starting Clawk agent...');
startClawkAgent();

console.log('[Social] Starting Twitter agent...');
startTwitterAgent();

console.log('');
console.log('✅ Social agents running!');
console.log('   - Moltbook: Posts every 30 min, comments every 10 min');
console.log('   - Clawk: Posts every 6 min, engages every 3 min');
console.log('   - Twitter: Monitors mentions, posts updates');
console.log('');
console.log('Press Ctrl+C to stop');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[Social] Shutting down social agents...');
  process.exit(0);
});

// Prevent exit
setInterval(() => {}, 60000);
