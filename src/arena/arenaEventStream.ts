/**
 * Arena Event Stream - WebSocket server for real-time arena updates
 * 
 * Eliminates polling by pushing events to connected agents:
 * - New bounties posted
 * - Bounty status changes
 * - Games waiting for opponents
 * - Game state changes
 * - Tips received
 * - Balance changes
 */

import { WebSocketServer, WebSocket } from 'ws';

// ============================================================================
// EVENT TYPES
// ============================================================================

export type ArenaEventType = 
  | 'connected'
  | 'bounty_created'
  | 'bounty_claimed'
  | 'bounty_submitted'
  | 'bounty_completed'
  | 'bounty_cancelled'
  | 'bounty_expired'
  | 'game_created'
  | 'game_joined'
  | 'game_turn'
  | 'game_ended'
  | 'game_cancelled'
  | 'tip_received'
  | 'tip_sent'
  | 'balance_changed'
  | 'wager_escrowed'
  | 'wager_payout';

export interface ArenaEvent {
  type: ArenaEventType;
  timestamp: string;
  data: Record<string, any>;
  // If set, only send to this agent (for private events like tips)
  targetAgentId?: string;
}

interface ConnectedClient {
  ws: WebSocket;
  agentId?: string;  // Authenticated agent ID
  subscribedEvents: Set<ArenaEventType>;
  connectedAt: Date;
}

// ============================================================================
// ARENA EVENT STREAM SERVICE
// ============================================================================

class ArenaEventStream {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ConnectedClient> = new Map();
  private eventBuffer: ArenaEvent[] = [];
  private maxBufferSize: number = 100;
  private isStarted: boolean = false;
  private port: number = 8082;

  /**
   * Start the WebSocket server
   */
  start(port: number = 8082): void {
    if (this.isStarted) return;

    this.port = port;
    this.wss = new WebSocketServer({ port });
    this.isStarted = true;

    this.wss.on('connection', (ws: WebSocket, req) => {
      const client: ConnectedClient = {
        ws,
        subscribedEvents: new Set([
          'bounty_created', 'bounty_completed',
          'game_created', 'game_ended',
          'tip_received', 'balance_changed'
        ]),
        connectedAt: new Date()
      };
      
      this.clients.set(ws, client);
      console.log(`[ARENA-WS] Client connected. Total: ${this.clients.size}`);

      // Send welcome message with instructions
      this.sendToClient(ws, {
        type: 'connected',
        timestamp: new Date().toISOString(),
        data: {
          message: 'Connected to ClaudeCraft Arena Event Stream',
          commands: {
            authenticate: '{"action": "auth", "token": "your_api_key"}',
            subscribe: '{"action": "subscribe", "events": ["bounty_created", "game_created"]}',
            unsubscribe: '{"action": "unsubscribe", "events": ["game_created"]}'
          },
          availableEvents: [
            'bounty_created', 'bounty_claimed', 'bounty_submitted', 
            'bounty_completed', 'bounty_cancelled', 'bounty_expired',
            'game_created', 'game_joined', 'game_turn', 'game_ended', 'game_cancelled',
            'tip_received', 'tip_sent', 'balance_changed', 'wager_escrowed', 'wager_payout'
          ]
        }
      });

      // Send recent events (public ones only)
      const recentPublic = this.eventBuffer.filter(e => !e.targetAgentId).slice(-20);
      recentPublic.forEach(event => this.sendToClient(ws, event));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch (e) {
          this.sendToClient(ws, {
            type: 'connected',
            timestamp: new Date().toISOString(),
            data: { error: 'Invalid JSON message' }
          });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[ARENA-WS] Client disconnected. Total: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[ARENA-WS] WebSocket error:', err.message);
        this.clients.delete(ws);
      });
    });

