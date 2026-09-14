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
      if (this.inWater) { v.y -= 10 * dt; v.y *= Math.max(0, 1 - 3 * dt); if (inp.jump) v.y = Math.min(v.y + 26 * dt, 3.4); }
      else { v.y = Math.max(-45, v.y - 28 * dt); if (inp.jump && this.onGround) v.y = 8.6; }
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
      const r = CM.sweep(W, p, v, dt, 0.3, 1.8);
      this.onGround = r.ground;

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
      if (this.onGround && this.moveAmt > 0.3 && !this.sneaking) { this.stepT -= dt * this.moveAmt; if (this.stepT <= 0) { this.stepT = 0.42; CM.sfx('step'); } }
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

  // ---------- boars ----------
  class Boar {
    constructor(scene, x, y, z) {
      this.pos = new THREE.Vector3(x, y, z);
      this.vel = new THREE.Vector3();
      this.yaw = Math.random() * Math.PI * 2; this.yawTarget = this.yaw;
      this.health = 6; this.think = 0; this.walking = false; this.fleeT = 0; this.hitT = 0; this.phase = 0; this.onGround = false; this.dead = false;
      const g = this.group = new THREE.Group();
      const HIDE = 0x6b4a33, DARK = 0x3f2a1c;
      part(g, 0.66, 0.52, 1.0, HIDE, 0, 0.62, 0);
      part(g, 0.18, 0.1, 0.86, DARK, 0, 0.92, -0.02);
      const head = this.head = pivot(g, 0, 0.66, 0.5);
      part(head, 0.5, 0.46, 0.4, 0x5e412c, 0, 0, 0.16);
      part(head, 0.28, 0.22, 0.12, 0xc98f7a, 0, -0.06, 0.41);
      part(head, 0.05, 0.14, 0.05, 0xefe4cf, -0.17, -0.04, 0.39);
      part(head, 0.05, 0.14, 0.05, 0xefe4cf, 0.17, -0.04, 0.39);
      part(head, 0.07, 0.07, 0.02, 0x111111, -0.14, 0.1, 0.37);
      part(head, 0.07, 0.07, 0.02, 0x111111, 0.14, 0.1, 0.37);
      part(head, 0.1, 0.14, 0.06, DARK, -0.2, 0.28, 0.1);
      part(head, 0.1, 0.14, 0.06, DARK, 0.2, 0.28, 0.1);
      this.legs = [[-0.2, 0.34], [0.2, 0.34], [-0.2, -0.34], [0.2, -0.34]].map(([lx, lz]) => { const pv = pivot(g, lx, 0.38, lz); part(pv, 0.16, 0.38, 0.16, 0x4f3625, 0, -0.19, 0); return pv; });
      g.position.copy(this.pos);
      scene.add(g);
    }
    update(dt, world, player) {
      const p = this.pos, v = this.vel;
      this.think -= dt;
      if (this.think <= 0) { this.think = 1.5 + Math.random() * 4; this.walking = Math.random() < 0.55; this.yawTarget = Math.random() * Math.PI * 2; }
      if (this.fleeT > 0) { this.fleeT -= dt; this.walking = true; this.yawTarget = Math.atan2(p.x - player.pos.x, p.z - player.pos.z); }
      const dy = Math.atan2(Math.sin(this.yawTarget - this.yaw), Math.cos(this.yawTarget - this.yaw));
      this.yaw += dy * Math.min(1, dt * (this.fleeT > 0 ? 8 : 3));
      const speed = this.walking ? (this.fleeT > 0 ? 4.4 : 1.4) : 0;
      const k = Math.min(1, dt * (this.onGround ? 10 : 2));
      if (this.hitT > 0) this.hitT -= dt;
      else { v.x += (Math.sin(this.yaw) * speed - v.x) * k; v.z += (Math.cos(this.yaw) * speed - v.z) * k; }
      const bid = world.get(Math.floor(p.x), Math.floor(p.y + 0.4), Math.floor(p.z));
      if (bid > 0 && CM.blocks[bid].liquid) v.y = Math.min(v.y + 20 * dt, 2); else v.y -= 28 * dt;
      const r = CM.sweep(world, p, v, dt, 0.35, 0.95);
      this.onGround = r.ground;
      if (r.hitH && this.onGround && speed > 0) { v.y = 7.8; if (Math.random() < 0.3) this.yawTarget += Math.PI * (0.5 + Math.random()); }
      const hs = Math.hypot(v.x, v.z);
      this.phase += dt * hs * 5;
      const swing = Math.sin(this.phase) * 0.6 * Math.min(1, hs);
      this.legs[0].rotation.x = swing; this.legs[3].rotation.x = swing;
      this.legs[1].rotation.x = -swing; this.legs[2].rotation.x = -swing;
      this.head.rotation.x = this.walking ? 0 : 0.18 + Math.sin(performance.now() / 600 + p.x) * 0.15;
      this.group.position.copy(p);
      this.group.rotation.y = this.yaw;
    }
    hit(dmg, dx, dz) {
      this.health -= dmg;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.set((dx / l) * 6, 5, (dz / l) * 6);
      this.hitT = 0.25; this.fleeT = 4;
      CM.sfx('squeal');
      if (this.health <= 0) this.dead = true;
    }
  }

  class Mobs {
    constructor(scene) { this.scene = scene; this.world = null; this.list = []; this.spawnT = 1; }
    setWorld(world) { this.clear(); this.world = world; }
    clear() { for (const m of this.list) this.scene.remove(m.group); this.list = []; }
    remove(m) { this.scene.remove(m.group); this.list.splice(this.list.indexOf(m), 1); }
    update(dt, player) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = 2.5; if (this.list.length < 8) this.trySpawn(player); }
      for (let i = this.list.length - 1; i >= 0; i--) {
        const m = this.list[i];
        const far = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) > 80;
        if (far || m.pos.y < -10 || this.world.get(Math.floor(m.pos.x), 0, Math.floor(m.pos.z)) < 0) { this.remove(m); continue; }
        m.update(dt, this.world, player);
      }
    }
    trySpawn(player) {
      const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 16;
      const x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
      const y = this.world.topY(x, z);
      if (y <= CM.SEA + 1 || this.world.get(x, y - 1, z) !== B.GRASS) return;
      const herd = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < herd && this.list.length < 8; i++) {
        this.list.push(new Boar(this.scene, x + 0.5 + (Math.random() - 0.5) * 0.3, y + 0.01, z + 0.5 + (Math.random() - 0.5) * 0.3));
      }
    }
    raycast(ox, oy, oz, dx, dy, dz, max) {
      let best = null, bt = max;
      for (const m of this.list) {
        const t = CM.rayBox(ox, oy, oz, dx, dy, dz, m.pos.x - 0.5, m.pos.y, m.pos.z - 0.5, m.pos.x + 0.5, m.pos.y + 1.0, m.pos.z + 0.5);
        if (t !== null && t < bt) { bt = t; best = m; }
      }
      return best ? { mob: best, dist: bt } : null;
    }
    occupies(x, y, z) {
      return this.list.some(m => m.pos.x + 0.35 > x && m.pos.x - 0.35 < x + 1 && m.pos.z + 0.35 > z && m.pos.z - 0.35 < z + 1 && m.pos.y + 0.95 > y && m.pos.y < y + 1);
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
