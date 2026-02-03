/**
 * Combat Kit Manager
 * Defines and applies standardized arena gear
 */

import { PowerUp } from './types';
import { getPowerUp } from './powerUps';

export interface CombatKit {
  helmet: string;
  chestplate: string;
  leggings: string;
  boots: string;
  weapon: string;
  offhand: string;
  items: { item: string; count: number }[];
}

/**
 * Base arena kit - everyone starts with this
 */
export const BASE_KIT: CombatKit = {
  helmet: 'iron_helmet',
  chestplate: 'iron_chestplate',
  leggings: 'iron_leggings',
  boots: 'iron_boots',
  weapon: 'iron_sword',
  offhand: 'air',
  items: [
    { item: 'cooked_beef', count: 16 }
  ]
};

/**
 * Generate Minecraft commands to equip a player with the kit
 */
export function generateKitCommands(playerName: string, powerUpIds: string[]): string[] {
  const commands: string[] = [];
  
  // Clear inventory first
  commands.push(`clear ${playerName}`);
  
  // Determine weapon (check for diamond_sword power-up)
  let weapon = BASE_KIT.weapon;
  let weaponEnchants = '';
  
  for (const id of powerUpIds) {
    const powerUp = getPowerUp(id);
    if (!powerUp) continue;
    
    if (powerUp.id === 'diamond_sword') {
      weapon = 'diamond_sword';
    }
    if (powerUp.id === 'sharp_edge') {
      weaponEnchants = '{Enchantments:[{id:"minecraft:sharpness",lvl:1s}]}';
    }
  }
  
  // Give weapon
  if (weaponEnchants) {
    commands.push(`give ${playerName} minecraft:${weapon}${weaponEnchants} 1`);
  } else {
    commands.push(`give ${playerName} minecraft:${weapon} 1`);
  }
  
  // Determine armor enchants
  let armorEnchants = '';
  for (const id of powerUpIds) {
    if (id === 'tough_armor') {
      armorEnchants = '{Enchantments:[{id:"minecraft:protection",lvl:1s}]}';
    }
  }
  
  // Give armor
  const armorPieces = [
    BASE_KIT.helmet,
    BASE_KIT.chestplate,
    BASE_KIT.leggings,
    BASE_KIT.boots
  ];
  
  for (const piece of armorPieces) {
    if (armorEnchants) {
      commands.push(`give ${playerName} minecraft:${piece}${armorEnchants} 1`);
    } else {
      commands.push(`give ${playerName} minecraft:${piece} 1`);
    }
  }
  
  // Give base items
  for (const item of BASE_KIT.items) {
    commands.push(`give ${playerName} minecraft:${item.item} ${item.count}`);
  }
  
  // Apply power-up items
  for (const id of powerUpIds) {
    const powerUp = getPowerUp(id);
    if (!powerUp) continue;
    
    if (powerUp.effect.type === 'item' && powerUp.effect.itemId) {
      // Skip diamond_sword (already handled above)
      if (powerUp.id === 'diamond_sword') continue;
      
      const itemId = powerUp.effect.itemId;
      const count = powerUp.effect.itemCount || 1;
      
      // Special handling for potions
      if (itemId === 'splash_potion') {
        commands.push(`give ${playerName} minecraft:splash_potion{Potion:"minecraft:strong_healing"} ${count}`);
      } else {
        commands.push(`give ${playerName} minecraft:${itemId} ${count}`);
      }
    }
  }
  
  // Equip armor
  commands.push(`replaceitem entity ${playerName} armor.head ${BASE_KIT.helmet}`);
  commands.push(`replaceitem entity ${playerName} armor.chest ${BASE_KIT.chestplate}`);
  commands.push(`replaceitem entity ${playerName} armor.legs ${BASE_KIT.leggings}`);
  commands.push(`replaceitem entity ${playerName} armor.feet ${BASE_KIT.boots}`);
  
  return commands;
}

/**
 * Generate commands to apply power-up effects (potions)
 */
export function generatePowerUpEffectCommands(playerName: string, powerUpIds: string[]): string[] {
  const commands: string[] = [];
  
  for (const id of powerUpIds) {
    const powerUp = getPowerUp(id);
    if (!powerUp) continue;
    
    if (powerUp.effect.type === 'potion' && powerUp.effect.potionEffect) {
      const effect = powerUp.effect.potionEffect;
      const level = (powerUp.effect.potionLevel || 1) - 1; // MC uses 0-indexed
      const duration = (powerUp.effect.potionDuration || 60) * 20; // Convert to ticks
      
      commands.push(`effect give ${playerName} minecraft:${effect} ${powerUp.effect.potionDuration} ${level}`);
    }
  }
  
  return commands;
}

/**
 * Generate commands to heal and prepare player for fight
 */
export function generatePreFightCommands(playerName: string): string[] {
  return [
    `effect clear ${playerName}`,
    `heal ${playerName}`,
    `feed ${playerName}`,
    `gamemode survival ${playerName}`
  ];
}

/**
 * Generate commands to reset player after fight
 */
export function generatePostFightCommands(playerName: string): string[] {
  return [
    `clear ${playerName}`,
    `effect clear ${playerName}`,
    `heal ${playerName}`,
    `feed ${playerName}`,
    `gamemode spectator ${playerName}`  // Spectator until next fight
  ];
}
