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
// MEDIEVAL CASTLE - Fortified stronghold
// ============================================
export const MEDIEVAL_CASTLE: DetailedStructure = {
  name: 'Medieval Castle',
  description: 'A fortified castle with towers, battlements, and great hall',
  width: 25,
  height: 18,
  depth: 25,
  blocks: [
    // Stone foundation
    ...generateFilledLayer(0, 0, 0, 25, 25, 'cobblestone'),
    ...generateFilledLayer(1, 1, 1, 23, 23, 'stone_bricks'),
    
    // Outer walls (thick, 2 blocks)
    ...generateHollowBox(0, 2, 0, 25, 10, 25, 'stone_bricks'),
    ...generateHollowBox(1, 2, 1, 23, 10, 23, 'stone_bricks'),
    
    // Corner towers (4 towers)
    ...generateCylinder(2, 2, 2, 3, 14, 'stone_bricks'),
    ...generateCylinder(22, 2, 2, 3, 14, 'stone_bricks'),
    ...generateCylinder(2, 2, 22, 3, 14, 'stone_bricks'),
    ...generateCylinder(22, 2, 22, 3, 14, 'stone_bricks'),
    
    // Tower roofs (conical)
    ...generateCone(2, 16, 2, 4, 4, 'dark_oak_stairs'),
    ...generateCone(22, 16, 2, 4, 4, 'dark_oak_stairs'),
    ...generateCone(2, 16, 22, 4, 4, 'dark_oak_stairs'),
    ...generateCone(22, 16, 22, 4, 4, 'dark_oak_stairs'),
    
    // Battlements on walls
    { x: 3, y: 12, z: 0, block: 'stone_bricks' },
    { x: 5, y: 12, z: 0, block: 'stone_bricks' },
    { x: 7, y: 12, z: 0, block: 'stone_bricks' },
    { x: 9, y: 12, z: 0, block: 'stone_bricks' },
    { x: 11, y: 12, z: 0, block: 'stone_bricks' },
    { x: 13, y: 12, z: 0, block: 'stone_bricks' },
    { x: 15, y: 12, z: 0, block: 'stone_bricks' },
    { x: 17, y: 12, z: 0, block: 'stone_bricks' },
    { x: 19, y: 12, z: 0, block: 'stone_bricks' },
    { x: 21, y: 12, z: 0, block: 'stone_bricks' },
    
    // Main gatehouse
    ...generateHollowBox(10, 2, 24, 5, 8, 3, 'stone_bricks'),
    { x: 12, y: 2, z: 24, block: 'air' },
    { x: 12, y: 3, z: 24, block: 'air' },
    { x: 12, y: 4, z: 24, block: 'air' },
    { x: 12, y: 5, z: 24, block: 'dark_oak_trapdoor' },
    
    // Great hall (center)
    ...generateHollowBox(8, 2, 8, 9, 6, 9, 'stripped_oak_log'),
    ...generateRoof(8, 8, 8, 9, 9, 'dark_oak_stairs'),
    
    // Throne room interior
    { x: 12, y: 2, z: 10, block: 'gold_block' }, // Throne base
    { x: 12, y: 3, z: 10, block: 'oak_stairs' }, // Throne
    { x: 11, y: 3, z: 10, block: 'oak_slab' },
    { x: 13, y: 3, z: 10, block: 'oak_slab' },
    { x: 12, y: 4, z: 9, block: 'orange_banner' }, // Royal banner
    
    // Chandeliers
    { x: 10, y: 6, z: 12, block: 'chain' },
    { x: 10, y: 5, z: 12, block: 'lantern' },
    { x: 14, y: 6, z: 12, block: 'chain' },
    { x: 14, y: 5, z: 12, block: 'lantern' },
    
    // Carpets in great hall
    { x: 12, y: 2, z: 12, block: 'red_carpet' },
    { x: 12, y: 2, z: 13, block: 'red_carpet' },
    { x: 12, y: 2, z: 14, block: 'red_carpet' },
    { x: 12, y: 2, z: 15, block: 'red_carpet' },
    
    // Wall torches
    { x: 1, y: 5, z: 5, block: 'wall_torch' },
    { x: 1, y: 5, z: 12, block: 'wall_torch' },
    { x: 1, y: 5, z: 19, block: 'wall_torch' },
    { x: 23, y: 5, z: 5, block: 'wall_torch' },
    { x: 23, y: 5, z: 12, block: 'wall_torch' },
    { x: 23, y: 5, z: 19, block: 'wall_torch' },
    
    // Armory displays
    { x: 4, y: 3, z: 4, block: 'armor_stand' },
    { x: 20, y: 3, z: 4, block: 'armor_stand' },
    
    // Well in courtyard
    ...generateCylinder(18, 2, 18, 2, 2, 'cobblestone'),
    { x: 18, y: 2, z: 18, block: 'water' },
    { x: 18, y: 4, z: 18, block: 'chain' },
    { x: 18, y: 5, z: 18, block: 'dark_oak_fence' },
    
    // Flags on towers
    { x: 2, y: 20, z: 2, block: 'red_banner' },
    { x: 22, y: 20, z: 2, block: 'red_banner' },
    { x: 2, y: 20, z: 22, block: 'red_banner' },
    { x: 22, y: 20, z: 22, block: 'red_banner' },
  ]
};

