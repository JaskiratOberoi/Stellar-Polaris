# Stellar Polaris

Electron-ready LIS automation stack: Node + Puppeteer server, React + Vite UI. This slice lists SIDs from the sample worksheet grid and extracts per-test values from the SID modal for Vitamin B12 (`BI235`), Vitamin D (`BI005`), and Total IgE (`BI133`) per selected filters.

## Prereqs

- Node 20+
- pnpm 9+

## Setup

```bash
pnpm install
# Chromium for Puppeteer (not hoisted to the repo root; use this script)
pnpm run puppeteer:install-chrome
cp .env.example .env
# Set LIS_USERNAME and LIS_PASSWORD (or CBC_LOGIN_* / LOGIN_*). The web UI does not collect credentials.
```

**Note:** The `puppeteer` CLI is installed under `apps/server` only. From the repo root use `pnpm run puppeteer:install-chrome` (or `cd apps/server && pnpm exec puppeteer browsers install chrome`). A plain `pnpm exec puppeteer` at the root will fail with “Command not found”.

## Develop

Runs API/WebSocket on port **4400** and the Vite dev server on **5173** (proxies `/api` and `/ws`).

```bash
pnpm dev
```

Open `http://localhost:5173`.

### B12 (BI235), Vitamin D (BI005), and Total IgE (BI133) authentication

The UI has **Authenticate (write mode)** (default: off). When off, the server still reads the modal, applies the B12 age-banded, Vit D unisex (5–100), and Total IgE (10–190) reference rules, and streams `SID_AUTH_DECISION` per test code with `writeMode: false` — **no** checkbox clicks, comments, or Save.

**Total IgE:** if the modal contains an **ALLERGY PROFILE** row, Total IgE is not listed in that SID’s `tests` and no IgE auth decision is emitted (it is still marked resolved so a BI133-only pass does not re-open the same SID). Otherwise the bot may tick `chkAuth` on the IgE row in range. For high-out-of-range values it ticks `chkAuth` on the same data row **and** appends the high-IgE line to that test’s **inline Comments** (`txtComments` in the grid row — not the same field as **hold Comments** used for B12 / Vit D).

**B12 / Vit D:** when the toggle is on, the bot may tick the matching row `chkAuth` (in-range). For high-out-of-range, it appends `? Supplement History` to the modal **hold Comments** (top right, `txtSampleComments`, at most once if both are high) and `Result Rechecked, kindly check with supplement history.` to that test’s **inline Comments** (`txtComments`); adds IgE inline text when applicable, then **Save once** for the whole modal. This **changes live LIS data** — use dry runs first.

**Auth gate:** the bot only automates SIDs whose worksheet (excluding panel headers) contains **only** Vitamin B12, or only Vitamin D, or B12 and Vit D together, or only Total IgE. If the modal has any other test row (e.g. LIPID PROFILE, LFT, ALLERGY PROFILE subtests), or if Total IgE appears **with** B12 and/or Vit D, it does not authenticate and emits `decision=skip` for each present enabled test with a reason. The web UI shows an **Auth gate** tag for those SIDs.

`POST /api/run` may include `"authenticate": true` to mirror the UI (JSON body). Include `"headless": false` (or use the **Show browser (headed)** switch) to run Chromium in headed mode and watch the automation. Default is `headless: true`.

### Background scheduler

The **Background scheduler** card runs: **complete scan** → **cooldown** (seconds) → **repeat**, using the current filters, test code toggles, headed mode, and authenticate option you save. State is written to `apps/server/data/scheduler.json` (gitignored) and restored when the server starts; if a schedule was enabled, the loop starts again on boot.

- **Save schedule** — persists settings and, with **Run continuously** on, starts (or restarts) the loop. With **Run continuously** off, it turns the scheduler off (same as **Disable**).
- **Disable** — stops after the current run finishes; no new runs are queued.
- A manual `POST /api/run` and the scheduler share a single in-flight run; if a scan is already running, the scheduler waits, then starts its cooldown after the run you care about ends.
- **SCHEDULER_STATE** events on `/ws` carry status, last run time, and next run time for the UI.
- On a headless server or any machine without a display, leave **Show browser (headed)** off; headed mode requires a real display (or a configured virtual one).

### Audit logs (persistent)

The server appends a non-volatile audit trail under `apps/server/data/logs/` (same `apps/server/data/` tree as the scheduler; **gitignored**, so it survives `git pull` and rebuilds and is not committed).

