/**
 * Colosseum Blueprint - A massive Roman Colosseum for the Agent PvP Arena
 * 
 * Architecture (inspired by the Roman Colosseum):
 * - Circular design with 3 exterior tiers of arched openings
 * - Doric, Ionic, Corinthian column progression upward
 * - Tiered seating (cavea) with 3 sections rising from arena floor
 * - Central sand arena with surrounding wall
 * - Crown/attic level with decorative pilasters and mast sockets
 * - 4 grand entrances at cardinal directions
 * - Interior corridors (ambulacra) between seating and outer wall
 * - Interior lighting with glowstone and lanterns
 * 
 * Dimensions:
 * - Outer diameter: 130 blocks (radius 65)
 * - Arena diameter: 54 blocks (radius 27)
 * - Total height: ~40 blocks
 * - Estimated blocks: ~75,000
 */

import { BlockToPlace } from './castlePlan';

// ============================================
// CONFIGURATION
// ============================================

export const COLOSSEUM_ORIGIN = { x: 200, y: 64, z: 200 };

// Radii (from center outward)
const ARENA_RADIUS = 27;          // Sand floor
const ARENA_WALL_RADIUS = 29;     // Wall around arena
const SEATING_INNER = 30;         // First seating row  
const SEATING_OUTER = 55;         // Last seating row
const CORRIDOR_INNER = 56;        // Inner edge of outer corridor
const CORRIDOR_OUTER = 58;        // Outer edge of outer corridor
const WALL_INNER = 59;            // Inner face of outer wall
const OUTER_RADIUS = 65;          // Outer face of outer wall

// Heights
const ARENA_FLOOR_Y = 0;
const ARENA_WALL_HEIGHT = 5;      // Arena perimeter wall
const SEATING_START_Y = 3;        // First seat row elevation
const TIER_1_HEIGHT = 10;         // Ground level arches
const TIER_2_HEIGHT = 10;         // Second level arches
const TIER_3_HEIGHT = 10;         // Third level arches  
const ATTIC_HEIGHT = 6;           // Crown/attic with pilasters
const TOTAL_HEIGHT = TIER_1_HEIGHT + TIER_2_HEIGHT + TIER_3_HEIGHT + ATTIC_HEIGHT; // 36

// Arch configuration
const NUM_ARCHES = 48;            // Arches per tier
const NUM_ENTRANCES = 4;          // Grand entrances at N/S/E/W

// ============================================
// MATERIALS  
// ============================================
const SANDSTONE = 'sandstone';
const SMOOTH_SANDSTONE = 'smooth_sandstone';
const CUT_SANDSTONE = 'cut_sandstone';
const CHISELED_SANDSTONE = 'chiseled_sandstone';
const QUARTZ_PILLAR = 'quartz_pillar';
const QUARTZ_BLOCK = 'quartz_block';
const STONE_BRICKS = 'stone_bricks';
const STONE_BRICK_STAIRS = 'stone_brick_stairs';
const STONE_BRICK_SLAB = 'stone_brick_slab';
const SMOOTH_STONE = 'smooth_stone';
const SMOOTH_STONE_SLAB = 'smooth_stone_slab';
const SAND = 'sand';
const RED_SAND = 'red_sand';
const IRON_BARS = 'iron_bars';
const DARK_OAK_FENCE = 'dark_oak_fence';
const GLOWSTONE = 'glowstone';
const SEA_LANTERN = 'sea_lantern';
const RED_CARPET = 'red_carpet';
const GOLD_BLOCK = 'gold_block';
const DARK_OAK_STAIRS = 'dark_oak_stairs';
const POLISHED_ANDESITE = 'polished_andesite';
const COBBLESTONE_WALL = 'cobblestone_wall';
const SPRUCE_TRAPDOOR = 'spruce_trapdoor';
const WHITE_BANNER = 'white_banner';

