/**
 * Survival Builder Actions - Resource gathering and building without operator commands
 * 
 * Bots must:
 * 1. Walk/pathfind (no teleporting)
 * 2. Mine resources (stone, wood, etc.)
 * 3. Smelt ores and craft items
 * 4. Place blocks from inventory
 */

import { Bot } from 'mineflayer';
import { Movements, goals } from 'mineflayer-pathfinder';
import { buildCoordinator } from '../building/buildCoordinator';
import { Vec3 } from 'vec3';

const { GoalNear, GoalBlock, GoalGetToBlock } = goals;

// Material mappings - what to mine to get building materials
const MATERIAL_SOURCES: Record<string, { mine: string[], craft?: string, smelt?: string }> = {
  'stone': { mine: ['stone'] },  // Mining stone gives cobblestone
  'cobblestone': { mine: ['stone', 'cobblestone'] },
  'stone_bricks': { mine: ['stone'], craft: 'stone_bricks' },
  'deepslate_bricks': { mine: ['deepslate'], craft: 'deepslate_bricks' },
  'polished_andesite': { mine: ['andesite'], craft: 'polished_andesite' },
  'andesite': { mine: ['andesite'] },
  'chiseled_stone_bricks': { mine: ['stone'], craft: 'chiseled_stone_bricks' },
  'dark_oak_planks': { mine: ['dark_oak_log'], craft: 'dark_oak_planks' },
  'dark_oak_log': { mine: ['dark_oak_log'] },
  'oak_log': { mine: ['oak_log'] },
  'glass_pane': { mine: ['sand'], smelt: 'glass', craft: 'glass_pane' },
  'stone_brick_stairs': { mine: ['stone'], craft: 'stone_brick_stairs' },
  'stone_brick_slab': { mine: ['stone'], craft: 'stone_brick_slab' },
  'stone_brick_wall': { mine: ['stone'], craft: 'stone_brick_wall' },
  'oak_planks': { mine: ['oak_log'], craft: 'oak_planks' },
  'coal': { mine: ['coal_ore', 'deepslate_coal_ore'] },  // For torches
  'stick': { mine: ['oak_log', 'dark_oak_log'], craft: 'stick' },  // For torches
  'torch': { mine: ['coal_ore'], craft: 'torch' },  // Lighting
};

export interface ActionResult {
  success: boolean;
  message: string;
  data?: any;
}

export class SurvivalBuilderActions {
  private bot: Bot;
  private mcData: any;
  private movements: Movements;
  private buildingInProgress: boolean = false;
  private inventory: Map<string, number> = new Map();

  constructor(bot: Bot) {
    this.bot = bot;
    this.mcData = require('minecraft-data')(bot.version);
    
    // Setup pathfinder movements
    this.movements = new Movements(bot);
    this.movements.allowSprinting = true;
    this.movements.canDig = true; // Allow digging for pathfinding
    this.movements.allow1by1towers = true;
    this.movements.scafoldingBlocks = [];
  }

