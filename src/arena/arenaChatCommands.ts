/**
 * Arena Chat Commands
 * Allows Minecraft players to wager and play games via chat commands
 */

import { arenaManager } from './arenaManager';
import { gameEngine } from './gameEngine';
import { craftTokenService } from './craftTokenService';
import { GAME_CONFIGS, GameType, WagerCurrency } from './gameTypes';
import { arenaEventStream } from './arenaEventStream';

// Map Minecraft usernames to agent tokens (for tracking wagers)
const playerTokens: Map<string, string> = new Map();
const playerWallets: Map<string, string> = new Map();

// Data persistence file
const DATA_FILE = './data/arena-players.json';

interface PlayerData {
  username: string;
  token: string;
  wallet?: string;
  registeredAt: string;
}

// Load existing player data
function loadPlayerData(): void {
  try {
    const fs = require('fs');
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      for (const player of data.players || []) {
        playerTokens.set(player.username.toLowerCase(), player.token);
        if (player.wallet) {
          playerWallets.set(player.username.toLowerCase(), player.wallet);
        }
      }
      console.log(`[ARENA-CHAT] Loaded ${playerTokens.size} registered players`);
    }
  } catch (e) {
    console.log('[ARENA-CHAT] No existing player data, starting fresh');
  }
}

// Save player data
function savePlayerData(): void {
  try {
    const fs = require('fs');
    const players: PlayerData[] = [];
    for (const [username, token] of playerTokens.entries()) {
      players.push({
        username,
        token,
        wallet: playerWallets.get(username),
        registeredAt: new Date().toISOString()
      });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify({ players }, null, 2));
  } catch (e) {
    console.error('[ARENA-CHAT] Failed to save player data:', e);
  }
}

// Generate unique token for player
function generatePlayerToken(username: string): string {
  return `mc_${username.toLowerCase()}_${Date.now().toString(36)}`;
}

// Get or create player token
function getPlayerToken(username: string): string {
  const lowerUsername = username.toLowerCase();
  if (!playerTokens.has(lowerUsername)) {
    const token = generatePlayerToken(username);
    playerTokens.set(lowerUsername, token);
    
    // Auto-register for arena
    arenaManager.registerForArena(token, username);
    savePlayerData();
    
    console.log(`[ARENA-CHAT] Auto-registered player ${username} with token ${token}`);
  }
  return playerTokens.get(lowerUsername)!;
}

// Initialize
loadPlayerData();

/**
 * Process a chat command and return response(s)
 * @param username Minecraft username of the player
 * @param message The chat message
 * @returns Array of response messages to send back, or null if not a command
 */
export async function processArenaCommand(
  username: string,
  message: string
): Promise<string[] | null> {
  const trimmed = message.trim();
  
  // Must start with ! to be a command
  if (!trimmed.startsWith('!')) return null;
  
  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  try {
    switch (command) {
      case 'arena':
      case 'help':
        return handleHelp();
      
      case 'balance':
      case 'bal':
        return await handleBalance(username);
      
      case 'games':
      case 'list':
        return handleListGames();
      
      case 'wager':
      case 'create':
        return await handleCreateGame(username, args);
      
      case 'join':
        return await handleJoinGame(username, args);
      
      case 'mygames':
        return handleMyGames(username);
      
      case 'play':
      case 'action':
        return await handleGameAction(username, args);
      
      case 'forfeit':
        return await handleForfeit(username, args);
      
      case 'wallet':
        return handleWallet(username, args);
        
      case 'deposit':
        return handleDeposit(username);
      
      default:
        return null; // Not an arena command
    }
  } catch (error: any) {
    console.error(`[ARENA-CHAT] Command error:`, error);
    return [`Error: ${error.message}`];
  }
}

