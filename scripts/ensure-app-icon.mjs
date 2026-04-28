/**
 * electron-builder requires a Windows app icon PNG at least 256×256.
 * Upscales repo-root `north-star.png` into `build/icon.png` and `electron/resources/icon.png`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const src = path.join(repoRoot, 'north-star.png');
const SIZE = 512;

async function main() {
  if (!fs.existsSync(src)) {
    console.error('[ensure-app-icon] Missing north-star.png at repo root:', src);
    process.exit(1);
  }
  const outBuild = path.join(repoRoot, 'build', 'icon.png');
  const outRes = path.join(repoRoot, 'electron', 'resources', 'icon.png');
  await fs.promises.mkdir(path.dirname(outBuild), { recursive: true });
  await fs.promises.mkdir(path.dirname(outRes), { recursive: true });

  const buf = await sharp(src)
    .resize(SIZE, SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await fs.promises.writeFile(outBuild, buf);
  await fs.promises.writeFile(outRes, buf);
  console.log(`[ensure-app-icon] Wrote ${SIZE}×${SIZE} → build/icon.png, electron/resources/icon.png`);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
