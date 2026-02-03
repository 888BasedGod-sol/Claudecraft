/**
 * Build Coordinator - Manages collaborative building between agents
 */

import { generateCastleBlueprint, BlockToPlace, CASTLE_INFO } from './castlePlan';

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

  initialize(): void {
    if (this.initialized) return;
    
    this.blueprint = generateCastleBlueprint();
    this.blueprint.sort((a, b) => a.priority - b.priority);
    this.initialized = true;
    
    console.log(`[COORDINATOR] Initialized with ${this.blueprint.length} blocks to place`);
    console.log(`[COORDINATOR] Castle: ${CASTLE_INFO.description}`);
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
      console.log(`[COORDINATOR] No more blocks to place! Castle complete!`);
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

    let summary = `🏰 CASTLE BUILD PROGRESS: ${progress.percentComplete}% complete (${progress.placedBlocks}/${progress.totalBlocks} blocks)\n`;
    summary += `Castle Location: (${CASTLE_INFO.origin.x}, ${CASTLE_INFO.origin.y}, ${CASTLE_INFO.origin.z})\n`;

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

  getCastleOrigin(): { x: number; y: number; z: number } {
    return CASTLE_INFO.origin;
  }
}

export const buildCoordinator = new BuildCoordinator();