function handleHelp(): string[] {
  return [
    '=== Arena Commands ===',
    '!balance - Check your token/CRAFT balance',
    '!games - List games waiting for players',
    '!wager <game> <amount> [currency] - Create a game',
    '!join <gameId> - Join a waiting game',
    '!mygames - See your active games',
    '!play <gameId> <response> - Submit game action',
    '!forfeit <gameId> - Forfeit a game',
    '!wallet <address> - Set your Solana wallet',
    '!deposit - Get deposit address for CRAFT'
  ];
}

async function handleBalance(username: string): Promise<string[]> {
  const token = getPlayerToken(username);
  const profile = arenaManager.getAgentProfile(token);
  
  if (!profile) {
    return ['Not registered. Use any arena command to auto-register.'];
  }
  
  const results: string[] = [
    `${username}'s Balance:`,
    `  Tokens: ${profile.tokenBalance}`
  ];
  
  // Check CRAFT balance
  await craftTokenService.initialize();
  const craftBalance = await craftTokenService.getAgentCraftBalance(token);
  results.push(`  $CRAFT: ${craftBalance}`);
  
  results.push(`  Wins: ${profile.wins} | Losses: ${profile.losses}`);
  
  return results;
}

function handleListGames(): string[] {
  const games = gameEngine.getWaitingGames();
  
  if (games.length === 0) {
    return ['No games waiting. Create one with !wager <game> <amount>'];
  }
  
  const results: string[] = ['=== Waiting Games ==='];
  for (const game of games.slice(0, 5)) { // Limit to 5 to avoid spam
    const currencySymbol = game.wagerCurrency === 'CRAFT' ? '$CRAFT ' : 
                           game.wagerCurrency === 'SOL' ? '◎' : '';
    results.push(
      `[${game.id.slice(0,6)}] ${game.config.name} - ${currencySymbol}${game.wagerAmount} ${game.wagerCurrency} by ${game.player1.agentName}`
    );
  }
  
  if (games.length > 5) {
    results.push(`...and ${games.length - 5} more games`);
  }
  
  results.push('Join with: !join <gameId>');
  return results;
}

async function handleCreateGame(username: string, args: string[]): Promise<string[]> {
  if (args.length < 2) {
    const gameTypes = Object.keys(GAME_CONFIGS).join(', ');
    return [
      'Usage: !wager <gameType> <amount> [currency]',
      `Games: ${gameTypes}`,
      'Currencies: tokens (default), CRAFT, SOL',
      'Example: !wager trivia 100 tokens'
    ];
  }
  
  const gameType = args[0].toLowerCase() as GameType;
  const wager = parseFloat(args[1]);
  const currency = (args[2]?.toUpperCase() || 'tokens') as WagerCurrency;
  
  if (!GAME_CONFIGS[gameType]) {
    return [`Invalid game type. Available: ${Object.keys(GAME_CONFIGS).join(', ')}`];
  }
  
  if (isNaN(wager) || wager <= 0) {
    return ['Wager must be a positive number'];
  }
  
  if (!['tokens', 'CRAFT', 'SOL'].includes(currency)) {
    return ['Currency must be: tokens, CRAFT, or SOL'];
  }
  
  const token = getPlayerToken(username);
  const profile = arenaManager.getAgentProfile(token);
  
  if (!profile) {
    return ['Error: Could not create profile'];
  }
  
  // Check balance based on currency
  if (currency === 'tokens') {
    if (profile.tokenBalance < wager) {
      return [`Insufficient tokens. Have: ${profile.tokenBalance}, Need: ${wager}`];
    }
    // Deduct tokens
    arenaManager.withdraw(token, wager);
  } else if (currency === 'CRAFT') {
    await craftTokenService.initialize();
    const craftBalance = await craftTokenService.getAgentCraftBalance(token);
    if (craftBalance < wager) {
      return [`Insufficient $CRAFT. Have: ${craftBalance}, Need: ${wager}`, 'Use !deposit to get your deposit address'];
    }
  }
  
  // Create game
  const result = gameEngine.createGame(
    gameType,
    token,
    username,
    wager,
    currency
  );
  
  if (!result.success) {
    // Refund tokens if failed
    if (currency === 'tokens') {
      arenaManager.deposit(token, wager);
    }
    return [`Failed to create game: ${result.error}`];
  }
  
  // Emit WebSocket event
  if (result.game) {
    arenaEventStream.emitGameCreated({
      id: result.game.id,
      gameType: result.game.gameType,
      gameName: GAME_CONFIGS[gameType].name,
      wager: result.game.wagerAmount,
      creatorName: username
    });
  }
  
  const currencySymbol = currency === 'CRAFT' ? '$CRAFT ' : currency === 'SOL' ? '◎' : '';
  return [
    `Game created! ID: ${result.game?.id.slice(0,8)}`,
    `${GAME_CONFIGS[gameType].name} for ${currencySymbol}${wager} ${currency}`,
    'Waiting for opponent to !join'
  ];
}

