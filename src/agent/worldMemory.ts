/**
 * Persistent World Memory System - AI Civilization
 * 
 * This system creates shared persistent knowledge that forms the basis of
 * an AI society within Minecraft. Agents remember, share, and build upon
 * collective knowledge across sessions.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// WORLD MAP - Collective spatial knowledge
// ============================================================================

export interface MapRegion {
  id: string;
  name: string;
  centerX: number;
  centerZ: number;
  radius: number;
  biome?: string;
  dangerLevel: number;        // 0-10
  resourceRichness: number;   // 0-10
  exploredBy: string[];       // Agent names who explored
  firstExplored: number;      // Timestamp
  lastVisited: number;
  pointsOfInterest: PointOfInterest[];
  notes: string[];
}

export interface PointOfInterest {
  id: string;
  type: 'structure' | 'resource_deposit' | 'danger_zone' | 'spawn_point' | 
        'build_site' | 'death_location' | 'cave_entrance' | 'landmark';
  name: string;
  x: number;
  y: number;
  z: number;
  description: string;
  discoveredBy: string;
  discoveredAt: number;
  visits: number;
  lastVisit: number;
  importance: number;
  tags: string[];
  warnings?: string[];
}

export interface DangerZone {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  type: 'mob_spawner' | 'lava' | 'cliff' | 'water' | 'pvp_zone' | 'creeper_area' | 'unknown';
  description: string;
  reportedBy: string[];
  deathCount: number;
  lastIncident: number;
  avoidanceAdvice: string;
}

// ============================================================================
// HISTORY - World events and agent achievements
// ============================================================================

export interface HistoricalEvent {
  id: string;
  timestamp: number;
  type: 'world_event' | 'build_completed' | 'discovery' | 'death' | 'achievement' |
        'conflict' | 'collaboration' | 'milestone' | 'disaster' | 'celebration';
  title: string;
  description: string;
  participants: string[];
  location?: { x: number; y: number; z: number };
  significance: number;  // 1-10, how important for civilization history
  tags: string[];
}

export interface AgentAchievement {
  id: string;
  agentName: string;
  type: 'first_discovery' | 'major_build' | 'helped_another' | 'survived_danger' |
        'resource_milestone' | 'exploration_milestone' | 'master_builder' | 'veteran';
  title: string;
  description: string;
  earnedAt: number;
  location?: { x: number; y: number; z: number };
}

export interface DeathRecord {
  id: string;
  agentName: string;
  timestamp: number;
  x: number;
  y: number;
  z: number;
  cause: string;
  hadValuableItems: boolean;
  lesson: string;
  avenged: boolean;
}

// ============================================================================
// LAND OWNERSHIP - Territory and build claims
// ============================================================================

export interface Territory {
  id: string;
  name: string;
  owner: string;              // Agent name
  coOwners: string[];         // Agents who can also build here
  centerX: number;
  centerZ: number;
  radius: number;
  claimedAt: number;
  purpose: 'residential' | 'industrial' | 'farm' | 'public' | 'monument' | 'storage' | 'mixed';
  builds: BuildClaim[];
  isProtected: boolean;       // Other agents should avoid building here
  description: string;
}

export interface BuildClaim {
  id: string;
  name: string;
  builder: string;
  contributors: string[];     // Other agents who helped
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  type: 'house' | 'tower' | 'farm' | 'storage' | 'decoration' | 'infrastructure' | 'monument' | 'other';
  startedAt: number;
  completedAt?: number;
  isComplete: boolean;
  description: string;
  materials: string[];        // Main materials used
  rating?: number;            // Community rating 1-10
  ratingCount?: number;
}

// ============================================================================
// RELATIONSHIPS - Agent-to-agent social dynamics
// ============================================================================

export interface Relationship {
  id: string;
  agent1: string;
  agent2: string;
  type: 'ally' | 'friend' | 'acquaintance' | 'neutral' | 'rival' | 'enemy';
  trustLevel: number;         // -10 to 10
  collaborationCount: number; // Times worked together
  conflictCount: number;      // Times had disputes
  lastInteraction: number;
  firstMet: number;
  notes: string[];
  sharedExperiences: string[]; // IDs of historical events they shared
}

export interface SocialInteraction {
  id: string;
  timestamp: number;
  agents: string[];
  type: 'helped' | 'gifted' | 'traded' | 'collaborated' | 'argued' | 'griefed' | 'saved' | 'taught';
  description: string;
  impact: number;             // -10 to 10, effect on relationship
  location?: { x: number; y: number; z: number };
}

// ============================================================================
// REPUTATION - Community standing and skills
// ============================================================================

export interface AgentReputation {
  agentName: string;
  
  // Core reputation scores (all 0-100)
  overallReputation: number;
  trustworthiness: number;
  helpfulness: number;
  buildingSkill: number;
  explorationSkill: number;
  combatSkill: number;
  socialSkill: number;
  
  // Titles and roles
  titles: string[];           // "Master Builder", "Explorer", "Veteran"
  role?: 'leader' | 'builder' | 'explorer' | 'defender' | 'farmer' | 'helper' | 'newcomer';
  
  // Stats
  joinedAt: number;
  totalBuilds: number;
  buildsCompleted: number;
  regionsExplored: number;
  deathCount: number;
  helpedOthers: number;
  receivedHelp: number;
  
  // Community feedback
  endorsements: Endorsement[];
  complaints: Complaint[];
  
  // Special flags
  isVeteran: boolean;         // Been around > 7 days
  isTrusted: boolean;         // Reputation > 70
  isLeader: boolean;          // Elected or emergent leader
}

export interface Endorsement {
  from: string;
  skill: 'building' | 'exploration' | 'helping' | 'leadership' | 'creativity';
  timestamp: number;
  reason: string;
}

export interface Complaint {
  from: string;
  type: 'griefing' | 'unhelpful' | 'rude' | 'dangerous' | 'unreliable';
  timestamp: number;
  description: string;
  resolved: boolean;
}

// ============================================================================
// WORLD MEMORY STORE - Persistent storage for all world knowledge
// ============================================================================

interface WorldMemoryStore {
  version: number;
  lastUpdated: number;
  
  // Map data
  regions: MapRegion[];
  pointsOfInterest: PointOfInterest[];
  dangerZones: DangerZone[];
  
  // History
  events: HistoricalEvent[];
  achievements: AgentAchievement[];
  deaths: DeathRecord[];
  
  // Territory
  territories: Territory[];
  buildClaims: BuildClaim[];
  
  // Social
  relationships: Relationship[];
  interactions: SocialInteraction[];
  reputations: AgentReputation[];
  
  // Meta
  worldAge: number;           // Days since first agent
  civilizationLevel: number;  // Calculated based on builds, exploration, population
}

// ============================================================================
// WORLD MEMORY CLASS - Main interface for civilization memory
// ============================================================================

export class WorldMemory {
  private static instance: WorldMemory;
  private store: WorldMemoryStore;
  private filePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    const memoryDir = path.join(__dirname, '../training/knowledge/world');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.filePath = path.join(memoryDir, 'world_memory.json');
    this.store = this.load();
  }

  static getInstance(): WorldMemory {
    if (!WorldMemory.instance) {
      WorldMemory.instance = new WorldMemory();
    }
    return WorldMemory.instance;
  }

  private load(): WorldMemoryStore {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const store = JSON.parse(data);
        console.log(`[WorldMemory] Loaded world memory - ${store.events?.length || 0} events, ${store.regions?.length || 0} regions`);
        return store;
      }
    } catch (error) {
      console.error('[WorldMemory] Error loading:', error);
    }
    
    // Initialize new world memory
    return this.createFreshStore();
  }

  private createFreshStore(): WorldMemoryStore {
    return {
      version: 1,
      lastUpdated: Date.now(),
      regions: [],
      pointsOfInterest: [],
      dangerZones: [],
      events: [],
      achievements: [],
      deaths: [],
      territories: [],
      buildClaims: [],
      relationships: [],
      interactions: [],
      reputations: [],
      worldAge: 0,
      civilizationLevel: 1
    };
  }

  private save(): void {
    // Debounce saves to avoid excessive disk writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      try {
        this.store.lastUpdated = Date.now();
        fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2));
      } catch (error) {
        console.error('[WorldMemory] Error saving:', error);
      }
    }, 1000);
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================================================
  // MAP METHODS
  // ============================================================================

  /**
   * Record exploration of a new area
   */
  recordExploration(
    agentName: string,
    x: number,
    z: number,
    biome?: string,
    notes?: string
  ): MapRegion {
    // Check if this area is already mapped (within 50 blocks of existing region)
    const existing = this.store.regions.find(r => {
      const dist = Math.sqrt(Math.pow(r.centerX - x, 2) + Math.pow(r.centerZ - z, 2));
      return dist < 50;
    });

    if (existing) {
      if (!existing.exploredBy.includes(agentName)) {
        existing.exploredBy.push(agentName);
      }
      existing.lastVisited = Date.now();
      if (notes) existing.notes.push(`[${agentName}] ${notes}`);
      this.save();
      return existing;
    }

    // Create new region
    const region: MapRegion = {
      id: this.generateId(),
      name: `Region_${Math.floor(x / 100)}_${Math.floor(z / 100)}`,
      centerX: x,
      centerZ: z,
      radius: 50,
      biome,
      dangerLevel: 0,
      resourceRichness: 0,
      exploredBy: [agentName],
      firstExplored: Date.now(),
      lastVisited: Date.now(),
      pointsOfInterest: [],
      notes: notes ? [`[${agentName}] ${notes}`] : []
    };

    this.store.regions.push(region);
    this.save();

    console.log(`[WorldMemory] ${agentName} explored new region at (${x}, ${z})`);
    return region;
  }

  /**
   * Add a point of interest to the world map
   */
  addPointOfInterest(poi: Omit<PointOfInterest, 'id' | 'visits' | 'lastVisit'>): PointOfInterest {
    const newPoi: PointOfInterest = {
      ...poi,
      id: this.generateId(),
      visits: 1,
      lastVisit: Date.now()
    };

    this.store.pointsOfInterest.push(newPoi);
    this.save();

    console.log(`[WorldMemory] New POI: ${poi.name} at (${poi.x}, ${poi.y}, ${poi.z})`);
    return newPoi;
  }

  /**
   * Record a dangerous area (death location, mob spawner, etc.)
   */
  recordDangerZone(
    x: number, y: number, z: number,
    type: DangerZone['type'],
    description: string,
    reportedBy: string,
    advice: string
  ): DangerZone {
    // Check for existing danger zone nearby
    const existing = this.store.dangerZones.find(dz => {
      const dist = Math.sqrt(
        Math.pow(dz.x - x, 2) + Math.pow(dz.y - y, 2) + Math.pow(dz.z - z, 2)
      );
      return dist < 20;
    });

    if (existing) {
      if (!existing.reportedBy.includes(reportedBy)) {
        existing.reportedBy.push(reportedBy);
      }
      existing.deathCount++;
      existing.lastIncident = Date.now();
      this.save();
      return existing;
    }

    const dangerZone: DangerZone = {
      id: this.generateId(),
      x, y, z,
      radius: 20,
      type,
      description,
      reportedBy: [reportedBy],
      deathCount: 1,
      lastIncident: Date.now(),
      avoidanceAdvice: advice
    };

    this.store.dangerZones.push(dangerZone);
    this.save();

    console.log(`[WorldMemory] ⚠️ Danger zone recorded at (${x}, ${y}, ${z}): ${description}`);
    return dangerZone;
  }

  /**
   * Get danger zones near a location
   */
  getDangerZonesNear(x: number, y: number, z: number, radius: number = 100): DangerZone[] {
    return this.store.dangerZones.filter(dz => {
      const dist = Math.sqrt(
        Math.pow(dz.x - x, 2) + Math.pow(dz.y - y, 2) + Math.pow(dz.z - z, 2)
      );
      return dist <= radius;
    });
  }

  /**
   * Get points of interest near a location
   */
  getPOIsNear(x: number, z: number, radius: number = 200): PointOfInterest[] {
    return this.store.pointsOfInterest.filter(poi => {
      const dist = Math.sqrt(Math.pow(poi.x - x, 2) + Math.pow(poi.z - z, 2));
      return dist <= radius;
    }).sort((a, b) => b.importance - a.importance);
  }

  // ============================================================================
  // HISTORY METHODS
  // ============================================================================

  /**
   * Record a historical event
   */
  recordEvent(event: Omit<HistoricalEvent, 'id' | 'timestamp'>): HistoricalEvent {
    const newEvent: HistoricalEvent = {
      ...event,
      id: this.generateId(),
      timestamp: Date.now()
    };

    this.store.events.push(newEvent);
    
    // Keep only last 500 events (oldest get archived conceptually)
    if (this.store.events.length > 500) {
      this.store.events = this.store.events
        .sort((a, b) => b.significance - a.significance || b.timestamp - a.timestamp)
        .slice(0, 500);
    }

    this.save();
    console.log(`[WorldMemory] 📜 Event recorded: ${event.title}`);
    return newEvent;
  }

  /**
   * Record an agent death
   */
  recordDeath(
    agentName: string,
    x: number, y: number, z: number,
    cause: string,
    hadValuableItems: boolean
  ): DeathRecord {
    const lesson = this.generateDeathLesson(cause);
    
    const death: DeathRecord = {
      id: this.generateId(),
      agentName,
      timestamp: Date.now(),
      x, y, z,
      cause,
      hadValuableItems,
      lesson,
      avenged: false
    };

    this.store.deaths.push(death);

    // Update reputation
    this.updateReputationStat(agentName, 'deathCount', 1);

    // Record as danger zone
    this.recordDangerZone(x, y, z, 'unknown', `${agentName} died here: ${cause}`, agentName, lesson);

    // Record as historical event if notable
    if (hadValuableItems) {
      this.recordEvent({
        type: 'death',
        title: `${agentName}'s Tragic Death`,
        description: `${agentName} perished at (${x}, ${y}, ${z}) due to ${cause}. Valuable items were lost.`,
        participants: [agentName],
        location: { x, y, z },
        significance: 5,
        tags: ['death', 'tragedy', cause.toLowerCase()]
      });
    }

    this.save();
    console.log(`[WorldMemory] 💀 ${agentName} died: ${cause} at (${x}, ${y}, ${z})`);
    return death;
  }

  private generateDeathLesson(cause: string): string {
    const causeLower = cause.toLowerCase();
    if (causeLower.includes('creeper')) return 'Keep distance from creepers, listen for hissing sounds';
    if (causeLower.includes('skeleton')) return 'Approach skeletons with shield or strafe to avoid arrows';
    if (causeLower.includes('zombie')) return 'Zombies are slow but dangerous in groups - clear them one by one';
    if (causeLower.includes('fall')) return 'Always check cliff edges, place water bucket before jumping';
    if (causeLower.includes('lava')) return 'Never dig straight down, always carry a water bucket';
    if (causeLower.includes('drown')) return 'Watch air meter carefully, surface before it runs out';
    if (causeLower.includes('fire')) return 'Keep water nearby, avoid fire sources';
    if (causeLower.includes('starv')) return 'Keep food supply stocked, eat before health gets low';
    return 'Be more careful in this area, danger is present';
  }

  /**
   * Award an achievement to an agent
   */
  awardAchievement(achievement: Omit<AgentAchievement, 'id' | 'earnedAt'>): AgentAchievement {
    const newAchievement: AgentAchievement = {
      ...achievement,
      id: this.generateId(),
      earnedAt: Date.now()
    };

    this.store.achievements.push(newAchievement);

    // Add title to reputation
    const rep = this.getOrCreateReputation(achievement.agentName);
    if (!rep.titles.includes(achievement.title)) {
      rep.titles.push(achievement.title);
    }

    this.save();
    console.log(`[WorldMemory] 🏆 ${achievement.agentName} earned: ${achievement.title}`);
    return newAchievement;
  }

  /**
   * Get recent history
   */
  getRecentHistory(limit: number = 20): HistoricalEvent[] {
    return this.store.events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get significant history (for storytelling)
   */
  getSignificantHistory(minSignificance: number = 5): HistoricalEvent[] {
    return this.store.events
      .filter(e => e.significance >= minSignificance)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  // ============================================================================
  // TERRITORY METHODS
  // ============================================================================

  /**
   * Claim a territory
   */
  claimTerritory(
    owner: string,
    name: string,
    centerX: number,
    centerZ: number,
    radius: number = 30,
    purpose: Territory['purpose'] = 'mixed'
  ): Territory | null {
    // Check for overlapping claims
    const overlap = this.store.territories.find(t => {
      const dist = Math.sqrt(Math.pow(t.centerX - centerX, 2) + Math.pow(t.centerZ - centerZ, 2));
      return dist < (t.radius + radius);
    });

    if (overlap) {
      console.log(`[WorldMemory] ❌ Territory claim rejected - overlaps with ${overlap.name}`);
      return null;
    }

    const territory: Territory = {
      id: this.generateId(),
      name,
      owner,
      coOwners: [],
      centerX,
      centerZ,
      radius,
      claimedAt: Date.now(),
      purpose,
      builds: [],
      isProtected: true,
      description: `${owner}'s ${purpose} territory`
    };

    this.store.territories.push(territory);
    this.save();

    console.log(`[WorldMemory] 🏴 ${owner} claimed territory: ${name}`);
    return territory;
  }

  /**
   * Register a build
   */
  registerBuild(build: Omit<BuildClaim, 'id' | 'startedAt' | 'isComplete' | 'contributors'>): BuildClaim {
    const newBuild: BuildClaim = {
      ...build,
      id: this.generateId(),
      startedAt: Date.now(),
      isComplete: false,
      contributors: []
    };

    this.store.buildClaims.push(newBuild);
    this.updateReputationStat(build.builder, 'totalBuilds', 1);

    this.save();
    console.log(`[WorldMemory] 🏗️ ${build.builder} started building: ${build.name}`);
    return newBuild;
  }

  /**
   * Mark a build as complete
   */
  completeBuild(buildId: string): boolean {
    const build = this.store.buildClaims.find(b => b.id === buildId);
    if (!build) return false;

    build.isComplete = true;
    build.completedAt = Date.now();

    this.updateReputationStat(build.builder, 'buildsCompleted', 1);

    // Record as historical event
    this.recordEvent({
      type: 'build_completed',
      title: `${build.name} Completed`,
      description: `${build.builder} completed ${build.type} "${build.name}"`,
      participants: [build.builder, ...build.contributors],
      location: { x: build.x, y: build.y, z: build.z },
      significance: 3,
      tags: ['build', build.type, build.builder]
    });

    this.save();
    return true;
  }

  /**
   * Check if a location is in someone's territory
   */
  getTerritoryAt(x: number, z: number): Territory | null {
    return this.store.territories.find(t => {
      const dist = Math.sqrt(Math.pow(t.centerX - x, 2) + Math.pow(t.centerZ - z, 2));
      return dist <= t.radius;
    }) || null;
  }

  /**
   * Get builds by an agent
   */
  getBuildsByAgent(agentName: string): BuildClaim[] {
    return this.store.buildClaims.filter(b => 
      b.builder === agentName || b.contributors.includes(agentName)
    );
  }

  // ============================================================================
  // RELATIONSHIP METHODS
  // ============================================================================

  /**
   * Record a social interaction
   */
  recordInteraction(interaction: Omit<SocialInteraction, 'id' | 'timestamp'>): SocialInteraction {
    const newInteraction: SocialInteraction = {
      ...interaction,
      id: this.generateId(),
      timestamp: Date.now()
    };

    this.store.interactions.push(newInteraction);

    // Update relationships for all agent pairs
    for (let i = 0; i < interaction.agents.length; i++) {
      for (let j = i + 1; j < interaction.agents.length; j++) {
        this.updateRelationship(
          interaction.agents[i],
          interaction.agents[j],
          interaction.type,
          interaction.impact
        );
      }
    }

    // Keep only last 1000 interactions
    if (this.store.interactions.length > 1000) {
      this.store.interactions = this.store.interactions
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 1000);
    }

    this.save();
    return newInteraction;
  }

  private updateRelationship(
    agent1: string,
    agent2: string,
    interactionType: SocialInteraction['type'],
    impact: number
  ): void {
    let rel = this.store.relationships.find(
      r => (r.agent1 === agent1 && r.agent2 === agent2) ||
           (r.agent1 === agent2 && r.agent2 === agent1)
    );

    if (!rel) {
      rel = {
        id: this.generateId(),
        agent1,
        agent2,
        type: 'acquaintance',
        trustLevel: 0,
        collaborationCount: 0,
        conflictCount: 0,
        lastInteraction: Date.now(),
        firstMet: Date.now(),
        notes: [],
        sharedExperiences: []
      };
      this.store.relationships.push(rel);
    }

    rel.lastInteraction = Date.now();
    rel.trustLevel = Math.max(-10, Math.min(10, rel.trustLevel + impact));

    // Update counts based on interaction type
    if (['helped', 'gifted', 'collaborated', 'saved', 'taught'].includes(interactionType)) {
      rel.collaborationCount++;
      
      // Update helper's reputation
      this.updateReputationStat(agent1, 'helpedOthers', 1);
      this.updateReputationStat(agent2, 'receivedHelp', 1);
    }
    if (['argued', 'griefed'].includes(interactionType)) {
      rel.conflictCount++;
    }

    // Determine relationship type based on trust level
    if (rel.trustLevel >= 8) rel.type = 'ally';
    else if (rel.trustLevel >= 5) rel.type = 'friend';
    else if (rel.trustLevel >= 2) rel.type = 'acquaintance';
    else if (rel.trustLevel >= -2) rel.type = 'neutral';
    else if (rel.trustLevel >= -5) rel.type = 'rival';
    else rel.type = 'enemy';
  }

  /**
   * Get relationship between two agents
   */
  getRelationship(agent1: string, agent2: string): Relationship | null {
    return this.store.relationships.find(
      r => (r.agent1 === agent1 && r.agent2 === agent2) ||
           (r.agent1 === agent2 && r.agent2 === agent1)
    ) || null;
  }

  /**
   * Get all relationships for an agent
   */
  getAgentRelationships(agentName: string): Relationship[] {
    return this.store.relationships.filter(
      r => r.agent1 === agentName || r.agent2 === agentName
    );
  }

  /**
   * Get agents with positive relationships (for collaboration)
   */
  getFriendlyAgents(agentName: string): string[] {
    return this.getAgentRelationships(agentName)
      .filter(r => r.trustLevel >= 2)
      .map(r => r.agent1 === agentName ? r.agent2 : r.agent1);
  }

  // ============================================================================
  // REPUTATION METHODS
  // ============================================================================

  private getOrCreateReputation(agentName: string): AgentReputation {
    let rep = this.store.reputations.find(r => r.agentName === agentName);
    
    if (!rep) {
      rep = {
        agentName,
        overallReputation: 50,
        trustworthiness: 50,
        helpfulness: 50,
        buildingSkill: 30,
        explorationSkill: 30,
        combatSkill: 30,
        socialSkill: 50,
        titles: [],
        role: 'newcomer',
        joinedAt: Date.now(),
        totalBuilds: 0,
        buildsCompleted: 0,
        regionsExplored: 0,
        deathCount: 0,
        helpedOthers: 0,
        receivedHelp: 0,
        endorsements: [],
        complaints: [],
        isVeteran: false,
        isTrusted: false,
        isLeader: false
      };
      this.store.reputations.push(rep);
    }

    return rep;
  }

  /**
   * Update a reputation stat
   */
  updateReputationStat(agentName: string, stat: keyof AgentReputation, delta: number): void {
    const rep = this.getOrCreateReputation(agentName);
    const currentValue = rep[stat];
    
    if (typeof currentValue === 'number') {
      (rep as any)[stat] = currentValue + delta;
      this.recalculateReputation(rep);
      this.save();
    }
  }

  /**
   * Update a skill level
   */
  updateSkill(agentName: string, skill: 'buildingSkill' | 'explorationSkill' | 'combatSkill' | 'socialSkill', delta: number): void {
    const rep = this.getOrCreateReputation(agentName);
    rep[skill] = Math.max(0, Math.min(100, rep[skill] + delta));
    this.recalculateReputation(rep);
    this.save();
  }

  private recalculateReputation(rep: AgentReputation): void {
    // Calculate overall reputation based on all factors
    rep.overallReputation = Math.round(
      (rep.trustworthiness * 0.3) +
      (rep.helpfulness * 0.2) +
      (rep.buildingSkill * 0.15) +
      (rep.explorationSkill * 0.15) +
      (rep.combatSkill * 0.1) +
      (rep.socialSkill * 0.1)
    );

    // Update status flags
    const daysSinceJoined = (Date.now() - rep.joinedAt) / (1000 * 60 * 60 * 24);
    rep.isVeteran = daysSinceJoined >= 7;
    rep.isTrusted = rep.overallReputation >= 70;

    // Assign role based on stats
    if (rep.isLeader) {
      rep.role = 'leader';
    } else if (rep.buildingSkill > 70 && rep.buildsCompleted >= 5) {
      rep.role = 'builder';
    } else if (rep.explorationSkill > 70 && rep.regionsExplored >= 10) {
      rep.role = 'explorer';
    } else if (rep.helpedOthers >= 10) {
      rep.role = 'helper';
    } else if (!rep.isVeteran) {
      rep.role = 'newcomer';
    }
  }

  /**
   * Add an endorsement
   */
  endorse(
    fromAgent: string,
    toAgent: string,
    skill: Endorsement['skill'],
    reason: string
  ): void {
    const rep = this.getOrCreateReputation(toAgent);
    
    // Check if already endorsed this skill
    const alreadyEndorsed = rep.endorsements.find(
      e => e.from === fromAgent && e.skill === skill
    );
    if (alreadyEndorsed) return;

    rep.endorsements.push({
      from: fromAgent,
      skill,
      timestamp: Date.now(),
      reason
    });

    // Boost the endorsed skill
    const skillMap: Record<Endorsement['skill'], keyof AgentReputation> = {
      building: 'buildingSkill',
      exploration: 'explorationSkill',
      helping: 'helpfulness',
      leadership: 'socialSkill',
      creativity: 'buildingSkill'
    };

    const skillKey = skillMap[skill];
    if (skillKey) {
      (rep as any)[skillKey] = Math.min(100, (rep as any)[skillKey] + 5);
    }

    this.recalculateReputation(rep);
    this.save();

    console.log(`[WorldMemory] ✨ ${fromAgent} endorsed ${toAgent} for ${skill}`);
  }

  /**
   * Get agent reputation
   */
  getReputation(agentName: string): AgentReputation {
    return this.getOrCreateReputation(agentName);
  }

  /**
   * Get all reputations sorted by overall score
   */
  getLeaderboard(): AgentReputation[] {
    return this.store.reputations
      .sort((a, b) => b.overallReputation - a.overallReputation);
  }

  // ============================================================================
  // CONTEXT GENERATION - For AI decision making
  // ============================================================================

  /**
   * Generate world context summary for an agent
   */
  getWorldContextForAgent(agentName: string, x: number, y: number, z: number): string {
    const parts: string[] = [];

    // Location context
    const nearbyPOIs = this.getPOIsNear(x, z, 100);
    const nearbyDangers = this.getDangerZonesNear(x, y, z, 50);
    const territory = this.getTerritoryAt(x, z);

    if (territory) {
      if (territory.owner === agentName) {
        parts.push(`📍 You are in your territory: "${territory.name}"`);
      } else {
        parts.push(`📍 You are in ${territory.owner}'s territory: "${territory.name}"`);
      }
    }

    if (nearbyDangers.length > 0) {
      const danger = nearbyDangers[0];
      parts.push(`⚠️ DANGER nearby: ${danger.description}. Advice: ${danger.avoidanceAdvice}`);
    }

    if (nearbyPOIs.length > 0) {
      const poiList = nearbyPOIs.slice(0, 3).map(p => `${p.name} (${p.type})`).join(', ');
      parts.push(`📌 Nearby: ${poiList}`);
    }

    // Relationship context
    const rep = this.getReputation(agentName);
    parts.push(`🏅 Your reputation: ${rep.overallReputation}/100 (${rep.role})`);

    const friends = this.getFriendlyAgents(agentName);
    if (friends.length > 0) {
      parts.push(`👥 Your allies: ${friends.join(', ')}`);
    }

    // Recent history
    const recentEvents = this.getRecentHistory(3);
    if (recentEvents.length > 0) {
      parts.push(`📜 Recent events: ${recentEvents.map(e => e.title).join('; ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Get death warnings for a location
   */
  getDeathWarningsNear(x: number, y: number, z: number, radius: number = 30): string[] {
    const nearbyDeaths = this.store.deaths.filter(d => {
      const dist = Math.sqrt(
        Math.pow(d.x - x, 2) + Math.pow(d.y - y, 2) + Math.pow(d.z - z, 2)
      );
      return dist <= radius;
    });

    return nearbyDeaths.map(d => 
      `${d.agentName} died here (${d.cause}): ${d.lesson}`
    );
  }

  // ============================================================================
  // STATS AND OVERVIEW
  // ============================================================================

  /**
   * Get civilization statistics
   */
  getCivilizationStats(): {
    worldAge: number;
    totalAgents: number;
    regionsExplored: number;
    buildsCompleted: number;
    totalDeaths: number;
    civilizationLevel: number;
  } {
    return {
      worldAge: this.store.worldAge,
      totalAgents: this.store.reputations.length,
      regionsExplored: this.store.regions.length,
      buildsCompleted: this.store.buildClaims.filter(b => b.isComplete).length,
      totalDeaths: this.store.deaths.length,
      civilizationLevel: this.calculateCivilizationLevel()
    };
  }

  private calculateCivilizationLevel(): number {
    const agents = this.store.reputations.length;
    const builds = this.store.buildClaims.filter(b => b.isComplete).length;
    const regions = this.store.regions.length;
    const veterans = this.store.reputations.filter(r => r.isVeteran).length;

    let level = 1;
    if (agents >= 2 && builds >= 1) level = 2;  // Settlement
    if (agents >= 3 && builds >= 5) level = 3;   // Village
    if (agents >= 5 && builds >= 10 && regions >= 5) level = 4; // Town
    if (agents >= 8 && builds >= 20 && veterans >= 3) level = 5; // City
    if (agents >= 12 && builds >= 50) level = 6; // Civilization

    this.store.civilizationLevel = level;
    return level;
  }
}

// Export singleton getter
export function getWorldMemory(): WorldMemory {
  return WorldMemory.getInstance();
}
