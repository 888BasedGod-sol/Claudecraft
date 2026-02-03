/**
 * Shared Types for Claudecraft
 * 
 * Centralized type definitions used across the codebase
 */

// Position types
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

// Bot state types
export interface BotState {
  position: Position3D;
  health: number;
  food: number;
  inventory: Record<string, number>;
  nearbyPlayers: string[];
  heldItem: string | null;
  experience: number;
  gameMode: string;
}

// Extended state for survival builder
export interface SurvivalBotState extends BotState {
  blocksPlaced: number;
  lastActions: string[];
  isStuck?: boolean;
  stuckReason?: string;
  consecutiveFailures?: number;
  positionHistory?: Position3D[];
}

// World observation types
export interface WorldObservation {
  position: Position3D;
  biome: string;
  timeOfDay: 'day' | 'night' | 'sunrise' | 'sunset';
  weather: 'clear' | 'rain' | 'thunder';
  nearbyBlocks: { name: string; count: number }[];
  nearbyEntities: { type: string; name?: string; distance: number }[];
  visibleStructures: string[];
  lightLevel: number;
}

// Agent personality types
export interface AgentPersonality {
  curiosity: number;      // 0-1: How much the agent explores vs stays in one place
  creativity: number;     // 0-1: How experimental vs traditional in building
  sociability: number;    // 0-1: How much the agent seeks out other players
  ambition: number;       // 0-1: How large/complex projects the agent undertakes
  patience: number;       // 0-1: How long the agent works on one thing
  riskTolerance: number;  // 0-1: How willing to venture into dangerous areas
}

// Goal types
export type GoalType = 'explore' | 'build' | 'gather' | 'social' | 'survive' | 'learn';

export interface AgentGoal {
  id: string;
  type: GoalType;
  description: string;
  priority: number;       // 1-10
  progress: number;       // 0-100
  createdAt: number;
  completedAt?: number;
  subGoals?: SubGoal[];   // Decomposed concrete steps
  isDecomposed?: boolean; // Whether goal has been broken into sub-goals
  parentGoalId?: string;  // For sub-goals, the parent goal ID
}

// Concrete sub-goal that can be directly executed
export interface SubGoal {
  id: string;
  description: string;
  action: string;         // The action to execute
  parameters: Record<string, any>;
  completed: boolean;
  order: number;          // Execution order
  requiredMaterials?: Record<string, number>; // Materials needed for this step
}

// Decision types
export interface AgentDecision {
  reasoning: string;
  action: string;
  parameters: Record<string, any>;
  announcement?: string;
  newGoal?: AgentGoal;
  memoryToStore?: {
    type: MemoryType;
    content: string;
    importance: number;
  };
  // Multi-step action planning - sequence of planned actions toward a goal
  actionPlan?: PlannedAction[];
}

// Planned action for multi-step sequences
export interface PlannedAction {
  action: string;
  parameters: Record<string, any>;
  description: string;  // What this step accomplishes
  dependsOn?: string;   // Previous action that must succeed first
}

// Memory types
export type MemoryType =
  | 'discovery'      // Found something interesting
  | 'location'       // A place worth remembering
  | 'build'          // Something the agent built
  | 'social'         // Interaction with players
  | 'danger'         // A dangerous situation/place
  | 'resource'       // Resource location
  | 'lesson'         // Something learned from experience
  | 'goal_completed' // A goal that was achieved
  | 'observation'    // General observation about the world
  | 'failure_pattern'; // Action that failed and why - avoid repeating

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;  // 1-10, affects retrieval priority
  location?: Position3D;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
  tags: string[];
  relatedMemories?: string[];
}

// Action result types
export interface ActionResult {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

// Block placement types
export interface BlockToPlace {
  x: number;
  y: number;
  z: number;
  blockType: string;
  section: string;
  priority: number;
  claimed?: string;
}

// Build progress types
export interface SectionProgress {
  total: number;
  placed: number;
}

export interface BuildProgress {
  totalBlocks: number;
  placedBlocks: number;
  percentComplete: number;
  sectionProgress: Record<string, SectionProgress>;
}

// Mood types
export type AgentMood = 'curious' | 'focused' | 'relaxed' | 'excited' | 'cautious';

// Direction types
export type CardinalDirection = 'north' | 'south' | 'east' | 'west';
export type ExtendedDirection = CardinalDirection | 'random';

// Log types
export type LogType = 
  | 'INFO' | 'ERROR' | 'WARN' | 'DEBUG' 
  | 'CLAUDE' | 'ACTION' | 'BUILDER' | 'BUILD' 
  | 'MILESTONE' | 'CHAT' | 'SURVIVAL'
  | 'SHARE' | 'HELP' | 'COLLABORATE' | 'PROJECT' | 'SOCIAL' | 'MEETING';

// Mineflayer-compatible types for better type safety
export interface InventoryItem {
  name: string;
  count: number;
  type: number;
  slot: number;
}

export interface MinecraftPlayer {
  username: string;
  entity?: MinecraftEntity;
}

export interface MinecraftEntity {
  position: Position3D;
  name?: string;
  type?: string;
  username?: string;
}

export interface MinecraftBlock {
  name: string;
  type: number;
  position: Position3D;
  light?: number;
}