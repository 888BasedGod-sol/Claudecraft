/**
 * Claudecraft - Main Entry Point
 * 
 * AI-powered Minecraft agents with personality and autonomy.
 * 
 * Modes:
 * - npm run auto: Autonomous agents with free will
 * - npm run survival: Survival mode castle builders
 * 
 * This file serves as the default entry point.
 * See autonomousMode.ts and survivalMode.ts for specific modes.
 */

import dotenv from 'dotenv';
import { validateEnv, getEnvConfig } from './config';
import { logger } from './utils/unifiedLogger';

dotenv.config();

async function main() {
  logger.info('🏰 Claudecraft - AI Minecraft Agents');
  logger.info('=====================================');
  logger.info('');
  logger.info('Available modes:');
  logger.info('  npm run auto     - Autonomous agents with free will');
  logger.info('  npm run survival - Survival mode castle builders');
  logger.info('');
  
  const validation = validateEnv();
  if (!validation.valid) {
    logger.error('Environment validation failed:');
    validation.errors.forEach(err => logger.error(`  - ${err}`));
    process.exit(1);
  }

  const config = getEnvConfig();
  logger.info(`Minecraft server: ${config.minecraftHost}:${config.minecraftPort}`);
  logger.info(`WebSocket port: ${config.logStreamPort}`);
  logger.info('');
  logger.info('Run one of the modes above to start!');
}

main().catch(error => {
  logger.error('Fatal error', error);
  process.exit(1);
});
