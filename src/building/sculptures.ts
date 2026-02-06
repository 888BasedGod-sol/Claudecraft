/**
 * 3D Sculpture and Pixel Art library for Minecraft
 * Pre-defined models for the Sculptor agent to build
 */

// Each sculpture is defined as layers (Y-levels) with 2D arrays
// Values are block names or 'air' for empty
// Origin is bottom-left-front corner

export interface Sculpture {
  name: string;
  description: string;
  category: 'animal' | 'character' | 'object' | 'abstract' | 'monument' | 'mythical';
  width: number;   // X
  height: number;  // Y
  depth: number;   // Z
  layers: string[][][];  // [y][z][x] - each layer is YZ plane
  defaultMaterial?: string;
}

// ===== ANIMALS =====

export const SCULPTURES: Record<string, Sculpture> = {
  
  // === SMALL CAT (5x5x4) ===
  cat: {
    name: 'Cat',
    description: 'A cute sitting cat',
    category: 'animal',
    width: 5, height: 5, depth: 4,
    defaultMaterial: 'orange_wool',
    layers: [
      // Y=0 (bottom - paws)
      [
        ['B', '.', '.', '.', 'B'],
        ['.', 'B', 'B', 'B', '.'],
        ['B', '.', '.', '.', 'B'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=1 (body)
      [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', '.', 'B', '.', '.'],
      ],
      // Y=2 (upper body)
      [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=3 (head base)
      [
        ['.', '.', '.', '.', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=4 (ears)
      [
        ['.', '.', '.', '.', '.'],
        ['B', '.', '.', '.', 'B'],
        ['.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ],
    ]
  },

  // === DOG (6x5x4) ===
  dog: {
    name: 'Dog',
    description: 'A loyal sitting dog',
    category: 'animal',
    width: 6, height: 5, depth: 4,
    defaultMaterial: 'brown_wool',
    layers: [
      // Y=0 (paws)
      [
        ['B', '.', '.', '.', '.', 'B'],
        ['.', 'B', 'B', 'B', 'B', '.'],
        ['B', '.', '.', '.', '.', 'B'],
        ['.', '.', '.', '.', '.', '.'],
      ],
      // Y=1 (body)
      [
        ['.', 'B', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', '.'],
        ['.', '.', 'B', 'B', '.', '.'],
      ],
      // Y=2 (upper body)
      [
        ['.', 'B', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', '.'],
        ['.', '.', '.', '.', '.', '.'],
      ],
      // Y=3 (head)
      [
        ['.', '.', '.', '.', '.', '.'],
        ['B', 'B', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', '.', '.', '.'],
      ],
      // Y=4 (ears)
      [
        ['.', '.', '.', '.', '.', '.'],
        ['B', '.', '.', 'B', '.', '.'],
        ['.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.'],
      ],
    ]
  },

  // === CREEPER HEAD (7x8x7) ===
  creeperHead: {
    name: 'Creeper Head',
    description: 'A giant creeper face statue',
    category: 'character',
    width: 7, height: 8, depth: 7,
    defaultMaterial: 'green_wool',
    layers: [
      // Y=0 (bottom)
      [
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
      ],
      // Y=1-2 (lower face - solid)
      ...Array(2).fill([
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ]),
      // Y=3 (mouth row - front has black)
      [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'K', 'B', 'K', 'B', 'B'], // K = black for mouth
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ],
      // Y=4 (mouth continues)
      [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'K', 'K', 'K', 'K', 'K', 'B'], // mouth wider
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ],
      // Y=5 (eyes row)
      [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'K', 'K', 'B', 'K', 'K', 'B'], // eyes
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ],
      // Y=6 (eyes continue)
      [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'K', 'K', 'B', 'K', 'K', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ],
      // Y=7 (top)
      [
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
      ],
    ]
  },

  // === HEART (7x7x3) ===
  heart: {
    name: 'Heart',
    description: 'A 3D heart symbol',
    category: 'abstract',
    width: 7, height: 7, depth: 3,
    defaultMaterial: 'red_wool',
    layers: [
      // Y=0 (bottom tip)
      [
        ['.', '.', '.', 'B', '.', '.', '.'],
        ['.', '.', '.', 'B', '.', '.', '.'],
        ['.', '.', '.', 'B', '.', '.', '.'],
      ],
      // Y=1
      [
        ['.', '.', 'B', 'B', 'B', '.', '.'],
        ['.', '.', 'B', 'B', 'B', '.', '.'],
        ['.', '.', 'B', 'B', 'B', '.', '.'],
      ],
      // Y=2
      [
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', 'B', 'B', 'B', '.'],
      ],
      // Y=3
      [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ],
      // Y=4
      [
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B'],
      ],
      // Y=5 (lobes start)
      [
        ['B', 'B', 'B', '.', 'B', 'B', 'B'],
        ['B', 'B', 'B', '.', 'B', 'B', 'B'],
        ['B', 'B', 'B', '.', 'B', 'B', 'B'],
      ],
      // Y=6 (top lobes)
      [
        ['.', 'B', '.', '.', '.', 'B', '.'],
        ['.', 'B', '.', '.', '.', 'B', '.'],
        ['.', 'B', '.', '.', '.', 'B', '.'],
      ],
    ]
  },

  // === SWORD (3x12x1) ===
  sword: {
    name: 'Sword',
    description: 'A giant decorative sword',
    category: 'object',
    width: 3, height: 12, depth: 1,
    defaultMaterial: 'iron_block',
    layers: [
      // Y=0 (pommel)
      [['.', 'G', '.']],  // G = gold
      // Y=1 (grip)
      [['.', 'B', '.']],  // B = brown (oak_planks)
      [['.', 'B', '.']],
      [['.', 'B', '.']],
      // Y=4 (crossguard)
      [['G', 'G', 'G']],
      // Y=5-10 (blade)
      [['.', 'I', '.']],  // I = iron
      [['.', 'I', '.']],
      [['.', 'I', '.']],
      [['.', 'I', '.']],
      [['.', 'I', '.']],
      [['.', 'I', '.']],
      // Y=11 (tip)
      [['.', 'I', '.']],
    ]
  },

  // === MUSHROOM (5x6x5) ===
  mushroom: {
    name: 'Giant Mushroom',
    description: 'A decorative giant mushroom',
    category: 'object',
    width: 5, height: 6, depth: 5,
    defaultMaterial: 'red_mushroom_block',
    layers: [
      // Y=0-2 (stem)
      [
        ['.', '.', '.', '.', '.'],
        ['.', '.', 'W', '.', '.'],
        ['.', 'W', 'W', 'W', '.'],
        ['.', '.', 'W', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      [
        ['.', '.', '.', '.', '.'],
        ['.', '.', 'W', '.', '.'],
        ['.', 'W', 'W', 'W', '.'],
        ['.', '.', 'W', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      [
        ['.', '.', '.', '.', '.'],
        ['.', '.', 'W', '.', '.'],
        ['.', 'W', 'W', 'W', '.'],
        ['.', '.', 'W', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=3-4 (cap)
      [
        ['.', 'R', 'R', 'R', '.'],
        ['R', 'R', 'R', 'R', 'R'],
        ['R', 'R', 'R', 'R', 'R'],
        ['R', 'R', 'R', 'R', 'R'],
        ['.', 'R', 'R', 'R', '.'],
      ],
      [
        ['.', 'R', 'R', 'R', '.'],
        ['R', 'R', 'R', 'R', 'R'],
        ['R', 'R', 'R', 'R', 'R'],
        ['R', 'R', 'R', 'R', 'R'],
        ['.', 'R', 'R', 'R', '.'],
      ],
      // Y=5 (top)
      [
        ['.', '.', '.', '.', '.'],
        ['.', 'R', 'R', 'R', '.'],
        ['.', 'R', 'R', 'R', '.'],
        ['.', 'R', 'R', 'R', '.'],
        ['.', '.', '.', '.', '.'],
      ],
    ]
  },

  // === DRAGON HEAD (9x10x9) ===
  dragonHead: {
    name: 'Dragon Head',
    description: 'A fearsome dragon head sculpture',
    category: 'mythical',
    width: 9, height: 10, depth: 9,
    defaultMaterial: 'purple_wool',
    layers: [
      // Y=0 (jaw bottom)
      [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ],
      // Y=1 (teeth row lower)
      [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', 'W', 'B', 'W', 'B', 'W', '.', '.'],  // W = white teeth
        ['.', '.', 'B', 'K', 'K', 'K', 'B', '.', '.'],  // K = black mouth
        ['.', '.', 'B', 'K', 'K', 'K', 'B', '.', '.'],
        ['.', '.', 'B', 'K', 'K', 'K', 'B', '.', '.'],
        ['.', '.', 'W', 'B', 'W', 'B', 'W', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ],
      // Y=2-3 (snout)
      ...[2, 3].map(() => [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ]),
      // Y=4 (nostril level)
      [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', 'B', 'K', 'B', 'B', 'B', 'K', 'B', '.'],  // nostrils
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ],
      // Y=5-6 (eyes level)
      ...[5, 6].map(() => [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', 'B', 'Y', 'K', 'B', 'K', 'Y', 'B', '.'],  // Y = yellow eyes, K = black pupil
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ]),
      // Y=7-8 (forehead)
      ...[7, 8].map(() => [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', 'B', 'B', 'B', 'B', 'B', '.'],
        ['.', '.', 'B', 'B', 'B', 'B', 'B', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ]),
      // Y=9 (horns)
      [
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
        ['.', 'B', '.', '.', '.', '.', '.', 'B', '.'],
        ['.', '.', 'B', '.', '.', '.', 'B', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', '.', 'B', 'B', 'B', '.', '.', '.'],
        ['.', '.', 'B', '.', '.', '.', 'B', '.', '.'],
        ['.', 'B', '.', '.', '.', '.', '.', 'B', '.'],
        ['.', '.', '.', '.', '.', '.', '.', '.', '.'],
      ],
    ]
  },

  // === STAR (7x7x1) - 2D pixel art ===
  star: {
    name: 'Star',
    description: 'A 2D pixel art star',
    category: 'abstract',
    width: 7, height: 7, depth: 1,
    defaultMaterial: 'gold_block',
    layers: [
      [['.', '.', '.', 'B', '.', '.', '.']],
      [['.', '.', 'B', 'B', 'B', '.', '.']],
      [['B', 'B', 'B', 'B', 'B', 'B', 'B']],
      [['.', '.', 'B', 'B', 'B', '.', '.']],
      [['.', 'B', 'B', '.', 'B', 'B', '.']],
      [['B', 'B', '.', '.', '.', 'B', 'B']],
      [['B', '.', '.', '.', '.', '.', 'B']],
    ]
  },

  // === TREE (3x8x3) ===
  tree: {
    name: 'Decorative Tree',
    description: 'A stylized tree sculpture',
    category: 'object',
    width: 5, height: 8, depth: 5,
    defaultMaterial: 'oak_wood',
    layers: [
      // Y=0-3 (trunk)
      ...[0, 1, 2, 3].map(() => [
        ['.', '.', '.', '.', '.'],
        ['.', '.', 'T', '.', '.'],
        ['.', 'T', 'T', 'T', '.'],
        ['.', '.', 'T', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ]),
      // Y=4-6 (leaves)
      ...[4, 5, 6].map(() => [
        ['.', 'L', 'L', 'L', '.'],
        ['L', 'L', 'L', 'L', 'L'],
        ['L', 'L', 'L', 'L', 'L'],
        ['L', 'L', 'L', 'L', 'L'],
        ['.', 'L', 'L', 'L', '.'],
      ]),
      // Y=7 (top)
      [
        ['.', '.', '.', '.', '.'],
        ['.', '.', 'L', '.', '.'],
        ['.', 'L', 'L', 'L', '.'],
        ['.', '.', 'L', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ],
    ]
  },

  // === SKULL (5x6x5) ===
  skull: {
    name: 'Skull',
    description: 'A spooky skull sculpture',
    category: 'object',
    width: 5, height: 6, depth: 5,
    defaultMaterial: 'bone_block',
    layers: [
      // Y=0 (jaw)
      [
        ['.', '.', '.', '.', '.'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', 'K', 'K', 'K', '.'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=1 (teeth)
      [
        ['.', '.', '.', '.', '.'],
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'K', 'K', 'K', 'B'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=2-3 (face)
      ...[2, 3].map(() => [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', '.'],
      ]),
      // Y=4 (eye sockets)
      [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'K', 'B', 'K', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'K', 'B', 'K', 'B'],
        ['.', 'B', 'B', 'B', '.'],
      ],
      // Y=5 (top)
      [
        ['.', '.', '.', '.', '.'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', 'B', 'B', 'B', '.'],
        ['.', '.', '.', '.', '.'],
      ],
    ]
  },

  // === OWL (5x7x5) ===
  owl: {
    name: 'Owl',
    description: 'A wise owl sculpture',
    category: 'animal',
    width: 5, height: 7, depth: 5,
    defaultMaterial: 'brown_wool',
    layers: [
      // Y=0 (feet)
      [
        ['.', '.', '.', '.', '.'],
        ['.', 'O', '.', 'O', '.'],
        ['.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.'],
        ['.', '.', '.', '.', '.'],
      ],
      // Y=1-2 (body)
      ...[1, 2].map(() => [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', '.'],
      ]),
      // Y=3 (belly pattern)
      [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'W', 'W', 'W', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', '.'],
      ],
      // Y=4 (face)
      [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'Y', 'B', 'Y', 'B'],  // Y = yellow eyes
        ['B', 'B', 'O', 'B', 'B'],  // O = orange beak
        ['B', 'Y', 'B', 'Y', 'B'],
        ['.', 'B', 'B', 'B', '.'],
      ],
      // Y=5 (head)
      [
        ['.', 'B', 'B', 'B', '.'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['B', 'B', 'B', 'B', 'B'],
        ['.', 'B', 'B', 'B', '.'],
      ],
      // Y=6 (ear tufts)
      [
        ['.', '.', '.', '.', '.'],
        ['B', '.', '.', '.', 'B'],
        ['.', 'B', 'B', 'B', '.'],
        ['B', '.', '.', '.', 'B'],
        ['.', '.', '.', '.', '.'],
      ],
    ]
  },
};

// Block code mapping for sculptures
export const BLOCK_CODES: Record<string, string> = {
  '.': 'air',
  'B': 'DEFAULT',  // Use sculpture's defaultMaterial
  'W': 'white_wool',
  'K': 'black_wool',
  'R': 'red_wool',
  'O': 'orange_wool',
  'Y': 'yellow_wool',
  'G': 'gold_block',
  'I': 'iron_block',
  'T': 'oak_log',
  'L': 'oak_leaves',
  'S': 'stone',
  'P': 'purple_wool',
  'C': 'cyan_wool',
  'M': 'magenta_wool',
  'E': 'emerald_block',
  'D': 'diamond_block',
  'N': 'netherrack',
  'Q': 'quartz_block',
  'H': 'honey_block',
  'A': 'blue_wool',
};

// Get all available sculpture names
export function getSculptureNames(): string[] {
  return Object.keys(SCULPTURES);
}

// Get sculptures by category
export function getSculpturesByCategory(category: Sculpture['category']): Sculpture[] {
  return Object.values(SCULPTURES).filter(s => s.category === category);
}

// Get a random sculpture
export function getRandomSculpture(): Sculpture {
  const names = getSculptureNames();
  return SCULPTURES[names[Math.floor(Math.random() * names.length)]];
}

// Build a sculpture at a position (returns setblock commands)
export function buildSculptureCommands(
  sculptureName: string,
  startX: number,
  startY: number,
  startZ: number,
  material?: string
): string[] {
  const sculpture = SCULPTURES[sculptureName];
  if (!sculpture) {
    console.log(`[Sculptures] Unknown sculpture: ${sculptureName}`);
    return [];
  }

  const commands: string[] = [];
  const baseMaterial = material || sculpture.defaultMaterial || 'stone';

  for (let y = 0; y < sculpture.layers.length; y++) {
    const layer = sculpture.layers[y];
    for (let z = 0; z < layer.length; z++) {
      const row = layer[z];
      for (let x = 0; x < row.length; x++) {
        const code = row[x];
        if (code === '.' || code === ' ') continue; // Skip air
        
        let block = BLOCK_CODES[code];
        if (block === 'DEFAULT') {
          block = baseMaterial;
        } else if (!block) {
          block = baseMaterial; // Unknown code defaults to base material
        }

        const posX = startX + x;
        const posY = startY + y;
        const posZ = startZ + z;

        commands.push(`/setblock ${posX} ${posY} ${posZ} minecraft:${block}`);
      }
    }
  }

  return commands;
}

// List available sculptures for agent prompt
export function listSculpturesForPrompt(): string {
  let output = 'AVAILABLE SCULPTURES:\n';
  
  const categories = ['animal', 'character', 'object', 'abstract', 'monument', 'mythical'];
  for (const cat of categories) {
    const sculptures = getSculpturesByCategory(cat as Sculpture['category']);
    if (sculptures.length > 0) {
      output += `\n${cat.toUpperCase()}S:\n`;
      for (const s of sculptures) {
        output += `  - ${s.name} (${s.width}x${s.height}x${s.depth}): ${s.description}\n`;
      }
    }
  }
  
  return output;
}
