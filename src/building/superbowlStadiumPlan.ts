/**
 * Super Bowl Stadium Blueprint - American Football Stadium for Super Bowl LX
 * 
 * Architecture:
 * - Rectangular stadium with proper football field dimensions
 * - 100-yard field (scaled to ~100 blocks) with end zones
 * - Tiered seating on all 4 sides
 * - Goal posts at each end
 * - Press boxes and VIP suites
 * - Super Bowl themed decorations
 * - Night game lighting
 * 
 * Dimensions:
 * - Field: 110 x 53 blocks (with end zones)
 * - Total stadium: 150 x 100 blocks
 * - Height: ~35 blocks
 * - Estimated blocks: ~45,000
 */

import { BlockToPlace } from './castlePlan';

// ============================================
// CONFIGURATION
// ============================================

export const SUPERBOWL_ORIGIN = { x: -150, y: 64, z: 150 };

// Field dimensions (scaled from real field)
const FIELD_LENGTH = 110;  // 100 yards + 2 end zones
const FIELD_WIDTH = 53;    // 53.3 yards
const ENDZONE_LENGTH = 10; // Each end zone

// Stadium dimensions
const STADIUM_LENGTH = FIELD_LENGTH + 40; // 150 total
const STADIUM_WIDTH = FIELD_WIDTH + 47;   // 100 total
const SEATING_ROWS = 15;
const SEATING_HEIGHT_PER_ROW = 1;
const PRESS_BOX_HEIGHT = 8;

// Heights
const FIELD_Y = 0;
const SEATING_START_Y = 2;
const TOTAL_HEIGHT = SEATING_START_Y + SEATING_ROWS + PRESS_BOX_HEIGHT + 5;

// ============================================
// MATERIALS  
// ============================================
const GRASS_BLOCK = 'grass_block';
const WHITE_CONCRETE = 'white_concrete';
const LIME_CONCRETE = 'lime_concrete';
const BLUE_CONCRETE = 'blue_concrete';
const RED_CONCRETE = 'red_concrete';
const ORANGE_CONCRETE = 'orange_concrete';
const YELLOW_CONCRETE = 'yellow_concrete';
const GOLD_BLOCK = 'gold_block';
const GRAY_CONCRETE = 'gray_concrete';
const LIGHT_GRAY_CONCRETE = 'light_gray_concrete';
const STONE_BRICKS = 'stone_bricks';
const POLISHED_ANDESITE = 'polished_andesite';
const IRON_BARS = 'iron_bars';
const GLOWSTONE = 'glowstone';
const SEA_LANTERN = 'sea_lantern';
const QUARTZ_BLOCK = 'quartz_block';
const QUARTZ_PILLAR = 'quartz_pillar';
const DARK_OAK_STAIRS = 'dark_oak_stairs';
const DARK_OAK_SLAB = 'dark_oak_slab';
const SPRUCE_FENCE = 'spruce_fence';
const GLASS_PANE = 'glass_pane';
const DARK_OAK_PLANKS = 'dark_oak_planks';
const RED_CARPET = 'red_carpet';
const BLUE_CARPET = 'blue_carpet';
const WHITE_WOOL = 'white_wool';
const BROWN_CONCRETE = 'brown_concrete';

export const SUPERBOWL_INFO = {
  name: 'Super Bowl LX Stadium',
  description: 'American football stadium for the big game! Features full field with end zones, tiered seating, goal posts, press boxes, and night game lighting.',
  estimatedBlocks: 45000,
  dimensions: { length: STADIUM_LENGTH, width: STADIUM_WIDTH, height: TOTAL_HEIGHT },
  origin: SUPERBOWL_ORIGIN
};

// ============================================
// BLUEPRINT GENERATOR
// ============================================

