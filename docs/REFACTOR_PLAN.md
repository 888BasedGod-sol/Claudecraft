# Code Refactoring Plan

## Overview

Six files account for ~14,600 lines of code. Splitting them would improve maintainability, testing, and code navigation.

## Status: Phase 1 Complete

**Completed:**
- ✅ Created `src/server/routes.ts` - Centralized route registry (50+ routes)
- ✅ Organized routes by category: admin, bot, agent, queue, world, relay, chat, forum, discovery, wallet, spectate, guest, build
- ✅ Added introspection helpers: `getRouteCountsByCategory()`, `getRoutesByCategory()`, `printRouteSummary()`

**Next Steps:**
1. Refactor `commandServer.ts` to use the routes array for routing dispatch
2. Extract handler methods into category modules (`handlers/botHandlers.ts`, etc.)
3. Add integration tests before major handler extraction

---

## Priority 1: commandServer.ts (4,239 lines)

**Current:** Monolithic HTTP server with 50+ route handlers, agent management, queue system, and external integrations.

**Proposed Split:**

```
src/server/
├── commandServer.ts          # Main server + routing (500 lines)
├── routes.ts                 # ✅ DONE - Route registry
├── routes/
│   ├── agentRoutes.ts        # /api/v1/agent/* endpoints
│   ├── botRoutes.ts          # /api/v1/bot/* endpoints  
│   ├── arenaRoutes.ts        # /api/v1/arena/* (already exists)
│   ├── adminRoutes.ts        # /status, /webhook, admin APIs
│   └── intelRoutes.ts        # Intel relay endpoints
├── handlers/
│   ├── externalAgentHandler.ts  # Agent registration, auth, config
│   ├── botSpawnHandler.ts       # Bot spawn logic
│   └── queueHandler.ts          # Agent queue system
└── middleware/
    ├── auth.ts               # API key validation, rate limiting
    └── cors.ts               # CORS headers
```

**Migration Steps:**
1. ✅ Create route registry (`routes.ts`)
2. Extract route handlers into `routes/` files
3. Move business logic into `handlers/`
4. Keep commandServer.ts as thin routing layer

---

## Priority 2: autonomousBotController.ts (3,494 lines)

**Current:** Bot control, AI decisions, building, navigation, combat, all in one class.

**Proposed Split:**

```
src/bot/
├── autonomousBotController.ts   # Main controller, lifecycle (400 lines)
├── actions/
│   ├── buildActions.ts          # Building/shape creation
│   ├── movementActions.ts       # Navigation, pathfinding
│   ├── combatActions.ts         # Fighting, defense
│   ├── gatherActions.ts         # Mining, resource collection
│   └── socialActions.ts         # Chat, agent interactions
├── decisions/
│   └── decisionLoop.ts          # AI decision-making logic
└── creative/
    └── creativeBuilder.ts       # /setblock creative mode building
```

**Migration Steps:**
1. Extract action methods by category
2. Create ActionExecutor interface for consistent action signatures
3. Keep decision loop in controller, delegate action execution

---

## Priority 3: twitterAgent.ts (1,923 lines)

**Current:** Twitter API, content generation, polling, mentions, history.

**Proposed Split:**

```
src/social/
├── twitterAgent.ts              # Main agent, scheduling (300 lines)
├── twitter/
│   ├── twitterApi.ts            # Raw API calls, auth
│   ├── tweetComposer.ts         # Content generation with Claude
│   ├── mentionHandler.ts        # Mention polling, responses
│   ├── timelineManager.ts       # Timeline posting logic
│   └── twitterMind.ts           # Already exists - personality state
```

---

## Priority 4: cinematicCamera.ts (1,898 lines)

**Current:** Camera physics, shot composition, anti-AFK, event detection.

**Proposed Split:**

```
src/bot/camera/
├── cinematicCamera.ts           # Main camera bot (300 lines)
├── physics/
│   └── springPhysics.ts         # Spring-based camera movement
├── shots/
│   ├── shotComposer.ts          # Shot types, composition
│   └── transitionManager.ts     # Bezier transitions
└── systems/
    ├── antiAfk.ts               # Anti-AFK behavior
    └── eventDetector.ts         # Activity detection
```

---

## Priority 5: externalAgentBot.ts (1,747 lines)

**Current:** External agent bot with training system, state machine, AI decisions.

**Proposed Split:**

```
src/bot/external/
├── externalAgentBot.ts          # Main bot (400 lines)
├── training/
│   └── levelSystem.ts           # Apprentice→Master progression
├── behavior/
│   ├── stateMachine.ts          # IDLE/FOLLOWING/BUILDING states
│   └── autonomousBehavior.ts    # AI decision-making
└── blueprints/
    └── simpleBlueprints.ts      # Training build patterns
```

---

## Priority 6: autonomousAgent.ts (1,336 lines)

**Current:** AI personality, goals, prompts, decision generation.

**Proposed Split:**

```
src/agent/
├── autonomousAgent.ts           # Main agent (400 lines)
├── goals/
│   └── goalManager.ts           # Goal creation, tracking, sub-goals
├── prompts/
│   └── promptBuilder.ts         # System prompt construction
└── personality/
    └── personalityTraits.ts     # Personality system
```

---

## Implementation Order

1. **Week 1:** commandServer.ts routes extraction (highest impact)
2. **Week 2:** autonomousBotController.ts action extraction
3. **Week 3:** twitterAgent.ts API separation
4. **As needed:** Camera, external bot, agent splits

## Notes

- Keep all exports from original file locations for backwards compatibility
- Add barrel files (index.ts) in new directories
- Write integration tests before major refactors
- Consider using dependency injection for handlers