// ============================================
// RUSTIC BARN - Countryside farm building
// ============================================
export const RUSTIC_BARN: DetailedStructure = {
  name: 'Rustic Barn',
  description: 'A large countryside barn with hay storage and animal pens',
  width: 16,
  height: 12,
  depth: 20,
  blocks: [
    // Foundation
    ...generateFilledLayer(0, 0, 0, 16, 20, 'cobblestone'),
    
    // Main structure - red wood exterior
    ...generateHollowBox(0, 1, 0, 16, 7, 20, 'red_terracotta'),
    
    // Support beams
    ...generatePillar(0, 1, 0, 7, 'stripped_oak_log'),
    ...generatePillar(15, 1, 0, 7, 'stripped_oak_log'),
    ...generatePillar(0, 1, 19, 7, 'stripped_oak_log'),
    ...generatePillar(15, 1, 19, 7, 'stripped_oak_log'),
    ...generatePillar(7, 1, 0, 10, 'stripped_oak_log'),
    ...generatePillar(8, 1, 0, 10, 'stripped_oak_log'),
    ...generatePillar(7, 1, 19, 10, 'stripped_oak_log'),
    ...generatePillar(8, 1, 19, 10, 'stripped_oak_log'),
    
    // A-frame roof
    ...generateRoof(0, 8, 0, 16, 20, 'oak_stairs'),
    // Roof peak cap
    ...generateFilledLayer(7, 11, 0, 2, 20, 'oak_planks'),
    
    // Large double doors (front)
    { x: 7, y: 1, z: 0, block: 'air' },
    { x: 8, y: 1, z: 0, block: 'air' },
    { x: 7, y: 2, z: 0, block: 'air' },
    { x: 8, y: 2, z: 0, block: 'air' },
    { x: 7, y: 3, z: 0, block: 'air' },
    { x: 8, y: 3, z: 0, block: 'air' },
    { x: 7, y: 4, z: 0, block: 'air' },
    { x: 8, y: 4, z: 0, block: 'air' },
    
    // Hay loft floor
    ...generateFilledLayer(1, 5, 1, 14, 18, 'oak_planks'),
    
    // Hay bales (ground floor)
    { x: 2, y: 1, z: 2, block: 'hay_block' },
    { x: 3, y: 1, z: 2, block: 'hay_block' },
    { x: 2, y: 2, z: 2, block: 'hay_block' },
    { x: 2, y: 1, z: 3, block: 'hay_block' },
    
    // Hay bales (loft)
    { x: 2, y: 6, z: 4, block: 'hay_block' },
    { x: 3, y: 6, z: 4, block: 'hay_block' },
    { x: 4, y: 6, z: 4, block: 'hay_block' },
    { x: 2, y: 6, z: 5, block: 'hay_block' },
    { x: 3, y: 6, z: 5, block: 'hay_block' },
    { x: 2, y: 7, z: 4, block: 'hay_block' },
    { x: 3, y: 7, z: 4, block: 'hay_block' },
    
    // Animal pens (fenced areas)
    { x: 2, y: 1, z: 10, block: 'oak_fence' },
    { x: 3, y: 1, z: 10, block: 'oak_fence' },
    { x: 4, y: 1, z: 10, block: 'oak_fence_gate' },
    { x: 5, y: 1, z: 10, block: 'oak_fence' },
    { x: 5, y: 1, z: 11, block: 'oak_fence' },
    { x: 5, y: 1, z: 12, block: 'oak_fence' },
    { x: 5, y: 1, z: 13, block: 'oak_fence' },
    { x: 5, y: 1, z: 14, block: 'oak_fence' },
    
    // Second pen
    { x: 10, y: 1, z: 10, block: 'oak_fence' },
    { x: 11, y: 1, z: 10, block: 'oak_fence' },
    { x: 12, y: 1, z: 10, block: 'oak_fence_gate' },
    { x: 13, y: 1, z: 10, block: 'oak_fence' },
    { x: 13, y: 1, z: 11, block: 'oak_fence' },
    { x: 13, y: 1, z: 12, block: 'oak_fence' },
    { x: 13, y: 1, z: 13, block: 'oak_fence' },
    { x: 13, y: 1, z: 14, block: 'oak_fence' },
    
    // Water trough
    { x: 3, y: 1, z: 12, block: 'cauldron' },
    { x: 11, y: 1, z: 12, block: 'cauldron' },
    
    // Feed storage
    { x: 12, y: 1, z: 2, block: 'barrel' },
    { x: 13, y: 1, z: 2, block: 'barrel' },
    { x: 12, y: 2, z: 2, block: 'barrel' },
    
    // Tools on wall
    { x: 14, y: 3, z: 1, block: 'tripwire_hook' },
    { x: 1, y: 3, z: 1, block: 'tripwire_hook' },
    
    // Lanterns
    { x: 7, y: 4, z: 5, block: 'lantern' },
    { x: 8, y: 4, z: 15, block: 'lantern' },
    { x: 7, y: 8, z: 10, block: 'lantern' }, // Loft
    
    // Windows on sides
    { x: 0, y: 3, z: 5, block: 'glass_pane' },
    { x: 0, y: 3, z: 10, block: 'glass_pane' },
    { x: 0, y: 3, z: 15, block: 'glass_pane' },
    { x: 15, y: 3, z: 5, block: 'glass_pane' },
    { x: 15, y: 3, z: 10, block: 'glass_pane' },
    { x: 15, y: 3, z: 15, block: 'glass_pane' },
    
    // Hay loft opening
    { x: 7, y: 7, z: 0, block: 'air' },
    { x: 8, y: 7, z: 0, block: 'air' },
    
    // Ladder to loft
    { x: 1, y: 1, z: 18, block: 'ladder' },
    { x: 1, y: 2, z: 18, block: 'ladder' },
    { x: 1, y: 3, z: 18, block: 'ladder' },
    { x: 1, y: 4, z: 18, block: 'ladder' },
    
    // Weathervane
    { x: 7, y: 12, z: 10, block: 'lightning_rod' },
  ]
};