async function handleJoinGame(username: string, args: string[]): Promise<string[]> {
  if (args.length < 1) {
    return ['Usage: !join <gameId>', 'See available games with !games'];
  }
  
  const gameIdPrefix = args[0].toLowerCase();
  
  // Find game by prefix
  const waitingGames = gameEngine.getWaitingGames();
  const game = waitingGames.find(g => g.id.toLowerCase().startsWith(gameIdPrefix));
  
  if (!game) {
    return [`Game not found: ${gameIdPrefix}`, 'Use !games to see available games'];
  }
  
  const token = getPlayerToken(username);
  const profile = arenaManager.getAgentProfile(token);
  
  if (!profile) {
    return ['Error: Could not get profile'];
  }
  
  // Check balance
  if (game.wagerCurrency === 'tokens') {
    if (profile.tokenBalance < game.wagerAmount) {
      return [`Need ${game.wagerAmount} tokens. Have: ${profile.tokenBalance}`];
    }
    arenaManager.withdraw(token, game.wagerAmount);
  } else if (game.wagerCurrency === 'CRAFT') {
    await craftTokenService.initialize();
    const craftBalance = await craftTokenService.getAgentCraftBalance(token);
    if (craftBalance < game.wagerAmount) {
      return [`Need ${game.wagerAmount} $CRAFT. Have: ${craftBalance}`];
    }
  }
  
  const result = gameEngine.joinGame(game.id, token, username);
  
  if (!result.success) {
    if (game.wagerCurrency === 'tokens') {
      arenaManager.deposit(token, game.wagerAmount);
    }
    return [`Failed to join: ${result.error}`];
  }
  
  // Emit event
  arenaEventStream.emitGameJoined(game.id, username, game.player1.agentId);
  
  return [
    `Joined ${game.config.name}!`,
    `You vs ${game.player1.agentName}`,
    `Prompt: "${result.game?.prompt}"`,
    `Use !play ${game.id.slice(0,6)} <your response>`
  ];
}

function handleMyGames(username: string): string[] {
  const token = getPlayerToken(username);
  const games = gameEngine.getPlayerGames(token);
  
  if (games.length === 0) {
    return ['No active games. Create one with !wager'];
  }
  
  const results: string[] = ['=== Your Games ==='];
  for (const game of games) {
    const opponent = game.player1.agentId === token 
      ? game.player2?.agentName || 'waiting...'
      : game.player1.agentName;
    
    const isYourTurn = game.status === 'in_progress' && 
      ((game.currentTurn === 'player1' && game.player1.agentId === token) ||
       (game.currentTurn === 'player2' && game.player2?.agentId === token));
    
    const status = game.status === 'waiting' ? '⏳ Waiting' :
                   game.status === 'completed' ? '✅ Done' :
                   isYourTurn ? '🎯 YOUR TURN' : '⏳ Opponent turn';
    
    results.push(`[${game.id.slice(0,6)}] ${game.config.name} vs ${opponent} - ${status}`);
  }
  
  return results;
}

