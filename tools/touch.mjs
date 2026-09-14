// Drives the game as a phone would: floating stick, hold-to-dig, tap-to-place, sprint, sneak.
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
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
// a phone held in landscape, which is how anyone actually plays this
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.stack || e.message)));

const results = [];
let resetN = 0;
const reset = async (pitch = -0.3) => page.evaluate(async ([pi, n]) => {
  const g = CM.game, p = g.player;
  // step to a fresh column each time so an earlier hole never swallows the next check
  const sx = Math.floor(g.spawn.x) + 3 + n * 2, sz = Math.floor(g.spawn.z) + 3;
  const y = g.world.topY(sx, sz);
  p.pos.set(sx + 0.5, y + 0.02, sz + 0.5);
  p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = pi; p.dead = false;
  CM.input.clear();
  await new Promise(r => setTimeout(r, 500));
}, [pitch, resetN++]);
const check = (label, pass, detail) => { results.push(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!pass) errors.push('check failed: ' + label); };

// synthetic pointer events hit the same handlers a finger would
await page.addInitScript(() => {
  const AC = window.AudioContext || window.webkitAudioContext;   // count the notes the score actually schedules
  if (AC) {
    const osc = AC.prototype.createOscillator;
    window.__voices = 0;
    AC.prototype.createOscillator = function () { window.__voices++; window.__ac = this; return osc.call(this); };
  }
  window.__touch = (type, x, y, id = 1) => {
    const el = document.getElementById('view');
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 }));
  };
  window.__btn = (id, type) => {
    const el = document.getElementById(id);
    el.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
  };
});

await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.CM && CM.game && CM.game.state === 'title', null, { timeout: 30000 });
check('touch controls detected', await page.evaluate(() => CM.isTouch && !document.body.classList.contains('desktop')));
await page.screenshot({ path: join(SHOTS, 'phone-01-title.png') });

// a fixed seed keeps every assertion below reproducible
await page.evaluate(() => CM.game.createWorld('Testland', 'caveman-test-seed'));
await page.waitForFunction(() => CM.game.state === 'playing', null, { timeout: 40000 });
await page.waitForTimeout(900);
await page.screenshot({ path: join(SHOTS, 'phone-02-hud.png') });

// ---- walk with the left thumb, then stretch it to a run ----
const walked = await page.evaluate(async () => {
  const p = CM.game.player, from = [p.pos.x, p.pos.z];
  __touch('pointerdown', 120, 250);
  for (let i = 0; i < 12; i++) { __touch('pointermove', 120, 250 - i * 8); await new Promise(r => setTimeout(r, 40)); }
  await new Promise(r => setTimeout(r, 700));
  const sprinting = p.sprinting, sprintUI = document.getElementById('joystick').classList.contains('sprint');
  __touch('pointerup', 120, 180);
  return { moved: Math.hypot(p.pos.x - from[0], p.pos.z - from[1]), sprinting, sprintUI };
});
check('joystick walks the caveman', walked.moved > 1.5, `moved ${walked.moved.toFixed(1)} blocks`);
check('full stretch breaks into a run', walked.sprinting && walked.sprintUI);

// ---- hold a finger on the world to dig ----
await reset(-1.5);
const dug = await page.evaluate(async () => {
  const p = CM.game.player;
  p.pitch = -1.5; p.vel.set(0, 0, 0);                     // straight down at the ground underfoot
  p.addItem(CM.I.FLINT_PICK, 1);                          // so stony ground does not outlast the test
  CM.game.selectSlot(p.inv.findIndex(s => s && s.id === CM.I.FLINT_PICK));
  await new Promise(r => setTimeout(r, 300));
  const before = p.inv.reduce((n, s) => n + (s ? s.n : 0), 0);
  __touch('pointerdown', 422, 195);
  await new Promise(r => setTimeout(r, 500));
  const aiming = CM.input.aimMine, mining = !!CM.game.mining;
  await new Promise(r => setTimeout(r, 3500));
  const after = p.inv.reduce((n, s) => n + (s ? s.n : 0), 0);
  __touch('pointerup', 422, 195);
  const m = CM.game.mining;
  return { aiming, mining, gained: after - before, where: m ? `${m.x},${m.y},${m.z}` : null,
    block: m ? CM.blocks[CM.game.world.get(m.x, m.y, m.z)].name : '-', pos: [p.pos.x, p.pos.y, p.pos.z].map(n => +n.toFixed(1)), inWater: p.inWater };
});
check('press and hold starts digging', dug.aiming && dug.mining);
check('held finger breaks the block and picks it up', dug.gained > 0, `+${dug.gained} items ${JSON.stringify(dug)}`);

// ---- a quick tap places what you are holding ----
await reset(-0.9);
const placed = await page.evaluate(async () => {
  const p = CM.game.player;
  const slot = p.inv.findIndex(s => s && s.id < 100 && s.n > 1);
  CM.game.selectSlot(slot);
  await new Promise(r => setTimeout(r, 120));
  const before = p.inv[slot].n;
  __touch('pointerdown', 600, 230);
  await new Promise(r => setTimeout(r, 90));
  __touch('pointerup', 600, 230);
  await new Promise(r => setTimeout(r, 300));
  return { before, after: p.inv[slot] ? p.inv[slot].n : 0 };
});
check('tap places a block from the hotbar', placed.after === placed.before - 1, `${placed.before} -> ${placed.after}`);

// ---- a drag should look around, not dig or place ----
await reset();
const looked = await page.evaluate(async () => {
  const p = CM.game.player, yaw0 = p.yaw;
  __touch('pointerdown', 600, 200);
  for (let i = 0; i < 10; i++) { __touch('pointermove', 600 + i * 14, 200); await new Promise(r => setTimeout(r, 30)); }
  __touch('pointerup', 740, 200);
  await new Promise(r => setTimeout(r, 200));
  return { turned: Math.abs(p.yaw - yaw0), mining: !!CM.game.mining };
});
check('dragging turns the view instead of digging', looked.turned > 0.1 && !looked.mining, `turned ${looked.turned.toFixed(2)} rad`);

// ---- sneak toggle and jump button ----
await reset();
const btns = await page.evaluate(async () => {
  __btn('act-sneak', 'pointerdown');
  await new Promise(r => setTimeout(r, 150));
  const sneak = CM.input.sneak && CM.game.player.sneaking;
  __btn('act-sneak', 'pointerdown');
  await new Promise(r => setTimeout(r, 100));
  const off = !CM.input.sneak;
  const y0 = CM.game.player.pos.y;
  __btn('act-jump', 'pointerdown');
  await new Promise(r => setTimeout(r, 320));
  __btn('act-jump', 'pointerup');
  return { sneak, off, rose: CM.game.player.pos.y - y0 };
});
check('sneak button toggles crouch', btns.sneak && btns.off);
check('jump button leaves the ground', btns.rose > 0.4, `+${btns.rose.toFixed(2)} blocks`);

// ---- the score ----
const music = await page.evaluate(async () => {
  CM.audioUnlock(); CM.music.start();
  await new Promise(r => setTimeout(r, 400));
  return { running: !!(window.__ac && window.__ac.state === 'running'), voices: window.__voices || 0 };
});
check('ambient score starts voices', music.voices > 0, `${music.voices} oscillators scheduled`);

await page.waitForTimeout(500);
await page.screenshot({ path: join(SHOTS, 'phone-03-after.png') });
console.log(results.join('\n'));
console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.slice(0, 10).join('\n') : '\nno page errors');
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
