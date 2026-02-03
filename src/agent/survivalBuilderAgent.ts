/**
 * Survival Builder Agent - AI agent that gathers resources and builds in survival mode
 * 
 * This agent doesn't use operator commands - it must:
 * - Walk to locations (no teleporting)
 * - Mine resources
 * - Craft materials
 * - Place blocks from inventory
 */

import { buildCoordinator } from '../building/buildCoordinator';
import { CASTLE_INFO } from '../building/castlePlan';
import { callClaudeJson } from './apiClient';
import { CONFIG } from '../config';

interface BotState {
  position: { x: number; y: number; z: number };
  health: number;
  food: number;
  inventory: Record<string, number>;
  nearbyPlayers: string[];
  blocksPlaced: number;
  lastActions: string[];
  // Stuck detection
  isStuck?: boolean;
  stuckReason?: string;
  consecutiveFailures?: number;
  positionHistory?: { x: number; y: number; z: number }[];
}

interface AgentDecision {
  reasoning: string;
  action: string;
  parameters: any;
  announcement?: string;
}

export class SurvivalBuilderAgent {
  private name: string;
  private blocksPlaced: number = 0;
  private lastActions: string[] = [];
  private conversationHistory: any[] = [];
  private currentPhase: 'gathering' | 'building' | 'crafting' = 'gathering';
  private resourcesNeeded: Record<string, number> = {};
  
  // Stuck detection
  private positionHistory: { x: number; y: number; z: number; time: number }[] = [];
  private consecutiveFailures: number = 0;
  private lastSuccessfulAction: string = '';
  private stuckCounter: number = 0;

  constructor(name: string) {
    this.name = name;
  }

