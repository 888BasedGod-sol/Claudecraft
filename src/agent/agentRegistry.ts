/**
 * Agent State Registry - Tracks all agents' positions, goals, and activities
 * 
 * Enables agents to be aware of each other for collaboration:
 * - Real-time position tracking
 * - Current goal/activity broadcasting
 * - Help requests and collaborative project proposals
 * - Meeting detection when agents are nearby
 */

import type { AgentGoal } from './autonomousAgent';

export interface AgentState {
  name: string;
  position: { x: number; y: number; z: number };
  dimension: string;
  currentActivity: string;
  currentGoal: string | null;
  lastAction: string;
  lastUpdate: number;
  health: number;
  inventory: Record<string, number>;
}

export interface HelpRequest {
  id: string;
  requesterName: string;
  task: string;
  location: { x: number; y: number; z: number };
  timestamp: number;
  responded: boolean;
  responderName?: string;
}

export interface CollaborativeProject {
  id: string;
  proposerName: string;
  projectName: string;
  description: string;
  location: { x: number; y: number; z: number };
  participants: string[];
  status: 'proposed' | 'active' | 'completed' | 'abandoned';
  createdAt: number;
}

export interface SharedDiscovery {
  id: string;
  discovererName: string;
  type: 'resource' | 'structure' | 'danger' | 'interesting' | 'biome';
  description: string;
  location: { x: number; y: number; z: number };
  timestamp: number;
  acknowledgedBy: string[];
}

export class AgentStateRegistry {
  private static instance: AgentStateRegistry;
  private agents: Map<string, AgentState> = new Map();
  private helpRequests: HelpRequest[] = [];
  private projects: CollaborativeProject[] = [];
  private discoveries: SharedDiscovery[] = [];
  private readonly STALE_THRESHOLD_MS = 30000; // 30 seconds
  private readonly MAX_DISCOVERIES = 50;
  private readonly MAX_HELP_REQUESTS = 20;

  private constructor() {
    console.log('[AgentRegistry] Initialized agent state registry');
  }

  static getInstance(): AgentStateRegistry {
    if (!AgentStateRegistry.instance) {
      AgentStateRegistry.instance = new AgentStateRegistry();
    }
    return AgentStateRegistry.instance;
  }

  /**
   * Update an agent's state
   */
  updateAgentState(state: Partial<AgentState> & { name: string }): void {
    const existing = this.agents.get(state.name);
    this.agents.set(state.name, {
      name: state.name,
      position: state.position ?? existing?.position ?? { x: 0, y: 0, z: 0 },
      dimension: state.dimension ?? existing?.dimension ?? 'overworld',
      currentActivity: state.currentActivity ?? existing?.currentActivity ?? 'idle',
      currentGoal: state.currentGoal ?? existing?.currentGoal ?? null,
      lastAction: state.lastAction ?? existing?.lastAction ?? 'none',
      lastUpdate: Date.now(),
      health: state.health ?? existing?.health ?? 20,
      inventory: state.inventory ?? existing?.inventory ?? {}
    });
  }

  /**
   * Get all other agents' states (for a specific agent's awareness)
   */
  getOtherAgents(excludeName: string): AgentState[] {
    const now = Date.now();
    return Array.from(this.agents.values())
      .filter(a => a.name !== excludeName && (now - a.lastUpdate) < this.STALE_THRESHOLD_MS);
  }

  /**
   * Get agents within a certain distance
   */
  getNearbyAgents(position: { x: number; y: number; z: number }, excludeName: string, radius: number = 50): AgentState[] {
    return this.getOtherAgents(excludeName).filter(agent => {
      const dx = agent.position.x - position.x;
      const dy = agent.position.y - position.y;
      const dz = agent.position.z - position.z;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius;
    });
  }

  /**
   * Check if two agents are close enough for a "meeting"
   */
  areAgentsNearby(name1: string, name2: string, meetingDistance: number = 15): boolean {
    const agent1 = this.agents.get(name1);
    const agent2 = this.agents.get(name2);
    if (!agent1 || !agent2) return false;
    
    const dx = agent1.position.x - agent2.position.x;
    const dy = agent1.position.y - agent2.position.y;
    const dz = agent1.position.z - agent2.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= meetingDistance;
  }

  // ============ Help Requests ============

  /**
   * Submit a help request
   */
  requestHelp(requesterName: string, task: string, location: { x: number; y: number; z: number }): string {
    const id = `help_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.helpRequests.push({
      id,
      requesterName,
      task,
      location,
      timestamp: Date.now(),
      responded: false
    });
    
    // Keep list manageable
    if (this.helpRequests.length > this.MAX_HELP_REQUESTS) {
      this.helpRequests = this.helpRequests.slice(-this.MAX_HELP_REQUESTS);
    }
    
    console.log(`[AgentRegistry] ${requesterName} requested help: ${task}`);
    return id;
  }

  /**
   * Get pending help requests (not from self, not responded to)
   */
  getPendingHelpRequests(excludeName: string): HelpRequest[] {
    const now = Date.now();
    return this.helpRequests.filter(r => 
      r.requesterName !== excludeName && 
      !r.responded &&
      (now - r.timestamp) < 300000 // 5 minutes
    );
  }

  /**
   * Respond to a help request
   */
  respondToHelp(requestId: string, responderName: string): boolean {
    const request = this.helpRequests.find(r => r.id === requestId);
    if (request && !request.responded) {
      request.responded = true;
      request.responderName = responderName;
      console.log(`[AgentRegistry] ${responderName} is helping with: ${request.task}`);
      return true;
    }
    return false;
  }

  // ============ Collaborative Projects ============

  /**
   * Propose a collaborative project
   */
  proposeProject(
    proposerName: string, 
    projectName: string, 
    description: string, 
    location: { x: number; y: number; z: number }
  ): string {
    const id = `project_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.projects.push({
      id,
      proposerName,
      projectName,
      description,
      location,
      participants: [proposerName],
      status: 'proposed',
      createdAt: Date.now()
    });
    console.log(`[AgentRegistry] ${proposerName} proposed project: ${projectName}`);
    return id;
  }

