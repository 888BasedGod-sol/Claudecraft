/**
 * Build Analyzer - Uses Claude AI to intelligently interpret build requests
 * 
 * Instead of just parsing keywords, this uses Claude to:
 * 1. Understand the intent behind the request
 * 2. Enhance vague requests with creative details
 * 3. Choose the best structure/approach
 * 4. Filter inappropriate requests
 */

import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

export interface BuildDecision {
  shouldBuild: boolean;
  rejectionReason?: string;
  
  // What to actually build
  buildType: 'detailed_structure' | 'shape' | 'creative_interpretation' | 'sign';
  structureName?: string;  // For detailed structures (cottage, pagoda, etc.)
  shape?: string;          // For shapes (pyramid, tower, cube, etc.)
  material?: string;       // Block material
  size?: number;           // Scale
  
  // Enhanced description for announcement
  enhancedDescription: string;
  
  // Creative additions Claude decided to add
  creativeNotes?: string;
  
  // Reasoning for transparency
  reasoning: string;
}

const anthropic = new Anthropic();

// Available detailed structures
const DETAILED_STRUCTURES = [
  'cottage', 'cozy cottage',
  'pagoda', 'japanese pagoda', 
  'wizard tower',
  'lighthouse',
  'treehouse',
  'modern house',
  'windmill',
  'chapel', 'church',
  'fountain',
  'bridge',
  'garden pavilion'
];

// Available shapes for simple builds
const AVAILABLE_SHAPES = [
  'pyramid', 'tower', 'pillar', 'cube', 'box', 'wall', 
  'floor', 'platform', 'dome', 'arch', 'gate', 'stairs'
];

// Available materials
const AVAILABLE_MATERIALS = [
  'stone', 'cobblestone', 'oak_planks', 'spruce_planks', 'birch_planks',
  'dark_oak_planks', 'bricks', 'stone_bricks', 'quartz_block', 'glass',
  'iron_block', 'gold_block', 'diamond_block', 'emerald_block',
  'obsidian', 'sandstone', 'prismarine', 'deepslate_bricks',
  'white_concrete', 'black_concrete', 'red_concrete', 'blue_concrete',
  'green_concrete', 'yellow_concrete', 'purple_concrete', 'pink_concrete',
  'orange_concrete', 'cyan_concrete', 'lime_concrete', 'magenta_concrete'
];

/**
 * Analyze a build request using Claude AI
 */
export async function analyzeBuildRequest(
  sender: string, 
  rawRequest: string
): Promise<BuildDecision> {
  console.log(`[BUILD-ANALYZER] 🧠 Analyzing request from @${sender}: "${rawRequest}"`);
  
  const prompt = `You are the creative director for ClaudeCraft, an AI that builds in Minecraft.

A viewer named @${sender} has requested: "${rawRequest}"

AVAILABLE BUILD OPTIONS:
1. DETAILED STRUCTURES (pre-designed, high quality):
   ${DETAILED_STRUCTURES.join(', ')}

2. SHAPES (customizable with materials):
   ${AVAILABLE_SHAPES.join(', ')}

3. MATERIALS for shapes:
   ${AVAILABLE_MATERIALS.join(', ')}

YOUR TASK:
Analyze this request and decide what to build. You have creative freedom to:
- Interpret vague requests creatively
- Enhance simple requests with interesting details  
- Choose the most impressive option that matches their intent
- Reject inappropriate/impossible requests

RESPOND WITH JSON:
{
  "shouldBuild": true/false,
  "rejectionReason": "reason if rejecting (inappropriate, impossible, etc.)",
  
  "buildType": "detailed_structure" | "shape" | "sign",
  "structureName": "cottage" (if detailed_structure, must be from the list),
  "shape": "pyramid" (if shape type),
  "material": "quartz_block" (if shape type),
  "size": 8 (1-20, for shapes),
  
  "enhancedDescription": "A beautiful quartz pyramid with golden accents",
  "creativeNotes": "Added gold trim to make it more impressive",
  "reasoning": "User wanted a pyramid, quartz matches 'white' mention, sized up for impact"
}

GUIDELINES:
- If they mention a specific detailed structure, use that
- If vague like "something cool", pick the most impressive option
- If they want text/sign, use buildType "sign"
- Material colors: use concrete for specific colors
- Size 1-5 is small, 6-10 is medium, 11-20 is large
- Be creative but stay true to their intent
- Reject NSFW, political, or impossible requests

RESPOND WITH ONLY THE JSON OBJECT.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON response
    let jsonStr = content.text.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const decision: BuildDecision = JSON.parse(jsonStr);
    
    console.log(`[BUILD-ANALYZER] ✅ Decision: ${decision.buildType} - "${decision.enhancedDescription}"`);
    console.log(`[BUILD-ANALYZER] 💭 Reasoning: ${decision.reasoning}`);
    
    return decision;

  } catch (error) {
    console.error('[BUILD-ANALYZER] Error analyzing request:', error);
    
    // Fallback: try to parse manually
    return fallbackAnalysis(rawRequest);
  }
}

/**
 * Fallback analysis if Claude API fails
 */
function fallbackAnalysis(request: string): BuildDecision {
  const lower = request.toLowerCase();
  
  // Check for detailed structures
  for (const structure of DETAILED_STRUCTURES) {
    if (lower.includes(structure)) {
      return {
        shouldBuild: true,
        buildType: 'detailed_structure',
        structureName: structure,
        enhancedDescription: `A beautiful ${structure}`,
        reasoning: 'Matched detailed structure keyword'
      };
    }
  }
  
  // Check for shapes
  for (const shape of AVAILABLE_SHAPES) {
    if (lower.includes(shape)) {
      return {
        shouldBuild: true,
        buildType: 'shape',
        shape: shape,
        material: 'stone_bricks',
        size: 6,
        enhancedDescription: `A ${shape} made of stone bricks`,
        reasoning: 'Matched shape keyword'
      };
    }
  }
  
  // Default: creative interpretation as a structure
  return {
    shouldBuild: true,
    buildType: 'shape',
    shape: 'cube',
    material: 'quartz_block',
    size: 5,
    enhancedDescription: request,
    reasoning: 'Default interpretation'
  };
}

/**
 * Quick check if a request is likely a build request (for filtering mentions)
 */
export function isLikelyBuildRequest(text: string): boolean {
  const buildIndicators = [
    '-build', '/build', '!build',
    'build', 'make', 'create', 'construct',
    ...DETAILED_STRUCTURES,
    ...AVAILABLE_SHAPES
  ];
  
  const lower = text.toLowerCase();
  return buildIndicators.some(indicator => lower.includes(indicator));
}
