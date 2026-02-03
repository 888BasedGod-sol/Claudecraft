/**
 * Log Streamer - WebSocket server for broadcasting logs
 */

import { WebSocketServer, WebSocket } from 'ws';

export interface LogMessage {
  type: 'info' | 'error' | 'warn' | 'debug' | 'claude' | 'action' | 'build' | 'survival';
  timestamp: string;
  message: string;
  botName?: string;
}

export interface PositionUpdate {
  type: 'position';
  botName: string;
  x: number;
  y: number;
  z: number;
  dimension: string;
  timestamp: string;
}

class LogStreamer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private messageBuffer: LogMessage[] = [];
  private maxBufferSize: number = 100;
  private isStarted: boolean = false;
  private agentPositions: Map<string, PositionUpdate> = new Map();

  start(port: number = 8080): void {
    if (this.isStarted) return;

    this.wss = new WebSocketServer({ port });
    this.isStarted = true;

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      console.log(`[LOG-STREAM] Client connected. Total clients: ${this.clients.size}`);

      // Send buffered messages
      this.messageBuffer.forEach((msg) => {
        ws.send(JSON.stringify(msg));
      });

      // Send current agent positions
      this.agentPositions.forEach((pos) => {
        ws.send(JSON.stringify(pos));
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log(`[LOG-STREAM] Client disconnected. Total clients: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('[LOG-STREAM] WebSocket error:', err);
        this.clients.delete(ws);
      });
    });

    console.log(`[LOG-STREAM] WebSocket server started on port ${port}`);
  }

  broadcast(logMessage: LogMessage): void {
    this.messageBuffer.push(logMessage);
    if (this.messageBuffer.length > this.maxBufferSize) {
      this.messageBuffer.shift();
    }

    const messageStr = JSON.stringify(logMessage);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  broadcastPosition(botName: string, x: number, y: number, z: number, dimension: string = 'overworld'): void {
    const positionUpdate: PositionUpdate = {
      type: 'position',
      botName,
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z),
      dimension,
      timestamp: new Date().toISOString()
    };

    // Store latest position for new clients
    this.agentPositions.set(botName, positionUpdate);

    const messageStr = JSON.stringify(positionUpdate);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.isStarted = false;
      console.log('[LOG-STREAM] WebSocket server stopped');
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const logStreamer = new LogStreamer();
