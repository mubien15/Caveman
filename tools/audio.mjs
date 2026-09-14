// Audio, under the same rules a phone imposes: no autoplay flag, a real user gesture only.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURI(req.url.split('?')[0])); if (p === '/' || p === '/.') p = '/index.html';
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(0, r));
// NOTE: deliberately no --autoplay-policy override; the context starts suspended, as on a phone.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  // Tap whatever reaches the speakers so levels can be measured, not just assumed.
  const origConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    try {
      if (dest && this.context && dest === this.context.destination) {
        if (!this.context.__an) { this.context.__an = this.context.createAnalyser(); this.context.__an.fftSize = 2048; }
        origConnect.call(this, this.context.__an);
        window.__ac = this.context;
      }
    } catch (e) { /* ignore */ }
    return origConnect.call(this, dest, ...rest);
  };
  window.__level = ms => new Promise(res => {
    const an = window.__ac && window.__ac.__an;
    if (!an) return res(null);
    const buf = new Float32Array(an.fftSize);
    let peak = 0, sum = 0, n = 0;
    const t0 = performance.now();
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) { const v = buf[i]; if (Math.abs(v) > peak) peak = Math.abs(v); sum += v * v; n++; }
      if (performance.now() - t0 < ms) requestAnimationFrame(tick);
      else res({ peak: +peak.toFixed(4), rms: +Math.sqrt(sum / n).toFixed(4) });
    };
    tick();
  });
  const AC = window.AudioContext || window.webkitAudioContext;
  window.__voices = 0; window.__buffers = 0;
  if (AC) {
    const osc = AC.prototype.createOscillator, buf = AC.prototype.createBufferSource;
    AC.prototype.createOscillator = function () { window.__voices++; window.__ac = this; return osc.call(this); };
    AC.prototype.createBufferSource = function () { window.__buffers++; window.__ac = this; return buf.call(this); };
  }
});
await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.CM && CM.game && CM.game.state === 'title', null, { timeout: 40000 });

const before = await page.evaluate(() => ({ voices: window.__voices, state: window.__ac ? window.__ac.state : 'none' }));
console.log('  at title, before any tap:', JSON.stringify(before));

// a real tap on Play — the only gesture a phone player makes before the world appears
await page.click('#btn-play');
await page.waitForFunction(() => CM.game.state === 'playing', null, { timeout: 20000 });
await page.waitForTimeout(3000);
const after = await page.evaluate(() => ({ voices: window.__voices, state: window.__ac ? window.__ac.state : 'none', musicOpt: CM.options.music }));
console.log('  3s after tapping Play:   ', JSON.stringify(after));

// walk around, which should produce footsteps
await page.evaluate(async () => {
  const p = CM.game.player;
  CM.input.keys.KeyW = true;
  await new Promise(r => setTimeout(r, 2500));
  CM.input.keys.KeyW = false;
});
const walked = await page.evaluate(() => ({ voices: window.__voices, buffers: window.__buffers }));
console.log('  after walking 2.5s:      ', JSON.stringify(walked));
// how loud is the music on its own?
const musicLvl = await page.evaluate(() => window.__level(12000));   // long enough to catch a phrase, not just the pad
console.log('  music alone (12s):       ', JSON.stringify(musicLvl));

// and how loud is a mining hit, for comparison
const sfxLvl = await page.evaluate(async () => {
  const p = window.__level(1600);
  for (let i = 0; i < 5; i++) { CM.sfx('break'); await new Promise(r => setTimeout(r, 260)); }
  return p;
});
console.log('  music + mining hits:     ', JSON.stringify(sfxLvl));
// footsteps should sit under the music, not over it
const stepLvl = await page.evaluate(async () => {
  const p = window.__level(1800);
  for (const g of ['grass', 'stone', 'sand', 'wood', 'grass']) { CM.sfx('step', g); await new Promise(r => setTimeout(r, 300)); }
  return p;
});
console.log('  music + footsteps:       ', JSON.stringify(stepLvl));
const landLvl = await page.evaluate(async () => {
  const p = window.__level(1200);
  CM.sfx('land', 'grass'); await new Promise(r => setTimeout(r, 400)); CM.sfx('land', 'stone');
  return p;
});
console.log('  music + landing:         ', JSON.stringify(landLvl));
if (musicLvl && sfxLvl && musicLvl.peak > 0) {
  console.log('  music peak vs mining peak:', (20 * Math.log10(musicLvl.peak / sfxLvl.peak)).toFixed(1) + ' dB');
}
console.log(errors.length ? 'ERRORS: ' + errors.join('; ') : '  no page errors');
await browser.close(); server.close();