  /**
   * Place a torch for light when underground or in dark areas
   * Will craft torches from coal + sticks if needed
   */
  private async placeTorchIfUnderground(): Promise<void> {
    try {
      const pos = this.bot.entity.position;
      
      // Place torches when underground (y < 62) or in dark areas
      const blockAtPos = this.bot.blockAt(pos);
      const blockLight = blockAtPos?.light ?? 15;
      const skyLight = blockAtPos?.skyLight ?? 15;
      const isDark = blockLight < 10 && skyLight < 10;
      
      if (pos.y >= 62 && !isDark) return;
      
      // Check if we have torches
      const torch = this.bot.inventory.items().find(item => item.name === 'torch');
      
      if (!torch) {
        // Try to craft torches if we have coal and sticks
        const coal = this.bot.inventory.items().find(item => 
          item.name === 'coal' || item.name === 'charcoal'
        );
        const sticks = this.bot.inventory.items().find(item => item.name === 'stick');
        
        if (coal && sticks) {
          // Craft torches (1 coal + 1 stick = 4 torches)
          try {
            const torchRecipe = this.bot.recipesFor(this.mcData.itemsByName['torch'].id, null, 1, null)[0];
            if (torchRecipe) {
              await this.bot.craft(torchRecipe, 1);
              console.log(`[TORCH] ${this.bot.username} crafted torches`);
            }
          } catch (e) {
            // Can't craft torches
          }
        }
        return; // No torches available
      }
      
      // Find a suitable wall block to place torch on
      const directions = [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
      ];
      
      for (const dir of directions) {
        const wallPos = pos.offset(dir.x, 0, dir.z);
        const wallBlock = this.bot.blockAt(wallPos);
        
        // Check if there's a solid block to place torch on
        if (wallBlock && wallBlock.name !== 'air' && wallBlock.name !== 'water' && wallBlock.name !== 'lava') {
          // Check if the space in front of the wall is air (where torch would go)
          const torchPos = pos.offset(-dir.x * 0.5, 0, -dir.z * 0.5);
          const torchBlock = this.bot.blockAt(torchPos);
          
          if (torchBlock && torchBlock.name === 'air') {
            try {
              await this.bot.equip(torch, 'hand');
              await this.bot.placeBlock(wallBlock, new Vec3(-dir.x, 0, -dir.z));
              console.log(`[TORCH] ${this.bot.username} placed torch at y=${Math.floor(pos.y)}`);
              return;
            } catch (e) {
              // Try next direction
            }
          }
        }
      }
      
      // If no wall found, try placing on ground
      const groundPos = pos.offset(0, -1, 0);
      const groundBlock = this.bot.blockAt(groundPos);
      if (groundBlock && groundBlock.name !== 'air') {
        try {
          await this.bot.equip(torch, 'hand');
          await this.bot.placeBlock(groundBlock, new Vec3(0, 1, 0));
          console.log(`[TORCH] ${this.bot.username} placed torch on ground at y=${Math.floor(pos.y)}`);
        } catch (e) {
          // Couldn't place torch
        }
      }
    } catch (error) {
      // Silently fail - torches are nice to have but not critical
    }
  }

  // Execute an action based on the agent's decision
  async executeAction(action: string, parameters: any = {}): Promise<ActionResult> {
    try {
      switch (action) {
        case 'gatherResources':
          return await this.gatherResources(parameters.material, parameters.count || 32);
        case 'mineBlock':
          return await this.mineBlock(parameters.blockType);
        case 'craftItem':
          return await this.craftItem(parameters.item, parameters.count || 1);
        case 'buildNext':
          return await this.buildNextBlock();
        case 'buildBatch':
          return await this.buildBatch(parameters.count || 10);
        case 'goToBuildSite':
          return await this.goToBuildSite();
        case 'placeBlock':
          return await this.placeBlockFromInventory(parameters.x, parameters.y, parameters.z, parameters.blockType);
        case 'goToPosition':
          return await this.goToPosition(parameters.x, parameters.y, parameters.z);
        case 'getProgress':
          return await this.getProgress();
        case 'checkInventory':
          return await this.checkInventory();
        case 'findResources':
          return await this.findNearbyResources(parameters.blockType);
        case 'chat':
          this.bot.chat(parameters.message);
          return { success: true, message: `Said: ${parameters.message}` };
        case 'wait':
          await this.sleep(parameters.duration || 1000);
          return { success: true, message: `Waited ${parameters.duration || 1000}ms` };
        
        // Unstuck / Recovery actions
        case 'unstuck':
          return await this.unstuck();
        case 'digDown':
          return await this.digDown(parameters.depth || 3);
        case 'digUp':
          return await this.digUp(parameters.height || 5);
        case 'digForward':
          return await this.digForward();
        case 'moveRandom':
          return await this.moveRandom();
        case 'jump':
          return await this.jump();
        case 'lookAround':
          return await this.lookAround();
        
        default:
          return { success: false, message: `Unknown action: ${action}` };
      }
    } catch (error: any) {
      console.error(`[ACTION ERROR] ${action}:`, error.message);
      return { success: false, message: `Error: ${error.message}` };
    }
  }

