/**
 * Detailed Structure Templates for Claude_Builder
 * 
 * These are pre-designed, detailed Minecraft structures that can be
 * built instantly in creative mode. Each structure is defined as an
 * array of block positions relative to the build origin.
 */

export interface StructureBlock {
  x: number;
  y: number;
  z: number;
  block: string;
}

export interface DetailedStructure {
  name: string;
  description: string;
  width: number;
  height: number;
  depth: number;
  blocks: StructureBlock[];
}

// ============================================
// MEDIEVAL COTTAGE - Detailed cozy house
// ============================================
export const MEDIEVAL_COTTAGE: DetailedStructure = {
  name: 'Medieval Cottage',
  description: 'A cozy medieval-style cottage with a chimney and garden',
  width: 9,
  height: 8,
  depth: 11,
  blocks: [
    // Foundation
    ...generateFilledLayer(0, 0, 0, 9, 11, 'cobblestone'),
    
    // Floor
    ...generateFilledLayer(1, 1, 1, 7, 9, 'oak_planks'),
    
    // Walls - Layer 1-4
    ...generateHollowBox(0, 1, 0, 9, 4, 11, 'spruce_planks'),
    
    // Corner posts (logs)
    ...generatePillar(0, 1, 0, 5, 'stripped_spruce_log'),
    ...generatePillar(8, 1, 0, 5, 'stripped_spruce_log'),
    ...generatePillar(0, 1, 10, 5, 'stripped_spruce_log'),
    ...generatePillar(8, 1, 10, 5, 'stripped_spruce_log'),
    
    // Windows
    { x: 0, y: 2, z: 3, block: 'glass_pane' },
    { x: 0, y: 3, z: 3, block: 'glass_pane' },
    { x: 0, y: 2, z: 7, block: 'glass_pane' },
    { x: 0, y: 3, z: 7, block: 'glass_pane' },
    { x: 8, y: 2, z: 3, block: 'glass_pane' },
    { x: 8, y: 3, z: 3, block: 'glass_pane' },
    { x: 8, y: 2, z: 7, block: 'glass_pane' },
    { x: 8, y: 3, z: 7, block: 'glass_pane' },
    { x: 4, y: 2, z: 0, block: 'glass_pane' },
    { x: 4, y: 3, z: 0, block: 'glass_pane' },
    
    // Door (back wall)
    { x: 4, y: 1, z: 10, block: 'air' },
    { x: 4, y: 2, z: 10, block: 'air' },
    
    // Roof - A-frame style
    ...generateRoof(0, 5, 0, 9, 11, 'spruce_stairs'),
    
    // Chimney
    ...generatePillar(1, 5, 2, 4, 'brick'),
    { x: 1, y: 9, z: 2, block: 'campfire' },
    
    // Interior - Fireplace
    { x: 1, y: 1, z: 2, block: 'campfire' },
    { x: 1, y: 2, z: 1, block: 'brick' },
    { x: 1, y: 3, z: 1, block: 'brick' },
    
    // Interior - Bed
    { x: 6, y: 1, z: 2, block: 'red_bed' },
    
    // Interior - Crafting/Chest
    { x: 6, y: 1, z: 8, block: 'crafting_table' },
    { x: 7, y: 1, z: 8, block: 'chest' },
    
    // Flower boxes outside
    { x: -1, y: 1, z: 3, block: 'flower_pot' },
    { x: -1, y: 1, z: 7, block: 'flower_pot' },
    { x: 9, y: 1, z: 3, block: 'flower_pot' },
    { x: 9, y: 1, z: 7, block: 'flower_pot' },
  ]
};

