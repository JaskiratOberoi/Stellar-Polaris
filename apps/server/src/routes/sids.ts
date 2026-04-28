import type { Express, Request, Response } from 'express';
import type { WsClientEvent } from '@stellar/shared';
import { archiveActiveSids, getActiveSidEntries } from '../sids/sidStore.js';
import { broadcastRunEvent } from '../ws/runStream.js';
import type { RunState } from './run.js';

export function registerSidRoutes(app: Express, runState: RunState): void {
  app.get('/api/sids/active', (_req: Request, res: Response) => {
    res.json({ entries: getActiveSidEntries() });
  });

  app.post('/api/sids/archive', (_req: Request, res: Response) => {
    if (runState.running) {
      res.status(409).json({ error: 'Cannot archive while a run is in progress' });
      return;
    }
    let archiveFile: string;
    let count: number;
    try {
      const r = archiveActiveSids();
      archiveFile = r.archiveFile;
      count = r.count;
    } catch (e) {
      console.error('[stellar] archive sids', e);
      res.status(500).json({ error: 'Failed to archive SID list' });
      return;
    }
    const ev: Extract<WsClientEvent, { type: 'SID_LIST_ARCHIVED' }> = {
      type: 'SID_LIST_ARCHIVED',
      archivedAt: Date.now(),
      archiveFile,
      count,
    };
    broadcastRunEvent(ev);
    res.json({ ok: true, archiveFile, count });
  });
}
