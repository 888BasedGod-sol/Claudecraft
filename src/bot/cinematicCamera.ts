import mineflayer, { Bot } from 'mineflayer';
import { Vec3 } from 'vec3';
import { Logger } from '../utils/unifiedLogger';

// ============================================================================
// PROFESSIONAL CINEMATIC CAMERA SYSTEM
// Features: Spring physics, 30fps updates, dynamic look-at, POV mode,
// event detection, bezier transitions, multiple shot types
// ============================================================================

// Camera configuration with spring physics parameters
const CAMERA_SETTINGS = {
  // Spring physics - RESPONSIVE following for close tracking
  SPRING_STIFFNESS: 8.0,        // Higher stiffness = tighter follow
  SPRING_DAMPING: 0.82,         // Lower damping = faster response
  POSITION_UPDATE_INTERVAL: 40, // 25 FPS for responsive updates
  
  // Angle tracking - RESPONSIVE rotation to keep agent centered
  ANGLE_SPRING_STIFFNESS: 12.0,  // Higher for faster rotation tracking
  ANGLE_SPRING_DAMPING: 0.80,    // Lower damping for quicker response
  LOCK_ON_TARGET: false,         // Use spring-based smooth rotation
  
  // Distance thresholds - tight follow
  MIN_TELEPORT_DISTANCE: 0.08,  // Teleport on small movements for tight tracking
  MAX_TELEPORT_DISTANCE: 8,     // Catch up faster if camera falls behind
  FORCE_LOS_CHECK: false,       // Don't constantly check LOS (causes stuttering)
  LOS_FAIL_TELEPORT: false,     // Don't immediately teleport when view is blocked
  
  // Shot composition - CLOSE FOLLOW with clear view
  SHOTS: {
    // Primary tracking shots - CLOSE
    follow: { distance: 2.5, heightOffset: 1.5, fov: 75 },       // Close follow behind
    closeBehind: { distance: 2, heightOffset: 1, fov: 80 },     // Very close behind
    
    // Dynamic action shots - TIGHT
    shoulder: { distance: 1.5, heightOffset: 0.4, fov: 85 },    // Tight shoulder
    action: { distance: 2, heightOffset: 0.8, fov: 82 },        // Close action
    
    // Dramatic angles - CLOSER
    lowAngle: { distance: 2.5, heightOffset: -0.3, fov: 78 },   // Close hero shot
    highAngle: { distance: 3, heightOffset: 2.5, fov: 70 },     // Closer from above
    overhead: { distance: 2.5, heightOffset: 4, fov: 65 },      // Closer bird's eye
    
    // Wide shots - REDUCED
    wide: { distance: 4, heightOffset: 2, fov: 70 },            // Medium establishing
    ultraWide: { distance: 6, heightOffset: 3, fov: 60 },       // Medium wide
    
    // Specialty shots - TIGHTER
    side: { distance: 2, heightOffset: 1, fov: 78 },            // Close side profile
    dutch: { distance: 2.5, heightOffset: 1.5, fov: 75 },       // Close dutch angle
    orbit: { distance: 3, heightOffset: 1.5, fov: 72 },         // Close orbit
    
    // Multi-agent - CLOSER
    group: { distance: 5, heightOffset: 2.5, fov: 70 },         // Closer group shot
    twoShot: { distance: 3.5, heightOffset: 1.5, fov: 72 },     // Closer two-shot
  },
  
  // Shot selection weights by activity type
  SHOT_WEIGHTS: {
    idle: ['follow', 'wide', 'overhead', 'orbit'],
    moving: ['follow', 'closeBehind', 'action', 'side'],
    building: ['overhead', 'highAngle', 'closeBehind', 'shoulder'],
    mining: ['shoulder', 'closeBehind', 'lowAngle', 'action'],
    combat: ['action', 'shoulder', 'lowAngle', 'closeBehind'],
    exploring: ['wide', 'follow', 'ultraWide', 'overhead'],
    social: ['twoShot', 'group', 'wide', 'orbit'],
  },
  
  // POV mode settings - DISABLED to prevent camera getting stuck
  POV_MODE: {
    ENABLED: false,           // DISABLED - causes camera to get stuck
    DURATION: 4000,
    CHANCE: 0,                // Never enter POV
    MIN_INTERVAL: 999999,     // Effectively never
    TRIGGER_ON_ACTION: false, // Disabled
  },
  
  // Underground detection - AGGRESSIVE for cave filming
  UNDERGROUND: {
    Y_THRESHOLD: 40,          // Below this Y level is considered underground
    AUTO_SPECTATE: false,     // DISABLED - was causing camera to get stuck
    SPECTATE_MIN_DURATION: 2000,  // Minimum time in spectate mode underground
    USE_CLOSE_SHOTS: true,    // Use closer camera shots when underground
    CAVE_DISTANCE_MULT: 0.3,  // Even closer in caves (was 0.4)
    CAVE_HEIGHT_MULT: 0.2,    // Very low height offset in caves
    // Underground-specific camera settings (very aggressive)
    SPRING_STIFFNESS: 20.0,   // Very stiff for instant tracking
    SPRING_DAMPING: 0.70,     // Lower damping for immediate response
    MIN_TELEPORT_DISTANCE: 0.03, // Very low threshold for constant updates
    FOLLOW_SPEED: 0.7,        // Very fast follow behind
  },
  
  // Shot timing - varied for interest
  SHOT_CHANGE_INTERVAL: 15000,  // Change shots every 15 seconds (more dynamic)
  TRANSITION_DURATION: 2000,    // 2 second smooth transitions
  QUICK_CUT_DURATION: 500,      // Quick cuts for action
  
  // Target switching
  TARGET_SWITCH: {
    LOCKED_TARGET: 'Claude_Builder', // Lock to specific agent for overnight viewing (null = auto-switch)
    MIN_INTERVAL: 20000,        // Minimum 20 seconds on each agent
    ACTIVITY_THRESHOLD: 30,     // Switch if another agent has 30+ more activity
    PREFER_BUILDING: true,      // Prioritize agents that are building
    PREFER_ACTION: true,        // Prioritize agents in combat
  },
  
  // Anti-AFK settings - AGGRESSIVE to prevent any AFK kicks
  ANTI_AFK: {
    ENABLED: true,
    INTERVAL: 8000,             // Anti-AFK action every 8 seconds
    SPECTATE_REFRESH: 20000,    // Re-issue spectate command every 20 seconds
    TELEPORT_REFRESH: 30000,    // Teleport to target every 30 seconds
    MOVEMENT_INTERVAL: 4000,    // Small movement every 4 seconds
    FORCE_SPECTATE: true,       // Force spectate mode continuously
    CURSOR_WOBBLE: {
      ENABLED: false,            // DISABLED - interferes with smooth camera
      INTERVAL: 5000,           // Longer interval if ever re-enabled
      AMPLITUDE: 0.01,          // Smaller wobble (radians)
      RANDOM_FACTOR: 0.2,       // Less randomness
    },
    STUCK_RECOVERY: {
      ENABLED: true,
      CHECK_INTERVAL: 10000,    // Check for stuck camera every 10 seconds (less aggressive)
      MAX_IDLE_TIME: 30000,     // Reset if no movement for 30 seconds (not 8!)
      TELEPORT_ON_STUCK: true,  // Force teleport when stuck
      MAX_BLOCKED_CHECKS: 6,    // After 6 blocked checks, force recovery (not 2!)
    },
  },
  
  // Following behavior - RESPONSIVE to keep agent centered
  FOLLOW_BEHIND_SPEED: 0.35,    // Fast follow to stay behind agent
  IDLE_ORBIT_SPEED: 0.008,      // Very slow orbit when stationary
  ORBIT_SPEED: 0.02,            // Slow orbit speed during orbit shot
  
  // Event detection keywords
  EVENT_KEYWORDS: {
    combat: ['zombie', 'skeleton', 'creeper', 'spider', 'attack', 'fighting', 'danger', 'hostile', 'mob', 'hit', 'damage'],
    discovery: ['found', 'discovered', 'diamond', 'treasure', 'amazing', 'incredible', 'rich', 'deposit', 'emerald', 'ancient'],
    building: ['building', 'constructing', 'placing', 'crafting', 'creating', 'built', 'tower', 'castle', 'house', 'structure'],
    mining: ['mining', 'digging', 'excavating', 'ore', 'coal', 'iron', 'gold', 'deepslate'],
    social: ['meet', 'hello', 'collaborate', 'together', 'team', 'help', 'join'],
  },
  
  // Priority event duration
  EVENT_FOCUS_DURATION: 20000,  // Focus on event for 20 seconds
  
  // Dramatic moments - trigger quick cuts and POV
  DRAMATIC_TRIGGERS: ['diamond', 'ancient', 'treasure', 'incredible', 'magnificent', 'complete', 'finished', 'built'],
};

