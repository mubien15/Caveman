// Caveman \u2014 blocks, items, recipes, and procedurally painted textures/icons.
(function (CM) {
  const B = CM.B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, WATER: 6, LOG: 7, LEAVES: 8, PLANKS: 9, GLASS: 10,
    FLINT_ORE: 11, COAL_ORE: 12, BEDROCK: 13, MUDBRICK: 14, THATCH: 15, CAMPFIRE: 16, CLAY: 17, TORCH: 18 };
  const I = CM.I = { STICK: 100, FLINT_PICK: 101, FLINT_AXE: 102, CLUB: 103, RAW_MEAT: 104, COOKED_MEAT: 105, FLINT: 106, COAL: 107 };

  // tex = [top, bottom, side] atlas tile indices
  CM.blocks = [];
  function def(id, name, tex, o) {
    CM.blocks[id] = Object.assign({ id, name, tex, solid: true, opaque: true, liquid: false, leaves: false, hardness: 1, tool: null, drop: id, stack: 64, block: true, light: 0, slim: null }, o);
  }
  def(B.AIR, 'Air', [0, 0, 0], { solid: false, opaque: false, drop: 0 });
  def(B.GRASS, 'Grass', [0, 2, 1], { hardness: 0.6, drop: B.DIRT });
  def(B.DIRT, 'Dirt', [2, 2, 2], { hardness: 0.5 });
  def(B.STONE, 'Stone', [3, 3, 3], { hardness: 1.5, tool: 'pick', drop: B.COBBLE });
  def(B.COBBLE, 'Rubble', [4, 4, 4], { hardness: 1.8, tool: 'pick' });
  def(B.SAND, 'Sand', [5, 5, 5], { hardness: 0.5 });
  def(B.WATER, 'Water', [6, 6, 6], { solid: false, opaque: false, liquid: true, hardness: Infinity, drop: 0 });
  def(B.LOG, 'Log', [8, 8, 7], { hardness: 1.4, tool: 'axe' });
  def(B.LEAVES, 'Leaves', [9, 9, 9], { opaque: false, leaves: true, hardness: 0.25 });
  def(B.PLANKS, 'Planks', [10, 10, 10], { hardness: 1.1, tool: 'axe' });
  def(B.GLASS, 'Glass', [11, 11, 11], { opaque: false, hardness: 0.3, drop: 0 });
  def(B.FLINT_ORE, 'Flint seam', [12, 12, 12], { hardness: 2, tool: 'pick', drop: I.FLINT });
  def(B.COAL_ORE, 'Coal seam', [13, 13, 13], { hardness: 2, tool: 'pick', drop: I.COAL });
  def(B.BEDROCK, 'Bedrock', [14, 14, 14], { hardness: Infinity, drop: 0 });
  def(B.MUDBRICK, 'Mud brick', [15, 15, 15], { hardness: 1.4, tool: 'pick' });
  def(B.THATCH, 'Thatch', [16, 16, 16], { hardness: 0.4 });
  def(B.CAMPFIRE, 'Campfire', [18, 4, 17], { opaque: false, hardness: 0.6, tool: 'axe', light: 0.92 });
  def(B.CLAY, 'Clay', [19, 19, 19], { hardness: 0.6 });
  // A torch is a slim post rather than a full cube, and lights the dark around it.
  def(B.TORCH, 'Torch', [21, 20, 20], { solid: false, opaque: false, hardness: 0.05, light: 1, slim: [0.16, 0.62] });

  CM.items = {};
  function item(id, name, o) { CM.items[id] = Object.assign({ id, name, stack: 64, block: false }, o); }
  item(I.STICK, 'Stick');
  item(I.FLINT_PICK, 'Flint pick', { stack: 1, tool: 'pick', damage: 2 });
  item(I.FLINT_AXE, 'Flint axe', { stack: 1, tool: 'axe', damage: 3 });
  item(I.CLUB, 'Club', { stack: 1, damage: 4 });
  item(I.RAW_MEAT, 'Raw boar meat', { food: 3 });
  item(I.COOKED_MEAT, 'Roast boar', { food: 8 });
  item(I.FLINT, 'Flint');
  item(I.COAL, 'Coal');

  CM.info = id => (id >= 100 ? CM.items[id] : CM.blocks[id]);

  // Which footstep a block sounds like when you walk on it.
  const GROUND_OF = {
    [B.SAND]: 'sand', [B.CLAY]: 'sand', [B.STONE]: 'stone', [B.COBBLE]: 'stone', [B.BEDROCK]: 'stone',
    [B.FLINT_ORE]: 'stone', [B.COAL_ORE]: 'stone', [B.MUDBRICK]: 'stone', [B.GLASS]: 'stone',
    [B.LOG]: 'wood', [B.PLANKS]: 'wood', [B.LEAVES]: 'soft', [B.THATCH]: 'soft',
  };
  CM.groundSound = id => GROUND_OF[id] || 'grass';

  CM.recipes = [
    { out: [B.PLANKS, 4], ins: [[B.LOG, 1]] },
    { out: [I.STICK, 4], ins: [[B.PLANKS, 2]] },
    { out: [I.FLINT_PICK, 1], ins: [[I.FLINT, 3], [I.STICK, 2]] },
    { out: [I.FLINT_AXE, 1], ins: [[I.FLINT, 2], [I.STICK, 2]] },
    { out: [I.CLUB, 1], ins: [[B.LOG, 1], [I.FLINT, 1]] },
    { out: [B.TORCH, 4], ins: [[I.STICK, 1], [I.COAL, 1]] },
    { out: [B.CAMPFIRE, 1], ins: [[I.STICK, 3], [I.COAL, 1]] },
    { out: [B.THATCH, 2], ins: [[B.LEAVES, 4]] },
    { out: [B.MUDBRICK, 4], ins: [[B.CLAY, 2], [B.SAND, 2]] },
    { out: [B.GLASS, 4], ins: [[B.SAND, 4], [I.COAL, 1]] },
  ];

  // ---------- texture painting ----------
  const TILE = 16, ATLAS_N = 16;
  const rnd = CM.mulberry32(20260913);
  const cl = v => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const vary = (c, a) => { const d = (rnd() * 2 - 1) * a; return [cl(c[0] + d), cl(c[1] + d), cl(c[2] + d)]; };

  function paint(fn) {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(TILE, TILE);
    const px = (i, j, col, a) => {
      if (i < 0 || j < 0 || i >= TILE || j >= TILE) return;
      const k = (j * TILE + i) * 4;
      img.data[k] = col[0]; img.data[k + 1] = col[1]; img.data[k + 2] = col[2]; img.data[k + 3] = a === undefined ? 255 : a;
    };
    fn(px);
    ctx.putImageData(img, 0, 0);
    return c;
  }
  const fill = (px, base, amt) => { const b = hex(base); for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) px(i, j, vary(b, amt)); };
  const specks = (px, col, n, amt) => { const c = hex(col); for (let k = 0; k < n; k++) px((rnd() * 16) | 0, (rnd() * 16) | 0, vary(c, amt || 8)); };
  const cluster = (px, col, hi, n) => {
    for (let k = 0; k < n; k++) {
      const cx = 2 + ((rnd() * 12) | 0), cy = 2 + ((rnd() * 12) | 0), sz = 3 + ((rnd() * 3) | 0);
      for (let s = 0; s < sz; s++) { px(cx + ((rnd() * 3) | 0) - 1, cy + ((rnd() * 3) | 0) - 1, vary(hex(col), 8)); }
      px(cx, cy, hex(hi));
    }
  };
  const stoneBase = px => { fill(px, '#86847f', 12); for (let k = 0; k < 7; k++) { const x = (rnd() * 14) | 0, y = (rnd() * 16) | 0, l = 2 + ((rnd() * 3) | 0); for (let i = 0; i < l; i++) px(x + i, y, vary(hex('#6d6b67'), 6)); } specks(px, '#a09e98', 10); };
  const dirtBase = px => { fill(px, '#8a5b3a', 16); specks(px, '#6b4429', 22); specks(px, '#a57551', 8); };

  const painters = [
    /* 0 grass top */ px => { fill(px, '#6c9f43', 20); specks(px, '#86b955', 16); specks(px, '#507d31', 16); },
    /* 1 grass side */ px => { dirtBase(px); for (let i = 0; i < 16; i++) { const d = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0); for (let j = 0; j < d; j++) px(i, j, vary(hex('#6c9f43'), 18)); } },
    /* 2 dirt */ dirtBase,
    /* 3 stone */ stoneBase,
    /* 4 rubble */ px => {
      const pts = []; for (let k = 0; k < 9; k++) pts.push([rnd() * 16, rnd() * 16, 0.85 + rnd() * 0.3]);
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        let d1 = 99, d2 = 99, best = 0;
        for (let k = 0; k < pts.length; k++) {
          let dx = Math.abs(i + 0.5 - pts[k][0]); dx = Math.min(dx, 16 - dx);
          let dy = Math.abs(j + 0.5 - pts[k][1]); dy = Math.min(dy, 16 - dy);
          const d = Math.hypot(dx, dy);
          if (d < d1) { d2 = d1; d1 = d; best = k; } else if (d < d2) d2 = d;
        }
        if (d2 - d1 < 1.1) px(i, j, vary([72, 69, 65], 8));
        else { const s = pts[best][2] * (1 - Math.min(d1, 5) / 14); px(i, j, vary([150 * s, 146 * s, 138 * s], 9)); }
      }
    },
    /* 5 sand */ px => { fill(px, '#dcca97', 10); specks(px, '#c4b07c', 24); specks(px, '#ebdcb0', 10); },
    /* 6 water */ px => { const b = hex('#3b6fc4'); for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) px(i, j, vary(b, 8), 205); for (let k = 0; k < 6; k++) { const x = (rnd() * 12) | 0, y = (rnd() * 16) | 0; for (let i = 0; i < 4; i++) px(x + i, y, hex('#6394e0'), 215); } },
    /* 7 log side */ px => { for (let i = 0; i < 16; i++) { const groove = rnd() < 0.28; const c = hex(groove ? '#4f351d' : '#6b4a2c'); for (let j = 0; j < 16; j++) px(i, j, vary(c, groove ? 6 : 12)); } },
    /* 8 log top */ px => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const d = Math.hypot(i - 7.5, j - 7.5); px(i, j, vary(hex(d > 6.6 ? '#5a3d22' : (Math.floor(d) % 2 ? '#b58b58' : '#a07747')), 8)); } },
    /* 9 leaves */ px => { for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { if (rnd() < 0.16) continue; px(i, j, vary(hex(rnd() < 0.2 ? '#58963f' : '#3f7a2f'), 18)); } },
    /* 10 planks */ px => { for (let j = 0; j < 16; j++) { const row = (j / 4) | 0, seamX = (row * 7 + 3) % 16; for (let i = 0; i < 16; i++) { const seam = j % 4 === 3 || i === seamX; px(i, j, vary(hex(seam ? '#7a5631' : '#b0834f'), seam ? 5 : 9)); } } },
    /* 11 glass */ px => { const f = hex('#d6ecf2'); for (let i = 0; i < 16; i++) { px(i, 0, f, 235); px(i, 15, f, 235); px(0, i, f, 235); px(15, i, f, 235); } for (let k = 0; k < 4; k++) { px(3 + k, 6 - k, f, 230); px(9 + k, 12 - k, f, 230); } },
    /* 12 flint seam */ px => { stoneBase(px); cluster(px, '#2b2f3a', '#6b7488', 4); },
    /* 13 coal seam */ px => { stoneBase(px); cluster(px, '#1e1e20', '#4a4a50', 4); },
    /* 14 bedrock */ px => { fill(px, '#555350', 18); specks(px, '#2d2c2a', 40, 6); specks(px, '#7a7874', 16, 6); },
    /* 15 mud brick */ px => { for (let j = 0; j < 16; j++) { const off = ((j / 4) | 0) % 2 ? 4 : 0; for (let i = 0; i < 16; i++) { const mortar = j % 4 === 3 || (i + off) % 8 === 7; px(i, j, vary(hex(mortar ? '#6e4a36' : '#a2553a'), mortar ? 5 : 12)); } } },
    /* 16 thatch */ px => { fill(px, '#c9a44a', 10); for (let k = 0; k < 46; k++) { const x = (rnd() * 16) | 0, y = (rnd() * 16) | 0, l = 3 + ((rnd() * 4) | 0), c = hex(k % 2 ? '#e0bd62' : '#9d7a2f'); for (let s = 0; s < l; s++) px(x + (k % 3 === 0 ? s >> 1 : 0), y + s, vary(c, 6)); } },
    /* 17 campfire side */ px => {
      for (let i = 0; i < 16; i++) for (let j = 13; j < 16; j++) px(i, j, vary(hex((i + j) % 4 ? '#7b7873' : '#4a4744'), 8));
      for (let i = 1; i < 15; i++) for (let j = 10; j < 13; j++) px(i, j, vary(hex(j === 11 ? '#6b4a2c' : '#4f351d'), 8));
      for (let i = 2; i < 14; i++) { const h = 8 - Math.abs(i - 7.5) * 1.1 + rnd() * 2; for (let j = 0; j < h; j++) { const y = 9 - j; const inner = Math.abs(i - 7.5) < 2.5 && j < h - 2; px(i, y, hex(inner ? '#ffd35a' : j > h - 2 ? '#c9401c' : '#f08a24')); } }
    },
    /* 18 campfire top */ px => { for (let k = 0; k < 16; k++) { px(k, k, hex('#6b4a2c')); px(k, 15 - k, hex('#6b4a2c')); px(k + 1, k, hex('#4f351d')); } for (let j = 5; j < 11; j++) for (let i = 5; i < 11; i++) if (rnd() < 0.7) px(i, j, hex(rnd() < 0.5 ? '#ff9a3c' : '#ffd35a')); },
    /* 19 clay */ px => { fill(px, '#9fa6b2', 9); specks(px, '#8a919d', 18); },
    /* 20 torch side */ px => {
      for (let j = 6; j < 16; j++) for (let i = 0; i < 16; i++) {
        const grain = i < 3 ? '#4f351d' : i > 12 ? '#5a3d22' : '#6b4a2c';
        px(i, j, vary(hex(grain), 8));
      }
      for (let j = 0; j < 6; j++) for (let i = 0; i < 16; i++) {
        const core = i > 2 && i < 13 && j > 0;
        px(i, j, vary(hex(core ? (j > 2 ? '#ffe9a0' : '#ffc24a') : '#e2761f'), 10));
      }
    },
    /* 21 torch top */ px => {
      for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
        const d = Math.max(Math.abs(i - 7.5), Math.abs(j - 7.5));
        px(i, j, vary(hex(d < 3 ? '#ffeeb0' : d < 6 ? '#ffc24a' : '#e2761f'), 8));
      }
    },
  ];

  // Break stages: the same handful of cracks, spreading a little further at each stage,
  // drawn black on white so they can be multiplied over whatever block is being mined.
  CM.crackStages = function () {
    const rnd2 = CM.mulberry32(99173);
    const paths = [];
    for (let k = 0; k < 6; k++) {
      const pts = [];
      let x = 2 + rnd2() * 12, y = 2 + rnd2() * 12, a = rnd2() * 6.283;
      pts.push([x, y]);
      for (let step = 0; step < 9; step++) {
        a += (rnd2() - 0.5) * 0.9;                  // wanders, but keeps going outward
        x = CM.clamp(x + Math.cos(a) * 2.2, 0, 16);
        y = CM.clamp(y + Math.sin(a) * 2.2, 0, 16);
        pts.push([x, y]);
      }
      paths.push(pts);
    }
    const out = [];
    for (let stage = 0; stage < 8; stage++) {
      const c = document.createElement('canvas');
      c.width = c.height = TILE;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, TILE, TILE);
      ctx.strokeStyle = 'rgba(24,20,17,0.8)';
      ctx.lineWidth = 1;
      ctx.lineCap = 'square';
      const grown = (stage + 1) / 8;
      paths.forEach((pts, i) => {
        if (i / paths.length > grown) return;       // later cracks only open up near the end
        const n = Math.max(2, Math.round(pts.length * grown));
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let j = 1; j < n; j++) ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      });
      out.push(c);
    }
    return out;
  };

  CM.tiles = [];
  CM.tileColor = [];
  CM.buildAtlas = function () {
    const atlas = document.createElement('canvas');
    atlas.width = atlas.height = TILE * ATLAS_N;
    const ctx = atlas.getContext('2d');
    painters.forEach((fn, i) => {
      const c = paint(fn);
      CM.tiles[i] = c;
      ctx.drawImage(c, (i % ATLAS_N) * TILE, ((i / ATLAS_N) | 0) * TILE);
      const d = c.getContext('2d').getImageData(0, 0, TILE, TILE).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 128) { r += d[k]; g += d[k + 1]; b += d[k + 2]; n++; }
      CM.tileColor[i] = n ? (((r / n) | 0) << 16) | (((g / n) | 0) << 8) | ((b / n) | 0) : 0x888888;
    });
    return atlas;
  };
  CM.ATLAS_N = ATLAS_N;

  // ---------- item pixel art ----------
  const PAL = { b: '#7a5230', B: '#553820', f: '#3a3f4c', F: '#6b7488', r: '#c8454a', R: '#8e2a31', g: '#e98f8f', w: '#efe4cf', W: '#bfb29a', c: '#8a4a24', C: '#b96b36', k: '#1d1d1f', K: '#55555c' };
  const ART = {
    [I.STICK]: ['', '', '............bB', '...........bB', '..........bB', '.........bB', '........bB', '.......bB', '......bB', '.....bB', '....bB', '...bB', '..bB', '.bB'],
    [I.FLINT_PICK]: ['', '.....FFFFFF', '...FFffffffFF', '..Ff...bB...fF', '..f....bB....f', '.......bB', '.......bB', '.......bB', '.......bB', '.......bB', '.......bB', '.......bB', '.......bB', '.......bB'],
    [I.FLINT_AXE]: ['', '......bB.FFF', '......bBFfffF', '......bBffffff', '......bBfffffF', '......bBFffff', '......bB.FFf', '......bB', '......bB', '......bB', '......bB', '......bB', '......bB', '......bB'],
    [I.CLUB]: ['', '..........BbbB', '.........Bbbbbb', '.........bbBbbb', '........Bbbbbbb', '........bbbbbB', '.......Bbbbbb', '......bbB', '.....bbB', '....bbB', '...bbB', '..bbB', '.bbB', '.BB'],
    [I.RAW_MEAT]: ['', '', '.....RRRR', '....RrrrrR', '...RrrgrrrR', '...RrrrrrrrR', '...RrrrrgrrR', '....RrrrrrrR', '.....RRrrrR', '.......RRRw', '.........Ww', '..........wW', '.........wwWw', '.........Ww.W'],
    [I.COOKED_MEAT]: ['', '', '.....cccc', '....cCCCCc', '...cCCcCCCc', '...cCCCCCCCc', '...cCCCCcCCc', '....cCCCCCCc', '.....ccCCCc', '.......cccw', '.........Ww', '..........wW', '.........wwWw', '.........Ww.W'],
    [I.FLINT]: ['', '', '.......FF', '......FffF', '.....Fffff', '....Fffffff', '....ffFffff', '...Ffffffffff', '...fffffFffff', '....ffffffff', '.....ffffff', '......ffff'],
    [I.COAL]: ['', '', '', '.....kkkk', '....kKkkkk', '...kkkkKkkk', '..kkKkkkkkk', '..kkkkkkKkk', '...kkkKkkkk', '....kkkkkk', '.....kkkk'],
  };

  const iconCache = {}, canvasCache = {};
  CM.icon = function (id) {
    if (iconCache[id]) return iconCache[id];
    return (iconCache[id] = CM.iconCanvas(id).toDataURL());
  };
  CM.iconCanvas = function (id) {
    if (canvasCache[id]) return canvasCache[id];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (id >= 100) {
      const rows = ART[id] || [];
      rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const col = PAL[row[i]]; if (col) { ctx.fillStyle = col; ctx.fillRect(i * 4, (j + 1) * 4, 4, 4); } } });
    } else {
      const bd = CM.blocks[id];
      const top = CM.tiles[bd.tex[0]], side = CM.tiles[bd.tex[2]];
      const face = (img, a, b, cc, d, e, f, shade) => {
        ctx.setTransform(a, b, cc, d, e, f);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(img, 0, 0);
        if (shade) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(0,0,0,' + shade + ')'; ctx.fillRect(0, 0, 16, 16); }
      };
      face(side, 1.75, 0.875, 0, 1.875, 4, 18, 0.28);
      face(side, 1.75, -0.875, 0, 1.875, 32, 32, 0.12);
      face(top, 1.75, 0.875, -1.75, 0.875, 32, 4, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    return (canvasCache[id] = c);
  };
})(window.CM);
