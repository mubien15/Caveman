// Loads the built game in headless Chromium, drives it, screenshots, reports errors.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('../shots/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  let p = normalize(decodeURI(req.url.split('?')[0]));
  if (p === '/' || p === '/.') p = '/index.html';
  try {
    const body = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 1 });
const errors = [], logs = [];
page.on('console', m => { logs.push(`${m.type()}: ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));

const step = async (label, fn) => {
  try { await fn(); console.log(`  ok   ${label}`); }
  catch (e) { console.log(`  FAIL ${label}: ${e.message.split('\n')[0]}`); errors.push(`${label}: ${e.message.split('\n')[0]}`); }
};
const shot = async name => page.screenshot({ path: join(SHOTS, name + '.png') });
const waitState = (s, t = 30000) => page.waitForFunction(st => window.CM && CM.game && CM.game.state === st, s, { timeout: t });
const scenario = process.argv[2] || 'all';

await page.goto(base, { waitUntil: 'domcontentloaded' });
await step('three.js + modules load', () => page.waitForFunction(() => window.CM && CM.game, null, { timeout: 15000 }));
await step('world finishes loading -> title', () => waitState('title'));
await shot('01-title');
await step('enter play', async () => { await page.evaluate(() => CM.game.play()); await waitState('playing'); });
await page.waitForTimeout(1200);
await shot('02-play-day');

// probe: report a summary of live game state
const probe = async () => page.evaluate(() => {
  const g = CM.game, p = g.player;
  return {
    state: g.state, fps: g.__fps ?? null, day: Math.floor(g.clock / CM.DAY_LEN) + 1,
    t: +((g.clock / CM.DAY_LEN) % 1).toFixed(3),
    pos: [p.pos.x, p.pos.y, p.pos.z].map(n => +n.toFixed(1)),
    health: p.health, hunger: p.hunger, breath: p.breath ?? null,
    mobs: CM.game.__mobs ? CM.game.__mobs.list.length : null,
    chunks: g.world.chunks.size,
  };
});
console.log('  state:', JSON.stringify(await probe()));

if (scenario === 'all' || scenario === 'hand') {
  // look at open ground so the item reads against sky, then shoot each held type
  await page.evaluate(() => { CM.game.player.yaw = Math.PI; CM.game.player.pitch = -0.1; });
  await page.waitForTimeout(400);
  for (const [slot, name] of [[0, 'club'], [2, 'block'], [1, 'meat']]) {
    await page.evaluate(i => CM.game.selectSlot(i), slot);
    await page.waitForTimeout(700);
    await shot(`hand-${name}`);
  }
  await step('third person view', async () => {
    await page.evaluate(() => { CM.game.selectSlot(0); CM.game.cameraMode = 1; });
    await page.waitForTimeout(700);
    await shot('hand-thirdperson');
    await page.evaluate(() => { CM.game.cameraMode = 0; });
  });
}

if (scenario === 'all' || scenario === 'night') {
  await step('fast-forward to night', async () => {
    await page.evaluate(() => { CM.game.clock = CM.DAY_LEN * 0.75; });
    await page.waitForTimeout(2500);
  });
  await shot('03-night');
  console.log('  night:', JSON.stringify(await probe()));
}

console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.slice(0, 12).join('\n') : '\nno console/page errors');
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
