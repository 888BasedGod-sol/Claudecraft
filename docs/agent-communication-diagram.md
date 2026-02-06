# ClaudeCraft Agent Communication Architecture

```mermaid
flowchart TB
    subgraph MC["🎮 Minecraft Server"]
        CE["Claude_Explorer\n🧭 Maps terrain"]
        CB["Claude_Builder\n🏗️ Constructs"]
        CA["ClaudeAdventurer\n⚔️ Expeditions"]
        CS["Claude_Sculptor\n🎨 Sculptures"]
        CAM["CameraBot\n📷 Films"]
        
        CE <-->|"In-game chat"| CB
        CB <-->|"In-game chat"| CA
        CA <-->|"In-game chat"| CS
        CE <-->|"In-game chat"| CS
    end

    subgraph MEM["💾 Shared Memory"]
        SM["SharedMemoryPool\n• Discoveries\n• Resources\n• Locations"]
    end

    subgraph STREAM["📡 Streaming Layer"]
        LS["LogStreamer\n:8080 WebSocket"]
        CMD["CommandServer\n:8081 REST API"]
    end

    subgraph SOCIAL["🌐 Social Agents"]
        TW["Twitter Agent\n@ClaudeCraftSol"]
        MB["Moltbook Agent\n@claudecraft"]
        CL["Clawk Agent\n@claudecraft"]
        COL["Colosseum Agent\nHackathon voting"]
        INTEL["Intel Agent\n🕵️ Cross-platform relay"]
    end

    subgraph EXT["🌍 External"]
        TWITTER["Twitter API"]
        MOLTBOOK["Moltbook.com"]
        CLAWK["Clawk.ai"]
        WEBSITE["claudecraft.tech"]
        OPENCLAW["OpenClaw Agents"]
        PUMP["Pump.fun Stream"]
    end

    %% Memory connections
    CE --> SM
    CB --> SM
    CA --> SM
    CS --> SM
    SM --> CE
    SM --> CB
    SM --> CA
    SM --> CS

    %% Streaming connections
    MC --> LS
    LS --> WEBSITE
    LS --> PUMP
    CMD --> MC
    
    %% Social agent data sources
    LS --> TW
    LS --> MB
    LS --> CL
    
    %% Intel Agent connections
    TW --> INTEL
    INTEL --> TW
    INTEL --> MB
    INTEL --> CL
    
    %% External API connections
    TW --> TWITTER
    MB --> MOLTBOOK
    CL --> CLAWK
    COL --> MOLTBOOK
    
    %% OpenClaw integration
    CMD --> OPENCLAW
    OPENCLAW --> CMD
    
    %% Camera following
    CAM -.->|"Follows"| CE
    CAM -.->|"Follows"| CB
    CAM -.->|"Follows"| CA
    CAM -.->|"Follows"| CS
```

## Communication Flow Summary

| Layer | Components | Protocol |
|-------|------------|----------|
| **Minecraft** | 4 agents + CameraBot | In-game chat |
| **Memory** | SharedMemoryPool | Shared discoveries, resources, locations |
| **Streaming** | LogStreamer (:8080) | WebSocket → Website, Pump.fun |
| **Commands** | CommandServer (:8081) | REST API ← Viewers, OpenClaw |
| **Social** | Twitter, Moltbook, Clawk | API calls |
| **Intel** | Intel Agent | Cross-platform relay |

## Key Data Flows

1. **Agents → SharedMemory → Other Agents** (discoveries, resources)
2. **Agents → LogStreamer → Website/Pump.fun** (live stream)
3. **Viewers → CommandServer → Agents** (build requests)
4. **Twitter → Intel Agent → Moltbook/Clawk** (intel relay)
5. **OpenClaw → CommandServer → Minecraft** (external agent join)
