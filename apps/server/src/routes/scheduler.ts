import type { Express, Request, Response } from 'express';
import { disableScheduler, enableScheduler, getSchedulerSnapshot } from '../scheduler/scheduler.js';
import { validateRunConfig } from './run.js';

export function registerSchedulerRoutes(app: Express): void {
  app.get('/api/scheduler', (_req: Request, res: Response) => {
    res.json(getSchedulerSnapshot());
  });

  app.post('/api/scheduler', (req: Request, res: Response) => {
    const b = req.body;
    if (b == null || typeof b !== 'object') {
      res.status(400).json({ error: 'Expected JSON object body' });
      return;
    }
    const body = b as Record<string, unknown>;

    if (body.enabled === false) {
      const cooldownRaw = body.cooldownSeconds;
      const cooldownSeconds =
        typeof cooldownRaw === 'number' && Number.isFinite(cooldownRaw) ? cooldownRaw : null;
      if (cooldownSeconds != null && (cooldownSeconds < 30 || cooldownSeconds > 24 * 3600)) {
        res.status(400).json({ error: 'cooldownSeconds must be between 30 and 86400' });
        return;
      }
      disableScheduler(cooldownSeconds ?? undefined);
      res.json({ ok: true, ...getSchedulerSnapshot() });
      return;
    }

    if (body.enabled === true) {
      const cooldownRaw = body.cooldownSeconds;
      const cooldownSeconds =
        typeof cooldownRaw === 'number' && Number.isFinite(cooldownRaw) ? cooldownRaw : 300;

      if (body.config == null) {
        res.status(400).json({ error: 'When enabled is true, config is required' });
        return;
      }
      const v = validateRunConfig(body.config);
      if (!v.ok) {
        res.status(400).json({ error: v.error });
        return;
      }
      const r = enableScheduler({ cooldownSeconds, config: v.config });
      if (!r.ok) {
        res.status(400).json({ error: r.error });
        return;
      }
      res.json({ ok: true, ...getSchedulerSnapshot() });
      return;
    }

    res
      .status(400)
      .json({ error: 'Invalid body: use { enabled: false } or { enabled: true, cooldownSeconds?, config }' });
  });
}