// ============================================
// WIZARD TOWER - Tall magical tower
// ============================================
export const WIZARD_TOWER: DetailedStructure = {
  name: 'Wizard Tower',
  description: 'A tall mystical tower with a pointed roof',
  width: 9,
  height: 20,
  depth: 9,
  blocks: [
    // Base platform
    ...generateCircle(4, 0, 4, 5, 'stone_bricks'),
    
    // Tower walls - multiple floors
    ...generateCylinder(4, 1, 4, 4, 12, 'stone_bricks'),
    
    // Floor separators
    ...generateCircle(4, 4, 4, 3, 'oak_planks'),
    ...generateCircle(4, 8, 4, 3, 'oak_planks'),
    
    // Windows on each floor
    { x: 0, y: 2, z: 4, block: 'blue_stained_glass_pane' },
    { x: 8, y: 2, z: 4, block: 'blue_stained_glass_pane' },
    { x: 4, y: 2, z: 0, block: 'blue_stained_glass_pane' },
    { x: 0, y: 6, z: 4, block: 'blue_stained_glass_pane' },
    { x: 8, y: 6, z: 4, block: 'blue_stained_glass_pane' },
    { x: 4, y: 6, z: 0, block: 'blue_stained_glass_pane' },
    { x: 0, y: 10, z: 4, block: 'blue_stained_glass_pane' },
    { x: 8, y: 10, z: 4, block: 'blue_stained_glass_pane' },
    
    // Pointed roof
    ...generateCone(4, 12, 4, 5, 8, 'purple_concrete'),
    
    // Roof tip
    { x: 4, y: 19, z: 4, block: 'lightning_rod' },
    { x: 4, y: 20, z: 4, block: 'end_rod' },
    
    // Entrance
    { x: 4, y: 1, z: 8, block: 'air' },
    { x: 4, y: 2, z: 8, block: 'air' },
    
    // Interior - Enchanting setup
    { x: 4, y: 1, z: 4, block: 'enchanting_table' },
    { x: 3, y: 1, z: 3, block: 'bookshelf' },
    { x: 5, y: 1, z: 3, block: 'bookshelf' },
    { x: 3, y: 1, z: 5, block: 'bookshelf' },
    { x: 5, y: 1, z: 5, block: 'bookshelf' },
    
    // Brewing setup on 2nd floor
    { x: 4, y: 5, z: 4, block: 'brewing_stand' },
    { x: 3, y: 5, z: 4, block: 'cauldron' },
    
    // Ladder access
    ...generatePillar(6, 1, 6, 12, 'ladder'),
  ]
};

// ============================================
// JAPANESE PAGODA - Asian-style temple
// ============================================
export const JAPANESE_PAGODA: DetailedStructure = {
  name: 'Japanese Pagoda',
  description: 'An elegant multi-tiered Japanese pagoda',
  width: 13,
  height: 18,
  depth: 13,
  blocks: [
    // Stone base/foundation
    ...generateFilledLayer(0, 0, 0, 13, 13, 'polished_andesite'),
    ...generateFilledLayer(1, 1, 1, 11, 11, 'polished_andesite'),
    
    // First floor
    ...generateHollowBox(2, 2, 2, 9, 4, 9, 'dark_oak_planks'),
    
    // First roof (overhanging)
    ...generatePagodaRoof(0, 6, 0, 13, 'dark_oak_stairs'),
    
    // Second floor (smaller)
    ...generateHollowBox(3, 7, 3, 7, 3, 7, 'dark_oak_planks'),
    
    // Second roof
    ...generatePagodaRoof(2, 10, 2, 9, 'dark_oak_stairs'),
    
    // Third floor (smallest)
    ...generateHollowBox(4, 11, 4, 5, 3, 5, 'dark_oak_planks'),
    
    // Third roof
    ...generatePagodaRoof(3, 14, 3, 7, 'dark_oak_stairs'),
    
    // Spire
    ...generatePillar(6, 15, 6, 3, 'gold_block'),
    
    // Red accent pillars at corners
    ...generatePillar(2, 2, 2, 4, 'red_concrete'),
    ...generatePillar(10, 2, 2, 4, 'red_concrete'),
    ...generatePillar(2, 2, 10, 4, 'red_concrete'),
    ...generatePillar(10, 2, 10, 4, 'red_concrete'),
    
    // Paper lanterns
    { x: 1, y: 5, z: 6, block: 'lantern' },
    { x: 11, y: 5, z: 6, block: 'lantern' },
    { x: 6, y: 5, z: 1, block: 'lantern' },
    { x: 6, y: 5, z: 11, block: 'lantern' },
    
    // Entrance
    { x: 6, y: 2, z: 2, block: 'air' },
    { x: 6, y: 3, z: 2, block: 'air' },
  ]
};