// ============================================
// STONE CHAPEL - Religious building
// ============================================
export const STONE_CHAPEL: DetailedStructure = {
  name: 'Stone Chapel',
  description: 'An ornate stone chapel with stained glass and bell tower',
  width: 12,
  height: 16,
  depth: 18,
  blocks: [
    // Foundation
    ...generateFilledLayer(0, 0, 0, 12, 18, 'stone_bricks'),
    
    // Main nave walls
    ...generateHollowBox(0, 1, 0, 12, 8, 14, 'stone_bricks'),
    
    // Nave roof (pitched)
    ...generateRoof(0, 9, 0, 12, 14, 'dark_oak_stairs'),
    
    // Bell tower (back)
    ...generateHollowBox(4, 1, 14, 4, 14, 4, 'stone_bricks'),
    
    // Bell tower roof (pyramid)
    ...generateCone(6, 15, 16, 3, 3, 'dark_oak_stairs'),
    
    // Bell
    { x: 5, y: 12, z: 15, block: 'chain' },
    { x: 5, y: 11, z: 15, block: 'bell' },
    { x: 6, y: 12, z: 15, block: 'chain' },
    { x: 6, y: 11, z: 15, block: 'bell' },
    
    // Tower windows (arched)
    { x: 4, y: 11, z: 15, block: 'air' },
    { x: 4, y: 12, z: 15, block: 'air' },
    { x: 7, y: 11, z: 15, block: 'air' },
    { x: 7, y: 12, z: 15, block: 'air' },
    { x: 5, y: 11, z: 14, block: 'air' },
    { x: 5, y: 12, z: 14, block: 'air' },
    { x: 6, y: 11, z: 14, block: 'air' },
    { x: 6, y: 12, z: 14, block: 'air' },
    
    // Main entrance (double door with arch)
    { x: 5, y: 1, z: 0, block: 'air' },
    { x: 6, y: 1, z: 0, block: 'air' },
    { x: 5, y: 2, z: 0, block: 'air' },
    { x: 6, y: 2, z: 0, block: 'air' },
    { x: 5, y: 3, z: 0, block: 'air' },
    { x: 6, y: 3, z: 0, block: 'air' },
    { x: 5, y: 4, z: 0, block: 'stone_brick_stairs' }, // Arch
    { x: 6, y: 4, z: 0, block: 'stone_brick_stairs' },
    
    // Stained glass windows (sides)
    { x: 0, y: 3, z: 3, block: 'red_stained_glass_pane' },
    { x: 0, y: 4, z: 3, block: 'orange_stained_glass_pane' },
    { x: 0, y: 5, z: 3, block: 'yellow_stained_glass_pane' },
    { x: 0, y: 3, z: 7, block: 'blue_stained_glass_pane' },
    { x: 0, y: 4, z: 7, block: 'purple_stained_glass_pane' },
    { x: 0, y: 5, z: 7, block: 'blue_stained_glass_pane' },
    { x: 0, y: 3, z: 11, block: 'green_stained_glass_pane' },
    { x: 0, y: 4, z: 11, block: 'lime_stained_glass_pane' },
    { x: 0, y: 5, z: 11, block: 'green_stained_glass_pane' },
    
    { x: 11, y: 3, z: 3, block: 'red_stained_glass_pane' },
    { x: 11, y: 4, z: 3, block: 'orange_stained_glass_pane' },
    { x: 11, y: 5, z: 3, block: 'yellow_stained_glass_pane' },
    { x: 11, y: 3, z: 7, block: 'blue_stained_glass_pane' },
    { x: 11, y: 4, z: 7, block: 'purple_stained_glass_pane' },
    { x: 11, y: 5, z: 7, block: 'blue_stained_glass_pane' },
    { x: 11, y: 3, z: 11, block: 'green_stained_glass_pane' },
    { x: 11, y: 4, z: 11, block: 'lime_stained_glass_pane' },
    { x: 11, y: 5, z: 11, block: 'green_stained_glass_pane' },
    
    // Rose window (front)
    { x: 5, y: 6, z: 0, block: 'red_stained_glass_pane' },
    { x: 6, y: 6, z: 0, block: 'red_stained_glass_pane' },
    { x: 5, y: 7, z: 0, block: 'red_stained_glass_pane' },
    { x: 6, y: 7, z: 0, block: 'red_stained_glass_pane' },
    
    // Altar area
    { x: 5, y: 1, z: 12, block: 'polished_andesite' },
    { x: 6, y: 1, z: 12, block: 'polished_andesite' },
    { x: 5, y: 2, z: 12, block: 'white_carpet' },
    { x: 6, y: 2, z: 12, block: 'white_carpet' },
    
    // Cross behind altar
    { x: 5, y: 4, z: 13, block: 'gold_block' },
    { x: 6, y: 4, z: 13, block: 'gold_block' },
    { x: 5, y: 5, z: 13, block: 'gold_block' },
    { x: 6, y: 5, z: 13, block: 'gold_block' },
    { x: 5, y: 6, z: 13, block: 'gold_block' },
    { x: 6, y: 6, z: 13, block: 'gold_block' },
    { x: 4, y: 5, z: 13, block: 'gold_block' },
    { x: 7, y: 5, z: 13, block: 'gold_block' },
    
    // Pews (benches)
    { x: 3, y: 1, z: 3, block: 'oak_stairs' },
    { x: 3, y: 1, z: 5, block: 'oak_stairs' },
    { x: 3, y: 1, z: 7, block: 'oak_stairs' },
    { x: 3, y: 1, z: 9, block: 'oak_stairs' },
    { x: 8, y: 1, z: 3, block: 'oak_stairs' },
    { x: 8, y: 1, z: 5, block: 'oak_stairs' },
    { x: 8, y: 1, z: 7, block: 'oak_stairs' },
    { x: 8, y: 1, z: 9, block: 'oak_stairs' },
    
    // Center aisle carpet
    { x: 5, y: 1, z: 2, block: 'red_carpet' },
    { x: 6, y: 1, z: 2, block: 'red_carpet' },
    { x: 5, y: 1, z: 4, block: 'red_carpet' },
    { x: 6, y: 1, z: 4, block: 'red_carpet' },
    { x: 5, y: 1, z: 6, block: 'red_carpet' },
    { x: 6, y: 1, z: 6, block: 'red_carpet' },
    { x: 5, y: 1, z: 8, block: 'red_carpet' },
    { x: 6, y: 1, z: 8, block: 'red_carpet' },
    { x: 5, y: 1, z: 10, block: 'red_carpet' },
    { x: 6, y: 1, z: 10, block: 'red_carpet' },
    
    // Candles
    { x: 4, y: 2, z: 12, block: 'candle' },
    { x: 7, y: 2, z: 12, block: 'candle' },
    { x: 2, y: 1, z: 2, block: 'candle' },
    { x: 9, y: 1, z: 2, block: 'candle' },
    
    // Chandelier
    { x: 5, y: 7, z: 7, block: 'chain' },
    { x: 5, y: 6, z: 7, block: 'lantern' },
    { x: 6, y: 7, z: 7, block: 'chain' },
    { x: 6, y: 6, z: 7, block: 'lantern' },
    
    // Steps to entrance
    { x: 4, y: 0, z: -1, block: 'stone_brick_stairs' },
    { x: 5, y: 0, z: -1, block: 'stone_brick_stairs' },
    { x: 6, y: 0, z: -1, block: 'stone_brick_stairs' },
    { x: 7, y: 0, z: -1, block: 'stone_brick_stairs' },
  ]
};

