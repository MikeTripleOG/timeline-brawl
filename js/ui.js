/* Timeline Brawl — UI, input and game loop. */
(function () {
  'use strict';
  const HB = window.HB, A = HB.Audio, SFX = A.SFX, DT = HB.WORLD.DT;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : n.toLocaleString('en-US');
  const playable = HB.UNITS.filter(u => !u.hidden);

  const cfg = { mode: 'ai', budget: 10000, weather: 'day', chaos: true };
  const st = {
    screen: 'menu', battle: null, setup: null, sel: -1, placing: false, paused: false, speed: 1, slowT: 0, acc: 0,
    pred: null, endT: -1, resultShown: false, draftSide: 0, draft: [{}, {}], era: 0, hold: null, drag: null, toastT: 0, tipQ: [], tipT: 0, lastHud: 0,
  };
  const ui = {
    get sel() { return st.sel; }, get placing() { return st.placing; }, get hold() { return st.hold; },
    controllable(side) { return cfg.mode === '2p' || side === 0; },
  };
  const R = new HB.Renderer($('cv'));
  window.addEventListener('resize', () => R.resize());

  // ---------- one-time tips (all features stay enabled; tips just explain the first time) ----------
  const TIPS = {
    controls: '<b>Controls:</b> tap your squad to select · tap ground to move · tap an enemy to attack · <b>press &amp; hold</b> a squad to fire its lore ability. Or just watch: everyone fights on their own.',
    lore: '<b>Lore abilities</b> fire automatically when the moment is right. A pulsing ★ over your squad means it\'s ready — hold the squad to fire it yourself.',
    rout: '<b>Morale:</b> squads that lose most of their troops can break and flee. Joan of Arc\'s banner stops that.',
    ammo: '<b>Ammo runs out.</b> Modern units carry limited rounds (yellow bar). Once dry they\'re vulnerable — swarms can finish them.',
    fuel: '<b>Fuel runs out too</b> (blue bar). Tanks stall in place; aircraft are forced to land.',
    rtb: '<b>Return to base:</b> aircraft with empty racks fly back to their own edge and land.',
    landed: '<b>Landed aircraft are helpless.</b> Send infantry or cavalry to swarm it!',
    event: '<b>Chaos event!</b> Random history-bending events strike mid-battle. You can toggle them off in the menu.',
    place: '<b>Deploy:</b> drag your squads anywhere inside your shaded zone, then hit FIGHT.',
  };
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('tb_tips') || '{}'); } catch (e) { seen = {}; }
  function tip(key) {
    if (!TIPS[key] || seen[key]) return;
    seen[key] = 1; try { localStorage.setItem('tb_tips', JSON.stringify(seen)); } catch (e) { /* private mode */ }
    st.tipQ.push(TIPS[key]);
  }
  function toast(msg, t) { const el = $('toast'); el.textContent = msg; el.classList.remove('hidden'); st.toastT = t || 1.8; }

  // ---------- screens ----------
  function show(name) {
    st.screen = name;
    for (const id of ['menu', 'draft', 'hud']) $(id).classList.toggle('hidden', !(id === name || (id === 'hud' && (name === 'place' || name === 'battle'))));
    $('predict').classList.add('hidden'); $('result').classList.toggle('hidden', name !== 'result');
    if (name === 'result') $('hud').classList.remove('hidden');
  }
  function segment(id, key, conv) {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      for (const b of el.children) b.classList.toggle('on', b === btn);
      cfg[key] = conv(btn.dataset.v); SFX.select();
    });
  }
  segment('opt-mode', 'mode', v => v); segment('opt-budget', 'budget', v => +v); segment('opt-weather', 'weather', v => v); segment('opt-chaos', 'chaos', v => v === '1');

  // featured cards
  const fe = $('featured');
  for (const f of HB.FEATURED) {
    const b = document.createElement('button'); b.className = 'card'; b.dataset.id = f.id;
    b.innerHTML = '<b>' + f.title + '</b><small>' + f.blurb + '</small><span class="vs">' + fmt(f.cost[0]) + ' vs ' + fmt(f.cost[1]) + ' pts</span>';
    b.addEventListener('click', () => { A.unlock(); startFeatured(f.id); });
    fe.appendChild(b);
  }
  $('btn-custom').addEventListener('click', () => { A.unlock(); st.draft = [{}, {}]; st.draftSide = 0; openDraft(); });

  function armyName(entries) {
    const arr = entries.slice().sort((a, b) => HB.UNIT[b.type].cost * b.count - HB.UNIT[a.type].cost * a.count);
    const parts = arr.slice(0, 2).map(e => (e.count > 1 ? fmt(e.count) + ' ' : '') + (e.count > 1 ? HB.UNIT[e.type].short : HB.UNIT[e.type].name));
    return parts.join(' + ') + (arr.length > 2 ? ' +' + (arr.length - 2) : '');
  }

  // ---------- draft ----------
  function openDraft() {
    show('draft');
    const tabs = $('era-tabs'); tabs.innerHTML = '';
    HB.ERAS.forEach((e, k) => {
      const b = document.createElement('button'); b.textContent = e.name; b.style.color = e.color; b.classList.toggle('on', k === st.era);
      b.addEventListener('click', () => { st.era = k; for (const x of tabs.children) x.classList.toggle('on', x === b); renderUnits(); });
      tabs.appendChild(b);
    });
    $('draft-title').textContent = cfg.mode === '2p' ? (st.draftSide ? 'RED drafts' : 'BLUE drafts') : 'Draft your army';
    $('draft-title').className = 'title s' + st.draftSide;
    renderUnits(); renderArmy();
  }
  function spent() { const d = st.draft[st.draftSide]; let c = 0; for (const k in d) c += HB.UNIT[k].cost * d[k]; return c; }
  function renderUnits() {
    const list = $('unit-list'); list.innerHTML = '';
    const left = cfg.budget - spent(), d = st.draft[st.draftSide];
    for (const u of playable.filter(u => u.era === st.era)) {
      const c = document.createElement('div'); c.className = 'ucard'; c.style.setProperty('--era', HB.ERAS[u.era].color);
      const pc = u.cost * u.pack;
      c.innerHTML = '<div><h3>' + u.name + '</h3><div class="meta">' + u.role + ' · ' + (u.pack > 1 ? '+' + u.pack + ' for ' : '') + fmt(pc) + ' pts' + (u.pack > 1 ? ' (' + u.cost + ' each)' : '') + ' · ' + u.hp + ' hp</div></div>' +
        '<div class="ctl"><span class="n">' + (d[u.id] ? '×' + fmt(d[u.id]) : '') + '</span><button class="add" ' + (pc > left ? 'disabled' : '') + '>＋</button>' + (d[u.id] ? '<button class="rem">−</button>' : '') + '</div>' +
        '<div class="lore">★ <b>' + u.lore.name + '</b> — ' + u.lore.desc + '<i>Counter: ' + u.lore.counter + '</i></div>';
      c.querySelector('.add').addEventListener('click', () => { if (cfg.budget - spent() >= pc) { d[u.id] = (d[u.id] || 0) + u.pack; SFX.select(); renderUnits(); renderArmy(); } });
      const rem = c.querySelector('.rem'); if (rem) rem.addEventListener('click', () => { d[u.id] -= u.pack; if (d[u.id] <= 0) delete d[u.id]; renderUnits(); renderArmy(); });
      list.appendChild(c);
    }
  }
  function renderArmy() {
    const d = st.draft[st.draftSide], s = spent(), el = $('army-list');
    $('budget-fill').style.width = Math.min(100, s / cfg.budget * 100) + '%';
    $('budget-txt').textContent = fmt(s) + ' / ' + fmt(cfg.budget) + ' pts';
    const keys = Object.keys(d);
    el.innerHTML = keys.length ? keys.map(k => '<span class="chip" style="--era:' + HB.ERAS[HB.UNIT[k].era].color + '">' + fmt(d[k]) + ' ' + HB.UNIT[k].short + '</span>').join('') : '<span class="muted">Your army is empty — tap ＋ on a unit</span>';
    $('draft-done').disabled = !keys.length;
  }
  $('draft-back').addEventListener('click', () => show('menu'));
  $('draft-clear').addEventListener('click', () => { st.draft[st.draftSide] = {}; renderUnits(); renderArmy(); });
  $('draft-random').addEventListener('click', () => {
    const o = {}; for (const e of HB.aiDraft(cfg.budget)) o[e.type] = e.count; st.draft[st.draftSide] = o; renderUnits(); renderArmy();
  });
  $('draft-done').addEventListener('click', () => {
    if (cfg.mode === '2p' && st.draftSide === 0) { st.draftSide = 1; toast('Pass the phone to RED'); openDraft(); return; }
    const toEntries = (o) => Object.keys(o).map(type => ({ type, count: o[type] }));
    const e0 = toEntries(st.draft[0]);
    const e1 = cfg.mode === '2p' ? toEntries(st.draft[1]) : HB.aiDraft(cfg.budget);
    st.setup = { armies: [HB.layoutArmy(e0, 0), HB.layoutArmy(e1, 1)], names: [armyName(e0), armyName(e1)], weather: cfg.weather, chaos: cfg.chaos, featured: null };
    startPlacement();
  });

  // ---------- placement & battle ----------
  function startFeatured(id, opts) {
    const f = HB.FEATURED.find(x => x.id === id); if (!f) return;
    const armies = HB.featuredArmies(f);
    st.setup = { armies, names: [armyName(armies[0]), armyName(armies[1])], weather: (opts && opts.weather) || cfg.weather, chaos: opts && 'chaos' in opts ? opts.chaos : cfg.chaos, featured: f, title: f.title };
    startPlacement(opts && opts.seed);
  }
  function newBattle(seed) {
    const S = st.setup;
    st.battle = new HB.Battle({ armies: S.armies.map(a => a.map(e => ({ type: e.type, count: e.count, x: e.x, y: e.y }))), seed: seed || ((Math.random() * 1e9) | 0), weather: S.weather, chaos: S.chaos, human: [true, cfg.mode === '2p'] });
    st.battle.buildGrid();
    R.reset(S.weather);
    st.sel = -1; st.speed = 1; st.slowT = 0; st.acc = 0; st.endT = -1; st.resultShown = false; st.paused = false; st.hold = null; st.drag = null;
    $('btn-speed').textContent = '1×'; $('btn-pause').textContent = '❚❚';
  }
  function startPlacement(seed) {
    newBattle(seed);
    st.placing = true; st.pred = null;
    show('place');
    $('btn-fight').classList.remove('hidden'); $('btn-pause').classList.add('hidden'); $('btn-speed').classList.add('hidden');
    $('name0').textContent = st.setup.names[0]; $('name1').textContent = st.setup.names[1];
    $('place-help').textContent = (st.setup.title ? st.setup.title + ' — ' : '') + 'Drag your squads inside your zone, then FIGHT!';
    $('envtxt').textContent = { day: '☀ day', night: '☾ night', storm: '⛈ storm' }[st.setup.weather] + (st.setup.chaos ? ' · chaos' : '');
    tip('place');
    updateHud(true);
  }
  $('btn-fight').addEventListener('click', () => { A.unlock(); openPredict(); });
  function openPredict() {
    $('pick0').textContent = '🔵 ' + st.setup.names[0]; $('pick1').textContent = '🔴 ' + st.setup.names[1];
    const c0 = HB.armyCost(st.setup.armies[0]), c1 = HB.armyCost(st.setup.armies[1]);
    $('predict-sub').textContent = fmt(c0) + ' pts vs ' + fmt(c1) + ' pts' + ' · ' + (st.battle.n).toLocaleString() + ' units on the field';
    $('predict').classList.remove('hidden');
  }
  $('pick0').addEventListener('click', () => beginFight(0));
  $('pick1').addEventListener('click', () => beginFight(1));
  $('pick-skip').addEventListener('click', () => beginFight(null));
  function beginFight(pred) {
    st.pred = pred; st.placing = false; st.sel = -1;
    $('predict').classList.add('hidden'); $('place-help').textContent = '';
    $('btn-fight').classList.add('hidden'); $('btn-pause').classList.remove('hidden'); $('btn-speed').classList.remove('hidden');
    st.tipQ.length = 0; st.tipT = 0; $('tip').classList.add('hidden');
    show('battle'); tip('controls'); SFX.order();
  }
  $('btn-speed').addEventListener('click', () => { st.speed = st.speed === 1 ? 2 : st.speed === 2 ? 4 : 1; $('btn-speed').textContent = st.speed + '×'; });
  $('btn-pause').addEventListener('click', () => { st.paused = !st.paused; $('btn-pause').textContent = st.paused ? '▶' : '❚❚'; });
  $('btn-quit').addEventListener('click', () => { st.battle = null; st.placing = false; show('menu'); });
  $('res-menu').addEventListener('click', () => { st.battle = null; show('menu'); });
  $('res-rematch').addEventListener('click', () => { $('result').classList.add('hidden'); startPlacement(); });
  $('tip').addEventListener('click', () => { st.tipT = 0; });

  // ---------- input: one gesture per action ----------
  const cv = $('cv');
  let down = null;
  function hitSquad(sx, sy) {
    const b = st.battle; if (!b) return -1;
    const w = R.toWorld(sx, sy), rad = Math.max(8, 20 / R.scale);
    let best = -1, bd = 1e9;
    b.query(w.x, w.y, rad + 8, (j, d2) => {
      const s = b.squads[b.sq[j]], u = HB.UNITS[b.ti[j]];
      if (s.temp && !ui.controllable(s.side)) return false;
      if (!ui.controllable(b.side[j]) && (((b.flags[j] & HB.FLAGS.F_STEALTH) && b.revealT[j] <= 0) || s.invisT > 0)) return false;
      const dd = Math.sqrt(d2) - u.rad;
      if (dd < bd && dd < rad) { bd = dd; best = b.sq[j]; }
      return false;
    });
    return best;
  }
  cv.addEventListener('pointerdown', (e) => {
    A.unlock();
    if (!st.battle || (st.screen !== 'place' && st.screen !== 'battle')) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    const sq = hitSquad(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), sq, moved: false, consumed: false, id: e.pointerId };
    const s = sq >= 0 ? st.battle.squads[sq] : null;
    if (st.placing && s && ui.controllable(s.side) && !s.temp) {
      const b = st.battle, idx = [];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < b.n; i++) if (b.alive[i] && b.sq[i] === sq) { idx.push(i); x0 = Math.min(x0, b.x[i]); x1 = Math.max(x1, b.x[i]); y0 = Math.min(y0, b.y[i]); y1 = Math.max(y1, b.y[i]); }
      const w = R.toWorld(e.clientX, e.clientY);
      st.drag = { sq, idx, x0, x1, y0, y1, wx: w.x, wy: w.y, dx: 0, dy: 0 };
      st.sel = sq;
    } else if (!st.placing && s && ui.controllable(s.side) && s.def.lore) {
      st.hold = { sq, f: 0, t0: performance.now() };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down.moved = true; st.hold = null; }
    if (st.drag) {
      const b = st.battle, d = st.drag, w = R.toWorld(e.clientX, e.clientY), z = HB.ZONES[b.squads[d.sq].side];
      let dx = w.x - d.wx, dy = w.y - d.wy;
      dx = Math.max(3 - d.x0, Math.min(HB.WORLD.W - 3 - d.x1, dx)); dy = Math.max(z.y0 - d.y0, Math.min(z.y1 - d.y1, dy));
      const ddx = dx - d.dx, ddy = dy - d.dy;
      if (ddx || ddy) {
        for (const i of d.idx) { b.x[i] += ddx; b.y[i] += ddy; }
        const s = b.squads[d.sq]; s.cx += ddx; s.cy += ddy; d.dx = dx; d.dy = dy;
      }
    }
  });
  function endPointer(e) {
    if (!down || e.pointerId !== down.id) return;
    const b = st.battle, d = down; down = null;
    if (st.drag) {
      const dr = st.drag; st.drag = null;
      if (dr.dx || dr.dy) {
        // remember new position so rematches keep the layout
        const s = b.squads[dr.sq], ent = st.setup.armies[s.side][squadEntryIndex(s)];
        if (ent) { ent.x += dr.dx; ent.y += dr.dy; }
        b.buildGrid(); return;
      }
    }
    if (d.consumed) return;
    st.hold = null;
    if (d.moved || !b) return;
    tap(d.x, d.y, d.sq);
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', (e) => { if (down && e.pointerId === down.id) { down = null; st.hold = null; st.drag = null; } });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  function squadEntryIndex(s) {
    // squads are created in army order, so index within its side's non-temp squads maps to the entry
    let k = 0; for (const o of st.battle.squads) { if (o === s) return k; if (o.side === s.side && !o.temp && o.id < s.id) k++; }
    return -1;
  }
  function tap(sx, sy, sq) {
    const b = st.battle;
    const s = sq >= 0 ? b.squads[sq] : null;
    if (st.placing) {
      if (s) { st.sel = sq; toast(s.def.name + ' — ★ ' + s.def.lore.name); } else st.sel = -1;
      return;
    }
    const sel = st.sel >= 0 ? b.squads[st.sel] : null;
    if (s) {
      if (sel && sel.alive > 0 && s.side !== sel.side) { // attack order
        sel.order = { kind: 'attack', sq: s.id, t: 30 }; sel.tgt = s.id; st.sel = -1; SFX.order();
        toast(sel.def.short + ' → attack ' + s.def.short, 1.1);
        return;
      }
      if (ui.controllable(s.side)) { st.sel = st.sel === sq ? -1 : sq; SFX.select(); return; }
      toast('Enemy: ' + s.def.name + ' (' + s.alive + ') — select your squad first', 1.4);
      return;
    }
    if (sel && sel.alive > 0) {
      const w = R.toWorld(sx, sy);
      sel.order = { kind: 'move', x: Math.max(4, Math.min(HB.WORLD.W - 4, w.x)), y: Math.max(4, Math.min(HB.WORLD.H - 4, w.y)), t: 25 };
      st.sel = -1; SFX.order();
      return;
    }
    st.sel = -1;
  }
  function updateHold() {
    if (!st.hold || !down || down.consumed) return;
    const f = (performance.now() - st.hold.t0) / 450; st.hold.f = f;
    if (f >= 1) {
      const res = st.battle.tryAbility(st.hold.sq); down.consumed = true; st.hold = null;
      if (res.ok) SFX.ability(); else { SFX.deny(); toast('★ ' + res.msg, 1.5); }
    }
  }

  // ---------- fx → renderer, audio, tips ----------
  function consumeFx(b) {
    const fx = b.fx;
    for (let k = 0; k < fx.length; k++) {
      const f = fx[k];
      R.ingest(f, b);
      if (f.slow) st.slowT = Math.max(st.slowT, Math.min(1.5, f.slow));
      switch (f.k) {
        case 'shot': SFX.shot(f.t); break;
        case 'boom': SFX.boom(f.r >= 15); break;
        case 'clash': SFX.clash(); break;
        case 'event': SFX.event(f.id); tip('event'); break;
        case 'callout':
          if (f.ability) { SFX.ability(); if (/KAMIKAZE|DIVINE WIND/.test(f.text)) SFX.event('kamikaze'); }
          else if (f.big) SFX.callout();
          if (f.tip) tip(f.tip);
          break;
      }
    }
    fx.length = 0;
  }
  function updateHud(force) {
    const b = st.battle; if (!b) return;
    const now = performance.now(); if (!force && now - st.lastHud < 250) return; st.lastHud = now;
    $('cnt0').textContent = b.sideCount(0).toLocaleString(); $('cnt1').textContent = b.sideCount(1).toLocaleString();
    const t = b.t | 0; $('clock').textContent = (t / 60 | 0) + ':' + String(t % 60).padStart(2, '0');
    const v0 = b.sideValue(0), v1 = b.sideValue(1);
    $('vbar0').style.flex = String(Math.max(0.02, v0)); $('vbar1').style.flex = String(Math.max(0.02, v1));
    const ev = b.events.length ? b.events.map(e => e.name).join(' · ') : ({ day: '☀ day', night: '☾ night', storm: '⛈ storm' }[b.weather] + (b.chaos ? ' · chaos' : ''));
    $('envtxt').textContent = ev;
    const s = st.sel >= 0 ? b.squads[st.sel] : null;
    if (s && s.alive > 0) {
      const L = s.def.lore, cd = s.cd > 900 ? 'used' : s.cd > 0 ? Math.ceil(s.cd) + 's' : 'READY — hold squad';
      $('selinfo').innerHTML = '<b>' + s.def.name + '</b> ' + s.alive + '/' + s.n0 + '<br>★ ' + L.name + ': ' + cd;
    } else $('selinfo').innerHTML = st.placing ? '' : '<span class="muted">tap a squad</span>';
  }
  function showResult() {
    const b = st.battle, S = b.summary(), names = st.setup.names;
    st.resultShown = true;
    const w = S.winner;
    $('res-title').textContent = w < 0 ? 'DRAW!' : (w === 0 ? '🔵 BLUE WINS' : '🔴 RED WINS');
    $('res-title').style.color = w < 0 ? '#ffd166' : HB.SIDE_COLORS[w];
    let pred = '';
    if (st.pred != null) pred = st.pred === w ? '✅ You called it!' : '😱 UPSET! You picked ' + (st.pred ? 'Red' : 'Blue') + '.';
    else {
      // "upset" if the side with far fewer units won against a high-tech army, or vice versa
      const c0 = b.squads.filter(s => s.side === 0 && !s.temp).reduce((a, s) => a + s.n0, 0), c1 = b.squads.filter(s => s.side === 1 && !s.temp).reduce((a, s) => a + s.n0, 0);
      if (w >= 0) pred = (w === 0 ? c0 > c1 : c1 > c0) ? 'Numbers beat tech.' : 'Tech beat numbers.';
    }
    $('res-pred').textContent = pred + (S.timeout ? ' (time limit — decided on remaining value)' : '');
    $('res-mvp').innerHTML = S.mvp ? '🏅 MVP: <b>' + S.mvp.name + '</b> (' + (S.mvp.side ? 'Red' : 'Blue') + ') — ' + S.mvp.kills.toLocaleString() + ' kills' : '';
    for (const side of [0, 1]) {
      $('res' + side).innerHTML = '<h4 class="s' + side + '">' + names[side] + '</h4>' + S.survivors[side].map(x => '<div><span>' + x.name + '</span><span>' + x.alive + '/' + x.n0 + '</span></div>').join('');
    }
    $('res-misc').textContent = 'Battle time ' + (S.time | 0) + 's · ' + S.abilities + ' lore abilities' + (S.events.length ? ' · events: ' + S.events.map(id => HB.EVENTS[id].name).join(', ') : '');
    $('result').classList.remove('hidden');
    if (cfg.mode === '2p' || w < 0 || w === 0) SFX.win(); else SFX.lose();
  }

  // ---------- main loop ----------
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const b = st.battle;
    if (b && st.screen === 'battle' && !st.paused) {
      updateHold();
      let scale = st.speed;
      if (st.slowT > 0) { st.slowT -= dt; scale *= 0.3; }
      st.acc += dt * scale;
      const maxSteps = 2 + st.speed * 3;
      let steps = 0; const t0 = performance.now();
      while (st.acc >= DT && steps < maxSteps && !b.over) {
        b.step(); st.acc -= DT; steps++;
        if (performance.now() - t0 > 28) break; // phone budget: slow time instead of dropping frames
      }
      if (st.acc > DT * 4) st.acc = DT * 4;
      consumeFx(b);
      if (b.over && st.endT < 0) st.endT = 1.8;
      if (st.endT > 0) { st.endT -= dt; if (st.endT <= 0 && !st.resultShown) showResult(); }
    } else if (b) consumeFx(b);
    R.draw(st.screen === 'menu' || st.screen === 'draft' ? null : b, ui, st.paused ? 0 : dt * (st.slowT > 0 ? 0.5 : 1));
    if (b) updateHud();
    // toasts & tips
    if (st.toastT > 0) { st.toastT -= dt; if (st.toastT <= 0) $('toast').classList.add('hidden'); }
    if (st.tipT > 0) { st.tipT -= dt; if (st.tipT <= 0) $('tip').classList.add('hidden'); }
    else if (st.tipQ.length && (st.screen === 'battle' || st.screen === 'place')) { $('tip').innerHTML = st.tipQ.shift(); $('tip').classList.remove('hidden'); st.tipT = 6; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  show('menu');

  // test hook
  window.__tb = {
    st, cfg, R,
    get battle() { return st.battle; },
    startFeatured, beginFight, showResult,
    setSpeed(s) { st.speed = s; },
    fastForward(sec) { const b = st.battle; const n = Math.round(sec / DT); for (let k = 0; k < n && !b.over; k++) b.step(); consumeFx(b); },
  };
})();