// ============================================
// MODERN HOUSE - Contemporary architecture
// ============================================
export const MODERN_HOUSE: DetailedStructure = {
  name: 'Modern House',
  description: 'A sleek contemporary house with large windows',
  width: 15,
  height: 7,
  depth: 12,
  blocks: [
    // Foundation
    ...generateFilledLayer(0, 0, 0, 15, 12, 'smooth_quartz'),
    
    // Main walls - white concrete
    ...generateHollowBox(0, 1, 0, 10, 5, 12, 'white_concrete'),
    
    // Extended section (garage/living)
    ...generateHollowBox(10, 1, 2, 5, 4, 8, 'white_concrete'),
    
    // Large glass walls
    ...generateWall(0, 1, 0, 10, 4, 'glass'), // Front
    ...generateWall(0, 1, 0, 12, 4, 'glass', 'z'), // Side
    
    // Flat roof with slight overhang
    ...generateFilledLayer(0, 5, 0, 11, 13, 'smooth_quartz'),
    ...generateFilledLayer(9, 4, 1, 6, 10, 'smooth_quartz'),
    
    // Rooftop details
    { x: 5, y: 6, z: 6, block: 'daylight_detector' },
    
    // Floor (wooden)
    ...generateFilledLayer(1, 1, 1, 9, 11, 'oak_planks'),
    ...generateFilledLayer(11, 1, 3, 3, 6, 'oak_planks'),
    
    // Pool in backyard
    ...generatePool(2, 0, -4, 6, 6),
    
    // Modern furniture
    { x: 3, y: 1, z: 3, block: 'white_bed' },
    { x: 7, y: 1, z: 8, block: 'smoker' },
    { x: 8, y: 1, z: 8, block: 'barrel' },
    { x: 5, y: 1, z: 5, block: 'sea_lantern' }, // Floor lighting
    
    // Entrance
    { x: 5, y: 1, z: 11, block: 'air' },
    { x: 5, y: 2, z: 11, block: 'air' },
  ]
};

// ============================================
// TREEHOUSE - Nature-integrated build
// ============================================
export const TREEHOUSE: DetailedStructure = {
  name: 'Treehouse',
  description: 'A cozy treehouse built around a giant tree',
  width: 11,
  height: 15,
  depth: 11,
  blocks: [
    // Giant tree trunk (center)
    ...generatePillar(5, 0, 5, 15, 'oak_log'),
    ...generatePillar(4, 0, 5, 12, 'oak_log'),
    ...generatePillar(6, 0, 5, 12, 'oak_log'),
    ...generatePillar(5, 0, 4, 12, 'oak_log'),
    ...generatePillar(5, 0, 6, 12, 'oak_log'),
    
    // Tree canopy
    ...generateSphere(5, 12, 5, 5, 'oak_leaves'),
    
    // Platform around tree at height 6
    ...generateFilledLayer(2, 6, 2, 7, 7, 'spruce_planks'),
    // Cut out center for tree
    { x: 4, y: 6, z: 4, block: 'air' },
    { x: 5, y: 6, z: 4, block: 'air' },
    { x: 6, y: 6, z: 4, block: 'air' },
    { x: 4, y: 6, z: 5, block: 'air' },
    { x: 5, y: 6, z: 5, block: 'air' },
    { x: 6, y: 6, z: 5, block: 'air' },
    { x: 4, y: 6, z: 6, block: 'air' },
    { x: 5, y: 6, z: 6, block: 'air' },
    { x: 6, y: 6, z: 6, block: 'air' },
    
    // Railings
    ...generateRailing(2, 7, 2, 7, 7),
    
    // Small cabin on platform
    ...generateHollowBox(2, 7, 2, 4, 3, 4, 'spruce_planks'),
    
    // Cabin roof
    { x: 2, y: 10, z: 2, block: 'spruce_stairs' },
    { x: 3, y: 10, z: 2, block: 'spruce_stairs' },
    { x: 4, y: 10, z: 2, block: 'spruce_stairs' },
    { x: 5, y: 10, z: 2, block: 'spruce_stairs' },
    
    // Ladder to climb up
    ...generatePillar(1, 0, 5, 7, 'ladder'),
    
    // Lanterns
    { x: 2, y: 7, z: 5, block: 'lantern' },
    { x: 8, y: 7, z: 5, block: 'lantern' },
    
    // Rope bridge start
    { x: 8, y: 6, z: 4, block: 'spruce_fence' },
    { x: 8, y: 6, z: 5, block: 'spruce_fence' },
    { x: 8, y: 6, z: 6, block: 'spruce_fence' },
  ]
};