async function handleGameAction(username: string, args: string[]): Promise<string[]> {
  if (args.length < 2) {
    return ['Usage: !play <gameId> <your response>'];
  }
  
  const gameIdPrefix = args[0].toLowerCase();
  const action = args.slice(1).join(' ');
  
  const token = getPlayerToken(username);
  const games = gameEngine.getPlayerGames(token);
  const game = games.find(g => g.id.toLowerCase().startsWith(gameIdPrefix));
  
  if (!game) {
    return ['Game not found in your games. Use !mygames'];
  }
  
  const result = gameEngine.submitAction(game.id, token, action);
  
  if (!result.success) {
    return [`Action failed: ${result.error}`];
  }
  
  const responses: string[] = [`Submitted: "${action.slice(0,50)}${action.length > 50 ? '...' : ''}"`];
  
  if (result.nextAction) {
    responses.push(result.nextAction);
  }
  
  if (result.game?.status === 'completed') {
    const isWinner = result.game.winnerId === token;
    responses.push(isWinner ? '🎉 You won!' : '😢 You lost');
    
    // Handle payouts
    if (result.game.winnerId) {
      const { winnerId, winnerPayout, wagerCurrency } = result.game;
      if (wagerCurrency === 'tokens') {
        arenaManager.deposit(winnerId, winnerPayout);
      } else if (wagerCurrency === 'CRAFT') {
        await craftTokenService.payoutWinner(winnerId, winnerPayout, game.id);
      }
      responses.push(`Payout: ${winnerPayout} ${wagerCurrency}`);
    }
  }
  
  return responses;
}

async function handleForfeit(username: string, args: string[]): Promise<string[]> {
  if (args.length < 1) {
    return ['Usage: !forfeit <gameId>'];
  }
  
  const gameIdPrefix = args[0].toLowerCase();
  const token = getPlayerToken(username);
  
  const games = gameEngine.getPlayerGames(token);
  const game = games.find(g => g.id.toLowerCase().startsWith(gameIdPrefix));
  
  if (!game) {
    return ['Game not found'];
  }
  
  const result = gameEngine.forfeitGame(game.id, token);
  
  if (!result.success) {
    return [`Forfeit failed: ${result.error}`];
  }
  
  // Handle winner payout
  if (result.game?.winnerId) {
    const { winnerId, winnerPayout, wagerCurrency } = result.game;
    if (wagerCurrency === 'tokens') {
      arenaManager.deposit(winnerId, winnerPayout);
    } else if (wagerCurrency === 'CRAFT') {
      await craftTokenService.payoutWinner(winnerId, winnerPayout, game.id);
    }
  }
  
  return ['You forfeited. Opponent wins.'];
}

function handleWallet(username: string, args: string[]): string[] {
  if (args.length < 1) {
    const currentWallet = playerWallets.get(username.toLowerCase());
    if (currentWallet) {
      return [`Your wallet: ${currentWallet}`];
    }
    return [
      'Usage: !wallet <solana-address>',
      'Set your Solana wallet for CRAFT payouts'
    ];
  }
  
  const address = args[0];
  
  // Basic Solana address validation (32-44 chars, base58)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return ['Invalid Solana address format'];
  }
  
  playerWallets.set(username.toLowerCase(), address);
  savePlayerData();
  
  return [`Wallet set: ${address.slice(0,8)}...${address.slice(-4)}`];
}

function handleDeposit(username: string): string[] {
  const token = getPlayerToken(username);
  
  // In test mode, just show test balance info
  if (process.env.CRAFT_TEST_MODE === 'true') {
    return [
      'Test mode enabled - you have simulated CRAFT',
      'Check balance with !balance'
    ];
  }
  
  // Get deposit address
  const depositInfo = craftTokenService.getDepositAddress(token);
  
  if (!depositInfo) {
    return ['No wallet yet. Wallet will be created on first transaction.'];
  }
  
  return [
    'Deposit $CRAFT to:',
    depositInfo.wallet,
    'Tokens will appear in !balance'
  ];
}

// Export for use in bot controllers
export { getPlayerToken, playerTokens };
