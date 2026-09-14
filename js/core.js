// Caveman \u2014 shared namespace, noise, storage, options and sound.
window.CM = window.CM || {};
(function (CM) {
  CM.CHUNK = 16;
  CM.HEIGHT = 64;
  CM.SEA = 20;
  CM.DAY_LEN = 600; // seconds per full day
  CM.SAVE_KEY = 'caveman.world.v1';
  CM.isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);

  CM.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // 1 in full daylight, 0 deep at night. The sky, the music and what prowls about all read this.
  CM.dayFactor = function (clock) {
    const sunY = Math.sin(((clock / CM.DAY_LEN) % 1) * Math.PI * 2);
    return CM.clamp((sunY + 0.14) / 0.44, 0, 1);
  };

  // Daylight reaching a cell, given the highest cover above it (anything, and anything solid).
  // Leaves only dapple the ground; rock and dirt shut the light out properly.
  CM.skyFalloff = function (y, topAny, topSolid) {
    if (y > topAny) return 1;
    if (y > topSolid) return Math.max(0.5, 1 - (topAny - y) / 12);
    return Math.max(0.045, 1 - (topSolid - y) / 7);
  };

  CM.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  CM.seedFromString = function (s) {
    s = String(s).trim();
    if (/^-?\d+$/.test(s)) return Math.abs(parseInt(s, 10)) % 2147483647;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 2147483647;
  };

  // Seeded 3D gradient noise plus cheap integer hashes.
  CM.makeNoise = function (seed) {
    const rand = CM.mulberry32(seed);
    const perm = [];
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const G = [1,1,0, -1,1,0, 1,-1,0, -1,-1,0, 1,0,1, -1,0,1, 1,0,-1, -1,0,-1, 0,1,1, 0,-1,1, 0,1,-1, 0,-1,-1];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + t * (b - a);
    const grad = (h, x, y, z) => { const k = (h % 12) * 3; return G[k] * x + G[k + 1] * y + G[k + 2] * z; };

    function n3(x, y, z) {
      const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
      const X = fx & 255, Y = fy & 255, Z = fz & 255;
      x -= fx; y -= fy; z -= fz;
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
             lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
             lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    }
    function fbm2(x, z, oct) {
      let sum = 0, amp = 1, norm = 0, f = 1;
      for (let i = 0; i < oct; i++) { sum += amp * n3(x * f, z * f, 0.37 + i * 11.3); norm += amp; amp *= 0.5; f *= 2; }
      return sum / norm;
    }
    function hash3(x, y, z) {
      let h = (seed | 0) + Math.imul(x | 0, 0x27d4eb2d) + Math.imul(y | 0, 0x165667b1) + Math.imul(z | 0, 0x1b873593);
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
      h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    }
    const hash2 = (x, z) => hash3(x, 9173, z);
    return { n3, fbm2, hash2, hash3 };
  };

  // localStorage can be missing or throw inside sandboxes \u2014 never let it break the game.
  CM.store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  CM.options = Object.assign({ renderDist: CM.isTouch ? 3 : 4, sensitivity: 1, sound: true, music: true, haptics: true, tapToMine: true }, CM.store.get('caveman.options', {}));
  CM.saveOptions = () => CM.store.set('caveman.options', CM.options);

  const FIRST = ['Flint', 'Ember', 'Mammoth', 'Ochre', 'Tusk', 'Ash', 'Boulder', 'Moss', 'Antler', 'Smoke', 'Thunder', 'Bison'];
  const SECOND = ['Hollow', 'Ridge', 'Vale', 'Basin', 'Hills', 'Crag', 'Gorge', 'Meadow', 'Cove', 'Steppe', 'Bluff', 'Glen'];
  CM.randomWorldName = () => FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' + SECOND[Math.floor(Math.random() * SECOND.length)];

  // ---- tiny synthesized sound effects ----
  let actx = null;
  CM.audioUnlock = function () {
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) { /* no audio */ }
  };
  const TONES = {
    hit: [240, 90, 'square', 0.12], hurt: [200, 70, 'sawtooth', 0.22], eat: [430, 260, 'triangle', 0.14],
    craft: [520, 820, 'triangle', 0.16], pop: [680, 1000, 'sine', 0.1], squeal: [900, 500, 'square', 0.18],
    growl: [130, 78, 'sawtooth', 0.3, 0.07], howl: [420, 300, 'sine', 0.9, 0.06], chirp: [1800, 2600, 'sine', 0.06, 0.04],
    bleat: [520, 380, 'triangle', 0.22, 0.06],
  };
  // What the ground sounds like underfoot: [filter cutoff, loudness].
  const GROUND = {
    grass: [520, 0.15], sand: [340, 0.13], stone: [1100, 0.16], wood: [700, 0.15], soft: [420, 0.12],
  };
  CM.sfx = function (kind, ground) {
    if (!CM.options.sound || !actx || actx.state !== 'running') return;
    try {
      const t = actx.currentTime;
      const out = actx.createGain();
      out.connect(actx.destination);
      if (kind === 'break' || kind === 'place' || kind === 'step' || kind === 'land' || kind === 'jump') {
        const g = GROUND[ground] || GROUND.grass;
        const len = kind === 'break' ? 0.2 : kind === 'land' ? 0.17 : kind === 'jump' ? 0.07 : 0.1;
        const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * len), actx.sampleRate);
        const d = buf.getChannelData(0);
        const shape = kind === 'land' ? 1.4 : 2;
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, shape);
        const src = actx.createBufferSource();
        src.buffer = buf;
        // A little wobble in pitch and level keeps a walk from sounding like a metronome.
        src.playbackRate.value = kind === 'step' ? 0.9 + Math.random() * 0.25 : 1;
        const f = actx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = kind === 'break' ? 1500 : kind === 'place' ? 800
          : kind === 'land' ? g[0] * 0.5 : kind === 'jump' ? g[0] * 0.8 : g[0];
        out.gain.value = kind === 'break' || kind === 'place' ? 0.35
          : kind === 'land' ? g[1] * 1.9 : kind === 'jump' ? g[1] * 0.5 : g[1] * (0.85 + Math.random() * 0.3);
        src.connect(f); f.connect(out); src.start(t);
        if (kind === 'land') {                       // a soft thump under the scuff
          const o = actx.createOscillator(), og = actx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(150, t);
          o.frequency.exponentialRampToValueAtTime(62, t + 0.14);
          og.gain.setValueAtTime(0.16, t);
          og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          o.connect(og); og.connect(actx.destination);
          o.start(t); o.stop(t + 0.22);
        }
      } else {
        const m = TONES[kind] || TONES.pop;
        const o = actx.createOscillator();
        o.type = m[2];
        o.frequency.setValueAtTime(m[0], t);
        o.frequency.exponentialRampToValueAtTime(m[1], t + m[3]);
        out.gain.setValueAtTime(m[4] === undefined ? 0.16 : m[4], t);
        out.gain.exponentialRampToValueAtTime(0.001, t + m[3] + 0.05);
        o.connect(out); o.start(t); o.stop(t + m[3] + 0.08);
      }
    } catch (e) { /* ignore */ }
  };

  // Short taps of haptic feedback — silently absent on desktop and iOS Safari.
  CM.buzz = function (ms) {
    if (!CM.options.haptics) return;
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ }
  };

  // ---- generative ambient score ----
  // A continuous wavering pad rather than played notes: four sustained voices that drift in
  // pitch and swell independently, gliding to a new chord every so often. It never stops and
  // never lands on a beat, so there is no gap to notice and nothing to pick out as a "note".
  CM.music = (function () {
    const C3 = 130.81;
    const DAY_CHORDS = [[0, 7, 12, 16], [-3, 4, 9, 12], [-7, 5, 9, 12], [-5, 2, 7, 11]];
    const NIGHT_CHORDS = [[-3, 4, 9, 12], [-10, 2, 5, 9], [-7, 5, 9, 12], [-8, 4, 7, 11]];
    const semi = n => C3 * Math.pow(2, n / 12);

    let master = null, wash = null, lp = null, voices = null, timer = 0, retry = 0, bar = 0, playing = false, night = 0;

    function build() {
      master = actx.createGain();
      master.gain.value = 0.0001;
      const squash = actx.createDynamicsCompressor();
      squash.threshold.value = -24; squash.knee.value = 16; squash.ratio.value = 6;
      squash.attack.value = 0.02; squash.release.value = 0.5;
      lp = actx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.2;
      wash = actx.createGain();
      wash.gain.value = 0.6;
      const d1 = actx.createDelay(2), d2 = actx.createDelay(2), fb = actx.createGain();
      d1.delayTime.value = 0.53; d2.delayTime.value = 0.79; fb.gain.value = 0.3;
      wash.connect(d1); d1.connect(fb); fb.connect(d2); d2.connect(lp);
      wash.connect(lp);
      lp.connect(master);
      master.connect(squash);
      squash.connect(actx.destination);

      voices = [];
      for (let i = 0; i < 4; i++) {
        const osc = actx.createOscillator();
        osc.type = i === 2 ? 'triangle' : 'sine';
        osc.frequency.value = semi(DAY_CHORDS[0][i]);

        const vg = actx.createGain();
        const base = 0.05 - i * 0.006;
        vg.gain.value = base;

        // Slow swell, so the pad breathes instead of sitting still.
        const amp = actx.createOscillator(), ampDepth = actx.createGain();
        amp.frequency.value = 0.045 + i * 0.019;
        ampDepth.gain.value = base * 0.55;
        amp.connect(ampDepth); ampDepth.connect(vg.gain);

        // A few cents of drift each, which is what makes it waver rather than hum.
        const drift = actx.createOscillator(), driftDepth = actx.createGain();
        drift.frequency.value = 0.06 + i * 0.014;
        driftDepth.gain.value = 5 + i;
        drift.connect(driftDepth); driftDepth.connect(osc.detune);

        osc.connect(vg); vg.connect(wash);
        osc.start(); amp.start(); drift.start();
        voices.push(osc);
      }
    }

    function drift() {
      if (!playing) return;
      const t = actx.currentTime;
      const dark = night > 0.5;
      const chord = (dark ? NIGHT_CHORDS : DAY_CHORDS)[bar % 4];
      lp.frequency.setTargetAtTime(dark ? 620 : 1000, t, 6);
      // Glide, never jump: each voice takes several seconds to arrive at its new note.
      voices.forEach((o, i) => o.frequency.setTargetAtTime(semi(chord[i]), t, 3.5));
      bar++;
      timer = setTimeout(drift, (dark ? 19000 : 16000));
    }

    return {
      start() {
        if (!CM.options.music) return;
        CM.audioUnlock();
        if (!actx) return;
        // Safari resumes asynchronously, so keep looking rather than giving up for the session.
        if (actx.state !== 'running') {
          if (!retry) retry = setInterval(() => {
            if (!actx || actx.state === 'running') { clearInterval(retry); retry = 0; CM.music.start(); }
          }, 500);
          return;
        }
        if (retry) { clearInterval(retry); retry = 0; }
        if (playing) return;
        try {
          if (!master) build();
          playing = true;
          master.gain.cancelScheduledValues(actx.currentTime);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), actx.currentTime);
          master.gain.exponentialRampToValueAtTime(0.3, actx.currentTime + 6);
          drift();
        } catch (e) { playing = false; }
      },
      stop() {
        if (retry) { clearInterval(retry); retry = 0; }
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        try {
          master.gain.cancelScheduledValues(actx.currentTime);
          master.gain.setValueAtTime(master.gain.value, actx.currentTime);
          master.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 2);
        } catch (e) { /* ignore */ }
      },
      setNight(v) { night = v; },
      toggle(on) { if (on) this.start(); else this.stop(); },
    };
  })();

})(window.CM);