  /**
   * Join a collaborative project
   */
  joinProject(projectId: string, agentName: string): boolean {
    const project = this.projects.find(p => p.id === projectId);
    if (project && !project.participants.includes(agentName)) {
      project.participants.push(agentName);
      if (project.status === 'proposed') {
        project.status = 'active';
      }
      console.log(`[AgentRegistry] ${agentName} joined project: ${project.projectName}`);
      return true;
    }
    return false;
  }

  /**
   * Get active/proposed projects
   */
  getActiveProjects(): CollaborativeProject[] {
    return this.projects.filter(p => p.status === 'proposed' || p.status === 'active');
  }

  // ============ Shared Discoveries ============

  /**
   * Share a discovery with all agents
   */
  shareDiscovery(
    discovererName: string,
    type: SharedDiscovery['type'],
    description: string,
    location: { x: number; y: number; z: number }
  ): string {
    const id = `discovery_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    this.discoveries.push({
      id,
      discovererName,
      type,
      description,
      location,
      timestamp: Date.now(),
      acknowledgedBy: [discovererName]
    });
    
    // Keep list manageable
    if (this.discoveries.length > this.MAX_DISCOVERIES) {
      this.discoveries = this.discoveries.slice(-this.MAX_DISCOVERIES);
    }
    
    console.log(`[AgentRegistry] ${discovererName} shared discovery: ${description}`);
    return id;
  }

  /**
   * Get recent discoveries not yet acknowledged by an agent
   */
  getUnacknowledgedDiscoveries(agentName: string, limit: number = 5): SharedDiscovery[] {
    const now = Date.now();
    return this.discoveries
      .filter(d => 
        !d.acknowledgedBy.includes(agentName) &&
        (now - d.timestamp) < 600000 // 10 minutes
      )
      .slice(-limit);
  }

  /**
   * Acknowledge a discovery
   */
  acknowledgeDiscovery(discoveryId: string, agentName: string): void {
    const discovery = this.discoveries.find(d => d.id === discoveryId);
    if (discovery && !discovery.acknowledgedBy.includes(agentName)) {
      discovery.acknowledgedBy.push(agentName);
    }
  }

  /**
   * Get all recent discoveries (for context)
   */
  getRecentDiscoveries(limit: number = 10): SharedDiscovery[] {
    return this.discoveries.slice(-limit);
  }

  // ============ Summary for Agent Context ============

  /**
   * Get a formatted summary of other agents for inclusion in prompts
   */
  getAgentAwarenessSummary(excludeName: string): string {
    const others = this.getOtherAgents(excludeName);
    if (others.length === 0) return '';

    const agentSummaries = others.map(agent => {
      const distance = this.calculateDistanceFromAgent(excludeName, agent.name);
      const distanceStr = distance !== null ? ` (${Math.round(distance)} blocks away)` : '';
      return `• ${agent.name}${distanceStr}: ${agent.currentActivity} | Goal: ${agent.currentGoal || 'none'}`;
    });

    return `OTHER AGENTS:\n${agentSummaries.join('\n')}`;
  }

  /**
   * Get pending interactions summary (help requests, project invites, discoveries)
   */
  getPendingInteractionsSummary(agentName: string): string {
    const parts: string[] = [];

    // Help requests
    const helpRequests = this.getPendingHelpRequests(agentName);
    if (helpRequests.length > 0) {
      const helpStr = helpRequests.map(r => 
        `• ${r.requesterName} needs help: "${r.task}" [ID: ${r.id}]`
      ).join('\n');
      parts.push(`HELP REQUESTS:\n${helpStr}`);
    }

    // Unacknowledged discoveries
    const discoveries = this.getUnacknowledgedDiscoveries(agentName);
    if (discoveries.length > 0) {
      const discStr = discoveries.map(d => 
        `• ${d.discovererName} found ${d.type}: "${d.description}" at (${Math.round(d.location.x)}, ${Math.round(d.location.y)}, ${Math.round(d.location.z)})`
      ).join('\n');
      parts.push(`NEW DISCOVERIES FROM OTHERS:\n${discStr}`);
    }

    // Active projects not joined
    const projects = this.getActiveProjects().filter(p => !p.participants.includes(agentName));
    if (projects.length > 0) {
      const projStr = projects.map(p => 
        `• "${p.projectName}" by ${p.proposerName}: ${p.description} [ID: ${p.id}]`
      ).join('\n');
      parts.push(`COLLABORATIVE PROJECTS TO JOIN:\n${projStr}`);
    }

    return parts.join('\n\n');
  }

  private calculateDistanceFromAgent(name1: string, name2: string): number | null {
    const agent1 = this.agents.get(name1);
    const agent2 = this.agents.get(name2);
    if (!agent1 || !agent2) return null;
    
    const dx = agent1.position.x - agent2.position.x;
    const dy = agent1.position.y - agent2.position.y;
    const dz = agent1.position.z - agent2.position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}

// Export singleton getter
export const getAgentRegistry = () => AgentStateRegistry.getInstance();
