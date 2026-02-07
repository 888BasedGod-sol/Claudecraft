/**
 * Build Coordinator - Manages collaborative building between agents
 * Supports multiple blueprint modes: castle, colosseum
 */

import { generateCastleBlueprint, BlockToPlace, CASTLE_INFO } from './castlePlan';
import { generateColosseumBlueprint, COLOSSEUM_INFO } from './colosseumPlan';

export type BlueprintMode = 'castle' | 'colosseum';

interface BuildTask {
  agentName: string;
  blocks: BlockToPlace[];
  section: string;
  startedAt: number;
}

interface SectionProgress {
  total: number;
  placed: number;
}

class BuildCoordinator {
  private blueprint: BlockToPlace[] = [];
  private activeTasks: Map<string, BuildTask> = new Map();
  private placedBlocks: Set<string> = new Set();
  private initialized: boolean = false;
  private mode: BlueprintMode = 'colosseum'; // Default to colosseum (PvP arena)

  initialize(mode?: BlueprintMode): void {
    if (mode) this.mode = mode;
    
    // Reset if reinitializing with a different mode
    if (this.initialized && mode) {
      this.blueprint = [];
      this.activeTasks.clear();
      this.placedBlocks.clear();
      this.initialized = false;
    }
    
    if (this.initialized) return;
    
    if (this.mode === 'colosseum') {
      this.blueprint = generateColosseumBlueprint();
      this.blueprint.sort((a, b) => a.priority - b.priority);
      this.initialized = true;
      console.log(`[COORDINATOR] Initialized COLOSSEUM with ${this.blueprint.length} blocks to place`);
      console.log(`[COORDINATOR] Colosseum: ${COLOSSEUM_INFO.description}`);
    } else {
      this.blueprint = generateCastleBlueprint();
      this.blueprint.sort((a, b) => a.priority - b.priority);
      this.initialized = true;
      console.log(`[COORDINATOR] Initialized CASTLE with ${this.blueprint.length} blocks to place`);
      console.log(`[COORDINATOR] Castle: ${CASTLE_INFO.description}`);
    }
  }

  getMode(): BlueprintMode {
    return this.mode;
  }

  getNextTask(agentName: string, batchSize: number = 20): BlockToPlace[] | null {
    if (!this.initialized) this.initialize();

    const existingTask = this.activeTasks.get(agentName);
    if (existingTask && existingTask.blocks.length > 0) {
      existingTask.blocks = existingTask.blocks.filter(b => !this.isBlockPlaced(b.x, b.y, b.z));
      if (existingTask.blocks.length > 0) return existingTask.blocks;
    }

    const availableBlocks = this.blueprint.filter(block => {
      const key = `${block.x},${block.y},${block.z}`;
      if (this.placedBlocks.has(key)) return false;
      if (block.claimed && block.claimed !== agentName) return false;
      return true;
    });

    if (availableBlocks.length === 0) {
      console.log(`[COORDINATOR] No more blocks to place! ${this.mode === 'colosseum' ? 'Colosseum' : 'Castle'} complete!`);
      return null;
    }

    const sectionGroups: Record<string, BlockToPlace[]> = {};
    for (const block of availableBlocks) {
      if (!sectionGroups[block.section]) sectionGroups[block.section] = [];
      sectionGroups[block.section].push(block);
    }

    let targetSection: string | null = null;
    let targetPriority = Infinity;
    for (const [section, blocks] of Object.entries(sectionGroups)) {
      const sectionPriority = blocks[0]?.priority || Infinity;
      if (sectionPriority < targetPriority) {
        targetPriority = sectionPriority;
        targetSection = section;
      }
    }

    if (!targetSection) return null;

    const sectionBlocks = sectionGroups[targetSection];
    const batch = sectionBlocks.slice(0, batchSize);

    for (const block of batch) {
      block.claimed = agentName;
    }

    const task: BuildTask = { agentName, blocks: batch, section: targetSection, startedAt: Date.now() };
    this.activeTasks.set(agentName, task);
    console.log(`[COORDINATOR] Assigned ${batch.length} blocks from '${targetSection}' to ${agentName}`);

    return batch;
  }

  markBlockPlaced(x: number, y: number, z: number): void {
    this.placedBlocks.add(`${x},${y},${z}`);
  }

  isBlockPlaced(x: number, y: number, z: number): boolean {
    return this.placedBlocks.has(`${x},${y},${z}`);
  }

  getProgress(): { totalBlocks: number; placedBlocks: number; percentComplete: number; sectionProgress: Record<string, SectionProgress>; activeTasks: BuildTask[] } {
    if (!this.initialized) this.initialize();

    const sectionProgress: Record<string, SectionProgress> = {};
    for (const block of this.blueprint) {
      if (!sectionProgress[block.section]) sectionProgress[block.section] = { total: 0, placed: 0 };
      sectionProgress[block.section].total++;
      if (this.isBlockPlaced(block.x, block.y, block.z)) sectionProgress[block.section].placed++;
    }

    const placedCount = this.placedBlocks.size;
    const totalCount = this.blueprint.length;

    return {
      totalBlocks: totalCount,
      placedBlocks: placedCount,
      percentComplete: Math.round((placedCount / totalCount) * 100),
      sectionProgress,
      activeTasks: Array.from(this.activeTasks.values())
    };
  }

  getNextBlockToPlace(agentName: string): BlockToPlace | null {
    const task = this.activeTasks.get(agentName);
    if (!task || task.blocks.length === 0) {
      const newBlocks = this.getNextTask(agentName);
      if (!newBlocks || newBlocks.length === 0) return null;
    }

    const currentTask = this.activeTasks.get(agentName);
    if (!currentTask) return null;

    for (const block of currentTask.blocks) {
      if (!this.isBlockPlaced(block.x, block.y, block.z)) return block;
    }

    this.activeTasks.delete(agentName);
    return this.getNextBlockToPlace(agentName);
  }

  getSummaryForAgent(agentName: string): string {
    const progress = this.getProgress();
    const task = this.activeTasks.get(agentName);
    const info = this.mode === 'colosseum' ? COLOSSEUM_INFO : CASTLE_INFO;
    const icon = this.mode === 'colosseum' ? '🏟️' : '🏰';
    const name = this.mode === 'colosseum' ? 'COLOSSEUM' : 'CASTLE';

    let summary = `${icon} ${name} BUILD PROGRESS: ${progress.percentComplete}% complete (${progress.placedBlocks}/${progress.totalBlocks} blocks)\n`;
    summary += `Location: (${info.origin.x}, ${info.origin.y}, ${info.origin.z})\n`;

    if (task) {
      const remainingInTask = task.blocks.filter(b => !this.isBlockPlaced(b.x, b.y, b.z)).length;
      summary += `Your current assignment: ${task.section} (${remainingInTask} blocks remaining)\n`;
    }

    summary += '\nSection Progress:\n';
    for (const [section, data] of Object.entries(progress.sectionProgress)) {
      const pct = Math.round((data.placed / data.total) * 100);
      const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
      summary += `  ${section}: ${bar} ${pct}%\n`;
    }

    return summary;
  }

  getBuildOrigin(): { x: number; y: number; z: number } {
    return this.mode === 'colosseum' ? COLOSSEUM_INFO.origin : CASTLE_INFO.origin;
  }

  getCastleOrigin(): { x: number; y: number; z: number } {
    return this.getBuildOrigin();
  }
}

export const buildCoordinator = new BuildCoordinator();
