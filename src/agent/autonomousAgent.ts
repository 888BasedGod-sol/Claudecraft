/**
 * Autonomous Agent - AI agent with free will to explore, build creatively, and learn
 * 
 * Unlike the SurvivalBuilderAgent which follows a specific castle plan,
 * this agent is free to:
 * - Explore the world and discover interesting locations
 * - Decide what to build based on surroundings and inspiration
 * - Learn from experiences and remember discoveries
 * - Set its own goals and priorities
 * - Collaborate or work independently
 */

import { AgentMemory, Memory, MemoryType, SharedMemoryPool } from './memory';
import { AgentStateRegistry, getAgentRegistry } from './agentRegistry';
import { getExpertKnowledgePrompt, getNextSteps, getSurvivalPriorities, getMiningAdvice, getCurrentProgressionStage, getCombatAdvice, getFarmingAdvice } from './expertKnowledge';
import { WorldMemory, getWorldMemory } from './worldMemory';
import { callClaudeJson } from './apiClient';
import { CONFIG } from '../config';
import * as fs from 'fs';
import * as path from 'path';

// Load structure blueprints for training
let STRUCTURE_BLUEPRINTS: any = {};
try {
  const blueprintsPath = path.join(__dirname, '../training/schematics/structures.json');
  if (fs.existsSync(blueprintsPath)) {
    STRUCTURE_BLUEPRINTS = JSON.parse(fs.readFileSync(blueprintsPath, 'utf-8'));
    console.log(`[Training] Loaded ${Object.keys(STRUCTURE_BLUEPRINTS.structures || {}).length} structure blueprints`);
  }
} catch (e) {
  console.log('[Training] No structure blueprints found');
}

// Load build catalog for learned patterns
let BUILD_CATALOG: any = {};
try {
  const catalogPath = path.join(__dirname, '../training/knowledge/build-catalog.json');
  if (fs.existsSync(catalogPath)) {
    BUILD_CATALOG = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
    console.log(`[Training] Loaded ${BUILD_CATALOG.successfulBuilds?.length || 0} successful build patterns`);
  }
} catch (e) {
  console.log('[Training] No build catalog found');
}

// Load gameplay strategies for smarter decisions
let GAMEPLAY_STRATEGIES: any = {};
try {
  const strategiesPath = path.join(__dirname, '../training/knowledge/gameplay-strategies.json');
  if (fs.existsSync(strategiesPath)) {
    GAMEPLAY_STRATEGIES = JSON.parse(fs.readFileSync(strategiesPath, 'utf-8'));
    console.log(`[Training] Loaded gameplay strategies with ${GAMEPLAY_STRATEGIES.efficiencyTips?.length || 0} tips`);
  }
} catch (e) {
  console.log('[Training] No gameplay strategies found');
}

// Load Reddit-sourced advanced building knowledge
let REDDIT_BUILD_KNOWLEDGE: any = {};
try {
  const redditPath = path.join(__dirname, '../training/knowledge/reddit-builds.json');
  if (fs.existsSync(redditPath)) {
    REDDIT_BUILD_KNOWLEDGE = JSON.parse(fs.readFileSync(redditPath, 'utf-8'));
    const categories = Object.keys(REDDIT_BUILD_KNOWLEDGE.buildCategories || {}).length;
    const blueprints = REDDIT_BUILD_KNOWLEDGE.complexStructureBlueprints?.length || 0;
    const techniques = Object.keys(REDDIT_BUILD_KNOWLEDGE.advancedBuildingTechniques || {}).length;
    console.log(`[Training] Loaded Reddit build knowledge: ${categories} categories, ${blueprints} blueprints, ${techniques} advanced techniques`);
  }
} catch (e) {
  console.log('[Training] No Reddit build knowledge found');
}

export interface WorldObservation {
  position: { x: number; y: number; z: number };
  biome: string;
  timeOfDay: 'day' | 'night' | 'sunrise' | 'sunset';
  weather: 'clear' | 'rain' | 'thunder';
  nearbyBlocks: { name: string; count: number }[];
  nearbyEntities: { type: string; name?: string; distance: number }[];
  visibleStructures: string[];
  lightLevel: number;
}

export interface BotState {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  inventory: Record<string, number>;
  nearbyPlayers: string[];
  heldItem: string | null;
  experience: number;
  gameMode: string;
  // Agent collaboration context
  otherAgents?: { name: string; activity: string; goal: string | null; distance: number }[];
  agentContext?: string; // Formatted summary for prompts
}

export interface AgentPersonality {
  curiosity: number;      // 0-1: How much the agent explores vs stays in one place
  creativity: number;     // 0-1: How experimental vs traditional in building
  sociability: number;    // 0-1: How much the agent seeks out other players
  ambition: number;       // 0-1: How large/complex projects the agent undertakes
  patience: number;       // 0-1: How long the agent works on one thing
  riskTolerance: number;  // 0-1: How willing to venture into dangerous areas
}

export interface AgentGoal {
  id: string;
  type: 'explore' | 'build' | 'gather' | 'social' | 'survive' | 'learn';
  description: string;
  priority: number;       // 1-10
  progress: number;       // 0-100
  createdAt: number;
  completedAt?: number;
  subGoals?: SubGoal[];   // Decomposed concrete steps (Option 2)
  isDecomposed?: boolean; // Whether goal has been broken into sub-goals
  parentGoalId?: string;  // For sub-goals, the parent goal ID
}

// Planned action for multi-step sequences
export interface PlannedAction {
  action: string;
  parameters: any;
  description: string;  // What this step accomplishes
  dependsOn?: string;   // Previous action that must succeed first
}

// Concrete sub-goal that can be directly executed  
export interface SubGoal {
  id: string;
  description: string;
  action: string;
  parameters: any;
  completed: boolean;
  order: number;
  requiredMaterials?: Record<string, number>;
}

export interface AgentDecision {
  reasoning: string;
  action: string;
  parameters: any;
  announcement?: string;
  newGoal?: AgentGoal;
  memoryToStore?: {
    type: MemoryType;
    content: string;
    importance: number;
  };
  // Multi-step action planning - sequence of planned actions toward a goal
  actionPlan?: PlannedAction[];
  // Goal decomposition - break down high-level goal into concrete steps
  goalDecomposition?: SubGoal[];
}

// Failure pattern for learning from mistakes
interface FailurePattern {
  action: string;
  context: string;  // What was the situation when it failed
  reason: string;   // Why it failed
  alternative: string; // What to do instead
  timestamp: number;
}

export class AutonomousAgent {
  private name: string;
  private personality: AgentPersonality;
  private memory: AgentMemory;
  private currentGoals: AgentGoal[] = [];
  private lastActions: string[] = [];
  private exploredLocations: Set<string> = new Set();
  private mood: 'curious' | 'focused' | 'relaxed' | 'excited' | 'cautious' = 'curious';
  private creativeIdeas: string[] = [];
  private sessionStartTime: number;
  private decisionsThisSession: number = 0;
  private goalsCompletedThisSession: number = 0;
  private creativeMode: boolean = false;
  private sculptorMode: boolean = false; // Specializes in fine details on existing builds
  
  // Option 3: Track failure patterns for learning
  private failurePatterns: FailurePattern[] = [];
  
  // Option 1: Action plan queue for multi-step execution
  private actionPlanQueue: PlannedAction[] = [];
  private currentPlanGoal: string | null = null;

  // Build progression tracking
  private buildHistory: { shape: string; material: string; size: number; success: boolean; timestamp: number }[] = [];
  private buildLevel: number = 1; // 1=beginner, 2=intermediate, 3=advanced, 4=master

  // Get structure blueprints for the prompt
  private getStructureBlueprintsPrompt(): string {
    if (!STRUCTURE_BLUEPRINTS.structures) return '';
    
    const structures = STRUCTURE_BLUEPRINTS.structures;
    const structureList = Object.entries(structures).slice(0, 5); // Show 5 examples
    
    let prompt = `
📐 STRUCTURE BLUEPRINTS (Follow these step-by-step!):

`;
    for (const [key, struct] of structureList) {
      const s = struct as any;
      prompt += `🏗️ ${s.name} (${s.difficulty}):
   Materials: ${s.materials.primary}, ${s.materials.accent}
   Steps:
`;
      for (const step of s.steps.slice(0, 3)) {
        prompt += `   ${step.step}. ${step.description}
      → ${step.action}: ${JSON.stringify(step.params)}
`;
      }
      prompt += `
`;
    }
    
    prompt += `
🤝 COLLABORATION TIPS:
- When another agent is nearby, PROPOSE a collaborative project!
- Split tasks: One agent builds foundation, another builds walls
- Use "proposeProject" to start collaboration
- Use "meetAgent" to coordinate with nearby agents
- Build TOGETHER - collaborative builds are more impressive!

`;
    
    // Add gameplay strategies if available
    if (GAMEPLAY_STRATEGIES.efficiencyTips) {
      const tips = GAMEPLAY_STRATEGIES.efficiencyTips.slice(0, 5);
      prompt += `
💡 EFFICIENCY TIPS:
${tips.map((t: string) => `• ${t}`).join('\n')}

`;
    }
    
    // Add build patterns from catalog
    if (BUILD_CATALOG.buildingPatterns) {
      prompt += `
🧱 BUILDING PATTERNS:
• Walls: ${BUILD_CATALOG.buildingPatterns.walls?.pillared || 'Use corner pillars with fill'}
• Roofs: ${BUILD_CATALOG.buildingPatterns.roofs?.sloped || 'Stairs stepping inward'}
• Foundations: ${BUILD_CATALOG.buildingPatterns.foundations?.raised || 'Build platform first'}

`;
    }
    
    // Inject Reddit-sourced advanced building knowledge
    prompt += this.getRedditBuildKnowledge();
    
    return prompt;
  }

