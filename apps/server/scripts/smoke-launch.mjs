// Smoke test: verify Stellar launch picks up an installed Chrome and can open about:blank.
import puppeteer from 'puppeteer';
import {
  buildStellarPuppeteerLaunchOptions,
  applyChromiumExecutablePathEnv,
  resolveChromeForStellarLaunch,
  getChromeInstallHint,
} from '../dist/bot/lis/puppeteer.js';

const launchOpts = buildStellarPuppeteerLaunchOptions(true, {});
const fromEnv = applyChromiumExecutablePathEnv(launchOpts);
if (!fromEnv) {
  const chosen = resolveChromeForStellarLaunch();
  if (!chosen) {
    console.error(getChromeInstallHint());
    process.exit(2);
  }
  launchOpts.executablePath = chosen;
}
console.log('Launching with executablePath:', launchOpts.executablePath);

const browser = await puppeteer.launch(launchOpts);
const page = await browser.newPage();
await page.goto('about:blank');
const title = await page.title();
console.log(`Opened about:blank ok (title=${JSON.stringify(title)})`);
await browser.close();
console.log('Browser closed cleanly. Smoke test PASSED.');
