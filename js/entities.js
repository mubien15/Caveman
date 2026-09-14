// Caveman \u2014 collision, the player, the caveman model, boars and break particles.
(function (CM) {
  const B = CM.B, I = CM.I, EPS = 0.001;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

  // Axis-separated AABB sweep against the voxel grid. p = feet centre.
  CM.sweep = function (world, p, v, dt, hw, h) {
    const res = { ground: false, hitH: false };
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.35));
    const s = dt / steps;
    function axis(a, d) {
      if (!d) return;
      if (a === 0) p.x += d; else if (a === 1) p.y += d; else p.z += d;
      const x0 = Math.floor(p.x - hw), x1 = Math.floor(p.x + hw), y0 = Math.floor(p.y), y1 = Math.floor(p.y + h);
      const z0 = Math.floor(p.z - hw), z1 = Math.floor(p.z + hw);
      let lo = Infinity, hi = -Infinity;
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (!world.isSolid(x, y, z)) continue;
        const c = a === 0 ? x : a === 1 ? y : z;
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
      if (lo === Infinity) return;
      if (a === 1) { if (d > 0) p.y = lo - h - EPS; else { p.y = hi + 1 + EPS; res.ground = true; } v.y = 0; }
      else if (a === 0) { p.x = d > 0 ? lo - hw - EPS : hi + 1 + hw + EPS; v.x = 0; res.hitH = true; }
      else { p.z = d > 0 ? lo - hw - EPS : hi + 1 + hw + EPS; v.z = 0; res.hitH = true; }
    }
    for (let i = 0; i < steps; i++) { axis(0, v.x * s); axis(2, v.z * s); axis(1, v.y * s); }
    return res;
  };

  CM.rayBox = function (ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    let tmin = 0, tmax = Infinity;
    const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo[a] || o[a] > hi[a]) return null; continue; }
      let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    return tmin;
  };

  // ---------- shaded box parts (tinted by daylight in main.js) ----------
  CM.tintMats = [];
  const matCache = new Map(), geoCache = new Map();
  function shadedMats(color) {
    if (matCache.has(color)) return matCache.get(color);
    const arr = [0.8, 0.8, 1, 0.55, 0.68, 0.68].map(s => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(s) });
      m.userData.base = m.color.clone();
      CM.tintMats.push(m);
      return m;
    });
    matCache.set(color, arr);
    return arr;
  }
  function part(parent, w, h, d, color, x, y, z) {
    const k = w + '|' + h + '|' + d;
    if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
    const m = new THREE.Mesh(geoCache.get(k), shadedMats(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

  // Our caveman: shaggy hair, beard, fur tunic, bone hair-tie. Built facing +z.
  CM.makeCaveman = function () {
    const g = new THREE.Group();
    const SKIN = 0xc98d5a, HAIR = 0x3b2414, FUR = 0x8b5a2b, FUR2 = 0x6a4220, BONE = 0xefe4cf;
    const legL = pivot(g, -0.14, 0.72, 0), legR = pivot(g, 0.14, 0.72, 0);
    for (const leg of [legL, legR]) { part(leg, 0.24, 0.72, 0.26, SKIN, 0, -0.36, 0); part(leg, 0.27, 0.12, 0.3, FUR2, 0, -0.66, 0.02); }
    part(g, 0.58, 0.64, 0.34, FUR, 0, 1.04, 0);
    part(g, 0.62, 0.14, 0.38, FUR2, 0, 0.76, 0);
    part(g, 0.16, 0.12, 0.02, FUR2, -0.12, 1.16, 0.175);
    part(g, 0.12, 0.1, 0.02, FUR2, 0.15, 0.94, 0.175);
    const armL = pivot(g, -0.41, 1.34, 0), armR = pivot(g, 0.41, 1.34, 0);
    part(armL, 0.22, 0.64, 0.24, SKIN, 0, -0.3, 0);
    part(armR, 0.22, 0.64, 0.24, SKIN, 0, -0.3, 0);
    const head = pivot(g, 0, 1.38, 0);
    part(head, 0.5, 0.5, 0.48, SKIN, 0, 0.25, 0);
    part(head, 0.56, 0.16, 0.52, HAIR, 0, 0.54, -0.01);
    part(head, 0.56, 0.46, 0.1, HAIR, 0, 0.3, -0.25);
    part(head, 0.08, 0.32, 0.46, HAIR, -0.27, 0.34, -0.02);
    part(head, 0.08, 0.32, 0.46, HAIR, 0.27, 0.34, -0.02);
    part(head, 0.42, 0.22, 0.08, HAIR, 0, 0.06, 0.25);
    part(head, 0.44, 0.06, 0.06, HAIR, 0, 0.38, 0.25);
    part(head, 0.09, 0.07, 0.02, 0xffffff, -0.11, 0.29, 0.245);
    part(head, 0.09, 0.07, 0.02, 0xffffff, 0.11, 0.29, 0.245);
    part(head, 0.045, 0.07, 0.02, 0x1d1b18, -0.09, 0.29, 0.256);
    part(head, 0.045, 0.07, 0.02, 0x1d1b18, 0.13, 0.29, 0.256);
    part(head, 0.1, 0.1, 0.06, 0xb57a4a, 0, 0.2, 0.27);
    part(head, 0.36, 0.06, 0.06, BONE, 0, 0.66, 0.02);
    part(head, 0.08, 0.1, 0.1, BONE, -0.19, 0.66, 0.02);
    part(head, 0.08, 0.1, 0.1, BONE, 0.19, 0.66, 0.02);
    return { group: g, legL, legR, armL, armR, head };
  };

  // ---------- player ----------
  class Player {
    constructor(world) {
      this.world = world;
      this.pos = new THREE.Vector3();
      this.vel = new THREE.Vector3();
      this.yaw = 0; this.pitch = 0;
      this.onGround = false; this.inWater = false; this.headInWater = false;
      this.health = 20; this.hunger = 20;
      this.fallTop = null; this.hungerT = 0; this.regenT = 0; this.starveT = 0; this.stepT = 0; this.hurtT = 0;
      this.inv = new Array(36).fill(null); this.sel = 0; this.invVersion = 0;
      this.dead = false; this.deathCause = ''; this.placed = false; this.moveAmt = 0;
      this.sneaking = false; this.sprinting = false;
    }
    giveStarter() {
      this.inv = new Array(36).fill(null);
      this.addItem(I.CLUB, 1); this.addItem(I.COOKED_MEAT, 3); this.addItem(B.TORCH, 8); this.addItem(B.MUDBRICK, 24); this.addItem(B.THATCH, 16); this.addItem(B.PLANKS, 8);
    }
    serialize() { return { x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch, health: this.health, hunger: this.hunger, inv: this.inv, sel: this.sel }; }
    load(d) {
      this.pos.set(num(d.x, 0), num(d.y, 40), num(d.z, 0));
      this.yaw = num(d.yaw, 0); this.pitch = num(d.pitch, 0);
      this.health = num(d.health, 20); this.hunger = num(d.hunger, 20);
      this.inv = Array.isArray(d.inv) && d.inv.length === 36 ? d.inv : new Array(36).fill(null);
      this.sel = num(d.sel, 0); this.placed = true; this.invVersion++;
    }
    addItem(id, n) {
      const st = CM.info(id).stack;
      for (let i = 0; i < 36 && n > 0; i++) { const s = this.inv[i]; if (s && s.id === id && s.n < st) { const k = Math.min(n, st - s.n); s.n += k; n -= k; } }
      for (let i = 0; i < 36 && n > 0; i++) if (!this.inv[i]) { const k = Math.min(n, st); this.inv[i] = { id, n: k }; n -= k; }
      this.invVersion++;
      return n;
    }
    count(id) { let c = 0; for (const s of this.inv) if (s && s.id === id) c += s.n; return c; }
    remove(id, n) {
      for (let i = 35; i >= 0 && n > 0; i--) { const s = this.inv[i]; if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) this.inv[i] = null; } }
      this.invVersion++;
    }
    spaceFor(id) { const st = CM.info(id).stack; let sp = 0; for (const s of this.inv) sp += !s ? st : s.id === id ? st - s.n : 0; return sp; }
    held() { return this.inv[this.sel]; }
    takeSelected() { const s = this.inv[this.sel]; if (!s) return; s.n--; if (s.n <= 0) this.inv[this.sel] = null; this.invVersion++; }

    update(dt, inp) {
      const W = this.world, p = this.pos, v = this.vel;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      let mx = -sin * inp.fwd + cos * inp.strafe, mz = -cos * inp.fwd - sin * inp.strafe;
      const len = Math.hypot(mx, mz);
      if (len > 1) { mx /= len; mz /= len; }
      const liquidAt = yy => { const id = W.get(Math.floor(p.x), Math.floor(yy), Math.floor(p.z)); return id > 0 && CM.blocks[id].liquid; };
      this.inWater = liquidAt(p.y + 0.2) || liquidAt(p.y + 1.0);
      this.headInWater = liquidAt(p.y + 1.62);
      this.sneaking = !!inp.sneak && this.onGround && !this.inWater;
      this.sprinting = !!inp.sprint && !this.sneaking && len > 0.6 && inp.fwd > 0 && this.hunger > 6;
      const speed = this.inWater ? 2.6 : this.sneaking ? 1.9 : this.sprinting ? 6.2 : 4.3;
      const k = Math.min(1, (this.onGround ? 16 : this.inWater ? 6 : 5) * dt);
      v.x += (mx * speed - v.x) * k;
      v.z += (mz * speed - v.z) * k;
      const ground = CM.groundSound(W.get(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)));
      if (this.inWater) { v.y -= 10 * dt; v.y *= Math.max(0, 1 - 3 * dt); if (inp.jump) v.y = Math.min(v.y + 26 * dt, 3.4); }
      else { v.y = Math.max(-45, v.y - 28 * dt); if (inp.jump && this.onGround) { v.y = 8.6; CM.sfx('jump', ground); } }
      if (inp.autoJump && this.onGround && !this.inWater && len > 0.2) {
        const bx = Math.floor(p.x), bz = Math.floor(p.z);
        const ax = Math.floor(p.x + (mx / Math.max(len, 1e-6)) * 0.6), az = Math.floor(p.z + (mz / Math.max(len, 1e-6)) * 0.6), fy = Math.floor(p.y + 0.01);
        if ((ax !== bx || az !== bz) && W.isSolid(ax, fy, az) && !W.isSolid(ax, fy + 1, az) && !W.isSolid(ax, fy + 2, az) && !W.isSolid(bx, fy + 2, bz)) v.y = 8.6;
      }
      if (this.sneaking) {
        const footing = (x, z) => {
          for (let dz = -1; dz <= 1; dz += 2) for (let dx = -1; dx <= 1; dx += 2) {
            if (W.isSolid(Math.floor(x + dx * 0.29), Math.floor(p.y - 0.05), Math.floor(z + dz * 0.29))) return true;
          }
          return false;
        };
        if (v.x && !footing(p.x + v.x * dt, p.z)) v.x = 0;
        if (v.z && !footing(p.x, p.z + v.z * dt)) v.z = 0;
      }
      const wasOnGround = this.onGround;
      const r = CM.sweep(W, p, v, dt, 0.3, 1.8);
      this.onGround = r.ground;
      if (!wasOnGround && this.onGround && !this.inWater) CM.sfx('land', ground);

      if (this.onGround || this.inWater) {
        if (this.fallTop !== null && !this.inWater) { const d = this.fallTop - p.y; if (d > 3.5) this.hurt(Math.floor(d - 3), 'You fell from a great height.'); }
        this.fallTop = null;
      } else this.fallTop = this.fallTop === null ? p.y : Math.max(this.fallTop, p.y);
      if (p.y < -20) this.hurt(100, 'You fell out of the world.');

      this.moveAmt = Math.hypot(v.x, v.z) / 4.3;
      this.hungerT += dt * (1 + this.moveAmt * 0.6 + (this.sprinting ? 1.4 : 0));
      if (this.hungerT > 32) { this.hungerT = 0; if (this.hunger > 0) this.hunger--; }
      if (this.hunger >= 16 && this.health < 20) { this.regenT += dt; if (this.regenT > 3) { this.regenT = 0; this.health++; this.hungerT += 6; } } else this.regenT = 0;
      if (this.hunger <= 0) { this.starveT += dt; if (this.starveT > 4) { this.starveT = 0; this.hurt(1, 'You starved. Hunt boar and roast the meat.'); } } else this.starveT = 0;
      if (this.onGround && this.moveAmt > 0.3 && !this.sneaking) { this.stepT -= dt * this.moveAmt; if (this.stepT <= 0) { this.stepT = this.sprinting ? 0.32 : 0.42; CM.sfx('step', ground); } }
      if (this.hurtT > 0) this.hurtT -= dt;
    }
    hurt(n, cause) {
      if (this.dead) return;
      this.health = Math.max(0, this.health - n);
      this.hurtT = 0.35;
      CM.sfx('hurt');
      if (this.health <= 0) { this.dead = true; this.deathCause = cause || 'The wild got you.'; }
    }
  }
  CM.Player = Player;

  // ---------- animals ----------
  // One body plan serves them all: a species supplies its size, its temperament and its model,
  // and the shared update below walks it, startles it, and animates its legs.
  function boarModel(g) {
    const HIDE = 0x6b4a33, DARK = 0x3f2a1c;
    part(g, 0.66, 0.52, 1.0, HIDE, 0, 0.62, 0);
    part(g, 0.18, 0.1, 0.86, DARK, 0, 0.92, -0.02);
    const head = pivot(g, 0, 0.66, 0.5);
    part(head, 0.5, 0.46, 0.4, 0x5e412c, 0, 0, 0.16);
    part(head, 0.28, 0.22, 0.12, 0xc98f7a, 0, -0.06, 0.41);
    part(head, 0.05, 0.14, 0.05, 0xefe4cf, -0.17, -0.04, 0.39);
    part(head, 0.05, 0.14, 0.05, 0xefe4cf, 0.17, -0.04, 0.39);
    part(head, 0.07, 0.07, 0.02, 0x111111, -0.14, 0.1, 0.37);
    part(head, 0.07, 0.07, 0.02, 0x111111, 0.14, 0.1, 0.37);
    part(head, 0.1, 0.14, 0.06, DARK, -0.2, 0.28, 0.1);
    part(head, 0.1, 0.14, 0.06, DARK, 0.2, 0.28, 0.1);
    const legs = [[-0.2, 0.34], [0.2, 0.34], [-0.2, -0.34], [0.2, -0.34]].map(([lx, lz]) => {
      const pv = pivot(g, lx, 0.38, lz); part(pv, 0.16, 0.38, 0.16, 0x4f3625, 0, -0.19, 0); return pv;
    });
    return { head, legs };
  }

  function hareModel(g) {
    const FUR = 0xa89076, PALE = 0xd8c9ae;
    part(g, 0.32, 0.3, 0.5, FUR, 0, 0.3, 0);
    part(g, 0.2, 0.14, 0.14, PALE, 0, 0.22, -0.28);      // scut
    const head = pivot(g, 0, 0.42, 0.22);
    part(head, 0.26, 0.24, 0.26, FUR, 0, 0.04, 0.06);
    part(head, 0.07, 0.28, 0.04, FUR, -0.08, 0.28, 0.02);  // ears
    part(head, 0.07, 0.28, 0.04, FUR, 0.08, 0.28, 0.02);
    part(head, 0.05, 0.05, 0.02, 0x1a1a1a, -0.1, 0.06, 0.19);
    part(head, 0.05, 0.05, 0.02, 0x1a1a1a, 0.1, 0.06, 0.19);
    part(head, 0.08, 0.06, 0.04, 0xc98f7a, 0, -0.02, 0.2);
    const legs = [[-0.1, 0.16], [0.1, 0.16], [-0.12, -0.16], [0.12, -0.16]].map(([lx, lz], i) => {
      const pv = pivot(g, lx, i < 2 ? 0.2 : 0.26, lz);
      part(pv, i < 2 ? 0.08 : 0.12, i < 2 ? 0.2 : 0.26, i < 2 ? 0.1 : 0.18, FUR, 0, i < 2 ? -0.1 : -0.13, 0);
      return pv;
    });
    return { head, legs };
  }

  function elkModel(g) {
    const COAT = 0x7b5a3a, DARK = 0x4a3423, BONE = 0xd9cdb4;
    part(g, 0.6, 0.62, 1.3, COAT, 0, 1.32, 0);
    part(g, 0.34, 0.56, 0.34, COAT, 0, 1.68, 0.5);         // neck
    part(g, 0.2, 0.16, 0.16, DARK, 0, 1.16, -0.7);         // tail
    const head = pivot(g, 0, 1.94, 0.62);
    part(head, 0.3, 0.3, 0.34, COAT, 0, 0, 0.1);
    part(head, 0.2, 0.18, 0.22, DARK, 0, -0.06, 0.28);
    part(head, 0.06, 0.06, 0.02, 0x1a1a1a, -0.12, 0.04, 0.24);
    part(head, 0.06, 0.06, 0.02, 0x1a1a1a, 0.12, 0.04, 0.24);
    for (const sx of [-1, 1]) {                            // antlers
      part(head, 0.05, 0.34, 0.05, BONE, sx * 0.11, 0.26, 0.02);
      part(head, 0.05, 0.05, 0.22, BONE, sx * 0.11, 0.4, 0.14);
      part(head, 0.18, 0.05, 0.05, BONE, sx * 0.2, 0.36, -0.04);
    }
    const legs = [[-0.22, 0.45], [0.22, 0.45], [-0.22, -0.45], [0.22, -0.45]].map(([lx, lz]) => {
      const pv = pivot(g, lx, 1.02, lz); part(pv, 0.14, 1.02, 0.14, DARK, 0, -0.51, 0); return pv;
    });
    return { head, legs };
  }

  function wolfModel(g) {
    const COAT = 0x6d6a64, DARK = 0x494640, PALE = 0xb6b0a4;
    part(g, 0.42, 0.42, 0.95, COAT, 0, 0.66, 0);
    part(g, 0.3, 0.2, 0.6, PALE, 0, 0.5, 0.05);            // pale belly
    const tail = pivot(g, 0, 0.76, -0.48);
    part(tail, 0.16, 0.16, 0.42, COAT, 0, 0.02, -0.2);
    const head = pivot(g, 0, 0.78, 0.44);
    part(head, 0.34, 0.32, 0.32, COAT, 0, 0, 0.1);
    part(head, 0.18, 0.16, 0.24, DARK, 0, -0.06, 0.32);    // snout
    part(head, 0.1, 0.16, 0.04, COAT, -0.12, 0.22, 0.02);  // ears
    part(head, 0.1, 0.16, 0.04, COAT, 0.12, 0.22, 0.02);
    part(head, 0.06, 0.05, 0.02, 0xe8c05a, -0.1, 0.05, 0.25);
    part(head, 0.06, 0.05, 0.02, 0xe8c05a, 0.1, 0.05, 0.25);
    const legs = [[-0.15, 0.3], [0.15, 0.3], [-0.15, -0.32], [0.15, -0.32]].map(([lx, lz]) => {
      const pv = pivot(g, lx, 0.46, lz); part(pv, 0.13, 0.46, 0.13, DARK, 0, -0.23, 0); return pv;
    });
    return { head, legs, tail };
  }

  function fishModel(g) {
    const BODY = 0x4f86a8, BELLY = 0xcfd8cf;
    part(g, 0.22, 0.26, 0.5, BODY, 0, 0.15, 0);
    part(g, 0.16, 0.1, 0.34, BELLY, 0, 0.06, 0.02);
    part(g, 0.04, 0.2, 0.06, BODY, 0, 0.3, -0.1);          // dorsal
    const tail = pivot(g, 0, 0.15, -0.26);
    part(tail, 0.04, 0.22, 0.18, BODY, 0, 0, -0.08);
    part(g, 0.04, 0.05, 0.02, 0x111111, -0.1, 0.19, 0.21);
    part(g, 0.04, 0.05, 0.02, 0x111111, 0.1, 0.19, 0.21);
    return { head: null, legs: [], tail };
  }

  const SPECIES = {
    boar: { hp: 6, walk: 1.4, flee: 4.4, hw: 0.35, h: 0.95, restless: 0.55, voice: 'squeal', idle: 'hit',
      drops: [[I.RAW_MEAT, 1, 2]], model: boarModel, day: 3, night: 1, herd: [1, 3], on: 'grass' },
    hare: { hp: 3, walk: 2.4, flee: 6.4, hw: 0.22, h: 0.45, restless: 0.7, hops: true, voice: 'squeal', shy: 7,
      drops: [[I.RAW_MEAT, 0, 1]], model: hareModel, day: 3, night: 1, herd: [1, 2], on: 'grass' },
    elk: { hp: 12, walk: 1.1, flee: 5, hw: 0.45, h: 1.9, restless: 0.5, voice: 'bleat', idle: 'bleat', shy: 8,
      drops: [[I.RAW_MEAT, 2, 3]], model: elkModel, day: 2, night: 0.5, herd: [2, 3], on: 'grass' },
    wolf: { hp: 9, walk: 1.7, flee: 0, chase: 4.9, hunt: true, damage: 2, bite: 1.7, hw: 0.35, h: 0.9, restless: 0.6,
      voice: 'growl', idle: 'howl', drops: [[I.RAW_MEAT, 1, 1]], model: wolfModel,
      day: 0, night: 3, herd: [1, 2], on: 'any' },
    fish: { hp: 3, walk: 1.6, flee: 3.4, hw: 0.2, h: 0.4, water: true, voice: 'pop',
      drops: [[I.RAW_MEAT, 1, 1]], model: fishModel, day: 2, night: 2, herd: [2, 4], on: 'water' },
  };
  CM.SPECIES = SPECIES;

  class Creature {
    constructor(scene, kind, x, y, z) {
      this.kind = kind;
      this.spec = SPECIES[kind];
      this.pos = new THREE.Vector3(x, y, z);
      this.vel = new THREE.Vector3();
      this.yaw = Math.random() * Math.PI * 2; this.yawTarget = this.yaw;
      this.health = this.spec.hp;
      this.think = Math.random() * 2; this.walking = Math.random() < (this.spec.restless || 0.5); this.fleeT = 0; this.hitT = 0; this.biteT = 0;
      this.phase = Math.random() * 6; this.onGround = false; this.dead = false; this.voiceT = 4 + Math.random() * 20;
      const g = this.group = new THREE.Group();
      const rig = this.spec.model(g);
      this.head = rig.head; this.legs = rig.legs; this.tail = rig.tail;
      g.position.copy(this.pos);
      scene.add(g);
    }

    update(dt, world, player, night) {
      const S = this.spec, p = this.pos, v = this.vel;
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      const near = Math.hypot(dx, dz);

      this.think -= dt;
      if (this.think <= 0) {
        this.think = 1.5 + Math.random() * 4;
        this.walking = Math.random() < (S.restless || 0.5);
        this.yawTarget = Math.random() * Math.PI * 2;
      }

      // Wolves come at you after dark; everything else would rather not be near you at all.
      let chasing = false;
      if (S.hunt && night > 0.3 && near < 22) {
        chasing = true; this.walking = true;
        this.yawTarget = Math.atan2(dx, dz);
        this.biteT -= dt;
        if (near < 1.9 && Math.abs(player.pos.y - p.y) < 2 && this.biteT <= 0) {
          this.biteT = S.bite || 1.5;
          player.hurt(S.damage, 'A wolf ran you down in the dark.');
          CM.sfx('growl');
        }
      } else if (S.shy && this.fleeT <= 0 && near < S.shy) {
        this.fleeT = 1.6 + Math.random();                   // skittish things bolt before you reach them
      }
      if (this.fleeT > 0 && !chasing) {
        this.fleeT -= dt; this.walking = true;
        this.yawTarget = Math.atan2(-dx, -dz);
      }

      const turn = Math.atan2(Math.sin(this.yawTarget - this.yaw), Math.cos(this.yawTarget - this.yaw));
      this.yaw += turn * Math.min(1, dt * (this.fleeT > 0 || chasing ? 8 : 3));

      if (S.water) { this.swim(dt, world); this.place(); return; }

      const speed = !this.walking ? 0 : chasing ? S.chase : this.fleeT > 0 ? S.flee : S.walk;
      const k = Math.min(1, dt * (this.onGround ? 10 : 2));
      if (this.hitT > 0) this.hitT -= dt;
      else { v.x += (Math.sin(this.yaw) * speed - v.x) * k; v.z += (Math.cos(this.yaw) * speed - v.z) * k; }

      const bid = world.get(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z));
      if (bid > 0 && CM.blocks[bid].liquid) v.y = Math.min(v.y + 20 * dt, 2); else v.y -= 28 * dt;
      // Hares bound rather than trot.
      if (S.hops && this.onGround && speed > 0 && Math.random() < dt * 4) v.y = 4.6;

      const r = CM.sweep(world, p, v, dt, S.hw, S.h);
      this.onGround = r.ground;
      if (r.hitH && this.onGround && speed > 0) { v.y = 7.8; if (Math.random() < 0.3) this.yawTarget += Math.PI * (0.5 + Math.random()); }

      const hs = Math.hypot(v.x, v.z);
      this.phase += dt * hs * (S.hops ? 3 : 5);
      const swing = Math.sin(this.phase) * 0.6 * Math.min(1, hs);
      if (this.legs.length === 4) {
        const air = S.hops && !this.onGround ? -0.9 : 0;
        this.legs[0].rotation.x = swing + air; this.legs[3].rotation.x = swing + air;
        this.legs[1].rotation.x = -swing + air; this.legs[2].rotation.x = -swing + air;
      }
      if (this.head) this.head.rotation.x = this.walking ? 0 : 0.18 + Math.sin(performance.now() / 600 + p.x) * 0.15;
      if (this.tail) this.tail.rotation.x = -0.5 + Math.sin(this.phase * 0.7) * 0.25;

      // An occasional call, as long as it is not right on top of the player.
      this.voiceT -= dt;
      if (this.voiceT <= 0) {
        this.voiceT = 12 + Math.random() * 26;
        const wantsNight = this.kind === 'wolf';
        if (S.idle && near > 6 && near < 40 && (!wantsNight || night > 0.5)) CM.sfx(S.idle);
      }
      this.place();
    }

    // Fish hold themselves in the water and turn away from the shore.
    swim(dt, world) {
      const p = this.pos, v = this.vel;
      const here = world.get(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));
      const wet = here > 0 && CM.blocks[here].liquid;
      const speed = this.walking ? (this.fleeT > 0 ? this.spec.flee : this.spec.walk) : 0.2;
      v.x += (Math.sin(this.yaw) * speed - v.x) * Math.min(1, dt * 3);
      v.z += (Math.cos(this.yaw) * speed - v.z) * Math.min(1, dt * 3);
      const above = world.get(Math.floor(p.x), Math.floor(p.y + 0.9), Math.floor(p.z));
      const deepEnough = above > 0 && CM.blocks[above].liquid;
      v.y += ((wet ? (deepEnough ? 0.35 + Math.sin(this.phase) * 0.25 : -0.6) : -6) - v.y) * Math.min(1, dt * 4);
      this.phase += dt * 2.2;
      const r = CM.sweep(world, p, v, dt, this.spec.hw, this.spec.h);
      if (r.hitH) this.yawTarget = this.yaw + Math.PI * (0.6 + Math.random() * 0.8);
      if (!wet) this.fleeT = 0;
      if (this.tail) this.tail.rotation.y = Math.sin(this.phase * 3) * 0.5;
      this.group.rotation.z = Math.sin(this.phase * 1.5) * 0.12;
    }

    place() {
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.yaw;
    }

    hit(dmg, dx, dz) {
      this.health -= dmg;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.set((dx / l) * 6, 5, (dz / l) * 6);
      this.hitT = 0.25;
      this.fleeT = this.spec.hunt ? 0 : 4;                 // wolves do not run off when struck
      CM.sfx(this.spec.voice);
      if (this.health <= 0) this.dead = true;
    }
  }

  // ---------- birds and drifting motes ----------
  // Nothing you can touch: a flock overhead and specks in the air, purely so the world moves.
  class Ambience {
    constructor(scene) {
      this.scene = scene;
      this.birds = [];
      this.motes = [];
      this.moteMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
      const moteGeo = new THREE.BoxGeometry(0.055, 0.055, 0.055);
      for (let i = 0; i < 10; i++) {
        const m = new THREE.Mesh(moteGeo, this.moteMat);
        m.visible = false;
        scene.add(m);
        this.motes.push({ mesh: m, a: Math.random() * 6.28, r: 4 + Math.random() * 9, y: 0.5 + Math.random() * 1.2, sp: 0.2 + Math.random() * 0.45, bob: Math.random() * 6.28, blink: Math.random() * 6.28 });
      }
      for (let i = 0; i < 6; i++) {
        const g = new THREE.Group();
        part(g, 0.16, 0.12, 0.3, 0x2e2a26, 0, 0, 0);
        const wl = pivot(g, -0.07, 0.03, 0), wr = pivot(g, 0.07, 0.03, 0);
        part(wl, 0.3, 0.03, 0.16, 0x3b352f, -0.15, 0, 0);
        part(wr, 0.3, 0.03, 0.16, 0x3b352f, 0.15, 0, 0);
        scene.add(g);
        this.birds.push({ group: g, wl, wr, a: (i / 6) * 6.28, r: 12 + Math.random() * 10, h: 22 + Math.random() * 8, sp: 0.16 + Math.random() * 0.1, flap: Math.random() * 6.28 });
      }
    }
    update(dt, player, night, clock) {
      const p = player.pos;
      for (const b of this.birds) {
        b.a += dt * b.sp;
        b.flap += dt * 9;
        const x = p.x + Math.cos(b.a) * b.r, z = p.z + Math.sin(b.a) * b.r;
        b.group.position.set(x, p.y + b.h, z);
        b.group.rotation.y = -b.a + Math.PI / 2;
        const f = Math.sin(b.flap) * 0.7;
        b.wl.rotation.z = f; b.wr.rotation.z = -f;
        b.group.visible = night < 0.55;                    // roosting after dark
      }
      // Pale flutterers by day, glowing ones after dark.
      const glow = night > 0.55;
      this.moteMat.color.setHex(glow ? 0xffe97a : 0xf2f0e2);
      for (const m of this.motes) {
        m.a += dt * m.sp;
        m.bob += dt * 2.2;
        const x = p.x + Math.cos(m.a) * m.r, z = p.z + Math.sin(m.a * 1.3) * m.r;
        const ground = this.ground ? this.ground(x, z) : p.y;
        m.mesh.position.set(x, ground + m.y + Math.sin(m.bob) * (glow ? 0.5 : 0.3), z);
        // Fireflies wink in and out; by day the flutterers just shimmer a little.
        m.blink += dt * (glow ? 2.6 : 1.4);
        const pulse = glow ? Math.max(0, Math.sin(m.blink)) : 0.55 + Math.sin(m.blink) * 0.2;
        m.mesh.scale.setScalar(0.35 + pulse * 1.1);
        m.mesh.visible = pulse > 0.02;
      }
    }
    dispose() {
      for (const b of this.birds) this.scene.remove(b.group);
      for (const m of this.motes) this.scene.remove(m.mesh);
      this.birds = []; this.motes = [];
    }
  }
  CM.Ambience = Ambience;

  class Mobs {
    constructor(scene) { this.scene = scene; this.world = null; this.list = []; this.spawnT = 1; }
    setWorld(world) { this.clear(); this.world = world; }
    clear() { for (const m of this.list) this.scene.remove(m.group); this.list = []; }
    remove(m) { this.scene.remove(m.group); this.list.splice(this.list.indexOf(m), 1); }
    count(kind) { let n = 0; for (const m of this.list) if (m.kind === kind) n++; return n; }

    update(dt, player, night) {
      this.night = night || 0;
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 2.2; if (this.list.length < 12) this.trySpawn(player); }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const m = this.list[i];
        const far = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) > 80;
        // Wolves melt away at first light rather than hanging about the camp.
        const dawn = m.spec.hunt && this.night < 0.2 && Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) > 26;
        if (far || dawn || m.pos.y < -10 || this.world.get(Math.floor(m.pos.x), 0, Math.floor(m.pos.z)) < 0) { this.remove(m); continue; }
        m.update(dt, this.world, player, this.night);
      }
    }

    pickKind() {
      const day = 1 - this.night;
      let total = 0;
      const weights = [];
      for (const k in SPECIES) {
        const S = SPECIES[k];
        const w = S.day * day + S.night * this.night;
        if (w <= 0) continue;
        weights.push([k, w]); total += w;
      }
      let r = Math.random() * total;
      for (const [k, w] of weights) { r -= w; if (r <= 0) return k; }
      return 'boar';
    }

    trySpawn(player) {
      const kind = this.pickKind(), S = SPECIES[kind];
      const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 18;
      const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);

      if (S.on === 'water') {
        // find a column with room to swim in
        let y = -1;
        for (let yy = CM.SEA; yy > CM.SEA - 5; yy--) {
          if (this.world.get(x, yy, z) === B.WATER && this.world.get(x, yy + 1, z) === B.WATER) { y = yy; break; }
        }
        if (y < 0) return;
        this.spawnGroup(kind, x, y, z);
        return;
      }
      const y = this.world.topY(x, z);
      if (y <= CM.SEA + 1) return;
      const under = this.world.get(x, y - 1, z);
      if (under < 0) return;
      if (S.on === 'grass' && under !== B.GRASS) return;
      if (S.on === 'any' && !CM.blocks[under].solid) return;
      this.spawnGroup(kind, x, y + 0.01, z);
    }

    spawnGroup(kind, x, y, z) {
      const S = SPECIES[kind];
      const herd = S.herd[0] + Math.floor(Math.random() * (S.herd[1] - S.herd[0] + 1));
      for (let i = 0; i < herd && this.list.length < 12; i++) {
        this.list.push(new Creature(this.scene, kind,
          x + 0.5 + (Math.random() - 0.5) * 1.4, y, z + 0.5 + (Math.random() - 0.5) * 1.4));
      }
    }

    raycast(ox, oy, oz, dx, dy, dz, max) {
      let best = null, bt = max;
      for (const m of this.list) {
        const w = Math.max(0.4, m.spec.hw + 0.15), h = m.spec.h;
        const t = CM.rayBox(ox, oy, oz, dx, dy, dz, m.pos.x - w, m.pos.y, m.pos.z - w, m.pos.x + w, m.pos.y + h + 0.15, m.pos.z + w);
        if (t !== null && t < bt) { bt = t; best = m; }
      }
      return best ? { mob: best, dist: bt } : null;
    }

    occupies(x, y, z) {
      return this.list.some(m => {
        const w = m.spec.hw;
        return m.pos.x + w > x && m.pos.x - w < x + 1 && m.pos.z + w > z && m.pos.z - w < z + 1 && m.pos.y + m.spec.h > y && m.pos.y < y + 1;
      });
    }
  }
  CM.Mobs = Mobs;

  // ---------- particles ----------
  class Particles {
    constructor(scene) { this.scene = scene; this.list = []; this.geo = new THREE.BoxGeometry(0.14, 0.14, 0.14); this.mats = new Map(); }
    burst(x, y, z, color, count) {
      let m = this.mats.get(color);
      if (!m) { m = new THREE.MeshBasicMaterial({ color }); m.userData.base = m.color.clone(); CM.tintMats.push(m); this.mats.set(color, m); }
      for (let i = 0; i < (count || 10); i++) {
        const mesh = new THREE.Mesh(this.geo, m);
        mesh.position.set(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, z + (Math.random() - 0.5) * 0.7);
        this.scene.add(mesh);
        this.list.push({ mesh, vx: (Math.random() - 0.5) * 4, vy: 1.5 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.5 + Math.random() * 0.4 });
      }
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const q = this.list[i];
        q.life -= dt;
        if (q.life <= 0) { this.scene.remove(q.mesh); this.list.splice(i, 1); continue; }
        q.vy -= 18 * dt;
        q.mesh.position.x += q.vx * dt; q.mesh.position.y += q.vy * dt; q.mesh.position.z += q.vz * dt;
        q.mesh.scale.setScalar(Math.min(1, q.life * 2));
      }
    }
  }
  CM.Particles = Particles;
})(window.CM);
