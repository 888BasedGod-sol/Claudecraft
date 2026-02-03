/**
 * Power-Up Definitions
 * All available power-ups that can be purchased for fights
 */

import { PowerUp } from './types';

export const POWER_UPS: PowerUp[] = [
  // === BUFF CATEGORY (Pre-fight effects) ===
  {
    id: 'speed_boost',
    name: 'Speed Boost',
    description: 'Speed I for the entire fight',
    price: 50,
    category: 'buff',
    effect: {
      type: 'potion',
      potionEffect: 'speed',
      potionLevel: 1,
      potionDuration: 300  // 5 minutes (whole fight)
    }
  },
  {
    id: 'strength_surge',
    name: 'Strength Surge',
    description: 'Strength I for the entire fight',
    price: 75,
    category: 'buff',
    effect: {
      type: 'potion',
      potionEffect: 'strength',
      potionLevel: 1,
      potionDuration: 300
    }
  },
  {
    id: 'iron_skin',
    name: 'Iron Skin',
    description: 'Resistance I for the entire fight',
    price: 75,
    category: 'buff',
    effect: {
      type: 'potion',
      potionEffect: 'resistance',
      potionLevel: 1,
      potionDuration: 300
    }
  },
  {
    id: 'quick_regen',
    name: 'Quick Regen',
    description: 'Regeneration I for 30 seconds at start',
    price: 40,
    category: 'buff',
    effect: {
      type: 'potion',
      potionEffect: 'regeneration',
      potionLevel: 1,
      potionDuration: 30
    }
  },
  {
    id: 'fire_resistance',
    name: 'Fire Shield',
    description: 'Fire Resistance for entire fight',
    price: 30,
    category: 'buff',
    effect: {
      type: 'potion',
      potionEffect: 'fire_resistance',
      potionLevel: 1,
      potionDuration: 300
    }
  },

  // === KIT UPGRADES (Better starting gear) ===
  {
    id: 'sharp_edge',
    name: 'Sharp Edge',
    description: 'Sharpness I on your sword',
    price: 100,
    category: 'kit',
    effect: {
      type: 'enchant',
      enchantment: 'sharpness',
      enchantLevel: 1
    }
  },
  {
    id: 'tough_armor',
    name: 'Tough Armor',
    description: 'Protection I on all armor pieces',
    price: 120,
    category: 'kit',
    effect: {
      type: 'enchant',
      enchantment: 'protection',
      enchantLevel: 1
    }
  },
  {
    id: 'extra_hearts',
    name: 'Extra Hearts',
    description: '+4 HP (2 extra hearts)',
    price: 150,
    category: 'kit',
    effect: {
      type: 'potion',
      potionEffect: 'health_boost',
      potionLevel: 1,
      potionDuration: 300
    }
  },
  {
    id: 'diamond_sword',
    name: 'Diamond Blade',
    description: 'Start with diamond sword instead of iron',
    price: 200,
    category: 'kit',
    effect: {
      type: 'item',
      itemId: 'diamond_sword',
      itemCount: 1
    }
  },

  // === CONSUMABLES (One-time use items) ===
  {
    id: 'golden_apple',
    name: 'Golden Apple',
    description: '1 golden apple in your inventory',
    price: 80,
    category: 'consumable',
    effect: {
      type: 'item',
      itemId: 'golden_apple',
      itemCount: 1
    }
  },
  {
    id: 'ender_pearl',
    name: 'Ender Pearl',
    description: '1 ender pearl for clutch plays',
    price: 60,
    category: 'consumable',
    effect: {
      type: 'item',
      itemId: 'ender_pearl',
      itemCount: 1
    }
  },
  {
    id: 'healing_potion',
    name: 'Healing Potion',
    description: 'Instant Health II potion',
    price: 50,
    category: 'consumable',
    effect: {
      type: 'item',
      itemId: 'splash_potion',
      itemCount: 1
    }
  },
  {
    id: 'shield',
    name: 'Shield',
    description: 'Start with a shield',
    price: 40,
    category: 'consumable',
    effect: {
      type: 'item',
      itemId: 'shield',
      itemCount: 1
    }
  },

  // === CLUTCH ABILITIES (High impact) ===
  {
    id: 'second_wind',
    name: 'Second Wind',
    description: 'Auto-heal to 50% HP once when below 3 hearts',
    price: 250,
    category: 'clutch',
    effect: {
      type: 'ability',
      abilityId: 'second_wind'
    }
  },
  {
    id: 'totem_save',
    name: 'Totem Save',
    description: 'One-time death prevention (like totem of undying)',
    price: 300,
    category: 'clutch',
    effect: {
      type: 'item',
      itemId: 'totem_of_undying',
      itemCount: 1
    }
  }
];

/**
 * Get power-up by ID
 */
export function getPowerUp(id: string): PowerUp | undefined {
  return POWER_UPS.find(p => p.id === id);
}

/**
 * Get power-ups by category
 */
export function getPowerUpsByCategory(category: PowerUp['category']): PowerUp[] {
  return POWER_UPS.filter(p => p.category === category);
}

/**
 * Calculate total cost of power-ups
 */
export function calculatePowerUpCost(powerUpIds: string[]): number {
  return powerUpIds.reduce((total, id) => {
    const powerUp = getPowerUp(id);
    return total + (powerUp?.price || 0);
  }, 0);
}

/**
 * Validate power-up selection (check limits, conflicts, etc.)
 */
export function validatePowerUps(powerUpIds: string[]): { valid: boolean; error?: string } {
  // Max 3 power-ups per fight
  if (powerUpIds.length > 3) {
    return { valid: false, error: 'Maximum 3 power-ups per fight' };
  }

  // Check for duplicates
  const unique = new Set(powerUpIds);
  if (unique.size !== powerUpIds.length) {
    return { valid: false, error: 'Duplicate power-ups not allowed' };
  }

  // Check all power-ups exist
  for (const id of powerUpIds) {
    if (!getPowerUp(id)) {
      return { valid: false, error: `Unknown power-up: ${id}` };
    }
  }

  // Check for conflicting power-ups (e.g., can't have both diamond_sword and sharp_edge on iron)
  // For now, allow all combinations

  return { valid: true };
}