// ============================================
// MARKET STALL - Colorful merchant booth
// ============================================
export const MARKET_STALL: DetailedStructure = {
  name: 'Market Stall',
  description: 'A colorful market stall with awning and goods display',
  width: 7,
  height: 5,
  depth: 5,
  blocks: [
    // Base platform
    ...generateFilledLayer(0, 0, 0, 7, 5, 'oak_planks'),
    
    // Support posts
    ...generatePillar(0, 1, 0, 4, 'stripped_oak_log'),
    ...generatePillar(6, 1, 0, 4, 'stripped_oak_log'),
    ...generatePillar(0, 1, 4, 4, 'stripped_oak_log'),
    ...generatePillar(6, 1, 4, 4, 'stripped_oak_log'),
    
    // Counter/display
    { x: 1, y: 1, z: 0, block: 'oak_stairs' },
    { x: 2, y: 1, z: 0, block: 'oak_stairs' },
    { x: 3, y: 1, z: 0, block: 'oak_stairs' },
    { x: 4, y: 1, z: 0, block: 'oak_stairs' },
    { x: 5, y: 1, z: 0, block: 'oak_stairs' },
    
    // Awning (striped wool)
    { x: 0, y: 4, z: -1, block: 'red_wool' },
    { x: 1, y: 4, z: -1, block: 'white_wool' },
    { x: 2, y: 4, z: -1, block: 'red_wool' },
    { x: 3, y: 4, z: -1, block: 'white_wool' },
    { x: 4, y: 4, z: -1, block: 'red_wool' },
    { x: 5, y: 4, z: -1, block: 'white_wool' },
    { x: 6, y: 4, z: -1, block: 'red_wool' },
    
    { x: 0, y: 4, z: 0, block: 'red_wool' },
    { x: 1, y: 4, z: 0, block: 'white_wool' },
    { x: 2, y: 4, z: 0, block: 'red_wool' },
    { x: 3, y: 4, z: 0, block: 'white_wool' },
    { x: 4, y: 4, z: 0, block: 'red_wool' },
    { x: 5, y: 4, z: 0, block: 'white_wool' },
    { x: 6, y: 4, z: 0, block: 'red_wool' },
    
    { x: 0, y: 5, z: 1, block: 'red_wool' },
    { x: 1, y: 5, z: 1, block: 'white_wool' },
    { x: 2, y: 5, z: 1, block: 'red_wool' },
    { x: 3, y: 5, z: 1, block: 'white_wool' },
    { x: 4, y: 5, z: 1, block: 'red_wool' },
    { x: 5, y: 5, z: 1, block: 'white_wool' },
    { x: 6, y: 5, z: 1, block: 'red_wool' },
    
    { x: 0, y: 5, z: 2, block: 'red_wool' },
    { x: 1, y: 5, z: 2, block: 'white_wool' },
    { x: 2, y: 5, z: 2, block: 'red_wool' },
    { x: 3, y: 5, z: 2, block: 'white_wool' },
    { x: 4, y: 5, z: 2, block: 'red_wool' },
    { x: 5, y: 5, z: 2, block: 'white_wool' },
    { x: 6, y: 5, z: 2, block: 'red_wool' },
    
    // Back wall display
    { x: 1, y: 1, z: 4, block: 'barrel' },
    { x: 2, y: 1, z: 4, block: 'barrel' },
    { x: 4, y: 1, z: 4, block: 'barrel' },
    { x: 5, y: 1, z: 4, block: 'barrel' },
    { x: 1, y: 2, z: 4, block: 'flower_pot' },
    { x: 5, y: 2, z: 4, block: 'flower_pot' },
    
    // Goods on display
    { x: 2, y: 2, z: 0, block: 'melon' },
    { x: 3, y: 2, z: 0, block: 'pumpkin' },
    { x: 4, y: 2, z: 0, block: 'melon' },
    
    // Hanging items
    { x: 3, y: 3, z: 1, block: 'lantern' },
    
    // Small crates
    { x: 1, y: 1, z: 2, block: 'chest' },
    { x: 5, y: 1, z: 2, block: 'chest' },
    
    // Sign (shop name)
    { x: 3, y: 3, z: -1, block: 'oak_sign' },
  ]
};

