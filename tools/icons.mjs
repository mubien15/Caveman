// Renders the app icons from the game's own block art, so the home screen matches the world.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../dist/', import.meta.url).pathname;
const OUT = new URL('../icons/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURI(req.url.split('?')[0])); if (p === '/' || p === '/.') p = '/index.html';
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.CM && CM.tiles && CM.tiles.length > 0, null, { timeout: 40000 });

const render = (size, padFrac, bg) => page.evaluate(([size, padFrac, bg]) => {
  const src = CM.iconCanvas(CM.B.GRASS);          // the same cube the hotbar shows
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (bg) {
    const g = ctx.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, '#3a332b');
    g.addColorStop(1, '#1d1b18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.imageSmoothingEnabled = false;
  const pad = Math.round(size * padFrac);
  ctx.drawImage(src, pad, pad, size - pad * 2, size - pad * 2);
  return c.toDataURL('image/png');
}, [size, padFrac, bg]);

const files = [
  ['icon-32.png', 32, 0.02, true],
  ['icon-180.png', 180, 0.08, true],     // apple-touch-icon
  ['icon-192.png', 192, 0.08, true],
  ['icon-512.png', 512, 0.08, true],
  ['icon-maskable-512.png', 512, 0.2, true],   // safe zone for Android adaptive icons
];
for (const [name, size, pad, bg] of files) {
  const url = await render(size, pad, bg);
  await writeFile(join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
  console.log('  wrote icons/' + name);
}
await browser.close(); server.close();
