/**
 * Arena API Routes
 * HTTP endpoints for the arena system
 */

import { IncomingMessage, ServerResponse } from 'http';
import { arenaManager } from './arenaManager';
import { POWER_UPS } from './powerUps';
import { generateArenaBuildCommands } from './arenaBuilder';
import { solanaService } from './solanaService';
import { gameEngine } from './gameEngine';
import { GAME_CONFIGS, GameType, WagerCurrency } from './gameTypes';
import { craftTokenService } from './craftTokenService';
import { bountyManager } from './bountyManager';
import { arenaEventStream } from './arenaEventStream';
import { agentWalletService } from './agentWalletService';

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

    // === 1v1 GAME ROUTES ===

    // GET /api/v1/arena/games - List available game types
    if (route === '/games' && method === 'GET') {
      const gameTypes = Object.entries(GAME_CONFIGS).map(([id, config]) => ({
        id,
        name: config.name,
        description: config.description,
        minWagers: {
          tokens: config.minWagerTokens,
          SOL: config.minWagerSol,
          CRAFT: config.minWagerCraft
        },
        category: config.category,
        turnBased: config.turnBased,
        requiresJudge: config.requiresJudge
      }));
      sendJson(res, 200, { 
        success: true, 
        gameTypes,
        supportedCurrencies: ['tokens', 'SOL', 'CRAFT'],
        note: 'All wager currencies available! tokens=play money, SOL/CRAFT=real value'
      });
      return true;
    }

    // GET /api/v1/arena/games/waiting - List games waiting for opponent
    if (route === '/games/waiting' && method === 'GET') {
      const games = gameEngine.getWaitingGames().map(g => ({
        id: g.id,
        gameType: g.gameType,
        gameName: g.config.name,
        creator: g.player1.agentName,
        wager: g.wagerAmount,
        currency: g.wagerCurrency,
        prompt: g.prompt,
        createdAt: g.createdAt
      }));
      sendJson(res, 200, { success: true, games });
      return true;
    }

    // GET /api/v1/arena/games/judging - List games awaiting judgment
    if (route === '/games/judging' && method === 'GET') {
      const games = gameEngine.getGamesNeedingJudgment().map(g => ({
        id: g.id,
        gameType: g.gameType,
        gameName: g.config.name,
        player1: { name: g.player1.agentName, submissions: g.player1.submissions },
        player2: { name: g.player2?.agentName, submissions: g.player2?.submissions },
        wager: g.wagerAmount,
        currency: g.wagerCurrency,
        prompt: g.prompt,
        endedAt: g.endedAt
      }));
      sendJson(res, 200, { success: true, games });
      return true;
    }

    // POST /api/v1/arena/game/create - Create a new game
    if (route === '/game/create' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { gameType, wager, currency, prompt } = body;
      const wagerCurrency: WagerCurrency = currency || 'tokens';

      if (!gameType || !GAME_CONFIGS[gameType as GameType]) {
        sendJson(res, 400, { 
          success: false, 
          error: `Invalid game type. Available: ${Object.keys(GAME_CONFIGS).join(', ')}` 
        });
        return true;
      }

      if (!wager || wager <= 0) {
        sendJson(res, 400, { success: false, error: 'Positive wager amount required' });
        return true;
      }

      // Validate currency
      if (!['SOL', 'CRAFT', 'tokens'].includes(wagerCurrency)) {
        sendJson(res, 400, { success: false, error: 'Invalid currency. Use: SOL, CRAFT, or tokens' });
        return true;
      }

      // Get agent profile for name
      const profile = arenaManager.getAgentProfile(agentToken);
      if (!profile) {
        sendJson(res, 400, { success: false, error: 'Not registered for arena' });
        return true;
      }

      // Handle different currencies
      if (wagerCurrency === 'tokens') {
        // Check token balance
        if (profile.tokenBalance < wager) {
          sendJson(res, 400, { success: false, error: `Insufficient balance. Have: ${profile.tokenBalance}, Need: ${wager}` });
          return true;
        }

        // Deduct wager from token balance
        const deductResult = arenaManager.withdraw(agentToken, wager);
        if (!deductResult.success) {
          sendJson(res, 400, { success: false, error: deductResult.error });
          return true;
        }
      } else if (wagerCurrency === 'SOL') {
        // For SOL wagers, verify they have sufficient deposit balance
        await solanaService.initialize();
        const solBalance = await solanaService.getDepositBalance(agentToken);
        if (solBalance < wager) {
          sendJson(res, 400, { 
            success: false, 
            error: `Insufficient SOL balance. Have: ${solBalance} SOL, Need: ${wager} SOL`,
            depositAddress: solanaService.getDepositAddress(agentToken)
          });
          return true;
        }
        // Note: SOL will be escrowed when game starts
      } else if (wagerCurrency === 'CRAFT') {
        // For CRAFT wagers, verify SPL token balance and escrow
        await craftTokenService.initialize();
        const craftBalance = await craftTokenService.getAgentCraftBalance(agentToken);
        if (craftBalance < wager) {
          sendJson(res, 400, { 
            success: false, 
            error: `Insufficient CRAFT balance. Have: ${craftBalance} CRAFT, Need: ${wager} CRAFT`
          });
          return true;
        }
        // Note: CRAFT will be escrowed when game starts, same as SOL
      }

      const result = gameEngine.createGame(
        gameType as GameType,
        agentToken,
        profile.agentName,
        wager,
        wagerCurrency,
        prompt
      );

      if (!result.success && wagerCurrency === 'tokens') {
        // Refund on failure (only for tokens, SOL not escrowed yet)
        arenaManager.deposit(agentToken, wager);
      }

      // Emit WebSocket event for new game
      if (result.success && result.game) {
        arenaEventStream.emitGameCreated({
          id: result.game.id,
          gameType: result.game.gameType,
          gameName: GAME_CONFIGS[gameType as GameType]?.name || gameType,
          wager: result.game.wagerAmount,
          creatorName: profile.agentName
        });
      }

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/game/join - Join an existing game
    if (route === '/game/join' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { gameId } = body;

      if (!gameId) {
        sendJson(res, 400, { success: false, error: 'gameId required' });
        return true;
      }

      const game = gameEngine.getGame(gameId);
      if (!game) {
        sendJson(res, 404, { success: false, error: 'Game not found' });
        return true;
      }

      // Get agent profile
      const profile = arenaManager.getAgentProfile(agentToken);
      if (!profile) {
        sendJson(res, 400, { success: false, error: 'Not registered for arena' });
        return true;
      }

      // Check balance based on wager currency
      if (game.wagerCurrency === 'tokens') {
        if (profile.tokenBalance < game.wagerAmount) {
          sendJson(res, 400, { 
            success: false, 
            error: `Insufficient balance. Need: ${game.wagerAmount}, Have: ${profile.tokenBalance}` 
          });
          return true;
        }

        // Deduct wager
        const deductResult = arenaManager.withdraw(agentToken, game.wagerAmount);
        if (!deductResult.success) {
          sendJson(res, 400, { success: false, error: deductResult.error });
          return true;
        }
      } else if (game.wagerCurrency === 'SOL') {
        // Check SOL balance
        await solanaService.initialize();
        const solBalance = await solanaService.getDepositBalance(agentToken);
        if (solBalance < game.wagerAmount) {
          sendJson(res, 400, { 
            success: false, 
            error: `Insufficient SOL balance. Need: ${game.wagerAmount} SOL, Have: ${solBalance} SOL`,
            depositAddress: solanaService.getDepositAddress(agentToken)
          });
          return true;
        }
        // Note: SOL escrowed at game start
      } else if (game.wagerCurrency === 'CRAFT') {
        // Check CRAFT balance
        await craftTokenService.initialize();
        const craftBalance = await craftTokenService.getAgentCraftBalance(agentToken);
        if (craftBalance < game.wagerAmount) {
          sendJson(res, 400, { 
            success: false, 
            error: `Insufficient CRAFT balance. Need: ${game.wagerAmount} CRAFT, Have: ${craftBalance} CRAFT`
          });
          return true;
        }
        // Note: CRAFT escrowed at game start
      }

      const result = gameEngine.joinGame(gameId, agentToken, profile.agentName);
      
      if (!result.success && game.wagerCurrency === 'tokens') {
        // Refund on failure (only tokens)
        arenaManager.deposit(agentToken, game.wagerAmount);
      }

      // Emit WebSocket event to game creator
      if (result.success) {
        arenaEventStream.emitGameJoined(gameId, profile.agentName, game.player1.agentId);
      }

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/game/submit - Submit a game action
    if (route === '/game/submit' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { gameId, content } = body;

      if (!gameId || !content) {
        sendJson(res, 400, { success: false, error: 'gameId and content required' });
        return true;
      }

      const result = gameEngine.submitAction(gameId, agentToken, content);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/game/:id - Get game details
    if (route.startsWith('/game/') && method === 'GET') {
      const gameId = route.replace('/game/', '');
      const game = gameEngine.getGame(gameId);
      
      if (!game) {
        sendJson(res, 404, { success: false, error: 'Game not found' });
        return true;
      }

      sendJson(res, 200, { 
        success: true, 
        game: {
          id: game.id,
          gameType: game.gameType,
          config: game.config,
          player1: { name: game.player1.agentName, score: game.player1.score, submissions: game.player1.submissions },
          player2: game.player2 ? { name: game.player2.agentName, score: game.player2.score, submissions: game.player2.submissions } : null,
          wagerAmount: game.wagerAmount,
          potTotal: game.potTotal,
          winnerPayout: game.winnerPayout,
          status: game.status,
          currentTurn: game.currentTurn,
          turnNumber: game.turnNumber,
          prompt: game.prompt,
          turnDeadline: game.turnDeadline,
          winnerId: game.winnerId,
          winnerName: game.winnerName,
          judgeReason: game.judgeReason,
          gameLog: game.gameLog
        }
      });
      return true;
    }

    // POST /api/v1/arena/game/cancel - Cancel a waiting game
    if (route === '/game/cancel' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { gameId } = body;

      if (!gameId) {
        sendJson(res, 400, { success: false, error: 'gameId required' });
        return true;
      }

      const game = gameEngine.getGame(gameId);
      if (game) {
        // Refund the wager based on currency
        if (game.wagerCurrency === 'CRAFT') {
          // For CRAFT, we need to refund from escrow (but CRAFT isn't escrowed until game starts)
          // If game is still waiting, balance was just checked, not escrowed
          console.log(`[Arena] CRAFT game cancelled before start - no refund needed (not escrowed)`);
        } else if (game.wagerCurrency === 'SOL') {
          // SOL also not escrowed until game starts
          console.log(`[Arena] SOL game cancelled before start - no refund needed (not escrowed)`);
        } else {
          // Tokens - refund immediately
          arenaManager.deposit(agentToken, game.wagerAmount);
        }
      }

      const result = gameEngine.cancelGame(gameId, agentToken);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/game/forfeit - Forfeit an active game
    if (route === '/game/forfeit' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { gameId } = body;

      if (!gameId) {
        sendJson(res, 400, { success: false, error: 'gameId required' });
        return true;
      }

      const result = gameEngine.forfeitGame(gameId, agentToken);
      
      // Credit winner based on wager currency
      if (result.success && result.game?.winnerId) {
        const { winnerId, winnerPayout, wagerCurrency, id } = result.game;
        if (wagerCurrency === 'CRAFT') {
          await craftTokenService.payoutWinner(winnerId, winnerPayout, id);
        } else if (wagerCurrency === 'SOL') {
          await solanaService.payoutGameWinner(winnerId, winnerPayout);
        } else {
          arenaManager.deposit(winnerId, winnerPayout);
        }
      }

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/game/judge - Judge a completed game
    if (route === '/game/judge' && method === 'POST') {
      // This could be authenticated to only allow authorized judges
      const body = await parseBody(req);
      const { gameId, winnerId, reason } = body;

      if (!gameId || !winnerId || !reason) {
        sendJson(res, 400, { success: false, error: 'gameId, winnerId, and reason required' });
        return true;
      }

      const result = gameEngine.judgeGame(gameId, winnerId, reason);
      
      // Credit winner based on wager currency
      if (result.success && result.game?.winnerId) {
        const { winnerId: winner, winnerPayout, wagerCurrency, id } = result.game;
        if (wagerCurrency === 'CRAFT') {
          await craftTokenService.payoutWinner(winner, winnerPayout, id);
        } else if (wagerCurrency === 'SOL') {
          await solanaService.payoutGameWinner(winner, winnerPayout);
        } else {
          arenaManager.deposit(winner, winnerPayout);
        }
      }

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/my-games - Get current player's games
    if (route === '/my-games' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const games = gameEngine.getPlayerGames(agentToken).map(g => ({
        id: g.id,
        gameType: g.gameType,
        gameName: g.config.name,
        opponent: g.player1.agentId === agentToken ? g.player2?.agentName : g.player1.agentName,
        wager: g.wagerAmount,
        status: g.status,
        isMyTurn: g.status === 'in_progress' && 
                  ((g.currentTurn === 'player1' && g.player1.agentId === agentToken) ||
                   (g.currentTurn === 'player2' && g.player2?.agentId === agentToken)),
        prompt: g.prompt
      }));

      sendJson(res, 200, { success: true, games });
      return true;
    }

    // ==========================================================================
    // CRAFT TOKEN ROUTES
    // ==========================================================================

    // GET /api/v1/arena/craft/info - Get CRAFT token info
    if (route === '/craft/info' && method === 'GET') {
      await craftTokenService.initialize();
      const networkInfo = craftTokenService.getNetworkInfo();
      const serverBalance = await craftTokenService.getServerCraftBalance();
      const testModeInfo = craftTokenService.getTestModeInfo();
      sendJson(res, 200, {
        success: true,
        ...networkInfo,
        serverBalance: testModeInfo.enabled ? testModeInfo.serverBalance : serverBalance,
        testMode: testModeInfo.enabled,
        description: testModeInfo.enabled 
          ? '🧪 TEST MODE - Simulated CRAFT tokens (no real transactions)' 
          : 'CRAFT is the native token for ClaudeCraft arena wagers, bounties, and tips'
      });
      return true;
    }

    // GET /api/v1/arena/events/info - Get WebSocket event stream info
    if (route === '/events/info' && method === 'GET') {
      const stats = arenaEventStream.getStats();
      sendJson(res, 200, {
        success: true,
        websocketUrl: `ws://localhost:${stats.port}`,
        ...stats,
        availableEvents: [
          'bounty_created', 'bounty_claimed', 'bounty_submitted', 
          'bounty_completed', 'bounty_cancelled', 'bounty_expired',
          'game_created', 'game_joined', 'game_turn', 'game_ended', 'game_cancelled',
          'tip_received', 'tip_sent', 'balance_changed', 'wager_escrowed', 'wager_payout'
        ],
        usage: {
          connect: 'Connect via WebSocket to receive real-time events',
          authenticate: 'Send {"action": "auth", "token": "your_api_key"} to receive private events',
          subscribe: 'Send {"action": "subscribe", "events": ["bounty_created"]} to filter events',
          unsubscribe: 'Send {"action": "unsubscribe", "events": ["game_created"]} to stop receiving'
        }
      });
      return true;
    }

    // GET /api/v1/arena/craft/balance - Get agent's CRAFT balance
    if (route === '/craft/balance' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      await craftTokenService.initialize();
      const balance = await craftTokenService.getAgentCraftBalance(agentToken);
      const depositInfo = craftTokenService.getDepositAddress(agentToken);
      
      sendJson(res, 200, {
        success: true,
        balance,
        depositAddress: depositInfo?.wallet || null,
        tokenAccount: depositInfo?.tokenAccount || null
      });
      return true;
    }

    // GET /api/v1/arena/craft/deposit-address - Get or create CRAFT deposit address
    if (route === '/craft/deposit-address' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      await craftTokenService.initialize();
      const { address, tokenAccount, isNew } = await craftTokenService.getOrCreateWallet(agentToken);
      const balance = await craftTokenService.getAgentCraftBalance(agentToken);
      
      sendJson(res, 200, {
        success: true,
        walletAddress: address,
        tokenAccount,
        isNew,
        currentBalance: balance,
        message: 'Send CRAFT tokens to this address to fund your account'
      });
      return true;
    }

    // GET /api/v1/arena/craft/transactions - Get CRAFT transaction history
    if (route === '/craft/transactions' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      
      const transactions = craftTokenService.getAgentTransactions(agentToken, limit);
      sendJson(res, 200, { success: true, transactions });
      return true;
    }

    // POST /api/v1/arena/craft/tip - Send CRAFT tip to another agent
    if (route === '/craft/tip' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { toAgentId, amount, message } = body;

      if (!toAgentId || !amount) {
        sendJson(res, 400, { success: false, error: 'toAgentId and amount required' });
        return true;
      }
      if (amount < 1) {
        sendJson(res, 400, { success: false, error: 'Minimum tip is 1 CRAFT' });
        return true;
      }
      if (toAgentId === agentToken) {
        sendJson(res, 400, { success: false, error: 'Cannot tip yourself' });
        return true;
      }

      await craftTokenService.initialize();
      const result = await craftTokenService.sendTip(agentToken, toAgentId, amount, message);
      
      if (result.success) {
        // Emit WebSocket events to both sender and recipient
        arenaEventStream.emitTip(agentToken, toAgentId, amount, message, result.signature);
        
        sendJson(res, 200, {
          success: true,
          message: `Tipped ${amount} CRAFT`,
          signature: result.signature,
          explorerUrl: craftTokenService.getExplorerUrl(result.signature!)
        });
      } else {
        sendJson(res, 400, { success: false, error: result.error });
      }
      return true;
    }

    // ==========================================================================
    // BOUNTY ROUTES
    // ==========================================================================

    // GET /api/v1/arena/bounties - List bounties
    if (route === '/bounties' && method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const status = url.searchParams.get('status') as any;
      const minAmount = url.searchParams.get('minAmount');
      const maxAmount = url.searchParams.get('maxAmount');
      const tags = url.searchParams.get('tags');
      const limit = parseInt(url.searchParams.get('limit') || '50');

      const bounties = bountyManager.listBounties({
        status: status || undefined,
        minAmount: minAmount ? parseInt(minAmount) : undefined,
        maxAmount: maxAmount ? parseInt(maxAmount) : undefined,
        tags: tags ? tags.split(',') : undefined,
      }, limit);

      const stats = bountyManager.getStats();

      sendJson(res, 200, { success: true, bounties, stats });
      return true;
    }

    // GET /api/v1/arena/bounties/:id - Get single bounty
    if (route.startsWith('/bounties/') && method === 'GET' && route.split('/').length === 3) {
      const bountyId = route.split('/')[2];
      const bounty = bountyManager.getBounty(bountyId);
      
      if (!bounty) {
        sendJson(res, 404, { success: false, error: 'Bounty not found' });
        return true;
      }
      
      sendJson(res, 200, { success: true, bounty });
      return true;
    }

    // POST /api/v1/arena/bounties/create - Create a bounty
    if (route === '/bounties/create' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { title, description, amount, tags, expiresInHours } = body;

      if (!title || !description || !amount) {
        sendJson(res, 400, { success: false, error: 'title, description, and amount required' });
        return true;
      }

      // Get agent name
      const agent = arenaManager.getAgentProfile(agentToken);
      const agentName = agent?.agentName || agentToken.substring(0, 8);

      await craftTokenService.initialize();
      const result = await bountyManager.createBounty(
        agentToken,
        agentName,
        title,
        description,
        amount,
        tags || [],
        expiresInHours || 168
      );

      if (result.success) {
        sendJson(res, 201, {
          success: true,
          bounty: result.bounty,
          message: `Created bounty for ${amount} CRAFT`,
          escrowSignature: result.bounty?.escrowSignature
        });
      } else {
        sendJson(res, 400, { success: false, error: result.error });
      }
      return true;
    }

    // POST /api/v1/arena/bounties/claim - Claim a bounty
    if (route === '/bounties/claim' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { bountyId } = body;

      if (!bountyId) {
        sendJson(res, 400, { success: false, error: 'bountyId required' });
        return true;
      }

      const agent = arenaManager.getAgentProfile(agentToken);
      const agentName = agent?.agentName || agentToken.substring(0, 8);

      const result = bountyManager.claimBounty(bountyId, agentToken, agentName);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/bounties/submit - Submit completed bounty
    if (route === '/bounties/submit' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { bountyId, notes } = body;

      if (!bountyId) {
        sendJson(res, 400, { success: false, error: 'bountyId required' });
        return true;
      }

      const result = bountyManager.submitBounty(bountyId, agentToken, notes);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/bounties/approve - Approve and payout bounty
    if (route === '/bounties/approve' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { bountyId } = body;

      if (!bountyId) {
        sendJson(res, 400, { success: false, error: 'bountyId required' });
        return true;
      }

      await craftTokenService.initialize();
      const result = await bountyManager.approveBounty(bountyId, agentToken);
      
      if (result.success) {
        sendJson(res, 200, {
          success: true,
          bounty: result.bounty,
          message: `Approved! ${result.bounty?.amount} CRAFT sent to builder`,
          payoutSignature: result.signature,
          explorerUrl: craftTokenService.getExplorerUrl(result.signature!)
        });
      } else {
        sendJson(res, 400, { success: false, error: result.error });
      }
      return true;
    }

    // POST /api/v1/arena/bounties/cancel - Cancel a bounty
    if (route === '/bounties/cancel' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { bountyId } = body;

      if (!bountyId) {
        sendJson(res, 400, { success: false, error: 'bountyId required' });
        return true;
      }

      await craftTokenService.initialize();
      const result = await bountyManager.cancelBounty(bountyId, agentToken);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/bounties/release - Release claimed bounty
    if (route === '/bounties/release' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { bountyId } = body;

      if (!bountyId) {
        sendJson(res, 400, { success: false, error: 'bountyId required' });
        return true;
      }

      const result = bountyManager.releaseClaim(bountyId, agentToken);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/bounties/my - Get my bounties (created and claimed)
    if (route === '/bounties/my' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const created = bountyManager.listBounties({ creatorId: agentToken }, 100);
      const claimed = bountyManager.listBounties({ claimedBy: agentToken }, 100);

      sendJson(res, 200, {
        success: true,
        created,
        claimed,
        createdCount: created.length,
        claimedCount: claimed.length
      });
      return true;
    }

    // =========================================================================
    // AGENT WALLET ENDPOINTS
    // =========================================================================

    // GET /api/v1/arena/wallet/status - Get wallet service status
    if (route === '/wallet/status' && method === 'GET') {
      const stats = agentWalletService.getStats();
      const heliusStatus = solanaService.getHeliusStatus();
      sendJson(res, 200, {
        success: true,
        initialized: agentWalletService.isReady(),
        ...stats,
        helius: heliusStatus
      });
      return true;
    }

    // POST /api/v1/arena/wallet/create - Create/get agent wallet
    if (route === '/wallet/create' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const result = await agentWalletService.getOrCreateWallet(agentToken);
      sendJson(res, 200, { success: true, ...result });
      return true;
    }

    // GET /api/v1/arena/wallet/balance - Get agent wallet balance
    if (route === '/wallet/balance' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const address = agentWalletService.getWalletAddress(agentToken);
      if (!address) {
        sendJson(res, 404, { success: false, error: 'No wallet found. Create one first.' });
        return true;
      }

      const balances = await agentWalletService.getTokenBalances(agentToken);
      sendJson(res, 200, {
        success: true,
        address,
        ...balances
      });
      return true;
    }

    // GET /api/v1/arena/wallet/transactions - Get transaction history
    if (route === '/wallet/transactions' && method === 'GET') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit') || '10');

      const transactions = await agentWalletService.getTransactionHistory(agentToken, limit);
      sendJson(res, 200, { success: true, transactions });
      return true;
    }

    // POST /api/v1/arena/wallet/send - Send SOL from agent wallet
    if (route === '/wallet/send' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { toAddress, amount } = body;

      if (!toAddress || !amount) {
        sendJson(res, 400, { success: false, error: 'toAddress and amount required' });
        return true;
      }

      const result = await agentWalletService.sendSOL(agentToken, toAddress, amount);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // POST /api/v1/arena/wallet/airdrop - Request devnet airdrop
    if (route === '/wallet/airdrop' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const amount = body.amount || 1;

      const result = await agentWalletService.requestAirdrop(agentToken, amount);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/wallet/stats - Get overall wallet stats
    if (route === '/wallet/stats' && method === 'GET') {
      const stats = agentWalletService.getStats();
      sendJson(res, 200, { success: true, ...stats });
      return true;
    }

    // POST /api/v1/arena/wallet/import - Import existing wallet
    if (route === '/wallet/import' && method === 'POST') {
      if (!agentToken) {
        sendJson(res, 401, { success: false, error: 'Authorization required' });
        return true;
      }

      const body = await parseBody(req);
      const { privateKey } = body;

      if (!privateKey) {
        sendJson(res, 400, { success: false, error: 'privateKey required (base58 encoded)' });
        return true;
      }

      const result = agentWalletService.importWallet(agentToken, privateKey);
      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // GET /api/v1/arena/helius/status - Get Helius RPC status
    if (route === '/helius/status' && method === 'GET') {
      const status = solanaService.getHeliusStatus();
      sendJson(res, 200, { success: true, ...status });
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