// ============================================
// LIGHTHOUSE - Coastal beacon
// ============================================
export const LIGHTHOUSE: DetailedStructure = {
  name: 'Lighthouse',
  description: 'A tall coastal lighthouse with rotating beacon',
  width: 9,
  height: 22,
  depth: 9,
  blocks: [
    // Rocky base
    ...generateCircle(4, 0, 4, 5, 'cobblestone'),
    ...generateCircle(4, 1, 4, 4, 'cobblestone'),
    
    // Lighthouse tower - white/red striped
    ...generateStripedCylinder(4, 2, 4, 3, 14, ['white_concrete', 'red_concrete']),
    
    // Observation deck floor
    ...generateCircle(4, 16, 4, 4, 'smooth_stone'),
    
    // Observation deck walls (glass)
    ...generateCylinderHollow(4, 17, 4, 4, 3, 'glass'),
    
    // Observation deck roof
    ...generateCircle(4, 20, 4, 5, 'black_concrete'),
    
    // Beacon light
    { x: 4, y: 18, z: 4, block: 'sea_lantern' },
    { x: 3, y: 18, z: 4, block: 'sea_lantern' },
    { x: 5, y: 18, z: 4, block: 'sea_lantern' },
    { x: 4, y: 18, z: 3, block: 'sea_lantern' },
    { x: 4, y: 18, z: 5, block: 'sea_lantern' },
    
    // Roof spike
    { x: 4, y: 21, z: 4, block: 'black_concrete' },
    { x: 4, y: 22, z: 4, block: 'lightning_rod' },
    
    // Door
    { x: 4, y: 2, z: 7, block: 'air' },
    { x: 4, y: 3, z: 7, block: 'air' },
    
    // Interior spiral staircase (simplified)
    ...generateSpiralStairs(4, 2, 4, 14),
    
    // Windows up the tower
    { x: 4, y: 5, z: 7, block: 'glass_pane' },
    { x: 4, y: 8, z: 1, block: 'glass_pane' },
    { x: 7, y: 11, z: 4, block: 'glass_pane' },
    { x: 1, y: 14, z: 4, block: 'glass_pane' },
  ]
};

// ============================================
// HELPER FUNCTIONS FOR GENERATING STRUCTURES
// ============================================

function generateFilledLayer(x: number, y: number, z: number, width: number, depth: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      blocks.push({ x: x + dx, y, z: z + dz, block });
    }
  }
  return blocks;
}

function generateHollowBox(x: number, y: number, z: number, width: number, height: number, depth: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      for (let dz = 0; dz < depth; dz++) {
        // Only place on edges
        if (dx === 0 || dx === width - 1 || dz === 0 || dz === depth - 1) {
          blocks.push({ x: x + dx, y: y + dy, z: z + dz, block });
        }
      }
    }
  }
  return blocks;
}

