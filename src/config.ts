/**
 * Centralized configuration for Claudecraft
 * All magic numbers and constants should live here
 */

export const CONFIG = {
  // API Configuration
  api: {
    model: 'claude-sonnet-4-20250514',
    maxTokens: 1024, // Enough for full JSON responses with optional fields
    timeoutMs: 30000,
  },

  // Bot Configuration
  bot: {
    version: '1.21.4',
    connectionTimeoutMs: 30000,
    reconnectMaxAttempts: 10,
    reconnectBaseDelayMs: 2000,
    reconnectMaxDelayMs: 60000,
  },

  // Decision Loop Configuration
  decisionLoop: {
    autonomousIntervalMs: 10000,
    survivalIntervalMs: 12000,
    staggerMaxMs: 2000,
  },

  // Action Configuration
  actions: {
    timeoutMs: 15000,
    pathfinderTimeoutMs: 15000,
  },

  // Memory Configuration
  memory: {
    maxMemories: 500,
    relevanceThreshold: 2,
    consolidationLimit: 100,
  },

  // Build Configuration
  build: {
    defaultBatchSize: 20,
    progressLogIntervalMs: 60000,
  },

  // Spectator Configuration
  spectator: {
    rotationIntervalMs: 60000,
    initialDelayMs: 3000,
    stuckCheckIntervalMs: 3000,
    maxStuckAttempts: 3,
  },

  // Stuck Detection Configuration
  stuck: {
    failureThreshold: 2,
    positionHistoryDurationMs: 30000,
    minPositionCheckCount: 3,
    minMovementDistance: 1,
    staleGoalDurationMs: 600000, // 10 minutes
  },

  // WebSocket Configuration
  websocket: {
    defaultPort: 8080,
    messageBufferSize: 100,
  },
} as const;

// Environment configuration with defaults
export function getEnvConfig() {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    minecraftHost: process.env.MINECRAFT_HOST || 'localhost',
    minecraftPort: parseInt(process.env.MINECRAFT_PORT || '25565'),
    logStreamPort: parseInt(process.env.LOG_STREAM_PORT || '8080'),
    spectatorUsername: process.env.SPECTATOR_USERNAME || 'CameraBot',
    enableSpectator: process.env.ENABLE_SPECTATOR !== 'false',
    singleAgentMode: process.env.SINGLE_AGENT === 'true',
  };
}

// Validate required environment variables
export function validateEnv(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY environment variable is not set');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