| File | Purpose |
| --- | --- |
| `runs/<runId>.jsonl` | One JSON object per line: every event broadcast on `/ws` for that run (including `LOG` lines), in order. |
| `runs/<runId>.summary.json` | Written when the run ends: `startedAt`, `endedAt`, `outcome` (`done` / `error` / `stopped`), optional `error`, and `summary` from the last `RUN_SUMMARY` if any. |
| `decisions.csv` | Append-only, all runs: one row per `SID_AUTH_DECISION` (best file to grep or open in a spreadsheet: SID, test code, decision, reason, applied, save, write mode, age, sex, run id, timestamp). |
| `scans.csv` | Append-only: one row per `SID_TEST_FOUND` and per `SID_SKIPPED`. Includes discovered-via test code/status, pipe-separated test codes found, auth-gate and allergy-profile flags where applicable, and a final `skipOrExtraReason` field (e.g. `already-resolved` for dedup skips). |
| `scheduler.jsonl` | One JSON line per `SCHEDULER_STATE` broadcast (enable/disable, cooldown, status). |
| `runs/orphan.jsonl` | Only if an event is recorded before a `RUN_STARTED` for the active run (should be rare / empty). |

**Sample ID grid (server persistence)** — under `<STELLAR_DATA_DIR>/sids/` (same tree as `scheduler.json`; `apps/server/data/sids/` in dev):

| File | Purpose |
| --- | --- |
| `active.jsonl` | One JSON object per line (`StoredSidEntry`): the active Sample IDs list; accumulates across runs until archived. |
| `archive/sids-<timestamp>.jsonl` | Written when you click **Archive list** in the UI (`POST /api/sids/archive`); copy elsewhere for long-term audit. |

There is no automatic rotation in v1: archive or copy `data/logs` periodically if you need to cap size. Credentials are never written to these files (only WebSocket event payloads).

## Build + run server only

```bash
pnpm build
pnpm start
```

Then open the built static UI from `apps/web/dist` — or use `pnpm dev` for the full UI or serve `apps/web/dist` with any static host.

## Windows desktop installer (.exe)

Requires **Node 20+**, **pnpm 9+**, and Chromium available for bundling (same as Setup).

```bash
pnpm install
pnpm run puppeteer:install-chrome   # downloads Chrome into ~/.cache/puppeteer (bundled into the installer)
pnpm run package:win
```

Produces **`release/StellarPolaris-Setup-<version>.exe`** (NSIS assisted installer). The wizard asks for:

- **Install location** (standard electron-builder directory page)
- **Logs directory** — audit CSV / JSONL / run logs (`STELLAR_LOGS_DIR`)
- **Data directory** — `scheduler.json` and related state (`STELLAR_DATA_DIR`)

On upgrade or reinstall, **logs and data paths are pre-filled** from `HKCU\Software\Stellar Polaris` (values `LogsDir`, `DataDir`). The installer also writes `%APPDATA%\Stellar Polaris\config.json` for the packaged app.

Uninstall removes the app and that config/registry key; **log and data folders you chose are not deleted** (they may live outside the install directory).

Code signing is **off** by default; set `CSC_LINK` and `CSC_KEY_PASSWORD` (or your org’s signing setup) to sign the installer.

## Environment

| Variable | Description |
| --- | --- |
| `LIS_PRIMARY_URL` | Login page (default matches CBC bot) |
| `LIS_BACKUP_URL` | Fallback login |
| `LIS_USERNAME` / `LIS_PASSWORD` | Recommended; primary names for this app (not sent from the UI) |
| `CBC_LOGIN_USERNAME` / `CBC_LOGIN_PASSWORD` | Same as Autobots CBC (used if `LIS_*` unset) |
| `LOGIN_USERNAME` / `LOGIN_PASSWORD` | Shared bot env (if above unset) |
| (all unset) | Falls back to `JASKIRAT` / `JASKIRAT@123` like `cbc_reader_bot.js` |
| `PORT` | HTTP + WS (default 4400) |
| `HEADLESS` | `true` for headless Chromium |
| `STELLAR_LOW_MEMORY` | `1` to use leaner Chromium flags when RAM &lt; 5 GiB |
| `CHROMIUM_EXECUTABLE_PATH` | Optional path to Chrome/Chromium (must exist on disk) |
| `PUPPETEER_EXECUTABLE_PATH` | Same priority as above in `resolveExecutablePath()` |
| `STELLAR_DATA_DIR` | Directory for `scheduler.json` and app data (packaged app sets from installer) |
| `STELLAR_LOGS_DIR` | Audit logs root (defaults to `<STELLAR_DATA_DIR>/logs` if unset) |
| `STELLAR_STATIC_DIR` | If set, Express serves this folder as the web UI (`index.html` SPA fallback) |

If you see **Could not find Chrome** on startup, the server picks (in order): this env var / Google Chrome in the default OS location / Puppeteer’s downloaded browser. After `pnpm install`, run **`pnpm run puppeteer:install-chrome`**, or install [Google Chrome](https://www.google.com/chrome/) / set `CHROMIUM_EXECUTABLE_PATH`.

## Project layout

- `shared/` — `RunConfig` and WebSocket event types
- `apps/server` — Express, WebSocket, Puppeteer bot
- `apps/web` — React control panel
- `electron/` — Electron shell + `electron-builder` config (`electron/electron-builder.yml`)
- `build/` — NSIS include (`build/installer.nsh`) and bundled resource prep output (`build/chromium-bundle/`)
