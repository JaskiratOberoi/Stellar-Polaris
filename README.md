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

**Total IgE:** if the modal contains an **ALLERGY PROFILE** row, Total IgE is not listed in that SID’s `tests` and no IgE auth decision is emitted (it is still marked resolved so a BI133-only pass does not re-open the same SID). Otherwise the bot may tick `chkAuth` on the IgE row in range, or append a high-out-of-range line to that row’s per-row **Comments** (`txtComments` — not the same field as the shared sample Comments used for B12 and Vit D).

**B12 / Vit D:** when the toggle is on, the bot may tick the matching row `chkAuth` (in-range), append the shared high-result line to the sample **Comments** textarea (at most once if both B12 and Vit D are out of range in the same SID), add IgE per-row text when applicable, then click **Save once** for the whole modal. This **changes live LIS data** — use dry runs first.

`POST /api/run` may include `"authenticate": true` to mirror the UI (JSON body).

## Build + run server only

```bash
pnpm build
pnpm start
```

Then open the built static UI from `apps/web/dist` (or point Electron at it later) — for now, use `pnpm dev` for the full UI or serve `apps/web/dist` with any static host.

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

If you see **Could not find Chrome** on startup, the server picks (in order): this env var / Google Chrome in the default OS location / Puppeteer’s downloaded browser. After `pnpm install`, run **`pnpm run puppeteer:install-chrome`**, or install [Google Chrome](https://www.google.com/chrome/) / set `CHROMIUM_EXECUTABLE_PATH`.

## Project layout

- `shared/` — `RunConfig` and WebSocket event types
- `apps/server` — Express, WebSocket, Puppeteer bot
- `apps/web` — React control panel
- `electron/`, `build/` — reserved for a future Electron shell
