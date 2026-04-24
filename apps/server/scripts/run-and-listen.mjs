// End-to-end smoke: open WS, POST /api/run, print events until terminal event or timeout.
import WebSocket from 'ws';

const HOST = process.env.HOST || 'localhost:4400';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 180000);

const cfg = {
  testCodes: ['BI235', 'BI005'],
  businessUnit: 'QUGEN',
  statusLabels: ['Tested', 'Partially Tested'],
  headless: true,
};

const ws = new WebSocket(`ws://${HOST}/ws`);
let sids = 0;

function done(code) {
  try { ws.close(); } catch {}
  process.exit(code);
}

const killer = setTimeout(() => {
  console.error(`[smoke] Timed out after ${TIMEOUT_MS}ms (sids so far: ${sids}). Asking server to stop.`);
  fetch(`http://${HOST}/api/stop`, { method: 'POST' }).catch(() => {});
  setTimeout(() => done(2), 4000);
}, TIMEOUT_MS);

ws.on('open', async () => {
  console.log('[smoke] WS open, posting /api/run');
  const res = await fetch(`http://${HOST}/api/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  const body = await res.json().catch(() => null);
  console.log('[smoke] POST /api/run ->', res.status, body);
  if (!res.ok) {
    clearTimeout(killer);
    done(1);
  }
});

ws.on('message', (raw) => {
  let ev;
  try { ev = JSON.parse(raw.toString('utf8')); } catch { return; }
  if (ev.type === 'SID_FOUND') {
    sids += 1;
    console.log(`[SID #${sids}] code=${ev.testCode} status=${ev.statusLabel} sid=${ev.sid} page=${ev.page ?? '?'}`);
    return;
  }
  if (ev.type === 'LOG') {
    console.log(`[LOG ${ev.level}] ${ev.message}`);
    return;
  }
  console.log(`[EV ${ev.type}]`, JSON.stringify(ev));
  if (ev.type === 'RUN_DONE' || ev.type === 'RUN_ERROR' || ev.type === 'RUN_STOPPED') {
    clearTimeout(killer);
    console.log(`[smoke] terminal=${ev.type} totalSids=${sids}`);
    done(ev.type === 'RUN_DONE' && sids > 0 ? 0 : (ev.type === 'RUN_DONE' ? 0 : 3));
  }
});

ws.on('error', (e) => { console.error('[smoke] ws error:', e.message); });
ws.on('close', () => { console.log('[smoke] ws closed'); });