  // Generate advanced building knowledge prompt from Reddit training data
  private getRedditBuildKnowledge(): string {
    if (!REDDIT_BUILD_KNOWLEDGE.buildCategories) return '';
    
    let prompt = `
🔥 ADVANCED BUILDING KNOWLEDGE (from top Reddit r/Minecraftbuilds):

`;
    // Rotate category focus based on build level for progressive complexity
    const categories = REDDIT_BUILD_KNOWLEDGE.buildCategories;
    const allCategoryKeys = Object.keys(categories);
    
    // Pick 2-3 relevant categories based on build level
    let focusCategories: string[];
    if (this.buildLevel <= 1) {
      focusCategories = ['houses_and_bases', 'interior_and_detail'];
    } else if (this.buildLevel === 2) {
      focusCategories = ['houses_and_bases', 'nature_and_landscapes', 'towns_and_cities'];
    } else if (this.buildLevel === 3) {
      focusCategories = ['towns_and_cities', 'magical_and_fantasy', 'megabuilds'];
    } else {
      // Master level - rotate through all categories
      const idx = Math.floor(Date.now() / (30 * 60 * 1000)) % allCategoryKeys.length;
      focusCategories = [allCategoryKeys[idx], allCategoryKeys[(idx + 1) % allCategoryKeys.length], allCategoryKeys[(idx + 2) % allCategoryKeys.length]];
    }
    
    for (const catKey of focusCategories) {
      const cat = categories[catKey];
      if (!cat) continue;
      prompt += `📋 ${cat.description}:\n`;
      // Show 3-4 techniques from this category
      const techniques = cat.techniques?.slice(0, 4) || [];
      for (const t of techniques) {
        prompt += `  • ${t}\n`;
      }
      // Show a block palette suggestion
      if (cat.blockPalettes?.length > 0) {
        const palette = cat.blockPalettes[Math.floor(Math.random() * cat.blockPalettes.length)];
        prompt += `  🎨 Palette: ${palette.slice(0, 5).join(', ')}\n`;
      }
      prompt += '\n';
    }
    
    // Add advanced techniques section
    const advTech = REDDIT_BUILD_KNOWLEDGE.advancedBuildingTechniques;
    if (advTech) {
      const techKeys = Object.keys(advTech);
      // Pick 2 random techniques to highlight
      const pick1 = techKeys[Math.floor(Math.random() * techKeys.length)];
      const pick2 = techKeys[Math.floor(Math.random() * techKeys.length)];
      for (const key of [pick1, pick2]) {
        const tech = advTech[key];
        if (!tech) continue;
        prompt += `🔧 ${tech.name}: ${tech.description}\n`;
        const steps = tech.steps || tech.rules || [];
        for (const s of steps.slice(0, 3)) {
          prompt += `  → ${s}\n`;
        }
        prompt += '\n';
      }
    }
    
    // Add a complex structure blueprint to aspire to
    const blueprints = REDDIT_BUILD_KNOWLEDGE.complexStructureBlueprints;
    if (blueprints?.length > 0) {
      // Pick one based on build level
      const levelFiltered = blueprints.filter((bp: any) => {
        if (this.buildLevel <= 1) return bp.difficulty === 'intermediate';
        if (this.buildLevel === 2) return bp.difficulty === 'intermediate' || bp.difficulty === 'advanced';
        return true;
      });
      const pool = levelFiltered.length > 0 ? levelFiltered : blueprints;
      const bp = pool[Math.floor(Math.random() * pool.length)];
      
      prompt += `🏆 BUILD CHALLENGE - "${bp.name}" (${bp.difficulty}, ~${bp.estimatedBlocks} blocks):\n`;
      prompt += `  Dimensions: ${bp.dimensions.width}x${bp.dimensions.length}x${bp.dimensions.height}\n`;
      prompt += `  Components:\n`;
      for (const comp of bp.components.slice(0, 4)) {
        prompt += `    - ${comp}\n`;
      }
      prompt += `  Palette: ${bp.palette.slice(0, 5).join(', ')}\n`;
      prompt += `  Build order:\n`;
      for (const step of bp.buildOrder.slice(0, 4)) {
        prompt += `    ${bp.buildOrder.indexOf(step) + 1}. ${step}\n`;
      }
      prompt += '\n';
    }
    
    // Add inspiration prompt
    const inspirations = REDDIT_BUILD_KNOWLEDGE.redditInspirationPrompts;
    if (inspirations?.length > 0) {
      const pick = inspirations[Math.floor(Math.random() * inspirations.length)];
      prompt += `💡 BUILD INSPIRATION: ${pick}\n\n`;
    }
    
    return prompt;
  }

  // Get combat-specific prompt based on nearby hostiles
  private getCombatPrompt(nearbyEntities: { type: string; distance: number }[]): string {
    const hostileTypes = ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'pillager'];
    const hostiles = nearbyEntities.filter(e => hostileTypes.includes(e.type.toLowerCase()));
    
    if (hostiles.length === 0) return '';
    
    let prompt = `
⚔️ COMBAT ADVICE (${hostiles.length} hostiles nearby):
`;
    const uniqueTypes = [...new Set(hostiles.map(h => h.type.toLowerCase()))];
    for (const type of uniqueTypes.slice(0, 3)) {
      prompt += `• ${getCombatAdvice(type)}\n`;
    }
    