export function generateSuperbowlBlueprint(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = SUPERBOWL_ORIGIN.x;
  const oy = SUPERBOWL_ORIGIN.y;
  const oz = SUPERBOWL_ORIGIN.z;
  
  // Field boundaries (centered in stadium)
  const fieldStartX = 20;
  const fieldEndX = fieldStartX + FIELD_LENGTH;
  const fieldStartZ = 23;
  const fieldEndZ = fieldStartZ + FIELD_WIDTH;
  
  // ========================================
  // LAYER 1: Foundation and Field
  // ========================================
  
  // Stadium foundation
  for (let x = 0; x < STADIUM_LENGTH; x++) {
    for (let z = 0; z < STADIUM_WIDTH; z++) {
      const isField = x >= fieldStartX && x < fieldEndX && z >= fieldStartZ && z < fieldEndZ;
      
      if (isField) {
        // Football field
        const fieldX = x - fieldStartX;
        
        // End zones
        if (fieldX < ENDZONE_LENGTH) {
          // Team 1 end zone (blue - Eagles themed)
          blocks.push({
            x: ox + x, y: oy, z: oz + z,
            blockType: BLUE_CONCRETE,
            section: 'endzone_1',
            priority: 1
          });
        } else if (fieldX >= FIELD_LENGTH - ENDZONE_LENGTH) {
          // Team 2 end zone (red - Chiefs themed)
          blocks.push({
            x: ox + x, y: oy, z: oz + z,
            blockType: RED_CONCRETE,
            section: 'endzone_2',
            priority: 1
          });
        } else {
          // Main field
          blocks.push({
            x: ox + x, y: oy, z: oz + z,
            blockType: GRASS_BLOCK,
            section: 'field',
            priority: 1
          });
        }
        
        // Yard lines every 5 yards (5 blocks)
        if ((fieldX - ENDZONE_LENGTH) % 5 === 0 && fieldX >= ENDZONE_LENGTH && fieldX < FIELD_LENGTH - ENDZONE_LENGTH) {
          // White line across field
          if (z === fieldStartZ || z === fieldEndZ - 1 || (z - fieldStartZ) === Math.floor(FIELD_WIDTH / 2)) {
            blocks.push({
              x: ox + x, y: oy + 1, z: oz + z,
              blockType: WHITE_CONCRETE,
              section: 'field_lines',
              priority: 2
            });
          }
        }
        
        // Sidelines
        if (z === fieldStartZ || z === fieldEndZ - 1) {
          blocks.push({
            x: ox + x, y: oy + 1, z: oz + z,
            blockType: WHITE_CONCRETE,
            section: 'sidelines',
            priority: 2
          });
        }
        
        // End zone lines
        if (fieldX === ENDZONE_LENGTH - 1 || fieldX === FIELD_LENGTH - ENDZONE_LENGTH) {
          blocks.push({
            x: ox + x, y: oy + 1, z: oz + z,
            blockType: WHITE_CONCRETE,
            section: 'field_lines',
            priority: 2
          });
        }
      } else {
        // Stadium floor around field
        blocks.push({
          x: ox + x, y: oy, z: oz + z,
          blockType: GRAY_CONCRETE,
          section: 'stadium_floor',
          priority: 1
        });
      }
    }
  }
  
  // ========================================
  // LAYER 2: Seating Tiers
  // ========================================
  
  // Build tiered seating on all 4 sides
  for (let row = 0; row < SEATING_ROWS; row++) {
    const y = SEATING_START_Y + row;
    
    // North side seating (z = 0 to fieldStartZ - 5)
    for (let x = 5; x < STADIUM_LENGTH - 5; x++) {
      const seatZ = fieldStartZ - 5 - row;
      if (seatZ >= 3) {
        // Alternate seat colors for visual interest
        const seatColor = row % 3 === 0 ? BLUE_CONCRETE : (row % 3 === 1 ? RED_CONCRETE : LIGHT_GRAY_CONCRETE);
        blocks.push({
          x: ox + x, y: oy + y, z: oz + seatZ,
          blockType: seatColor,
          section: 'seating_north',
          priority: 10 + row
        });
      }
    }
    
    // South side seating
    for (let x = 5; x < STADIUM_LENGTH - 5; x++) {
      const seatZ = fieldEndZ + 5 + row;
      if (seatZ < STADIUM_WIDTH - 3) {
        const seatColor = row % 3 === 0 ? RED_CONCRETE : (row % 3 === 1 ? BLUE_CONCRETE : LIGHT_GRAY_CONCRETE);
        blocks.push({
          x: ox + x, y: oy + y, z: oz + seatZ,
          blockType: seatColor,
          section: 'seating_south',
          priority: 10 + row
        });
      }
    }
    
    // West side seating (behind end zone 1)
    for (let z = fieldStartZ - 3; z < fieldEndZ + 3; z++) {
      const seatX = fieldStartX - 5 - row;
      if (seatX >= 3) {
        const seatColor = row % 2 === 0 ? BLUE_CONCRETE : WHITE_WOOL;
        blocks.push({
          x: ox + seatX, y: oy + y, z: oz + z,
          blockType: seatColor,
          section: 'seating_west',
          priority: 10 + row
        });
      }
    }
    
    // East side seating (behind end zone 2)
    for (let z = fieldStartZ - 3; z < fieldEndZ + 3; z++) {
      const seatX = fieldEndX + 5 + row;
      if (seatX < STADIUM_LENGTH - 3) {
        const seatColor = row % 2 === 0 ? RED_CONCRETE : WHITE_WOOL;
        blocks.push({
          x: ox + seatX, y: oy + y, z: oz + z,
          blockType: seatColor,
          section: 'seating_east',
          priority: 10 + row
        });
      }
    }
  }
  
  // ========================================
  // LAYER 3: Exterior Walls
  // ========================================
  
  const wallHeight = SEATING_ROWS + SEATING_START_Y + 5;
  
  for (let y = 0; y < wallHeight; y++) {
    // North wall
    for (let x = 0; x < STADIUM_LENGTH; x++) {
      blocks.push({
        x: ox + x, y: oy + y, z: oz,
        blockType: y < 3 ? STONE_BRICKS : QUARTZ_BLOCK,
        section: 'wall_north',
        priority: 30
      });
    }
    
    // South wall
    for (let x = 0; x < STADIUM_LENGTH; x++) {
      blocks.push({
        x: ox + x, y: oy + y, z: oz + STADIUM_WIDTH - 1,
        blockType: y < 3 ? STONE_BRICKS : QUARTZ_BLOCK,
        section: 'wall_south',
        priority: 30
      });
    }
    
    // West wall
    for (let z = 0; z < STADIUM_WIDTH; z++) {
      blocks.push({
        x: ox, y: oy + y, z: oz + z,
        blockType: y < 3 ? STONE_BRICKS : QUARTZ_BLOCK,
        section: 'wall_west',
        priority: 30
      });
    }
    
    // East wall
    for (let z = 0; z < STADIUM_WIDTH; z++) {
      blocks.push({
        x: ox + STADIUM_LENGTH - 1, y: oy + y, z: oz + z,
        blockType: y < 3 ? STONE_BRICKS : QUARTZ_BLOCK,
        section: 'wall_east',
        priority: 30
      });
    }
  }
  
  // ========================================
  // LAYER 4: Goal Posts
  // ========================================
  
  // Goal post at each end (using gold blocks and yellow concrete for visibility)
  const goalPostPositions = [
    { x: fieldStartX + 5, z: Math.floor(fieldStartZ + FIELD_WIDTH / 2) },   // West goal
    { x: fieldEndX - 5, z: Math.floor(fieldStartZ + FIELD_WIDTH / 2) }      // East goal
  ];
  
  for (const pos of goalPostPositions) {
    // Vertical posts
    for (let y = 1; y <= 12; y++) {
      blocks.push({
        x: ox + pos.x, y: oy + y, z: oz + pos.z - 3,
        blockType: YELLOW_CONCRETE,
        section: 'goal_post',
        priority: 50
      });
      blocks.push({
        x: ox + pos.x, y: oy + y, z: oz + pos.z + 3,
        blockType: YELLOW_CONCRETE,
        section: 'goal_post',
        priority: 50
      });
    }
    
    // Crossbar
    for (let z = pos.z - 3; z <= pos.z + 3; z++) {
      blocks.push({
        x: ox + pos.x, y: oy + 8, z: oz + z,
        blockType: GOLD_BLOCK,
        section: 'goal_crossbar',
        priority: 51
      });
    }
  }
  
  // ========================================
  // LAYER 5: Press Boxes & VIP Suites
  // ========================================
  
  const pressBoxY = SEATING_START_Y + SEATING_ROWS + 2;
  const pressBoxLen = 40;
  const pressBoxStart = Math.floor((STADIUM_LENGTH - pressBoxLen) / 2);
  
  // North side press box
  for (let x = pressBoxStart; x < pressBoxStart + pressBoxLen; x++) {
    for (let dy = 0; dy < PRESS_BOX_HEIGHT; dy++) {
      // Back wall
      blocks.push({
        x: ox + x, y: oy + pressBoxY + dy, z: oz + 2,
        blockType: DARK_OAK_PLANKS,
        section: 'press_box_north',
        priority: 40
      });
      
      // Front glass
      if (dy > 0 && dy < PRESS_BOX_HEIGHT - 1) {
        blocks.push({
          x: ox + x, y: oy + pressBoxY + dy, z: oz + 5,
          blockType: GLASS_PANE,
          section: 'press_box_north',
          priority: 41
        });
      }
    }
    
    // Press box floor
    for (let z = 2; z <= 5; z++) {
      blocks.push({
        x: ox + x, y: oy + pressBoxY, z: oz + z,
        blockType: POLISHED_ANDESITE,
        section: 'press_box_floor',
        priority: 39
      });
    }
    
    // Press box roof
    for (let z = 2; z <= 5; z++) {
      blocks.push({
        x: ox + x, y: oy + pressBoxY + PRESS_BOX_HEIGHT, z: oz + z,
        blockType: DARK_OAK_SLAB,
        section: 'press_box_roof',
        priority: 42
      });
    }
  }
  
  // ========================================
  // LAYER 6: Stadium Lighting
  // ========================================
  
  const lightTowerPositions = [
    { x: 5, z: 5 },
    { x: 5, z: STADIUM_WIDTH - 6 },
    { x: STADIUM_LENGTH - 6, z: 5 },
    { x: STADIUM_LENGTH - 6, z: STADIUM_WIDTH - 6 },
    { x: Math.floor(STADIUM_LENGTH / 2), z: 3 },
    { x: Math.floor(STADIUM_LENGTH / 2), z: STADIUM_WIDTH - 4 }
  ];
  
  const lightTowerHeight = wallHeight + 10;
  
  for (const pos of lightTowerPositions) {
    // Tower pole
    for (let y = wallHeight; y < lightTowerHeight; y++) {
      blocks.push({
        x: ox + pos.x, y: oy + y, z: oz + pos.z,
        blockType: IRON_BARS,
        section: 'light_tower',
        priority: 60
      });
    }
    
    // Light bank at top
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        blocks.push({
          x: ox + pos.x + dx, y: oy + lightTowerHeight, z: oz + pos.z + dz,
          blockType: SEA_LANTERN,
          section: 'stadium_lights',
          priority: 61
        });
        // Additional lighting row below
        blocks.push({
          x: ox + pos.x + dx, y: oy + lightTowerHeight - 1, z: oz + pos.z + dz,
          blockType: GLOWSTONE,
          section: 'stadium_lights',
          priority: 61
        });
      }
    }
  }
  
  // ========================================
  // LAYER 7: Super Bowl Decorations
  // ========================================
  
  // "LX" (60 in Roman numerals) using gold blocks at each end zone
  // Simplified LX pattern at west end
  const lxStartX = fieldStartX + 2;
  const lxStartZ = fieldStartZ + Math.floor(FIELD_WIDTH / 2) - 5;
  
  // L shape
  for (let dy = 0; dy < 5; dy++) {
    blocks.push({
      x: ox + lxStartX, y: oy + 1, z: oz + lxStartZ + dy,
      blockType: GOLD_BLOCK,
      section: 'superbowl_logo',
      priority: 70
    });
  }
  for (let dz = 0; dz < 3; dz++) {
    blocks.push({
      x: ox + lxStartX, y: oy + 1, z: oz + lxStartZ + 4 + dz,
      blockType: GOLD_BLOCK,
      section: 'superbowl_logo',
      priority: 70
    });
  }
  
  // X shape
  const xStartX = lxStartX + 3;
  for (let i = 0; i < 5; i++) {
    blocks.push({
      x: ox + xStartX, y: oy + 1, z: oz + lxStartZ + i,
      blockType: GOLD_BLOCK,
      section: 'superbowl_logo',
      priority: 70
    });
    blocks.push({
      x: ox + xStartX + 2, y: oy + 1, z: oz + lxStartZ + 4 - i,
      blockType: GOLD_BLOCK,
      section: 'superbowl_logo',
      priority: 70
    });
  }
  
  // Trophy platform at 50-yard line
  const midFieldX = fieldStartX + Math.floor(FIELD_LENGTH / 2);
  const midFieldZ = fieldStartZ + Math.floor(FIELD_WIDTH / 2);
  
  // Lombardi Trophy pedestal
  blocks.push({
    x: ox + midFieldX, y: oy + 1, z: oz + midFieldZ,
    blockType: QUARTZ_PILLAR,
    section: 'trophy_pedestal',
    priority: 71
  });
  blocks.push({
    x: ox + midFieldX, y: oy + 2, z: oz + midFieldZ,
    blockType: GOLD_BLOCK,
    section: 'lombardi_trophy',
    priority: 72
  });
  blocks.push({
    x: ox + midFieldX, y: oy + 3, z: oz + midFieldZ,
    blockType: GOLD_BLOCK,
    section: 'lombardi_trophy',
    priority: 72
  });
  
  // ========================================
  // LAYER 8: Entrances/Tunnels
  // ========================================
  
  // Team tunnels at each end
  const tunnelPositions = [
    { x: 0, z: Math.floor(STADIUM_WIDTH / 2), dir: 'west' },
    { x: STADIUM_LENGTH - 1, z: Math.floor(STADIUM_WIDTH / 2), dir: 'east' }
  ];
  
  for (const tunnel of tunnelPositions) {
    // Clear entrance opening (3 wide, 3 tall)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = 0; dy < 3; dy++) {
        // Mark as air/entrance (we'll add carpet)
        if (dy === 0) {
          blocks.push({
            x: ox + tunnel.x, y: oy + dy, z: oz + tunnel.z + dz,
            blockType: tunnel.dir === 'west' ? BLUE_CARPET : RED_CARPET,
            section: 'team_tunnel',
            priority: 80
          });
        }
      }
    }
  }
  
  console.log(`[SUPERBOWL] Generated ${blocks.length} blocks for Super Bowl LX Stadium`);
  return blocks;
}
