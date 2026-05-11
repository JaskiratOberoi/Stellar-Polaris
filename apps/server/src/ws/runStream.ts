import type { WsClientEvent } from '@stellar/shared';
import { WebSocket, WebSocketServer } from 'ws';
import { recordEvent } from '../audit/runLog.js';
import { applySidCountersEvent, registerSidCountersEmit } from '../sids/sidCounters.js';
import { applySidStoreEvent } from '../sids/sidStore.js';

const clients = new Set<WebSocket>();

registerSidCountersEmit((ev) => {
  try {
    recordEvent(ev);
  } catch {
    /* audit must not break clients */
  }
  const payload = JSON.stringify(ev);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch {
        /* ignore */
      }
    }
  }
});

export function attachRunStreamWss(wss: WebSocketServer): void {
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => {
      clients.delete(ws);
    });
  });
}

export function broadcastRunEvent(event: WsClientEvent): void {
  try {
    applySidStoreEvent(event);
  } catch {
    /* sid persistence must not break the bot */
  }
  try {
    applySidCountersEvent(event);
  } catch {
    /* counter persistence must not break the bot */
  }
  try {
    recordEvent(event);
  } catch {
    /* audit must not break the bot or clients */
  }
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