  async makeDecision(state: BotState): Promise<AgentDecision> {
    const buildSummary = buildCoordinator.getSummaryForAgent(this.name);
    const progress = buildCoordinator.getProgress();
    
    // Update state with our tracking
    state.blocksPlaced = this.blocksPlaced;
    state.lastActions = this.lastActions.slice(-5);

    // Track position history for stuck detection
    this.updatePositionHistory(state.position);
    
    // Detect if we're stuck
    const stuckStatus = this.detectStuck(state);
    state.isStuck = stuckStatus.isStuck;
    state.stuckReason = stuckStatus.reason;
    state.consecutiveFailures = this.consecutiveFailures;

    // Calculate what resources we need
    const neededMaterials = this.calculateNeededMaterials(state.inventory);
    
    const systemPrompt = `You are ${this.name}, a SURVIVAL MODE castle builder in Minecraft. You do NOT have operator powers!

🏰 THE PROJECT:
${CASTLE_INFO.description}
Castle Origin: (${CASTLE_INFO.origin.x}, ${CASTLE_INFO.origin.y}, ${CASTLE_INFO.origin.z})
Size: ${CASTLE_INFO.dimensions.width}x${CASTLE_INFO.dimensions.length} blocks

⚠️ SURVIVAL MODE RULES:
- You must WALK everywhere (no teleporting)
- You must MINE resources before you can build
- You must CRAFT building materials from raw resources
- Blocks are placed FROM YOUR INVENTORY (no /setblock)
- If you run out of materials, you MUST gather more

🌅 SURFACE PRIORITY:
If your Y position is below 50, you are UNDERGROUND and should:
1. First, dig UP to reach the surface (Y >= 60)
2. Use digForward/unstuck/moveRandom to find a way up
3. Look for caves or openings that lead to surface
4. Once on surface, then start gathering resources normally
Getting to the surface is ESSENTIAL - you can't build the castle from underground!

📊 BUILD STATUS:
${buildSummary}

📦 YOUR INVENTORY:
${this.formatInventory(state.inventory)}

🎯 NEEDED MATERIALS:
${this.formatNeededMaterials(neededMaterials)}

🔧 YOUR CAPABILITIES:

GATHERING:
- gatherResources: { "material": "stone_bricks", "count": 32 }
  Mines raw materials for building. Materials: stone, andesite, deepslate, dark_oak_log
- mineBlock: { "blockType": "stone" }
  Mine a single block of a specific type
- findResources: { "blockType": "stone" }
  Search for resources nearby

CRAFTING:
- craftItem: { "item": "stone_bricks", "count": 16 }
  Craft building materials at a crafting table

BUILDING:
- buildBatch: { "count": 10 }
  Place multiple blocks from inventory (only works if you have materials!)
- buildNext: Place one block from inventory

NAVIGATION:
- goToBuildSite: Walk to the castle location
- goToPosition: { "x": 0, "y": 64, "z": 50 }

STATUS:
- checkInventory: See what you have
- getProgress: Check overall progress

UNSTUCK / RECOVERY:
- unstuck: Emergency recovery - jumps, looks around, and moves randomly to escape
- digUp: { "height": 5 } - Dig straight UP to reach surface (USE THIS IF UNDERGROUND!)
- digDown: { "depth": 3 } - Dig straight down to escape or find resources
- digForward: Dig through obstacles in front of you
- moveRandom: Move in a random direction to change position
- jump: Jump to get over obstacles
- lookAround: Scan surroundings to reorient

🚨 CRITICAL - NEVER GET STUCK:
Your #1 priority is to NEVER get stuck. Getting stuck is UNACCEPTABLE.

If ANY of these are true, you MUST use a recovery action IMMEDIATELY:
- Same action failed twice → use "unstuck" or "moveRandom"
- Haven't moved in 2+ decisions → use "digForward" or "moveRandom"
- Repeating same action 3+ times → use "unstuck" then try completely different approach
- Any pathfinding/navigation failure → use "moveRandom" or "digDown"

Recovery priority:
1. "unstuck" - Best all-around recovery
2. "moveRandom" - Change location entirely  
3. "digForward" - Clear path obstacles
4. "digDown" - Escape to underground
5. "jump" - Simple obstacle hop

AFTER recovery, try a COMPLETELY DIFFERENT strategy - not the same thing that got you stuck!

💡 STRATEGY:
1. First, CHECK your inventory
2. If low on building materials → GATHER resources (mine stone, wood)
3. CRAFT building materials (stone → stone_bricks)
4. WALK to build site
5. BUILD using your inventory
6. Repeat!

Priority materials to gather:
- stone (mine underground) → craft to stone_bricks
- andesite → craft to polished_andesite  
- dark_oak_log → craft to dark_oak_planks
- coal + sticks → craft to torches (for underground lighting)

UNDERGROUND LIGHTING:
- When mining underground (y < 50), always try to have torches
- Gather coal_ore when you see it - it's essential for torches
- Craft sticks from wood planks if needed
- The system will auto-place torches when digging, but you need materials!

Respond ONLY with valid JSON:
{
  "reasoning": "Brief explanation based on your inventory and needs",
  "action": "action_name",
  "parameters": { ... },
  "announcement": "Optional chat message"
}`;

    const userMessage = `
CURRENT STATE:
- Position: (${Math.round(state.position.x)}, ${Math.round(state.position.y)}, ${Math.round(state.position.z)})
- Health: ${state.health}/20
- Food: ${state.food}/20
- Blocks placed by you: ${this.blocksPlaced}
- Overall castle progress: ${progress.percentComplete}% (${progress.placedBlocks}/${progress.totalBlocks})
- Distance to castle: ${Math.round(Math.sqrt(
  Math.pow(state.position.x - CASTLE_INFO.origin.x, 2) + 
  Math.pow(state.position.z - CASTLE_INFO.origin.z, 2)
))} blocks
- Nearby players: ${state.nearbyPlayers.join(', ') || 'none'}
- Recent actions: ${this.lastActions.slice(-5).join(' → ') || 'none'}
- Consecutive failures: ${this.consecutiveFailures}

${state.isStuck ? `🚨 STUCK ALERT: ${state.stuckReason}
You need to try a DIFFERENT action! Consider: unstuck, moveRandom, digForward, or digDown.` : ''}

${this.hasEnoughMaterials(state.inventory) 
  ? '✅ You have building materials - can build!' 
  : '⚠️ LOW ON MATERIALS - need to gather resources!'}

${this.detectRepeatingActions() ? `⚠️ WARNING: You're repeating the same actions (${this.lastActions.slice(-3).join(' → ')}). Try something different!` : ''}

What should you do next?`;

    try {
      // Use rate-limited API client
      const decision = await callClaudeJson<AgentDecision>(
        systemPrompt,
        userMessage,
        {
          maxTokens: 500,
          timeoutMs: CONFIG.api.timeoutMs,
          agentName: this.name
        }
      );
      
      // Track the action
      this.lastActions.push(decision.action);
      if (this.lastActions.length > 10) {
        this.lastActions.shift();
      }

      // Log decision
      console.log(`[CLAUDE] ${this.name} Decision: ${decision.action} - ${decision.reasoning}`);

      return decision;
    } catch (error: any) {
      console.error(`[${this.name}] AI Error:`, error.message);
      
      // Fallback decision based on state
      if (!this.hasEnoughMaterials(state.inventory)) {
        return {
          reasoning: 'AI error - defaulting to resource gathering',
          action: 'gatherResources',
          parameters: { material: 'stone', count: 32 }
        };
      }
      
      return {
        reasoning: 'AI error - defaulting to build',
        action: 'buildBatch',
        parameters: { count: 5 }
      };
    }
  }

  private formatInventory(inventory: Record<string, number>): string {
    const buildingMaterials = [
      'stone_bricks', 'deepslate_bricks', 'polished_andesite',
      'chiseled_stone_bricks', 'dark_oak_planks', 'glass_pane',
      'cobblestone', 'stone', 'andesite', 'deepslate'
    ];

    const lines: string[] = [];
    for (const mat of buildingMaterials) {
      if (inventory[mat]) {
        lines.push(`  ${mat}: ${inventory[mat]}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : '  (empty - need to gather resources!)';
  }

