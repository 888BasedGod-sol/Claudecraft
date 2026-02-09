/**
 * Direct Super Bowl Stadium Builder - bypasses autonomous loop
 * Run with: npx ts-node scripts/build-superbowl.ts
 */

import mineflayer from 'mineflayer';
import { generateSuperbowlBlueprint, SUPERBOWL_INFO } from '../src/building/superbowlStadiumPlan';

const HOST = 'localhost';
const PORT = 25565;

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function buildStadium() {
  console.log('🏈 Super Bowl Stadium Builder - Connecting...');
  
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: 'StadiumBuilder',
    version: '1.21.4'
  });

  bot.on('spawn', async () => {
    console.log('✅ Connected to server!');
    await delay(2000);
    
    // Op ourselves
    console.log('📋 Setting up permissions...');
    
    const blueprint = generateSuperbowlBlueprint();
    const totalBlocks = blueprint.length;
    const origin = SUPERBOWL_INFO.origin;
    
    console.log(`🏈 Starting Super Bowl LX Stadium build at (${origin.x}, ${origin.y}, ${origin.z})`);
    console.log(`📐 ${SUPERBOWL_INFO.dimensions.length}x${SUPERBOWL_INFO.dimensions.width}, ${totalBlocks} blocks total`);
    
    // Teleport to build site
    bot.chat(`/tp StadiumBuilder ${origin.x + 75} ${origin.y + 50} ${origin.z + 50}`);
    await delay(2000);
    
    // Force load chunks
    const minChunkX = Math.floor((origin.x - 5) / 16) * 16;
    const maxChunkX = Math.floor((origin.x + SUPERBOWL_INFO.dimensions.length + 5) / 16) * 16;
    const minChunkZ = Math.floor((origin.z - 5) / 16) * 16;
    const maxChunkZ = Math.floor((origin.z + SUPERBOWL_INFO.dimensions.width + 5) / 16) * 16;
    
    bot.chat(`/forceload add ${minChunkX} ${minChunkZ} ${maxChunkX} ${maxChunkZ}`);
    bot.chat('📦 Force-loading chunks...');
    await delay(3000);
    
    // Clear build area
    bot.chat('🧹 Clearing stadium area...');
    const clearMinX = origin.x - 2;
    const clearMaxX = origin.x + SUPERBOWL_INFO.dimensions.length + 2;
    const clearMinZ = origin.z - 2;
    const clearMaxZ = origin.z + SUPERBOWL_INFO.dimensions.width + 2;
    
    for (let y = origin.y - 3; y <= origin.y + 40; y += 10) {
      const yEnd = Math.min(y + 9, origin.y + 40);
      bot.chat(`/fill ${clearMinX} ${y} ${clearMinZ} ${clearMaxX} ${yEnd} ${clearMaxZ} minecraft:air`);
      await delay(200);
    }
    
    bot.chat('✅ Area cleared!');
    await delay(1000);
    
    // Sort by priority
    blueprint.sort((a, b) => a.priority - b.priority);
    
    let blocksPlaced = 0;
    let currentSection = '';
    const startTime = Date.now();
    
    const BATCH_SIZE = 50;
    const BATCH_DELAY = 100;
    
    for (let i = 0; i < blueprint.length; i++) {
      const block = blueprint[i];
      
      if (block.section !== currentSection) {
        currentSection = block.section;
        bot.chat(`⚒️ Building: ${currentSection}`);
        console.log(`[BUILD] Section: ${currentSection}`);
      }
      
      const blockName = `minecraft:${block.blockType.replace('minecraft:', '')}`;
      bot.chat(`/setblock ${block.x} ${block.y} ${block.z} ${blockName}`);
      blocksPlaced++;
      
      if (blocksPlaced % BATCH_SIZE === 0) {
        await delay(BATCH_DELAY);
      }
      
      if (blocksPlaced % 5000 === 0) {
        const pct = Math.round((blocksPlaced / totalBlocks) * 100);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        bot.chat(`📊 ${pct}% complete (${blocksPlaced}/${totalBlocks}) — ${elapsed}s`);
        console.log(`[BUILD] ${pct}% — ${blocksPlaced}/${totalBlocks}`);
      }
    }
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    bot.chat(`🏈 ✅ SUPER BOWL STADIUM COMPLETE! ${blocksPlaced} blocks in ${totalTime}s!`);
    bot.chat(`🏈 IT'S GAME TIME! Welcome to Super Bowl LX!`);
    console.log(`\n✅ Stadium complete: ${blocksPlaced} blocks in ${totalTime}s`);
    
    // Remove forceload
    bot.chat(`/forceload remove ${minChunkX} ${minChunkZ} ${maxChunkX} ${maxChunkZ}`);
    
    await delay(2000);
    bot.quit();
    process.exit(0);
  });

  bot.on('error', (err) => {
    console.error('Bot error:', err);
  });

  bot.on('kicked', (reason) => {
    console.log('Kicked:', reason);
    process.exit(1);
  });
}

buildStadium().catch(console.error);
