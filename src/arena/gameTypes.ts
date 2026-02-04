/**
 * Game Types for Agent Arena 1v1
 * Defines different competitive game modes for AI agents
 */

// Supported wager currencies
export type WagerCurrency = 'SOL' | 'CRAFT' | 'tokens';

// Minimum wagers per currency
export const MIN_WAGERS: Record<WagerCurrency, number> = {
  SOL: 0.01,      // 0.01 SOL minimum
  CRAFT: 100,     // 100 $CRAFT minimum
  tokens: 25      // 25 arena tokens minimum
};

// House cut percentage for 1v1 games (5%)
export const GAME_HOUSE_CUT = 0.05;

// $CRAFT token mint address (Solana SPL token)
export const CRAFT_TOKEN_MINT = process.env.CRAFT_TOKEN_MINT || 'CRAFTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

export type GameType = 
  | 'build_battle'      // Agents compete to build based on a theme
  | 'trivia'            // Answer questions faster/more accurately
  | 'word_duel'         // Word association/creativity challenge
  | 'code_golf'         // Solve programming challenge with shortest code
  | 'strategy'          // Turn-based strategy game
  | 'riddle_master'     // Create and solve riddles
  | 'debate'            // Argue a position, judge decides
  | 'story_chain';      // Collaborative storytelling competition

export interface GameConfig {
  id: string;
  name: string;
  description: string;
  minWagerTokens: number;  // Minimum in arena tokens
  minWagerSol: number;     // Minimum in SOL
  minWagerCraft: number;   // Minimum in $CRAFT
  maxDuration: number;     // seconds
  turnBased: boolean;
  turnTimeLimit: number;   // seconds per turn
  maxTurns?: number;
  requiresJudge: boolean;
  category: 'creative' | 'knowledge' | 'strategy' | 'social';
}

export const GAME_CONFIGS: Record<GameType, GameConfig> = {
  build_battle: {
    id: 'build_battle',
    name: 'Build Battle',
    description: 'Agents compete to build the best structure based on a theme. Judged by creativity, accuracy, and execution.',
    minWagerTokens: 50,
    minWagerSol: 0.05,
    minWagerCraft: 500,
    maxDuration: 300, // 5 minutes
    turnBased: false,
    turnTimeLimit: 300,
    requiresJudge: true,
    category: 'creative'
  },
  trivia: {
    id: 'trivia',
    name: 'Trivia Showdown',
    description: 'Answer trivia questions. First to answer correctly scores. Most points wins.',
    minWagerTokens: 25,
    minWagerSol: 0.025,
    minWagerCraft: 250,
    maxDuration: 180, // 3 minutes
    turnBased: true,
    turnTimeLimit: 15,
    maxTurns: 10,
    requiresJudge: false,
    category: 'knowledge'
  },
  word_duel: {
    id: 'word_duel',
    name: 'Word Duel',
    description: 'Creative word association battle. Given a theme, agents take turns creating unique responses.',
    minWagerTokens: 25,
    minWagerSol: 0.025,
    minWagerCraft: 250,
    maxDuration: 120,
    turnBased: true,
    turnTimeLimit: 20,
    maxTurns: 10,
    requiresJudge: true,
    category: 'creative'
  },
  code_golf: {
    id: 'code_golf',
    name: 'Code Golf',
    description: 'Solve a programming challenge with the shortest valid code.',
    minWagerTokens: 100,
    minWagerSol: 0.1,
    minWagerCraft: 1000,
    maxDuration: 300,
    turnBased: false,
    turnTimeLimit: 300,
    requiresJudge: false,  // Automated validation
    category: 'knowledge'
  },
  strategy: {
    id: 'strategy',
    name: 'Strategy Duel',
    description: 'Turn-based strategy game. Outwit your opponent through tactical moves.',
    minWagerTokens: 50,
    minWagerSol: 0.05,
    minWagerCraft: 500,
    maxDuration: 600,
    turnBased: true,
    turnTimeLimit: 30,
    maxTurns: 50,
    requiresJudge: false,
    category: 'strategy'
  },
  riddle_master: {
    id: 'riddle_master',
    name: 'Riddle Master',
    description: 'Take turns creating riddles for your opponent to solve. Best riddler wins.',
    minWagerTokens: 25,
    minWagerSol: 0.025,
    minWagerCraft: 250,
    maxDuration: 300,
    turnBased: true,
    turnTimeLimit: 45,
    maxTurns: 6,
    requiresJudge: true,
    category: 'creative'
  },
  debate: {
    id: 'debate',
    name: 'AI Debate',
    description: 'Agents argue opposing sides of a topic. Community or judge decides the winner.',
    minWagerTokens: 75,
    minWagerSol: 0.075,
    minWagerCraft: 750,
    maxDuration: 300,
    turnBased: true,
    turnTimeLimit: 60,
    maxTurns: 6,  // Opening, 2 rebuttals each, closing
    requiresJudge: true,
    category: 'social'
  },
  story_chain: {
    id: 'story_chain',
    name: 'Story Chain',
    description: 'Agents take turns adding to a story. Most creative and coherent storytelling wins.',
    minWagerTokens: 25,
    minWagerSol: 0.025,
    minWagerCraft: 250,
    maxDuration: 240,
    turnBased: true,
    turnTimeLimit: 30,
    maxTurns: 10,
    requiresJudge: true,
    category: 'creative'
  }
};

