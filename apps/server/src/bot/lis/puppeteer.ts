import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executablePath as getPuppeteerCacheChrome } from 'puppeteer';
import type { LaunchOptions, Page } from 'puppeteer';

let lowMemoryProfileLogged = false;

function sanitizeListecChromeRoleForArg(): string | null {
  const raw = process.env.LISTEC_CHROME_ROLE && String(process.env.LISTEC_CHROME_ROLE).trim();
  if (!raw || !/^[a-z0-9_-]{1,32}$/i.test(raw)) return null;
  return raw;
}

function isLowMemoryHost(): boolean {
  if (process.env.STELLAR_LOW_MEMORY === '0') return false;
  if (process.env.STELLAR_LOW_MEMORY === '1') return true;
  if (process.env.CBC_LOW_MEMORY === '0') return false;
  if (process.env.CBC_LOW_MEMORY === '1') return true;
  try {
    return os.totalmem() < 5 * 1024 * 1024 * 1024;
  } catch {
    return false;
  }
}

function chromiumLowMemoryArgs(): string[] {
  return [
    '--mute-audio',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    '--disable-default-apps',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-client-side-phishing-detection',
    '--disable-domain-reliability',
    '--disable-features=AudioServiceOutOfProcess,MediaRouter,OptimizationHints',
    '--disk-cache-size=1048576',
    '--media-cache-size=1',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--renderer-process-limit=2',
  ];
}

export function buildStellarPuppeteerLaunchOptions(
  isHeadless: boolean,
  overrides: LaunchOptions = {}
): LaunchOptions {
  const lowMem = isLowMemoryHost();
  if (lowMem && !lowMemoryProfileLogged) {
    lowMemoryProfileLogged = true;
    console.log(
      '[stellar] Low-memory profile (STELLAR_LOW_MEMORY=1 or host < 5 GiB): leaner Chromium flags.'
    );
  }

  const headlessArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--window-size=1920,1080',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
  ];
  if (lowMem) {
    headlessArgs.push(...chromiumLowMemoryArgs());
  }

  const headedArgs = ['--start-maximized'];
  if (lowMem) {
    headedArgs.push(...chromiumLowMemoryArgs());
  }

  const listecRole = sanitizeListecChromeRoleForArg();
  const roleArg = listecRole ? [`--listec-chrome-role=${listecRole}`] : [];

  return {
    headless: isHeadless,
    defaultViewport: null,
    args: [...(isHeadless ? headlessArgs : headedArgs), ...roleArg],
    ...overrides,
  };
}

export function resolveExecutablePath(): string | undefined {
  const envCandidates = [process.env.CHROMIUM_EXECUTABLE_PATH, process.env.PUPPETEER_EXECUTABLE_PATH, process.env.CHROME_PATH]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  for (const candidate of envCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const platformCandidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        ]
      : [];

  for (const candidate of platformCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return undefined;
}

function chromeBinaryRelativeFromRevision(): string {
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'mac_arm-' : 'mac-';
    void arch;
    const dir = process.arch === 'arm64' ? 'chrome-mac-arm64' : 'chrome-mac-x64';
    return `${dir}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
  }
  if (process.platform === 'win32') return 'chrome-win64\\chrome.exe';
  return 'chrome-linux64/chrome';
}

function chromeRevisionDirPrefix(): string {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac_arm-' : 'mac-';
  if (process.platform === 'win32') return 'win64-';
  return 'linux-';
}

/**
 * Scan a Puppeteer cache root (e.g. `~/.cache/puppeteer/chrome`) for the highest-version
 * usable Chrome binary. Returns null if none found or directory missing.
 */
function findChromeInPuppeteerCache(cacheRoot: string): string | null {
  try {
    const chromeRoot = path.join(cacheRoot, 'chrome');
    if (!fs.existsSync(chromeRoot) || !fs.statSync(chromeRoot).isDirectory()) return null;
    const prefix = chromeRevisionDirPrefix();
    const rel = chromeBinaryRelativeFromRevision();
    const revs = fs
      .readdirSync(chromeRoot)
      .filter((name) => name.startsWith(prefix))
      .sort()
      .reverse();
    for (const rev of revs) {
      const candidate = path.join(chromeRoot, rev, rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Picks a Chrome/Chromium binary in this priority order:
 *  1. Env overrides (CHROMIUM_EXECUTABLE_PATH / PUPPETEER_EXECUTABLE_PATH / CHROME_PATH)
 *  2. Locally installed Google Chrome / Chromium (system install)
 *  3. Puppeteer-managed Chrome at `~/.cache/puppeteer/chrome/<rev>/...`
 *  4. Puppeteer-managed Chrome at `$PUPPETEER_CACHE_DIR/chrome/<rev>/...`
 *  5. Whatever `puppeteer.executablePath()` reports (last resort, may be a stale path)
 */
export function resolveChromeForStellarLaunch(): string | null {
  const fromPaths = resolveExecutablePath();
  if (fromPaths) return fromPaths;

  const cacheRoots: string[] = [];
  cacheRoots.push(path.join(os.homedir(), '.cache', 'puppeteer'));
  if (process.env.PUPPETEER_CACHE_DIR && String(process.env.PUPPETEER_CACHE_DIR).trim()) {
    cacheRoots.push(String(process.env.PUPPETEER_CACHE_DIR).trim());
  }
  for (const root of cacheRoots) {
    const found = findChromeInPuppeteerCache(root);
    if (found) return found;
  }

  try {
    const cached = getPuppeteerCacheChrome();
    if (cached && fs.existsSync(cached)) return cached;
  } catch {
    /* older puppeteer */
  }
  return null;
}

export function getChromeInstallHint(): string {
  return [
    'No Chrome/Chromium binary found. Fix one of:',
    '(1) From repo root: pnpm run puppeteer:install-chrome  (puppeteer CLI lives in apps/server, not the root)',
    '(2) Install Google Chrome (or set CHROMIUM_EXECUTABLE_PATH to your chrome or chromium binary)',
  ].join(' ');
}

export function applyChromiumExecutablePathEnv(launchOptions: LaunchOptions): string | undefined {
  const chromiumPath = process.env.CHROMIUM_EXECUTABLE_PATH && String(process.env.CHROMIUM_EXECUTABLE_PATH).trim();
  if (chromiumPath) {
    if (!fs.existsSync(chromiumPath)) {
      console.warn(`[stellar] CHROMIUM_EXECUTABLE_PATH is set but file not found: ${chromiumPath}`);
      return undefined;
    }
    launchOptions.executablePath = chromiumPath;
    console.log(`Using CHROMIUM_EXECUTABLE_PATH: ${chromiumPath}`);
    return chromiumPath;
  }
  return undefined;
}

export async function applyPageLowMemoryOptimizations(page: Page | null | undefined): Promise<void> {
  if (!isLowMemoryHost() || !page) return;
  try {
    if (typeof (page as { setCacheEnabled?: (v: boolean) => Promise<void> }).setCacheEnabled === 'function') {
      await (page as { setCacheEnabled: (v: boolean) => Promise<void> }).setCacheEnabled(false);
    }
  } catch {
    /* ignore */
  }
}
