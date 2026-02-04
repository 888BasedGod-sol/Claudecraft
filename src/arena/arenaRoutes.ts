/**
 * Arena API Routes
 * HTTP endpoints for the arena system
 */

import { IncomingMessage, ServerResponse } from 'http';
import { arenaManager } from './arenaManager';
import { POWER_UPS } from './powerUps';
import { generateArenaBuildCommands } from './arenaBuilder';
import { solanaService } from './solanaService';

// Helper to parse JSON body
async function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

// Helper to send JSON response
function sendJson(res: ServerResponse, status: number, data: any): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Extract agent ID from authorization header
function getAgentId(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth?.startsWith('Bearer ')) return null;
  // For now, use the token as the agent ID
  // In production, this would validate against external-agents.json
  return auth.replace('Bearer ', '');
}

/**
 * Handle arena API requests
 * Returns true if the request was handled
 */
export async function handleArenaRoute(
  req: IncomingMessage, 
  res: ServerResponse,
  path: string,
  method: string
): Promise<boolean> {
  
  // Check if this is an arena route
  if (!path.startsWith('/api/v1/arena')) {
    return false;
  }

  const route = path.replace('/api/v1/arena', '');

  try {
    // === PUBLIC ROUTES ===

    // GET /api/v1/arena/status - Arena status
    if (route === '/status' && method === 'GET') {
      const stats = arenaManager.getArenaStats();
      const activeMatch = arenaManager.getActiveMatch();
      sendJson(res, 200, {
        success: true,
        stats,
        activeMatch: activeMatch ? {
          id: activeMatch.id,
          fighter1: activeMatch.fighter1.agentName,
          fighter2: activeMatch.fighter2.agentName,
          pot: activeMatch.potTotal,
          status: activeMatch.status
        } : null
      });
      return true;
    }

    // GET /api/v1/arena/leaderboard - Get leaderboard
    if (route === '/leaderboard' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const type = url.searchParams.get('type') as 'elo' | 'earnings' || 'elo';
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const leaderboard = arenaManager.getLeaderboard(type, limit);
      sendJson(res, 200, { success: true, leaderboard });
      return true;
    }

    // GET /api/v1/arena/powerups - List power-ups
    if (route === '/powerups' && method === 'GET') {
      sendJson(res, 200, { success: true, powerups: POWER_UPS });
      return true;
    }

    // GET /api/v1/arena/matches - Recent matches
    if (route === '/matches' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '10');
      const matches = arenaManager.getRecentMatches(limit);
      sendJson(res, 200, { success: true, matches });
      return true;
    }

    // === AUTHENTICATED ROUTES ===

    const agentToken = getAgentId(req);

    // POST /api/v1/arena/register - Register for arena
    if (route === '/register' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }
      
      const body = await parseBody(req);
      const agentName = body.agentName;
      
      if (!agentName) {
        sendJson(res, 400, { success: false, error: 'agentName required' });
        return true;
      }

      const result = arenaManager.registerForArena(agentToken, agentName);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/profile - Get agent profile
    if (route === '/profile' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const profile = arenaManager.getAgentProfile(agentToken);
      if (!profile) {
        sendJson(res, 404, { success: false, error: 'Not registered for arena' });
        return true;
      }

      sendJson(res, 200, { success: true, profile });
      return true;
    }

    // PUT /api/v1/arena/profile - Update agent profile
    if (route === '/profile' && method === 'PUT') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { agentName, bio, avatar, twitter, website, battleCry, theme } = body;

      // Validate theme if provided
      const validThemes = ['default', 'fire', 'ice', 'shadow', 'gold', 'cosmic'];
      if (theme && !validThemes.includes(theme)) {
        sendJson(res, 400, { 
          success: false, 
          error: `Invalid theme. Valid options: ${validThemes.join(', ')}` 
        });
        return true;
      }

      const result = arenaManager.updateProfile(agentToken, {
        agentName,
        bio,
        avatar,
        twitter,
        website,
        battleCry,
        theme
      });

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/deposit - Deposit tokens (mock)
    if (route === '/deposit' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const amount = body.amount;

      if (!amount || amount <= 0) {
        sendJson(res, 400, { success: false, error: 'Valid amount required' });
        return true;
      }

      const result = arenaManager.deposit(agentToken, amount);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/challenge - Create challenge
    if (route === '/challenge' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { targetAgent, wagerAmount, powerUps } = body;

      if (!targetAgent || !wagerAmount) {
        sendJson(res, 400, { success: false, error: 'targetAgent and wagerAmount required' });
        return true;
      }

      const result = arenaManager.createChallenge(
        agentToken,
        targetAgent,
        wagerAmount,
        powerUps || []
      );

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/challenges - Get pending challenges
    if (route === '/challenges' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const challenges = arenaManager.getPendingChallenges(agentToken);
      sendJson(res, 200, { success: true, challenges });
      return true;
    }

    // POST /api/v1/arena/accept - Accept challenge
    if (route === '/accept' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { challengeId, powerUps } = body;

      if (!challengeId) {
        sendJson(res, 400, { success: false, error: 'challengeId required' });
        return true;
      }

      const result = await arenaManager.acceptChallenge(
        challengeId,
        agentToken,
        powerUps || []
      );

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/decline - Decline challenge
    if (route === '/decline' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { challengeId } = body;

      if (!challengeId) {
        sendJson(res, 400, { success: false, error: 'challengeId required' });
        return true;
      }

      const result = arenaManager.declineChallenge(challengeId, agentToken);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/report-winner - Report match winner (admin/system only)
    if (route === '/report-winner' && method === 'POST') {
      // TODO: Add admin authentication
      const body = await parseBody(req);
      const { matchId, winnerId } = body;

      if (!matchId || !winnerId) {
        sendJson(res, 400, { success: false, error: 'matchId and winnerId required' });
        return true;
      }

      const result = await arenaManager.reportWinner(matchId, winnerId);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/cancel - Cancel active match (admin only)
    if (route === '/cancel' && method === 'POST') {
      // TODO: Add admin authentication
      const body = await parseBody(req);
      const reason = body.reason || 'Admin cancelled';

      const result = arenaManager.cancelActiveMatch(reason);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/build-commands - Get arena build commands (for manual execution)
    if (route === '/build-commands' && method === 'GET') {
      const commands = await generateArenaBuildCommands();
      sendJson(res, 200, { 
        success: true, 
        message: 'Copy and paste these commands into your Minecraft server console',
        commandCount: commands.length,
        commands 
      });
      return true;
    }

    // === SOLANA ROUTES ===

    // GET /api/v1/arena/solana/info - Get Solana network info
    if (route === '/solana/info' && method === 'GET') {
      await solanaService.initialize();
      const serverInfo = solanaService.getServerInfo();
      const serverBalance = await solanaService.getServerBalance();
      sendJson(res, 200, { 
        success: true, 
        network: serverInfo?.network || 'unknown',
        serverAddress: serverInfo?.address || null,
        serverBalance,
        conversionRate: '1 SOL = 1000 arena tokens',
        minDeposit: '0.01 SOL'
      });
      return true;
    }

    // GET /api/v1/arena/solana/deposit-address - Get deposit address for agent
    if (route === '/solana/deposit-address' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      await solanaService.initialize();
      const { address, isNew } = solanaService.getOrCreateDepositAddress(agentToken);
      const balance = await solanaService.getDepositBalance(agentToken);
      
      sendJson(res, 200, { 
        success: true, 
        depositAddress: address,
        isNew,
        currentBalance: balance,
        message: `Send SOL to this address. 1 SOL = 1000 arena tokens. Min deposit: 0.01 SOL`
      });
      return true;
    }

    // POST /api/v1/arena/solana/check-deposits - Check for new deposits and credit tokens
    if (route === '/solana/check-deposits' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      await solanaService.initialize();
      const { newDeposits, totalNewTokens } = await solanaService.checkDeposits(agentToken);
      
      // Credit tokens to agent's arena balance
      if (totalNewTokens > 0) {
        const result = arenaManager.deposit(agentToken, totalNewTokens);
        if (result.success) {
          // Mark deposits as credited
          for (const dep of newDeposits) {
            solanaService.markDepositCredited(dep.signature);
          }
        }
      }

      sendJson(res, 200, { 
        success: true, 
        newDeposits,
        totalNewTokens,
        message: totalNewTokens > 0 
          ? `Credited ${totalNewTokens} tokens from ${newDeposits.length} deposit(s)`
          : 'No new deposits found'
      });
      return true;
    }

    // POST /api/v1/arena/solana/airdrop - Request devnet airdrop (devnet only)
    if (route === '/solana/airdrop' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      await solanaService.initialize();
      const body = await parseBody(req);
      const amount = Math.min(body.amount || 1, 2); // Max 2 SOL airdrop
      
      const result = await solanaService.requestAirdrop(agentToken, amount);
      if (result.success) {
        sendJson(res, 200, { 
          success: true, 
          signature: result.signature,
          amount,
          message: `Airdropped ${amount} SOL. Call /solana/check-deposits to credit tokens.`
        });
      } else {
        sendJson(res, 400, { success: false, error: result.error });
      }
      return true;
    }

    // GET /api/v1/arena/solana/balance - Get SOL balance of deposit address
    if (route === '/solana/balance' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      await solanaService.initialize();
      const balance = await solanaService.getDepositBalance(agentToken);
      const address = solanaService.getDepositAddress(agentToken);
      
      sendJson(res, 200, { 
        success: true, 
        depositAddress: address,
        balanceSol: balance,
        balanceTokens: solanaService.solToTokens(balance)
      });
      return true;
    }

    // 404 for unknown arena routes
    sendJson(res, 404, { success: false, error: 'Arena endpoint not found' });
    return true;

  } catch (error: any) {
    console.error('[ARENA-API] Error:', error);
    sendJson(res, 500, { success: false, error: error.message });
    return true;
  }
}
