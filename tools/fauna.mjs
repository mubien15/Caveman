// Spawns each species on demand, watches it behave, and shoots a portrait of it.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../dist/', import.meta.url).pathname;
const SHOTS = new URL('../shots/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURI(req.url.split('?')[0])); if (p === '/' || p === '/.') p = '/index.html';
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(0, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
const out = [];
const check = (label, ok, detail) => { out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) errors.push('check: ' + label); };

await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.CM && CM.game && CM.game.state === 'title', null, { timeout: 40000 });
await page.evaluate(() => CM.game.createWorld('Fauna', 'fauna-seed'));
await page.waitForFunction(() => CM.game.state === 'playing', null, { timeout: 40000 });
await page.waitForTimeout(1200);

// stand on open ground with a clear view
await page.evaluate(() => {
  const g = CM.game, p = g.player;
  const x = Math.floor(g.spawn.x) + 16, z = Math.floor(g.spawn.z) + 16;
  g.world.update(x, z);
  p.pos.set(x + 0.5, g.world.topY(x, z) + 0.02, z + 0.5);
  p.vel.set(0, 0, 0); p.pitch = -0.08; p.yaw = 0;
  g.clock = CM.DAY_LEN * 0.25;
});
await page.waitForTimeout(900);

for (const kind of ['boar', 'hare', 'elk', 'wolf']) {
  const res = await page.evaluate(async k => {
    const g = CM.game, p = g.player;
    g.mobs.clear();
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z) + 5;
    const y = g.world.topY(x, z);
    g.mobs.spawnGroup(k, x, y + 0.02, z);
    const born = g.mobs.list.length;
    const start = g.mobs.list.map(m => [m.pos.x, m.pos.z]);
    await new Promise(r => setTimeout(r, 5000));
    let moved = 0;
    g.mobs.list.forEach((m, i) => { if (start[i]) moved = Math.max(moved, Math.hypot(m.pos.x - start[i][0], m.pos.z - start[i][1])); });
    return { born, moved: +moved.toFixed(2), alive: g.mobs.list.length, h: g.mobs.list[0] ? g.mobs.list[0].spec.h : 0 };
  }, kind);
  check(`${kind} spawns as a group`, res.born >= 1, `${res.born} born, ${res.alive} alive, tallest ${res.h}`);
  check(`${kind} moves about`, res.moved > 0.2, `${res.moved} blocks`);
  await page.evaluate(() => { const m = CM.game.mobs.list[0]; if (m) { const p = CM.game.player; p.yaw = Math.atan2(m.pos.x - p.pos.x, m.pos.z - p.pos.z) + Math.PI; } });
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(SHOTS, `fauna-${kind}.png`) });
}

// fish need water: dig a pool rather than trusting this seed to have one
const fish = await page.evaluate(async () => {
  const g = CM.game, p = g.player, W = g.world;
  g.mobs.clear();
  const bx = Math.floor(p.pos.x) + 4, bz = Math.floor(p.pos.z);
  const top = W.topY(bx, bz);
  if (top < 2) return { found: false, why: 'no ground' };
  const floor = top - 3;
  for (let x = bx - 2; x <= bx + 2; x++) for (let z = bz - 2; z <= bz + 2; z++) {
    for (let y = floor; y < top; y++) W.set(x, y, z, CM.B.WATER);
    W.set(x, floor - 1, z, CM.B.STONE);
  }
  g.mobs.spawnGroup('fish', bx, floor + 1, bz);
  const born = g.mobs.list.length;
  const m0 = g.mobs.list[0];
  const start = m0 ? [m0.pos.x, m0.pos.z] : null;
  p.pos.set(bx + 0.5, top + 1.6, bz - 4.5); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = -0.3;
  await new Promise(r => setTimeout(r, 4000));
  const m = g.mobs.list[0];
  const wet = m ? (() => { const id = W.get(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.2), Math.floor(m.pos.z)); return id > 0 && CM.blocks[id].liquid; })() : false;
  return {
    found: true, born, alive: g.mobs.list.length, wet,
    swam: m && start ? +Math.hypot(m.pos.x - start[0], m.pos.z - start[1]).toFixed(2) : 0,
    y: m ? +m.pos.y.toFixed(2) : 0, surface: top,
  };
});
check('fish spawn in water', fish.found && fish.born > 0, fish.found ? `${fish.born} born, ${fish.alive} alive` : (fish.why || 'no pool'));
if (fish.found) check('fish stay in the water', fish.wet, `y ${fish.y} under a surface at ${fish.surface}`);
if (fish.found) check('fish swim about', fish.swam > 0.2, `${fish.swam} blocks`);
await page.screenshot({ path: join(SHOTS, 'fauna-fish.png') });

