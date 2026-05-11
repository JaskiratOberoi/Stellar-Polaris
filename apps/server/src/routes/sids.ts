import type { Express, Request, Response } from 'express';
import type { WsClientEvent } from '@stellar/shared';
import { getSidCountersSnapshot } from '../sids/sidCounters.js';
import { archiveActiveSids, getActiveSidEntries, listSidArchives, readSidArchive } from '../sids/sidStore.js';
import { broadcastRunEvent } from '../ws/runStream.js';
import type { RunState } from './run.js';

export function registerSidRoutes(app: Express, runState: RunState): void {
  app.get('/api/sids/active', (_req: Request, res: Response) => {
    res.json({ entries: getActiveSidEntries() });
  });

  app.get('/api/sids/counters', (_req: Request, res: Response) => {
    res.json(getSidCountersSnapshot());
  });

  app.get('/api/sids/archives', (_req: Request, res: Response) => {
    try {
      res.json({ archives: listSidArchives() });
    } catch (e) {
      console.error('[stellar] list sid archives', e);
      res.status(500).json({ error: 'Failed to list archives' });
    }
  });

  app.get('/api/sids/archives/:file', (req: Request, res: Response) => {
    try {
      const raw = req.params['file'];
      if (!raw) {
        res.status(400).json({ error: 'Missing file' });
        return;
      }
      const file = decodeURIComponent(raw);
      const r = readSidArchive(file);
      res.json({ file, archivedAt: r.archivedAt, count: r.count, entries: r.entries });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'Archive not found') {
        res.status(404).json({ error: msg });
        return;
      }
      if (msg.includes('Invalid')) {
        res.status(400).json({ error: msg });
        return;
      }
      console.error('[stellar] read sid archive', e);
      res.status(500).json({ error: 'Failed to read archive' });
    }
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
