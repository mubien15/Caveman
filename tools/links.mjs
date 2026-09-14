// Fetch every icon/manifest path the page references, exactly as written in the HTML.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('../dist/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURI(req.url.split('?')[0])); if (p === '/' || p === '/.') p = '/index.html';
  try { const b = await readFile(join(ROOT, p)); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('missing'); }
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const html = await readFile(join(ROOT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/href="([^"]+\.(?:png|webmanifest))"/g)].map(m => m[1]);
let bad = 0;
for (const ref of refs) {
  const r = await fetch(base + ref);
  const ok = r.status === 200;
  if (!ok) bad++;
  console.log(`  ${r.status} ${ref}  (${r.headers.get('content-type')}, ${(await r.arrayBuffer()).byteLength} bytes)`);
}
// and every icon the manifest itself points at
const man = await (await fetch(base + 'manifest.webmanifest')).json();
for (const i of man.icons) {
  const r = await fetch(base + i.src);
  if (r.status !== 200) bad++;
  console.log(`  ${r.status} ${i.src}  (from manifest, ${i.sizes}${i.purpose ? ', ' + i.purpose : ''})`);
}
console.log(bad ? `\n${bad} BROKEN` : '\nall icon references resolve');
server.close();
process.exit(bad ? 1 : 0);
