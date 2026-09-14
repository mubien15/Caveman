// One creature at a time, four blocks away, on flat ground — so the model can be judged.
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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 520, height: 460 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.CM && CM.game && CM.game.state === 'title', null, { timeout: 40000 });
await page.evaluate(() => CM.game.createWorld('Portraits', 'portrait-seed'));
await page.waitForFunction(() => CM.game.state === 'playing', null, { timeout: 40000 });
await page.waitForTimeout(1200);

// flatten a patch so nothing is half-buried
await page.evaluate(() => {
  const g = CM.game, p = g.player, W = g.world;
  const cx = Math.floor(p.pos.x), cz = Math.floor(p.pos.z), y = W.topY(cx, cz);
  for (let x = cx - 8; x <= cx + 8; x++) for (let z = cz - 8; z <= cz + 8; z++) {
    for (let yy = y; yy < y + 6; yy++) W.set(x, yy, z, 0);
    W.set(x, y - 1, z, CM.B.GRASS);
  }
  p.pos.set(cx + 0.5, y + 0.02, cz + 0.5); p.vel.set(0, 0, 0);
  g.clock = CM.DAY_LEN * 0.25;
});
await page.waitForTimeout(700);

for (const kind of ['boar', 'hare', 'elk', 'wolf', 'fish']) {
  await page.evaluate(async k => {
    const g = CM.game, p = g.player, W = g.world;
    g.mobs.clear();
    const cx = Math.floor(p.pos.x), cz = Math.floor(p.pos.z), y = W.topY(cx, cz);
    if (k === 'fish') { for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz + 2; z <= cz + 6; z++) for (let yy = y - 3; yy < y; yy++) W.set(x, yy, z, CM.B.WATER); }
    g.mobs.spawnGroup(k, cx, (k === 'fish' ? y - 2 : y) + 0.02, cz + 4);
    while (g.mobs.list.length > 1) g.mobs.remove(g.mobs.list[g.mobs.list.length - 1]);
    const m = g.mobs.list[0];
    if (m) { m.spec = Object.assign({}, m.spec, { shy: 0 }); m.pos.set(cx + 0.5, m.pos.y, cz + 4.5); m.think = 999; m.walking = false; m.fleeT = 0; m.yaw = Math.PI * 0.8; }
    p.yaw = Math.PI; p.pitch = k === 'elk' ? 0.02 : k === 'fish' ? -0.45 : -0.12;
  }, kind);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: join(SHOTS, `portrait-${kind}.png`) });
  console.log('  shot ' + kind);
}
await browser.close(); server.close();