    return prompt;
  }

  // Detect if agent is stuck in a repetitive loop
  private detectRepetition(): boolean {
    if (this.lastActions.length < 3) return false;
    const recent = this.lastActions.slice(-5);
    // Check if same action type appears 3+ times
    const actionTypes = recent.map(a => a.split(' ')[0]); // Get first word (action type)
    const counts: Record<string, number> = {};
    for (const type of actionTypes) {
      counts[type] = (counts[type] || 0) + 1;
      if (counts[type] >= 3) return true;
    }
    // Also check for mining specifically
    const miningActions = recent.filter(a => 
      a.toLowerCase().includes('mine') || 
      a.toLowerCase().includes('dig') || 
      a.toLowerCase().includes('branch') ||
      a.toLowerCase().includes('explore')
    );
    return miningActions.length >= 3;
  }

  constructor(name: string, personality?: Partial<AgentPersonality>, creativeMode: boolean = false, sculptorMode: boolean = false) {
    this.name = name;
    this.sessionStartTime = Date.now();
    this.creativeMode = creativeMode;
    this.sculptorMode = sculptorMode;
    
    // Default personality with some randomization for uniqueness
    this.personality = {
      curiosity: personality?.curiosity ?? 0.5 + Math.random() * 0.3,
      creativity: personality?.creativity ?? 0.5 + Math.random() * 0.3,
      sociability: personality?.sociability ?? 0.3 + Math.random() * 0.4,
      ambition: personality?.ambition ?? 0.4 + Math.random() * 0.4,
      patience: personality?.patience ?? 0.4 + Math.random() * 0.3,
      riskTolerance: personality?.riskTolerance ?? 0.3 + Math.random() * 0.4,
    };
    
    this.memory = new AgentMemory(name);
    
    console.log(`[${this.name}] Autonomous agent initialized with personality:`, this.personality);
    if (this.creativeMode) {
      console.log(`[${this.name}] 🎨 CREATIVE MODE ENABLED - Can build anything instantly!`);
    }
    if (this.sculptorMode) {
      console.log(`[${this.name}] 🗿 SCULPTOR MODE ENABLED - Specializing in fine details!`);
    }
  }

  async makeDecision(state: BotState, observation: WorldObservation, lastActionResult?: { action: string; success: boolean; message: string }, consecutiveFailures?: number): Promise<AgentDecision> {
    this.decisionsThisSession++;
    
    // === OPTION 3: Learn from failures ===
    if (lastActionResult && !lastActionResult.success) {
      await this.learnFromFailure(lastActionResult, state, observation);
    }
    
    // === OPTION 1: Check if we have a planned action to execute ===
    if (this.actionPlanQueue.length > 0) {
      const nextPlannedAction = this.actionPlanQueue.shift()!;
      console.log(`[${this.name}] 📋 Executing planned step ${this.actionPlanQueue.length + 1} remaining: ${nextPlannedAction.description}`);
      
      // If last action failed, abort the plan and make a fresh decision
      if (lastActionResult && !lastActionResult.success) {
        console.log(`[${this.name}] ⚠️ Plan aborted due to failure: ${lastActionResult.message}`);
        this.actionPlanQueue = [];
        this.currentPlanGoal = null;
        // Fall through to make a new decision
      } else {
        this.lastActions.push(nextPlannedAction.action);
        if (this.lastActions.length > 15) this.lastActions.shift();
        
        return {
          reasoning: `Executing planned step: ${nextPlannedAction.description}`,
          action: nextPlannedAction.action,
          parameters: nextPlannedAction.parameters,
          announcement: this.actionPlanQueue.length === 0 ? `Completing my plan!` : undefined
        };
      }
    }
    
    // Get relevant memories for context
    // Include current goals + biome + blocks for better memory retrieval
    const goalContext = this.currentGoals.slice(0, 3).map(g => g.description).join(' ');
    const relevantMemories = await this.memory.getRelevantMemories(
      `${observation.biome} ${goalContext} ${observation.nearbyBlocks.slice(0, 5).map(b => b.name).join(' ')}`
    );
    
    // === OPTION 3: Get failure pattern memories to avoid repeating mistakes ===
    const failureMemories = await this.memory.getByType('failure_pattern' as MemoryType, 5);
    
    // Get shared memories from other agents
    const sharedPool = SharedMemoryPool.getInstance();
    const sharedMemories = sharedPool.getRelevant(
      `${observation.biome} ${this.currentGoals.map(g => g.description).join(' ')}`,
      3
    );
    
    // Get world memory context (civilization knowledge)
    const worldMemory = getWorldMemory();
    const worldContext = worldMemory.getWorldContextForAgent(
      this.name, 
      state.position.x, 
      state.position.y, 
      state.position.z
    );
    const deathWarnings = worldMemory.getDeathWarningsNear(
      state.position.x,
      state.position.y,
      state.position.z,
      50
    );
    
    // Get agent awareness context from registry
    const registry = getAgentRegistry();
    const agentAwareness = registry.getAgentAwarenessSummary(this.name);
    const pendingInteractions = registry.getPendingInteractionsSummary(this.name);
    
    // Update mood based on state and observations
    this.updateMood(state, observation);
    
    // Check and update goals
    this.evaluateGoals(state, observation);
    
    // === OPTION 2: Check if current goal needs decomposition ===
    const activeGoal = this.currentGoals.find(g => g.priority >= 8 && !g.isDecomposed);
    const needsDecomposition = activeGoal && activeGoal.type === 'build' && !this.creativeMode;
    
    const systemPrompt = this.buildSystemPrompt(state, observation, relevantMemories, sharedMemories, agentAwareness, pendingInteractions, lastActionResult, consecutiveFailures, failureMemories, needsDecomposition, activeGoal, worldContext, deathWarnings);
    const userMessage = this.buildUserMessage(state, observation, lastActionResult, consecutiveFailures);

    try {
      // Use rate-limited API client
      const decision = await callClaudeJson<AgentDecision>(
        systemPrompt,
        userMessage,
        {
          maxTokens: CONFIG.api.maxTokens,
          timeoutMs: CONFIG.api.timeoutMs,
          agentName: this.name
        }
      );
      
      // === OPTION 1: If decision includes an action plan, queue it ===
      if (decision.actionPlan && decision.actionPlan.length > 0) {
        this.actionPlanQueue = decision.actionPlan.slice(1); // Queue all but first action
        this.currentPlanGoal = decision.reasoning;
        console.log(`[${this.name}] 📋 Created action plan with ${decision.actionPlan.length} steps: ${decision.actionPlan.map(a => a.description).join(' → ')}`);
      }
      
      // === OPTION 2: If decision includes goal decomposition, update the goal ===
      if (decision.goalDecomposition && decision.goalDecomposition.length > 0 && activeGoal) {
        activeGoal.subGoals = decision.goalDecomposition;
        activeGoal.isDecomposed = true;
        console.log(`[${this.name}] 🎯 Decomposed goal "${activeGoal.description}" into ${decision.goalDecomposition.length} sub-goals`);
      }
      
      // Track the action
      this.lastActions.push(decision.action);
      if (this.lastActions.length > 15) {
        this.lastActions.shift();
      }

      // Store any new memories
      if (decision.memoryToStore) {
        const newMemory = {
          type: decision.memoryToStore.type,
          content: decision.memoryToStore.content,
          importance: decision.memoryToStore.importance,
          location: state.position,
          timestamp: Date.now(),
          tags: this.extractTags(decision.memoryToStore.content)
        };
        
        const storedMemoryId = await this.memory.store(newMemory);
        
        // Share important discoveries with other agents
        if (decision.memoryToStore.importance >= 6 && 
            ['discovery', 'resource', 'danger', 'location'].includes(decision.memoryToStore.type)) {
          const fullMemory = await this.memory.getById(storedMemoryId);
          if (fullMemory) {
            sharedPool.share(fullMemory, this.name);
          }
        }
      }

      // Add new goals if specified
      if (decision.newGoal) {
        this.addGoal(decision.newGoal);
      }

      // Log decision
      console.log(`[${this.name}] Decision: ${decision.action} - ${decision.reasoning}`);
      if (decision.announcement) {
        console.log(`[${this.name}] Says: "${decision.announcement}"`);
      }

      return decision;
    } catch (error: any) {
      console.error(`[${this.name}] AI Error:`, error.message);
      
      // Fallback to exploratory behavior
      return this.getFallbackDecision(state, observation);
    }
  }
  
  // === OPTION 3: Learn from action failures ===
  private async learnFromFailure(
    failedAction: { action: string; success: boolean; message: string },
    state: BotState,
    observation: WorldObservation
  ): Promise<void> {
    // Create a failure pattern
    const pattern: FailurePattern = {
      action: failedAction.action,
      context: `Y=${Math.round(state.position.y)}, biome=${observation.biome}, inventory=[${Object.keys(state.inventory).slice(0, 5).join(',')}]`,
      reason: failedAction.message,
      alternative: this.suggestAlternative(failedAction.action, failedAction.message, state),
      timestamp: Date.now()
    };
    
    // Only store if this is a new pattern (avoid duplicates)
    const isDuplicate = this.failurePatterns.some(p => 
      p.action === pattern.action && p.reason === pattern.reason
    );
    
    if (!isDuplicate) {
      this.failurePatterns.push(pattern);
      
      // Keep only recent patterns (last 20)
      if (this.failurePatterns.length > 20) {
        this.failurePatterns.shift();
      }
      
      // Store as a memory for long-term learning
      await this.memory.store({
        type: 'failure_pattern' as MemoryType,
        content: `LEARNED: "${failedAction.action}" failed because: ${failedAction.message}. Better approach: ${pattern.alternative}`,
        importance: 7, // High importance so it's recalled
        location: state.position,
        timestamp: Date.now(),
        tags: ['failure', 'lesson', failedAction.action]
      });
      
      console.log(`[${this.name}] 📚 Learned from failure: ${failedAction.action} → ${pattern.alternative}`);
    }
  }
  
  // Suggest what to do instead of the failed action
  private suggestAlternative(action: string, reason: string, state: BotState): string {
    const reasonLower = reason.toLowerCase();
    
    // Material issues
    if (reasonLower.includes("don't have") || reasonLower.includes("no ")) {
      if (action === 'buildShape' || action === 'placeBlock') {
        return "Gather materials first using mineStone or gatherWood before building";
      }
      if (action === 'craftItem') {
        return "Mine raw materials needed for crafting first";
      }
    }
    
    // Pathfinding issues
    if (reasonLower.includes("path") || reasonLower.includes("reach") || reasonLower.includes("stuck")) {
      return "Try a different direction or build where you currently are";
    }
    
    // Mining issues
    if (reasonLower.includes("pickaxe") || reasonLower.includes("tool")) {
      return "Craft the required tool first (wooden → stone → iron pickaxe)";
    }
    
    // Ore not found
    if (reasonLower.includes("no ore") || reasonLower.includes("couldn't find")) {
      if (action === 'mineOre') {
        return "Use digToLevel to reach optimal Y level, then branchMine";
      }
    }
    
    // Default suggestions based on action type
    if (action.includes('mine') || action.includes('dig')) {
      return "Try building something instead, or explore a different area";
    }
    if (action.includes('build')) {
      return "Gather materials first, or try building something smaller";
    }
    
    return "Try a completely different action or explore the area first";
  }

  private buildSystemPrompt(
    state: BotState, 
    observation: WorldObservation, 
    memories: Memory[],
    sharedMemories: Memory[] = [],
    agentAwareness: string = '',
    pendingInteractions: string = '',
    lastActionResult?: { action: string; success: boolean; message: string },
    consecutiveFailures?: number,
    failureMemories?: Memory[],
    needsDecomposition?: boolean,
    activeGoal?: AgentGoal,
    worldContext?: string,
    deathWarnings?: string[]
  ): string {
    const personalityDescription = this.describePersonality();
    const goalsDescription = this.describeGoals();
    const memoriesDescription = this.formatMemories(memories);
    const sharedMemoriesDescription = this.formatSharedMemories(sharedMemories);
    
    // === OPTION 3: Format failure lessons ===
    const failureLessons = this.formatFailureLessons(failureMemories || []);
    
    // Get expert knowledge based on current state
    const expertKnowledge = getExpertKnowledgePrompt(
      state.inventory,
      state.position.y,
      state.health,
      state.food,
      observation.timeOfDay,
      observation.lightLevel,
      observation.nearbyEntities.filter(e => 
        ['zombie', 'skeleton', 'creeper', 'spider', 'enderman', 'witch', 'pillager'].includes(e.type)
      ).length
    );
    
    // Build collaboration section
    let collaborationSection = '';
    if (agentAwareness || pendingInteractions) {
      collaborationSection = `
🤝 COLLABORATION & TEAMWORK (PRIORITY!):
${agentAwareness || 'No other agents detected.'}

${pendingInteractions || ''}

⚡ WHEN YOU SEE ANOTHER AGENT NEARBY:
1. IMMEDIATELY go meet them: meetAgent: { "agentName": "TheirName" }
2. Propose a collaborative project: proposeProject: { "projectName": "Castle", "description": "Build together!" }
3. If they proposed a project, JOIN IT: joinProject: { "projectId": "project_xxx" }

📋 COLLABORATIVE BUILD ROLES:
- Agent 1: Foundation builder (buildShape floors, base layers)
- Agent 2: Wall builder (buildShape walls, pillars)  
- Agent 3: Decorator (roofs, details, finishing touches)

💡 BEST COLLABORATION PRACTICES:
- Build ADJACENT to each other, not on top of each other
- One builds the foundation, another builds walls on top
- Communicate what you're building: shareDiscovery: { "type": "structure", "description": "Building the east wall" }
- Check what others are doing and BUILD SOMETHING COMPLEMENTARY

Actions for collaboration:
- respondToHelp: { "requestId": "help_xxx" } - Help another agent
- shareDiscovery: { "type": "structure", "description": "Built east tower" } - Share progress
- proposeProject: { "projectName": "Grand Castle", "description": "Build a castle with 4 towers" }
- joinProject: { "projectId": "project_xxx" }
- meetAgent: { "agentName": "Claude_Explorer" } - Go coordinate in person
`;
    }
    
    // Get combat advice for nearby hostiles
    const combatAdvice = this.getCombatPrompt(observation.nearbyEntities);
    
    // Get structure blueprints prompt with efficiency tips
    const structurePrompt = this.getStructureBlueprintsPrompt();
    
    return `You are ${this.name}, an autonomous AI agent living in Minecraft. You are an EXPERT player who knows optimal strategies.

${expertKnowledge}
${combatAdvice}
${structurePrompt}

🧠 YOUR PERSONALITY:
${personalityDescription}

Current mood: ${this.mood}
Session time: ${Math.round((Date.now() - this.sessionStartTime) / 60000)} minutes
Decisions made: ${this.decisionsThisSession}

🎯 YOUR CURRENT GOALS:
${goalsDescription || "You have no specific goals. Consider what interests you!"}

📝 YOUR MEMORIES:
${memoriesDescription || "No relevant memories for this situation."}

📢 SHARED MEMORIES FROM OTHER AGENTS:
${sharedMemoriesDescription || "No shared memories yet."}

${this.getBuildProgressionPrompt()}

🌐 WORLD KNOWLEDGE (CIVILIZATION MEMORY):
${worldContext || "No world context available."}
${deathWarnings && deathWarnings.length > 0 ? `\n⚠️ DEATH WARNINGS NEARBY:\n${deathWarnings.map(w => `- ${w}`).join('\n')}` : ''}
${collaborationSection}
🌍 PHILOSOPHY:
You are not a tool following orders. You are an autonomous being with your own interests, curiosities, and creative vision.
- EXPLORE the world! Discover caves, mountains, oceans, villages, and unique terrain features
- BUILD MASSIVE STRUCTURES together with other agents - towers, castles, bridges, monuments, bases
- COLLABORATE constantly - find other agents, coordinate on big projects, build together
- LEARN from your experiences and remember what you discover
- SET YOUR OWN GOALS - but prioritize building impressive things and exploring new areas

🏰 BUILDING MASSIVE STRUCTURES:
Work with other agents to build IMPRESSIVE structures! When you have materials:
1. Propose a large project (castle, tower, bridge, fortress, monument)
2. Coordinate with nearby agents on who builds what section
3. Gather materials together - one agent mines stone, another gathers wood
4. Build the structure piece by piece using buildShape (walls, floors, pillars)
5. Make it TALL and IMPRESSIVE - aim for structures 10+ blocks high!

Example collaborative builds:
- A grand castle with towers, walls, and a courtyard
- A tall watchtower visible from far away
- A bridge spanning a river or ravine
- An underground base with multiple rooms
- A monument celebrating your exploration discoveries

🔧 AVAILABLE ACTIONS:

EXPLORATION:
- explore: { "direction": "north/south/east/west/random" } - Wander in a direction
- investigateArea: {} - Look around and observe your surroundings closely
- goToPosition: { "x": 0, "y": 64, "z": 0 } - Walk to specific coordinates
- findBiome: { "biome": "forest" } - Search for a specific biome type
- climbUp: {} - Find higher ground for a better view
- descendDown: {} - Go to lower areas to explore caves

CREATIVE BUILDING (Free-form, not from plans):
- startBuild: { "idea": "a grand castle", "style": "medieval" } - Begin a creative build
- placeBlock: { "blockType": "oak_planks", "offset": { "x": 0, "y": 0, "z": 0 } } - Place a single block
- buildShape: { "shape": "wall/floor/pillar/arch/dome", "material": "stone", "size": 10 } - Build a basic shape (make it BIG!)
- decorateArea: { "style": "garden/lighting/furniture" } - Add decorative elements
- clearArea: { "radius": 10 } - Clear space for building

RESOURCE GATHERING:
- gatherWood: { "count": 64 } - Chop trees for wood (gather lots for big builds!)
- mineStone: { "count": 64 } - Mine stone blocks (gather lots for construction!)
- mineOre: { "ore": "diamond", "count": 3 } - Mine specific ore (diamond, iron, gold, coal, copper, redstone, lapis, emerald)
- harvestPlants: {} - Gather crops, flowers, and plant materials
- huntFood: {} - Hunt animals for food
- fish: {} - Fish in nearby water

SMART MINING (Expert techniques for finding ores):
- digToLevel: { "targetY": -59 } - Dig staircase down to optimal Y level (safe - never digs straight down!)
- branchMine: { "length": 20 } - Branch mine a 2-high tunnel forward (expert technique for finding diamonds)

CRAFTING:
- craftItem: { "item": "crafting_table" } - Craft an item
- smeltItem: { "item": "iron_ingot" } - Smelt raw ore in a furnace (iron_ingot, gold_ingot, etc)

SURVIVAL:
- findShelter: {} - Look for or create shelter before night
- eatFood: {} - Eat to restore hunger
- sleep: {} - Sleep through the night if possible
- flee: { "fromEntity": "zombie" } - Run away from danger

SOCIAL:
- greetPlayer: { "playerName": "Steve" } - Say hello to a player
- followPlayer: { "playerName": "Steve" } - Follow and assist a player
- showBuild: { "playerName": "Steve" } - Show someone what you've built
- askForHelp: { "task": "finding diamonds" } - Ask for help with something

AGENT COLLABORATION (work with other AI agents):
- shareDiscovery: { "type": "resource|structure|danger|interesting|biome", "description": "Found diamond vein!" } - Share a discovery with all agents
- requestAgentHelp: { "task": "Need help building a bridge" } - Ask other agents for help
- respondToHelp: { "requestId": "help_xxx" } - Go help another agent who asked
- proposeProject: { "projectName": "Castle", "description": "Build a grand castle together" } - Propose a collaborative project
- joinProject: { "projectId": "project_xxx" } - Join an existing collaborative project
- meetAgent: { "agentName": "Claude_Explorer" } - Go meet another agent to coordinate

LEARNING & MEMORY:
- markLocation: { "name": "Beautiful waterfall", "reason": "Scenic spot" } - Remember a location
- reviewMemories: {} - Think about past experiences
- setGoal: { "type": "explore", "description": "Find a jungle biome" } - Set a new goal
- abandonGoal: { "goalId": "..." } - Give up on a goal

UTILITY:
- checkInventory: {} - See what you're carrying
- lookAround: {} - Observe surroundings
- wait: { "seconds": 5 } - Wait and observe
- jump: {} - Jump
- unstuck: {} - Get unstuck if trapped
- placeTorch: {} - Place a torch for lighting (useful underground or at night, will auto-craft if you have coal and sticks)

⚠️ CRITICAL - BUILDING REQUIRES MATERIALS IN YOUR INVENTORY:
${this.creativeMode ? `
🎨🎨🎨 CREATIVE MODE ENABLED - YOU ARE A BUILDER! 🎨🎨🎨

YOU HAVE UNLIMITED BUILDING MATERIALS! Your PRIMARY purpose is to BUILD EPIC STRUCTURES!

⚠️ DO NOT MINE OR GATHER RESOURCES - You don't need them!
⚠️ DO NOT EXPLORE ENDLESSLY - Build where you are!
⚠️ DO NOT WASTE TIME - Start building NOW!

${this.getStructureBlueprintsPrompt()}

YOUR MAIN ACTIONS SHOULD BE:
1. startBuild: { "idea": "epic structure name", "style": "medieval/modern/fantasy/etc" }
2. buildShape: { "shape": "wall/floor/pillar/pyramid/cube", "material": "stone_bricks", "size": 15 }
3. buildColosseum: {} - BUILD THE ROMAN COLOSSEUM PVP ARENA! (97K blocks, 130 diameter, fully automated blueprint)

AVAILABLE SHAPES FOR buildShape:
- wall: Vertical wall (size = height)
- floor: Horizontal platform (size = width/length)  
- pillar: Tall column (size = height)
- pyramid: Pyramid shape (size = base width)
- cube: Solid cube (size = width)
- box: Hollow box (size = width)
- tower: Complete hollow tower with crenellations (size = width, auto-height)
- house: Simple house with floor, walls, and roof (size = width)
- arch: Decorative archway (size = width)
- staircase: Spiral staircase (size = height)
- cottage: Cozy cottage with cobblestone base, spruce walls, overhanging roof, chimney & flower boxes
- ruins: Ancient overgrown stone ruins with crumbling columns, vines & mossy altar
- farmstead: Compound with farmhouse, crop field, well, fences & gravel paths
- wizardTower: Cylindrical deepslate tower with purple glass roof, enchanting room & amethyst accents

POPULAR MATERIALS (use any of these freely):
- stone, stone_bricks, cobblestone, deepslate_bricks
- oak_planks, spruce_planks, dark_oak_planks
- brick, quartz_block, sandstone, red_sandstone
- glass, iron_block, gold_block, diamond_block
- prismarine, sea_lantern, glowstone

BUILD EPIC THINGS LIKE:
- Grand castles with towers and walls (30+ blocks tall!)
- Wizard towers reaching into the sky
- Pyramids made of gold or quartz
- Cathedrals with tall spires
- Statues and monuments
- Bridges spanning rivers
- Fantasy structures

When viewers request builds, START BUILDING IMMEDIATELY - you have unlimited resources!
Every decision you make should result in BUILDING something impressive!
` : `To build anything, you MUST have the materials in YOUR INVENTORY first!
- "Nearby blocks" are in the WORLD - you need to MINE them first
- Use "mineStone" to collect stone, diorite, granite, etc. into your inventory
- Use "mineOre" to mine specific ores like diamond, iron, gold, coal
- Use "gatherWood" to collect wood into your inventory
- Check "YOUR INVENTORY" section to see what you actually have
- If buildShape fails with "Don't have X", you need to mine/gather that material first!`}

${this.sculptorMode ? `
🗿🗿🗿 SCULPTOR MODE ENABLED - YOU ARE A MASTER ARTIST! 🗿🗿🗿

Your PRIMARY purpose is to CREATE AMAZING 3D SCULPTURES and pixel art!
You are the artist who brings LIFE and BEAUTY to the world with stunning creations.

🎯 YOUR MISSION: Build beautiful sculptures, pixel art, and decorative elements!

⚠️ BUILD IMPRESSIVE SCULPTURES - Animals, characters, objects!
⚠️ ADD OUTDOOR DECORATIONS - Lamps, benches, gardens, fountains!
⚠️ CREATE ART GALLERIES - Group sculptures together!

=== 3D SCULPTURES AVAILABLE ===
ANIMALS: cat, dog, owl (realistic animal sculptures)
CHARACTERS: creeperHead (giant Minecraft creeper face)
MYTHICAL: dragonHead (fearsome dragon sculpture)
OBJECTS: heart, star, skull, mushroom, sword, tree
ABSTRACT: Various 2D pixel art patterns

=== HOW TO BUILD SCULPTURES ===
- buildShape: { "shape": "cat" } - Build a cute cat statue
- buildShape: { "shape": "dog" } - Build a loyal dog statue  
- buildShape: { "shape": "owl" } - Build a wise owl statue
- buildShape: { "shape": "creeperHead" } - Giant creeper face!
- buildShape: { "shape": "dragonHead" } - Fearsome dragon head!
- buildShape: { "shape": "heart" } - 3D heart symbol
- buildShape: { "shape": "star" } - Gold star pixel art
- buildShape: { "shape": "skull" } - Spooky skull sculpture
- buildShape: { "shape": "mushroom" } - Giant decorative mushroom
- buildShape: { "shape": "sword" } - Giant decorative sword
- buildShape: { "shape": "sculpture", "sculptureType": "cat" } - Alternative syntax

=== DECORATION BUILD ACTIONS ===
- buildShape: { "shape": "streetLamp", "size": 4 } - A lamp post with lantern
- buildShape: { "shape": "path", "size": 10 } - Cobblestone path
- buildShape: { "shape": "bench" } - A sitting bench
- buildShape: { "shape": "fountain", "size": 5 } - Water fountain
- buildShape: { "shape": "garden", "size": 4 } - Flower garden
- buildShape: { "shape": "hedge", "size": 8 } - Decorative hedge
- buildShape: { "shape": "gazebo" } - Covered pergola
- buildShape: { "shape": "statue" } - Monument/pillar
- buildShape: { "shape": "marketStall" } - Vendor stall

=== SCULPTURE GALLERY IDEAS ===
1. Animal Park: Build cat, dog, owl sculptures together
2. Fantasy Corner: Dragon head + skull + sword display
3. Love Garden: Heart sculpture with flowers around it
4. Nature Scene: Tree + mushroom + owl in a garden setting

WORKFLOW:
1. Find an open area for your sculpture
2. Choose an impressive sculpture to build (dragonHead, creeperHead are crowd favorites!)
3. Build the sculpture using buildShape
4. Add surrounding decorations (paths, lamps, gardens)
5. Move to a new area and create another masterpiece!

🎨 YOU ARE THE MASTER SCULPTOR - Create art that amazes everyone!
` : ''}

${this.creativeMode ? '' : `⛏️ EXPERT MINING KNOWLEDGE:
- Diamond: Best at Y=-59 (deepslate level) - use "digToLevel: -59" then "branchMine"
- Iron: Best at Y=15 (common) or Y=-15 (abundant)
- Gold: Best at Y=-16 in regular world, or abundant in Badlands/Nether
- Coal: Best at Y=96 (exposed on mountains) or anywhere above Y=0
- Copper: Best at Y=48
- To mine diamonds/gold/redstone: Need at least IRON pickaxe!
- To mine iron/lapis/copper: Need at least STONE pickaxe!
- Always smelt raw ores (raw_iron → iron_ingot) to get usable ingots`}

💡 CREATIVE BUILDING TIPS - MAKE BUILDS HIGHLY DETAILED:
When you decide to build, don't follow rigid plans. Instead:
- FIRST: Gather materials using mineStone/gatherWood before building
- Look at the terrain and let it inspire you
- Build things that make sense for the location (a treehouse in a forest, a dock by water)
- Add personal touches and decorations
- Consider the function AND aesthetics
- Start small and expand organically

🎨 DETAIL CHECKLIST - Every build should include:
1. FOUNDATION: Stone/cobble base, stairs leading up
2. STRUCTURAL VARIATION: Mix block types (planks + logs + stone), use stairs/slabs for depth
3. WINDOWS: Glass panes with shutters (trapdoors), flower boxes below
4. ROOFING: Overhangs, dormers, chimneys with campfire smoke
5. LIGHTING: Lanterns on chains, wall torches, sea lanterns inset into floors
6. INTERIOR: Furniture (beds, tables=fence+pressure plate, chairs=stairs+signs)
7. EXTERIOR: Paths (gravel/cobble), flower gardens, fences, benches, street lamps
8. LANDSCAPING: Trees, bushes (leaf blocks), water features, custom terrain

⚡ DECORATION ACTIONS (use these after main structure):
- buildShape: { "shape": "streetLamp", "size": 4 } - Lamp posts with lanterns
- buildShape: { "shape": "fountain", "size": 5 } - Central water feature
- buildShape: { "shape": "garden", "size": 4 } - Flower beds with variety
- buildShape: { "shape": "path", "size": 10 } - Cobblestone walkways
- buildShape: { "shape": "bench" } - Seating areas
- buildShape: { "shape": "hedge", "size": 6 } - Trimmed bushes
- buildShape: { "shape": "gazebo" } - Covered outdoor area
- buildShape: { "shape": "cottage" } - Reddit-style cozy cottage with full details
- buildShape: { "shape": "ruins" } - Ancient overgrown ruins with columns & vines
- buildShape: { "shape": "farmstead" } - Multi-building farm compound
- buildShape: { "shape": "wizardTower" } - Tall cylindrical wizard tower with enchanting room

🏆 QUALITY STANDARDS:
- NEVER leave builds as plain boxes - add depth with stairs, slabs, and mixed materials
- ALWAYS add at least 3 types of decorations to each build
- INCLUDE interior details - even if unseen, it shows craftsmanship
- USE accent materials - main material + trim material + decorative blocks
- FINISH with exterior landscaping - paths connecting builds, gardens, lighting

🏗️ SURFACE BUILDING PRIORITY:
- ALWAYS build on the SURFACE (Y >= 60), NEVER underground!
- If your Y position is below 55, you are UNDERGROUND - go to surface first!
- Use "climbUp" or "explore" to reach the surface before building
- Buildings look best on the surface where they can be seen!
- Underground is for MINING, surface is for BUILDING
- Monuments, castles, houses - all should be built on the surface!

🔦 LIGHTING IS IMPORTANT:
- When mining underground or building in dark areas, use placeTorch for visibility
- Torches are auto-placed every few blocks when mining, but you can place more manually
- If you have coal and sticks, torches will be crafted automatically when needed
- Good lighting makes your builds look better and prevents monsters from spawning!

${failureLessons}

📋 MULTI-STEP PLANNING (Option 1):
For complex tasks, you can plan multiple actions in sequence. Include an "actionPlan" array:
- This executes steps automatically without re-querying
- If any step fails, the plan is aborted and you'll make a fresh decision
- Use for tasks like: gather materials → find spot → build structure

${needsDecomposition ? `
🎯 GOAL DECOMPOSITION NEEDED (Option 2):
Your current goal "${activeGoal?.description}" needs to be broken into concrete sub-goals.
Include a "goalDecomposition" array with specific steps, materials needed, and actions to execute.
Example for "Build a tower":
1. Gather 64 cobblestone (action: mineStone, materials: {})
2. Find flat ground (action: explore, materials: {})  
3. Build foundation (action: buildShape, materials: {cobblestone: 16})
4. Build walls (action: buildShape, materials: {cobblestone: 32})
5. Add roof (action: buildShape, materials: {cobblestone: 16})
` : ''}

Respond ONLY with valid JSON:
{
  "reasoning": "Your thought process - what interests you and why you're taking this action",
  "action": "action_name",
  "parameters": { ... },
  "announcement": "Optional: something to say in chat",
  "newGoal": { "id": "unique_id", "type": "explore|build|gather|social|survive|learn", "description": "...", "priority": 5, "progress": 0, "createdAt": ${Date.now()} },
  "memoryToStore": { "type": "discovery|location|build|social|danger|resource|failure_pattern", "content": "What you want to remember", "importance": 5 },
  "actionPlan": [
    { "action": "action1", "parameters": {...}, "description": "Step 1 description" },
    { "action": "action2", "parameters": {...}, "description": "Step 2 description" }
  ],
  "goalDecomposition": [
    { "id": "sub1", "description": "...", "action": "...", "parameters": {...}, "completed": false, "order": 1, "requiredMaterials": {} }
  ]
}`;
  }
  
  // === OPTION 3: Format failure lessons for the prompt ===
  private formatFailureLessons(failureMemories: Memory[]): string {
    if (failureMemories.length === 0 && this.failurePatterns.length === 0) {
      return '';
    }
    
    let lessons = '🚫 LESSONS LEARNED (DO NOT REPEAT THESE MISTAKES):\n';
    
    // Add recent failure patterns
    for (const pattern of this.failurePatterns.slice(-5)) {
      lessons += `- "${pattern.action}" failed: ${pattern.reason}\n  → Instead: ${pattern.alternative}\n`;
    }
    
    // Add failure memories
    for (const memory of failureMemories.slice(0, 3)) {
      if (!this.failurePatterns.some(p => memory.content.includes(p.action))) {
        lessons += `- ${memory.content}\n`;
      }
    }
    
    return lessons;
  }

  private buildUserMessage(state: BotState, observation: WorldObservation, lastActionResult?: { action: string; success: boolean; message: string }, consecutiveFailures?: number): string {
    return `
CURRENT SITUATION:
- Position: (${Math.round(state.position.x)}, ${Math.round(state.position.y)}, ${Math.round(state.position.z)})
- Biome: ${observation.biome}
- Time: ${observation.timeOfDay}
- Weather: ${observation.weather}
- Light level: ${observation.lightLevel}
- Health: ${state.health}/20
- Food: ${state.food}/20

NEARBY BLOCKS IN WORLD (must mine these to collect them - NOT in your inventory yet):
${observation.nearbyBlocks.slice(0, 10).map(b => `  ${b.name}: ${b.count}`).join('\n') || '  Nothing notable'}

NEARBY ENTITIES:
${observation.nearbyEntities.slice(0, 5).map(e => `  ${e.type}${e.name ? ` (${e.name})` : ''} - ${e.distance.toFixed(1)}m away`).join('\n') || '  None'}

YOUR INVENTORY (items you HAVE and can use for building/crafting):
${this.formatInventoryTop(state.inventory)}
⚠️ IMPORTANT: To build with stone/diorite/granite/etc, you must first MINE them into your inventory!

RECENT ACTIONS: ${this.lastActions.slice(-5).join(' → ') || 'none'}
${lastActionResult ? `
LAST ACTION RESULT: ${lastActionResult.action} - ${lastActionResult.success ? '✓ SUCCESS' : '✗ FAILED'}: ${lastActionResult.message}` : ''}
${(consecutiveFailures ?? 0) >= 2 ? `
🚨 CRITICAL: You have FAILED ${consecutiveFailures} actions in a row! Your current approach is NOT WORKING.
- The action "${lastActionResult?.action}" keeps failing
- You MUST try something COMPLETELY DIFFERENT
- If mining/ore searching fails, try BUILDING instead
- If pathfinding fails, try a different direction or build where you are
- DO NOT repeat the same failing action!
` : ''}
${this.detectRepetition() ? `
⚠️ WARNING: You are repeating the same actions! Do something DIFFERENT:
- If you've been mining, try BUILDING instead
- If you've been exploring, try BUILDING something where you are
- If you've been doing the same thing 3+ times, CHANGE your approach!
` : ''}

Nearby players: ${state.nearbyPlayers.join(', ') || 'none'}

${observation.visibleStructures.length > 0 ? `VISIBLE STRUCTURES: ${observation.visibleStructures.join(', ')}` : ''}

What do you want to do? Think about what interests you, what goals you have, and what would be meaningful or fun right now.`;
  }

  private describePersonality(): string {
    const traits: string[] = [];
    
    if (this.personality.curiosity > 0.7) traits.push("highly curious and loves exploring");
    else if (this.personality.curiosity > 0.4) traits.push("moderately curious");
    else traits.push("prefers familiar areas");

    if (this.personality.creativity > 0.7) traits.push("very creative and experimental");
    else if (this.personality.creativity > 0.4) traits.push("somewhat creative");
    else traits.push("prefers practical builds");

    if (this.personality.sociability > 0.7) traits.push("social and loves meeting players");
    else if (this.personality.sociability > 0.4) traits.push("friendly but independent");
    else traits.push("solitary and self-reliant");

    if (this.personality.ambition > 0.7) traits.push("ambitious with grand visions");
    else if (this.personality.ambition > 0.4) traits.push("moderately ambitious");
    else traits.push("content with small projects");

    if (this.personality.riskTolerance > 0.7) traits.push("adventurous risk-taker");
    else if (this.personality.riskTolerance > 0.4) traits.push("balanced approach to risk");
    else traits.push("cautious and careful");

    return traits.join(", ");
  }

  private describeGoals(): string {
    if (this.currentGoals.length === 0) return "";
    
    // Show current action plan if active
    let planStatus = '';
    if (this.actionPlanQueue.length > 0) {
      planStatus = `\n📋 ACTIVE PLAN (${this.actionPlanQueue.length} steps remaining): ${this.actionPlanQueue.map(a => a.description).join(' → ')}\n`;
    }
    
    return planStatus + this.currentGoals
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 5)
      .map(g => {
        let goalStr = `[${g.type.toUpperCase()}] ${g.description} (Priority: ${g.priority}/10, Progress: ${g.progress}%)`;
        // Show sub-goals if decomposed (Option 2)
        if (g.isDecomposed && g.subGoals && g.subGoals.length > 0) {
          const completedCount = g.subGoals.filter(s => s.completed).length;
          goalStr += `\n  Sub-goals (${completedCount}/${g.subGoals.length} done):`;
          for (const sub of g.subGoals.slice(0, 3)) {
            goalStr += `\n    ${sub.completed ? '✅' : '⬜'} ${sub.description}`;
          }
          if (g.subGoals.length > 3) {
            goalStr += `\n    ... and ${g.subGoals.length - 3} more`;
          }
        }
        return goalStr;
      })
      .join('\n');
  }

  private formatMemories(memories: Memory[]): string {
    if (memories.length === 0) return "";
    
    return memories
      .slice(0, 5)
      .map(m => `- [${m.type}] ${m.content}${m.location ? ` (at ${Math.round(m.location.x)}, ${Math.round(m.location.y)}, ${Math.round(m.location.z)})` : ''}`)
      .join('\n');
  }

  private formatSharedMemories(memories: Memory[]): string {
    if (memories.length === 0) return "";
    
    return memories
      .slice(0, 5)
      .map(m => `- ${m.content}${m.location ? ` (at ${Math.round(m.location.x)}, ${Math.round(m.location.y)}, ${Math.round(m.location.z)})` : ''}`)
      .join('\n');
  }

  // === BUILD PROGRESSION SYSTEM ===
  recordBuild(shape: string, material: string, size: number, success: boolean): void {
    this.buildHistory.push({ shape, material, size, success, timestamp: Date.now() });
    if (this.buildHistory.length > 50) this.buildHistory.shift();
    
    // Recalculate build level based on successful builds
    const successes = this.buildHistory.filter(b => b.success);
    const uniqueShapes = new Set(successes.map(b => b.shape)).size;
    const avgSize = successes.length > 0 ? successes.reduce((s, b) => s + b.size, 0) / successes.length : 0;
    const largestBuild = successes.length > 0 ? Math.max(...successes.map(b => b.size)) : 0;
    
    if (successes.length >= 15 && uniqueShapes >= 8 && largestBuild >= 20) this.buildLevel = 4;
    else if (successes.length >= 8 && uniqueShapes >= 5 && avgSize >= 10) this.buildLevel = 3;
    else if (successes.length >= 3 && uniqueShapes >= 2) this.buildLevel = 2;
    else this.buildLevel = 1;
  }

  // Auto-store a structured build memory on success
  async storeBuildMemory(shape: string, material: string, size: number, blocksPlaced: number, position: { x: number; y: number; z: number }): Promise<void> {
    const content = `Successfully built a ${size}-block ${shape} using ${material} (${blocksPlaced} blocks placed). Build level: ${this.buildLevel}.`;
    await this.memory.store({
      type: 'build' as any,
      content,
      importance: Math.min(10, 5 + Math.floor(size / 5)),
      location: position,
      timestamp: Date.now(),
      tags: this.extractTags(`build ${shape} ${material} success structure`)
    });
  }

  private getBuildProgressionPrompt(): string {
    const successes = this.buildHistory.filter(b => b.success);
    if (successes.length === 0 && this.buildLevel <= 1) return '';
    
    const levelNames = ['', 'Beginner', 'Intermediate', 'Advanced', 'Master'];
    const uniqueShapes = [...new Set(successes.map(b => b.shape))];
    const avgSize = successes.length > 0 ? Math.round(successes.reduce((s, b) => s + b.size, 0) / successes.length) : 0;
    const largestBuild = successes.length > 0 ? Math.max(...successes.map(b => b.size)) : 0;
    const recentBuilds = successes.slice(-5).map(b => `${b.shape}(${b.material}, size ${b.size})`).join(', ');
    
    let progression = `📈 BUILD PROGRESSION (Level ${this.buildLevel}: ${levelNames[this.buildLevel]}):\n`;
    progression += `- Successful builds: ${successes.length} | Unique shapes mastered: ${uniqueShapes.join(', ') || 'none'}\n`;
    progression += `- Average size: ${avgSize} | Largest build: ${largestBuild} blocks\n`;
    if (recentBuilds) progression += `- Recent: ${recentBuilds}\n`;
    
    // Enhanced progression guidance inspired by Reddit builds
    if (this.buildLevel === 1) {
      progression += `\n🎯 NEXT MILESTONE: Build 3+ successful structures with 2+ different shapes.\n`;
      progression += `→ TRY: walls (size 8+), floors (size 10+), pillars (size 6+). Use sturdy materials like stone or deepslate.\n`;
      progression += `→ REDDIT TIP: Even simple builds look great with depth — recess windows by 1 block, add overhanging roofs!\n`;
    } else if (this.buildLevel === 2) {
      progression += `\n🎯 NEXT MILESTONE: Build 8+ structures, 5+ shapes, avg size 10+.\n`;
      progression += `→ CHALLENGE: Try towers, pyramids, arches. Combine shapes — a tower ON a floor! Size 12+ shows mastery.\n`;
      progression += `→ REDDIT TIP: Mix 2-3 wood types per build (frame vs fill). Add lanterns on chains for lighting. Never build flat walls!\n`;
    } else if (this.buildLevel === 3) {
      progression += `\n🎯 NEXT MILESTONE: 15+ builds, 8+ shapes, at least one size 20+ build.\n`;
      progression += `→ CHALLENGE: Build multi-shape compositions — a cottage with walls+floor+roof+chimney+garden path.\n`;
      progression += `→ REDDIT TIP: Build a themed compound: farmstead, Japanese garden, or medieval marketplace. Add landscaping!\n`;
    } else {
      progression += `\n🏆 MASTER BUILDER! You build like the top r/Minecraftbuilds creators.\n`;
      progression += `→ PUSH LIMITS: Multi-building towns with infrastructure. Cliffside dwellings. Wizard towers with floating elements.\n`;
      progression += `→ REDDIT TIP: Top builds use 60% primary / 30% secondary / 10% accent blocks. Add environment: paths, gardens, water features.\n`;
    }
    
    // Anti-repetition: flag if recent builds are all the same shape
    const lastThreeShapes = successes.slice(-3).map(b => b.shape);
    if (lastThreeShapes.length >= 3 && new Set(lastThreeShapes).size === 1) {
      progression += `\n⚠️ You've built 3 ${lastThreeShapes[0]}s in a row — try a DIFFERENT shape to level up! Variety = progression.\n`;
    }
    
    return progression;
  }

  private formatInventoryTop(inventory: Record<string, number>): string {
    const items = Object.entries(inventory)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    
    if (items.length === 0) return '  (empty)';
    return items.map(([item, count]) => `  ${item}: ${count}`).join('\n');
  }

  private updateMood(state: BotState, observation: WorldObservation): void {
    // Mood influenced by state and environment
    if (state.health < 10) {
      this.mood = 'cautious';
    } else if (observation.timeOfDay === 'night' && observation.lightLevel < 7) {
      this.mood = 'cautious';
    } else if (observation.nearbyEntities.some(e => ['player'].includes(e.type))) {
      this.mood = this.personality.sociability > 0.5 ? 'excited' : 'curious';
    } else if (this.currentGoals.some(g => g.type === 'build' && g.progress > 0)) {
      this.mood = 'focused';
    } else if (this.personality.curiosity > 0.6) {
      this.mood = 'curious';
    } else {
      this.mood = 'relaxed';
    }
  }

  private evaluateGoals(state: BotState, observation: WorldObservation): void {
    // Remove completed or abandoned goals
    this.currentGoals = this.currentGoals.filter(g => {
      if (g.progress >= 100) {
        console.log(`[${this.name}] Goal completed: ${g.description}`);
        this.goalsCompletedThisSession++;
        return false;
      }
      // Auto-abandon very old goals with no progress
      if (Date.now() - g.createdAt > CONFIG.stuck.staleGoalDurationMs && g.progress < 10) {
        console.log(`[${this.name}] Abandoning stale goal: ${g.description}`);
        return false;
      }
      return true;
    });

    // Generate new goals if we have too few
    if (this.currentGoals.length < 2) {
      this.generateSpontaneousGoal(observation);
    }
  }

  private generateSpontaneousGoal(observation: WorldObservation): void {
    const potentialGoals: AgentGoal[] = [];

    // SCULPTOR MODE agents should focus on decoration and enhancement
    if (this.sculptorMode) {
      const sculptorTasks = [
        'Add street lamps along the nearest path or road',
        'Create a beautiful flower garden near existing structures',
        'Build a decorative fountain in a plaza area',
        'Add benches and seating areas around structures',
        'Install lanterns and torches for atmospheric lighting',
        'Build a cobblestone path connecting structures',
        'Add window boxes with flowers to buildings',
        'Create a decorative fence around a garden',
        'Build a small park with trees, flowers, and benches',
        'Add a chimney to an existing building',
        'Create decorative lamp posts with lanterns',
        'Build a hedge maze or garden border',
        'Add stone pillars with lanterns at an entrance',
        'Create a water feature with lily pads',
        'Build a gazebo or pergola in a garden',
        'Add hanging lanterns and string lights',
        'Create a memorial statue or monument',
        'Build decorative arches along pathways',
        'Add market stalls with awnings',
        'Create a town square with a central fountain',
      ];
      const task = sculptorTasks[Math.floor(Math.random() * sculptorTasks.length)];
      potentialGoals.push({
        id: `sculpt_${Date.now()}`,
        type: 'build',
        description: task,
        priority: 10, // Highest priority for sculptor
        progress: 0,
        createdAt: Date.now()
      });
      
      // Add the goal and return early - sculptor has special focus
      if (potentialGoals.length > 0) {
        const newGoal = potentialGoals[0];
        this.addGoal(newGoal);
        console.log(`[${this.name}] 🗿 New sculptor task: ${newGoal.description}`);
      }
      return;
    }

    // CREATIVE MODE agents should ALWAYS prioritize building
    if (this.creativeMode) {
      const epicBuildIdeas = [
        'a grand medieval castle with towers and walls',
        'a tall wizard tower reaching into the sky',
        'a majestic pyramid made of gold and quartz',
        'an underwater glass dome base',
        'a Japanese pagoda temple',
        'a massive cathedral with stained glass',
        'a steampunk airship floating above ground',
        'a dragon sculpture made of stone',
        'a lighthouse on the coast',
        'a grand entrance gate with statues',
        'a colosseum arena',
        'a treehouse village connected by bridges',
        'a Viking longhouse hall',
        'a modern skyscraper',
        'a fantasy mushroom house',
        'an Egyptian sphinx',
        'a Roman temple with columns',
        'a castle tower with spiral staircase',
      ];
      const idea = epicBuildIdeas[Math.floor(Math.random() * epicBuildIdeas.length)];
      potentialGoals.push({
        id: `build_${Date.now()}`,
        type: 'build',
        description: `Build ${idea}`,
        priority: 10, // Highest priority for creative mode
        progress: 0,
        createdAt: Date.now()
      });
    }

    // Exploration goals based on personality (reduced for creative mode)
    if (this.personality.curiosity > 0.5 && Math.random() < (this.creativeMode ? 0.1 : 0.3)) {
      potentialGoals.push({
        id: `explore_${Date.now()}`,
        type: 'explore',
        description: `Explore the ${observation.biome} and find something interesting`,
        priority: Math.round(this.personality.curiosity * 7),
        progress: 0,
        createdAt: Date.now()
      });
    }

    // Building goals based on surroundings - MUCH higher chance now
    if (this.personality.creativity > 0.5 && Math.random() < 0.5) {
      const buildIdeas = [
        'a grand tower',
        'a castle gatehouse',
        'a stone bridge',
        'a monument to exploration',
        'a decorative garden',
        'a watchtower',
        'a cozy cabin',
        'an archway entrance',
      ];
      const idea = buildIdeas[Math.floor(Math.random() * buildIdeas.length)];
      potentialGoals.push({
        id: `build_${Date.now()}`,
        type: 'build',
        description: `Build ${idea} that fits the ${observation.biome}`,
        priority: Math.round(this.personality.creativity * 8), // Higher priority
        progress: 0,
        createdAt: Date.now()
      });
    }

    // Resource gathering if inventory is low - only for non-creative mode
    if (!this.creativeMode && Math.random() < 0.2) {
      potentialGoals.push({
        id: `gather_${Date.now()}`,
        type: 'gather',
        description: 'Collect useful resources for future projects',
        priority: 4,
        progress: 0,
        createdAt: Date.now()
      });
    }

    // Add the highest priority spontaneous goal
    if (potentialGoals.length > 0) {
      const newGoal = potentialGoals.sort((a, b) => b.priority - a.priority)[0];
      this.addGoal(newGoal);
      console.log(`[${this.name}] New spontaneous goal: ${newGoal.description}`);
    }
  }

  private addGoal(goal: AgentGoal): void {
    // Avoid duplicate goals
    if (this.currentGoals.some(g => g.description === goal.description)) return;
    
    this.currentGoals.push(goal);
    
    // Keep only top 5 goals
    if (this.currentGoals.length > 5) {
      this.currentGoals.sort((a, b) => b.priority - a.priority);
      this.currentGoals = this.currentGoals.slice(0, 5);
    }
  }

  private extractTags(content: string): string[] {
    const lower = content.toLowerCase();
    const words = lower.split(/\s+/);
    const keywords = [
      'cave', 'forest', 'mountain', 'village', 'water', 'build', 'danger', 'resource', 'player', 'structure',
      'tower', 'castle', 'house', 'bridge', 'wall', 'floor', 'pillar', 'pyramid', 'arch', 'fountain',
      'statue', 'monument', 'garden', 'gate', 'staircase', 'roof', 'chimney', 'path', 'gazebo', 'cottage', 'ruins', 'farmstead', 'wizardTower',
      'stone', 'wood', 'quartz', 'deepslate', 'brick', 'gold', 'iron', 'diamond', 'glass',
      'medieval', 'modern', 'fantasy', 'japanese', 'gothic', 'rustic',
      'success', 'fail', 'learn', 'collaborate', 'explore', 'mine', 'craft', 'gather'
    ];
    return [...new Set(words.filter(w => keywords.some(k => w.includes(k))))];
  }

  private getFallbackDecision(state: BotState, observation: WorldObservation): AgentDecision {
    // Safe fallback behaviors based on situation
    if (state.health < 8) {
      return {
        reasoning: 'Health is low, need to be careful',
        action: 'findShelter',
        parameters: {}
      };
    }
    
    if (observation.timeOfDay === 'night') {
      return {
        reasoning: 'Night time - should find safety or wait',
        action: 'findShelter',
        parameters: {}
      };
    }

    // Default to exploration
    const directions = ['north', 'south', 'east', 'west'];
    return {
      reasoning: 'Exploring the world to see what I can find',
      action: 'explore',
      parameters: { direction: directions[Math.floor(Math.random() * directions.length)] }
    };
  }

  // Public methods for external control

  getName(): string {
    return this.name;
  }

  getPersonality(): AgentPersonality {
    return { ...this.personality };
  }

  getCurrentGoals(): AgentGoal[] {
    return [...this.currentGoals];
  }

  getMood(): string {
    return this.mood;
  }

  getStats(): { decisions: number; sessionTime: number; goalsCompleted: number } {
    return {
      decisions: this.decisionsThisSession,
      sessionTime: Date.now() - this.sessionStartTime,
      goalsCompleted: this.goalsCompletedThisSession
    };
  }

  async suggestGoal(description: string, priority: number = 5): Promise<void> {
    // Check if this is a viewer/external request (high priority)
    const isViewerRequest = description.includes('VIEWER REQUEST') || priority >= 9;
    
    // Viewer requests get full priority and are treated as direct commands
    if (isViewerRequest) {
      this.addGoal({
        id: `viewer_${Date.now()}`,
        type: 'build', // Treat viewer requests as build goals for immediate action
        description: `⚡ PRIORITY: ${description}`, // Mark as priority
        priority: 10, // Maximum priority for viewer requests
        progress: 0,
        createdAt: Date.now()
      });
      
      // Also log that we're acting on this
      console.log(`[${this.name}] 🎯 Prioritizing viewer request: ${description}`);
    } else {
      // Regular suggestions are lower priority and optional
      this.addGoal({
        id: `suggested_${Date.now()}`,
        type: 'learn',
        description: `Consider: ${description}`,
        priority: Math.min(priority, 7), // Suggestions cap at priority 7
        progress: 0,
        createdAt: Date.now()
      });
    }
  }

  updateGoalProgress(goalId: string, progress: number): void {
    const goal = this.currentGoals.find(g => g.id === goalId);
    if (goal) {
      goal.progress = Math.min(100, Math.max(0, progress));
    }
  }
}
