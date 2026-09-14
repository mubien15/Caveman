// Screenshots the HUD and menus at phone-portrait, phone-landscape and desktop sizes.
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
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const errors = [];

for (const [tag, opts] of [
  ['portrait', { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true }],
  ['desktop', { viewport: { width: 1100, height: 700 } }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.CM && CM.game && CM.game.state === 'title', null, { timeout: 40000 });
  await page.screenshot({ path: join(SHOTS, `lay-${tag}-title.png`) });
  await page.evaluate(() => CM.ui.openOptions('title'));
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `lay-${tag}-options.png`) });
  await page.evaluate(() => { CM.ui.hide('options'); CM.game.play(); });
  await page.waitForFunction(() => CM.game.state === 'playing');
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(SHOTS, `lay-${tag}-hud.png`) });
  // the bag, which is where crafting happens
  await page.evaluate(() => CM.game.toggleInventory());
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, `lay-${tag}-bag.png`) });
  await ctx.close();
  console.log(`  shot ${tag}`);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close(); server.close();