// wolves should hunt after dark
const hunt = await page.evaluate(async () => {
  const g = CM.game, p = g.player;
  g.mobs.clear();
  g.clock = CM.DAY_LEN * 0.75;
  const x = Math.floor(g.spawn.x), z = Math.floor(g.spawn.z);
  g.world.update(x, z);
  p.pos.set(x + 0.5, g.world.topY(x, z) + 0.02, z + 0.5); p.vel.set(0, 0, 0);
  p.health = 20;
  g.mobs.spawnGroup('wolf', x + 6, g.world.topY(x + 6, z) + 0.02, z);
  const d0 = Math.hypot(g.mobs.list[0].pos.x - p.pos.x, g.mobs.list[0].pos.z - p.pos.z);
  await new Promise(r => setTimeout(r, 5000));
  const m = g.mobs.list[0];
  return { closed: m ? +(d0 - Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z)).toFixed(2) : 0, health: p.health, dead: p.dead };
});
check('wolves close on the player at night', hunt.closed > 1 || hunt.health < 20, `closed ${hunt.closed} blocks, health ${hunt.health}`);
check('wolves draw blood', hunt.health < 20, `health ${hunt.health}/20`);
await page.screenshot({ path: join(SHOTS, 'fauna-wolf-night.png') });

// and the spawn table should read the clock
const table = await page.evaluate(() => {
  const g = CM.game, tally = n => { g.mobs.night = n; const c = {}; for (let i = 0; i < 400; i++) { const k = g.mobs.pickKind(); c[k] = (c[k] || 0) + 1; } return c; };
  return { day: tally(0), night: tally(1) };
});
console.log('  spawn mix by day:  ', JSON.stringify(table.day));
console.log('  spawn mix by night:', JSON.stringify(table.night));
check('wolves are a night thing', !table.day.wolf && table.night.wolf > 50);
check('daylight still brings grazers', table.day.boar > 50 && table.day.elk > 0);

// birds overhead by day, glimmering motes after dark
const amb = await page.evaluate(async () => {
  const g = CM.game, p = g.player;
  g.mobs.clear();
  const cx = Math.floor(g.spawn.x), cz = Math.floor(g.spawn.z);
  g.world.update(cx, cz);
  p.pos.set(cx + 0.5, g.world.topY(cx, cz) + 0.02, cz + 0.5); p.vel.set(0, 0, 0);
  g.clock = CM.DAY_LEN * 0.25;
  p.pitch = 0.85;                                   // look up
  await new Promise(r => setTimeout(r, 1500));
  const b = g.ambience.birds;
  const start = b.map(x => [x.group.position.x, x.group.position.z]);
  await new Promise(r => setTimeout(r, 1500));
  const flying = b.filter((x, i) => Math.hypot(x.group.position.x - start[i][0], x.group.position.z - start[i][1]) > 0.5).length;
  return { birds: b.length, visibleDay: b.filter(x => x.group.visible).length, flying, motes: g.ambience.motes.length };
});
check('birds fly overhead by day', amb.visibleDay > 0 && amb.flying > 0, `${amb.visibleDay}/${amb.birds} visible, ${amb.flying} moving`);
await page.screenshot({ path: join(SHOTS, 'fauna-birds.png') });

const nightAmb = await page.evaluate(async () => {
  const g = CM.game, p = g.player;
  g.clock = CM.DAY_LEN * 0.75;
  p.pitch = -0.1;
  await new Promise(r => setTimeout(r, 1800));
  const lit = g.ambience.moteMat.color.getHex();
  return { roosting: g.ambience.birds.every(b => !b.group.visible), moteColor: '#' + lit.toString(16), motesVisible: g.ambience.motes.filter(m => m.mesh.visible).length };
});
check('birds roost after dark', nightAmb.roosting);
check('motes glow at night', nightAmb.moteColor === '#ffe97a' && nightAmb.motesVisible > 0, `${nightAmb.motesVisible} lit, colour ${nightAmb.moteColor}`);
await page.screenshot({ path: join(SHOTS, 'fauna-fireflies.png') });

console.log(out.join('\n'));
console.log(errors.length ? `\nERRORS (${errors.length}):\n` + errors.slice(0, 8).join('\n') : '\nno page errors');
await browser.close(); server.close();
process.exit(errors.length ? 1 : 0);