// Shot type definitions - cinematic variety
type ShotType = 'follow' | 'closeBehind' | 'shoulder' | 'action' | 'lowAngle' | 'highAngle' | 'overhead' | 'wide' | 'ultraWide' | 'side' | 'dutch' | 'orbit' | 'group' | 'twoShot';

// Activity type for smart shot selection
type ActivityType = 'idle' | 'moving' | 'building' | 'mining' | 'combat' | 'exploring' | 'social';

// Spring state for physics simulation
interface SpringState {
  position: Vec3;
  velocity: Vec3;
}

// Angle spring state
interface AngleSpring {
  value: number;
  velocity: number;
}

// Shot transition state
interface ShotTransition {
  active: boolean;
  startTime: number;
  duration: number;
  fromShot: ShotType;
  toShot: ShotType;
  fromDistance: number;
  toDistance: number;
  fromHeight: number;
  toHeight: number;
}

// Agent activity tracking
interface AgentActivity {
  username: string;
  lastAction: string;
  lastActionTime: number;
  activityScore: number;
  eventType: string | null;
  position: Vec3 | null;
  health: number;
  isMoving: boolean;
  velocity: Vec3 | null;
  lastSeen?: number; // Timestamp when entity was last visible
  entityLostLogged?: boolean; // Whether we already logged losing this entity
}

export class CinematicCamera {
  private bot: Bot | null = null;
  private isRunning: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private shotChangeInterval: NodeJS.Timeout | null = null;
  private antiAfkInterval: NodeJS.Timeout | null = null;
  private spectateRefreshInterval: NodeJS.Timeout | null = null;
  private teleportRefreshInterval: NodeJS.Timeout | null = null;
  private movementInterval: NodeJS.Timeout | null = null;
  private cursorWobbleInterval: NodeJS.Timeout | null = null;
  private stuckRecoveryInterval: NodeJS.Timeout | null = null;
  private wobblePhase: number = 0;
  private lastCameraPosition: Vec3 | null = null;
  private lastCameraMovement: number = Date.now();
  private consecutiveStuckChecks: number = 0;
  private stuckLogged: boolean = false; // Only log stuck once per episode
  
  // Target tracking
  private targetAgents: Map<string, AgentActivity> = new Map();
  private currentTarget: string | null = null;
  private lastTargetSwitch: number = 0;
  private cameraInitialized: boolean = false; // Track if camera position has been initialized for current target
  
  // Spring physics state
  private springState: SpringState = {
    position: new Vec3(0, 64, 0),
    velocity: new Vec3(0, 0, 0),
  };
  
  // Angle spring states
  private yawSpring: AngleSpring = { value: 0, velocity: 0 };
  private pitchSpring: AngleSpring = { value: 0, velocity: 0 };
  
  // Current and target angles
  private currentYaw: number = 0;
  private currentPitch: number = 0;
  private targetYaw: number = 0;
  private targetPitch: number = 0;
  
  // Camera state
  private currentShot: ShotType = 'follow';
  private orbitAngle: number = 0;
  private lastTeleportTime: number = 0;
  
  // Shot transition
  private transition: ShotTransition = {
    active: false,
    startTime: 0,
    duration: CAMERA_SETTINGS.TRANSITION_DURATION,
    fromShot: 'follow',
    toShot: 'follow',
    fromDistance: 8,
    toDistance: 8,
    fromHeight: 3,
    toHeight: 3,
  };
  
  // POV mode state
  private povMode: boolean = false;
  private povTarget: string | null = null;
  private povStartTime: number = 0;
  private lastPovTime: number = 0;
  
  // Underground spectate state
  private undergroundSpectate: boolean = false;
  private undergroundSpectateStart: number = 0;
  
  // Anti-AFK state
  private lastSpectateRefresh: number = 0;
  
  // LOS check cooldown
  private lastLosCheckTime: number = 0;
  
  // Event tracking
  private currentEvent: { type: string; agent: string; startTime: number } | null = null;
  
  // Logger prefix
  private logPrefix: string = '[Camera]';

  constructor() {
    // Logger is imported as singleton
  }
  
  private log(message: string): void {
    Logger.info(`${this.logPrefix} ${message}`);
  }
  
  private logError(message: string): void {
    Logger.error(`${this.logPrefix} ${message}`);
  }

  /**
   * Sync agent positions from the bot's player list
   * This is called every frame to get live position data
   */
  private syncPlayerPositions(): void {
    if (!this.bot) return;
    
    for (const [username, activity] of this.targetAgents.entries()) {
      const player = this.bot.players[username];
      if (player?.entity) {
        const wasMoving = activity.isMoving;
        const prevPos = activity.position;
        const newPos = player.entity.position.clone();
        
        activity.position = newPos;
        activity.velocity = player.entity.velocity?.clone() || null;
        activity.lastSeen = Date.now(); // Track when we last saw this agent
        activity.entityLostLogged = false; // Reset flag when we see entity again
        
        // Detect movement
        if (prevPos) {
          const moved = newPos.distanceTo(prevPos);
          activity.isMoving = moved > 0.05;
          
          // Boost activity score for movement
          if (activity.isMoving && !wasMoving) {
            activity.activityScore = Math.min(100, activity.activityScore + 10);
          }
        } else {
          activity.isMoving = false;
        }
      } else if (activity.position) {
        // Entity not loaded but we have a last known position
        // The stuck recovery will handle teleporting to the player
        // Don't spam logs - just silently use last known position
      }
    }
    
    // Auto-discover new players that match registered agents
    for (const playerName of Object.keys(this.bot.players)) {
      if (playerName !== this.bot.username && !this.targetAgents.has(playerName)) {
        // Auto-register any player that looks like an agent (contains Claude or Builder)
        if (playerName.includes('Claude') || playerName.includes('Builder') || playerName.includes('Explorer') || playerName.includes('Adventurer')) {
          this.registerAgent(playerName);
        }
      }
    }
  }

  /**
   * Calculate spring physics for smooth position updates
   */
  private updateSpringPhysics(
    current: Vec3,
    target: Vec3,
    velocity: Vec3,
    stiffness: number,
    damping: number,
    deltaTime: number
  ): { position: Vec3; velocity: Vec3 } {
    // Spring force: F = -k * (current - target)
    const displacement = current.clone().subtract(target);
    const springForce = displacement.scaled(-stiffness);
    
    // Apply spring force to velocity
    const newVelocity = velocity.clone().add(springForce.scaled(deltaTime));
    
    // Apply damping
    newVelocity.scale(damping);
    
    // Update position
    const newPosition = current.clone().add(newVelocity.scaled(deltaTime));
    
    return { position: newPosition, velocity: newVelocity };
  }

  /**
   * Update angle spring physics for smooth rotation
   */
  private updateAngleSpring(
    current: number,
    target: number,
    velocity: number,
    stiffness: number,
    damping: number,
    deltaTime: number
  ): { value: number; velocity: number } {
    // Normalize angle difference to [-PI, PI]
    let diff = target - current;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    
    // Spring force
    const springForce = diff * stiffness;
    
    // Update velocity with spring force and damping
    let newVelocity = velocity + springForce * deltaTime;
    newVelocity *= damping;
    
    // Update angle
    let newValue = current + newVelocity * deltaTime;
    
    // Normalize result
    while (newValue > Math.PI) newValue -= 2 * Math.PI;
    while (newValue < -Math.PI) newValue += 2 * Math.PI;
    
    return { value: newValue, velocity: newVelocity };
  }