// ============================================
// HELPER: Distance from center
// ============================================
function dist(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

// ============================================
// HELPER: Check if angle is in an arch opening
// ============================================
function isInArchOpening(
  angle: number,
  y: number,
  tierBaseY: number,
  archHeight: number
): boolean {
  const segmentAngle = (2 * Math.PI) / NUM_ARCHES;
  
  // Normalize angle to [0, 2π)
  const normAngle = ((angle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
  
  // Position within the current segment (0 to 1)
  const segmentPos = (normAngle % segmentAngle) / segmentAngle;
  
  // Column portions: 0.0-0.2 and 0.8-1.0 are columns, 0.2-0.8 is opening
  const columnWidth = 0.20;
  if (segmentPos < columnWidth || segmentPos > (1 - columnWidth)) return false;
  
  // Check if this is a grand entrance (wider opening at cardinal directions)
  const archIndex = Math.floor(normAngle / segmentAngle);
  const entranceIndices = [0, NUM_ARCHES / 4, NUM_ARCHES / 2, (3 * NUM_ARCHES) / 4];
  const isEntrance = entranceIndices.some(ei => Math.abs(archIndex - ei) <= 0);
  
  // Height relative to tier base
  const relY = y - tierBaseY;
  
  // First row always solid (base)
  if (relY < 1) return false;
  
  // Arch opening height
  const maxOpenHeight = archHeight - 2; // Leave top 2 rows for arch curve + lintel
  
  if (relY < maxOpenHeight - 1) return true; // Below arch curve - open
  
  // Arch curve at top (semicircular)
  const archProgress = (segmentPos - columnWidth) / (1 - 2 * columnWidth); // 0 to 1
  const archCurve = Math.sin(Math.PI * archProgress); // 0 at edges, 1 at center
  const curveHeight = maxOpenHeight - 1 + archCurve * 2;
  
  return relY < curveHeight;
}

// ============================================
// HELPER: Check if angle is at a grand entrance
// ============================================
function isGrandEntrance(angle: number): boolean {
  const normAngle = ((angle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
  const entranceAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  const entranceWidth = (2 * Math.PI) / NUM_ARCHES * 1.5; // 1.5x wider than normal arch
  
  return entranceAngles.some(ea => {
    const diff = Math.abs(normAngle - ea);
    return diff < entranceWidth / 2 || (2 * Math.PI - diff) < entranceWidth / 2;
  });
}

// ============================================
// SECTION 1: Foundation
// ============================================
function generateFoundation(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  // Full circular foundation
  for (let x = -OUTER_RADIUS; x <= OUTER_RADIUS; x++) {
    for (let z = -OUTER_RADIUS; z <= OUTER_RADIUS; z++) {
      const d = dist(x, z);
      if (d <= OUTER_RADIUS) {
        // Foundation layer
        blocks.push({
          x: ox + x, y: oy - 1, z: oz + z,
          blockType: SMOOTH_STONE,
          section: 'foundation',
          priority: 1
        });
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 2: Arena Floor
// ============================================
function generateArenaFloor(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  for (let x = -ARENA_RADIUS; x <= ARENA_RADIUS; x++) {
    for (let z = -ARENA_RADIUS; z <= ARENA_RADIUS; z++) {
      const d = dist(x, z);
      if (d <= ARENA_RADIUS) {
        // Sand floor
        blocks.push({
          x: ox + x, y: oy, z: oz + z,
          blockType: SAND,
          section: 'arena_floor',
          priority: 2
        });
        
        // Cross pattern in red sand for PvP marking
        if ((Math.abs(x) <= 2 || Math.abs(z) <= 2) && d <= ARENA_RADIUS - 3) {
          blocks[blocks.length - 1].blockType = RED_SAND;
        }
        
        // Center circle marker
        if (d >= 8 && d <= 10) {
          blocks[blocks.length - 1].blockType = RED_SAND;
        }
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 3: Arena Wall
// ============================================
function generateArenaWall(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  for (let x = -ARENA_WALL_RADIUS; x <= ARENA_WALL_RADIUS; x++) {
    for (let z = -ARENA_WALL_RADIUS; z <= ARENA_WALL_RADIUS; z++) {
      const d = dist(x, z);
      
      // Wall ring around arena
      if (d >= ARENA_RADIUS && d <= ARENA_WALL_RADIUS) {
        for (let y = 0; y <= ARENA_WALL_HEIGHT; y++) {
          const angle = Math.atan2(z, x);
          
          // Leave openings for grand entrances at floor level
          if (y <= 3 && isGrandEntrance(angle) && d < ARENA_WALL_RADIUS) {
            continue;
          }
          
          let blockType = SMOOTH_SANDSTONE;
          if (y === ARENA_WALL_HEIGHT) blockType = CHISELED_SANDSTONE; // Top accent
          if (y === 0) blockType = CUT_SANDSTONE; // Base accent
          
          blocks.push({
            x: ox + x, y: oy + y, z: oz + z,
            blockType,
            section: 'arena_wall',
            priority: 3
          });
        }
        
        // Iron bars on top of arena wall
        if (d >= ARENA_RADIUS + 1 && d <= ARENA_WALL_RADIUS - 1) {
          blocks.push({
            x: ox + x, y: oy + ARENA_WALL_HEIGHT + 1, z: oz + z,
            blockType: IRON_BARS,
            section: 'arena_wall',
            priority: 3
          });
        }
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 4: Seating (Cavea) - The stepped bowl
// ============================================
function generateSeating(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  const totalRows = SEATING_OUTER - SEATING_INNER; // 25 rows
  
  for (let x = -(SEATING_OUTER + 1); x <= (SEATING_OUTER + 1); x++) {
    for (let z = -(SEATING_OUTER + 1); z <= (SEATING_OUTER + 1); z++) {
      const d = dist(x, z);
      
      if (d >= SEATING_INNER && d <= SEATING_OUTER) {
        const row = Math.floor(d - SEATING_INNER);
        const seatY = SEATING_START_Y + row; // Each row 1 block higher
        const angle = Math.atan2(z, x);
        
        // Leave gaps for grand entrance corridors
        if (isGrandEntrance(angle)) continue;
        
        // Seat surface (stairs for realistic seating)
        blocks.push({
          x: ox + x, y: oy + seatY, z: oz + z,
          blockType: row % 3 === 0 ? STONE_BRICK_STAIRS : STONE_BRICKS,
          section: row < 8 ? 'seating_lower' : row < 17 ? 'seating_middle' : 'seating_upper',
          priority: row < 8 ? 5 : row < 17 ? 6 : 7
        });
        
        // Fill underneath each seat - only front face and periodic supports
        // (Skip solid fill to reduce block count from 88K to ~15K)
        const prevRow = row - 1;
        const prevSeatY = SEATING_START_Y + prevRow;
        
        // Front face of each step (the visible riser)
        if (seatY > 1) {
          blocks.push({
            x: ox + x, y: oy + seatY - 1, z: oz + z,
            blockType: STONE_BRICKS,
            section: 'seating_support',
            priority: 4
          });
        }
        
        // Ground level support (floor under all seating)
        blocks.push({
          x: ox + x, y: oy + 1, z: oz + z,
          blockType: STONE_BRICKS,
          section: 'seating_support',
          priority: 4
        });
        
        // Periodic column support every 4 rows for structural look
        if (row % 4 === 0) {
          for (let fillY = 2; fillY < seatY - 1; fillY++) {
            blocks.push({
              x: ox + x, y: oy + fillY, z: oz + z,
              blockType: STONE_BRICKS,
              section: 'seating_support',
              priority: 4
            });
          }
        }
        
        // Walkway dividers every 8 rows
        if (row === 8 || row === 17) {
          blocks.push({
            x: ox + x, y: oy + seatY + 1, z: oz + z,
            blockType: COBBLESTONE_WALL,
            section: 'seating_dividers',
            priority: 8
          });
        }
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 5: Outer Corridors
// ============================================
function generateCorridors(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  for (let x = -CORRIDOR_OUTER; x <= CORRIDOR_OUTER; x++) {
    for (let z = -CORRIDOR_OUTER; z <= CORRIDOR_OUTER; z++) {
      const d = dist(x, z);
      
      if (d >= CORRIDOR_INNER && d <= CORRIDOR_OUTER) {
        // Ground floor corridor
        blocks.push({
          x: ox + x, y: oy, z: oz + z,
          blockType: POLISHED_ANDESITE,
          section: 'corridors',
          priority: 4
        });
        
        // Corridor ceiling / second floor
        blocks.push({
          x: ox + x, y: oy + TIER_1_HEIGHT, z: oz + z,
          blockType: SMOOTH_STONE_SLAB,
          section: 'corridors',
          priority: 6
        });
        
        // Second corridor floor
        blocks.push({
          x: ox + x, y: oy + TIER_1_HEIGHT + 1, z: oz + z,
          blockType: POLISHED_ANDESITE,
          section: 'corridors',
          priority: 6
        });
        
        // Second corridor ceiling
        blocks.push({
          x: ox + x, y: oy + TIER_1_HEIGHT + TIER_2_HEIGHT, z: oz + z,
          blockType: SMOOTH_STONE_SLAB,
          section: 'corridors',
          priority: 7
        });
        
        // Lighting every ~6 blocks along corridor
        const angle = Math.atan2(z, x);
        const circumPos = angle * (CORRIDOR_INNER + 1);
        if (Math.abs(circumPos % 6) < 0.8) {
          blocks.push({
            x: ox + x, y: oy + TIER_1_HEIGHT - 1, z: oz + z,
            blockType: SEA_LANTERN,
            section: 'lighting',
            priority: 9
          });
        }
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 6: Outer Wall with Arched Tiers
// ============================================
function generateOuterWall(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  for (let x = -OUTER_RADIUS; x <= OUTER_RADIUS; x++) {
    for (let z = -OUTER_RADIUS; z <= OUTER_RADIUS; z++) {
      const d = dist(x, z);
      
      // Only the wall band
      if (d < WALL_INNER || d > OUTER_RADIUS) continue;
      
      const angle = Math.atan2(z, x);
      const isEntrance = isGrandEntrance(angle);
      
      // Wall thickness: WALL_INNER to OUTER_RADIUS (6 blocks thick)
      const isOuterFace = d >= OUTER_RADIUS - 1;
      const isInnerFace = d <= WALL_INNER + 1;
      const isWallShell = isOuterFace || isInnerFace;
      
      for (let y = 0; y < TOTAL_HEIGHT; y++) {
        let shouldPlace = true;
        let blockType = SANDSTONE;
        let section = 'outer_wall';
        let priority = 4;
        
        // Determine which tier this Y level belongs to
        let tierBase: number;
        let tierHeight: number;
        
        if (y < TIER_1_HEIGHT) {
          // Tier 1 - Ground level (Doric)
          tierBase = 0;
          tierHeight = TIER_1_HEIGHT;
          section = 'tier_1';
          priority = 4;
          
          // Base course
          if (y === 0) blockType = CUT_SANDSTONE;
          else if (y === TIER_1_HEIGHT - 1) blockType = SMOOTH_SANDSTONE; // Entablature
          else blockType = SANDSTONE;
          
        } else if (y < TIER_1_HEIGHT + TIER_2_HEIGHT) {
          // Tier 2 - Second level (Ionic)
          tierBase = TIER_1_HEIGHT;
          tierHeight = TIER_2_HEIGHT;
          section = 'tier_2';
          priority = 5;
          
          if (y === TIER_1_HEIGHT) blockType = CUT_SANDSTONE; // Base
          else if (y === TIER_1_HEIGHT + TIER_2_HEIGHT - 1) blockType = SMOOTH_SANDSTONE;
          else blockType = SANDSTONE;
          
        } else if (y < TIER_1_HEIGHT + TIER_2_HEIGHT + TIER_3_HEIGHT) {
          // Tier 3 - Third level (Corinthian)
          tierBase = TIER_1_HEIGHT + TIER_2_HEIGHT;
          tierHeight = TIER_3_HEIGHT;
          section = 'tier_3';
          priority = 6;
          
          if (y === tierBase) blockType = CUT_SANDSTONE;
          else if (y === tierBase + tierHeight - 1) blockType = SMOOTH_SANDSTONE;
          else blockType = SANDSTONE;
          
        } else {
          // Attic / Crown
          tierBase = TIER_1_HEIGHT + TIER_2_HEIGHT + TIER_3_HEIGHT;
          tierHeight = ATTIC_HEIGHT;
          section = 'attic';
          priority = 7;
          blockType = SMOOTH_SANDSTONE;
          
          // Attic is solid (no arches) but with pilasters (fake columns)
          if (y === TOTAL_HEIGHT - 1) {
            blockType = CHISELED_SANDSTONE; // Cornice
          }
        }
        
        // Arch openings for tiers 1-3 on outer face
        if (y < TIER_1_HEIGHT + TIER_2_HEIGHT + TIER_3_HEIGHT) {
          if (isOuterFace || d >= OUTER_RADIUS - 3) {
            // Check arch opening
            if (isInArchOpening(angle, y, tierBase, tierHeight)) {
              // Grand entrances are always open through the full wall
              if (isEntrance) {
                shouldPlace = false;
              } else if (isOuterFace) {
                // Normal arches only open on outer 2 blocks
                shouldPlace = false;
              } else if (d >= OUTER_RADIUS - 2) {
                shouldPlace = false;
              }
            }
          }
        }
        
        // Interior of wall is hollow for corridors (only shell)
        if (!isWallShell && y > 0 && y < TOTAL_HEIGHT - 1) {
          // Fill some interior for structural support
          if (y === TIER_1_HEIGHT - 1 || y === TIER_1_HEIGHT + TIER_2_HEIGHT - 1) {
            // Floor slabs between tiers
            blockType = SMOOTH_STONE_SLAB;
          } else if (y % TIER_1_HEIGHT === 0) {
            blockType = CUT_SANDSTONE;
          } else {
            shouldPlace = false; // Hollow interior
          }
        }
        
        // Columns between arches (on outer face)
        if (!shouldPlace && isOuterFace) {
          const segAngle = (2 * Math.PI) / NUM_ARCHES;
          const normAngle = ((angle % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
          const segPos = (normAngle % segAngle) / segAngle;
          
          // Column at segment boundaries
          if (segPos < 0.08 || segPos > 0.92) {
            shouldPlace = true;
            // Different column material per tier
            if (y < TIER_1_HEIGHT) blockType = CUT_SANDSTONE;       // Doric
            else if (y < TIER_1_HEIGHT + TIER_2_HEIGHT) blockType = QUARTZ_PILLAR;  // Ionic
            else blockType = QUARTZ_PILLAR; // Corinthian
          }
        }
        
        if (shouldPlace) {
          blocks.push({
            x: ox + x, y: oy + y, z: oz + z,
            blockType,
            section,
            priority
          });
        }
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 7: Grand Entrances (4 cardinal)
// ============================================
function generateEntrances(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  // 4 entrances: N (+z), S (-z), E (+x), W (-x)
  const entrances = [
    { dx: 1, dz: 0, name: 'east' },
    { dx: -1, dz: 0, name: 'west' },
    { dx: 0, dz: 1, name: 'south' },
    { dx: 0, dz: -1, name: 'north' },
  ];
  
  for (const entrance of entrances) {
    // Ground path from outer wall to arena
    for (let r = ARENA_WALL_RADIUS; r <= OUTER_RADIUS; r++) {
      for (let w = -3; w <= 3; w++) { // 7 blocks wide
        const ex = entrance.dx * r + entrance.dz * w;
        const ez = entrance.dz * r + entrance.dx * w;
        
        // Floor
        blocks.push({
          x: ox + ex, y: oy, z: oz + ez,
          blockType: Math.abs(w) <= 1 ? RED_CARPET : POLISHED_ANDESITE,
          section: 'entrances',
          priority: 8
        });
      }
    }
    
    // Entrance arch frame
    const archR = OUTER_RADIUS - 1;
    for (let y = 0; y < TIER_1_HEIGHT + 2; y++) {
      for (let w = -4; w <= 4; w++) {
        const ex = entrance.dx * archR + entrance.dz * w;
        const ez = entrance.dz * archR + entrance.dx * w;
        
        // Only the frame (edges)
        if (Math.abs(w) >= 3 || y >= TIER_1_HEIGHT) {
          blocks.push({
            x: ox + ex, y: oy + y, z: oz + ez,
            blockType: y >= TIER_1_HEIGHT ? CHISELED_SANDSTONE : CUT_SANDSTONE,
            section: 'entrances',
            priority: 8
          });
        }
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 8: Attic Pilasters & Crown
// ============================================
function generateCrown(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y + TOTAL_HEIGHT;
  const oz = COLOSSEUM_ORIGIN.z;
  
  // Mast sockets / crenellations on top
  const resolution = Math.floor(2 * Math.PI * OUTER_RADIUS);
  for (let i = 0; i < resolution; i++) {
    const angle = (2 * Math.PI * i) / resolution;
    const rx = Math.round(Math.cos(angle) * (OUTER_RADIUS - 0.5));
    const rz = Math.round(Math.sin(angle) * (OUTER_RADIUS - 0.5));
    
    // Mast socket every ~4 blocks
    if (i % 4 === 0) {
      blocks.push({
        x: ox + rx, y: oy, z: oz + rz,
        blockType: DARK_OAK_FENCE,
        section: 'crown',
        priority: 8
      });
      blocks.push({
        x: ox + rx, y: oy + 1, z: oz + rz,
        blockType: DARK_OAK_FENCE,
        section: 'crown',
        priority: 8
      });
    }
  }
  
  // Inner rim fence (safety railing at top of seating)
  for (let i = 0; i < resolution; i++) {
    const angle = (2 * Math.PI * i) / resolution;
    
    if (isGrandEntrance(angle)) continue;
    
    const rx = Math.round(Math.cos(angle) * (WALL_INNER + 0.5));
    const rz = Math.round(Math.sin(angle) * (WALL_INNER + 0.5));
    
    blocks.push({
      x: ox + rx, y: oy - 1, z: oz + rz,
      blockType: IRON_BARS,
      section: 'crown',
      priority: 8
    });
  }
  
  return blocks;
}

// ============================================
// SECTION 9: Interior Lighting
// ============================================
function generateLighting(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  // Glowstone under seating every ~8 blocks for ambient light
  for (let x = -SEATING_OUTER; x <= SEATING_OUTER; x += 8) {
    for (let z = -SEATING_OUTER; z <= SEATING_OUTER; z += 8) {
      const d = dist(x, z);
      if (d >= SEATING_INNER && d <= SEATING_OUTER) {
        const row = Math.floor(d - SEATING_INNER);
        const seatY = SEATING_START_Y + row;
        
        blocks.push({
          x: ox + x, y: oy + Math.max(1, seatY - 2), z: oz + z,
          blockType: GLOWSTONE,
          section: 'lighting',
          priority: 9
        });
      }
    }
  }
  
  // Ring of sea lanterns around arena wall top
  const lanternResolution = 64;
  for (let i = 0; i < lanternResolution; i++) {
    const angle = (2 * Math.PI * i) / lanternResolution;
    const rx = Math.round(Math.cos(angle) * (ARENA_WALL_RADIUS));
    const rz = Math.round(Math.sin(angle) * (ARENA_WALL_RADIUS));
    
    blocks.push({
      x: ox + rx, y: oy + ARENA_WALL_HEIGHT + 2, z: oz + rz,
      blockType: SEA_LANTERN,
      section: 'lighting',
      priority: 9
    });
  }
  
  // Floor lighting in corridors
  for (let x = -CORRIDOR_OUTER; x <= CORRIDOR_OUTER; x += 6) {
    for (let z = -CORRIDOR_OUTER; z <= CORRIDOR_OUTER; z += 6) {
      const d = dist(x, z);
      if (d >= CORRIDOR_INNER && d <= CORRIDOR_OUTER) {
        blocks.push({
          x: ox + x, y: oy + TIER_1_HEIGHT - 1, z: oz + z,
          blockType: SEA_LANTERN,
          section: 'lighting',
          priority: 9
        });
      }
    }
  }
  
  return blocks;
}

// ============================================
// SECTION 10: VIP Podium (Emperor's Box)
// ============================================
function generateVIPBox(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  // VIP area on the south side (positive Z), elevated
  const vipRadius = SEATING_INNER + 4;
  const vipY = SEATING_START_Y + 3;
  
  // Platform
  for (let x = -6; x <= 6; x++) {
    for (let z = vipRadius - 2; z <= vipRadius + 2; z++) {
      // Floor
      blocks.push({
        x: ox + x, y: oy + vipY, z: oz + z,
        blockType: GOLD_BLOCK,
        section: 'vip_box',
        priority: 9
      });
      
      // Red carpet on top
      blocks.push({
        x: ox + x, y: oy + vipY + 1, z: oz + z,
        blockType: RED_CARPET,
        section: 'vip_box',
        priority: 9
      });
    }
  }
  
  // VIP columns
  for (const xOff of [-6, -3, 3, 6]) {
    for (let y = 0; y < 5; y++) {
      blocks.push({
        x: ox + xOff, y: oy + vipY + 1 + y, z: oz + vipRadius,
        blockType: QUARTZ_PILLAR,
        section: 'vip_box',
        priority: 9
      });
    }
  }
  
  // VIP roof
  for (let x = -7; x <= 7; x++) {
    blocks.push({
      x: ox + x, y: oy + vipY + 6, z: oz + vipRadius,
      blockType: CHISELED_SANDSTONE,
      section: 'vip_box',
      priority: 9
    });
    blocks.push({
      x: ox + x, y: oy + vipY + 6, z: oz + vipRadius + 1,
      blockType: SMOOTH_SANDSTONE,
      section: 'vip_box',
      priority: 9
    });
    blocks.push({
      x: ox + x, y: oy + vipY + 6, z: oz + vipRadius - 1,
      blockType: SMOOTH_SANDSTONE,
      section: 'vip_box',
      priority: 9
    });
  }
  
  return blocks;
}

// ============================================
// SECTION 11: Hypogeum (Underground tunnels)
// ============================================
function generateHypogeum(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = COLOSSEUM_ORIGIN.x;
  const oy = COLOSSEUM_ORIGIN.y;
  const oz = COLOSSEUM_ORIGIN.z;
  
  // Cross-shaped tunnels under arena floor
  for (let r = -ARENA_RADIUS + 2; r <= ARENA_RADIUS - 2; r++) {
    // North-South tunnel
    for (let w = -2; w <= 2; w++) {
      // Floor
      blocks.push({
        x: ox + w, y: oy - 4, z: oz + r,
        blockType: STONE_BRICKS,
        section: 'hypogeum',
        priority: 2
      });
      // Walls
      if (Math.abs(w) === 2) {
        for (let y = -3; y <= -1; y++) {
          blocks.push({
            x: ox + w, y: oy + y, z: oz + r,
            blockType: STONE_BRICKS,
            section: 'hypogeum',
            priority: 2
          });
        }
      }
      // Ceiling
      blocks.push({
        x: ox + w, y: oy - 1, z: oz + r,
        blockType: STONE_BRICK_SLAB,
        section: 'hypogeum',
        priority: 2
      });
    }
    
    // East-West tunnel
    for (let w = -2; w <= 2; w++) {
      blocks.push({
        x: ox + r, y: oy - 4, z: oz + w,
        blockType: STONE_BRICKS,
        section: 'hypogeum',
        priority: 2
      });
      if (Math.abs(w) === 2) {
        for (let y = -3; y <= -1; y++) {
          blocks.push({
            x: ox + r, y: oy + y, z: oz + w,
            blockType: STONE_BRICKS,
            section: 'hypogeum',
            priority: 2
          });
        }
      }
      blocks.push({
        x: ox + r, y: oy - 1, z: oz + w,
        blockType: STONE_BRICK_SLAB,
        section: 'hypogeum',
        priority: 2
      });
    }
  }
  
  // Lighting in hypogeum
  for (let r = -ARENA_RADIUS + 4; r <= ARENA_RADIUS - 4; r += 6) {
    blocks.push({
      x: ox, y: oy - 2, z: oz + r,
      blockType: SEA_LANTERN,
      section: 'hypogeum',
      priority: 2
    });
    blocks.push({
      x: ox + r, y: oy - 2, z: oz,
      blockType: SEA_LANTERN,
      section: 'hypogeum',
      priority: 2
    });
  }
  
  return blocks;
}

// ============================================
// MASTER BLUEPRINT GENERATOR
// ============================================
export function generateColosseumBlueprint(): BlockToPlace[] {
  const allBlocks: BlockToPlace[] = [];
  
  console.log('[COLOSSEUM] Generating blueprint...');
  
  const foundation = generateFoundation();
  console.log(`[COLOSSEUM]   Foundation: ${foundation.length} blocks`);
  allBlocks.push(...foundation);
  
  const hypogeum = generateHypogeum();
  console.log(`[COLOSSEUM]   Hypogeum: ${hypogeum.length} blocks`);
  allBlocks.push(...hypogeum);
  
  const arenaFloor = generateArenaFloor();
  console.log(`[COLOSSEUM]   Arena Floor: ${arenaFloor.length} blocks`);
  allBlocks.push(...arenaFloor);
  
  const arenaWall = generateArenaWall();
  console.log(`[COLOSSEUM]   Arena Wall: ${arenaWall.length} blocks`);
  allBlocks.push(...arenaWall);
  
  const seating = generateSeating();
  console.log(`[COLOSSEUM]   Seating: ${seating.length} blocks`);
  allBlocks.push(...seating);
  
  const corridors = generateCorridors();
  console.log(`[COLOSSEUM]   Corridors: ${corridors.length} blocks`);
  allBlocks.push(...corridors);
  
  const outerWall = generateOuterWall();
  console.log(`[COLOSSEUM]   Outer Wall: ${outerWall.length} blocks`);
  allBlocks.push(...outerWall);
  
  const entrances = generateEntrances();
  console.log(`[COLOSSEUM]   Entrances: ${entrances.length} blocks`);
  allBlocks.push(...entrances);
  
  const crown = generateCrown();
  console.log(`[COLOSSEUM]   Crown: ${crown.length} blocks`);
  allBlocks.push(...crown);
  
  const lighting = generateLighting();
  console.log(`[COLOSSEUM]   Lighting: ${lighting.length} blocks`);
  allBlocks.push(...lighting);
  
  const vipBox = generateVIPBox();
  console.log(`[COLOSSEUM]   VIP Box: ${vipBox.length} blocks`);
  allBlocks.push(...vipBox);
  
  // Deduplicate blocks (later sections override earlier ones at same position)
  const blockMap = new Map<string, BlockToPlace>();
  for (const block of allBlocks) {
    const key = `${block.x},${block.y},${block.z}`;
    blockMap.set(key, block);
  }
  
  const dedupedBlocks = Array.from(blockMap.values());
  
  console.log(`[COLOSSEUM] ✅ Blueprint complete: ${dedupedBlocks.length} unique blocks`);
  console.log(`[COLOSSEUM]   Dimensions: ${OUTER_RADIUS * 2} diameter x ${TOTAL_HEIGHT} tall`);
  console.log(`[COLOSSEUM]   Arena: ${ARENA_RADIUS * 2} diameter`);
  
  return dedupedBlocks;
}

export function getColosseumSections(): string[] {
  return [
    'foundation', 'hypogeum', 'arena_floor', 'arena_wall',
    'seating_support', 'seating_lower', 'seating_middle', 'seating_upper', 'seating_dividers',
    'corridors', 'tier_1', 'tier_2', 'tier_3', 'attic',
    'entrances', 'crown', 'lighting', 'vip_box'
  ];
}

export const COLOSSEUM_INFO = {
  origin: COLOSSEUM_ORIGIN,
  dimensions: {
    outerDiameter: OUTER_RADIUS * 2,
    arenaDiameter: ARENA_RADIUS * 2,
    height: TOTAL_HEIGHT,
    archesPerTier: NUM_ARCHES,
    numTiers: 3,
  },
  description: `A massive Roman Colosseum ${OUTER_RADIUS * 2} blocks in diameter and ${TOTAL_HEIGHT} blocks tall, featuring:
  - 3 tiers of ${NUM_ARCHES} arched openings each (Doric→Ionic→Corinthian progression)
  - Solid attic crown with decorative pilasters and fence masts
  - ${SEATING_OUTER - SEATING_INNER} rows of stepped seating (cavea) with divider walkways
  - Central sand arena (${ARENA_RADIUS * 2} block diameter) with iron bar fence
  - 4 grand entrances at cardinal directions with red carpet
  - Underground hypogeum with cross-shaped tunnels
  - Emperor's VIP box with gold floor, quartz columns, and canopy
  - Interior corridors with sea lantern lighting
  - Built from sandstone, smooth sandstone, quartz, and stone brick`
};