function generatePillar(x: number, y: number, z: number, height: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dy = 0; dy < height; dy++) {
    blocks.push({ x, y: y + dy, z, block });
  }
  return blocks;
}

function generateCircle(cx: number, y: number, cz: number, radius: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz <= radius * radius) {
        blocks.push({ x: cx + dx, y, z: cz + dz, block });
      }
    }
  }
  return blocks;
}

function generateCylinder(cx: number, y: number, cz: number, radius: number, height: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const dist = dx * dx + dz * dz;
        // Shell only (not filled)
        if (dist <= radius * radius && dist >= (radius - 1) * (radius - 1)) {
          blocks.push({ x: cx + dx, y: y + dy, z: cz + dz, block });
        }
      }
    }
  }
  return blocks;
}

function generateCylinderHollow(cx: number, y: number, cz: number, radius: number, height: number, block: string): StructureBlock[] {
  return generateCylinder(cx, y, cz, radius, height, block);
}

function generateCone(cx: number, y: number, cz: number, radius: number, height: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dy = 0; dy < height; dy++) {
    const currentRadius = Math.ceil(radius * (1 - dy / height));
    for (let dx = -currentRadius; dx <= currentRadius; dx++) {
      for (let dz = -currentRadius; dz <= currentRadius; dz++) {
        if (dx * dx + dz * dz <= currentRadius * currentRadius) {
          blocks.push({ x: cx + dx, y: y + dy, z: cz + dz, block });
        }
      }
    }
  }
  return blocks;
}

function generateSphere(cx: number, cy: number, cz: number, radius: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (dx * dx + dy * dy + dz * dz <= radius * radius) {
          blocks.push({ x: cx + dx, y: cy + dy, z: cz + dz, block });
        }
      }
    }
  }
  return blocks;
}

function generateRoof(x: number, y: number, z: number, width: number, depth: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  const peakHeight = Math.ceil(width / 2);
  
  for (let dy = 0; dy < peakHeight; dy++) {
    for (let dz = 0; dz < depth; dz++) {
      // Left slope
      blocks.push({ x: x + dy, y: y + dy, z: z + dz, block });
      // Right slope
      blocks.push({ x: x + width - 1 - dy, y: y + dy, z: z + dz, block });
    }
  }
  return blocks;
}

function generatePagodaRoof(x: number, y: number, z: number, size: number, block: string): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  
  // Main roof platform with overhangs
  for (let dx = -1; dx <= size; dx++) {
    for (let dz = -1; dz <= size; dz++) {
      blocks.push({ x: x + dx, y, z: z + dz, block: block.replace('_stairs', '_slab') });
    }
  }
  
  // Curved edges (stairs facing outward)
  for (let dx = 0; dx < size; dx++) {
    blocks.push({ x: x + dx, y, z: z - 1, block });
    blocks.push({ x: x + dx, y, z: z + size, block });
  }
  for (let dz = 0; dz < size; dz++) {
    blocks.push({ x: x - 1, y, z: z + dz, block });
    blocks.push({ x: x + size, y, z: z + dz, block });
  }
  
  return blocks;
}

function generateRailing(x: number, y: number, z: number, width: number, depth: number): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  const fence = 'spruce_fence';
  
  for (let dx = 0; dx < width; dx++) {
    blocks.push({ x: x + dx, y, z, block: fence });
    blocks.push({ x: x + dx, y, z: z + depth - 1, block: fence });
  }
  for (let dz = 0; dz < depth; dz++) {
    blocks.push({ x: x, y, z: z + dz, block: fence });
    blocks.push({ x: x + width - 1, y, z: z + dz, block: fence });
  }
  
  return blocks;
}

