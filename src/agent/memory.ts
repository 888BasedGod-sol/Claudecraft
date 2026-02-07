/**
 * Agent Memory System - Persistent memory for autonomous agents
 * 
 * Allows agents to:
 * - Store and retrieve memories of discoveries, locations, builds, etc.
 * - Perform semantic search on memories for relevant context
 * - Track importance and decay of memories over time
 * - Build a knowledge base from experiences
 */

import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config';
import { generateId } from '../utils/helpers';

// Re-export types for backward compatibility
export type { MemoryType, Memory } from '../types';
import type { MemoryType, Memory, Position3D } from '../types';

export interface MemoryStore {
  agentName: string;
  memories: Memory[];
  createdAt: number;
  lastUpdated: number;
  version: number;
}

export class AgentMemory {
  private agentName: string;
  private memories: Memory[] = [];
  private memoryFilePath: string;
  private maxMemories: number;
  private loaded: boolean = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1000;

  constructor(agentName: string, maxMemories?: number) {
    this.agentName = agentName;
    this.maxMemories = maxMemories ?? CONFIG.memory.maxMemories;
    
    // Memory files stored in training/knowledge directory
    const memoryDir = path.join(__dirname, '../training/knowledge/memories');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.memoryFilePath = path.join(memoryDir, `${agentName.toLowerCase()}_memories.json`);
    
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.memoryFilePath)) {
        const data = fs.readFileSync(this.memoryFilePath, 'utf-8');
        const store: MemoryStore = JSON.parse(data);
        this.memories = store.memories || [];
        this.loaded = true;
        console.log(`[Memory] Loaded ${this.memories.length} memories for ${this.agentName}`);
      } else {
        this.memories = [];
        this.loaded = true;
        console.log(`[Memory] No existing memories for ${this.agentName}, starting fresh`);
      }
    } catch (error) {
      console.error(`[Memory] Error loading memories for ${this.agentName}:`, error);
      this.memories = [];
      this.loaded = true;
    }
  }

  private save(): void {
    try {
      const store: MemoryStore = {
        agentName: this.agentName,
        memories: this.memories,
        createdAt: this.memories[0]?.timestamp || Date.now(),
        lastUpdated: Date.now(),
        version: 1
      };
      fs.writeFileSync(this.memoryFilePath, JSON.stringify(store, null, 2));
    } catch (error) {
      console.error(`[Memory] Error saving memories for ${this.agentName}:`, error);
    }
  }

  /**
   * Store a new memory
   */
  async store(memory: Omit<Memory, 'id' | 'accessCount' | 'lastAccessed'>): Promise<string> {
    const id = generateId('mem');
    
    const fullMemory: Memory = {
      ...memory,
      id,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.memories.push(fullMemory);
    
    // Consolidate if we have too many memories
    if (this.memories.length > this.maxMemories) {
      await this.consolidate();
    }
    
    this.save();
    console.log(`[Memory] ${this.agentName} stored: [${memory.type}] ${memory.content.substring(0, 50)}...`);
    
    return id;
  }

  /**
   * Retrieve memories relevant to a query/context
   */
  async getRelevantMemories(context: string, limit: number = 5): Promise<Memory[]> {
    const contextWords = context.toLowerCase().split(/\s+/);
    
    // Score each memory based on relevance
    const scored = this.memories.map(memory => {
      let score = 0;
      
      // Base importance score
      score += memory.importance * 2;
      
      // Recency score (memories from last hour score higher)
      const hoursSinceCreated = (Date.now() - memory.timestamp) / (1000 * 60 * 60);
      if (hoursSinceCreated < 1) score += 5;
      else if (hoursSinceCreated < 24) score += 3;
      else if (hoursSinceCreated < 168) score += 1; // within a week
      
      // Access frequency score
      score += Math.min(memory.accessCount * 0.5, 3);
      
      // Content match score
      const contentWords = memory.content.toLowerCase().split(/\s+/);
      const tagMatches = memory.tags.filter(tag => 
        contextWords.some(w => tag.includes(w) || w.includes(tag))
      ).length;
      const contentMatches = contentWords.filter(w => 
        contextWords.some(cw => w.includes(cw) || cw.includes(w))
      ).length;
      
      score += tagMatches * 3;
      score += Math.min(contentMatches * 0.5, 5);
      
      // Type relevance (certain types more useful in certain contexts)
      if (context.includes('build') && memory.type === 'build') score += 3;
      if (context.includes('danger') && memory.type === 'danger') score += 5;
      if (context.includes('resource') && memory.type === 'resource') score += 3;
      
      return { memory, score };
    });

    // Sort by score and return top matches
    const results = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .filter(s => s.score > 2) // Minimum relevance threshold
      .map(s => {
        // Update access tracking
        s.memory.accessCount++;
        s.memory.lastAccessed = Date.now();
        return s.memory;
      });

    if (results.length > 0) {
      this.save(); // Save updated access counts
    }

    return results;
  }

  /**
   * Get memories by type
   */
  getByType(type: MemoryType, limit: number = 10): Memory[] {
    return this.memories
      .filter(m => m.type === type)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * Get a memory by ID
   */
  getById(id: string): Memory | undefined {
    return this.memories.find(m => m.id === id);
  }

  /**
   * Get memories near a location
   */
  getNearLocation(location: { x: number; y: number; z: number }, radius: number = 50): Memory[] {
    return this.memories.filter(m => {
      if (!m.location) return false;
      const distance = Math.sqrt(
        Math.pow(m.location.x - location.x, 2) +
        Math.pow(m.location.y - location.y, 2) +
        Math.pow(m.location.z - location.z, 2)
      );
      return distance <= radius;
    }).sort((a, b) => b.importance - a.importance);
  }

  /**
   * Update a memory's importance or content
   */
  update(id: string, updates: Partial<Pick<Memory, 'importance' | 'content' | 'tags'>>): boolean {
    const memory = this.memories.find(m => m.id === id);
    if (!memory) return false;

    if (updates.importance !== undefined) memory.importance = updates.importance;
    if (updates.content !== undefined) memory.content = updates.content;
    if (updates.tags !== undefined) memory.tags = updates.tags;
    
    this.save();
    return true;
  }

  /**
   * Remove a specific memory
   */
  forget(id: string): boolean {
    const index = this.memories.findIndex(m => m.id === id);
    if (index === -1) return false;
    
    this.memories.splice(index, 1);
    this.save();
    return true;
  }

  /**
   * Consolidate memories to stay under limit
   * Removes low-importance, old, rarely-accessed memories
   */
  private async consolidate(): Promise<void> {
    console.log(`[Memory] Consolidating memories for ${this.agentName} (${this.memories.length} -> ${this.maxMemories})`);
    
    // Calculate a "keep score" for each memory
    const scored = this.memories.map(memory => {
      let keepScore = memory.importance * 3;
      
      // Recent memories are more valuable
      const daysSinceCreated = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated < 1) keepScore += 5;
      else if (daysSinceCreated < 7) keepScore += 3;
      else if (daysSinceCreated > 30) keepScore -= 2;
      
      // Frequently accessed memories are valuable
      keepScore += Math.min(memory.accessCount, 10);
      
      // Certain types are more valuable
      if (memory.type === 'lesson') keepScore += 3;
      if (memory.type === 'danger') keepScore += 2;
      if (memory.type === 'goal_completed') keepScore += 2;
      if (memory.type === 'build') keepScore += 2;
      
      return { memory, keepScore };
    });

    // Sort by keep score and keep the best ones
    scored.sort((a, b) => b.keepScore - a.keepScore);
    this.memories = scored.slice(0, this.maxMemories).map(s => s.memory);
    
    this.save();
  }

  /**
   * Get memory statistics
   */
  getStats(): { total: number; byType: Record<MemoryType, number>; avgImportance: number } {
    const byType: Record<string, number> = {};
    let totalImportance = 0;

    for (const memory of this.memories) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
      totalImportance += memory.importance;
    }

    return {
      total: this.memories.length,
      byType: byType as Record<MemoryType, number>,
      avgImportance: this.memories.length > 0 ? totalImportance / this.memories.length : 0
    };
  }

  /**
   * Export all memories (for debugging/backup)
   */
  exportAll(): Memory[] {
    return [...this.memories];
  }

  /**
   * Clear all memories (use carefully!)
   */
  clearAll(): void {
    console.log(`[Memory] Clearing all memories for ${this.agentName}`);
    this.memories = [];
    this.save();
  }
}