  /**
   * Calculate look angles to point camera at target
   */
  private calculateLookAngles(cameraPos: Vec3, targetPos: Vec3): { yaw: number; pitch: number } {
    const dx = targetPos.x - cameraPos.x;
    const dy = targetPos.y - cameraPos.y;
    const dz = targetPos.z - cameraPos.z;
    
    // Calculate horizontal distance for pitch
    const horizontalDist = Math.sqrt(dx * dx + dz * dz);
    
    // Yaw: angle in XZ plane
    // Minecraft: yaw 0 = south (+Z), yaw 90 = west (-X), yaw -90 = east (+X)
    // atan2(x, z) gives angle where 0 = +Z direction
    // We need to look FROM camera TO target, so we use the delta direction
    const yaw = -Math.atan2(dx, dz);  // Negative to match Minecraft's convention
    
    // Pitch: angle from horizontal (negative = looking down in Minecraft)
    const pitch = -Math.atan2(dy, horizontalDist);  // Negative for Minecraft
    
    return { yaw, pitch };
  }

  /**
   * Bezier easing for smooth transitions
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Get interpolated shot parameters during transition
   */
  private getTransitionedShotParams(): { distance: number; heightOffset: number } {
    if (!this.transition.active) {
      const shot = CAMERA_SETTINGS.SHOTS[this.currentShot];
      return { distance: shot.distance, heightOffset: shot.heightOffset };
    }
    
    const elapsed = Date.now() - this.transition.startTime;
    const progress = Math.min(elapsed / this.transition.duration, 1);
    const eased = this.easeInOutCubic(progress);
    
    const distance = this.transition.fromDistance + 
      (this.transition.toDistance - this.transition.fromDistance) * eased;
    const heightOffset = this.transition.fromHeight + 
      (this.transition.toHeight - this.transition.fromHeight) * eased;
    
    // End transition when complete
    if (progress >= 1) {
      this.transition.active = false;
      this.currentShot = this.transition.toShot;
    }
    
    return { distance, heightOffset };
  }

  /**
   * Start a smooth transition to a new shot type
   */
  private transitionToShot(newShot: ShotType): void {
    if (newShot === this.currentShot && !this.transition.active) return;
    
    const fromParams = CAMERA_SETTINGS.SHOTS[this.currentShot];
    const toParams = CAMERA_SETTINGS.SHOTS[newShot];
    
    this.transition = {
      active: true,
      startTime: Date.now(),
      duration: CAMERA_SETTINGS.TRANSITION_DURATION,
      fromShot: this.currentShot,
      toShot: newShot,
      fromDistance: fromParams.distance,
      toDistance: toParams.distance,
      fromHeight: fromParams.heightOffset,
      toHeight: toParams.heightOffset,
    };
    
    this.log(`🎥 Transitioning to ${newShot} shot`);
  }

  /**
   * Enter POV (first-person spectate) mode
   */
  private enterPovMode(targetUsername: string): void {
    if (!this.bot || !CAMERA_SETTINGS.POV_MODE.ENABLED) return;
    
    const now = Date.now();
    if (now - this.lastPovTime < CAMERA_SETTINGS.POV_MODE.MIN_INTERVAL) return;
    
    this.povMode = true;
    this.povTarget = targetUsername;
    this.povStartTime = now;
    this.lastPovTime = now;
    
    // Use spectate command for true first-person view
    this.bot.chat(`/spectate ${targetUsername}`);
    this.log(`👁️ Entering POV mode: ${targetUsername}`);
  }

  /**
   * Exit POV mode and return to cinematic view
   */
  private exitPovMode(): void {
    if (!this.bot) return;
    
    // Always force reset these states
    this.povMode = false;
    this.undergroundSpectate = false;
    this.povTarget = null;
    
    // Stop spectating - use gamemode command to ensure we exit
    this.bot.chat('/gamemode spectator');
    this.log(`🎬 Exiting POV mode, returning to cinematic view`);
    
    // Small delay then teleport to appropriate position
    setTimeout(() => {
      if (this.currentTarget && this.bot) {
        const target = this.targetAgents.get(this.currentTarget);
        if (target?.position) {
          const shot = CAMERA_SETTINGS.SHOTS[this.currentShot];
          const pos = target.position.offset(
            Math.sin(this.orbitAngle) * shot.distance,
            shot.heightOffset,
            Math.cos(this.orbitAngle) * shot.distance
          );
          this.springState.position = pos;
          this.teleportCamera(pos);
        }
      }
    }, 100);
    
    this.povTarget = null;
  }

  /**
   * Enter underground spectate mode - locks camera to agent's POV when underground
   */
  private enterUndergroundSpectate(targetUsername: string): void {
    if (!this.bot || !CAMERA_SETTINGS.UNDERGROUND.AUTO_SPECTATE) return;
    if (this.povMode) return; // Already in POV mode
    
    this.povMode = true;
    this.povTarget = targetUsername;
    this.povStartTime = Date.now();
    this.undergroundSpectate = true;
    this.undergroundSpectateStart = Date.now();
    
    // Use spectate command for true first-person view
    this.bot.chat(`/spectate ${targetUsername}`);
    this.log(`🕳️ Target underground - entering spectate mode: ${targetUsername}`);
  }

  /**
   * Check if target is underground and handle spectate mode accordingly
   */
  private checkUndergroundStatus(): void {
    if (!this.currentTarget) return;
    
    const target = this.targetAgents.get(this.currentTarget);
    if (!target?.position) return;
    
    const isUnderground = target.position.y < CAMERA_SETTINGS.UNDERGROUND.Y_THRESHOLD;
    const now = Date.now();
    
    if (isUnderground && !this.povMode) {
      // Target went underground - enter spectate mode
      this.enterUndergroundSpectate(this.currentTarget);
    } else if (!isUnderground && this.undergroundSpectate) {
      // Target surfaced - check minimum duration before exiting
      if (now - this.undergroundSpectateStart > CAMERA_SETTINGS.UNDERGROUND.SPECTATE_MIN_DURATION) {
        this.log(`🌤️ Target surfaced - exiting underground spectate`);
        this.exitPovMode();
      }
    }
  }

