// Visual audit: the same world at several times of day, underground, and mid-action.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('../shots/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURI(req.url.split('?')[0])); if (p === '/' || p === '/.') p = '/index.html';
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.CM && CM.game && CM.game.state === 'title', null, { timeout: 40000 });
await page.evaluate(() => CM.game.createWorld('Audit', 'audit-seed'));
await page.waitForFunction(() => CM.game.state === 'playing', null, { timeout: 40000 });
await page.waitForTimeout(1200);

const shot = async n => page.screenshot({ path: join(SHOTS, 'audit-' + n + '.png') });
const setTime = t => page.evaluate(v => { CM.game.clock = CM.DAY_LEN * v; }, t);
const look = (yaw, pitch) => page.evaluate(([y, p]) => { CM.game.player.yaw = y; CM.game.player.pitch = p; }, [yaw, pitch]);

// a vantage point above the ground so we see terrain, not the inside of the hut
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  const x = Math.floor(g.spawn.x) + 22, z = Math.floor(g.spawn.z) + 22;
  g.world.update(x, z);
  p.pos.set(x + 0.5, g.world.topY(x, z) + 6, z + 0.5);
  p.vel.set(0, 0, 0);
});
await page.waitForTimeout(1500);
for (const [t, name] of [[0.25, 'day'], [0.03, 'dawn'], [0.47, 'dusk'], [0.72, 'night']]) {
  await setTime(t); await look(0.7, -0.12); await page.waitForTimeout(900); await shot(name);
}

// torches planted on the surface after dark
await setTime(0.75);
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
  for (const [dx, dz] of [[3, 1], [5, -2], [7, 2], [2, -4]]) {
    const x = bx + dx, z = bz + dz, y = g.world.topY(x, z);
    if (y > 0) g.world.set(x, y, z, CM.B.TORCH);
  }
});
await look(0.55, -0.08);
await page.waitForTimeout(1400);
await shot('night-torches');

// under a tree canopy, where foliage shade should dapple rather than blacken
await setTime(0.25);
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  for (let r = 2; r < 40; r += 2) for (let a = 0; a < 16; a++) {
    const x = Math.floor(p.pos.x + Math.cos(a) * r), z = Math.floor(p.pos.z + Math.sin(a) * r);
    g.world.update(x, z);
    const y = g.world.topY(x, z);
    if (y > 0 && g.world.get(x, y + 3, z) === CM.B.LEAVES) { p.pos.set(x + 0.5, y + 0.02, z + 0.5); p.vel.set(0, 0, 0); return; }
  }
});
await look(0.6, -0.35);
await page.waitForTimeout(1200);
await shot('tree-shade');

// underground: drop into the stone and look along a tunnel
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
  for (let y = 14; y < 30; y++) for (let dx = -1; dx <= 6; dx++) for (let dz = -1; dz <= 1; dz++) {
    if (y < 17) g.world.set(x + dx, y, z + dz, 0);           // carve a small chamber
  }
  p.pos.set(x + 0.5, 14.05, z + 0.5); p.vel.set(0, 0, 0);
});
await look(Math.PI / 2, 0);
await page.waitForTimeout(1200);
await shot('cave');

// same chamber, lit by a torch
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
  g.world.set(x + 3, 14, z, CM.B.TORCH);
  g.world.set(x + 6, 14, z, CM.B.TORCH);
});
await page.waitForTimeout(1200);
await shot('cave-torch');

// mid-dig, to see what breaking a block looks like
await page.evaluate(() => { const p = CM.game.player; p.pitch = -1.2; CM.input.mouseLeft = true; });
await page.waitForTimeout(700);
await shot('mining');
await page.waitForTimeout(2500);
await shot('mining-late');
await page.evaluate(() => { CM.input.mouseLeft = false; });

// water: find the sea and stand in it
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  let best = null;
  for (let r = 4; r < 60 && !best; r += 4) for (let a = 0; a < 12 && !best; a++) {
    const x = Math.floor(g.spawn.x + Math.cos(a) * r), z = Math.floor(g.spawn.z + Math.sin(a) * r);
    g.world.update(x, z);
    if (g.world.get(x, CM.SEA, z) === CM.B.WATER) best = [x, z];
  }
  if (best) { p.pos.set(best[0] + 0.5, CM.SEA - 1, best[1] + 0.5); p.vel.set(0, 0, 0); }
  return best;
});
await look(1.2, 0.1);
await page.waitForTimeout(1400);
await shot('water');
console.log('audit shots written');
await browser.close(); server.close();
