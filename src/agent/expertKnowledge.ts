/**
 * Expert Minecraft Knowledge Base
 * 
 * Contains crafting dependencies, survival heuristics, and mining optimization
 * strategies that make agents play like expert Minecraft players.
 */

// ============ CRAFTING DEPENDENCY TREES ============

export interface CraftingRecipe {
  result: string;
  count: number;
  ingredients: { item: string; count: number }[];
  requiresCraftingTable: boolean;
  requiresFurnace?: boolean;
}

export const CRAFTING_RECIPES: Record<string, CraftingRecipe> = {
  // Basic wood processing
  'oak_planks': { result: 'oak_planks', count: 4, ingredients: [{ item: 'oak_log', count: 1 }], requiresCraftingTable: false },
  'birch_planks': { result: 'birch_planks', count: 4, ingredients: [{ item: 'birch_log', count: 1 }], requiresCraftingTable: false },
  'spruce_planks': { result: 'spruce_planks', count: 4, ingredients: [{ item: 'spruce_log', count: 1 }], requiresCraftingTable: false },
  'stick': { result: 'stick', count: 4, ingredients: [{ item: 'planks', count: 2 }], requiresCraftingTable: false },
  
  // Essential tools
  'crafting_table': { result: 'crafting_table', count: 1, ingredients: [{ item: 'planks', count: 4 }], requiresCraftingTable: false },
  'wooden_pickaxe': { result: 'wooden_pickaxe', count: 1, ingredients: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'wooden_axe': { result: 'wooden_axe', count: 1, ingredients: [{ item: 'planks', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'wooden_sword': { result: 'wooden_sword', count: 1, ingredients: [{ item: 'planks', count: 2 }, { item: 'stick', count: 1 }], requiresCraftingTable: true },
  'wooden_shovel': { result: 'wooden_shovel', count: 1, ingredients: [{ item: 'planks', count: 1 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  
  // Stone tools
  'stone_pickaxe': { result: 'stone_pickaxe', count: 1, ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'stone_axe': { result: 'stone_axe', count: 1, ingredients: [{ item: 'cobblestone', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'stone_sword': { result: 'stone_sword', count: 1, ingredients: [{ item: 'cobblestone', count: 2 }, { item: 'stick', count: 1 }], requiresCraftingTable: true },
  'stone_shovel': { result: 'stone_shovel', count: 1, ingredients: [{ item: 'cobblestone', count: 1 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  
  // Iron tools
  'iron_pickaxe': { result: 'iron_pickaxe', count: 1, ingredients: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'iron_axe': { result: 'iron_axe', count: 1, ingredients: [{ item: 'iron_ingot', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'iron_sword': { result: 'iron_sword', count: 1, ingredients: [{ item: 'iron_ingot', count: 2 }, { item: 'stick', count: 1 }], requiresCraftingTable: true },
  'iron_shovel': { result: 'iron_shovel', count: 1, ingredients: [{ item: 'iron_ingot', count: 1 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  
  // Diamond tools
  'diamond_pickaxe': { result: 'diamond_pickaxe', count: 1, ingredients: [{ item: 'diamond', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'diamond_axe': { result: 'diamond_axe', count: 1, ingredients: [{ item: 'diamond', count: 3 }, { item: 'stick', count: 2 }], requiresCraftingTable: true },
  'diamond_sword': { result: 'diamond_sword', count: 1, ingredients: [{ item: 'diamond', count: 2 }, { item: 'stick', count: 1 }], requiresCraftingTable: true },
  
  // Armor
  'iron_helmet': { result: 'iron_helmet', count: 1, ingredients: [{ item: 'iron_ingot', count: 5 }], requiresCraftingTable: true },
  'iron_chestplate': { result: 'iron_chestplate', count: 1, ingredients: [{ item: 'iron_ingot', count: 8 }], requiresCraftingTable: true },
  'iron_leggings': { result: 'iron_leggings', count: 1, ingredients: [{ item: 'iron_ingot', count: 7 }], requiresCraftingTable: true },
  'iron_boots': { result: 'iron_boots', count: 1, ingredients: [{ item: 'iron_ingot', count: 4 }], requiresCraftingTable: true },
  'diamond_helmet': { result: 'diamond_helmet', count: 1, ingredients: [{ item: 'diamond', count: 5 }], requiresCraftingTable: true },
  'diamond_chestplate': { result: 'diamond_chestplate', count: 1, ingredients: [{ item: 'diamond', count: 8 }], requiresCraftingTable: true },
  'diamond_leggings': { result: 'diamond_leggings', count: 1, ingredients: [{ item: 'diamond', count: 7 }], requiresCraftingTable: true },
  'diamond_boots': { result: 'diamond_boots', count: 1, ingredients: [{ item: 'diamond', count: 4 }], requiresCraftingTable: true },
  
  // Utility items
  'torch': { result: 'torch', count: 4, ingredients: [{ item: 'coal', count: 1 }, { item: 'stick', count: 1 }], requiresCraftingTable: false },
  'furnace': { result: 'furnace', count: 1, ingredients: [{ item: 'cobblestone', count: 8 }], requiresCraftingTable: true },
  'chest': { result: 'chest', count: 1, ingredients: [{ item: 'planks', count: 8 }], requiresCraftingTable: true },
  'bed': { result: 'bed', count: 1, ingredients: [{ item: 'planks', count: 3 }, { item: 'wool', count: 3 }], requiresCraftingTable: true },
  'shield': { result: 'shield', count: 1, ingredients: [{ item: 'planks', count: 6 }, { item: 'iron_ingot', count: 1 }], requiresCraftingTable: true },
  'bucket': { result: 'bucket', count: 1, ingredients: [{ item: 'iron_ingot', count: 3 }], requiresCraftingTable: true },
  'compass': { result: 'compass', count: 1, ingredients: [{ item: 'iron_ingot', count: 4 }, { item: 'redstone', count: 1 }], requiresCraftingTable: true },
  
  // Food
  'bread': { result: 'bread', count: 1, ingredients: [{ item: 'wheat', count: 3 }], requiresCraftingTable: true },
  
  // Smelting (requiresFurnace)
  'iron_ingot': { result: 'iron_ingot', count: 1, ingredients: [{ item: 'raw_iron', count: 1 }], requiresCraftingTable: false, requiresFurnace: true },
  'gold_ingot': { result: 'gold_ingot', count: 1, ingredients: [{ item: 'raw_gold', count: 1 }], requiresCraftingTable: false, requiresFurnace: true },
  'charcoal': { result: 'charcoal', count: 1, ingredients: [{ item: 'oak_log', count: 1 }], requiresCraftingTable: false, requiresFurnace: true },
};

// Planks can come from any log type
const PLANK_SOURCES = ['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log', 'acacia_log', 'mangrove_log', 'cherry_log'];

/**
 * Get the full dependency chain for crafting an item
 * Returns list of items needed in order (what to get first)
 */
export function getCraftingDependencies(targetItem: string, inventory: Record<string, number> = {}): string[] {
  const dependencies: string[] = [];
  const visited = new Set<string>();
  
  function resolve(item: string, needed: number): void {
    if (visited.has(item)) return;
    
    // Check if we already have enough
    const have = inventory[item] || 0;
    if (have >= needed) return;
    
    visited.add(item);
    
    // Check if this is a raw material (no recipe)
    const recipe = CRAFTING_RECIPES[item];
    if (!recipe) {
      // This is a raw material that must be gathered
      dependencies.push(item);
      return;
    }
    
    // Resolve dependencies first
    for (const ingredient of recipe.ingredients) {
      const ingredientNeeded = Math.ceil((needed - have) / recipe.count) * ingredient.count;
      resolve(ingredient.item, ingredientNeeded);
    }
    
    // Then add this item
    dependencies.push(item);
  }
  
  resolve(targetItem, 1);
  return dependencies;
}

/**
 * Get what needs to be gathered to craft an item
 */
export function getRequiredRawMaterials(targetItem: string, inventory: Record<string, number> = {}): { item: string; count: number }[] {
  const materials: Record<string, number> = {};
  
  function resolve(item: string, needed: number): void {
    const have = inventory[item] || 0;
    if (have >= needed) return;
    
    const recipe = CRAFTING_RECIPES[item];
    if (!recipe) {
      // Raw material
      materials[item] = (materials[item] || 0) + (needed - have);
      return;
    }
    
    const craftCount = Math.ceil((needed - have) / recipe.count);
    for (const ingredient of recipe.ingredients) {
      resolve(ingredient.item, craftCount * ingredient.count);
    }
  }
  
  resolve(targetItem, 1);
  return Object.entries(materials).map(([item, count]) => ({ item, count }));
}

// ============ SURVIVAL HEURISTICS ============

export interface SurvivalState {
  health: number;
  food: number;
  hasWeapon: boolean;
  hasArmor: boolean;
  hasShelter: boolean;
  timeOfDay: 'day' | 'night' | 'sunrise' | 'sunset';
  lightLevel: number;
  nearbyHostiles: number;
  yLevel: number;
  hasTorches: boolean;
}

export interface SurvivalPriority {
  action: string;
  reason: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Get survival priorities based on current state
 * Returns actions in order of urgency
 */
export function getSurvivalPriorities(state: SurvivalState): SurvivalPriority[] {
  const priorities: SurvivalPriority[] = [];
  
  // CRITICAL - Immediate survival threats
  if (state.health <= 4) {
    priorities.push({
      action: 'flee',
      reason: 'Health critically low! Retreat to safety immediately.',
      urgency: 'critical'
    });
  }
  
  if (state.nearbyHostiles > 2 && state.health < 10) {
    priorities.push({
      action: 'flee',
      reason: 'Too many hostiles and low health. Run!',
      urgency: 'critical'
    });
  }
  
  // HIGH - Urgent needs
  if (state.food <= 3) {
    priorities.push({
      action: 'eatFood',
      reason: 'Starving! Need food immediately to prevent health loss.',
      urgency: 'high'
    });
  }
  
  if (state.health <= 8 && state.food > 17) {
    priorities.push({
      action: 'wait',
      reason: 'Low health but full food - wait to regenerate.',
      urgency: 'high'
    });
  }
  
  if (state.timeOfDay === 'night' && !state.hasShelter && state.lightLevel < 7) {
    priorities.push({
      action: 'findShelter',
      reason: 'Night time with no shelter - dangerous! Find or build shelter.',
      urgency: 'high'
    });
  }
  
  if (state.lightLevel < 4 && !state.hasTorches && state.yLevel < 50) {
    priorities.push({
      action: 'craftTorches',
      reason: 'Too dark underground - mobs will spawn! Need torches.',
      urgency: 'high'
    });
  }
  
  // MEDIUM - Important but not urgent
  if (state.food <= 10) {
    priorities.push({
      action: 'huntFood',
      reason: 'Food getting low, should hunt or farm soon.',
      urgency: 'medium'
    });
  }
  
  if (!state.hasWeapon && state.timeOfDay === 'sunset') {
    priorities.push({
      action: 'craftWeapon',
      reason: 'Night approaching with no weapon - craft a sword!',
      urgency: 'medium'
    });
  }
  
  if (state.health < 14 && state.nearbyHostiles === 0) {
    priorities.push({
      action: 'eatAndHeal',
      reason: 'Health not full, safe to heal up now.',
      urgency: 'medium'
    });
  }
  
  // LOW - Nice to have
  if (!state.hasArmor && state.yLevel < 40) {
    priorities.push({
      action: 'craftArmor',
      reason: 'Deep underground without armor - consider crafting some.',
      urgency: 'low'
    });
  }
  
  return priorities.sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });
}

/**
 * Expert rules that should always be followed
 */
export const SURVIVAL_RULES = {
  // Never do these
  never: [
    'Never dig straight down - you could fall into lava or a cave',
    'Never dig straight up - gravel, sand, or lava could fall on you',
    'Never fight multiple creepers at once',
    'Never swim in lava without fire resistance',
    'Never attack endermen unless prepared with a 2-block ceiling shelter',
    'Never enter the Nether without at least iron armor and tools',
  ],
  
  // Always do these
  always: [
    'Always carry food (at least 16)',
    'Always carry torches when mining (at least 32)',
    'Always have a weapon equipped when exploring',
    'Always light up areas to prevent mob spawns',
    'Always have an escape route planned',
    'Always carry a water bucket (saves from fall damage and lava)',
  ],
  
  // Context-specific
  whenMining: [
    'Place torches on the left wall going in, right wall coming out',
    'Mine at Y=-59 for diamonds (deepslate level)',
    'Use branch mining: tunnels 2 high, 3 blocks apart',
    'Listen for lava, water, or mob sounds',
    'Carry a water bucket to convert lava to obsidian',
  ],
  
  whenFighting: [
    'Circle-strafe left against skeletons (they aim where you were)',
    'Hit creepers and back up immediately (they need proximity to explode)',
    'Use shields to block arrows and creeper blasts',
    'Attack spiders during day when they are passive',
    'Do not look at enderman faces - attack their legs',
  ],
  
  whenBuilding: [
    'Light up the area first to prevent mob spawns',
    'Build at least 3 blocks high walls to stop spiders',
    'Add overhangs to prevent spider climbing',
    'Always have multiple exits',
    'Keep valuables in chests, not on you',
  ],
};

// ============ MINING OPTIMIZATION ============

export interface MiningStrategy {
  name: string;
  targetY: number;
  pattern: string;
  targets: string[];
  description: string;
}

export const MINING_STRATEGIES: Record<string, MiningStrategy> = {
  diamonds: {
    name: 'Diamond Mining',
    targetY: -59,
    pattern: 'branch',
    targets: ['diamond_ore', 'deepslate_diamond_ore'],
    description: 'Branch mine at Y=-59 (deepslate level). Dig main tunnel, then branches every 3 blocks. Diamonds spawn -64 to 16, most common at -59.'
  },
  iron: {
    name: 'Iron Mining',
    targetY: 16,
    pattern: 'branch',
    targets: ['iron_ore', 'deepslate_iron_ore'],
    description: 'Iron is most common at Y=16. Also abundant in mountains. Strip mine or explore caves.'
  },
  gold: {
    name: 'Gold Mining',
    targetY: -16,
    pattern: 'branch',
    targets: ['gold_ore', 'deepslate_gold_ore'],
    description: 'Gold spawns -64 to 32, most common at -16. Also very common in badlands biome at any Y level.'
  },
  coal: {
    name: 'Coal Mining',
    targetY: 96,
    pattern: 'surface',
    targets: ['coal_ore'],
    description: 'Coal is most common at Y=96 (mountains). Also easy to find in cave walls and cliff faces.'
  },
  copper: {
    name: 'Copper Mining',
    targetY: 48,
    pattern: 'cave',
    targets: ['copper_ore', 'deepslate_copper_ore'],
    description: 'Copper most common at Y=48. Large veins in dripstone caves.'
  },
  redstone: {
    name: 'Redstone Mining',
    targetY: -59,
    pattern: 'branch',
    targets: ['redstone_ore', 'deepslate_redstone_ore'],
    description: 'Redstone spawns below Y=16, most common at -59. Use iron pickaxe or better.'
  },
  lapis: {
    name: 'Lapis Mining',
    targetY: 0,
    pattern: 'branch',
    targets: ['lapis_ore', 'deepslate_lapis_ore'],
    description: 'Lapis most common around Y=0. Required for enchanting.'
  },
  emerald: {
    name: 'Emerald Mining',
    targetY: 236,
    pattern: 'mountain',
    targets: ['emerald_ore'],
    description: 'Emeralds ONLY spawn in mountain biomes. Most common at Y=236. Very rare - trading with villagers is often easier.'
  },
  ancientDebris: {
    name: 'Ancient Debris Mining',
    targetY: 15,
    pattern: 'bed',
    targets: ['ancient_debris'],
    description: 'Ancient debris spawns in the Nether at Y=8-22, most common at Y=15. Use beds or TNT to blast mine efficiently.'
  }
};

/**
 * Get the optimal Y level for mining a specific ore
 */
export function getOptimalMiningLevel(ore: string): number {
  const oreToStrategy: Record<string, string> = {
    'diamond': 'diamonds',
    'diamond_ore': 'diamonds',
    'deepslate_diamond_ore': 'diamonds',
    'iron': 'iron',
    'iron_ore': 'iron',
    'deepslate_iron_ore': 'iron',
    'raw_iron': 'iron',
    'gold': 'gold',
    'gold_ore': 'gold',
    'deepslate_gold_ore': 'gold',
    'coal': 'coal',
    'coal_ore': 'coal',
    'redstone': 'redstone',
    'redstone_ore': 'redstone',
    'lapis': 'lapis',
    'lapis_ore': 'lapis',
    'emerald': 'emerald',
    'emerald_ore': 'emerald',
    'ancient_debris': 'ancientDebris',
    'netherite': 'ancientDebris',
  };
  
  const strategyKey = oreToStrategy[ore.toLowerCase()];
  if (strategyKey && MINING_STRATEGIES[strategyKey]) {
    return MINING_STRATEGIES[strategyKey].targetY;
  }
  return -59; // Default to diamond level
}

/**
 * Get mining advice based on current Y level and goals
 */
export function getMiningAdvice(currentY: number, targetOre: string): string {
  const optimalY = getOptimalMiningLevel(targetOre);
  const strategy = Object.values(MINING_STRATEGIES).find(s => 
    s.targets.some(t => t.includes(targetOre.toLowerCase().replace('deepslate_', '')))
  );
  
  if (!strategy) {
    return `Mine at Y=-59 for best results.`;
  }
  
  let advice = strategy.description;
  
  if (currentY > optimalY + 20) {
    advice += ` You are at Y=${Math.round(currentY)}, dig DOWN to Y=${optimalY}.`;
  } else if (currentY < optimalY - 20) {
    advice += ` You are at Y=${Math.round(currentY)}, go UP to Y=${optimalY}.`;
  } else if (Math.abs(currentY - optimalY) <= 5) {
    advice += ` You are at the PERFECT level (Y=${Math.round(currentY)})! Start branch mining.`;
  } else {
    advice += ` You are close (Y=${Math.round(currentY)}), optimal is Y=${optimalY}.`;
  }
  
  return advice;
}

// ============ TOOL REQUIREMENTS ============

export const TOOL_REQUIREMENTS: Record<string, string> = {
  // Minimum pickaxe needed to mine each block
  'stone': 'wooden_pickaxe',
  'cobblestone': 'wooden_pickaxe',
  'coal_ore': 'wooden_pickaxe',
  'iron_ore': 'stone_pickaxe',
  'deepslate_iron_ore': 'stone_pickaxe',
  'copper_ore': 'stone_pickaxe',
  'lapis_ore': 'stone_pickaxe',
  'gold_ore': 'iron_pickaxe',
  'deepslate_gold_ore': 'iron_pickaxe',
  'redstone_ore': 'iron_pickaxe',
  'deepslate_redstone_ore': 'iron_pickaxe',
  'diamond_ore': 'iron_pickaxe',
  'deepslate_diamond_ore': 'iron_pickaxe',
  'emerald_ore': 'iron_pickaxe',
  'obsidian': 'diamond_pickaxe',
  'ancient_debris': 'diamond_pickaxe',
};

const PICKAXE_TIER: Record<string, number> = {
  'wooden_pickaxe': 1,
  'stone_pickaxe': 2,
  'iron_pickaxe': 3,
  'diamond_pickaxe': 4,
  'netherite_pickaxe': 5,
};

/**
 * Check if a tool can mine a specific block
 */
export function canMineBlock(block: string, tool: string | null): boolean {
  const required = TOOL_REQUIREMENTS[block];
  if (!required) return true; // No requirement means any tool works
  
  if (!tool) return false;
  
  const requiredTier = PICKAXE_TIER[required] || 0;
  const hasTier = PICKAXE_TIER[tool] || 0;
  
  return hasTier >= requiredTier;
}

/**
 * Get the tool needed to mine a specific ore
 */
export function getRequiredTool(ore: string): string | null {
  return TOOL_REQUIREMENTS[ore] || null;
}

// ============ PROGRESSION GUIDE ============

export interface ProgressionStep {
  name: string;
  requirements: string[];
  unlocks: string[];
  tips: string[];
}

export const PROGRESSION_STEPS: ProgressionStep[] = [
  {
    name: 'First Day Survival',
    requirements: [],
    unlocks: ['wooden_tools', 'shelter'],
    tips: [
      'Punch trees immediately to get wood',
      'Craft wooden pickaxe within first 2 minutes',
      'Mine 16+ cobblestone for stone tools and furnace',
      'Find or kill sheep for wool (bed)',
      'Build or dig a shelter before sunset',
    ]
  },
  {
    name: 'Stone Age',
    requirements: ['wooden_pickaxe', 'shelter'],
    unlocks: ['stone_tools', 'furnace', 'torches'],
    tips: [
      'Craft stone tools - they are 2x more durable',
      'Build a furnace for smelting',
      'Mine coal for torches (or make charcoal from wood)',
      'Light up your base to prevent mob spawns',
    ]
  },
  {
    name: 'Iron Age',
    requirements: ['stone_pickaxe', 'furnace'],
    unlocks: ['iron_tools', 'iron_armor', 'shield', 'bucket'],
    tips: [
      'Iron is most common at Y=16',
      'You need 24 iron for full armor, 9 for tools',
      'Craft a bucket - it saves lives (water for lava/falls)',
      'Craft a shield for combat safety',
    ]
  },
  {
    name: 'Diamond Age',
    requirements: ['iron_pickaxe'],
    unlocks: ['diamond_tools', 'enchanting', 'nether_portal'],
    tips: [
      'Mine at Y=-59 for best diamond rates',
      'Need 3 diamonds for pickaxe, 5 for enchanting table',
      'Use Fortune enchantment on diamond ore when possible',
      'Consider getting diamonds before entering Nether',
    ]
  },
  {
    name: 'Nether',
    requirements: ['diamond_pickaxe', 'obsidian', 'flint_and_steel'],
    unlocks: ['blaze_rods', 'nether_wart', 'ancient_debris'],
    tips: [
      'Bring cobblestone, not wood - ghasts can ignite wood',
      'Beds EXPLODE in the Nether - use for mining debris',
      'Find a fortress for blaze rods (needed for End)',
      'Bring gold armor piece - piglins won\'t attack',
    ]
  },
];

/**
 * Get the current progression stage based on inventory
 */
export function getCurrentProgressionStage(inventory: Record<string, number>): string {
  const has = (item: string) => (inventory[item] || 0) > 0;
  const hasAny = (items: string[]) => items.some(has);
  
  if (hasAny(['diamond_pickaxe', 'diamond_sword', 'diamond'])) return 'Diamond Age';
  if (hasAny(['iron_pickaxe', 'iron_sword', 'iron_ingot'])) return 'Iron Age';
  if (hasAny(['stone_pickaxe', 'stone_sword', 'furnace'])) return 'Stone Age';
  if (hasAny(['wooden_pickaxe', 'crafting_table'])) return 'First Day Survival';
  return 'Just Spawned';
}

/**
 * Get next recommended steps based on current progress
 */
export function getNextSteps(inventory: Record<string, number>): string[] {
  const stage = getCurrentProgressionStage(inventory);
  const has = (item: string) => (inventory[item] || 0) > 0;
  
  switch (stage) {
    case 'Just Spawned':
      return [
        'Punch a tree to get wood logs',
        'Craft planks from logs',
        'Craft sticks from planks',
        'Craft a crafting table',
        'Craft a wooden pickaxe'
      ];
    
    case 'First Day Survival':
      if (!has('furnace')) {
        return [
          'Mine 8 cobblestone',
          'Craft a furnace',
          'Find coal or make charcoal',
          'Craft torches'
        ];
      }
      if (!has('stone_pickaxe')) {
        return [
          'Craft stone tools (pickaxe, sword, axe)',
          'Mine more stone for building'
        ];
      }
      return ['Build or dig a shelter', 'Light it up with torches', 'Find sheep for a bed'];
    
    case 'Stone Age':
      if (!has('iron_ingot') && !has('iron_pickaxe')) {
        return [
          'Find a cave or dig down',
          'Mine iron ore (need stone pickaxe)',
          'Smelt iron in furnace',
          'Craft iron pickaxe'
        ];
      }
      return [
        'Craft iron armor (24 ingots for full set)',
        'Craft shield (6 planks + 1 iron)',
        'Craft bucket (3 iron ingots)'
      ];
    
    case 'Iron Age':
      return [
        'Dig to Y=-59 for diamonds',
        'Branch mine: main tunnel with branches every 3 blocks',
        'Need 3 diamonds for pickaxe',
        'Craft diamond pickaxe when found'
      ];
    
    case 'Diamond Age':
      return [
        'Craft enchanting table (4 obsidian, 2 diamonds, 1 book)',
        'Build bookshelves for better enchants (15 for max)',
        'Mine obsidian for Nether portal (10 blocks minimum)',
        'Prepare for Nether: bring cobblestone, food, gold armor piece'
      ];
    
    default:
      return ['Continue exploring and building!'];
  }
}

// ============ COMBAT STRATEGIES ============

export interface CombatStrategy {
  enemy: string;
  danger: 'low' | 'medium' | 'high' | 'extreme';
  baseHealth: number;
  attacks: string;
  strategy: string;
  avoid: string[];
  tips: string[];
}

export const COMBAT_STRATEGIES: Record<string, CombatStrategy> = {
  'zombie': {
    enemy: 'Zombie',
    danger: 'low',
    baseHealth: 20,
    attacks: 'Melee (2-4 damage)',
    strategy: 'Circle strafe and hit. Back up while attacking. Easy 1v1, dangerous in groups.',
    avoid: ['fighting multiple zombies', 'letting them corner you'],
    tips: ['They burn in sunlight', 'Can break wooden doors on Hard', 'Baby zombies are faster']
  },
  'skeleton': {
    enemy: 'Skeleton',
    danger: 'medium',
    baseHealth: 20,
    attacks: 'Bow (1-5 damage)',
    strategy: 'Rush and close distance quickly. Use shield to block arrows. Strafe unpredictably.',
    avoid: ['standing still at range', 'fighting in open areas'],
    tips: ['They burn in sunlight', 'Hide behind blocks between shots', 'Sprint + jump attack works well']
  },
  'creeper': {
    enemy: 'Creeper',
    danger: 'high',
    baseHealth: 20,
    attacks: 'Explosion (up to 49 damage!)',
    strategy: 'Hit and back up immediately. Sprint attack, retreat. Listen for hissing sound.',
    avoid: ['letting them get close', 'fighting near builds', 'not watching your back'],
    tips: ['They have 1.5s fuse time', 'Cats and ocelots scare them', 'Charged creepers from lightning are deadly']
  },
  'spider': {
    enemy: 'Spider',
    danger: 'low',
    baseHealth: 16,
    attacks: 'Melee leap (2-3 damage)',
    strategy: 'Simple melee combat. Watch for their jump attack. Neutral in daylight.',
    avoid: ['tight spaces where they can climb above you'],
    tips: ['Can climb walls', 'Neutral during day', 'Cave spiders are poisonous and smaller']
  },
  'enderman': {
    enemy: 'Enderman',
    danger: 'high',
    baseHealth: 40,
    attacks: 'Melee (4-10 damage)',
    strategy: 'DO NOT look at their head! If aggro, trap under 2-block ceiling and attack feet.',
    avoid: ['looking at them', 'fighting in open spaces', 'fighting near water'],
    tips: ['Water hurts them', 'Cannot fit in 2-block spaces', 'Wearing pumpkin prevents aggro']
  },
  'witch': {
    enemy: 'Witch',
    danger: 'high',
    baseHealth: 26,
    attacks: 'Splash potions (poison, slowness, weakness, harming)',
    strategy: 'Rush quickly and burst down. They drink healing potions so kill fast.',
    avoid: ['ranged combat', 'letting them drink potions'],
    tips: ['Drop potions on death', 'Heal themselves with potions', 'Close combat is best']
  },
  'pillager': {
    enemy: 'Pillager',
    danger: 'medium',
    baseHealth: 24,
    attacks: 'Crossbow (3-5 damage)',
    strategy: 'Similar to skeleton. Use cover, close distance. Killing captain gives Bad Omen.',
    avoid: ['being in crossbow range', 'attacking captains near villages'],
    tips: ['Patrol in groups', 'Captains have banners', 'Can trigger raids']
  }
};

/**
 * Get combat advice for a specific mob type
 */
export function getCombatAdvice(mobType: string): string {
  const strategy = COMBAT_STRATEGIES[mobType.toLowerCase()];
  if (!strategy) {
    return 'Unknown mob - approach with caution, keep distance, observe behavior first.';
  }
  return `${strategy.enemy} (${strategy.danger} danger): ${strategy.strategy}`;
}

// ============ FARMING KNOWLEDGE ============

export interface CropInfo {
  crop: string;
  growthTime: string;
  yieldPerHarvest: string;
  foodValue: number;
  requirements: string[];
  tips: string[];
}

export const FARMING_KNOWLEDGE: Record<string, CropInfo> = {
  'wheat': {
    crop: 'Wheat',
    growthTime: '~8 stages, 5-35 min depending on light',
    yieldPerHarvest: '0-3 seeds + 1 wheat',
    foodValue: 5, // as bread
    requirements: ['Hydrated farmland', 'Light level 9+'],
    tips: ['Makes bread (3 wheat)', 'Grows faster with hydration', 'Bone meal speeds growth']
  },
  'carrot': {
    crop: 'Carrot',
    growthTime: '~8 stages, similar to wheat',
    yieldPerHarvest: '1-5 carrots',
    foodValue: 3,
    requirements: ['Hydrated farmland', 'Light level 9+'],
    tips: ['No seed needed', 'Good for breeding pigs', 'Replant 1 to continue']
  },
  'potato': {
    crop: 'Potato',
    growthTime: '~8 stages, similar to wheat',
    yieldPerHarvest: '1-5 potatoes',
    foodValue: 5, // baked
    requirements: ['Hydrated farmland', 'Light level 9+'],
    tips: ['Bake in furnace for 5 hunger', 'May drop poisonous potato', 'Very efficient food source']
  },
  'beetroot': {
    crop: 'Beetroot',
    growthTime: '~4 stages, faster than wheat',
    yieldPerHarvest: '1 beetroot + 0-3 seeds',
    foodValue: 1,
    requirements: ['Hydrated farmland', 'Light level 9+'],
    tips: ['Makes red dye', 'Beetroot soup = 6 hunger', 'Needs 6 beetroot for soup']
  },
  'melon': {
    crop: 'Melon',
    growthTime: 'Stem grows in 10-30 min, then spawns melons',
    yieldPerHarvest: '3-7 slices per melon',
    foodValue: 2,
    requirements: ['Hydrated farmland', 'Adjacent dirt/grass for melon'],
    tips: ['Infinite harvest from one stem', 'Great for trading with villagers', 'Slices stack to 64']
  },
  'pumpkin': {
    crop: 'Pumpkin',
    growthTime: 'Same as melon',
    yieldPerHarvest: '1 pumpkin (can make 4 seeds)',
    foodValue: 8, // as pie
    requirements: ['Hydrated farmland', 'Adjacent dirt/grass for pumpkin'],
    tips: ['Wear to avoid Enderman aggro', 'Makes Jack o\'Lanterns', 'Iron golems need pumpkin']
  }
};

/**
 * Get efficient farm layout for a crop
 */
export function getFarmingAdvice(crop: string): string {
  const info = FARMING_KNOWLEDGE[crop.toLowerCase()];
  if (!info) {
    return 'Unknown crop - check if seeds are plantable on farmland.';
  }
  return `${info.crop}: ${info.requirements.join(', ')}. Tips: ${info.tips.join('; ')}`;
}

// ============ ENCHANTING KNOWLEDGE ============

export interface EnchantmentInfo {
  name: string;
  maxLevel: number;
  applicableTo: string[];
  effect: string;
  priority: number; // 1-10 how valuable
}

export const ENCHANTING_PRIORITIES: EnchantmentInfo[] = [
  { name: 'Mending', maxLevel: 1, applicableTo: ['all'], effect: 'XP repairs item', priority: 10 },
  { name: 'Unbreaking', maxLevel: 3, applicableTo: ['all'], effect: 'Increases durability', priority: 9 },
  { name: 'Fortune', maxLevel: 3, applicableTo: ['pickaxe'], effect: 'More drops from ores', priority: 9 },
  { name: 'Efficiency', maxLevel: 5, applicableTo: ['pickaxe', 'axe', 'shovel'], effect: 'Faster mining', priority: 8 },
  { name: 'Protection', maxLevel: 4, applicableTo: ['armor'], effect: 'Reduces all damage', priority: 8 },
  { name: 'Sharpness', maxLevel: 5, applicableTo: ['sword', 'axe'], effect: 'More melee damage', priority: 8 },
  { name: 'Looting', maxLevel: 3, applicableTo: ['sword'], effect: 'More mob drops', priority: 7 },
  { name: 'Feather Falling', maxLevel: 4, applicableTo: ['boots'], effect: 'Reduces fall damage', priority: 7 },
  { name: 'Silk Touch', maxLevel: 1, applicableTo: ['pickaxe', 'axe', 'shovel'], effect: 'Mine blocks as-is', priority: 6 },
  { name: 'Fire Aspect', maxLevel: 2, applicableTo: ['sword'], effect: 'Sets mobs on fire', priority: 5 }
];

/**
 * Get enchanting priorities for a tool type
 */
export function getEnchantingAdvice(toolType: string): string {
  const applicable = ENCHANTING_PRIORITIES.filter(e => 
    e.applicableTo.includes(toolType.toLowerCase()) || e.applicableTo.includes('all')
  ).sort((a, b) => b.priority - a.priority);
  
  if (applicable.length === 0) {
    return 'No enchantments known for this item type.';
  }
  
  return `Best enchants for ${toolType}: ${applicable.slice(0, 3).map(e => `${e.name} ${e.maxLevel}`).join(', ')}`;
}

// ============ FORMATTING FOR PROMPTS ============

/**
 * Get a formatted expert knowledge section for agent prompts
 */
export function getExpertKnowledgePrompt(
  inventory: Record<string, number>,
  yLevel: number,
  health: number,
  food: number,
  timeOfDay: 'day' | 'night' | 'sunrise' | 'sunset',
  lightLevel: number,
  nearbyHostiles: number
): string {
  const stage = getCurrentProgressionStage(inventory);
  const nextSteps = getNextSteps(inventory);
  
  // Check survival state
  const survivalState: SurvivalState = {
    health,
    food,
    hasWeapon: ['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword'].some(w => inventory[w] > 0),
    hasArmor: ['iron_helmet', 'iron_chestplate', 'diamond_chestplate'].some(a => inventory[a] > 0),
    hasShelter: false, // Can't easily detect
    timeOfDay,
    lightLevel,
    nearbyHostiles,
    yLevel,
    hasTorches: (inventory['torch'] || 0) > 0
  };
  
  const priorities = getSurvivalPriorities(survivalState);
  const criticalPriorities = priorities.filter(p => p.urgency === 'critical' || p.urgency === 'high');
  
  let prompt = `
🎓 EXPERT MINECRAFT KNOWLEDGE:

📊 Current Stage: ${stage}
📍 Y-Level: ${Math.round(yLevel)}
`;
  
  // Add urgent warnings
  if (criticalPriorities.length > 0) {
    prompt += `
⚠️ URGENT PRIORITIES:
${criticalPriorities.map(p => `• [${p.urgency.toUpperCase()}] ${p.reason}`).join('\n')}
`;
  }
  
  // Add next steps
  prompt += `
📋 RECOMMENDED NEXT STEPS:
${nextSteps.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
  
  // Add mining advice if underground
  if (yLevel < 60) {
    const miningAdvice = getMiningAdvice(yLevel, 'diamond');
    prompt += `
⛏️ MINING TIP: ${miningAdvice}
`;
  }
  
  // Add key survival rules
  prompt += `
🛡️ SURVIVAL RULES:
• Always keep food above 6 (you stop regenerating at 6)
• Place torches every 12 blocks to prevent mob spawns
• Never dig straight down or up
• Flee if health drops below 5
`;
  
  return prompt;
}