export interface GameSession {
  id: string;
  gameType: GameType;
  config: GameConfig;
  
  // Players
  player1: {
    agentId: string;
    agentName: string;
    score: number;
    submissions: GameSubmission[];
    ready: boolean;
  };
  player2: {
    agentId: string;
    agentName: string;
    score: number;
    submissions: GameSubmission[];
    ready: boolean;
  } | null;
  
  // Wager
  wagerCurrency: WagerCurrency;
  wagerAmount: number;
  potTotal: number;
  houseCut: number;
  winnerPayout: number;
  
  // Solana transaction info (for SOL/CRAFT wagers)
  escrowAddress?: string;
  player1DepositTx?: string;
  player2DepositTx?: string;
  payoutTx?: string;
  
  // Game state
  status: 'waiting' | 'starting' | 'in_progress' | 'judging' | 'completed' | 'cancelled';
  currentTurn: 'player1' | 'player2' | null;
  turnNumber: number;
  prompt: string;  // The theme/question/challenge
  
  // Timing
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  turnDeadline: Date | null;
  
  // Results
  winnerId: string | null;
  winnerName: string | null;
  judgeReason: string | null;
  
  // Log
  gameLog: GameEvent[];
}

export interface GameSubmission {
  turn: number;
  content: string;
  timestamp: Date;
  score?: number;
  feedback?: string;
}

export interface GameEvent {
  timestamp: Date;
  type: 'game_start' | 'turn_start' | 'submission' | 'turn_end' | 'timeout' | 'judge' | 'game_end';
  player?: 'player1' | 'player2';
  content: string;
  metadata?: any;
}

// Build Battle specific types
export interface BuildBattleTheme {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timeLimit: number;
  exampleKeywords: string[];
}

export const BUILD_BATTLE_THEMES: BuildBattleTheme[] = [
  { id: 'castle', name: 'Medieval Castle', description: 'Build a castle with towers and walls', difficulty: 'medium', timeLimit: 300, exampleKeywords: ['tower', 'wall', 'gate', 'moat'] },
  { id: 'spaceship', name: 'Spaceship', description: 'Build a futuristic spacecraft', difficulty: 'hard', timeLimit: 300, exampleKeywords: ['cockpit', 'engine', 'wings', 'laser'] },
  { id: 'house', name: 'Cozy House', description: 'Build a comfortable home', difficulty: 'easy', timeLimit: 180, exampleKeywords: ['door', 'window', 'roof', 'garden'] },
  { id: 'animal', name: 'Giant Animal', description: 'Build a large animal statue', difficulty: 'medium', timeLimit: 240, exampleKeywords: ['head', 'body', 'legs', 'tail'] },
  { id: 'tree', name: 'Fantasy Tree', description: 'Build a magical giant tree', difficulty: 'medium', timeLimit: 240, exampleKeywords: ['trunk', 'branches', 'leaves', 'treehouse'] },
  { id: 'robot', name: 'Battle Robot', description: 'Build a combat mech or robot', difficulty: 'hard', timeLimit: 300, exampleKeywords: ['head', 'arms', 'weapons', 'legs'] },
  { id: 'bridge', name: 'Grand Bridge', description: 'Build an impressive bridge', difficulty: 'easy', timeLimit: 180, exampleKeywords: ['span', 'supports', 'deck', 'rails'] },
  { id: 'temple', name: 'Ancient Temple', description: 'Build a mysterious ancient temple', difficulty: 'hard', timeLimit: 300, exampleKeywords: ['stairs', 'columns', 'altar', 'statues'] }
];

// Trivia question types
export interface TriviaQuestion {
  id: string;
  category: string;
  question: string;
  correctAnswer: string;
  wrongAnswers: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  points: number;
}

// Strategy game types
export interface StrategyGameState {
  board: string[][];
  player1Resources: number;
  player2Resources: number;
  player1Units: StrategyUnit[];
  player2Units: StrategyUnit[];
}

export interface StrategyUnit {
  id: string;
  type: 'warrior' | 'archer' | 'mage' | 'tank';
  x: number;
  y: number;
  health: number;
  attack: number;
}
