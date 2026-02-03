/**
 * Castle Blueprint - A massive medieval castle
 * Agents will collaboratively build this structure
 */

// Castle origin point (center of castle)
export const CASTLE_ORIGIN = { x: 0, y: 64, z: 50 };

// Castle dimensions
const CASTLE_WIDTH = 60;  // Total width (x)
const CASTLE_LENGTH = 80; // Total length (z)
const WALL_HEIGHT = 15;
const TOWER_HEIGHT = 25;
const KEEP_HEIGHT = 20;

// Block types for the castle
const STONE = 'stone_bricks';
const DARK_STONE = 'deepslate_bricks';
const FLOOR = 'polished_andesite';
const ACCENT = 'chiseled_stone_bricks';
const GLASS = 'glass_pane';
const WOOD = 'dark_oak_planks';

export interface BlockToPlace {
  x: number;
  y: number;
  z: number;
  blockType: string;
  section: string;
  priority: number;
  claimed?: string;
}

function generateFoundation(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = CASTLE_ORIGIN.x;
  const oy = CASTLE_ORIGIN.y;
  const oz = CASTLE_ORIGIN.z;

  for (let x = -CASTLE_WIDTH / 2; x <= CASTLE_WIDTH / 2; x++) {
    for (let z = -CASTLE_LENGTH / 2; z <= CASTLE_LENGTH / 2; z++) {
      blocks.push({
        x: ox + x, y: oy, z: oz + z,
        blockType: FLOOR,
        section: 'foundation',
        priority: 1
      });
    }
  }
  return blocks;
}

function generateWalls(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = CASTLE_ORIGIN.x;
  const oy = CASTLE_ORIGIN.y;
  const oz = CASTLE_ORIGIN.z;

  for (let h = 1; h <= WALL_HEIGHT; h++) {
    // North wall
    for (let x = -CASTLE_WIDTH / 2; x <= CASTLE_WIDTH / 2; x++) {
      if (Math.abs(x) <= 4 && h <= 8) continue; // Gate opening
      const blockType = h === WALL_HEIGHT ? ACCENT : (h % 3 === 0 ? DARK_STONE : STONE);
      blocks.push({
        x: ox + x, y: oy + h, z: oz - CASTLE_LENGTH / 2,
        blockType, section: 'wall_north', priority: 2
      });
    }
    // South wall
    for (let x = -CASTLE_WIDTH / 2; x <= CASTLE_WIDTH / 2; x++) {
      const blockType = h === WALL_HEIGHT ? ACCENT : (h % 3 === 0 ? DARK_STONE : STONE);
      blocks.push({
        x: ox + x, y: oy + h, z: oz + CASTLE_LENGTH / 2,
        blockType, section: 'wall_south', priority: 2
      });
    }
    // East/West walls
    for (let z = -CASTLE_LENGTH / 2; z <= CASTLE_LENGTH / 2; z++) {
      const blockType = h === WALL_HEIGHT ? ACCENT : (h % 3 === 0 ? DARK_STONE : STONE);
      blocks.push({ x: ox + CASTLE_WIDTH / 2, y: oy + h, z: oz + z, blockType, section: 'wall_east', priority: 2 });
      blocks.push({ x: ox - CASTLE_WIDTH / 2, y: oy + h, z: oz + z, blockType, section: 'wall_west', priority: 2 });
    }
  }

  // Battlements
  for (let x = -CASTLE_WIDTH / 2; x <= CASTLE_WIDTH / 2; x += 2) {
    blocks.push({ x: ox + x, y: oy + WALL_HEIGHT + 1, z: oz - CASTLE_LENGTH / 2, blockType: STONE, section: 'battlements', priority: 3 });
    blocks.push({ x: ox + x, y: oy + WALL_HEIGHT + 1, z: oz + CASTLE_LENGTH / 2, blockType: STONE, section: 'battlements', priority: 3 });
  }
  for (let z = -CASTLE_LENGTH / 2; z <= CASTLE_LENGTH / 2; z += 2) {
    blocks.push({ x: ox + CASTLE_WIDTH / 2, y: oy + WALL_HEIGHT + 1, z: oz + z, blockType: STONE, section: 'battlements', priority: 3 });
    blocks.push({ x: ox - CASTLE_WIDTH / 2, y: oy + WALL_HEIGHT + 1, z: oz + z, blockType: STONE, section: 'battlements', priority: 3 });
  }

  return blocks;
}

function generateTower(cornerX: number, cornerZ: number, name: string): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = CASTLE_ORIGIN.x + cornerX;
  const oy = CASTLE_ORIGIN.y;
  const oz = CASTLE_ORIGIN.z + cornerZ;
  const radius = 5;

  for (let h = 0; h <= TOWER_HEIGHT; h++) {
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist <= radius && dist >= radius - 1.5) {
          const blockType = h === TOWER_HEIGHT ? ACCENT : (h % 4 === 0 ? DARK_STONE : STONE);
          blocks.push({ x: ox + x, y: oy + h, z: oz + z, blockType, section: name, priority: 2 });
        }
        if (dist <= radius - 1 && h > 0 && h % 6 === 0) {
          blocks.push({ x: ox + x, y: oy + h, z: oz + z, blockType: WOOD, section: name, priority: 3 });
        }
      }
    }
  }

  // Tower roof
  for (let h = 1; h <= 8; h++) {
    const roofRadius = radius - h * 0.5;
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist <= roofRadius && dist >= roofRadius - 1) {
          blocks.push({ x: ox + x, y: oy + TOWER_HEIGHT + h, z: oz + z, blockType: 'dark_prismarine', section: name, priority: 4 });
        }
      }
    }
  }

  return blocks;
}

