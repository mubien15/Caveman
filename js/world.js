// Caveman \u2014 terrain generation, chunk storage, meshing and block raycasts.
(function (CM) {
  const CS = CM.CHUNK, H = CM.HEIGHT, SEA = CM.SEA, B = CM.B;
  const LAYER = CS * CS;
  const key = (cx, cz) => cx + ',' + cz;

  // Face table: normal, the 4 corners (CCW from outside), shade, and the two tangent axes for AO.
  const FACES = [
    { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.8 },
    { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.8 },
    { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1.0 },
    { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.55 },
    { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.68 },
    { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.68 },
  ];
  FACES.forEach(f => {
    const axis = f.d[0] ? 0 : f.d[1] ? 1 : 2;
    const [u, v] = [0, 1, 2].filter(a => a !== axis);
    f.ao = f.c.map(c => {
      const du = [0, 0, 0], dv = [0, 0, 0];
      du[u] = c[u] ? 1 : -1; dv[v] = c[v] ? 1 : -1;
      return [du, dv, [du[0] + dv[0], du[1] + dv[1], du[2] + dv[2]]];
    });
  });
  const AO = [0.45, 0.65, 0.82, 1];

  class World {
    constructor(seed, scene, materials, data) {
      this.seed = seed;
      this.noise = CM.makeNoise(seed);
      this.scene = scene;
      this.mat = materials;
      this.chunks = new Map();
      this.edits = new Map();
      if (data && data.edits) for (const k in data.edits) this.edits.set(k, new Map(data.edits[k]));
      this.spawnChunk = (data && data.spawnChunk) || this.findSpawnChunk();
      this.needed = [];
      this.lastCenter = '';
    }

    heightAt(wx, wz) {
      const n = this.noise;
      const base = n.fbm2(wx * 0.012, wz * 0.012, 4);
      const hills = n.fbm2(wx * 0.004 + 300.5, wz * 0.004 - 200.5, 3);
      const h = 23 + base * 12 + Math.max(0, hills) * 34;
      return CM.clamp(Math.floor(h), 3, H - 12);
    }

    findSpawnChunk() {
      for (let r = 0; r < 12; r++) {
        for (let cx = -r; cx <= r; cx++) for (let cz = -r; cz <= r; cz++) {
          if (Math.max(Math.abs(cx), Math.abs(cz)) !== r) continue;
          const ox = cx * CS, oz = cz * CS;
          const hs = [[3, 3], [11, 3], [3, 14], [11, 14], [7, 8]].map(([x, z]) => this.heightAt(ox + x, oz + z));
          const lo = Math.min(...hs), hi = Math.max(...hs);
          if (lo > SEA + 1 && hi < 38 && hi - lo <= 3) return [cx, cz];
        }
      }
      return [0, 0];
    }

    generate(cx, cz) {
      const data = new Uint8Array(LAYER * H);
      const n = this.noise, ox = cx * CS, oz = cz * CS;
      const heights = new Int16Array(LAYER);
      for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
        const wx = ox + x, wz = oz + z;
        const h = this.heightAt(wx, wz);
        heights[x + z * CS] = h;
        const shore = h <= SEA + 1;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = B.BEDROCK;
          else if (y < h - 3) id = B.STONE;
          else if (y < h) id = shore ? B.SAND : B.DIRT;
          else id = shore ? (h < SEA - 1 && n.hash2(wx, wz) < 0.35 ? B.CLAY : B.SAND) : h > 42 ? B.STONE : B.GRASS;
          if (id === B.STONE) {
            const gx = Math.floor(wx / 2), gy = Math.floor(y / 2), gz = Math.floor(wz / 2);
            if (n.hash3(gx, gy, gz) < 0.04 && n.hash3(wx, y, wz) < 0.6) id = n.hash3(gx + 7, gy, gz) < 0.5 ? B.FLINT_ORE : B.COAL_ORE;
          }
          if (y > 2 && (y < h - 3 || h > SEA + 2) && n.n3(wx * 0.045, y * 0.07, wz * 0.045) > 0.3) id = B.AIR;
          data[x + z * CS + y * LAYER] = id;
        }
        for (let y = h + 1; y <= SEA; y++) data[x + z * CS + y * LAYER] = B.WATER;
      }

      const isSpawn = cx === this.spawnChunk[0] && cz === this.spawnChunk[1];
      if (isSpawn) this.buildHut(data, heights);
      else {
        for (let z = 2; z < CS - 2; z++) for (let x = 2; x < CS - 2; x++) {
          const h = heights[x + z * CS];
          if (data[x + z * CS + h * LAYER] !== B.GRASS || n.hash2(ox + x + 5000, oz + z) > 0.02) continue;
          const th = 4 + (n.hash2(ox + x, oz + z + 77) < 0.5 ? 1 : 0), top = h + th;
          if (top + 2 >= H) continue;
          for (let y = h + 1; y <= top; y++) data[x + z * CS + y * LAYER] = B.LOG;
          for (let dy = -2; dy <= 1; dy++) {
            const r = dy >= 0 ? 1 : 2;
            for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
              if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
              if (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
              const i = x + dx + (z + dz) * CS + (top + dy) * LAYER;
              if (data[i] === B.AIR) data[i] = B.LEAVES;
            }
          }
        }
      }

      const e = this.edits.get(key(cx, cz));
      if (e) for (const [i, id] of e) data[i] = id;
      return data;
    }

    // A mud-brick hut with a thatched roof and a campfire out front, in the spawn chunk.
    buildHut(data, heights) {
      const set = (x, y, z, id) => { if (x >= 0 && x < CS && z >= 0 && z < CS && y >= 0 && y < H) data[x + z * CS + y * LAYER] = id; };
      const fy = heights[7 + 8 * CS] + 1;
      for (let z = 2; z <= 15; z++) for (let x = 2; x <= 12; x++) {
        for (let y = 1; y < fy; y++) { const i = x + z * CS + y * LAYER; if (data[i] === B.AIR || data[i] === B.WATER) data[i] = B.DIRT; }
        set(x, fy - 1, z, B.GRASS);
        for (let y = fy; y < fy + 9; y++) set(x, y, z, B.AIR);
      }
      for (let z = 4; z <= 10; z++) for (let x = 4; x <= 10; x++) {
        set(x, fy - 1, z, B.DIRT);
        const edge = x === 4 || x === 10 || z === 4 || z === 10;
        if (!edge) continue;
        const corner = (x === 4 || x === 10) && (z === 4 || z === 10);
        for (let y = fy; y < fy + 3; y++) set(x, y, z, corner ? B.LOG : B.MUDBRICK);
      }
      set(7, fy, 10, B.AIR); set(7, fy + 1, 10, B.AIR);
      set(4, fy + 1, 7, B.AIR); set(10, fy + 1, 7, B.AIR); set(7, fy + 1, 4, B.AIR);
      for (let L = 0; L < 5; L++) for (let z = 3 + L; z <= 11 - L; z++) for (let x = 3 + L; x <= 11 - L; x++) set(x, fy + 3 + L, z, B.THATCH);
      set(7, fy - 1, 11, B.COBBLE); set(7, fy - 1, 12, B.COBBLE); set(7, fy - 1, 13, B.COBBLE);
      set(10, fy, 13, B.CAMPFIRE); set(11, fy, 12, B.LOG); set(9, fy, 12, B.LOG);
      this.hutFloor = fy;
    }

    get(x, y, z) {
      if (y < 0) return B.BEDROCK;
      if (y >= H) return B.AIR;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.chunks.get(key(cx, cz));
      if (!c) return -1;
      return c.data[(x - cx * CS) + (z - cz * CS) * CS + y * LAYER];
    }

    isSolid(x, y, z) { const id = this.get(x, y, z); return id < 0 || CM.blocks[id].solid; }

    set(x, y, z, id) {
      if (y < 0 || y >= H) return;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.chunks.get(key(cx, cz));
      if (!c) return;
      const lx = x - cx * CS, lz = z - cz * CS, i = lx + lz * CS + y * LAYER;
      c.data[i] = id;
      const k = key(cx, cz);
      if (!this.edits.has(k)) this.edits.set(k, new Map());
      this.edits.get(k).set(i, id);
      const dxs = [0], dzs = [0];
      if (lx === 0) dxs.push(-1); if (lx === CS - 1) dxs.push(1);
      if (lz === 0) dzs.push(-1); if (lz === CS - 1) dzs.push(1);
      for (const dx of dxs) for (const dz of dzs) {
        const nc = this.chunks.get(key(cx + dx, cz + dz));
        if (nc && nc.meshed) this.buildMesh(nc);
      }
    }

    topY(wx, wz) {
      for (let y = H - 1; y >= 0; y--) {
        const id = this.get(wx, y, wz);
        if (id < 0) return -1;
        if (id !== B.AIR && id !== B.WATER && id !== B.LEAVES) return y + 1;
      }
      return 1;
    }

    buildMesh(c) {
      const P = [], C = [], U = [], IX = [];
      const WP = [], WC = [], WU = [], WI = [];
      const data = c.data, ox = c.cx * CS, oz = c.cz * CS, blocks = CM.blocks, N = CM.ATLAS_N, eps = 0.01;
      const get = (x, y, z) => {
        if (y < 0) return B.BEDROCK;
        if (y >= H) return B.AIR;
        if (x >= 0 && x < CS && z >= 0 && z < CS) return data[x + z * CS + y * LAYER];
        const id = this.get(ox + x, y, oz + z);
        return id < 0 ? B.STONE : id;
      };
      const opaq = (x, y, z) => blocks[get(x, y, z)].opaque;
      const ao = [0, 0, 0, 0];

      for (let y = 0; y < H; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
        const id = data[x + z * CS + y * LAYER];
        if (!id) continue;
        const bd = blocks[id];
        const liquid = bd.liquid;
        const waterTop = liquid && !blocks[get(x, y + 1, z)].liquid;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f], nx = x + F.d[0], ny = y + F.d[1], nz = z + F.d[2];
          const nid = get(nx, ny, nz);
          let show;
          if (nid === B.AIR) show = true;
          else { const nb = blocks[nid]; show = nb.opaque ? false : nid === id ? bd.leaves : !(liquid && nb.liquid); }
          if (!show) continue;

          const t = f === 2 ? bd.tex[0] : f === 3 ? bd.tex[1] : bd.tex[2];
          const col = t % N, row = (t / N) | 0;
          const u0 = (col + eps) / N, u1 = (col + 1 - eps) / N, vt = 1 - (row + eps) / N, vb = 1 - (row + 1 - eps) / N;
          const pos = liquid ? WP : P, cols = liquid ? WC : C, uvs = liquid ? WU : U, idx = liquid ? WI : IX;
          const base = pos.length / 3;
          for (let k = 0; k < 4; k++) {
            const cr = F.c[k];
            let lvl = 3;
            if (!liquid) {
              const o = F.ao[k];
              const s1 = opaq(nx + o[0][0], ny + o[0][1], nz + o[0][2]) ? 1 : 0;
              const s2 = opaq(nx + o[1][0], ny + o[1][1], nz + o[1][2]) ? 1 : 0;
              const cc = opaq(nx + o[2][0], ny + o[2][1], nz + o[2][2]) ? 1 : 0;
              lvl = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            }
            ao[k] = lvl;
            const yy = waterTop && cr[1] === 1 ? y + 0.88 : y + cr[1];
            pos.push(x + cr[0], yy, z + cr[2]);
            const b = F.s * AO[lvl];
            cols.push(b, b, b);
          }
          uvs.push(u0, vb, u1, vb, u1, vt, u0, vt);
          if (ao[0] + ao[2] >= ao[1] + ao[3]) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          else idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
        }
      }
      this.disposeMeshes(c);
      c.mesh = this.makeMesh(P, C, U, IX, this.mat.opaque, ox, oz);
      c.water = this.makeMesh(WP, WC, WU, WI, this.mat.water, ox, oz);
      if (c.water) c.water.renderOrder = 1;
      c.meshed = true;
    }

    makeMesh(P, C, U, IX, mat, ox, oz) {
      if (!IX.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(IX);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.position.set(ox, 0, oz);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.scene.add(m);
      return m;
    }

    disposeMeshes(c) {
      for (const k of ['mesh', 'water']) if (c[k]) { this.scene.remove(c[k]); c[k].geometry.dispose(); c[k] = null; }
    }

    // Stream chunks in around (px, pz): generate a ring beyond the render radius, mesh inside it.
    update(px, pz) {
      const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS), R = CM.options.renderDist;
      const center = pcx + ',' + pcz + ',' + R;
      if (center !== this.lastCenter) {
        this.lastCenter = center;
        this.needed = [];
        for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) this.needed.push([pcx + dx, pcz + dz, dx * dx + dz * dz, Math.max(Math.abs(dx), Math.abs(dz))]);
        this.needed.sort((a, b) => a[2] - b[2]);
        for (const c of [...this.chunks.values()]) {
          if (Math.abs(c.cx - pcx) > R + 2 || Math.abs(c.cz - pcz) > R + 2) { this.disposeMeshes(c); this.chunks.delete(key(c.cx, c.cz)); }
        }
      }
      let gen = 2, mesh = 2;
      for (const [cx, cz] of this.needed) {
        if (gen <= 0) break;
        const k = key(cx, cz);
        if (!this.chunks.has(k)) { this.chunks.set(k, { cx, cz, data: this.generate(cx, cz), mesh: null, water: null, meshed: false }); gen--; }
      }
      for (const [cx, cz, , cheb] of this.needed) {
        if (mesh <= 0) break;
        if (cheb > R) continue;
        const c = this.chunks.get(key(cx, cz));
        if (!c || c.meshed) continue;
        let ready = true;
        for (let dz = -1; dz <= 1 && ready; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(key(cx + dx, cz + dz))) { ready = false; break; }
        if (!ready) continue;
        this.buildMesh(c);
        mesh--;
      }
    }

    progress(px, pz, radius) {
      const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
      let done = 0, total = 0;
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        total++;
        const c = this.chunks.get(key(pcx + dx, pcz + dz));
        if (c && c.meshed) done++;
      }
      return done / total;
    }

    raycast(ox, oy, oz, dx, dy, dz, maxDist) {
      let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const tdx = dx === 0 ? Infinity : Math.abs(1 / dx), tdy = dy === 0 ? Infinity : Math.abs(1 / dy), tdz = dz === 0 ? Infinity : Math.abs(1 / dz);
      let tx = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tdx;
      let ty = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tdy;
      let tz = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tdz;
      let nx = 0, ny = 0, nz = 0, t = 0;
      while (t <= maxDist) {
        const id = this.get(x, y, z);
        if (id > 0 && !CM.blocks[id].liquid) return { x, y, z, id, nx, ny, nz, dist: t };
        if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
        else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
        else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
      }
      return null;
    }

    serializeEdits() {
      const out = {};
      for (const [k, m] of this.edits) out[k] = Array.from(m.entries());
      return out;
    }

    dispose() {
      for (const c of this.chunks.values()) this.disposeMeshes(c);
      this.chunks.clear();
    }
  }

  CM.World = World;
})(window.CM);
