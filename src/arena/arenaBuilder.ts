/**
 * Arena Builder
 * Constructs the physical PvP arena in Minecraft
 */

const ARENA_CENTER = { x: 500, y: 70, z: 500 };

// Arena dimensions
const ARENA_WIDTH = 31;  // 31x31 fighting area
const ARENA_HEIGHT = 10;
const WALL_HEIGHT = 5;

interface BuildProgress {
  total: number;
  completed: number;
  currentPhase: string;
}

// Command executor type
type CommandExecutor = (cmd: string) => Promise<boolean>;

export async function buildArena(executor?: CommandExecutor): Promise<{ success: boolean; commands: string[]; error?: string }> {
  const commands: string[] = [];
  
  const execute = async (cmd: string) => {
    commands.push(cmd);
    if (executor) {
      try {
        await executor(cmd);
        await new Promise(r => setTimeout(r, 50)); // Small delay between commands
      } catch (e) {
        console.log(`[ARENA BUILD] Command: ${cmd}`);
      }
    }
  };

  const cx = ARENA_CENTER.x;
  const cy = ARENA_CENTER.y;
  const cz = ARENA_CENTER.z;
  const half = Math.floor(ARENA_WIDTH / 2);

  console.log('[ARENA] Starting arena construction at', ARENA_CENTER);

  // Phase 1: Clear the area
  console.log('[ARENA] Phase 1: Clearing area...');
  await execute(`/fill ${cx - half - 5} ${cy - 1} ${cz - half - 5} ${cx + half + 5} ${cy + ARENA_HEIGHT} ${cz + half + 5} air`);

  // Phase 2: Build the floor - checkered pattern with deepslate and blackstone
  console.log('[ARENA] Phase 2: Building floor...');
  // Base layer
  await execute(`/fill ${cx - half} ${cy - 1} ${cz - half} ${cx + half} ${cy - 1} ${cz + half} deepslate_bricks`);
  // Accent pattern
  await execute(`/fill ${cx - half} ${cy} ${cz - half} ${cx + half} ${cy} ${cz + half} polished_blackstone`);
  
  // Create checkered pattern on floor
  for (let x = -half; x <= half; x += 2) {
    for (let z = -half; z <= half; z += 2) {
      await execute(`/setblock ${cx + x} ${cy} ${cz + z} gilded_blackstone`);
    }
  }

  // Phase 3: Build walls
  console.log('[ARENA] Phase 3: Building walls...');
  // North wall
  await execute(`/fill ${cx - half - 1} ${cy} ${cz - half - 1} ${cx + half + 1} ${cy + WALL_HEIGHT} ${cz - half - 1} deepslate_brick_wall`);
  // South wall
  await execute(`/fill ${cx - half - 1} ${cy} ${cz + half + 1} ${cx + half + 1} ${cy + WALL_HEIGHT} ${cz + half + 1} deepslate_brick_wall`);
  // East wall
  await execute(`/fill ${cx + half + 1} ${cy} ${cz - half - 1} ${cx + half + 1} ${cy + WALL_HEIGHT} ${cz + half + 1} deepslate_brick_wall`);
  // West wall
  await execute(`/fill ${cx - half - 1} ${cy} ${cz - half - 1} ${cx - half - 1} ${cy + WALL_HEIGHT} ${cz + half + 1} deepslate_brick_wall`);

  // Phase 4: Corner pillars with lanterns
  console.log('[ARENA] Phase 4: Building corner pillars...');
  const corners = [
    { x: cx - half - 1, z: cz - half - 1 },
    { x: cx + half + 1, z: cz - half - 1 },
    { x: cx - half - 1, z: cz + half + 1 },
    { x: cx + half + 1, z: cz + half + 1 }
  ];
  
  for (const corner of corners) {
    await execute(`/fill ${corner.x} ${cy} ${corner.z} ${corner.x} ${cy + WALL_HEIGHT + 2} ${corner.z} polished_deepslate`);
    await execute(`/setblock ${corner.x} ${cy + WALL_HEIGHT + 3} ${corner.z} soul_lantern`);
  }

  // Phase 5: Spawn platforms
  console.log('[ARENA] Phase 5: Building spawn platforms...');
  // Fighter 1 spawn (west side)
  await execute(`/fill ${cx - 10} ${cy} ${cz - 2} ${cx - 10} ${cy} ${cz + 2} red_concrete`);
  await execute(`/setblock ${cx - 10} ${cy} ${cz} gold_block`);
  
  // Fighter 2 spawn (east side)
  await execute(`/fill ${cx + 10} ${cy} ${cz - 2} ${cx + 10} ${cy} ${cz + 2} blue_concrete`);
  await execute(`/setblock ${cx + 10} ${cy} ${cz} gold_block`);

  // Phase 6: Center ring
  console.log('[ARENA] Phase 6: Building center ring...');
  // Diamond ring in center
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const rx = Math.round(Math.cos(angle) * 3);
    const rz = Math.round(Math.sin(angle) * 3);
    await execute(`/setblock ${cx + rx} ${cy} ${cz + rz} diamond_block`);
  }
  await execute(`/setblock ${cx} ${cy} ${cz} beacon`);

  // Phase 7: Spectator stands
  console.log('[ARENA] Phase 7: Building spectator stands...');
  // North stands
  for (let row = 0; row < 3; row++) {
    await execute(`/fill ${cx - half + 5} ${cy + row + 1} ${cz - half - 3 - row} ${cx + half - 5} ${cy + row + 1} ${cz - half - 3 - row} polished_andesite_stairs[facing=south]`);
  }
  // South stands
  for (let row = 0; row < 3; row++) {
    await execute(`/fill ${cx - half + 5} ${cy + row + 1} ${cz + half + 3 + row} ${cx + half - 5} ${cy + row + 1} ${cz + half + 3 + row} polished_andesite_stairs[facing=north]`);
  }

  // Phase 8: Signs and decorations
  console.log('[ARENA] Phase 8: Adding decorations...');
  // Arena entrance signs
  await execute(`/setblock ${cx} ${cy + 3} ${cz - half - 1} oak_wall_sign[facing=south]{Text1:'{"text":"⚔️ ARENA ⚔️","color":"gold","bold":true}',Text2:'{"text":"OpenClaw","color":"red"}',Text3:'{"text":"PvP Battles","color":"gray"}',Text4:'{"text":"Winner Takes All","color":"yellow"}'}`);
  
  // Barrier above to prevent escaping
  await execute(`/fill ${cx - half} ${cy + WALL_HEIGHT + 1} ${cz - half} ${cx + half} ${cy + WALL_HEIGHT + 1} ${cz + half} barrier`);

  // Phase 9: Lighting
  console.log('[ARENA] Phase 9: Adding lighting...');
  // Light the arena floor with light blocks (invisible)
  for (let x = -half; x <= half; x += 5) {
    for (let z = -half; z <= half; z += 5) {
      await execute(`/setblock ${cx + x} ${cy + 4} ${cz + z} light[level=15]`);
    }
  }
  
  // Soul lanterns on walls
  for (let i = -half + 3; i <= half - 3; i += 6) {
    await execute(`/setblock ${cx + i} ${cy + 3} ${cz - half - 1} soul_lantern`);
    await execute(`/setblock ${cx + i} ${cy + 3} ${cz + half + 1} soul_lantern`);
    await execute(`/setblock ${cx - half - 1} ${cy + 3} ${cz + i} soul_lantern`);
    await execute(`/setblock ${cx + half + 1} ${cy + 3} ${cz + i} soul_lantern`);
  }

  console.log('[ARENA] Construction complete! Total commands:', commands.length);
  
  return { success: true, commands };
}

// Function to build arena with a command executor
export async function buildArenaWithExecutor(executor: CommandExecutor): Promise<{ success: boolean; commandCount: number; error?: string }> {
  try {
    console.log('[ARENA] Building with command executor...');
    const result = await buildArena(executor);
    return { success: true, commandCount: result.commands.length };
  } catch (e: any) {
    console.error('[ARENA] Build error:', e.message);
    return { success: false, commandCount: 0, error: e.message };
  }
}

// Generate commands only (no execution)
export async function generateArenaBuildCommands(): Promise<string[]> {
  const result = await buildArena();
  return result.commands;
}