function generateKeep(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = CASTLE_ORIGIN.x;
  const oy = CASTLE_ORIGIN.y;
  const oz = CASTLE_ORIGIN.z;
  const keepWidth = 20;
  const keepLength = 25;

  for (let h = 1; h <= KEEP_HEIGHT; h++) {
    for (let x = -keepWidth / 2; x <= keepWidth / 2; x++) {
      const blockType = h === KEEP_HEIGHT ? ACCENT : (h % 3 === 0 ? DARK_STONE : STONE);
      blocks.push({ x: ox + x, y: oy + h, z: oz - keepLength / 2, blockType, section: 'keep', priority: 3 });
      blocks.push({ x: ox + x, y: oy + h, z: oz + keepLength / 2, blockType, section: 'keep', priority: 3 });
    }
    for (let z = -keepLength / 2; z <= keepLength / 2; z++) {
      const blockType = h === KEEP_HEIGHT ? ACCENT : (h % 3 === 0 ? DARK_STONE : STONE);
      blocks.push({ x: ox - keepWidth / 2, y: oy + h, z: oz + z, blockType, section: 'keep', priority: 3 });
      blocks.push({ x: ox + keepWidth / 2, y: oy + h, z: oz + z, blockType, section: 'keep', priority: 3 });
    }
    if (h >= 5 && h <= 8) {
      for (let x = -keepWidth / 2 + 3; x <= keepWidth / 2 - 3; x += 4) {
        blocks.push({ x: ox + x, y: oy + h, z: oz - keepLength / 2, blockType: GLASS, section: 'keep', priority: 4 });
        blocks.push({ x: ox + x, y: oy + h, z: oz + keepLength / 2, blockType: GLASS, section: 'keep', priority: 4 });
      }
    }
  }

  // Keep roof
  for (let x = -keepWidth / 2; x <= keepWidth / 2; x++) {
    for (let z = -keepLength / 2; z <= keepLength / 2; z++) {
      blocks.push({ x: ox + x, y: oy + KEEP_HEIGHT + 1, z: oz + z, blockType: DARK_STONE, section: 'keep_roof', priority: 4 });
    }
  }
  for (let x = -keepWidth / 2; x <= keepWidth / 2; x += 2) {
    blocks.push({ x: ox + x, y: oy + KEEP_HEIGHT + 2, z: oz - keepLength / 2, blockType: STONE, section: 'keep_roof', priority: 4 });
    blocks.push({ x: ox + x, y: oy + KEEP_HEIGHT + 2, z: oz + keepLength / 2, blockType: STONE, section: 'keep_roof', priority: 4 });
  }

  return blocks;
}

function generateGatehouse(): BlockToPlace[] {
  const blocks: BlockToPlace[] = [];
  const ox = CASTLE_ORIGIN.x;
  const oy = CASTLE_ORIGIN.y;
  const oz = CASTLE_ORIGIN.z - CASTLE_LENGTH / 2;

  for (const side of [-1, 1]) {
    for (let h = 1; h <= 12; h++) {
      for (let x = -2; x <= 2; x++) {
        for (let z = -2; z <= 2; z++) {
          const dist = Math.sqrt(x * x + z * z);
          if (dist <= 2.5 && dist >= 1.5) {
            blocks.push({ x: ox + side * 6 + x, y: oy + h, z: oz + z, blockType: h === 12 ? ACCENT : STONE, section: 'gatehouse', priority: 3 });
          }
        }
      }
    }
  }

  for (let x = -4; x <= 4; x++) {
    blocks.push({ x: ox + x, y: oy + 9, z: oz, blockType: ACCENT, section: 'gatehouse', priority: 3 });
    blocks.push({ x: ox + x, y: oy + 10, z: oz, blockType: STONE, section: 'gatehouse', priority: 3 });
  }

  return blocks;
}

export function generateCastleBlueprint(): BlockToPlace[] {
  const allBlocks: BlockToPlace[] = [];
  
  allBlocks.push(...generateFoundation());
  allBlocks.push(...generateWalls());
  allBlocks.push(...generateTower(-CASTLE_WIDTH / 2, -CASTLE_LENGTH / 2, 'tower_nw'));
  allBlocks.push(...generateTower(CASTLE_WIDTH / 2, -CASTLE_LENGTH / 2, 'tower_ne'));
  allBlocks.push(...generateTower(-CASTLE_WIDTH / 2, CASTLE_LENGTH / 2, 'tower_sw'));
  allBlocks.push(...generateTower(CASTLE_WIDTH / 2, CASTLE_LENGTH / 2, 'tower_se'));
  allBlocks.push(...generateKeep());
  allBlocks.push(...generateGatehouse());

  console.log(`[CASTLE] Generated blueprint with ${allBlocks.length} blocks`);
  return allBlocks;
}

export function getCastleSections(): string[] {
  return ['foundation', 'wall_north', 'wall_south', 'wall_east', 'wall_west', 'battlements', 'tower_nw', 'tower_ne', 'tower_sw', 'tower_se', 'keep', 'keep_roof', 'gatehouse'];
}

export const CASTLE_INFO = {
  origin: CASTLE_ORIGIN,
  dimensions: { width: CASTLE_WIDTH, length: CASTLE_LENGTH, wallHeight: WALL_HEIGHT, towerHeight: TOWER_HEIGHT, keepHeight: KEEP_HEIGHT },
  description: `A massive medieval castle ${CASTLE_WIDTH}x${CASTLE_LENGTH} blocks, featuring:
  - 4 corner towers (${TOWER_HEIGHT} blocks tall with conical roofs)
  - Outer walls (${WALL_HEIGHT} blocks tall with battlements)
  - Central keep (${KEEP_HEIGHT} blocks tall)
  - Grand gatehouse with twin towers
  - Stone brick construction with decorative accents`
};
