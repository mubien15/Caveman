// Caveman \u2014 HUD, bag & crafting, menus, toasts.
(function (CM) {
  const $ = id => document.getElementById(id);
  const HEART = 'M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3.3 4 7.2 4c2.2 0 3.7 1.2 4.8 2.8C13.1 5.2 14.6 4 16.8 4c3.9 0 6.3 4.2 4.8 7.7C19.5 16.4 12 21 12 21z';
  const MEAT = 'M15 3a6 6 0 0 1 2.2 11.6c-1 .4-2 .4-2.9.2l-3.7 3.7a2.2 2.2 0 1 1-2.9 2.9 2.2 2.2 0 1 1-3.1-3.1 2.2 2.2 0 1 1 2.9-2.9l3.7-3.7c-.2-.9-.2-1.9.2-2.9A6 6 0 0 1 15 3z';
  const pipHTML = (d, color) => '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="bg" d="' + d + '"/></svg><svg class="fg" viewBox="0 0 24 24" aria-hidden="true"><path fill="' + color + '" d="' + d + '"/></svg>';

  const ui = CM.ui = {
    game: null, picked: null, last: {}, heldTimer: 0, optionsReturn: 'title',

    init(game) {
      this.game = game;
      document.body.classList.toggle('desktop', !CM.isTouch);
      this.hearts = this.buildPips($('hearts'), HEART, '#d9472b');
      this.food = this.buildPips($('hunger'), MEAT, '#c0703a');
      this.hotSlots = [];
      for (let i = 0; i < 9; i++) {
        const b = document.createElement('button');
        b.className = 'slot';
        b.addEventListener('click', () => { CM.buzz(5); game.selectSlot(i); });
        $('hotbar').appendChild(b);
        this.hotSlots.push(b);
      }
      const on = (id, fn) => $(id).addEventListener('click', e => { CM.audioUnlock(); CM.music.start(); fn(e); });
      on('btn-play', () => game.play());
      on('btn-new', () => this.openNewWorld());
      on('btn-options', () => this.openOptions('title'));
      on('btn-pause', () => game.pause());
      on('btn-inv', () => game.toggleInventory());
      on('btn-cam', () => game.cycleCamera());
      on('btn-resume', () => game.resume());
      on('btn-pause-options', () => this.openOptions('pause'));
      on('btn-quit', () => game.quitToTitle());
      on('inv-close', () => game.toggleInventory());
      on('btn-respawn', () => game.respawn());
      on('nw-cancel', () => { this.hide('newworld'); this.show('title'); });
      on('nw-create', () => { this.hide('newworld'); game.createWorld($('nw-name').value.trim() || CM.randomWorldName(), $('nw-seed').value.trim()); });
      on('opt-back', () => { this.hide('options'); this.show(this.optionsReturn); });
      $('opt-dist').addEventListener('input', e => { CM.options.renderDist = +e.target.value; this.syncOptions(); });
      $('opt-sens').addEventListener('input', e => { CM.options.sensitivity = +e.target.value; this.syncOptions(); });
      $('opt-sound').addEventListener('change', e => { CM.options.sound = e.target.checked; this.syncOptions(); });
      $('opt-music').addEventListener('change', e => { CM.options.music = e.target.checked; CM.music.toggle(e.target.checked); this.syncOptions(); });
      $('opt-tap').addEventListener('change', e => { CM.options.tapToMine = e.target.checked; this.syncOptions(); });
      $('opt-haptics').addEventListener('change', e => { CM.options.haptics = e.target.checked; CM.buzz(10); this.syncOptions(); });
      $('title-hint').innerHTML = CM.isTouch
        ? 'Left thumb walks \u00b7 push it far to run<br>Right thumb looks \u00b7 <b>hold on a block to dig</b> \u00b7 <b>tap to place or strike</b>'
        : 'WASD walk \u00b7 Shift run \u00b7 Space jump \u00b7 Click to mine or strike \u00b7 Right-click to place or eat \u00b7 E bag \u00b7 C camera';
    },

    buildPips(el, d, color) {
      const arr = [];
      for (let i = 0; i < 10; i++) { const s = document.createElement('span'); s.className = 'pip'; s.innerHTML = pipHTML(d, color); el.appendChild(s); arr.push(s); }
      return arr;
    },

    show(id) { $(id).hidden = false; },
    hide(id) { $(id).hidden = true; },

    setLoading(frac, text) {
      $('loading-fill').style.width = Math.round(frac * 100) + '%';
      if (text) $('loading-text').textContent = text;
    },

    setTitle(name) {
      $('title-world').textContent = name;
      $('btn-play').textContent = 'Play ' + name;
    },

    renderHud(player, clockText) {
      const L = this.last;
      if (L.health !== player.health) { L.health = player.health; this.fillPips(this.hearts, player.health); }
      if (L.hunger !== player.hunger) { L.hunger = player.hunger; this.fillPips(this.food, player.hunger); }
      if (L.inv !== player.invVersion || L.sel !== player.sel) {
        const selChanged = L.sel !== player.sel;
        L.inv = player.invVersion; L.sel = player.sel;
        this.hotSlots.forEach((b, i) => this.fillSlot(b, player.inv[i], i === player.sel));
        const h = player.held();
        if (selChanged && h) this.flashHeld(CM.info(h.id).name);
      }
      if (L.clock !== clockText) { L.clock = clockText; $('clock').textContent = clockText; }
      $('hurt').classList.toggle('on', player.hurtT > 0);
      $('underwater').hidden = !player.headInWater;
      if (!document.getElementById('inventory').hidden && L.invPanel !== player.invVersion) this.renderInventory(player);
    },

    fillPips(pips, value) {
      pips.forEach((p, i) => {
        const v = value - i * 2;
        p.className = 'pip' + (v >= 2 ? '' : v === 1 ? ' half' : ' empty');
      });
    },

    fillSlot(b, s, selected, picked) {
      b.className = 'slot' + (selected ? ' sel' : '') + (picked ? ' picked' : '');
      b.textContent = '';
      if (!s) { b.setAttribute('aria-label', 'Empty slot'); return; }
      const info = CM.info(s.id);
      const img = new Image();
      img.src = CM.icon(s.id);
      img.alt = '';
      b.appendChild(img);
      if (s.n > 1) { const n = document.createElement('span'); n.className = 'n'; n.textContent = s.n; b.appendChild(n); }
      b.setAttribute('aria-label', info.name + (s.n > 1 ? ' \u00d7' + s.n : ''));
    },

    flashHeld(name) {
      const el = $('held-name');
      el.textContent = name;
      el.classList.add('show');
      clearTimeout(this.heldTimer);
      this.heldTimer = setTimeout(() => el.classList.remove('show'), 1600);
    },

    setCrosshair(progress, onMob) {
      const c = $('crosshair');
      c.style.setProperty('--p', progress.toFixed(3));
      c.classList.toggle('mining', progress > 0);
      c.classList.toggle('mob', !!onMob);
    },

    toast(text) {
      const box = $('toasts');
      while (box.children.length >= 3) box.firstChild.remove();
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = text;
      box.appendChild(t);
      setTimeout(() => t.remove(), 2500);
    },

    // ---------- bag & crafting ----------
    renderInventory(player) {
      this.last.invPanel = player.invVersion;
      const rec = $('recipes');
      rec.textContent = '';
      for (const r of CM.recipes) {
        const row = document.createElement('div');
        row.className = 'recipe';
        const parts = document.createElement('div');
        parts.className = 'parts';
        let ok = true;
        for (const [id, n] of r.ins) {
          const have = player.count(id);
          if (have < n) ok = false;
          parts.appendChild(this.chip(id, '\u00d7' + n, have < n, CM.info(id).name + ': have ' + have + ', need ' + n));
        }
        const to = document.createElement('span');
        to.className = 'to';
        to.textContent = '\u2192';
        parts.appendChild(to);
        const outInfo = CM.info(r.out[0]);
        parts.appendChild(this.chip(r.out[0], (r.out[1] > 1 ? r.out[1] + ' ' : '') + outInfo.name, false, outInfo.name));
        const btn = document.createElement('button');
        btn.textContent = 'Make';
        btn.disabled = !ok || player.spaceFor(r.out[0]) < r.out[1];
        btn.setAttribute('aria-label', 'Make ' + outInfo.name);
        btn.addEventListener('click', () => { this.game.craft(r); });
        row.append(parts, btn);
        rec.appendChild(row);
      }
      const fillGrid = (el, from, to) => {
        el.textContent = '';
        for (let i = from; i < to; i++) {
          const b = document.createElement('button');
          this.fillSlot(b, player.inv[i], false, this.picked === i);
          b.addEventListener('click', () => this.tapSlot(player, i));
          el.appendChild(b);
        }
      };
      fillGrid($('bag'), 9, 36);
      fillGrid($('bag-hotbar'), 0, 9);
    },

    chip(id, label, short, title) {
      const c = document.createElement('span');
      c.className = 'chip' + (short ? ' short' : '');
      c.title = title;
      const img = new Image();
      img.src = CM.icon(id);
      img.alt = CM.info(id).name;
      const b = document.createElement('b');
      b.textContent = label;
      c.append(img, b);
      return c;
    },

    tapSlot(player, i) {
      const inv = player.inv;
      if (this.picked === null) { if (inv[i]) this.picked = i; }
      else if (this.picked === i) this.picked = null;
      else {
        const a = inv[this.picked], b = inv[i];
        if (a && b && a.id === b.id) {
          const k = Math.min(a.n, CM.info(a.id).stack - b.n);
          b.n += k; a.n -= k;
          if (!a.n) inv[this.picked] = null;
        } else { inv[i] = a; inv[this.picked] = b; }
        this.picked = null;
      }
      player.invVersion++;
      this.renderInventory(player);
    },

    // ---------- menus ----------
    openOptions(from) {
      this.optionsReturn = from;
      this.hide(from);
      $('opt-dist').value = CM.options.renderDist;
      $('opt-sens').value = CM.options.sensitivity;
      $('opt-sound').checked = CM.options.sound;
      $('opt-music').checked = CM.options.music;
      $('opt-tap').checked = CM.options.tapToMine;
      $('opt-haptics').checked = CM.options.haptics;
      this.syncOptions();
      this.show('options');
    },

    syncOptions() {
      $('opt-dist-val').textContent = CM.options.renderDist + ' chunks';
      $('opt-sens-val').textContent = CM.options.sensitivity.toFixed(1) + '\u00d7';
      CM.saveOptions();
      this.game.applyOptions();
    },

    openNewWorld() {
      this.hide('title');
      $('nw-name').value = CM.randomWorldName();
      $('nw-seed').value = '';
      this.show('newworld');
    },

    showPause(sub) { $('pause-sub').textContent = sub; this.show('pause'); },
    showDeath(cause) { $('death-cause').textContent = cause; this.show('death'); },
  };
})(window.CM);
