// End-to-end smoke: open WS, POST /api/run, print events until terminal event or timeout.
import WebSocket from 'ws';

const HOST = process.env.HOST || 'localhost:4400';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 240000);

const cfg = {
  testCodes: ['BI235', 'BI005', 'BI133', 'BI180', 'BI036', 'MS111'],
  businessUnit: 'QUGEN',
  statusLabels: ['Tested', 'Partially Tested'],
  headless: true,
};

const ws = new WebSocket(`ws://${HOST}/ws`);
let sidCount = 0;
let skippedCount = 0;

function done(code) {
  try { ws.close(); } catch {}
  process.exit(code);
}

const killer = setTimeout(() => {
  console.error(`[smoke] Timed out after ${TIMEOUT_MS}ms (sids so far: ${sidCount}). Asking server to stop.`);
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

  if (ev.type === 'SID_TEST_FOUND') {
    sidCount += 1;
    const summary = ev.tests.length === 0
      ? 'no enabled tests in modal'
      : ev.tests
          .map((t) => `${t.testCode}=${t.value ?? 'null'}${t.unit ? ' ' + t.unit : ''}${t.abnormal ? ' [AB]' : ''}${t.borderColor ? ' (' + t.borderColor + ')' : ''}`)
          .join(', ');
    const ap =
      ev.allergyProfileSuppressedTotalIgE
        ? ` [AllergyProfile: IgE ${ev.suppressedTotalIgEValue ?? '—'}${ev.suppressedTotalIgEUnit ? ' ' + ev.suppressedTotalIgEUnit : ''} suppressed]`
        : '';
    const gate = ev.authGateSkipped
      ? ` [AuthGate: skip — ${ev.authGateReason ?? 'reason n/a'}]`
      : '';
    console.log(
      `[SID #${sidCount}] sid=${ev.sid} via=${ev.discoveredViaTestCode}/${ev.discoveredViaStatus}: ${summary}${ap}${gate}`
    );
    return;
  }

  if (ev.type === 'SID_SKIPPED') {
    skippedCount += 1;
    console.log(`[SKIP] sid=${ev.sid} via=${ev.discoveredViaTestCode}/${ev.discoveredViaStatus} (${ev.reason})`);
    return;
  }

  if (ev.type === 'RUN_SUMMARY') {
    console.log(`[SUMMARY] uniqueSids=${ev.uniqueSids} modalsOpened=${ev.modalsOpened} modalsSkipped=${ev.modalsSkipped}`);
    return;
  }

  if (ev.type === 'SID_AUTH_DECISION') {
    console.log(
      `[AUTH] sid=${ev.sid} ${ev.testCode} decision=${ev.decision} writeMode=${ev.writeMode} applied=${ev.applied} save=${ev.saveClicked} ageMo=${ev.ageMonths ?? 'n/a'} reason=${ev.reason}`
    );
    return;
  }

  if (ev.type === 'LOG') {
    console.log(`[LOG ${ev.level}] ${ev.message}`);
    return;
  }

  console.log(`[EV ${ev.type}]`, JSON.stringify(ev));
  if (ev.type === 'RUN_DONE' || ev.type === 'RUN_ERROR' || ev.type === 'RUN_STOPPED') {
    clearTimeout(killer);
    console.log(`[smoke] terminal=${ev.type} sidsEmitted=${sidCount} skipped=${skippedCount}`);
    done(ev.type === 'RUN_DONE' ? 0 : 3);
  }
});

ws.on('error', (e) => { console.error('[smoke] ws error:', e.message); });
ws.on('close', () => { console.log('[smoke] ws closed'); });
