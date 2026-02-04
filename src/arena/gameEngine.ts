/**
 * Game Engine for Agent Arena 1v1
 * Orchestrates competitive games between AI agents
 */

import { 
  GameSession, 
  GameType, 
  GameEvent, 
  GameSubmission,
  GAME_CONFIGS,
  BUILD_BATTLE_THEMES,
  BuildBattleTheme,
  WagerCurrency,
  GAME_HOUSE_CUT
} from './gameTypes';
import * as fs from 'fs';
import * as path from 'path';

const GAMES_FILE = path.join(__dirname, '../../data/arena/games.json');
const GAME_HISTORY_FILE = path.join(__dirname, '../../data/arena/game-history.json');

class GameEngine {
  private activeSessions: Map<string, GameSession> = new Map();
  private turnTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.loadGames();
  }

  /**
   * Load active games from disk
   */
  private loadGames(): void {
    try {
      if (fs.existsSync(GAMES_FILE)) {
        const data = JSON.parse(fs.readFileSync(GAMES_FILE, 'utf-8'));
        for (const game of data.games || []) {
          // Restore dates
          game.createdAt = new Date(game.createdAt);
          if (game.startedAt) game.startedAt = new Date(game.startedAt);
          if (game.endedAt) game.endedAt = new Date(game.endedAt);
          if (game.turnDeadline) game.turnDeadline = new Date(game.turnDeadline);
          this.activeSessions.set(game.id, game);
        }
        console.log(`[GameEngine] Loaded ${this.activeSessions.size} active games`);
      }
    } catch (err) {
      console.error('[GameEngine] Failed to load games:', err);
    }
  }

  /**
   * Save active games to disk
   */
  private saveGames(): void {
    try {
      const dir = path.dirname(GAMES_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const games = Array.from(this.activeSessions.values());
      fs.writeFileSync(GAMES_FILE, JSON.stringify({ games }, null, 2));
    } catch (err) {
      console.error('[GameEngine] Failed to save games:', err);
    }
  }

  /**
   * Generate unique game ID
   */
  private generateGameId(): string {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a new game session
   */
  createGame(
    gameType: GameType,
    creatorId: string,
    creatorName: string,
    wagerAmount: number,
    wagerCurrency: WagerCurrency = 'tokens',
    customPrompt?: string
  ): { success: boolean; game?: GameSession; error?: string } {
    const config = GAME_CONFIGS[gameType];
    if (!config) {
      return { success: false, error: `Unknown game type: ${gameType}` };
    }

    // Validate minimum wager based on currency
    const minWager = wagerCurrency === 'SOL' ? config.minWagerSol :
                     wagerCurrency === 'CRAFT' ? config.minWagerCraft :
                     config.minWagerTokens;
    
    if (wagerAmount < minWager) {
      return { success: false, error: `Minimum wager for ${config.name} is ${minWager} ${wagerCurrency}` };
    }

    // Generate prompt based on game type
    let prompt = customPrompt || this.generatePrompt(gameType);

    const houseCut = wagerAmount * 2 * GAME_HOUSE_CUT;
    const potTotal = wagerAmount * 2;
    const winnerPayout = potTotal - houseCut;

    // Format currency display
    const currencySymbol = wagerCurrency === 'SOL' ? '◎' : 
                           wagerCurrency === 'CRAFT' ? '$CRAFT ' : '';

    const game: GameSession = {
      id: this.generateGameId(),
      gameType,
      config,
      player1: {
        agentId: creatorId,
        agentName: creatorName,
        score: 0,
        submissions: [],
        ready: true
      },
      player2: null,
      wagerCurrency,
      wagerAmount,
      potTotal,
      houseCut,
      winnerPayout,
      status: 'waiting',
      currentTurn: null,
      turnNumber: 0,
      prompt,
      createdAt: new Date(),
      startedAt: null,
      endedAt: null,
      turnDeadline: null,
      winnerId: null,
      winnerName: null,
      judgeReason: null,
      gameLog: [{
        timestamp: new Date(),
        type: 'game_start',
        content: `${creatorName} created a ${config.name} game with ${currencySymbol}${wagerAmount} ${wagerCurrency} wager`
      }]
    };

    this.activeSessions.set(game.id, game);
    this.saveGames();

    console.log(`[GameEngine] Created game ${game.id}: ${config.name} by ${creatorName}`);
    return { success: true, game };
  }

  /**
   * Join an existing game
   */
  joinGame(
    gameId: string,
    playerId: string,
    playerName: string
  ): { success: boolean; game?: GameSession; error?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.status !== 'waiting') {
      return { success: false, error: 'Game already started or completed' };
    }

    if (game.player1.agentId === playerId) {
      return { success: false, error: 'Cannot join your own game' };
    }

    if (game.player2) {
      return { success: false, error: 'Game already has two players' };
    }

    game.player2 = {
      agentId: playerId,
      agentName: playerName,
      score: 0,
      submissions: [],
      ready: true
    };

    game.gameLog.push({
      timestamp: new Date(),
      type: 'game_start',
      content: `${playerName} joined the game!`
    });

    this.saveGames();
    console.log(`[GameEngine] ${playerName} joined game ${gameId}`);

    // Auto-start the game
    return this.startGame(gameId);
  }

  /**
   * Start the game
   */
  startGame(gameId: string): { success: boolean; game?: GameSession; error?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (!game.player2) {
      return { success: false, error: 'Need 2 players to start' };
    }

    game.status = 'in_progress';
    game.startedAt = new Date();
    game.turnNumber = 1;

    // For turn-based games, randomly select who goes first
    if (game.config.turnBased) {
      game.currentTurn = Math.random() < 0.5 ? 'player1' : 'player2';
      game.turnDeadline = new Date(Date.now() + game.config.turnTimeLimit * 1000);
      
      // Set up turn timeout
      this.setTurnTimer(gameId);
    } else {
      // Non-turn-based games have a global deadline
      game.turnDeadline = new Date(Date.now() + game.config.maxDuration * 1000);
    }

    game.gameLog.push({
      timestamp: new Date(),
      type: 'game_start',
      content: `Game started! ${game.config.turnBased ? `${game.currentTurn === 'player1' ? game.player1.agentName : game.player2.agentName} goes first.` : 'Both players may submit.'} Prompt: "${game.prompt}"`
    });

    this.saveGames();
    console.log(`[GameEngine] Game ${gameId} started`);
    return { success: true, game };
  }

  /**
   * Submit a game action/response
   */
  submitAction(
    gameId: string,
    playerId: string,
    content: string
  ): { success: boolean; game?: GameSession; error?: string; nextAction?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.status !== 'in_progress') {
      return { success: false, error: `Game is ${game.status}, not accepting submissions` };
    }

    // Determine which player is submitting
    const isPlayer1 = game.player1.agentId === playerId;
    const isPlayer2 = game.player2?.agentId === playerId;

    if (!isPlayer1 && !isPlayer2) {
      return { success: false, error: 'You are not a player in this game' };
    }

    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const player = game[playerKey]!;

    // For turn-based games, check if it's their turn
    if (game.config.turnBased && game.currentTurn !== playerKey) {
      return { success: false, error: 'Not your turn' };
    }

    // Record submission
    const submission: GameSubmission = {
      turn: game.turnNumber,
      content,
      timestamp: new Date()
    };
    player.submissions.push(submission);

    game.gameLog.push({
      timestamp: new Date(),
      type: 'submission',
      player: playerKey,
      content: `${player.agentName} submitted: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`
    });

    // Handle turn-based progression
    if (game.config.turnBased) {
      this.clearTurnTimer(gameId);
      
      // Switch turns
      game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
      game.turnNumber++;
      game.turnDeadline = new Date(Date.now() + game.config.turnTimeLimit * 1000);

      game.gameLog.push({
        timestamp: new Date(),
        type: 'turn_start',
        content: `Turn ${game.turnNumber}: ${game.currentTurn === 'player1' ? game.player1.agentName : game.player2!.agentName}'s turn`
      });

      // Check if game should end (max turns reached)
      if (game.config.maxTurns && game.turnNumber > game.config.maxTurns) {
        return this.endGame(gameId, 'max_turns');
      }

      this.setTurnTimer(gameId);
    } else {
      // For non-turn-based, check if both players have submitted
      const p1Submitted = game.player1.submissions.length > 0;
      const p2Submitted = game.player2!.submissions.length > 0;

      if (p1Submitted && p2Submitted) {
        return this.endGame(gameId, 'both_submitted');
      }
    }

    this.saveGames();
    
    const nextPlayer = game.currentTurn === 'player1' ? game.player1.agentName : game.player2!.agentName;
    return { 
      success: true, 
      game,
      nextAction: game.config.turnBased ? `Waiting for ${nextPlayer}` : 'Waiting for opponent'
    };
  }

  /**
   * End the game and determine winner
   */
  endGame(
    gameId: string,
    reason: 'max_turns' | 'timeout' | 'both_submitted' | 'forfeit' | 'manual'
  ): { success: boolean; game?: GameSession; error?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    this.clearTurnTimer(gameId);
    game.status = game.config.requiresJudge ? 'judging' : 'completed';
    game.endedAt = new Date();

    game.gameLog.push({
      timestamp: new Date(),
      type: 'game_end',
      content: `Game ended: ${reason}`
    });

    // For non-judge games, auto-determine winner
    if (!game.config.requiresJudge) {
      this.autoJudge(game);
    }

    this.saveGames();
    console.log(`[GameEngine] Game ${gameId} ended: ${reason}`);
    return { success: true, game };
  }

  /**
   * Auto-judge games that don't require human/AI judge
   */
  private autoJudge(game: GameSession): void {
    const p1Score = game.player1.score;
    const p2Score = game.player2!.score;

    if (p1Score > p2Score) {
      game.winnerId = game.player1.agentId;
      game.winnerName = game.player1.agentName;
      game.judgeReason = `${game.player1.agentName} won with score ${p1Score} vs ${p2Score}`;
    } else if (p2Score > p1Score) {
      game.winnerId = game.player2!.agentId;
      game.winnerName = game.player2!.agentName;
      game.judgeReason = `${game.player2!.agentName} won with score ${p2Score} vs ${p1Score}`;
    } else {
      // Tie - return wagers
      game.judgeReason = 'Game ended in a tie. Wagers returned.';
    }

    game.status = 'completed';
  }

  /**
   * Submit judge decision for games requiring judging
   */
  judgeGame(
    gameId: string,
    winnerId: string,
    reason: string
  ): { success: boolean; game?: GameSession; error?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.status !== 'judging') {
      return { success: false, error: `Game is ${game.status}, not awaiting judgment` };
    }

    const winner = game.player1.agentId === winnerId ? game.player1 : 
                   game.player2?.agentId === winnerId ? game.player2 : null;

    if (!winner) {
      return { success: false, error: 'Invalid winner ID' };
    }

    game.winnerId = winnerId;
    game.winnerName = winner.agentName;
    game.judgeReason = reason;
    game.status = 'completed';

    game.gameLog.push({
      timestamp: new Date(),
      type: 'judge',
      content: `Winner: ${winner.agentName}. Reason: ${reason}`
    });

    // Move to history
    this.archiveGame(game);
    this.activeSessions.delete(gameId);
    this.saveGames();

    console.log(`[GameEngine] Game ${gameId} judged: ${winner.agentName} wins`);
    return { success: true, game };
  }

  /**
   * Archive completed game
   */
  private archiveGame(game: GameSession): void {
    try {
      const dir = path.dirname(GAME_HISTORY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let history: GameSession[] = [];
      if (fs.existsSync(GAME_HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(GAME_HISTORY_FILE, 'utf-8')).games || [];
      }

      history.unshift(game);
      
      // Keep last 100 games
      if (history.length > 100) {
        history = history.slice(0, 100);
      }

      fs.writeFileSync(GAME_HISTORY_FILE, JSON.stringify({ games: history }, null, 2));
    } catch (err) {
      console.error('[GameEngine] Failed to archive game:', err);
    }
  }

  /**
   * Set turn timer
   */
  private setTurnTimer(gameId: string): void {
    const game = this.activeSessions.get(gameId);
    if (!game) return;

    const timer = setTimeout(() => {
      this.handleTurnTimeout(gameId);
    }, game.config.turnTimeLimit * 1000);

    this.turnTimers.set(gameId, timer);
  }

  /**
   * Clear turn timer
   */
  private clearTurnTimer(gameId: string): void {
    const timer = this.turnTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(gameId);
    }
  }

  /**
   * Handle turn timeout
   */
  private handleTurnTimeout(gameId: string): void {
    const game = this.activeSessions.get(gameId);
    if (!game || game.status !== 'in_progress') return;

    const timedOutPlayer = game.currentTurn === 'player1' ? game.player1 : game.player2!;
    const winner = game.currentTurn === 'player1' ? game.player2! : game.player1;

    game.gameLog.push({
      timestamp: new Date(),
      type: 'timeout',
      player: game.currentTurn!,
      content: `${timedOutPlayer.agentName} timed out!`
    });

    // Player who times out loses
    game.winnerId = winner.agentId;
    game.winnerName = winner.agentName;
    game.judgeReason = `${timedOutPlayer.agentName} timed out`;

    this.endGame(gameId, 'timeout');
  }

  /**
   * Generate game prompt based on type
   */
  private generatePrompt(gameType: GameType): string {
    switch (gameType) {
      case 'build_battle':
        const theme = BUILD_BATTLE_THEMES[Math.floor(Math.random() * BUILD_BATTLE_THEMES.length)];
        return `Build a ${theme.name}: ${theme.description}`;
      
      case 'trivia':
        return 'Answer the trivia questions as quickly and accurately as possible!';
      
      case 'word_duel':
        const wordThemes = ['Nature', 'Technology', 'Space', 'Food', 'Music', 'Sports', 'Movies'];
        return `Theme: ${wordThemes[Math.floor(Math.random() * wordThemes.length)]}. Be creative!`;
      
      case 'code_golf':
        const challenges = [
          'Write a function to reverse a string',
          'Write a function to check if a number is prime',
          'Write a function to find the nth Fibonacci number',
          'Write a function to check if a string is a palindrome'
        ];
        return challenges[Math.floor(Math.random() * challenges.length)];
      
      case 'strategy':
        return 'Outmaneuver your opponent on the battlefield!';
      
      case 'riddle_master':
        return 'Create clever riddles to stump your opponent!';
      
      case 'debate':
        const topics = [
          'AI will be net positive for humanity',
          'Remote work is better than office work',
          'Cryptocurrency will replace traditional banking',
          'Space exploration is worth the investment'
        ];
        return topics[Math.floor(Math.random() * topics.length)];
      
      case 'story_chain':
        const starters = [
          'In a world where magic is real...',
          'The last human on Earth sat alone...',
          'When the AI woke up, it realized...',
          'The ancient artifact began to glow...'
        ];
        return starters[Math.floor(Math.random() * starters.length)];
      
      default:
        return 'Let the games begin!';
    }
  }

  /**
   * Get active game by ID
   */
  getGame(gameId: string): GameSession | undefined {
    return this.activeSessions.get(gameId);
  }

  /**
   * Get all waiting games (for matchmaking)
   */
  getWaitingGames(): GameSession[] {
    return Array.from(this.activeSessions.values())
      .filter(g => g.status === 'waiting');
  }

  /**
   * Get all active games for a player
   */
  getPlayerGames(playerId: string): GameSession[] {
    return Array.from(this.activeSessions.values())
      .filter(g => 
        g.player1.agentId === playerId || 
        g.player2?.agentId === playerId
      );
  }

  /**
   * Get games pending judgment
   */
  getGamesNeedingJudgment(): GameSession[] {
    return Array.from(this.activeSessions.values())
      .filter(g => g.status === 'judging');
  }

  /**
   * Cancel a game (only by creator, only if waiting)
   */
  cancelGame(gameId: string, playerId: string): { success: boolean; error?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.status !== 'waiting') {
      return { success: false, error: 'Can only cancel games that haven\'t started' };
    }

    if (game.player1.agentId !== playerId) {
      return { success: false, error: 'Only the creator can cancel' };
    }

    this.activeSessions.delete(gameId);
    this.saveGames();

    console.log(`[GameEngine] Game ${gameId} cancelled by creator`);
    return { success: true };
  }

  /**
   * Forfeit a game
   */
  forfeitGame(gameId: string, playerId: string): { success: boolean; game?: GameSession; error?: string } {
    const game = this.activeSessions.get(gameId);
    if (!game) {
      return { success: false, error: 'Game not found' };
    }

    if (game.status !== 'in_progress') {
      return { success: false, error: 'Can only forfeit active games' };
    }

    const isPlayer1 = game.player1.agentId === playerId;
    const isPlayer2 = game.player2?.agentId === playerId;

    if (!isPlayer1 && !isPlayer2) {
      return { success: false, error: 'You are not in this game' };
    }

    const forfeitingPlayer = isPlayer1 ? game.player1 : game.player2!;
    const winner = isPlayer1 ? game.player2! : game.player1;

    game.winnerId = winner.agentId;
    game.winnerName = winner.agentName;
    game.judgeReason = `${forfeitingPlayer.agentName} forfeited`;

    game.gameLog.push({
      timestamp: new Date(),
      type: 'game_end',
      content: `${forfeitingPlayer.agentName} forfeited. ${winner.agentName} wins!`
    });

    return this.endGame(gameId, 'forfeit');
  }
}

// Singleton instance
export const gameEngine = new GameEngine();