  /**
   * Detect events from chat messages
   */
  private detectEvent(message: string, username: string): string | null {
    const lowerMessage = message.toLowerCase();
    
    for (const [eventType, keywords] of Object.entries(CAMERA_SETTINGS.EVENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword)) {
          return eventType;
        }
      }
    }
    
    return null;
  }

  /**
   * Handle event detection and camera focus
   */
  private handleEvent(eventType: string, username: string): void {
    const now = Date.now();
    
    // Don't interrupt ongoing events unless it's combat (highest priority)
    if (this.currentEvent && eventType !== 'combat') {
      if (now - this.currentEvent.startTime < CAMERA_SETTINGS.EVENT_FOCUS_DURATION) {
        return;
      }
    }
    
    this.currentEvent = {
      type: eventType,
      agent: username,
      startTime: now,
    };
    
    // Switch to the agent with the event
    if (this.currentTarget !== username) {
      this.currentTarget = username;
      this.lastTargetSwitch = now;
      this.log(`🎯 Event detected: ${eventType}! Switching to ${username}`);
    }
    
    // Choose appropriate shot for event
    switch (eventType) {
      case 'combat':
        this.transitionToShot('shoulder');
        break;
      case 'discovery':
        this.transitionToShot('closeBehind');
        break;
      case 'building':
        this.transitionToShot('overhead');
        break;
      case 'mining':
        this.transitionToShot('follow');
        break;
    }
  }

  /**
   * Check for line of sight to target
   */
  private hasLineOfSight(from: Vec3, to: Vec3): boolean {
    if (!this.bot) return true;
    
    const direction = to.clone().subtract(from);
    const distance = direction.norm();
    if (distance < 1) return true;
    
    direction.scale(1 / distance);
    
    // Check points along the ray
    const steps = Math.min(Math.floor(distance * 2), 20);
    for (let i = 1; i < steps; i++) {
      const checkPoint = from.clone().add(direction.scaled(i * distance / steps));
      const block = this.bot.blockAt(checkPoint);
      if (block && block.boundingBox === 'block') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Check if a position is underground (below threshold or surrounded by blocks)
   */
  private isUnderground(pos: Vec3): boolean {
    if (!this.bot) return false;
    
    // Y level check
    if (pos.y < CAMERA_SETTINGS.UNDERGROUND.Y_THRESHOLD) {
      return true;
    }
    
    // Check if surrounded by blocks (cave detection)
    const checkPositions = [
      pos.offset(0, 3, 0),   // Above
      pos.offset(3, 0, 0),   // East
      pos.offset(-3, 0, 0),  // West
      pos.offset(0, 0, 3),   // South
      pos.offset(0, 0, -3),  // North
    ];
    
    let blockedCount = 0;
    for (const checkPos of checkPositions) {
      const block = this.bot.blockAt(checkPos);
      if (block && block.boundingBox === 'block') {
        blockedCount++;
      }
    }
    
    // If 3+ directions blocked, we're probably in a cave
    return blockedCount >= 3;
  }

  /**
   * Find a valid camera position with line of sight - IMPROVED for underground/caves
   */
  private findValidCameraPosition(targetPos: Vec3, idealPos: Vec3): Vec3 {
    const isUnderground = this.isUnderground(targetPos);
    
    // Adjust parameters for underground filming
    let { distance, heightOffset } = this.getTransitionedShotParams();
    if (isUnderground && CAMERA_SETTINGS.UNDERGROUND.USE_CLOSE_SHOTS) {
      distance *= CAMERA_SETTINGS.UNDERGROUND.CAVE_DISTANCE_MULT;
      heightOffset *= CAMERA_SETTINGS.UNDERGROUND.CAVE_HEIGHT_MULT;
      // Recalculate ideal position with cave parameters
      idealPos = targetPos.offset(
        Math.sin(this.orbitAngle) * distance,
        heightOffset,
        Math.cos(this.orbitAngle) * distance
      );
    }
    
    // Check if ideal position works
    if (this.hasLineOfSight(idealPos, targetPos) && this.isPositionClear(idealPos)) {
      return idealPos;
    }
    
    // Alternative angles to try (more options for underground)
    const alternativeAngles = [
      this.orbitAngle,
      this.orbitAngle + Math.PI / 6,
      this.orbitAngle - Math.PI / 6,
      this.orbitAngle + Math.PI / 4,
      this.orbitAngle - Math.PI / 4,
      this.orbitAngle + Math.PI / 3,
      this.orbitAngle - Math.PI / 3,
      this.orbitAngle + Math.PI / 2,
      this.orbitAngle - Math.PI / 2,
      this.orbitAngle + 2 * Math.PI / 3,
      this.orbitAngle - 2 * Math.PI / 3,
      this.orbitAngle + 3 * Math.PI / 4,
      this.orbitAngle - 3 * Math.PI / 4,
      this.orbitAngle + Math.PI,
    ];
    
    // Try progressively closer distances (more aggressive for underground)
    const distanceMultipliers = isUnderground 
      ? [1.0, 0.7, 0.5, 0.35, 0.25, 0.15] 
      : [1.0, 0.75, 0.5, 0.35];
    
    // Try different heights (lower options for caves with low ceilings)
    const heightOffsets = isUnderground
      ? [heightOffset, heightOffset * 0.5, 0.3, 0, -0.3, heightOffset * 0.25]
      : [heightOffset, heightOffset * 0.5, 0.5, heightOffset * 0.25];
    
    // Try combinations of angle, distance, and height
    for (const distMult of distanceMultipliers) {
      for (const hOffset of heightOffsets) {
        for (const angle of alternativeAngles) {
          const testDist = distance * distMult;
          const altPos = targetPos.offset(
            Math.sin(angle) * testDist,
            hOffset,
            Math.cos(angle) * testDist
          );
          if (this.hasLineOfSight(altPos, targetPos) && this.isPositionClear(altPos)) {
            this.orbitAngle = angle;
            return altPos;
          }
        }
      }
    }
    
    // Underground fallback: try directly beside target at same level
    if (isUnderground) {
      const sidePositions = [
        targetPos.offset(1.5, 0.5, 0),
        targetPos.offset(-1.5, 0.5, 0),
        targetPos.offset(0, 0.5, 1.5),
        targetPos.offset(0, 0.5, -1.5),
        targetPos.offset(1, 0, 1),
        targetPos.offset(-1, 0, -1),
      ];
      for (const sidePos of sidePositions) {
        if (this.hasLineOfSight(sidePos, targetPos) && this.isPositionClear(sidePos)) {
          return sidePos;
        }
      }
    }
    
    // Final fallback: very close to target at eye level (tight quarters)
    const closePos = targetPos.offset(0.5, 0.5, 0.5);
    if (this.isPositionClear(closePos)) {
      return closePos;
    }
    
    // Absolute fallback: slightly above target (may clip but at least follows)
    return targetPos.offset(0, 1.5, 0);
  }
  
  /**
   * Check if a position is clear (not inside a block)
   */
  private isPositionClear(pos: Vec3): boolean {
    if (!this.bot) return true;
    
    // Check the block at this position
    const block = this.bot.blockAt(pos);
    if (block && block.boundingBox === 'block') {
      return false;
    }
    
    // Also check block above (for camera head clearance)
    const blockAbove = this.bot.blockAt(pos.offset(0, 0.5, 0));
    if (blockAbove && blockAbove.boundingBox === 'block') {
      return false;
    }
    
    return true;
  }

  /**
   * Find an emergency camera position when all other options fail
   * Tries many positions to ensure we can see the target
   */
  private findEmergencyCameraPosition(targetPos: Vec3): Vec3 {
    if (!this.bot) return targetPos.offset(0, 2, 0);
    
    // Try positions in a sphere around the target
    const distances = [1.5, 2, 2.5, 3, 1, 0.8];
    const heights = [1, 1.5, 2, 0.5, 2.5, 0];
    const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4];
    
    for (const dist of distances) {
      for (const height of heights) {
        for (const angle of angles) {
          const testPos = targetPos.offset(
            Math.sin(angle) * dist,
            height,
            Math.cos(angle) * dist
          );
          
          // Check if this position has LOS and is clear
          if (this.isPositionClear(testPos) && this.hasLineOfSight(testPos, targetPos)) {
            return testPos;
          }
        }
      }
    }
    
    // Absolute fallback: directly above target
    return targetPos.offset(0, 2.5, 0);
  }

  /**
   * Teleport camera to position with look angles
   * In spectator mode, we MUST use /tp to move - there's no other way
   * Frequent small teleports = smooth motion for spectators
   */
  private teleportCamera(pos: Vec3): void {
    if (!this.bot) return;
    
    const now = Date.now();
    const timeSinceLastTeleport = now - this.lastTeleportTime;
    
    // Rate limit teleports - 40ms (25 fps) for smooth camera motion
    if (timeSinceLastTeleport < 40) return;
    
    // Convert radians to degrees for Minecraft
    const yawDeg = (this.currentYaw * 180 / Math.PI);
    const pitchDeg = (this.currentPitch * 180 / Math.PI);
    
    // Always teleport with position and rotation
    // Use @s instead of username to ensure it works
    this.bot.chat(`/tp @s ${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)} ${yawDeg.toFixed(1)} ${pitchDeg.toFixed(1)}`);
    
    this.lastTeleportTime = now;
  }

  /**
   * Main camera update loop - runs at 30fps
   */
  private updateCamera(): void {
    if (!this.bot || !this.isRunning) return;
    
    // Sync positions from bot's player list every frame
    this.syncPlayerPositions();
    
    const now = Date.now();
    const deltaTime = CAMERA_SETTINGS.POSITION_UPDATE_INTERVAL / 1000;
    
    // Force reset any stuck state every frame
    if (this.povMode) {
      this.povMode = false;
      this.undergroundSpectate = false;
      this.povTarget = null;
      this.bot.chat('/gamemode spectator');
      this.log('🔧 Reset stuck POV state');
    }
    
    // Check if event has ended
    if (this.currentEvent) {
      if (now - this.currentEvent.startTime >= CAMERA_SETTINGS.EVENT_FOCUS_DURATION) {
        this.log(`Event ended, returning to normal tracking`);
        this.currentEvent = null;
      }
    }
    
    // Get current target - always try to find one
    if (!this.currentTarget) {
      this.selectBestTarget();
    }
    
    // If still no target, try to auto-discover agents from player list
    if (!this.currentTarget && this.targetAgents.size === 0) {
      this.syncPlayerPositions(); // This will auto-discover agents
      this.selectBestTarget();
    }
    
    const target = this.currentTarget ? this.targetAgents.get(this.currentTarget) : null;
    
    // If no position data, try to get from player entity directly
    if (this.currentTarget && (!target?.position)) {
      const player = this.bot?.players[this.currentTarget];
      if (player?.entity?.position) {
        // Got position from player entity - use it
        if (target) {
          target.position = player.entity.position.clone();
          target.lastSeen = Date.now();
        }
      } else {
        // No entity data available - teleport to world spawn to load chunks
        // Then try again next frame
        const timeSinceLastTp = Date.now() - this.lastTeleportTime;
        if (timeSinceLastTp > 3000) {
          this.log(`📍 No position for ${this.currentTarget} - teleporting to search`);
          // Try teleporting to the player directly (server will place us nearby)
          this.bot?.chat(`/tp @s ${this.currentTarget}`);
          this.lastTeleportTime = Date.now();
        }
        return;
      }
    }
    
    if (!target?.position) return;
    
    // Check if target is underground - use different settings
    const targetIsUnderground = this.isUnderground(target.position);
    
    // Initialize camera if not done yet (may fail first few frames until position is synced)
    if (!this.cameraInitialized && this.currentTarget) {
      this.initializeCameraPosition(this.currentTarget);
    }
    
    // Get shot parameters (with transition interpolation)
    const { distance, heightOffset } = this.getTransitionedShotParams();
    
    // Use faster follow speed underground
    const followSpeed = targetIsUnderground 
      ? CAMERA_SETTINGS.UNDERGROUND.FOLLOW_SPEED 
      : CAMERA_SETTINGS.FOLLOW_BEHIND_SPEED;
    
    // ALWAYS FOLLOW BEHIND: Use agent's facing direction (yaw) to position camera
    // Get the agent's yaw from the bot.players data
    const player = this.currentTarget ? this.bot?.players[this.currentTarget] : null;
    if (player?.entity) {
      // Use the agent's facing direction (yaw) to position camera behind them
      const agentYaw = player.entity.yaw;
      // Camera should be behind the agent (opposite of where they're facing)
      const targetOrbit = agentYaw; // Agent yaw points where they face, camera goes behind
      let diff = targetOrbit - this.orbitAngle;
      // Normalize angle difference
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      // Use faster follow speed underground
      this.orbitAngle += diff * followSpeed;
    } else if (target.isMoving && target.velocity && target.velocity.norm() > 0.05) {
      // Fallback: When target is moving, position camera behind based on movement
      const moveAngle = Math.atan2(target.velocity.x, target.velocity.z);
      const targetOrbit = moveAngle + Math.PI; // Position directly behind
      let diff = targetOrbit - this.orbitAngle;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.orbitAngle += diff * followSpeed;
    }
    // No else case - camera stays at current angle when agent is stationary without entity data
    
    // Calculate ideal camera position (always behind the agent)
    const idealPos = target.position.offset(
      Math.sin(this.orbitAngle) * distance,
      heightOffset,
      Math.cos(this.orbitAngle) * distance
    );
    
    // Find valid position with line of sight
    const validPos = this.findValidCameraPosition(target.position, idealPos);
    
    // Only check LOS periodically to avoid stuttering (every 2 seconds max)
    const timeSinceLastLosCheck = now - (this.lastLosCheckTime || 0);
    if (CAMERA_SETTINGS.FORCE_LOS_CHECK && timeSinceLastLosCheck > 2000) {
      this.lastLosCheckTime = now;
      const currentLOS = this.hasLineOfSight(this.springState.position, target.position);
      if (!currentLOS && CAMERA_SETTINGS.LOS_FAIL_TELEPORT) {
        // Lost sight of agent! Force immediate reposition
        this.log(`📍 LOS blocked - repositioning camera`);
        this.springState.position = validPos.clone();
        this.springState.velocity = new Vec3(0, 0, 0);
        // Always teleport immediately when view is blocked
        this.teleportCamera(validPos);
        this.lastCameraMovement = now;
      }
    }
    
    // Skip proactive LOS check when FORCE_LOS_CHECK is disabled (reduces spam)
    // Only do emergency repositioning when settings allow it
    if (CAMERA_SETTINGS.FORCE_LOS_CHECK) {
      const futureLOS = this.hasLineOfSight(validPos, target.position);
      if (!futureLOS) {
        // Even the calculated position is blocked, find a better one
        const emergencyPos = this.findEmergencyCameraPosition(target.position);
        this.springState.position = emergencyPos.clone();
        this.springState.velocity = new Vec3(0, 0, 0);
        this.teleportCamera(emergencyPos);
        this.lastCameraMovement = Date.now();
      }
    }
    
    // Check for large distance (teleport lag catch-up) - lower threshold for tight following
    const distToTarget = this.springState.position.distanceTo(validPos);
    const maxTeleportDist = targetIsUnderground ? 3 : CAMERA_SETTINGS.MAX_TELEPORT_DISTANCE;
    if (distToTarget > maxTeleportDist) {
      // Force teleport to catch up
      this.springState.position = validPos.clone();
      this.springState.velocity = new Vec3(0, 0, 0);
      this.teleportCamera(validPos);
    }
    
    // Use different spring settings underground (stiffer, faster response)
    const springStiffness = targetIsUnderground 
      ? CAMERA_SETTINGS.UNDERGROUND.SPRING_STIFFNESS 
      : CAMERA_SETTINGS.SPRING_STIFFNESS;
    const springDamping = targetIsUnderground 
      ? CAMERA_SETTINGS.UNDERGROUND.SPRING_DAMPING 
      : CAMERA_SETTINGS.SPRING_DAMPING;
    
    // Update spring physics for smooth position
    const springResult = this.updateSpringPhysics(
      this.springState.position,
      validPos,
      this.springState.velocity,
      springStiffness,
      springDamping,
      deltaTime
    );
    this.springState.position = springResult.position;
    this.springState.velocity = springResult.velocity;
    
    // Calculate target look angles (always look at agent's body, not name tag)
    const targetLookPos = target.position.offset(0, 1.0, 0); // Chest level - below name tag
    const lookAngles = this.calculateLookAngles(this.springState.position, targetLookPos);
    this.targetYaw = lookAngles.yaw;
    this.targetPitch = lookAngles.pitch;
    
    // Underground: use lock-on for instant tracking in tight spaces
    // Above ground: use smooth spring rotation
    if (CAMERA_SETTINGS.LOCK_ON_TARGET || targetIsUnderground) {
      this.currentYaw = this.targetYaw;
      this.currentPitch = this.targetPitch;
      this.yawSpring.velocity = 0;
      this.pitchSpring.velocity = 0;
    } else {
      // Spring-based smooth rotation (optional, for cinematic feel)
      const yawResult = this.updateAngleSpring(
        this.currentYaw,
        this.targetYaw,
        this.yawSpring.velocity,
        CAMERA_SETTINGS.ANGLE_SPRING_STIFFNESS,
        CAMERA_SETTINGS.ANGLE_SPRING_DAMPING,
        deltaTime
      );
      this.currentYaw = yawResult.value;
      this.yawSpring.velocity = yawResult.velocity;
      
      // Update pitch spring
      const pitchResult = this.updateAngleSpring(
        this.currentPitch,
        this.targetPitch,
        this.pitchSpring.velocity,
        CAMERA_SETTINGS.ANGLE_SPRING_STIFFNESS,
        CAMERA_SETTINGS.ANGLE_SPRING_DAMPING,
        deltaTime
      );
      this.currentPitch = pitchResult.value;
      this.pitchSpring.velocity = pitchResult.velocity;
    }
    
    // Teleport to maintain agent visibility
    // Only teleport when we've moved significantly (reduces jitter)
    // Use lower threshold underground for tighter tracking
    const minTeleportDist = targetIsUnderground 
      ? CAMERA_SETTINGS.UNDERGROUND.MIN_TELEPORT_DISTANCE 
      : CAMERA_SETTINGS.MIN_TELEPORT_DISTANCE;
    if (distToTarget > minTeleportDist) {
      this.teleportCamera(this.springState.position);
      // Update movement tracking for stuck detection
      this.lastCameraMovement = Date.now();
    }
    
    // Final safety check: if agent is VERY far away, force catch-up
    // Lower threshold underground since caves are tight
    const distToAgent = this.springState.position.distanceTo(target.position);

    if (distToAgent > 40 || (targetIsUnderground && distToAgent > 10)) {
      if (targetIsUnderground) {
        // Underground: teleport directly to player, server handles collision
        this.bot.chat(`/tp @s ${this.currentTarget}`);
        setTimeout(() => {
          if (this.bot) this.bot.chat(`/tp @s ~2 ~1 ~2`);
        }, 100);
      } else {
        // Smoothly catch up - don't snap, just boost the spring
        const catchUpPos = target.position.offset(0, 3, 4);
        this.springState.position = catchUpPos.clone();
        this.springState.velocity = new Vec3(0, 0, 0);
      }
    }
  }

  /**
   * Select the best target to follow based on activity
   */
  private selectBestTarget(): void {
    if (this.targetAgents.size === 0) return;
    
    const now = Date.now();
    let bestAgent: string | null = null;
    let bestScore = -1;
    let currentTargetScore = 0;
    
    for (const [username, activity] of this.targetAgents.entries()) {
      // Calculate activity score
      let score = activity.activityScore;
      
      // Boost for recent actions
      const timeSinceAction = now - activity.lastActionTime;
      if (timeSinceAction < 3000) score += 80;        // Very recent action
      else if (timeSinceAction < 10000) score += 40;  // Recent action
      else if (timeSinceAction < 30000) score += 15;  // Somewhat recent
      
      // Boost for movement
      if (activity.isMoving) score += 25;
      
      // Boost for events (prioritize action!)
      if (activity.eventType === 'combat') score += 150;  // HIGHEST priority
      if (activity.eventType === 'building') score += 100; // Building is interesting
      if (activity.eventType === 'discovery') score += 80;
      if (activity.eventType === 'mining') score += 40;
      if (activity.eventType === 'social') score += 60;
      
      // Boost for dramatic actions
      if (activity.lastAction && CAMERA_SETTINGS.DRAMATIC_TRIGGERS.some(t => 
        activity.lastAction.toLowerCase().includes(t))) {
        score += 100;
      }
      
      // Track current target's score
      if (username === this.currentTarget) {
        currentTargetScore = score;
        // Small boost for staying with current (avoid jitter)
        score += 20;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestAgent = username;
      }
    }
    
    // Check for locked target mode (overnight viewing)
    const lockedTarget = CAMERA_SETTINGS.TARGET_SWITCH.LOCKED_TARGET;
    if (lockedTarget && this.targetAgents.has(lockedTarget)) {
      if (this.currentTarget !== lockedTarget) {
        this.currentTarget = lockedTarget;
        this.lastTargetSwitch = now;
        this.cameraInitialized = false;
        this.log(`🔒 LOCKED to ${lockedTarget} for overnight viewing`);
        this.initializeCameraPosition(lockedTarget);
      }
      return; // Don't switch when locked
    }
    
    // Calculate if we should switch
    const shouldSwitch = bestAgent && bestAgent !== this.currentTarget && (
      // Switch if significantly more interesting
      (bestScore - currentTargetScore > CAMERA_SETTINGS.TARGET_SWITCH.ACTIVITY_THRESHOLD) ||
      // Or if current target has been focused long enough
      (now - this.lastTargetSwitch > CAMERA_SETTINGS.TARGET_SWITCH.MIN_INTERVAL * 2)
    );
    
    if (shouldSwitch && now - this.lastTargetSwitch > CAMERA_SETTINGS.TARGET_SWITCH.MIN_INTERVAL) {
      this.currentTarget = bestAgent;
      this.lastTargetSwitch = now;
      this.cameraInitialized = false;
      
      const targetActivity = this.targetAgents.get(bestAgent!)!;
      const reason = targetActivity.eventType || (targetActivity.isMoving ? 'moving' : 'active');
      this.log(`🎬 Switching to ${bestAgent} (${reason}, score: ${bestScore.toFixed(0)})`);
      
      // Initialize camera position near new target
      this.initializeCameraPosition(bestAgent!);
      
      // Maybe do a quick cut for dramatic effect
      if (targetActivity.eventType === 'combat' || targetActivity.eventType === 'building') {
        this.changeShot();
      }
    } else if (!this.currentTarget && bestAgent) {
      this.currentTarget = bestAgent;
      this.lastTargetSwitch = now;
      this.cameraInitialized = false;
      this.log(`🎬 Initial target: ${bestAgent}`);
      this.initializeCameraPosition(bestAgent);
    }
  }

  /**
   * Initialize camera position behind a target agent
   */
  private initializeCameraPosition(username: string): void {
    const target = this.targetAgents.get(username);
    if (!target?.position) {
      this.cameraInitialized = false;
      return;
    }
    
    const shot = CAMERA_SETTINGS.SHOTS[this.currentShot];
    // Position camera behind the agent
    const pos = target.position.offset(
      Math.sin(this.orbitAngle) * shot.distance,
      shot.heightOffset,
      Math.cos(this.orbitAngle) * shot.distance
    );
    
    // Set spring state to this position immediately (no spring animation)
    this.springState.position = pos.clone();
    this.springState.velocity = new Vec3(0, 0, 0);
    
    // Calculate look angles toward target (chest level - below name tag)
    const targetLookPos = target.position.offset(0, 1.0, 0);
    const lookAngles = this.calculateLookAngles(pos, targetLookPos);
    this.currentYaw = lookAngles.yaw;
    this.currentPitch = lookAngles.pitch;
    this.targetYaw = lookAngles.yaw;
    this.targetPitch = lookAngles.pitch;
    
    // Teleport immediately
    this.teleportCamera(pos);
    this.cameraInitialized = true;
    this.log(`📍 Camera initialized at ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)} looking at ${username}`);
  }

  /**
   * Change to a random shot type with smooth transition
   */
  private changeShot(): void {
    if (this.povMode) return;
    
    // Maybe enter POV mode
    if (CAMERA_SETTINGS.POV_MODE.ENABLED && 
        Math.random() < CAMERA_SETTINGS.POV_MODE.CHANCE && 
        this.currentTarget) {
      this.enterPovMode(this.currentTarget);
      return;
    }
    
    // Determine current activity type
    const target = this.currentTarget ? this.targetAgents.get(this.currentTarget) : null;
    let activityType: ActivityType = 'idle';
    
    if (target) {
      if (target.eventType === 'combat') {
        activityType = 'combat';
      } else if (target.eventType === 'building') {
        activityType = 'building';
      } else if (target.eventType === 'mining') {
        activityType = 'mining';
      } else if (target.eventType === 'social') {
        activityType = 'social';
      } else if (target.isMoving) {
        // Check if exploring (moving fast with no specific event)
        const speed = target.velocity ? target.velocity.norm() : 0;
        activityType = speed > 0.2 ? 'exploring' : 'moving';
      }
    }
    
    // Check if multiple agents are close together (social situation)
    if (this.areAgentsClose()) {
      activityType = 'social';
    }
    
    // Get preferred shots for this activity
    const preferredShots = CAMERA_SETTINGS.SHOT_WEIGHTS[activityType] || CAMERA_SETTINGS.SHOT_WEIGHTS.idle;
    
    // Build weight map
    const weights: Record<string, number> = {};
    
    // Give high weight to preferred shots
    preferredShots.forEach((shot, index) => {
      weights[shot] = 40 - (index * 8); // First choice: 40, second: 32, third: 24, fourth: 16
    });
    
    // Add some variety with other shots at lower weights
    const allShots: ShotType[] = ['follow', 'closeBehind', 'shoulder', 'action', 'lowAngle', 'highAngle', 
                                   'overhead', 'wide', 'side', 'orbit'];
    allShots.forEach(shot => {
      if (!weights[shot]) {
        weights[shot] = 5; // Low base weight for variety
      }
    });
    
    // Special handling for social situations
    if (activityType === 'social') {
      weights['twoShot'] = 50;
      weights['group'] = 40;
      weights['wide'] = 30;
    }
    
    // Avoid repeating the same shot
    if (this.currentShot && weights[this.currentShot]) {
      weights[this.currentShot] = Math.max(0, weights[this.currentShot] - 30);
    }
    
    // Calculate total weight
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (const [shot, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        // Use quick cut for action moments
        if (activityType === 'combat' || 
            (target?.lastAction && CAMERA_SETTINGS.DRAMATIC_TRIGGERS.some(t => target.lastAction.includes(t)))) {
          this.quickCutToShot(shot as ShotType);
        } else {
          this.transitionToShot(shot as ShotType);
        }
        return;
      }
    }
    
    // Fallback
    this.transitionToShot('follow');
  }

  /**
   * Quick cut to a shot (no transition, immediate)
   */
  private quickCutToShot(newShot: ShotType): void {
    this.log(`⚡ Quick cut to ${newShot} shot`);
    this.currentShot = newShot;
    this.transition.active = false;
    
    // Immediately update camera position
    if (this.currentTarget) {
      const target = this.targetAgents.get(this.currentTarget);
      if (target?.position) {
        const shot = CAMERA_SETTINGS.SHOTS[this.currentShot];
        const pos = this.calculateIdealCameraPosition(target.position, shot.distance, shot.heightOffset);
        this.springState.position = pos;
        this.teleportCamera(pos);
      }
    }
  }

  /**
   * Check if multiple agents are close together
   */
  private areAgentsClose(): boolean {
    const positions: Vec3[] = [];
    for (const [_, activity] of this.targetAgents.entries()) {
      if (activity.position) {
        positions.push(activity.position);
      }
    }
    
    if (positions.length < 2) return false;
    
    // Check if any two agents are within 10 blocks
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (positions[i].distanceTo(positions[j]) < 10) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Calculate ideal camera position given target and shot parameters
   */
  private calculateIdealCameraPosition(targetPos: Vec3, distance: number, heightOffset: number): Vec3 {
    return targetPos.offset(
      Math.sin(this.orbitAngle) * distance,
      heightOffset,
      Math.cos(this.orbitAngle) * distance
    );
  }

  /**
   * Register an agent to be tracked by the camera
   */
  public registerAgent(username: string): void {
    if (!this.targetAgents.has(username)) {
      this.targetAgents.set(username, {
        username,
        lastAction: '',
        lastActionTime: Date.now(),
        activityScore: 50,
        eventType: null,
        position: null,
        health: 20,
        isMoving: false,
        velocity: null,
      });
      this.log(`📷 Registered agent for tracking: ${username}`);
    }
  }

  /**
   * Update agent position (called frequently by agent controller)
   */
  public updateAgentPosition(username: string, position: Vec3, velocity?: Vec3): void {
    const activity = this.targetAgents.get(username);
    if (activity) {
      const wasMoving = activity.isMoving;
      const prevPos = activity.position;
      
      activity.position = position;
      activity.velocity = velocity || null;
      
      // Detect movement
      if (prevPos) {
        const moved = position.distanceTo(prevPos);
        activity.isMoving = moved > 0.1;
        
        // Boost activity score for movement
        if (activity.isMoving && !wasMoving) {
          activity.activityScore = Math.min(100, activity.activityScore + 10);
        }
      }
    }
  }

  /**
   * Update agent activity from chat/actions
   */
  public updateAgentActivity(username: string, action: string): void {
    const activity = this.targetAgents.get(username);
    if (activity) {
      activity.lastAction = action;
      activity.lastActionTime = Date.now();
      activity.activityScore = Math.min(100, activity.activityScore + 20);
      
      // Detect events
      const eventType = this.detectEvent(action, username);
      if (eventType) {
        activity.eventType = eventType;
        this.handleEvent(eventType, username);
      }
    }
  }

  /**
   * Start the cinematic camera
   */
  public async start(host: string, port: number): Promise<void> {
    if (this.isRunning) return;

    this.log('🎥 Starting professional cinematic camera...');

    try {
      this.bot = mineflayer.createBot({
        host,
        port,
        username: 'CameraBot',
        hideErrors: false,
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 30000);
        
        this.bot!.once('spawn', () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.bot!.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      this.isRunning = true;
      this.log('📷 Camera bot connected!');

      // Set up spectator mode
      setTimeout(() => {
        if (this.bot) {
          this.bot.chat('/gamemode spectator');
          this.log('🎬 Spectator mode enabled');
        }
      }, 1000);

      // Set up chat handler for event detection
      this.bot.on('message', (message) => {
        const text = message.toString();
        const match = text.match(/\[(\w+)\]/);
        if (match) {
          const username = match[1];
          if (this.targetAgents.has(username)) {
            this.updateAgentActivity(username, text);
          }
        }
      });

      // Start the 30fps update loop
      this.updateInterval = setInterval(() => {
        this.updateCamera();
      }, CAMERA_SETTINGS.POSITION_UPDATE_INTERVAL);

      // Start shot change timer
      this.shotChangeInterval = setInterval(() => {
        this.changeShot();
      }, CAMERA_SETTINGS.SHOT_CHANGE_INTERVAL);

      // Start anti-AFK system
      if (CAMERA_SETTINGS.ANTI_AFK.ENABLED) {
        this.startAntiAfk();
      }

      this.log('✨ Professional cinematic camera ready!');

    } catch (error) {
      this.logError(`Failed to start camera: ${error}`);
      throw error;
    }
  }

  /**
   * Start anti-AFK system to prevent camera from being kicked
   * AGGRESSIVE mode - multiple overlapping systems to guarantee activity
   */
  private startAntiAfk(): void {
    this.log('🔄 Anti-AFK system enabled (SMOOTH MODE)');
    
    // 1. Primary anti-AFK action interval - arm swing and target check
    this.antiAfkInterval = setInterval(() => {
      if (!this.bot || !this.isRunning) return;
      
      try {
        // Swing arm (invisible action but prevents AFK)
        this.bot.swingArm('right');
        
        // DON'T use bot.look() - it fights with our smooth camera rotation
        // The teleport commands already include rotation
        
        // If we have no target, try to find one
        if (!this.currentTarget || this.targetAgents.size === 0) {
          this.selectBestTarget();
        }
      } catch (e) {
        // Ignore errors
      }
    }, CAMERA_SETTINGS.ANTI_AFK.INTERVAL);

    // 2. Movement interval - tiny movements to prevent position-based AFK detection
    this.movementInterval = setInterval(() => {
      if (!this.bot || !this.isRunning) return;
      
      try {
        // Sneak toggle (invisible but counts as activity)
        this.bot.setControlState('sneak', true);
        setTimeout(() => {
          if (this.bot) this.bot.setControlState('sneak', false);
        }, 100);
        
        // Jump occasionally
        if (Math.random() < 0.3) {
          this.bot.setControlState('jump', true);
          setTimeout(() => {
            if (this.bot) this.bot.setControlState('jump', false);
          }, 50);
        }
      } catch (e) {
        // Ignore errors
      }
    }, CAMERA_SETTINGS.ANTI_AFK.MOVEMENT_INTERVAL);

    // 3. Spectate refresh interval - ensure camera stays in spectator mode
    // NOTE: Camera does NOT spectate agents - it positions itself independently
    // This allows OTHER players to spectate the camera bot
    this.spectateRefreshInterval = setInterval(() => {
      if (!this.bot || !this.isRunning) return;
      
      try {
        // Just ensure we're in spectator mode - don't spectate anyone
        // This keeps camera as independent entity that others can spectate
        this.bot.chat('/gamemode spectator');
        
        // If no target, find one
        if (!this.currentTarget) {
          this.selectBestTarget();
        }
      } catch (e) {
        // Ignore errors
      }
    }, CAMERA_SETTINGS.ANTI_AFK.SPECTATE_REFRESH);

    // 4. Teleport refresh interval - only teleport when truly stuck (not constantly)
    // This is a gentler fallback than the stuck recovery system
    this.teleportRefreshInterval = setInterval(() => {
      if (!this.bot || !this.isRunning) return;
      
      try {
        // Only teleport if we're stuck for a significant time
        const timeSinceMove = Date.now() - this.lastCameraMovement;
        if (timeSinceMove < 15000) {
          // Camera is moving normally, don't force teleport
          return;
        }
        
        // Camera appears stuck after 15s - gentle recovery teleport
        if (this.currentTarget) {
          const targetBot = this.bot.players[this.currentTarget];
          if (targetBot && targetBot.entity) {
            const targetPos = targetBot.entity.position;
            // Only Y-level based underground check
            const isUnderground = targetPos.y < CAMERA_SETTINGS.UNDERGROUND.Y_THRESHOLD;
            
            if (isUnderground) {
              // Underground: teleport directly to player
              this.bot.chat(`/tp @s ${this.currentTarget}`);
              setTimeout(() => {
                if (this.bot) this.bot.chat(`/tp @s ~2 ~0.5 ~2`);
              }, 100);
            } else {
              // Surface: use offset position
              const yaw = targetBot.entity.yaw || 0;
              const offsetX = Math.sin(yaw) * 4;
              const offsetZ = Math.cos(yaw) * 4;
              const tpX = Math.floor(targetPos.x + offsetX);
              const tpY = Math.floor(targetPos.y + 3);
              const tpZ = Math.floor(targetPos.z + offsetZ);
              this.bot.chat(`/tp @s ${tpX} ${tpY} ${tpZ}`);
            }
            // Don't log every teleport - too spammy
            this.lastCameraMovement = Date.now();
          }
        } else {
          this.selectBestTarget();
        }
      } catch (e) {
        // Ignore errors
      }
    }, CAMERA_SETTINGS.ANTI_AFK.TELEPORT_REFRESH);

    // 5. Cursor wobble interval - continuous subtle mouse movement to prevent AFK
    if (CAMERA_SETTINGS.ANTI_AFK.CURSOR_WOBBLE.ENABLED) {
      this.cursorWobbleInterval = setInterval(() => {
        if (!this.bot || !this.isRunning || !this.bot.entity) return;
        
        try {
          // Increment phase for smooth oscillation
          this.wobblePhase += 0.5 + (Math.random() * CAMERA_SETTINGS.ANTI_AFK.CURSOR_WOBBLE.RANDOM_FACTOR);
          
          // Create smooth sinusoidal wobble
          const wobbleYaw = Math.sin(this.wobblePhase) * CAMERA_SETTINGS.ANTI_AFK.CURSOR_WOBBLE.AMPLITUDE;
          const wobblePitch = Math.cos(this.wobblePhase * 0.7) * CAMERA_SETTINGS.ANTI_AFK.CURSOR_WOBBLE.AMPLITUDE * 0.5;
          
          // Apply subtle look adjustment
          const newYaw = this.bot.entity.yaw + wobbleYaw;
          const newPitch = Math.max(-Math.PI/2 + 0.1, Math.min(Math.PI/2 - 0.1, this.bot.entity.pitch + wobblePitch));
          
          this.bot.look(newYaw, newPitch, false);
        } catch (e) {
          // Ignore errors
        }
      }, CAMERA_SETTINGS.ANTI_AFK.CURSOR_WOBBLE.INTERVAL);
      
      this.log('🔄 Cursor wobble enabled - camera will stay active while you sleep');
    }

    // 6. Stuck recovery interval - detect and fix stuck camera
    if (CAMERA_SETTINGS.ANTI_AFK.STUCK_RECOVERY.ENABLED) {
      this.stuckRecoveryInterval = setInterval(() => {
        if (!this.bot || !this.isRunning) return;
        
        try {
          const now = Date.now();
          const currentPos = this.springState.position;
          
          // Check if camera has moved
          if (this.lastCameraPosition) {
            const moved = currentPos.distanceTo(this.lastCameraPosition);
            if (moved > 0.5) {
              // Camera is moving normally
              this.lastCameraMovement = now;
              this.consecutiveStuckChecks = 0;
              this.stuckLogged = false; // Reset so we can log again if stuck later
            } else {
              // Camera hasn't moved
              this.consecutiveStuckChecks++;
            }
          }
          this.lastCameraPosition = currentPos.clone();
          
          // Check if stuck for too long (use settings, not hardcoded values)
          const timeSinceMove = now - this.lastCameraMovement;
          const maxIdleTime = CAMERA_SETTINGS.ANTI_AFK.STUCK_RECOVERY.MAX_IDLE_TIME || 30000;
          const maxBlockedChecks = CAMERA_SETTINGS.ANTI_AFK.STUCK_RECOVERY.MAX_BLOCKED_CHECKS || 6;
          
          // Only trigger if BOTH conditions met: idle too long AND too many blocked checks
          if (timeSinceMove > maxIdleTime && this.consecutiveStuckChecks >= maxBlockedChecks) {
            // Only log once per stuck episode
            if (!this.stuckLogged) {
              this.log(`⚠️ Camera stuck! (idle: ${(timeSinceMove/1000).toFixed(1)}s, checks: ${this.consecutiveStuckChecks})`);
              this.stuckLogged = true;
            }
            
            // Exit POV mode if stuck there
            if (this.povMode) {
              this.exitPovMode();
            }
            
            // Force spectator mode
            this.bot.chat('/gamemode spectator');
            
            // Force re-discover agents
            this.syncPlayerPositions();
            
            // Reset current target to force re-selection
            const hadTarget = this.currentTarget;
            this.currentTarget = null;
            this.cameraInitialized = false;
            
            // Find a new target
            this.selectBestTarget();
            
            // If we found a target, teleport DIRECTLY to them (not offset)
            if (this.currentTarget) {
              const target = this.targetAgents.get(this.currentTarget);
              if (target?.position) {
                // Check if underground (Y < 40 only, ignore cave detection for buildings)
                const isUnderground = target.position.y < CAMERA_SETTINGS.UNDERGROUND.Y_THRESHOLD;
                if (isUnderground) {
                  // Underground: teleport DIRECTLY to player (let server handle it)
                  this.bot.chat(`/tp @s ${this.currentTarget}`);
                  // After direct teleport, offset slightly
                  setTimeout(() => {
                    if (this.bot && this.currentTarget) {
                      this.bot.chat(`/tp @s ~2 ~1 ~2`);
                    }
                  }, 100);
                } else {
                  // Surface: teleport behind and above
                  const tpPos = target.position.offset(0, 4, 4);
                  this.bot.chat(`/tp @s ${tpPos.x.toFixed(0)} ${tpPos.y.toFixed(0)} ${tpPos.z.toFixed(0)}`);
                  // Reset spring position to avoid weird interpolation
                  this.springState.position = tpPos;
                  this.springState.velocity = new Vec3(0, 0, 0);
                }
                
                // Initialize for new target
                this.initializeCameraPosition(this.currentTarget);
              }
            } else {
              // No agents found - try to find any player
              for (const playerName of Object.keys(this.bot.players)) {
                if (playerName !== this.bot.username) {
                  this.registerAgent(playerName);
                }
              }
              this.selectBestTarget();
            }
            
            // Reset stuck detection
            this.lastCameraMovement = now;
            this.consecutiveStuckChecks = 0;
            this.stuckLogged = false; // Allow logging again next time
            
            // Force a shot change to wide/overhead for better visibility
            if (this.currentTarget) {
              const target = this.targetAgents.get(this.currentTarget);
              if (target?.position && target.position.y < CAMERA_SETTINGS.UNDERGROUND.Y_THRESHOLD) {
                // Underground: use closer shots
                this.transitionToShot('closeBehind');
              } else {
                this.changeShot();
              }
            }
          }
        } catch (e) {
          this.logError(`Stuck recovery error: ${e}`);
        }
      }, CAMERA_SETTINGS.ANTI_AFK.STUCK_RECOVERY.CHECK_INTERVAL);
      
      this.log('🔧 Stuck recovery system enabled');
    }
  }

  /**
   * Stop the cinematic camera
   */
  public stop(): void {
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    if (this.shotChangeInterval) {
      clearInterval(this.shotChangeInterval);
      this.shotChangeInterval = null;
    }
    
    if (this.antiAfkInterval) {
      clearInterval(this.antiAfkInterval);
      this.antiAfkInterval = null;
    }
    
    if (this.spectateRefreshInterval) {
      clearInterval(this.spectateRefreshInterval);
      this.spectateRefreshInterval = null;
    }

    if (this.teleportRefreshInterval) {
      clearInterval(this.teleportRefreshInterval);
      this.teleportRefreshInterval = null;
    }

    if (this.movementInterval) {
      clearInterval(this.movementInterval);
      this.movementInterval = null;
    }

    if (this.cursorWobbleInterval) {
      clearInterval(this.cursorWobbleInterval);
      this.cursorWobbleInterval = null;
    }

    if (this.stuckRecoveryInterval) {
      clearInterval(this.stuckRecoveryInterval);
      this.stuckRecoveryInterval = null;
    }
    
    if (this.povMode) {
      this.exitPovMode();
    }
    
    if (this.bot) {
      this.bot.quit();
      this.bot = null;
    }
    
    this.log('Cinematic camera stopped');
  }

  /**
   * Check if camera is running
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get current camera status
   */
  public getStatus(): object {
    return {
      running: this.isRunning,
      currentTarget: this.currentTarget,
      currentShot: this.currentShot,
      povMode: this.povMode,
      povTarget: this.povTarget,
      undergroundSpectate: this.undergroundSpectate,
      transition: this.transition.active,
      trackedAgents: Array.from(this.targetAgents.keys()),
      currentEvent: this.currentEvent,
      position: this.springState.position,
      fps: Math.round(1000 / CAMERA_SETTINGS.POSITION_UPDATE_INTERVAL),
    };
  }
}

// Export singleton instance
export const cinematicCamera = new CinematicCamera();