/**
 * Shared memory pool for agents to share discoveries
 */
export class SharedMemoryPool {
  private static instance: SharedMemoryPool;
  private sharedMemories: Memory[] = [];
  private memoryFilePath: string;

  private constructor() {
    const memoryDir = path.join(__dirname, '../training/knowledge/memories');
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    this.memoryFilePath = path.join(memoryDir, 'shared_memories.json');
    this.load();
  }

  static getInstance(): SharedMemoryPool {
    if (!SharedMemoryPool.instance) {
      SharedMemoryPool.instance = new SharedMemoryPool();
    }
    return SharedMemoryPool.instance;
  }

  private load(): void {
    try {
      if (fs.existsSync(this.memoryFilePath)) {
        const data = fs.readFileSync(this.memoryFilePath, 'utf-8');
        this.sharedMemories = JSON.parse(data);
        console.log(`[SharedMemory] Loaded ${this.sharedMemories.length} shared memories`);
      }
    } catch (error) {
      console.error('[SharedMemory] Error loading:', error);
      this.sharedMemories = [];
    }
  }

  private save(): void {
    try {
      fs.writeFileSync(this.memoryFilePath, JSON.stringify(this.sharedMemories, null, 2));
    } catch (error) {
      console.error('[SharedMemory] Error saving:', error);
    }
  }

  /**
   * Share a memory with all agents
   */
  share(memory: Memory, sharerName: string): void {
    const sharedMemory: Memory = {
      ...memory,
      id: `shared_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      content: `[Shared by ${sharerName}] ${memory.content}`,
      timestamp: Date.now()
    };
    
    this.sharedMemories.push(sharedMemory);
    
    // Keep shared pool manageable
    if (this.sharedMemories.length > 100) {
      this.sharedMemories = this.sharedMemories
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 100);
    }
    
    this.save();
    console.log(`[SharedMemory] ${sharerName} shared: ${memory.content.substring(0, 50)}...`);
  }

  /**
   * Get relevant shared memories
   */
  getRelevant(context: string, limit: number = 3): Memory[] {
    const contextWords = context.toLowerCase().split(/\s+/);
    
    return this.sharedMemories
      .map(m => ({
        memory: m,
        score: m.tags.filter(t => contextWords.includes(t)).length + m.importance
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }
}
