// Caveman \u2014 renderer, sky & daylight, game flow, save/load and the main loop.
(function (CM) {
  const B = CM.B, I = CM.I, ui = CM.ui, input = CM.input;
  const canvas = document.getElementById('view');

  if (!window.THREE) { ui.setLoading(0, 'The 3D engine could not load. Check your connection and reload.'); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { ui.setLoading(0, 'This browser cannot show 3D graphics (WebGL is off).'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 1000);
  camera.rotation.order = 'YXZ';
  scene.fog = new THREE.Fog(0x8ec3e6, 24, 48);
  const skyColor = new THREE.Color(0x8ec3e6);
  scene.background = skyColor;

  const atlasTex = new THREE.CanvasTexture(CM.buildAtlas());
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  const materials = {
    opaque: new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 }),
    water: new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
  };

  // ---------- light ----------
  // The mesher bakes three things into each vertex colour: how much sky the face can see (r),
  // whether the block glows (g), and its face shading with ambient occlusion (b). The shader
  // turns those into light, adding the nearest few torches so caves are dark until you light them.
  const MAX_LIGHTS = 8;
  const lightU = {
    uDay: { value: 1 },
    uSkyCol: { value: new THREE.Color(1, 1, 1) },
    uTorchCol: { value: new THREE.Color(1, 0.76, 0.46) },
    uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uLightCount: { value: 0 },
  };
  const LIT_VERTEX = [
    'vColor = vec3(1.0);',
    'float blk = 0.0;',
    // Out in daylight there are no flames nearby, so skip the world-space transform entirely.
    'if (uLightCount > 0) {',
    '  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;',
    '  for (int i = 0; i < ' + MAX_LIGHTS + '; i++) {',
    '    if (i >= uLightCount) break;',
    '    float s = uLights[i].w;',
    '    if (s > 0.0) blk = max(blk, s * clamp(1.0 - distance(wp, uLights[i].xyz) / 9.0, 0.0, 1.0));',
    '  }',
    '}',
    'float sky = color.r * uDay;',
    'float lvl = max(max(sky, blk), 0.035);',
    'vec3 tint = mix(uSkyCol, uTorchCol, blk / max(blk + sky, 0.001));',
    'vec3 lit = mix(tint * lvl, vec3(1.0), color.g);',
    'vColor.xyz = lit * color.b;',
  ].join('\n');
  function litMaterial(mat) {
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, lightU);
      shader.vertexShader = 'uniform float uDay;\nuniform vec3 uSkyCol;\nuniform vec3 uTorchCol;\nuniform int uLightCount;\nuniform vec4 uLights[' + MAX_LIGHTS + '];\n'
        + shader.vertexShader.replace('#include <color_vertex>', LIT_VERTEX);
    };
    mat.needsUpdate = true;
  }
  litMaterial(materials.opaque);
  litMaterial(materials.water);

  // Feed the shader the nearest live flames, plus whatever the player is carrying.
  const lightScratch = [];
  function updateLights() {
    const cam = camera.position;
    lightScratch.length = 0;
    for (const c of game.world.chunks.values()) {
      const L = c.lights;
      if (!L || !L.length) continue;
      if (Math.abs(c.cx * CM.CHUNK + 8 - cam.x) > 44 || Math.abs(c.cz * CM.CHUNK + 8 - cam.z) > 44) continue;
      for (let i = 0; i < L.length; i += 4) {
        const dx = L[i] - cam.x, dy = L[i + 1] - cam.y, dz = L[i + 2] - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 576) lightScratch.push([d2, L[i], L[i + 1], L[i + 2], L[i + 3]]);
      }
    }
    game.torchLight = 0;
    for (const L of lightScratch) {
      const d = Math.sqrt(Math.max(0, L[0]));
      game.torchLight = Math.max(game.torchLight, L[4] * CM.clamp(1 - d / 9, 0, 1));
    }
    const held = game.player && game.player.held();
    if (held && held.id === B.TORCH) lightScratch.push([-1, cam.x, cam.y, cam.z, 0.85]);
    lightScratch.sort((a, b) => a[0] - b[0]);
    const arr = lightU.uLights.value;
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const L = lightScratch[i];
      if (L) arr[i].set(L[1], L[2], L[3], L[4]); else arr[i].set(0, 0, 0, 0);
    }
    lightU.uLightCount.value = Math.min(MAX_LIGHTS, lightScratch.length);
  }

  // Minecraft's tell that a block is about to give: cracks that spread as you dig.
  const crackTex = CM.crackStages().map(c => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  });
  const crack = new THREE.Mesh(
    new THREE.BoxGeometry(1.003, 1.003, 1.003),
    new THREE.MeshBasicMaterial({ map: crackTex[0], transparent: true, blending: THREE.MultiplyBlending, depthWrite: false, fog: false }));
  crack.visible = false;
  let crackStage = -1;

  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55 }));
  highlight.visible = false;
  scene.add(highlight, crack);

  // ---------- sky ----------
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xfff0b3, fog: false }));
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0xdfe6f0, fog: false }));
  scene.add(sun, moon);
  const starPts = [];
  for (let i = 0; i < 500; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    starPts.push(r * Math.cos(th) * 500, Math.abs(u) * 500, r * Math.sin(th) * 500);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = cloudCanvas.height = 64;
  const cctx = cloudCanvas.getContext('2d');
  const crand = CM.mulberry32(7);
  cctx.fillStyle = '#ffffff';
  for (let k = 0; k < 14; k++) {
    const cx = crand() * 64, cy = crand() * 64, rw = 4 + crand() * 10, rh = 3 + crand() * 6;
    for (let y = -rh; y <= rh; y++) for (let x = -rw; x <= rw; x++) {
      if ((x * x) / (rw * rw) + (y * y) / (rh * rh) > 1) continue;
      cctx.fillRect((Math.floor(cx + x) + 64) % 64, (Math.floor(cy + y) + 64) % 64, 1, 1);
    }
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.magFilter = cloudTex.minFilter = THREE.NearestFilter;
  cloudTex.generateMipmaps = false;
  cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping;
  cloudTex.repeat.set(4, 4);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.8, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), cloudMat);
  clouds.rotation.x = -Math.PI / 2;
  scene.add(clouds);

  const caveman = CM.makeCaveman();
  caveman.group.visible = false;
  scene.add(caveman.group);

  // ---------- what you are holding, shown in your fist ----------
  // Blocks become a shaded cube cut from the atlas; tools and food become their pixel icon.
  const FACE_SHADE = [0.8, 0.8, 1, 0.55, 0.68, 0.68];
  // Held blocks are lit by where the player is standing, not by the terrain shader.
  const handBlockMat = new THREE.MeshBasicMaterial({ map: atlasTex, vertexColors: true, alphaTest: 0.5 });
  handBlockMat.userData.base = handBlockMat.color.clone();
  CM.tintMats.push(handBlockMat);
  const itemMats = new Map();
  const cubeGeos = new Map();
  let planeGeo = null;

  function blockGeo(id) {
    if (cubeGeos.has(id)) return cubeGeos.get(id);
    const g = new THREE.BoxGeometry(1, 1, 1);
    const tex = CM.blocks[id].tex, N = CM.ATLAS_N, eps = 0.008;
    const uv = g.getAttribute('uv'), col = [];
    for (let f = 0; f < 6; f++) {
      const t = f === 2 ? tex[0] : f === 3 ? tex[1] : tex[2];
      const cx = t % N, cy = (t / N) | 0;
      const u0 = (cx + eps) / N, u1 = (cx + 1 - eps) / N, v1 = 1 - (cy + eps) / N, v0 = 1 - (cy + 1 - eps) / N;
      uv.setXY(f * 4, u0, v1); uv.setXY(f * 4 + 1, u1, v1); uv.setXY(f * 4 + 2, u0, v0); uv.setXY(f * 4 + 3, u1, v0);
      const sh = FACE_SHADE[f];
      for (let k = 0; k < 4; k++) col.push(sh, sh, sh);
    }
    uv.needsUpdate = true;
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    cubeGeos.set(id, g);
    return g;
  }

  function itemMat(id) {
    if (itemMats.has(id)) return itemMats.get(id);
    const tex = new THREE.CanvasTexture(CM.iconCanvas(id));
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
    m.userData.base = m.color.clone();
    CM.tintMats.push(m);
    itemMats.set(id, m);
    return m;
  }

  function buildHeld(id) {
    if (id === null || id === undefined) return null;
    if (id < 100) return new THREE.Mesh(blockGeo(id), handBlockMat);
    if (!planeGeo) planeGeo = new THREE.PlaneGeometry(1, 1);
    return new THREE.Mesh(planeGeo, itemMat(id));
  }

  const HAND_X = CM.isTouch ? 0.2 : 0.3;
  const hand = new THREE.Group();          // first person: rides the camera
  const fist = new THREE.Group();          // third person: rides the caveman's right arm
  camera.add(hand);
  scene.add(camera);
  caveman.armR.add(fist);
  fist.position.set(0, -0.58, 0.12);

  function styleHeld(mesh, id, third) {
    const block = id < 100;
    if (third) {
      mesh.scale.setScalar(block ? 0.32 : 0.5);
      mesh.rotation.set(block ? 0.3 : -0.25, block ? 0.6 : 1.0, block ? 0 : 0.35);
      mesh.position.set(block ? 0.04 : 0.3, block ? -0.08 : 0.04, block ? 0.12 : 0.3);
    } else {
      mesh.scale.setScalar(block ? 0.19 : 0.4);
      mesh.rotation.set(block ? 0.2 : 0, block ? -0.62 : -0.2, block ? 0 : -0.2);
      mesh.position.set(0, block ? 0.03 : 0, 0);
    }
  }

  function setHeld(id) {
    game.heldId = id;
    for (const g of [hand, fist]) while (g.children.length) g.remove(g.children[0]);
    if (id === null) return;
    const a = buildHeld(id), b = buildHeld(id);
    styleHeld(a, id, false); hand.add(a);
    styleHeld(b, id, true); fist.add(b);
    game.equipT = 1;
  }

  // Minecraft-ish arc: the item dips and rolls, then snaps back.
  function updateHand(dt) {
    const p = game.player;
    const held = p.held();
    const id = held ? held.id : null;
    if (id !== game.heldId) setHeld(id);
    hand.visible = game.cameraMode === 0 && game.state !== 'title';
    fist.visible = game.cameraMode !== 0 || game.state === 'title';
    if (!hand.children.length) return;
    game.equipT = Math.max(0, game.equipT - dt * 4.5);
    const digging = game.miningP > 0 ? (performance.now() / 260) % 1 : -1;
    const swing = digging >= 0 ? Math.sin(digging * Math.PI) : Math.sin(CM.clamp(game.swing, 0, 1) * Math.PI);
    const bob = game.bob;
    const mv = Math.min(1, p.moveAmt);
    hand.position.set(
      HAND_X + Math.cos(bob) * 0.014 * mv - swing * 0.09,
      -0.29 - Math.abs(Math.sin(bob)) * 0.016 * mv - game.equipT * 0.5 - swing * 0.11 - (p.sneaking ? 0.05 : 0),
      -0.7 + swing * 0.08);
    hand.rotation.set(-swing * 0.9, swing * 0.35, -game.equipT * 0.6);
  }
  const particles = new CM.Particles(scene);
  const mobs = new CM.Mobs(scene);
  const ambience = new CM.Ambience(scene);

  const game = CM.game = {
    state: 'loading', world: null, player: null, data: null, cameraMode: 0, clock: 0, afterLoad: 'title',
    focus: new THREE.Vector3(), titleCenter: new THREE.Vector3(), spawn: new THREE.Vector3(),
    mining: null, miningP: 0, attackCD: 0, useRepeat: 0, swing: 0, saveT: 0, titleAngle: 0, bob: 0, walkPhase: 0,
    pendingSpawn: false, hadPlayer: false, warnedSave: false, heldId: undefined, equipT: 0, eyeY: 1.62, fov: 72,
    mobs, ambience,
  };

  const LOADING_LINES = ['Knapping flint\u2026', 'Gathering stones\u2026', 'Waking the boars\u2026', 'Stoking the fire\u2026'];

  function newWorldData(name, seedStr) {
    const seed = seedStr ? CM.seedFromString(seedStr) : Math.floor(Math.random() * 2147483646) + 1;
    return { v: 1, name, seed, edits: {}, player: null, clock: CM.DAY_LEN * 0.04 };
  }

  function startWorld(data, afterLoad) {
    if (game.world) game.world.dispose();
    game.data = data;
    game.world = new CM.World(data.seed, scene, materials, data);
    data.spawnChunk = game.world.spawnChunk;
    mobs.setWorld(game.world);
    ambience.ground = (x, z) => {
      const y = game.world.topY(Math.floor(x), Math.floor(z));
      return y < 0 ? game.player.pos.y : y;
    };
    game.player = new CM.Player(game.world);
    game.hadPlayer = !!data.player;
    if (data.player) game.player.load(data.player); else game.player.giveStarter();
    if (game.player.health <= 0) game.player.health = 20;
    game.clock = typeof data.clock === 'number' ? data.clock : 0;
    const sc = game.world.spawnChunk;
    game.spawn.set(sc[0] * CM.CHUNK + 7.5, 0, sc[1] * CM.CHUNK + 14.5);
    if (game.hadPlayer) game.focus.copy(game.player.pos); else game.focus.set(game.spawn.x, 30, game.spawn.z - 7);
    game.afterLoad = afterLoad;
    game.state = 'loading';
    game.world.lastCenter = '';
    ['title', 'hud', 'pause', 'inventory', 'options', 'newworld', 'death'].forEach(id => ui.hide(id));
    ui.show('loading');
    ui.setLoading(0, LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)]);
    ui.last = {};
  }

  function finishLoading() {
    ui.hide('loading');
    const p = game.player;
    if (!p.placed) placeAtSpawn();
    if (game.hadPlayer) game.titleCenter.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
    else game.titleCenter.set(game.spawn.x, (game.world.hutFloor || p.pos.y) + 2.5, game.spawn.z - 7);
    if (game.afterLoad === 'play') enterPlay();
    else { game.state = 'title'; ui.setTitle(game.data.name); ui.show('title'); }
  }

  function placeAtSpawn() {
    const p = game.player;
    const y = game.world.topY(Math.floor(game.spawn.x), Math.floor(game.spawn.z));
    p.pos.set(game.spawn.x, y >= 0 ? y + 0.01 : 70, game.spawn.z);
    p.vel.set(0, 0, 0);
    p.yaw = 0; p.pitch = -0.05; p.placed = true; p.fallTop = null;
    game.pendingSpawn = y < 0;
  }

  function requestLock() {
    if (CM.isTouch) return;
    try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* drag-to-look fallback */ }
  }
  function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }

  function enterPlay() {
    game.state = 'playing';
    CM.music.start();
    ['title', 'pause', 'inventory', 'options', 'newworld', 'death'].forEach(id => ui.hide(id));
    ui.show('hud');
    ui.last = {};
    input.clear();
    requestLock();
  }

  function save() {
    if (!game.world || !game.data) return;
    const d = game.data;
    d.edits = game.world.serializeEdits();
    d.player = game.player.placed ? game.player.serialize() : null;
    d.clock = game.clock;
    d.spawnChunk = game.world.spawnChunk;
    if (!CM.store.set(CM.SAVE_KEY, d) && !game.warnedSave) { game.warnedSave = true; ui.toast('This browser won\u2019t let the game save progress'); }
  }

  function dayLabel() {
    const day = Math.floor(game.clock / CM.DAY_LEN) + 1, t = (game.clock / CM.DAY_LEN) % 1;
    return 'Day ' + day + ' \u00b7 ' + (t < 0.06 || t > 0.97 ? 'Dawn' : t < 0.44 ? 'Day' : t < 0.53 ? 'Dusk' : 'Night');
  }

  // ---------- public actions (menus & input call these) ----------
  game.play = () => { if (game.state === 'title') enterPlay(); };
  game.pause = () => {
    if (game.state !== 'playing') return;
    game.state = 'paused'; input.clear(); releaseLock(); save();
    ui.showPause(game.data.name + ' \u00b7 ' + dayLabel());
  };
  game.resume = () => { if (game.state !== 'paused') return; ui.hide('pause'); game.state = 'playing'; requestLock(); };
  game.toggleInventory = () => {
    if (game.state === 'playing') {
      game.state = 'inventory'; input.clear(); releaseLock();
      ui.picked = null; ui.renderInventory(game.player); ui.show('inventory');
    } else if (game.state === 'inventory') {
      ui.hide('inventory'); ui.picked = null; game.state = 'playing'; requestLock();
    }
  };
  game.quitToTitle = () => {
    save();
    ui.hide('pause'); ui.hide('hud'); highlight.visible = false; crack.visible = false;
    game.titleCenter.set(game.player.pos.x, game.player.pos.y + 1.5, game.player.pos.z);
    game.state = 'title'; ui.setTitle(game.data.name); ui.show('title');
  };
  game.cycleCamera = () => { game.cameraMode = (game.cameraMode + 1) % 3; ui.toast(['First person', 'Behind the caveman', 'Facing the caveman'][game.cameraMode]); };
  game.selectSlot = i => { if (game.player) game.player.sel = i; };
  game.craft = r => {
    const p = game.player;
    for (const [id, n] of r.ins) if (p.count(id) < n) return;
    if (p.spaceFor(r.out[0]) < r.out[1]) { ui.toast('Bag is full'); return; }
    for (const [id, n] of r.ins) p.remove(id, n);
    p.addItem(r.out[0], r.out[1]);
    CM.sfx('craft');
    ui.toast('Made ' + (r.out[1] > 1 ? r.out[1] + ' ' : '') + CM.info(r.out[0]).name);
    ui.renderInventory(p);
  };
  game.respawn = () => {
    const p = game.player;
    p.dead = false; p.health = 20; p.hunger = 20; p.hurtT = 0;
    placeAtSpawn();
    ui.hide('death'); game.state = 'playing'; ui.show('hud'); requestLock();
  };
  game.createWorld = (name, seed) => { startWorld(newWorldData(name, seed), 'play'); save(); };
  game.applyOptions = () => { if (game.world) game.world.lastCenter = ''; };

  // ---------- gameplay ----------
  function breakTime(bd, info) {
    let t = bd.hardness;
    const tool = info && info.tool;
    if (bd.tool === 'pick') t *= tool === 'pick' ? 0.3 : 2;
    else if (bd.tool === 'axe') t *= tool === 'axe' ? 0.35 : 1;
    return Math.max(0.1, t);
  }

  // Direction from a point on the screen — lets a thumb reach into the world.
  const ndc = new THREE.Vector2(), rayc = new THREE.Raycaster();
  function screenDir(px, py) {
    ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
    rayc.setFromCamera(ndc, camera);
    return rayc.ray.direction;
  }

  function breakBlock(h) {
    const W = game.world, p = game.player, bd = CM.blocks[h.id];
    let fill = B.AIR;
    if (h.y <= CM.SEA && [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([dx, dy, dz]) => W.get(h.x + dx, h.y + dy, h.z + dz) === B.WATER)) fill = B.WATER;
    W.set(h.x, h.y, h.z, fill);
    particles.burst(h.x + 0.5, h.y + 0.5, h.z + 0.5, CM.tileColor[bd.tex[2]], 10);
    CM.sfx('break');
    CM.buzz(12);
    const drops = [];
    if (bd.drop) drops.push([bd.drop, 1]);
    if (h.id === B.LEAVES && Math.random() < 0.2) drops.push([I.STICK, 1]);
    for (const [id, n] of drops) {
      if (p.addItem(id, n) > 0) ui.toast('Bag is full');
      else if (id >= 100) ui.toast('+' + n + ' ' + CM.info(id).name);
    }
  }

  function killMob(m) {
    let took = 0, name = '';
    for (const [id, lo, hi] of m.spec.drops || []) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (!n) continue;
      const got = n - game.player.addItem(id, n);
      if (got > 0) { took += got; name = CM.info(id).name; }
    }
    ui.toast(took ? '+' + took + ' ' + name : 'Bag is full');
    particles.burst(m.pos.x, m.pos.y + m.spec.h * 0.5, m.pos.z, 0x8e2a31, 14);
    mobs.remove(m);
  }

  function strike(mob, dx, dz, info) {
    game.attackCD = 0.35; game.swing = 1;
    mob.hit((info && info.damage) || 1, dx, dz);
    particles.burst(mob.pos.x, mob.pos.y + 0.7, mob.pos.z, 0x8e2a31, 6);
    CM.buzz(18);
    if (mob.dead) killMob(mob);
  }

  function useItem(hit, held, info) {
    const p = game.player, W = game.world;
    if (!held) return;
    if (hit && hit.id === B.CAMPFIRE && held.id === I.RAW_MEAT) {
      if (p.spaceFor(I.COOKED_MEAT) < 1) { ui.toast('Bag is full'); return; }
      p.takeSelected(); p.addItem(I.COOKED_MEAT, 1);
      CM.sfx('craft'); ui.toast('Roasted boar meat'); game.swing = 1;
      return;
    }
    if (info.food) {
      if (p.hunger >= 20) { ui.toast('You\u2019re full'); return; }
      p.hunger = Math.min(20, p.hunger + info.food);
      p.takeSelected(); CM.sfx('eat'); game.swing = 1;
      return;
    }
    if (!info.block || !hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (y < 0 || y >= CM.HEIGHT) return;
    const cur = W.get(x, y, z);
    if (cur < 0 || (cur !== B.AIR && !CM.blocks[cur].liquid)) return;
    const pp = p.pos;
    if (pp.x + 0.3 > x && pp.x - 0.3 < x + 1 && pp.z + 0.3 > z && pp.z - 0.3 < z + 1 && pp.y + 1.8 > y && pp.y < y + 1) return;
    if (mobs.occupies(x, y, z)) return;
    if (held.id === B.TORCH && !W.isSolid(x, y - 1, z)) { ui.toast('A torch needs solid ground'); return; }
    W.set(x, y, z, held.id);
    p.takeSelected(); CM.sfx('place'); CM.buzz(7); game.swing = 1;
  }

  function tick(dt) {
    const p = game.player, W = game.world, inp = input.poll();
    if (game.pendingSpawn) {
      W.update(p.pos.x, p.pos.z);
      const y = W.topY(Math.floor(p.pos.x), Math.floor(p.pos.z));
      if (y < 0) return;
      p.pos.y = y + 0.01; game.pendingSpawn = false;
    }
    p.yaw -= inp.lookDX;
    p.pitch = CM.clamp(p.pitch - inp.lookDY, -1.55, 1.55);
    p.update(dt, inp);
    W.update(p.pos.x, p.pos.z);
    game.clock += dt;

    game.eyeY += ((p.sneaking ? 1.46 : 1.62) - game.eyeY) * Math.min(1, dt * 11);
    const cp = Math.cos(p.pitch);
    const dir = { x: -Math.sin(p.yaw) * cp, y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * cp };
    const ex = p.pos.x, ey = p.pos.y + game.eyeY, ez = p.pos.z;
    const hit = W.raycast(ex, ey, ez, dir.x, dir.y, dir.z, 5);
    let mobHit = mobs.raycast(ex, ey, ez, dir.x, dir.y, dir.z, 3.5);
    if (mobHit && hit && hit.dist < mobHit.dist) mobHit = null;
    const held = p.held(), info = held ? CM.info(held.id) : null;

    // Press and hold anywhere on the view: dig whatever is under the thumb.
    let aimHit = null;
    if (inp.aimMine && inp.aimX >= 0) {
      const d = screenDir(inp.aimX, inp.aimY);
      aimHit = W.raycast(ex, ey, ez, d.x, d.y, d.z, 5);
    }
    const target = aimHit || (mobHit ? null : hit);
    highlight.visible = !!target;
    if (target) highlight.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);

    game.attackCD -= dt;
    if (mobHit && game.attackCD <= 0 && (inp.attackPressed || inp.mineHeld)) strike(mobHit.mob, dir.x, dir.z, info);

    // A quick tap on the world: swing at what it lands on, or use what you are holding there.
    if (inp.tapX >= 0) {
      const d = screenDir(inp.tapX, inp.tapY);
      const bh = W.raycast(ex, ey, ez, d.x, d.y, d.z, 5);
      let mh = mobs.raycast(ex, ey, ez, d.x, d.y, d.z, 4);
      if (mh && bh && bh.dist < mh.dist) mh = null;
      if (mh) { if (game.attackCD <= 0) strike(mh.mob, d.x, d.z, info); }
      else useItem(bh, held, info);
    }

    const digging = aimHit || (inp.mineHeld && !mobHit ? hit : null);
    if (digging) {
      const same = game.mining && game.mining.x === digging.x && game.mining.y === digging.y && game.mining.z === digging.z;
      if (!same) { game.mining = { x: digging.x, y: digging.y, z: digging.z }; game.miningP = 0; }
      const bd = CM.blocks[digging.id];
      if (bd.hardness !== Infinity) {
        game.miningP += dt / breakTime(bd, info);
        if (game.miningP >= 1) { breakBlock(digging); game.mining = null; game.miningP = 0; }
      }
    } else { game.mining = null; game.miningP = 0; }

    if (game.mining && game.miningP > 0.02) {
      crack.visible = true;
      crack.position.set(game.mining.x + 0.5, game.mining.y + 0.5, game.mining.z + 0.5);
      const stage = Math.min(7, Math.floor(game.miningP * 8));
      if (stage !== crackStage) { crackStage = stage; crack.material.map = crackTex[stage]; crack.material.needsUpdate = true; }
    } else if (crack.visible) { crack.visible = false; crackStage = -1; }

    game.useRepeat -= dt;
    if (inp.usePressed || (inp.useHeld && game.useRepeat <= 0)) { useItem(hit, p.held(), p.held() ? CM.info(p.held().id) : null); game.useRepeat = 0.3; }

    const night = 1 - CM.dayFactor(game.clock);
    mobs.update(dt, p, night);
    ambience.update(dt, p, night, game.clock);
    particles.update(dt);
    if (p.dead) { game.state = 'dead'; input.clear(); releaseLock(); ui.hide('inventory'); ui.showDeath(p.deathCause); }
    game.saveT += dt;
    if (game.saveT > 10) { game.saveT = 0; save(); }

    updateCamera(dt, dir);
    poseCaveman(dt);
    updateHand(dt);
    const fov = 72 + (p.sprinting ? 6 : 0);
    if (Math.abs(game.fov - fov) > 0.04) {
      game.fov += (fov - game.fov) * Math.min(1, dt * 7);
      camera.fov = game.fov;
      camera.updateProjectionMatrix();
    }
    ui.renderHud(p, dayLabel());
    ui.setCrosshair(Math.min(1, game.miningP), !!mobHit);
  }

  function updateCamera(dt, dir) {
    const p = game.player;
    const ex = p.pos.x, ey = p.pos.y + game.eyeY, ez = p.pos.z;
    if (game.cameraMode === 0) {
      game.bob += dt * p.moveAmt * (p.onGround ? 9 : 0);
      camera.position.set(ex, ey + Math.sin(game.bob) * 0.05 * Math.min(1, p.moveAmt), ez);
      camera.rotation.set(p.pitch, p.yaw, 0);
      caveman.group.visible = false;
    } else {
      const sign = game.cameraMode === 1 ? -1 : 1;
      const h = game.world.raycast(ex, ey, ez, dir.x * sign, dir.y * sign, dir.z * sign, 4.2);
      const dist = h ? Math.max(0.6, h.dist - 0.3) : 4;
      camera.position.set(ex + dir.x * sign * dist, ey + dir.y * sign * dist, ez + dir.z * sign * dist);
      camera.lookAt(ex, ey, ez);
      caveman.group.visible = true;
    }
  }

  function poseCaveman(dt) {
    const p = game.player;
    game.swing = Math.max(0, game.swing - dt * 4);
    caveman.group.position.copy(p.pos);
    caveman.group.rotation.y = p.yaw + Math.PI;
    caveman.head.rotation.x = -p.pitch * 0.8;
    game.walkPhase += dt * Math.hypot(p.vel.x, p.vel.z) * 2.2;
    const s = Math.sin(game.walkPhase) * 0.7 * Math.min(1, p.moveAmt);
    const chop = game.miningP > 0 ? Math.abs(Math.sin(performance.now() / 90)) * 1.2 : 0;
    caveman.legL.rotation.x = s; caveman.legR.rotation.x = -s;
    caveman.armL.rotation.x = -s; caveman.armR.rotation.x = s - game.swing * 1.6 - chop;
  }

  // ---------- sky & daylight ----------
  const DAY = new THREE.Color(0x8ec3e6), NIGHT = new THREE.Color(0x0c1120), DUSK = new THREE.Color(0xff8b3d), DEEP = new THREE.Color(0x1d3f78);
  // Sunlight has a colour as well as a brightness: white at noon, amber low in the sky,
  // cold blue after dark. Everything in the world is tinted by it.
  const SUN_HIGH = new THREE.Color(1, 1, 1), SUN_LOW = new THREE.Color(1, 0.6, 0.3), SUN_NIGHT = new THREE.Color(0.44, 0.55, 0.98);
  const skyLight = new THREE.Color(1, 1, 1), localCol = new THREE.Color(1, 1, 1);
  let lastLight = -1, lastWarm = -1;
  function updateSky() {
    const t = (game.clock / CM.DAY_LEN) % 1, ang = t * Math.PI * 2, sunY = Math.sin(ang);
    const k = CM.dayFactor(game.clock);
    const light = 0.14 + 0.86 * Math.pow(k, 1.35);
    // Amber holds while the sun is anywhere near the horizon, which is most of dawn and dusk.
    const warm = CM.clamp(1 - Math.abs(sunY) / 0.5, 0, 1) * k;
    skyLight.copy(SUN_NIGHT).lerp(SUN_HIGH, k).lerp(SUN_LOW, warm * 0.95);
    CM.music.setNight(1 - k);
    const under = game.state !== 'title' && game.player && game.player.headInWater;
    if (under) {
      skyColor.copy(DEEP).multiplyScalar(light);
      scene.fog.near = 1; scene.fog.far = 14;
    } else {
      skyColor.copy(NIGHT).lerp(DAY, k).lerp(DUSK, CM.clamp(1 - Math.abs(sunY) / 0.42, 0, 1) * 0.85 * Math.max(0.25, k));
      const far = CM.options.renderDist * CM.CHUNK;
      scene.fog.far = far; scene.fog.near = far * 0.5;
    }
    scene.fog.color.copy(skyColor);
    const c = camera.position;
    sun.position.set(c.x + Math.cos(ang) * 400, c.y + sunY * 400, c.z + 80); sun.lookAt(c);
    moon.position.set(c.x - Math.cos(ang) * 400, c.y - sunY * 400, c.z - 80); moon.lookAt(c);
    stars.position.copy(c);
    starMat.opacity = CM.clamp(1 - k * 1.6, 0, 1) * 0.9;
    clouds.position.set(c.x, 92, c.z);
    cloudTex.offset.set(c.x / 300 + game.clock * 0.0015, -c.z / 300);
    lightU.uDay.value = light;
    lightU.uSkyCol.value.copy(skyLight);
    updateLights();
    if (Math.abs(light - lastLight) > 0.004 || Math.abs(warm - lastWarm) > 0.01) {
      lastLight = light; lastWarm = warm;
      cloudMat.color.copy(skyLight).multiplyScalar(Math.max(0.1, light));
    }
    // The caveman, the boars, the item in your fist: all lit by the light where you stand,
    // so walking into a cave with a torch actually changes how they look.
    const p = game.player;
    const skyTerm = p ? game.world.skyExposure(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.6), Math.floor(p.pos.z)) * light : light;
    const torchTerm = game.torchLight || 0;
    const lvl = Math.max(skyTerm, torchTerm, 0.06);
    localCol.copy(skyLight).lerp(lightU.uTorchCol.value, torchTerm / Math.max(torchTerm + skyTerm, 0.001));
    for (const m of CM.tintMats) m.color.copy(m.userData.base).multiply(localCol).multiplyScalar(lvl);
  }

  function titleCamera(dt) {
    const c = game.titleCenter;
    game.titleAngle += dt * 0.07;
    camera.position.set(c.x + Math.cos(game.titleAngle) * 14, c.y + 5, c.z + Math.sin(game.titleAngle) * 14);
    camera.lookAt(c.x, c.y, c.z);
    caveman.group.visible = true;
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!game.world) return;
    const s = game.state;
    if (s === 'loading') {
      game.world.update(game.focus.x, game.focus.z);
      const pr = game.world.progress(game.focus.x, game.focus.z, Math.min(2, CM.options.renderDist));
      ui.setLoading(pr);
      if (pr >= 1) finishLoading();
      return;
    }
    if (s === 'playing') tick(dt);
    else if (s === 'title') {
      game.world.update(game.titleCenter.x, game.titleCenter.z);
      game.clock += dt;
      mobs.update(dt, game.player, 1 - CM.dayFactor(game.clock));
      ambience.update(dt, game.player, 1 - CM.dayFactor(game.clock), game.clock);
      poseCaveman(dt);
      updateHand(dt);
      titleCamera(dt);
    } else game.world.update(game.player.pos.x, game.player.pos.z);
    updateSky();
    renderer.render(scene, camera);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save(); game.pause(); CM.music.stop(); }
    else if (game.state !== 'loading') CM.music.start();
  });
  window.addEventListener('pagehide', save);

  ui.init(game);
  const saved = CM.store.get(CM.SAVE_KEY, null);
  if (saved && saved.v === 1 && typeof saved.seed === 'number') startWorld(saved, 'title');
  else startWorld(newWorldData(CM.randomWorldName(), ''), 'title');
  requestAnimationFrame(frame);
})(window.CM);