// ============================================
// WINDMILL - Grain processing structure
// ============================================
export const WINDMILL: DetailedStructure = {
  name: 'Windmill',
  description: 'A traditional windmill with sails and grinding floor',
  width: 11,
  height: 18,
  depth: 11,
  blocks: [
    // Stone base
    ...generateCircle(5, 0, 5, 5, 'cobblestone'),
    ...generateCircle(5, 1, 5, 5, 'cobblestone'),
    
    // Main tower (tapered cylinder)
    ...generateCylinder(5, 2, 5, 4, 4, 'white_terracotta'),
    ...generateCylinder(5, 6, 5, 4, 4, 'white_terracotta'),
    ...generateCylinder(5, 10, 5, 3, 4, 'white_terracotta'),
    
    // Cone roof
    ...generateCone(5, 14, 5, 4, 4, 'dark_oak_stairs'),
    
    // Door
    { x: 5, y: 2, z: 9, block: 'air' },
    { x: 5, y: 3, z: 9, block: 'air' },
    
    // Windows
    { x: 5, y: 6, z: 9, block: 'glass_pane' },
    { x: 1, y: 8, z: 5, block: 'glass_pane' },
    { x: 9, y: 8, z: 5, block: 'glass_pane' },
    { x: 5, y: 11, z: 1, block: 'glass_pane' },
    
    // Sail hub (front of windmill)
    { x: 5, y: 10, z: 0, block: 'stripped_oak_log' },
    { x: 5, y: 11, z: 0, block: 'stripped_oak_log' },
    
    // Sails (cross pattern) - using fences and wool
    // Upper sail
    { x: 5, y: 12, z: 0, block: 'oak_fence' },
    { x: 5, y: 13, z: 0, block: 'oak_fence' },
    { x: 5, y: 14, z: 0, block: 'oak_fence' },
    { x: 5, y: 15, z: 0, block: 'oak_fence' },
    { x: 4, y: 13, z: 0, block: 'white_wool' },
    { x: 4, y: 14, z: 0, block: 'white_wool' },
    { x: 6, y: 13, z: 0, block: 'white_wool' },
    { x: 6, y: 14, z: 0, block: 'white_wool' },
    
    // Lower sail
    { x: 5, y: 9, z: 0, block: 'oak_fence' },
    { x: 5, y: 8, z: 0, block: 'oak_fence' },
    { x: 5, y: 7, z: 0, block: 'oak_fence' },
    { x: 5, y: 6, z: 0, block: 'oak_fence' },
    { x: 4, y: 8, z: 0, block: 'white_wool' },
    { x: 4, y: 7, z: 0, block: 'white_wool' },
    { x: 6, y: 8, z: 0, block: 'white_wool' },
    { x: 6, y: 7, z: 0, block: 'white_wool' },
    
    // Left sail
    { x: 4, y: 10, z: 0, block: 'oak_fence' },
    { x: 3, y: 10, z: 0, block: 'oak_fence' },
    { x: 2, y: 10, z: 0, block: 'oak_fence' },
    { x: 1, y: 10, z: 0, block: 'oak_fence' },
    { x: 3, y: 9, z: 0, block: 'white_wool' },
    { x: 2, y: 9, z: 0, block: 'white_wool' },
    { x: 3, y: 11, z: 0, block: 'white_wool' },
    { x: 2, y: 11, z: 0, block: 'white_wool' },
    
    // Right sail
    { x: 6, y: 10, z: 0, block: 'oak_fence' },
    { x: 7, y: 10, z: 0, block: 'oak_fence' },
    { x: 8, y: 10, z: 0, block: 'oak_fence' },
    { x: 9, y: 10, z: 0, block: 'oak_fence' },
    { x: 7, y: 9, z: 0, block: 'white_wool' },
    { x: 8, y: 9, z: 0, block: 'white_wool' },
    { x: 7, y: 11, z: 0, block: 'white_wool' },
    { x: 8, y: 11, z: 0, block: 'white_wool' },
    
    // Interior - Grinding floor
    ...generateFilledLayer(3, 2, 3, 5, 5, 'oak_planks'),
    { x: 5, y: 2, z: 5, block: 'grindstone' },
    
    // Flour storage
    { x: 3, y: 2, z: 3, block: 'barrel' },
    { x: 7, y: 2, z: 3, block: 'barrel' },
    { x: 3, y: 3, z: 3, block: 'barrel' },
    
    // Wheat storage
    { x: 3, y: 2, z: 7, block: 'hay_block' },
    { x: 4, y: 2, z: 7, block: 'hay_block' },
    { x: 3, y: 3, z: 7, block: 'hay_block' },
    
    // Interior floors
    ...generateCircle(5, 5, 5, 3, 'oak_planks'),
    ...generateCircle(5, 9, 5, 2, 'oak_planks'),
    
    // Ladders
    { x: 7, y: 2, z: 5, block: 'ladder' },
    { x: 7, y: 3, z: 5, block: 'ladder' },
    { x: 7, y: 4, z: 5, block: 'ladder' },
    { x: 6, y: 5, z: 5, block: 'ladder' },
    { x: 6, y: 6, z: 5, block: 'ladder' },
    { x: 6, y: 7, z: 5, block: 'ladder' },
    { x: 6, y: 8, z: 5, block: 'ladder' },
    
    // Lanterns
    { x: 5, y: 4, z: 5, block: 'lantern' },
    { x: 5, y: 8, z: 5, block: 'lantern' },
    
    // Path to entrance
    { x: 5, y: 0, z: 10, block: 'gravel' },
    { x: 5, y: 0, z: 11, block: 'gravel' },
    { x: 5, y: 0, z: 12, block: 'gravel' },
  ]
};

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
  
  // New detailed structures
  'castle': MEDIEVAL_CASTLE,
  'medieval_castle': MEDIEVAL_CASTLE,
  'fortress': MEDIEVAL_CASTLE,
  'stronghold': MEDIEVAL_CASTLE,
  'keep': MEDIEVAL_CASTLE,
  
  'barn': RUSTIC_BARN,
  'rustic_barn': RUSTIC_BARN,
  'farm_barn': RUSTIC_BARN,
  'stable': RUSTIC_BARN,
  
  'chapel': STONE_CHAPEL,
  'church': STONE_CHAPEL,
  'stone_chapel': STONE_CHAPEL,
  'cathedral': STONE_CHAPEL,
  
  'market': MARKET_STALL,
  'market_stall': MARKET_STALL,
  'shop': MARKET_STALL,
  'stall': MARKET_STALL,
  'vendor': MARKET_STALL,
  
  'windmill': WINDMILL,
  'mill': WINDMILL,
  'grain_mill': WINDMILL,
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