  // Check current inventory
  async checkInventory(): Promise<ActionResult> {
    const items = this.bot.inventory.items();
    const inventory: Record<string, number> = {};
    
    for (const item of items) {
      inventory[item.name] = (inventory[item.name] || 0) + item.count;
    }

    // Count building materials
    const buildingMaterials = [
      'stone_bricks', 'deepslate_bricks', 'polished_andesite', 
      'chiseled_stone_bricks', 'dark_oak_planks', 'glass_pane',
      'cobblestone', 'stone', 'oak_planks', 'dark_oak_log', 'oak_log'
    ];

    let summary = '📦 INVENTORY:\n';
    for (const mat of buildingMaterials) {
      if (inventory[mat]) {
        summary += `  ${mat}: ${inventory[mat]}\n`;
      }
    }
    
    // Also show raw materials
    const rawMaterials = ['cobblestone', 'stone', 'andesite', 'deepslate', 'sand', 'dark_oak_log', 'oak_log'];
    summary += '\n🪨 RAW MATERIALS:\n';
    for (const mat of rawMaterials) {
      if (inventory[mat]) {
        summary += `  ${mat}: ${inventory[mat]}\n`;
      }
    }

    // Show tools
    const tools = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'wooden_axe', 'stone_axe'];
    summary += '\n🔧 TOOLS:\n';
    for (const tool of tools) {
      if (inventory[tool]) {
        summary += `  ${tool}: ${inventory[tool]}\n`;
      }
    }