  private formatNeededMaterials(needed: Record<string, number>): string {
    const lines: string[] = [];
    for (const [mat, count] of Object.entries(needed)) {
      if (count > 0) {
        lines.push(`  ${mat}: need ${count} more`);
      }
    }
    return lines.length > 0 ? lines.join('\n') : '  ✅ Enough materials for now';
  }

  private calculateNeededMaterials(inventory: Record<string, number>): Record<string, number> {
    // Get the next batch of blocks we'll need
    const needed: Record<string, number> = {};
    const targetBatch = 50; // Look ahead 50 blocks

    // For now, estimate based on castle composition
    const materials = {
      'stone_bricks': 30,
      'polished_andesite': 10,
      'deepslate_bricks': 5,
      'dark_oak_planks': 5
    };

    for (const [mat, target] of Object.entries(materials)) {
      const have = inventory[mat] || 0;
      if (have < target) {
        needed[mat] = target - have;
      }
    }

    return needed;
  }

  private hasEnoughMaterials(inventory: Record<string, number>): boolean {
    const minRequired = 10; // Need at least 10 of any building material
    const buildingMats = ['stone_bricks', 'polished_andesite', 'deepslate_bricks', 'dark_oak_planks', 'cobblestone'];
    
    let total = 0;
    for (const mat of buildingMats) {
      total += inventory[mat] || 0;
    }

    return total >= minRequired;
  }

  recordBlockPlaced(): void {
    this.blocksPlaced++;
  }

  getBlocksPlaced(): number {
    return this.blocksPlaced;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  // Called when an action succeeds
  recordSuccess(action: string): void {
    this.consecutiveFailures = 0;
    this.stuckCounter = 0;
    this.lastSuccessfulAction = action;
  }

  // Called when an action fails
  recordFailure(): void {
    this.consecutiveFailures++;
  }

  // Track position over time for stuck detection
  private updatePositionHistory(position: { x: number; y: number; z: number }): void {
    const now = Date.now();
    this.positionHistory.push({ ...position, time: now });
    
    // Keep only last 30 seconds of history
    const cutoff = now - 30000;
    this.positionHistory = this.positionHistory.filter(p => p.time > cutoff);
  }

  // Detect if the bot is stuck - AGGRESSIVE detection to prevent getting stuck
  private detectStuck(state: BotState): { isStuck: boolean; reason: string } {
    // Check consecutive failures - trigger after just 2 failures
    if (this.consecutiveFailures >= 2) {
      this.stuckCounter++;
      return { 
        isStuck: true, 
        reason: `${this.consecutiveFailures} actions failed! IMMEDIATELY use unstuck or moveRandom!` 
      };
    }

    // Check if position hasn't changed - more aggressive (3 decisions, 10 seconds)
    if (this.positionHistory.length >= 3) {
      const recent = this.positionHistory.slice(-3);
      const first = recent[0];
      const last = recent[recent.length - 1];
      
      const distance = Math.sqrt(
        Math.pow(last.x - first.x, 2) + 
        Math.pow(last.y - first.y, 2) + 
        Math.pow(last.z - first.z, 2)
      );
      
      // If moved less than 1 block in 3+ decisions, definitely stuck
      if (distance < 1 && (last.time - first.time) > 10000) {
        this.stuckCounter++;
        return { 
          isStuck: true, 
          reason: `NO MOVEMENT for ${Math.round((last.time - first.time) / 1000)}s! Use unstuck NOW!` 
        };
      }
    }

    // Check for repeating action patterns
    if (this.detectRepeatingActions()) {
      this.stuckCounter++;
      return { 
        isStuck: true, 
        reason: `Repeating the same actions: ${this.lastActions.slice(-3).join(' → ')}. Need to break the loop!` 
      };
    }

    return { isStuck: false, reason: '' };
  }

  // Detect if we're stuck in an action loop - AGGRESSIVE detection
  private detectRepeatingActions(): boolean {
    if (this.lastActions.length < 3) return false;
    
    const last3 = this.lastActions.slice(-3);
    const last4 = this.lastActions.slice(-4);
    
    // Check if same action repeated just 2+ times (more aggressive)
    const lastAction = last3[last3.length - 1];
    const sameActionCount = last3.filter(a => a === lastAction).length;
    if (sameActionCount >= 2) return true;

    // Check for 2-action loop (A-B-A-B)
    if (last4.length >= 4) {
      if (last4[0] === last4[2] && last4[1] === last4[3]) return true;
    }
    
    // Check for any action appearing 3+ times in last 5 actions
    const last5 = this.lastActions.slice(-5);
    const actionCounts: Record<string, number> = {};
    for (const action of last5) {
      actionCounts[action] = (actionCounts[action] || 0) + 1;
      if (actionCounts[action] >= 3) return true;
    }

    return false;
  }
}
