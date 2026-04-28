import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { startServer } from '@stellar/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_ID = 'com.stellar.polaris';

type StellarConfig = {
  dataDir: string;
  logsDir: string;
  port: number;
};

function readConfigJson(userData: string): StellarConfig | null {
  const p = path.join(userData, 'config.json');
  try {
    if (!fs.existsSync(p)) return null;
    const j = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
    const dataDir = typeof j.dataDir === 'string' ? j.dataDir : null;
    const logsDir = typeof j.logsDir === 'string' ? j.logsDir : null;
    const port = typeof j.port === 'number' && Number.isFinite(j.port) ? j.port : 4400;
    if (!dataDir || !logsDir) return null;
    return { dataDir, logsDir, port };
  } catch {
    return null;
  }
}

function resolveStellarConfig(): StellarConfig {
  const userData = app.getPath('userData');
  const fromFile = readConfigJson(userData);
  if (fromFile) return fromFile;

  const dataDir = path.join(userData, 'data');
  const logsDir = path.join(userData, 'logs');
  return { dataDir, logsDir, port: 4400 };
}

function bundledChromeExe(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'chromium', 'chrome-win64', 'chrome.exe'),
    path.join(process.resourcesPath, 'chromium', 'chrome.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function defaultStaticDir(): string | undefined {
  const packaged = path.join(process.resourcesPath, 'app', 'web');
  if (fs.existsSync(path.join(packaged, 'index.html'))) return packaged;
  const dev = path.resolve(__dirname, '../../apps/web/dist');
  if (fs.existsSync(path.join(dev, 'index.html'))) return dev;
  return undefined;
}

let serverClose: (() => Promise<void>) | null = null;
let mainWindow: BrowserWindow | null = null;
let listenPort = 4400;

function resolveEnvFiles(): string[] {
  const appPath = app.getAppPath();
  return [
    path.join(appPath, '.env'),
    path.resolve(appPath, '../.env'),
    path.resolve(appPath, '../../.env'),
    path.join(app.getPath('userData'), '.env'),
  ];
}

async function createWindow(port: number): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);

  const chrome = bundledChromeExe();
  if (chrome) {
    process.env.PUPPETEER_EXECUTABLE_PATH = chrome;
    process.env.CHROMIUM_EXECUTABLE_PATH = chrome;
  } else {
    console.warn('[stellar-electron] No bundled Chrome under resources/chromium; relying on system/Puppeteer cache.');
  }

  const cfg = resolveStellarConfig();
  const staticDir = defaultStaticDir();

  const started = await startServer({
    port: cfg.port,
    dataDir: cfg.dataDir,
    logsDir: cfg.logsDir,
    staticDir,
    envFiles: resolveEnvFiles(),
  });

  listenPort = started.port;
  serverClose = started.close;
  await createWindow(listenPort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow(listenPort);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverClose) {
    void serverClose();
    serverClose = null;
  }
});
