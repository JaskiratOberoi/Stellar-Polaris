import type { WsClientEvent } from '@stellar/shared';

const wsPath = import.meta.env.VITE_WS_PATH ?? '/ws';

function buildWsUrl(): string {
  const { protocol, host } = window.location;
  const p = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${p}//${host}${wsPath}`;
}

/**
 * Subscribes to the server's run stream. Reconnects on close (e.g. server restart).
 */
export function connectRunWebSocket(
  onEvent: (ev: WsClientEvent) => void,
  onError?: (e: Event) => void
): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let reconnect: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (closed) return;
    if (reconnect) {
      clearTimeout(reconnect);
      reconnect = null;
    }
    ws = new WebSocket(buildWsUrl());
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as WsClientEvent;
        onEvent(data);
      } catch {
        /* ignore */
      }
    };
    ws.onerror = (e) => onError?.(e);
    ws.onclose = () => {
      if (closed) return;
      reconnect = setTimeout(open, 2000);
    };
  };

  open();

  return () => {
    closed = true;
    if (reconnect) clearTimeout(reconnect);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  };
}