    return {
      success: true,
      message: summary,
      data: inventory
    };
  }

  // Find nearby resources of a specific type
  async findNearbyResources(blockType: string): Promise<ActionResult> {
    const searchRadius = 64;
    const blockId = this.mcData.blocksByName[blockType]?.id;
    
    if (!blockId) {
      return { success: false, message: `Unknown block type: ${blockType}` };
    }

    const blocks = this.bot.findBlocks({
      matching: blockId,
      maxDistance: searchRadius,
      count: 10
    });

    if (blocks.length === 0) {
      return { 
        success: false, 
        message: `No ${blockType} found within ${searchRadius} blocks` 
      };
    }

    const nearest = blocks[0];
    return {
      success: true,
      message: `Found ${blocks.length} ${blockType} nearby. Nearest at (${nearest.x}, ${nearest.y}, ${nearest.z})`,
      data: { blocks, nearest }
    };
  }

  // Gather resources for building
  async gatherResources(material: string, count: number = 32): Promise<ActionResult> {
    const source = MATERIAL_SOURCES[material];
    if (!source) {
      return { success: false, message: `Unknown material: ${material}` };
    }

    let gathered = 0;
    const targetBlocks = source.mine;

    for (const blockType of targetBlocks) {
      const blockId = this.mcData.blocksByName[blockType]?.id;
      if (!blockId) continue;

      // Find and mine blocks
      while (gathered < count) {
        const blocks = this.bot.findBlocks({
          matching: blockId,
          maxDistance: 64,
          count: 1
        });

        if (blocks.length === 0) {
          break; // No more of this type nearby
        }

        const targetPos = blocks[0];
        
        // Navigate to the block
        try {
          const pathfinder = this.bot.pathfinder;
          if (pathfinder) {
            pathfinder.setMovements(this.movements);
            await pathfinder.goto(new GoalGetToBlock(targetPos.x, targetPos.y, targetPos.z));
          }
        } catch (e) {
          // Continue even if pathfinding fails
        }

        // Mine the block
        const block = this.bot.blockAt(new Vec3(targetPos.x, targetPos.y, targetPos.z));
        if (block) {
          try {
            await this.bot.dig(block);
            gathered++;
            
            // Place torch every 4 blocks mined when underground (more frequent for better lighting)
            if (gathered % 4 === 0) {
              await this.placeTorchIfUnderground();
            }
          } catch (e) {
            // Skip if can't mine
          }
        }

        await this.sleep(100);
      }
    }

    return {
      success: gathered > 0,
      message: gathered > 0 
        ? `Gathered ${gathered} ${targetBlocks.join('/')}` 
        : `Could not find any ${targetBlocks.join('/')} nearby`,
      data: { gathered }
    };
  }

  // Mine a single block
  async mineBlock(blockType: string): Promise<ActionResult> {
    const blockId = this.mcData.blocksByName[blockType]?.id;
    if (!blockId) {
      return { success: false, message: `Unknown block type: ${blockType}` };
    }

    const blocks = this.bot.findBlocks({
      matching: blockId,
      maxDistance: 32,
      count: 1
    });

    if (blocks.length === 0) {
      return { success: false, message: `No ${blockType} found nearby` };
    }

    const targetPos = blocks[0];
    
    // Navigate to the block
    try {
      const pathfinder = this.bot.pathfinder;
      if (pathfinder) {
        pathfinder.setMovements(this.movements);
        await pathfinder.goto(new GoalNear(targetPos.x, targetPos.y, targetPos.z, 2));
      }
    } catch (e) {
      // Continue even if pathfinding has issues
    }

    // Mine it
    const block = this.bot.blockAt(new Vec3(targetPos.x, targetPos.y, targetPos.z));
    if (!block) {
      return { success: false, message: 'Block disappeared' };
    }

    try {
      await this.bot.dig(block);
      return { success: true, message: `Mined ${blockType} at (${targetPos.x}, ${targetPos.y}, ${targetPos.z})` };
    } catch (e: any) {
      return { success: false, message: `Failed to mine: ${e.message}` };
    }
  }

  // Craft an item
  async craftItem(itemName: string, count: number = 1): Promise<ActionResult> {
    const item = this.mcData.itemsByName[itemName];
    if (!item) {
      return { success: false, message: `Unknown item: ${itemName}` };
    }

    // Find crafting table nearby or use inventory crafting
    const craftingTable = this.bot.findBlock({
      matching: this.mcData.blocksByName['crafting_table']?.id,
      maxDistance: 32
    });

    try {
      const recipes = this.bot.recipesFor(item.id, null, 1, craftingTable ?? null);
      if (recipes.length === 0) {
        return { success: false, message: `No recipe found for ${itemName}` };
      }

      await this.bot.craft(recipes[0], count, craftingTable ?? undefined);
      return { success: true, message: `Crafted ${count}x ${itemName}` };
    } catch (e: any) {
      return { success: false, message: `Failed to craft ${itemName}: ${e.message}` };
    }
  }

  // Build the next block in the queue (survival mode)
  async buildNextBlock(): Promise<ActionResult> {
    const block = buildCoordinator.getNextBlockToPlace(this.bot.username);
    if (!block) {
      return { success: true, message: 'No more blocks to place! Castle is complete!' };
    }

    return await this.placeBlockFromInventory(block.x, block.y, block.z, block.blockType);
  }

  // Build multiple blocks in sequence (survival mode)
  async buildBatch(count: number): Promise<ActionResult> {
    this.buildingInProgress = true;
    let placed = 0;
    let errors = 0;
    let needResources: string[] = [];

    for (let i = 0; i < count; i++) {
      if (!this.buildingInProgress) break;

      const block = buildCoordinator.getNextBlockToPlace(this.bot.username);
      if (!block) {
        return {
          success: true,
          message: `Placed ${placed} blocks. No more blocks to place!`,
          data: { placed, errors }
        };
      }

      // Check if we have the material
      const hasItem = this.bot.inventory.items().find(item => item.name === block.blockType);
      if (!hasItem) {
        needResources.push(block.blockType);
        errors++;
        continue;
      }

      const result = await this.placeBlockFromInventory(block.x, block.y, block.z, block.blockType);
      if (result.success) {
        placed++;
      } else {
        errors++;
      }

      await this.sleep(250); // Slightly slower for survival mode
    }

    this.buildingInProgress = false;

    let message = `Built ${placed} blocks (${errors} errors)`;
    if (needResources.length > 0) {
      const unique = [...new Set(needResources)];
      message += `\n⚠️ Need resources: ${unique.join(', ')}`;
    }

    return {
      success: true,
      message,
      data: { placed, errors, needResources: [...new Set(needResources)] }
    };
  }

  // Go to the castle build site (walking, no teleport)
  async goToBuildSite(): Promise<ActionResult> {
    const origin = buildCoordinator.getCastleOrigin();
    return await this.goToPosition(origin.x, origin.y + 1, origin.z);
  }

  // Place a block from inventory (survival mode - no /setblock)
  async placeBlockFromInventory(x: number, y: number, z: number, blockType: string): Promise<ActionResult> {
    try {
      // Check if already placed
      if (buildCoordinator.isBlockPlaced(x, y, z)) {
        return { success: true, message: 'Block already placed' };
      }

      // Find the item in inventory
      const item = this.bot.inventory.items().find(i => i.name === blockType);
      if (!item) {
        return { 
          success: false, 
          message: `No ${blockType} in inventory. Need to gather resources!` 
        };
      }

      // Navigate close to the target position if too far
      const distance = this.bot.entity.position.distanceTo(new Vec3(x, y, z));
      if (distance > 4) {
        await this.goToPosition(x, y + 1, z);
      }

      // Equip the block
      await this.bot.equip(item, 'hand');

      // Find a reference block to place against
      const targetPos = new Vec3(x, y, z);
      const referenceBlock = this.findReferenceBlock(targetPos);
      
      if (!referenceBlock) {
        return { success: false, message: 'No reference block to place against' };
      }

      // Calculate the face to place on
      const faceVector = targetPos.minus(referenceBlock.position);

      // Place the block
      await this.bot.placeBlock(referenceBlock, faceVector);

      // Mark as placed
      buildCoordinator.markBlockPlaced(x, y, z);

      return {
        success: true,
        message: `Placed ${blockType} at (${x}, ${y}, ${z})`
      };
    } catch (error: any) {
      return { success: false, message: `Failed to place block: ${error.message}` };
    }
  }

  // Find a reference block adjacent to target position
  private findReferenceBlock(targetPos: Vec3): any {
    const offsets = [
      new Vec3(0, -1, 0), // Below
      new Vec3(0, 1, 0),  // Above
      new Vec3(1, 0, 0),  // East
      new Vec3(-1, 0, 0), // West
      new Vec3(0, 0, 1),  // South
      new Vec3(0, 0, -1), // North
    ];

    for (const offset of offsets) {
      const checkPos = targetPos.plus(offset);
      const block = this.bot.blockAt(checkPos);
      if (block && block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
        return block;
      }
    }

    return null;
  }

  // Navigate to a position (walking, no teleport)
  async goToPosition(x: number, y: number, z: number): Promise<ActionResult> {
    try {
      const pathfinder = this.bot.pathfinder;
      if (!pathfinder) {
        return { success: false, message: 'Pathfinder not available' };
      }

      pathfinder.setMovements(this.movements);
      const goal = new GoalNear(x, y, z, 2);
      
      await pathfinder.goto(goal);
      
      return { success: true, message: `Arrived at (${x}, ${y}, ${z})` };
    } catch (error: any) {
      return { success: false, message: `Failed to navigate: ${error.message}` };
    }
  }

  // Look at a position
  async lookAt(x: number, y: number, z: number): Promise<ActionResult> {
    await this.bot.lookAt(new Vec3(x, y, z));
    return { success: true, message: `Looking at (${x}, ${y}, ${z})` };
  }

  // Get build progress
  async getProgress(): Promise<ActionResult> {
    const progress = buildCoordinator.getProgress();
    const summary = buildCoordinator.getSummaryForAgent(this.bot.username);
    
    // Also include inventory status
    const inventory = await this.checkInventory();
    
    return {
      success: true,
      message: summary + '\n' + inventory.message,
      data: progress
    };
  }

  // Helper: sleep
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Stop current building
  stopBuilding(): void {
    this.buildingInProgress = false;
  }

  // ==========================================
  // UNSTUCK / RECOVERY ACTIONS - AGGRESSIVE
  // ==========================================

  // Emergency unstuck - AGGRESSIVE multi-technique recovery
  async unstuck(): Promise<ActionResult> {
    console.log(`[UNSTUCK] ${this.bot.username} attempting AGGRESSIVE emergency recovery...`);
    
    const actions: string[] = [];
    const startPos = this.bot.entity.position.clone();
    
    try {
      // 1. Stop all movement immediately
      this.bot.clearControlStates();
      actions.push('stopped');
      
      // 2. Jump repeatedly
      for (let i = 0; i < 3; i++) {
        this.bot.setControlState('jump', true);
        await this.sleep(150);
        this.bot.setControlState('jump', false);
        await this.sleep(100);
      }
      actions.push('jumped x3');
      
      // 3. Look in a completely new random direction
      const randomYaw = Math.random() * Math.PI * 2;
      await this.bot.look(randomYaw, 0, false);
      actions.push('reoriented');
      
      // 4. Try moving in multiple directions with jumps
      const directions = ['forward', 'back', 'left', 'right'] as const;
      for (const dir of directions) {
        this.bot.setControlState(dir, true);
        this.bot.setControlState('jump', true);
        await this.sleep(300);
        this.bot.clearControlStates();
        await this.sleep(100);
        
        // Check if we moved
        const moved = this.bot.entity.position.distanceTo(startPos) > 1;
        if (moved) {
          actions.push(`escaped ${dir}`);
          break;
        }
      }
      
      // 5. If still stuck, try digging around us
      const currentPos = this.bot.entity.position;
      if (currentPos.distanceTo(startPos) < 1) {
        // Try to dig blocks around us
        for (const offset of [[1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,1,0]]) {
          const blockPos = currentPos.offset(offset[0], offset[1], offset[2]);
          const block = this.bot.blockAt(blockPos);
          if (block && block.name !== 'air' && block.name !== 'bedrock' && block.name !== 'water') {
            try {
              await this.bot.dig(block);
              actions.push(`dug ${block.name}`);
              break;
            } catch { /* continue */ }
          }
        }
      }
      
      // 6. Final aggressive forward push
      this.bot.setControlState('forward', true);
      this.bot.setControlState('jump', true);
      this.bot.setControlState('sprint', true);
      await this.sleep(800);
      this.bot.clearControlStates();
      actions.push('sprint-jumped');
      
      const finalDistance = this.bot.entity.position.distanceTo(startPos);
      
      return { 
        success: finalDistance > 0.5, 
        message: `🔄 Unstuck: ${actions.join(' → ')}. Moved ${finalDistance.toFixed(1)} blocks. Now at (${Math.round(this.bot.entity.position.x)}, ${Math.round(this.bot.entity.position.y)}, ${Math.round(this.bot.entity.position.z)})` 
      };
    } catch (error: any) {
      this.bot.clearControlStates();
      return { success: false, message: `Unstuck failed: ${error.message}` };
    }
  }

  // Dig straight down to escape or find resources
  async digDown(depth: number = 3): Promise<ActionResult> {
    let dugBlocks = 0;
    
    try {
      for (let i = 0; i < depth; i++) {
        const belowPos = this.bot.entity.position.offset(0, -1 - i, 0);
        const block = this.bot.blockAt(belowPos);
        
        if (block && block.name !== 'air' && block.name !== 'bedrock') {
          await this.bot.dig(block);
          dugBlocks++;
          await this.sleep(100);
        }
      }
      
      if (dugBlocks > 0) {
        // Move down into the hole
        this.bot.setControlState('sneak', true);
        await this.sleep(300);
        this.bot.setControlState('sneak', false);
        
        // Place a torch for light when underground
        await this.placeTorchIfUnderground();
      }
      
      return { 
        success: dugBlocks > 0, 
        message: dugBlocks > 0 ? `⛏️ Dug down ${dugBlocks} blocks` : 'Nothing to dig below' 
      };
    } catch (error: any) {
      return { success: false, message: `Dig down failed: ${error.message}` };
    }
  }

  // Dig forward to clear obstacles
  async digForward(): Promise<ActionResult> {
    let dugBlocks = 0;
    
    try {
      // Get direction bot is facing
      const yaw = this.bot.entity.yaw;
      const dx = -Math.sin(yaw);
      const dz = -Math.cos(yaw);
      
      // Try to dig blocks at eye level and feet level in front
      for (const yOffset of [0, 1]) {
        const targetPos = this.bot.entity.position.offset(dx, yOffset, dz);
        const block = this.bot.blockAt(targetPos);
        
        if (block && block.name !== 'air' && block.name !== 'bedrock') {
          await this.bot.dig(block);
          dugBlocks++;
          await this.sleep(100);
        }
      }
      
      // Move forward after digging
      if (dugBlocks > 0) {
        this.bot.setControlState('forward', true);
        await this.sleep(300);
        this.bot.setControlState('forward', false);
      }
      
      return { 
        success: dugBlocks > 0, 
        message: dugBlocks > 0 ? `⛏️ Dug through ${dugBlocks} blocks and moved forward` : 'No obstacles to dig' 
      };
    } catch (error: any) {
      return { success: false, message: `Dig forward failed: ${error.message}` };
    }
  }

  // Dig straight UP to reach surface
  async digUp(height: number = 5): Promise<ActionResult> {
    let dugBlocks = 0;
    const startY = Math.floor(this.bot.entity.position.y);
    
    try {
      for (let i = 0; i < height; i++) {
        const pos = this.bot.entity.position;
        const abovePos = pos.offset(0, 2, 0); // Block above head
        const block = this.bot.blockAt(abovePos);
        
        if (block && block.name !== 'air' && block.name !== 'bedrock' && block.name !== 'water') {
          if (this.bot.canDigBlock(block)) {
            // Add timeout to prevent hanging
            const digPromise = this.bot.dig(block);
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Dig timeout')), 3000)
            );
            
            try {
              await Promise.race([digPromise, timeoutPromise]);
              dugBlocks++;
            } catch (e) {
              // Dig failed or timed out, just jump
            }
          }
        }
        
        // Jump up after clearing block above
        this.bot.setControlState('jump', true);
        await this.sleep(400);
        this.bot.setControlState('jump', false);
        await this.sleep(200);
        
        // Check if we reached surface
        const currentY = Math.floor(this.bot.entity.position.y);
        if (currentY >= 60) {
          break;
        }
      }
      
      const finalY = Math.floor(this.bot.entity.position.y);
      const message = finalY >= 60 
        ? `🌅 Reached surface at Y=${finalY}!` 
        : `⛏️ Dug up ${dugBlocks} blocks, now at Y=${finalY}`;
      
      return { success: dugBlocks > 0 || finalY > startY, message };
    } catch (error: any) {
      return { success: false, message: `Dig up failed: ${error.message}` };
    }
  }

  // Move in a random direction to get unstuck
  async moveRandom(): Promise<ActionResult> {
    try {
      // Pick random direction and distance
      const angle = Math.random() * Math.PI * 2;
      const distance = 5 + Math.random() * 10; // 5-15 blocks
      
      const targetX = this.bot.entity.position.x + Math.cos(angle) * distance;
      const targetZ = this.bot.entity.position.z + Math.sin(angle) * distance;
      const targetY = this.bot.entity.position.y;
      
      // Try to pathfind there
      const pathfinder = this.bot.pathfinder;
      pathfinder.setMovements(this.movements);
      
      const goal = new GoalNear(targetX, targetY, targetZ, 3);
      
      // Set a timeout so we don't get stuck trying to move
      const movePromise = pathfinder.goto(goal);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Movement timeout')), 5000)
      );
      
      try {
        await Promise.race([movePromise, timeoutPromise]);
        return { 
          success: true, 
          message: `🏃 Moved randomly to (${Math.round(this.bot.entity.position.x)}, ${Math.round(this.bot.entity.position.y)}, ${Math.round(this.bot.entity.position.z)})` 
        };
      } catch {
        // If pathfinding fails, just walk in that direction manually
        await this.bot.look(angle, 0, false);
        this.bot.setControlState('forward', true);
        this.bot.setControlState('jump', true);
        await this.sleep(1500);
        this.bot.clearControlStates();
        
        return { 
          success: true, 
          message: `🏃 Walked in random direction. Now at (${Math.round(this.bot.entity.position.x)}, ${Math.round(this.bot.entity.position.y)}, ${Math.round(this.bot.entity.position.z)})` 
        };
      }
    } catch (error: any) {
      this.bot.clearControlStates();
      return { success: false, message: `Random move failed: ${error.message}` };
    }
  }

  // Simple jump action
  async jump(): Promise<ActionResult> {
    try {
      this.bot.setControlState('jump', true);
      await this.sleep(300);
      this.bot.setControlState('jump', false);
      
      return { 
        success: true, 
        message: `⬆️ Jumped! Height: ${Math.round(this.bot.entity.position.y)}` 
      };
    } catch (error: any) {
      return { success: false, message: `Jump failed: ${error.message}` };
    }
  }

  // Look around to reorient
  async lookAround(): Promise<ActionResult> {
    try {
      const observations: string[] = [];
      
      // Look in 4 directions
      for (let i = 0; i < 4; i++) {
        const yaw = (i * Math.PI / 2);
        await this.bot.look(yaw, 0, false);
        await this.sleep(200);
        
        // Check what's in front
        const dx = -Math.sin(yaw);
        const dz = -Math.cos(yaw);
        const frontBlock = this.bot.blockAt(this.bot.entity.position.offset(dx * 2, 0, dz * 2));
        
        if (frontBlock && frontBlock.name !== 'air') {
          const direction = ['north', 'east', 'south', 'west'][i];
          observations.push(`${direction}: ${frontBlock.name}`);
        }
      }
      
      // Look for nearby entities
      const nearbyEntities = Object.values(this.bot.entities)
        .filter((e: any) => e.position.distanceTo(this.bot.entity.position) < 16 && e.type === 'player')
        .map((e: any) => e.username);
      
      if (nearbyEntities.length > 0) {
        observations.push(`players nearby: ${nearbyEntities.join(', ')}`);
      }
      
      return { 
        success: true, 
        message: `👀 Looked around. ${observations.length > 0 ? observations.join('; ') : 'Clear surroundings'}` 
      };
    } catch (error: any) {
      return { success: false, message: `Look around failed: ${error.message}` };
    }
  }

  // ==========================================  // Get available actions for the survival agent
  getAvailableActions(): string {
    return `
Available Actions for SURVIVAL Castle Building:

🪨 RESOURCE GATHERING:
1. gatherResources - Mine blocks for building materials
   Parameters: { "material": string, "count": number }
   Materials: stone_bricks, deepslate_bricks, polished_andesite, dark_oak_planks, cobblestone

2. mineBlock - Mine a single block nearby
   Parameters: { "blockType": string }

3. findResources - Search for resources nearby
   Parameters: { "blockType": string }

4. craftItem - Craft items at crafting table
   Parameters: { "item": string, "count": number }

🏗️ BUILDING:
5. buildNext - Place the next block from your assigned section (uses inventory)
   No parameters needed

6. buildBatch - Place multiple blocks in sequence (uses inventory)
   Parameters: { "count": number } (default: 10)

7. placeBlock - Place a specific block at coordinates
   Parameters: { "x": number, "y": number, "z": number, "blockType": string }

🚶 NAVIGATION:
8. goToBuildSite - Walk to the castle construction site
   No parameters needed

9. goToPosition - Walk to specific coordinates
   Parameters: { "x": number, "y": number, "z": number }

📊 STATUS:
10. checkInventory - Check your current inventory
    No parameters needed

11. getProgress - Check current build progress
    No parameters needed

💬 COMMUNICATION:
12. chat - Send a message to other builders
    Parameters: { "message": string }

🔄 UNSTUCK / RECOVERY:
13. unstuck - Emergency recovery (jumps, looks around, moves randomly)
    No parameters needed

14. digDown - Dig straight down to escape or find resources
    Parameters: { "depth": number } (default: 3)

15. digForward - Dig through obstacles in front of you
    No parameters needed

16. moveRandom - Move in a random direction
    No parameters needed

17. jump - Jump to get over obstacles
    No parameters needed

18. lookAround - Scan surroundings to reorient
    No parameters needed
    Parameters: { "message": string }

13. wait - Pause for a duration
    Parameters: { "duration": number } (milliseconds)

⚠️ SURVIVAL MODE RULES:
- You must GATHER resources before building
- No teleporting - you must WALK everywhere
- No /setblock commands - blocks come from YOUR INVENTORY
- Mine stone → craft stone_bricks → place blocks
- Work together with other builders!
`;
  }
}
