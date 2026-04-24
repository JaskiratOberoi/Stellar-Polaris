import type { WsClientEvent } from '@stellar/shared';
import { WebSocket, WebSocketServer } from 'ws';

const clients = new Set<WebSocket>();

export function attachRunStreamWss(wss: WebSocketServer): void {
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => {
      clients.delete(ws);
    });
  });
}

export function broadcastRunEvent(event: WsClientEvent): void {
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
}