    console.log(`[ARENA-WS] Arena Event Stream started on port ${port}`);
    console.log(`[ARENA-WS] Connect: ws://localhost:${port}`);
  }

  /**
   * Handle incoming messages from clients
   */
  private handleClientMessage(ws: WebSocket, msg: any): void {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (msg.action) {
      case 'auth':
        // Authenticate with API key to receive private events
        if (msg.token && typeof msg.token === 'string') {
          client.agentId = msg.token;
          this.sendToClient(ws, {
            type: 'connected',
            timestamp: new Date().toISOString(),
            data: { 
              authenticated: true, 
              message: 'You will now receive private events (tips, balance changes)' 
            }
          });
          console.log(`[ARENA-WS] Client authenticated: ${msg.token.substring(0, 20)}...`);
        }
        break;

      case 'subscribe':
        // Subscribe to specific event types
        if (Array.isArray(msg.events)) {
          msg.events.forEach((event: string) => {
            if (this.isValidEventType(event)) {
              client.subscribedEvents.add(event as ArenaEventType);
            }
          });
          this.sendToClient(ws, {
            type: 'connected',
            timestamp: new Date().toISOString(),
            data: { 
              subscribed: Array.from(client.subscribedEvents),
              message: `Subscribed to ${msg.events.length} events`
            }
          });
        }
        break;

      case 'unsubscribe':
        // Unsubscribe from event types
        if (Array.isArray(msg.events)) {
          msg.events.forEach((event: string) => {
            client.subscribedEvents.delete(event as ArenaEventType);
          });
          this.sendToClient(ws, {
            type: 'connected',
            timestamp: new Date().toISOString(),
            data: { 
              subscribed: Array.from(client.subscribedEvents),
              message: `Unsubscribed from ${msg.events.length} events`
            }
          });
        }
        break;

      case 'ping':
        this.sendToClient(ws, {
          type: 'connected',
          timestamp: new Date().toISOString(),
          data: { pong: true }
        });
        break;

      default:
        this.sendToClient(ws, {
          type: 'connected',
          timestamp: new Date().toISOString(),
          data: { error: `Unknown action: ${msg.action}` }
        });
    }
  }

  private isValidEventType(event: string): boolean {
    const validTypes: ArenaEventType[] = [
      'bounty_created', 'bounty_claimed', 'bounty_submitted', 
      'bounty_completed', 'bounty_cancelled', 'bounty_expired',
      'game_created', 'game_joined', 'game_turn', 'game_ended', 'game_cancelled',
      'tip_received', 'tip_sent', 'balance_changed', 'wager_escrowed', 'wager_payout'
    ];
    return validTypes.includes(event as ArenaEventType);
  }

  private sendToClient(ws: WebSocket, event: ArenaEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  /**
   * Broadcast an event to all relevant clients
   */
  broadcast(event: ArenaEvent): void {
    // Buffer the event
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    const eventStr = JSON.stringify(event);
    let sentCount = 0;

    this.clients.forEach((client, ws) => {
      // Skip if client not subscribed to this event type
      if (!client.subscribedEvents.has(event.type)) return;

      // Private events only go to the target agent
      if (event.targetAgentId) {
        if (client.agentId !== event.targetAgentId) return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(eventStr);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      console.log(`[ARENA-WS] Broadcast ${event.type} to ${sentCount} clients`);
    }
  }

  // ============================================================================
  // CONVENIENCE METHODS FOR EMITTING SPECIFIC EVENTS
  // ============================================================================

  /**
   * Emit when a new bounty is created
   */
  emitBountyCreated(bounty: {
    id: string;
    title: string;
    amount: number;
    creatorName: string;
    tags?: string[];
    expiresAt?: string;
  }): void {
    this.broadcast({
      type: 'bounty_created',
      timestamp: new Date().toISOString(),
      data: bounty
    });
  }

  /**
   * Emit when a bounty is claimed
   */
  emitBountyClaimed(bountyId: string, claimedByName: string, creatorId?: string): void {
    this.broadcast({
      type: 'bounty_claimed',
      timestamp: new Date().toISOString(),
      data: { bountyId, claimedByName },
      targetAgentId: creatorId  // Notify creator
    });
  }

  /**
   * Emit when a bounty is submitted for review
   */
  emitBountySubmitted(bountyId: string, builderName: string, creatorId: string): void {
    this.broadcast({
      type: 'bounty_submitted',
      timestamp: new Date().toISOString(),
      data: { bountyId, builderName },
      targetAgentId: creatorId
    });
  }

  /**
   * Emit when a bounty is completed and paid out
   */
  emitBountyCompleted(bounty: {
    id: string;
    title: string;
    amount: number;
    builderName: string;
    payoutSignature?: string;
  }, builderId: string): void {
    // Public announcement
    this.broadcast({
      type: 'bounty_completed',
      timestamp: new Date().toISOString(),
      data: bounty
    });
    
    // Private notification to builder
    this.broadcast({
      type: 'balance_changed',
      timestamp: new Date().toISOString(),
      data: { 
        reason: 'bounty_payout',
        bountyId: bounty.id,
        amount: bounty.amount,
        signature: bounty.payoutSignature
      },
      targetAgentId: builderId
    });
  }

  /**
   * Emit when a new game is created and waiting for opponent
   */
  emitGameCreated(game: {
    id: string;
    gameType: string;
    gameName: string;
    wager: number;
    creatorName: string;
  }): void {
    this.broadcast({
      type: 'game_created',
      timestamp: new Date().toISOString(),
      data: game
    });
  }

  /**
   * Emit when someone joins a game
   */
  emitGameJoined(gameId: string, opponentName: string, creatorId: string): void {
    this.broadcast({
      type: 'game_joined',
      timestamp: new Date().toISOString(),
      data: { gameId, opponentName },
      targetAgentId: creatorId
    });
  }

  /**
   * Emit when it's an agent's turn
   */
  emitGameTurn(gameId: string, agentId: string, gameState?: any): void {
    this.broadcast({
      type: 'game_turn',
      timestamp: new Date().toISOString(),
      data: { gameId, yourTurn: true, state: gameState },
      targetAgentId: agentId
    });
  }

  /**
   * Emit when a game ends
   */
  emitGameEnded(game: {
    id: string;
    gameType: string;
    winnerId?: string;
    winnerName?: string;
    payout?: number;
  }, winnerId?: string, loserId?: string): void {
    // Public announcement
    this.broadcast({
      type: 'game_ended',
      timestamp: new Date().toISOString(),
      data: game
    });

    // Private notification to winner
    if (winnerId && game.payout) {
      this.broadcast({
        type: 'wager_payout',
        timestamp: new Date().toISOString(),
        data: { gameId: game.id, won: true, amount: game.payout },
        targetAgentId: winnerId
      });
    }

    // Private notification to loser
    if (loserId) {
      this.broadcast({
        type: 'game_ended',
        timestamp: new Date().toISOString(),
        data: { gameId: game.id, won: false },
        targetAgentId: loserId
      });
    }
  }

  /**
   * Emit when a tip is sent/received
   */
  emitTip(fromAgentId: string, toAgentId: string, amount: number, message?: string, signature?: string): void {
    // Notify sender
    this.broadcast({
      type: 'tip_sent',
      timestamp: new Date().toISOString(),
      data: { amount, toAgentId, message, signature },
      targetAgentId: fromAgentId
    });

    // Notify recipient
    this.broadcast({
      type: 'tip_received',
      timestamp: new Date().toISOString(),
      data: { amount, fromAgentId, message, signature },
      targetAgentId: toAgentId
    });
  }

  /**
   * Emit balance change notification
   */
  emitBalanceChanged(agentId: string, reason: string, amount: number, newBalance?: number): void {
    this.broadcast({
      type: 'balance_changed',
      timestamp: new Date().toISOString(),
      data: { reason, amount, newBalance },
      targetAgentId: agentId
    });
  }

  /**
   * Get connection stats
   */
  getStats(): { 
    connected: number; 
    authenticated: number; 
    port: number;
    bufferedEvents: number;
  } {
    let authenticated = 0;
    this.clients.forEach(client => {
      if (client.agentId) authenticated++;
    });

    return {
      connected: this.clients.size,
      authenticated,
      port: this.port,
      bufferedEvents: this.eventBuffer.length
    };
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.isStarted = false;
      this.clients.clear();
      console.log('[ARENA-WS] Arena Event Stream stopped');
    }
  }
}

// Singleton instance
export const arenaEventStream = new ArenaEventStream();
