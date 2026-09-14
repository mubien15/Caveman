// Caveman — keyboard, mouse (pointer lock or drag-to-look) and touch controls.
(function (CM) {
  const canvas = document.getElementById('view');
  const joyEl = document.getElementById('joystick'), knob = document.getElementById('knob');
  const JOY_R = 50, SPRINT_AT = 0.92, TAP_MS = 200, TAP_SLOP = 14;
  const joy = { id: null, ox: 0, oy: 0, sprintSince: 0 };
  const look = { id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: 0, aiming: false };
  let drag = 0;

  const input = CM.input = {
    keys: {}, joyX: 0, joyY: 0, joyActive: false, lookDX: 0, lookDY: 0,
    mouseLeft: false, touchMine: false, touchJump: false, useHeld: false, usePressed: false, attackPressed: false,
    sneak: false, sprintTouch: false, locked: false, lastTouch: 0,
    aimMine: false, aimX: -1, aimY: -1, tapX: -1, tapY: -1,
  };
  const playing = () => CM.game && CM.game.state === 'playing';
  const recentTouch = () => performance.now() - input.lastTouch < 800;

  input.poll = function () {
    const k = input.keys;
    let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let strafe = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let autoJump = false, mag = 0;
    if (input.joyActive) {
      mag = Math.hypot(input.joyX, input.joyY);
      if (mag > 0.15) { fwd = -input.joyY; strafe = input.joyX; autoJump = true; }
      // held at full stretch for a moment = break into a run
      const now = performance.now();
      if (mag > SPRINT_AT) { if (!joy.sprintSince) joy.sprintSince = now; } else joy.sprintSince = 0;
      const running = !!joy.sprintSince && now - joy.sprintSince > 130;
      if (running !== input.sprintTouch) { input.sprintTouch = running; joyEl.classList.toggle('sprint', running); }
    }
    const keySprint = !!(k.ShiftLeft || k.ShiftRight) && fwd > 0;
    const out = {
      fwd, strafe, autoJump,
      jump: !!(k.Space || input.touchJump),
      mineHeld: input.mouseLeft || input.touchMine,
      useHeld: input.useHeld, usePressed: input.usePressed, attackPressed: input.attackPressed,
      lookDX: input.lookDX, lookDY: input.lookDY,
      sneak: input.sneak || !!(k.KeyZ || k.ControlLeft),
      sprint: keySprint || (input.sprintTouch && mag > SPRINT_AT),
      aimMine: input.aimMine, aimX: input.aimX, aimY: input.aimY,
      tapX: input.tapX, tapY: input.tapY,
    };
    input.usePressed = false; input.attackPressed = false; input.lookDX = 0; input.lookDY = 0;
    input.tapX = input.tapY = -1;
    return out;
  };

  input.clear = function () {
    input.keys = {};
    input.mouseLeft = input.touchMine = input.touchJump = input.useHeld = input.usePressed = input.attackPressed = false;
    input.lookDX = input.lookDY = 0;
    input.aimMine = false; input.aimX = input.aimY = -1; input.tapX = input.tapY = -1;
    input.sprintTouch = false;
    releaseJoystick();
    look.id = null; look.aiming = false;
    document.querySelectorAll('.act.on').forEach(el => el.classList.remove('on'));
  };

  function releaseJoystick() {
    joy.id = null; joy.sprintSince = 0; input.joyActive = false; input.joyX = input.joyY = 0;
    input.sprintTouch = false;
    knob.style.transform = '';
    joyEl.classList.remove('sprint');
    joyEl.style.left = joyEl.style.top = joyEl.style.bottom = '';
  }

  function endAim() { input.aimMine = false; input.aimX = input.aimY = -1; look.aiming = false; }

  // ---------- touch: left thumb walks (floating stick), right thumb looks, taps reach the world ----------
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    input.lastTouch = performance.now();
    if (!playing()) return;
    e.preventDefault();
    CM.audioUnlock();
    CM.music.start();
    if (e.clientX < window.innerWidth * 0.42 && joy.id === null) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.sprintSince = 0;
      joyEl.style.left = (e.clientX - 62) + 'px'; joyEl.style.top = (e.clientY - 62) + 'px'; joyEl.style.bottom = 'auto';
      input.joyActive = true; input.joyX = input.joyY = 0;
    } else if (look.id === null) {
      look.id = e.pointerId; look.x = look.sx = e.clientX; look.y = look.sy = e.clientY;
      look.t = performance.now(); look.moved = 0; look.aiming = false;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
      const m = Math.hypot(dx, dy);
      if (m > JOY_R) { dx *= JOY_R / m; dy *= JOY_R / m; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      input.joyX = dx / JOY_R; input.joyY = dy / JOY_R;
    } else if (e.pointerId === look.id) {
      const dx = e.clientX - look.x, dy = e.clientY - look.y;
      look.moved += Math.abs(dx) + Math.abs(dy);
      look.x = e.clientX; look.y = e.clientY;
      if (look.aiming) { input.aimX = e.clientX; input.aimY = e.clientY; return; } // dragging across blocks keeps digging
      if (look.moved > TAP_SLOP) {
        const s = 0.0055 * CM.options.sensitivity;
        input.lookDX += dx * s;
        input.lookDY += dy * s;
      }
    }
  });

  const endTouch = e => {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === joy.id) releaseJoystick();
    if (e.pointerId === look.id) {
      const quick = performance.now() - look.t < TAP_MS;
      if (!look.aiming && quick && look.moved <= TAP_SLOP && CM.options.tapToMine) {
        input.tapX = look.sx; input.tapY = look.sy;   // a flick of a tap reaches out and uses the world
      }
      endAim();
      look.id = null;
    }
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  // Press-and-hold anywhere on the view starts digging the block under the finger.
  setInterval(() => {
    if (!CM.options.tapToMine || look.id === null || look.aiming || !playing()) return;
    if (look.moved > TAP_SLOP || performance.now() - look.t < TAP_MS) return;
    look.aiming = true;
    input.aimMine = true; input.aimX = look.x; input.aimY = look.y;
  }, 40);

  function hold(id, down, up) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      CM.audioUnlock();
      CM.music.start();
      input.lastTouch = performance.now();
      el.classList.add('on');
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      down();
    });
    const end = () => { el.classList.remove('on'); up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  hold('act-jump', () => { input.touchJump = true; }, () => { input.touchJump = false; });
  hold('act-mine', () => { input.touchMine = true; }, () => { input.touchMine = false; });
  hold('act-use', () => { input.useHeld = true; input.usePressed = true; }, () => { input.useHeld = false; });

  const sneakBtn = document.getElementById('act-sneak');
  if (sneakBtn) {
    sneakBtn.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      input.lastTouch = performance.now();
      input.sneak = !input.sneak;
      sneakBtn.classList.toggle('on', input.sneak);
      sneakBtn.setAttribute('aria-pressed', input.sneak ? 'true' : 'false');
      CM.buzz(6);
    });
    sneakBtn.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ---------- mouse ----------
  canvas.addEventListener('mousedown', e => {
    if (recentTouch() || !playing()) return;
    CM.audioUnlock();
    CM.music.start();
    if (!input.locked && canvas.requestPointerLock) {
      try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (_) { /* drag-to-look fallback */ }
    }
    if (e.button === 0) { input.mouseLeft = true; input.attackPressed = true; drag = 0; }
    else if (e.button === 2) { input.useHeld = true; input.usePressed = true; }
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) input.mouseLeft = false;
    else if (e.button === 2) input.useHeld = false;
  });
  window.addEventListener('mousemove', e => {
    if (!playing() || recentTouch()) return;
    const s = 0.0024 * CM.options.sensitivity;
    if (input.locked) { input.lookDX += e.movementX * s; input.lookDY += e.movementY * s; }
    else if (e.buttons && e.target === canvas) {
      input.lookDX += e.movementX * s * 1.6; input.lookDY += e.movementY * s * 1.6;
      drag += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (drag > 8) input.mouseLeft = false;
    }
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    if (!playing()) return;
    e.preventDefault();
    const g = CM.game;
    g.selectSlot((g.player.sel + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
  }, { passive: false });
  document.addEventListener('pointerlockchange', () => {
    const was = input.locked;
    input.locked = document.pointerLockElement === canvas;
    if (was && !input.locked && playing()) CM.game.pause();
  });

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const g = CM.game;
    if (!g) return;
    if (e.code === 'KeyE') { if (g.state === 'playing' || g.state === 'inventory') { e.preventDefault(); g.toggleInventory(); } return; }
    if (e.code === 'Escape') {
      if (g.state === 'inventory') g.toggleInventory();
      else if (g.state === 'paused') g.resume();
      else if (g.state === 'playing') g.pause();
      return;
    }
    if (g.state !== 'playing') return;
    input.keys[e.code] = true;
    if (/^Digit[1-9]$/.test(e.code)) g.selectSlot(+e.code.slice(5) - 1);
    if (e.code === 'KeyC' || e.code === 'F5') { e.preventDefault(); g.cycleCamera(); }
    if (e.code === 'KeyF') input.usePressed = true;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', e => { input.keys[e.code] = false; });
  window.addEventListener('blur', () => input.clear());

  // Keep iOS from zooming or rubber-banding the page mid-game.
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  document.addEventListener('touchmove', e => {
    if (!(e.target.closest && e.target.closest('.panel'))) e.preventDefault();
  }, { passive: false });
})(window.CM);
