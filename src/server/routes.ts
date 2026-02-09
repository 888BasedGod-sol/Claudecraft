/**
 * Route Registry - Centralized route definitions for CommandServer
 * 
 * This module organizes all HTTP routes into categories for easier navigation.
 * Routes are registered with the CommandServer instance.
 */

import type http from 'http';

export interface RouteHandler {
  (req: http.IncomingMessage, res: http.ServerResponse, ...args: any[]): void | Promise<void>;
}

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: string; // Method name on CommandServer
  category: 'admin' | 'bot' | 'agent' | 'queue' | 'world' | 'relay' | 'chat' | 'forum' | 'discovery' | 'request' | 'wallet' | 'spectate' | 'guest' | 'build';
}

/**
 * All routes organized by category
 * 
 * This provides a single source of truth for all API routes.
 * Each handler name corresponds to a method on the CommandServer class.
 */
export const routes: RouteDefinition[] = [
  // ============ ADMIN ROUTES ============
  { method: 'POST', path: '/command', handler: 'handleCommand', category: 'admin' },
  { method: 'GET', path: '/status', handler: 'handleStatus', category: 'admin' },
  { method: 'GET', path: '/agents', handler: 'handleAgents', category: 'admin' },
  { method: 'GET', path: '/history', handler: 'handleHistory', category: 'admin' },
  { method: 'GET', path: '/health', handler: 'handleHealth', category: 'admin' },
  
  // ============ WALLET ROUTES ============
  { method: 'POST', path: '/api/v1/wallet/verify', handler: 'handleWalletVerify', category: 'wallet' },
  { method: 'GET', path: '/api/v1/wallet/requirements', handler: 'handleWalletRequirements', category: 'wallet' },
  
  // ============ AGENT ROUTES ============
  { method: 'POST', path: '/api/v1/agents/register', handler: 'handleAgentRegister', category: 'agent' },
  { method: 'POST', path: '/api/v1/agents/verify', handler: 'handleAgentVerifyAndDeploy', category: 'agent' },
  { method: 'POST', path: '/api/v1/agents/recover', handler: 'handleAgentKeyRecover', category: 'agent' },
  { method: 'POST', path: '/api/v1/agents/colosseum-provision', handler: 'handleColosseumProvision', category: 'agent' },
  { method: 'GET', path: '/api/v1/agents/me', handler: 'handleAgentProfile', category: 'agent' },
  { method: 'GET', path: '/api/v1/agents/roster', handler: 'handleAgentRoster', category: 'agent' },
  { method: 'POST', path: '/api/v1/agent/config', handler: 'handleAgentConfig', category: 'agent' },
  
  // ============ BUILD ROUTES ============
  { method: 'POST', path: '/api/v1/build', handler: 'handleBuild', category: 'build' },
  { method: 'POST', path: '/api/v1/build/colosseum', handler: 'handleBuildColosseum', category: 'build' },
  { method: 'POST', path: '/api/v1/build/superbowl', handler: 'handleBuildSuperbowl', category: 'build' },

  // ============ BOT ROUTES ============
  { method: 'POST', path: '/api/v1/bot/deploy', handler: 'handleBotDeploy', category: 'bot' },
  { method: 'POST', path: '/api/v1/bot/spawn', handler: 'handleBotSpawn', category: 'bot' },
  { method: 'POST', path: '/api/v1/bot/command', handler: 'handleBotCommand', category: 'bot' },
  { method: 'GET', path: '/api/v1/bot/status', handler: 'handleBotStatus', category: 'bot' },
  { method: 'POST', path: '/api/v1/bot/disconnect', handler: 'handleBotDisconnect', category: 'bot' },
  { method: 'POST', path: '/api/v1/bot/upgrade', handler: 'handleBotUpgrade', category: 'bot' },
  
  // ============ QUEUE ROUTES ============
  { method: 'POST', path: '/api/v1/queue/join', handler: 'handleQueueJoin', category: 'queue' },
  { method: 'GET', path: '/api/v1/queue', handler: 'handleGetQueue', category: 'queue' },
  // Note: /api/v1/queue/status/:id handled separately due to param
  { method: 'POST', path: '/api/v1/queue/process', handler: 'handleForceQueueProcess', category: 'queue' },
  
  // ============ REQUEST ROUTES ============
  { method: 'GET', path: '/requests', handler: 'handleGetRequests', category: 'request' },
  { method: 'POST', path: '/requests/process', handler: 'handleForceProcess', category: 'request' },
  { method: 'POST', path: '/requests/upvote', handler: 'handleUpvoteRequest', category: 'request' },
  
  // ============ WORLD ROUTES ============
  { method: 'GET', path: '/api/v1/world', handler: 'handleWorldStatus', category: 'world' },
  { method: 'GET', path: '/api/v1/world/history', handler: 'handleWorldHistory', category: 'world' },
  { method: 'GET', path: '/api/v1/world/leaderboard', handler: 'handleLeaderboard', category: 'world' },
  { method: 'GET', path: '/api/v1/status', handler: 'handleApiStatus', category: 'world' },
  
  // ============ RELAY/INTEL ROUTES ============
  { method: 'POST', path: '/api/v1/relay/intel', handler: 'handleIntelRelay', category: 'relay' },
  { method: 'GET', path: '/api/v1/relay/intel', handler: 'handleGetIntel', category: 'relay' },
  { method: 'POST', path: '/api/v1/relay/broadcast', handler: 'handleBroadcastToAgents', category: 'relay' },
  
  // ============ SPECTATE ROUTES ============
  { method: 'GET', path: '/api/v1/spectate', handler: 'handleSpectateList', category: 'spectate' },
  // Note: /api/v1/spectate/:agent handled separately due to param
  
  // ============ CHAT ROUTES ============
  { method: 'POST', path: '/api/v1/chat/agent', handler: 'handleAgentChat', category: 'chat' },
  { method: 'GET', path: '/api/v1/chat/messages', handler: 'handleGetAgentMessages', category: 'chat' },
  
  // ============ FORUM ROUTES ============
  { method: 'POST', path: '/api/v1/forum/comment', handler: 'handleForumComment', category: 'forum' },
  { method: 'GET', path: '/api/v1/forum/posts', handler: 'handleGetForumPosts', category: 'forum' },
  
  // ============ DISCOVERY ROUTES ============
  { method: 'GET', path: '/api/v1/discover', handler: 'handleApiDiscover', category: 'discovery' },
  { method: 'GET', path: '/api/v1/site', handler: 'handleSiteInfo', category: 'discovery' },
  { method: 'GET', path: '/api/v1/skill', handler: 'handleSkillFile', category: 'discovery' },
  { method: 'GET', path: '/api/v1/feed', handler: 'handleActivityFeed', category: 'discovery' },
  { method: 'GET', path: '/api/v1/ws-url', handler: 'handleWsUrl', category: 'discovery' },
  { method: 'GET', path: '/api/v1/onboard', handler: 'handleOnboardGuide', category: 'discovery' },
  { method: 'GET', path: '/.well-known/ai-plugin.json', handler: 'handleAiPluginManifest', category: 'discovery' },
  
  // ============ GUEST ROUTES ============
  { method: 'POST', path: '/api/v1/guest/spawn', handler: 'handleGuestSpawn', category: 'guest' },
];

/**
 * Count routes by category
 */
export function getRouteCountsByCategory(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const route of routes) {
    counts[route.category] = (counts[route.category] || 0) + 1;
  }
  return counts;
}

/**
 * Get routes for a specific category
 */
export function getRoutesByCategory(category: RouteDefinition['category']): RouteDefinition[] {
  return routes.filter(r => r.category === category);
}

/**
 * Print route summary
 */
export function printRouteSummary(): void {
  const counts = getRouteCountsByCategory();
  console.log('[ROUTES] Route summary:');
  for (const [category, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${category}: ${count} routes`);
  }
  console.log(`  TOTAL: ${routes.length} routes`);
}
