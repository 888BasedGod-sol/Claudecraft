/**
 * Claudecraft Survival Mode Entry Point
 * 
 * Runs 3 builder bots in SURVIVAL MODE:
 * - No operator commands
 * - Must walk everywhere
 * - Must mine resources
 * - Must craft materials
 * - Must place blocks from inventory
 */

import dotenv from 'dotenv';
import { SurvivalBuilderBotController } from './bot/survivalBuilderBotController';
import { SpectatorBot } from './bot/spectatorBot';
import { Logger } from './utils/logger';
import { sleep } from './utils/helpers';
import { logStreamer } from './server/logStreamer';
import { buildCoordinator } from './building/buildCoordinator';
import { CASTLE_INFO } from './building/castlePlan';

dotenv.config();

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const host = process.env.MINECRAFT_HOST || 'localhost';
  const port = parseInt(process.env.MINECRAFT_PORT || '25565');
  const logStreamPort = parseInt(process.env.LOG_STREAM_PORT || '8080');

  // Survival builder bot names
  const builderNames = ['ClaudeAgent1', 'ClaudeAgent2', 'ClaudeAgent3'];

  // Spectator bot configuration
  const spectatorUsername = process.env.SPECTATOR_USERNAME || 'CameraBot';
  const enableSpectator = process.env.ENABLE_SPECTATOR !== 'false';

  if (!apiKey) {
    Logger.error('ANTHROPIC_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Start the log streaming server
  logStreamer.start(logStreamPort);

  // Initialize the castle blueprint
  buildCoordinator.initialize();

  Logger.info('🏰 SURVIVAL MODE CASTLE BUILD 🏰');
  Logger.info('================================');
  Logger.info('NO CHEATS - NO OPERATOR COMMANDS');
  Logger.info('Bots must GATHER, CRAFT, and BUILD!');
  Logger.info('================================');
  Logger.info(`Location: (${CASTLE_INFO.origin.x}, ${CASTLE_INFO.origin.y}, ${CASTLE_INFO.origin.z})`);
  Logger.info(`Size: ${CASTLE_INFO.dimensions.width}x${CASTLE_INFO.dimensions.length} blocks`);
  Logger.info(`Total blocks to place: ${buildCoordinator.getProgress().totalBlocks}`);

  const botControllers: SurvivalBuilderBotController[] = [];

  try {
    Logger.info(`\nStarting ${builderNames.length} SURVIVAL builders: ${builderNames.join(', ')}...`);
    Logger.info('⚠️  These bots will MINE their own resources!\n');

    // Create and start all builder bots
    for (let i = 0; i < builderNames.length; i++) {
      const botController = new SurvivalBuilderBotController(host, port, builderNames[i]);
      await botController.start();
      botControllers.push(botController);
      Logger.info(`⛏️  Miner ${i + 1}/${builderNames.length} (${builderNames[i]}) spawned!`);

      // Add delay between bot spawns
      if (i < builderNames.length - 1) {
        await sleep(3000);
      }
    }

    Logger.info('\n🏗️ All survival builders ready!');
    Logger.info('They will now gather resources and build the castle...\n');

    // Initialize and start spectator bot
    let spectatorBot: SpectatorBot | null = null;
    if (enableSpectator && builderNames.length > 0) {
      try {
        spectatorBot = new SpectatorBot(builderNames);
        await spectatorBot.initialize(host, port, spectatorUsername);
        spectatorBot.start();
        Logger.info(`📷 Spectator bot "${spectatorUsername}" watching the builders`);
      } catch (error) {
        Logger.warn(`Failed to start spectator bot: ${error}`);
      }
    }

    // Log progress periodically
    setInterval(() => {
      const progress = buildCoordinator.getProgress();
      Logger.info(`🏰 Castle Progress: ${progress.percentComplete}% (${progress.placedBlocks}/${progress.totalBlocks} blocks)`);
    }, 60000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      Logger.info('\nShutting down all bots...');
      botControllers.forEach(bot => bot.stop());
      if (spectatorBot) spectatorBot.stop();
      logStreamer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      Logger.info('\nShutting down all bots...');
      botControllers.forEach(bot => bot.stop());
      if (spectatorBot) spectatorBot.stop();
      logStreamer.stop();
      process.exit(0);
    });

  } catch (error) {
    Logger.error('Fatal error', error);
    process.exit(1);
  }
}

main();
