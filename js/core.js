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
  };
  CM.sfx = function (kind) {
    if (!CM.options.sound || !actx || actx.state !== 'running') return;
    try {
      const t = actx.currentTime;
      const out = actx.createGain();
      out.connect(actx.destination);
      if (kind === 'break' || kind === 'place' || kind === 'step') {
        const len = kind === 'break' ? 0.2 : 0.09;
        const buf = actx.createBuffer(1, Math.floor(actx.sampleRate * len), actx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
        const src = actx.createBufferSource();
        src.buffer = buf;
        const f = actx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = kind === 'break' ? 1500 : kind === 'place' ? 800 : 500;
        out.gain.value = kind === 'step' ? 0.06 : 0.35;
        src.connect(f); f.connect(out); src.start(t);
      } else {
        const m = TONES[kind] || TONES.pop;
        const o = actx.createOscillator();
        o.type = m[2];
        o.frequency.setValueAtTime(m[0], t);
        o.frequency.exponentialRampToValueAtTime(m[1], t + m[3]);
        out.gain.setValueAtTime(0.16, t);
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
  // Slow pentatonic pads over a root drone. Brighter by day, darker at night.
  CM.music = (function () {
    const ROOT = 110; // A2
    const PENT = [0, 3, 5, 7, 10];                       // minor pentatonic steps
    const DAY_CHORDS = [[0, 7, 12], [5, 12, 17], [3, 10, 15], [7, 14, 19]];
    const NIGHT_CHORDS = [[0, 3, 10], [3, 10, 14], [-2, 5, 12], [0, 7, 15]];
    const semi = n => ROOT * Math.pow(2, n / 12);

    let master = null, wash = null, lp = null, drone = null, timer = 0, bar = 0, playing = false, night = 0;

    function build() {
      master = actx.createGain();
      master.gain.value = 0;
      lp = actx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.4;
      // A pair of delays stands in for a reverb tail without the cost of a convolver.
      wash = actx.createGain();
      wash.gain.value = 0.34;
      const d1 = actx.createDelay(1.5), d2 = actx.createDelay(1.5), fb = actx.createGain();
      d1.delayTime.value = 0.37; d2.delayTime.value = 0.61; fb.gain.value = 0.38;
      wash.connect(d1); d1.connect(fb); fb.connect(d2); d2.connect(lp);
      wash.connect(lp);
      lp.connect(master);
      master.connect(actx.destination);
    }

    function voice(freq, t, dur, peak, type) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.42);   // long swell in
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);        // long fade out
      o.connect(g); g.connect(wash);
      o.start(t); o.stop(t + dur + 0.1);
    }

    function schedule() {
      if (!playing) return;
      const t = actx.currentTime + 0.1, len = 9.5;
      const chords = night > 0.5 ? NIGHT_CHORDS : DAY_CHORDS;
      const chord = chords[bar % chords.length];
      lp.frequency.setTargetAtTime(night > 0.5 ? 620 : 1150, t, 3);
      for (let i = 0; i < chord.length; i++) {
        voice(semi(chord[i]) * (i ? 1 : 0.5), t + i * 0.5, len, 0.05 - i * 0.008, i === 1 ? 'triangle' : 'sine');
      }
      // A sparse note on top, often left out so the pad can breathe.
      if (Math.random() < 0.62) {
        const step = PENT[Math.floor(Math.random() * PENT.length)] + (Math.random() < 0.4 ? 12 : 24);
        voice(semi(step), t + 1.4 + Math.random() * 4, 4.5, 0.035, 'triangle');
      }
      bar++;
      timer = setTimeout(schedule, len * 700);
    }

    return {
      start() {
        if (playing || !CM.options.music) return;
        CM.audioUnlock();
        if (!actx || actx.state !== 'running') return;
        try {
          if (!master) build();
          playing = true;
          master.gain.cancelScheduledValues(actx.currentTime);
          master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), actx.currentTime);
          master.gain.linearRampToValueAtTime(0.5, actx.currentTime + 4);
          if (!drone) {
            drone = actx.createOscillator();
            const dg = actx.createGain();
            dg.gain.value = 0.035;
            drone.type = 'sine';
            drone.frequency.value = ROOT / 2;
            drone.connect(dg); dg.connect(lp);
            drone.start();
          }
          schedule();
        } catch (e) { playing = false; }
      },
      stop() {
        if (!playing) return;
        playing = false;
        clearTimeout(timer);
        try {
          master.gain.cancelScheduledValues(actx.currentTime);
          master.gain.setValueAtTime(master.gain.value, actx.currentTime);
          master.gain.linearRampToValueAtTime(0.0001, actx.currentTime + 2);
        } catch (e) { /* ignore */ }
      },
      // 0 = daylight, 1 = deep night; shifts the harmony and the filter.
      setNight(v) { night = v; },
      toggle(on) { if (on) this.start(); else this.stop(); },
    };
  })();
})(window.CM);