function generatePool(x: number, y: number, z: number, width: number, depth: number): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  
  // Pool border
  for (let dx = -1; dx <= width; dx++) {
    for (let dz = -1; dz <= depth; dz++) {
      if (dx === -1 || dx === width || dz === -1 || dz === depth) {
        blocks.push({ x: x + dx, y, z: z + dz, block: 'smooth_quartz' });
      }
    }
  }
  
  // Water
  for (let dx = 0; dx < width; dx++) {
    for (let dz = 0; dz < depth; dz++) {
      blocks.push({ x: x + dx, y: y - 1, z: z + dz, block: 'prismarine' });
      blocks.push({ x: x + dx, y, z: z + dz, block: 'water' });
    }
  }
  
  return blocks;
}

function generateWall(x: number, y: number, z: number, length: number, height: number, block: string, axis: 'x' | 'z' = 'x'): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  for (let dl = 0; dl < length; dl++) {
    for (let dy = 0; dy < height; dy++) {
      if (axis === 'x') {
        blocks.push({ x: x + dl, y: y + dy, z, block });
      } else {
        blocks.push({ x, y: y + dy, z: z + dl, block });
      }
    }
  }
  return blocks;
}

function generateStripedCylinder(cx: number, y: number, cz: number, radius: number, height: number, blocks: string[]): StructureBlock[] {
  const result: StructureBlock[] = [];
  const stripeHeight = 3;
  
  for (let dy = 0; dy < height; dy++) {
    const blockIndex = Math.floor(dy / stripeHeight) % blocks.length;
    const block = blocks[blockIndex];
    
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const dist = dx * dx + dz * dz;
        if (dist <= radius * radius && dist >= (radius - 1) * (radius - 1)) {
          result.push({ x: cx + dx, y: y + dy, z: cz + dz, block });
        }
      }
    }
  }
  return result;
}

function generateSpiralStairs(cx: number, y: number, cz: number, height: number): StructureBlock[] {
  const blocks: StructureBlock[] = [];
  const offsets = [
    { dx: 1, dz: 0 },
    { dx: 1, dz: 1 },
    { dx: 0, dz: 1 },
    { dx: -1, dz: 1 },
    { dx: -1, dz: 0 },
    { dx: -1, dz: -1 },
    { dx: 0, dz: -1 },
    { dx: 1, dz: -1 },
  ];
  
  for (let dy = 0; dy < height; dy++) {
    const offset = offsets[dy % 8];
    blocks.push({ x: cx + offset.dx, y: y + dy, z: cz + offset.dz, block: 'oak_stairs' });
  }
  
  return blocks;
}

// ============================================
// STRUCTURE REGISTRY - Easy lookup by name
// ============================================
export const DETAILED_STRUCTURES: Record<string, DetailedStructure> = {
  'cottage': MEDIEVAL_COTTAGE,
  'medieval_cottage': MEDIEVAL_COTTAGE,
  'house': MEDIEVAL_COTTAGE,
  'cabin': MEDIEVAL_COTTAGE,
  
  'wizard_tower': WIZARD_TOWER,
  'magic_tower': WIZARD_TOWER,
  'mage_tower': WIZARD_TOWER,
  
  'pagoda': JAPANESE_PAGODA,
  'japanese': JAPANESE_PAGODA,
  'temple': JAPANESE_PAGODA,
  'asian': JAPANESE_PAGODA,
  
  'modern': MODERN_HOUSE,
  'modern_house': MODERN_HOUSE,
  'contemporary': MODERN_HOUSE,
  'mansion': MODERN_HOUSE,
  
  'treehouse': TREEHOUSE,
  'tree_house': TREEHOUSE,
  'forest_house': TREEHOUSE,
  
  'lighthouse': LIGHTHOUSE,
  'beacon': LIGHTHOUSE,
};

/**
 * Find the best matching structure for a request
 */
export function findStructure(request: string): DetailedStructure | null {
  const lowerRequest = request.toLowerCase();
  
  for (const [key, structure] of Object.entries(DETAILED_STRUCTURES)) {
    if (lowerRequest.includes(key.replace('_', ' ')) || lowerRequest.includes(key)) {
      return structure;
    }
  }
  
  return null;
}
