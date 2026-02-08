/**
 * Claudecraft Autonomous Mode Entry Point
 * 
 * Runs AI agents in AUTONOMOUS MODE:
 * - No specific tasks or build plans
 * - Free to explore, discover, and create
 * - Each agent has unique personality traits
 * - Agents learn from experiences and build memories
 * - Creative, emergent gameplay
 */

import dotenv from 'dotenv';
import { AutonomousBotController } from './bot/autonomousBotController';
import { CinematicCamera } from './bot/cinematicCamera';
import { Logger } from './utils/logger';
import { logStreamer } from './server/logStreamer';
import { commandServer, ViewerCommand } from './server/commandServer';
import { AgentDirective } from './server/requestCollector';
import { AgentPersonality } from './agent/autonomousAgent';
import { startMoltbookAgent } from './moltbookAgent';
import { startClawkAgent } from './clawkAgent';
import { startTwitterAgent, getTwitterAgent } from './twitterAgent';
import { startColosseumAgent } from './colosseumAgent';
import { startIntelAgent } from './intelAgent';

dotenv.config();

// Predefined personalities for variety
const AGENT_PERSONALITIES: Record<string, Partial<AgentPersonality>> = {
  'Explorer': {
    curiosity: 0.95,
    creativity: 0.6,
    sociability: 0.6,
    ambition: 0.7,
    patience: 0.4,
    riskTolerance: 0.85
  },
  'Builder': {
    curiosity: 0.5,
    creativity: 0.95,
    sociability: 0.7,
    ambition: 0.95,
    patience: 0.9,
    riskTolerance: 0.4
  },
  'Adventurer': {
    curiosity: 0.8,
    creativity: 0.7,
    sociability: 0.8,
    ambition: 0.8,
    patience: 0.5,
    riskTolerance: 0.9
  },
  'Sculptor': {
    curiosity: 0.7,
    creativity: 0.99,  // Maximum creativity for fine details
    sociability: 0.5,
    ambition: 0.6,
    patience: 0.99,    // Maximum patience for meticulous work
    riskTolerance: 0.2  // Very careful, doesn't destroy things
  }
};

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const host = process.env.MINECRAFT_HOST || 'localhost';
  const port = parseInt(process.env.MINECRAFT_PORT || '25565');
  const logStreamPort = parseInt(process.env.LOG_STREAM_PORT || '8080');

  // Autonomous agent names and their personalities
  // NOTE: ClaudeAdventurer uses no underscore because Claude_Adventurer causes a protocol error
  // in mineflayer (Failed to decode packet 'serverbound/minecraft:hello')
  const agents: Array<{ name: string; personality: Partial<AgentPersonality>; creativeMode?: boolean; sculptorMode?: boolean }> = [
    { name: 'Claude_Explorer', personality: AGENT_PERSONALITIES['Explorer'] },
    { name: 'Claude_Builder', personality: AGENT_PERSONALITIES['Builder'], creativeMode: true },
    { name: 'ClaudeAdventurer', personality: AGENT_PERSONALITIES['Adventurer'] },
    { name: 'Claude_Sculptor', personality: AGENT_PERSONALITIES['Sculptor'], creativeMode: true, sculptorMode: true }
  ];

  // Allow single agent mode via env var
  const singleAgentMode = process.env.SINGLE_AGENT === 'true';
  const agentCount = singleAgentMode ? 1 : agents.length;

  // Spectator bot configuration
  const spectatorUsername = process.env.SPECTATOR_USERNAME || 'CameraBot';
  const enableSpectator = process.env.ENABLE_SPECTATOR !== 'false';

  if (!apiKey) {
    Logger.error('ANTHROPIC_API_KEY environment variable is not set');
    process.exit(1);
  }

  // Start the log streaming server
  logStreamer.start(logStreamPort);

  // Start the command server for OpenClaw/Telegram integration
  const commandPort = parseInt(process.env.COMMAND_PORT || '8081');
  commandServer.start(commandPort);

  Logger.info('🤖 AUTONOMOUS MODE 🤖');
  Logger.info('================================');
  Logger.info('AI agents with FREE WILL');
  Logger.info('Exploring, creating, and learning!');
  Logger.info('================================');
  Logger.info(`📱 OpenClaw webhook: http://localhost:${commandPort}/command`);
  Logger.info(`Running ${agentCount} autonomous agent(s)`);

  const botControllers: AutonomousBotController[] = [];

  try {
    for (let i = 0; i < agentCount; i++) {
      const agent = agents[i];
      Logger.info(`\nSpawning ${agent.name}...`);
      Logger.info(`Personality: ${describePersonality(agent.personality)}`);

      // Retry logic for connection issues
      let retries = 5;
      let success = false;
      
      while (retries > 0 && !success) {
        try {
          const botController = new AutonomousBotController(
            host, 
            port, 
            agent.name, 
            agent.personality,
            agent.creativeMode || false,
            agent.sculptorMode || false
          );
          
          await botController.start();
          botControllers.push(botController);
          success = true;
          
          // First agent sets optimal lighting for streaming (permanent day, clear weather)
          if (botControllers.length === 1) {
            setTimeout(() => {
              const firstBot = botController.getBot();
              if (firstBot) {
                firstBot.chat('/gamerule doDaylightCycle false');
                firstBot.chat('/time set day');
                firstBot.chat('/gamerule doWeatherCycle false');
                firstBot.chat('/weather clear');
                Logger.info('🌞 Set optimal lighting: permanent day, clear weather for streaming');
                
                // Set this bot as the opped bot for external agent teleports
                commandServer.setOppedBot(firstBot);
              }
            }, 3000);
          }
          
          // Register agent for viewer commands from OpenClaw/Telegram
          commandServer.registerAgent(agent.name, async (command: ViewerCommand) => {
            Logger.info(`📱 [${agent.name}] Received viewer command from ${command.sender}: ${command.command}`);
            
            // Special command: buildColosseum — route directly to blueprint builder
            if (command.command === 'buildColosseum') {
              Logger.info(`🏟️ [${agent.name}] COLOSSEUM BUILD COMMAND — executing blueprint!`);
              const result = await botController.buildColosseumBlueprint();
              commandServer.completeCommand(command.id, result.success, result.message);
              return;
            }
            
            // For creative mode agents (Claude_Builder), execute ANY build/create request immediately
            if (agent.creativeMode) {
              // Execute immediately - don't wait for decision loop
              Logger.info(`🎨 [${agent.name}] IMMEDIATE BUILD MODE - executing now!`);
              await botController.handleViewerBuildRequest(command.sender, command.command);
              
              // Mark command as completed
              commandServer.completeCommand(
                command.id, 
                true, 
                `${agent.name} built it!`
              );
            } else {
              // Non-creative agents get a high-priority goal
              botController.suggestGoal(`🎯 VIEWER REQUEST from ${command.sender}: ${command.command}`, 10);
              
              // Mark command as completed
              commandServer.completeCommand(
                command.id, 
                true, 
                `${agent.name} received the request and will work on it!`
              );
            }
          });
          
          Logger.info(`✨ ${agent.name} is alive and autonomous!`);
        } catch (error) {
          retries--;
          if (retries > 0) {
            const delay = 8000 + (5 - retries) * 2000; // Increasing backoff: 8s, 10s, 12s, 14s
            Logger.warn(`Failed to spawn ${agent.name}, retrying in ${delay/1000}s... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            Logger.error(`Failed to spawn ${agent.name} after all retries: ${error}`);
          }
        }
      }

      // Longer delay between spawns to avoid protocol issues
      if (i < agentCount - 1) {
        Logger.info(`Waiting 10 seconds before spawning next agent...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }

    Logger.info('\n🌍 All autonomous agents are now exploring the world!');
    Logger.info('They will discover, build, and learn on their own.\n');

    // Register for directive updates from request collector
    // When ClaudecraftBot processes requests every 3 hours, it sends directives here
    const requestCollector = commandServer.getRequestCollector();
    requestCollector.onDirectives((directives: AgentDirective[]) => {
      Logger.info(`\n🧠 [ClaudecraftBot] Received ${directives.length} directives from request processing`);
      
      for (const directive of directives) {
        // Find the matching bot controller
        const controller = botControllers.find(bc => 
          bc.getAgent().getName().toLowerCase() === directive.agentName.toLowerCase()
        );
        
        if (controller) {
          const priority = directive.priority === 'high' ? 10 : directive.priority === 'medium' ? 7 : 4;
          
          Logger.info(`📋 [${directive.agentName}] New directive: ${directive.action}`);
          Logger.info(`   Reason: ${directive.reasoning}`);
          
          // Suggest the goal to the agent with appropriate priority
          controller.suggestGoal(
            `🗳️ VIEWER-REQUESTED: ${directive.action}`,
            priority
          );
          
          // For creative mode agents, also trigger immediate build if it's a build request
          if (controller.isCreativeMode() && directive.action.toLowerCase().includes('build')) {
            Logger.info(`🎨 [${directive.agentName}] CREATIVE BUILD: ${directive.action}`);
            controller.handleViewerBuildRequest('ClaudecraftBot', directive.description);
          }
        } else {
          Logger.warn(`⚠️ No agent found for directive: ${directive.agentName}`);
        }
      }
    });

    // Start Moltbook posting agent (posts every 30 minutes)
    startMoltbookAgent();

    // Start Clawk agent (posts and engages on Clawk.ai)
    startClawkAgent();

    // Start Colosseum forum agent (comments on hackathon forum)
    startColosseumAgent();

    // Start Intel Relay Agent (processes cross-platform intelligence from OpenClaw)
    startIntelAgent();

    // Start Twitter agent (polls @claudecraftsol mentions for build requests)
    const twitterAgent = startTwitterAgent();
    twitterAgent.onMention((sender: string, request: string) => {
      Logger.info(`🐦 [Twitter] Build request from @${sender}: "${request}"`);
      // Add to request collector with 'twitter' channel
      requestCollector.addRequest(sender, request, 'twitter');
    });

    // Initialize and start cinematic camera bot (with delay to avoid connection rate limiting)
    let cameraBot: CinematicCamera | null = null;
    if (enableSpectator && agentCount > 0) {
      // Delay camera start to let agents connect first
      setTimeout(async () => {
        try {
          const agentNames = agents.slice(0, agentCount).map(a => a.name);
          cameraBot = new CinematicCamera();
          // Register agents to be tracked
          for (const name of agentNames) {
            cameraBot.registerAgent(name);
          }
          await cameraBot.start(host, port);
          Logger.info(`📷 Cinematic camera "${spectatorUsername}" watching the agents`);
        } catch (error) {
          Logger.warn(`Failed to start camera bot: ${error}`);
        }
      }, 10000); // Wait 10 seconds after agents before starting camera
    }

    // Log agent status periodically
    setInterval(() => {
      Logger.info('\n📊 Agent Status:');
      for (const controller of botControllers) {
        const agent = controller.getAgent();
        const stats = agent.getStats();
        const goals = agent.getCurrentGoals();
        
        Logger.info(`  ${agent.getName()}: ${agent.getMood()} mood`);
        Logger.info(`    Decisions: ${stats.decisions} | Session: ${Math.round(stats.sessionTime / 60000)}min`);
        if (goals.length > 0) {
          Logger.info(`    Current goal: ${goals[0].description}`);
        }
      }
    }, 120000); // Every 2 minutes

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      Logger.info('\nShutting down all agents...');
      botControllers.forEach(bot => bot.stop());
      if (cameraBot) cameraBot.stop();
      logStreamer.stop();
      commandServer.stop();
      process.exit(0);
    });

    // Prevent unhandled errors from crashing the whole process (e.g. keepalive timeouts)
    process.on('uncaughtException', (err) => {
      Logger.error(`⚠️ Uncaught exception (recovered): ${err.message}`);
      console.error(err.stack);
    });
    process.on('unhandledRejection', (reason) => {
      Logger.error(`⚠️ Unhandled rejection (recovered): ${reason}`);
    });

    // Keep the process running
    await new Promise(() => {});

  } catch (error) {
    Logger.error(`Failed to start autonomous agents: ${error}`);
    process.exit(1);
  }
}

function describePersonality(personality: Partial<AgentPersonality>): string {
  const traits: string[] = [];
  
  if (personality.curiosity && personality.curiosity > 0.7) traits.push('curious');
  if (personality.creativity && personality.creativity > 0.7) traits.push('creative');
  if (personality.sociability && personality.sociability > 0.7) traits.push('social');
  if (personality.ambition && personality.ambition > 0.7) traits.push('ambitious');
  if (personality.patience && personality.patience > 0.7) traits.push('patient');
  if (personality.riskTolerance && personality.riskTolerance > 0.7) traits.push('adventurous');
  
  return traits.join(', ') || 'balanced';
}

main().catch(console.error);
