/**
 * Copies the newest Puppeteer-downloaded Chrome (win64) into build/chromium-bundle/chrome-win64
 * so electron-builder can bundle it under resources/chromium/.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const chromeRoot = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
const outRoot = path.resolve('build', 'chromium-bundle');

function main() {
  if (!fs.existsSync(chromeRoot)) {
    console.error(`[prepare-chromium] No Puppeteer cache at ${chromeRoot}. Run: pnpm run puppeteer:install-chrome`);
    process.exit(1);
  }
  const revs = fs
    .readdirSync(chromeRoot)
    .filter((n) => n.startsWith('win64-'))
    .sort()
    .reverse();
  if (!revs.length) {
    console.error(`[prepare-chromium] No win64-* revision under ${chromeRoot}`);
    process.exit(1);
  }
  const src = path.join(chromeRoot, revs[0], 'chrome-win64');
  if (!fs.existsSync(path.join(src, 'chrome.exe'))) {
    console.error(`[prepare-chromium] Missing chrome.exe under ${src}`);
    process.exit(1);
  }
  const dest = path.join(outRoot, 'chrome-win64');
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  // Trim obvious non-runtime helpers (optional; reduces extra exes under resources/chromium).
  for (const name of ['setup.exe']) {
    try {
      fs.unlinkSync(path.join(dest, name));
    } catch {
      /* ignore */
    }
  }
  console.log(`[prepare-chromium] Bundled ${revs[0]} -> ${dest}`);
}

main();
