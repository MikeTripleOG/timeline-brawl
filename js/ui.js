/* Timeline Brawl — UI, input, camera gestures, replays and the game loop. */
(function () {
  'use strict';
  const HB = window.HB, A = HB.Audio, SFX = A.SFX, DT = HB.WORLD.DT, NF = HB.WORLD.NF;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n % 1000 ? 1 : 0) + 'k' : Math.round(n).toLocaleString('en-US');
  const playable = HB.UNITS.filter(u => !u.hidden);
  const COLORS = HB.FAC_COLORS;

  const cfg = { budget: 20000, weather: 'day', chaos: true, spec: 4 };
  const st = {
    screen: 'menu', battle: null, match: null, mode: 'ai', sel: -1, placing: false, paused: false, speed: 1, slowT: 0, acc: 0,
    pred: null, endT: -1, resultShown: false, draftSide: 0, draft: [{}, {}], era: 0, hold: null, drag: null, toastT: 0, tipQ: [], tipT: 0, lastHud: 0,
    spectate: false, watch: false, challenge: null, featured: null, predictedOnce: false, countdown: 0, taps: 0, ticker: [], stripT: 0,
  };
  const ui = {
    get sel() { return st.sel; }, get placing() { return st.placing; }, get hold() { return st.hold; }, get spectate() { return st.spectate; },
    controllable(side) { return !st.spectate && st.match && st.match.factions[side] && st.match.factions[side].cmd === 'human'; },
  };
  const R = new HB.Renderer($('cv'));
  window.addEventListener('resize', () => R.resize());
  document.addEventListener('pointerdown', () => { st.taps++; }, true);

  // ---------- one-line tips ----------
  const TIPS = {
    lore: '<b>★ Rings</b> fill as an ability recharges. Full + pulsing = ready: hold the squad to fire it.',
    faith: '<b>Faith vs Power:</b> ancient → gunpowder abilities spend morale (gold bar); WW → future spend energy (blue bar). At 0 energy, tech goes dark.',
    ammo: '<b>Ammo runs out.</b> Once dry, modern units are just steel boxes.',
    event: '<b>Chaos event!</b> Toggle chaos in Options.',
    place: '<b>Deploy:</b> drag your squads inside your zone, then FIGHT.',
    ffa: '<b>FFA:</b> tap another army\'s chip to propose an alliance, or to betray your ally.',
    cam: '<b>Camera</b> follows the action. Drag or pinch to take over; ☰ → Re-center to hand it back.',
  };
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem('tb_tips2') || '{}'); } catch (e) { seen = {}; }
  function tip(key) {
    if (!TIPS[key] || seen[key]) return;
    seen[key] = 1; try { localStorage.setItem('tb_tips2', JSON.stringify(seen)); } catch (e) { /* private mode */ }
    st.tipQ.push(TIPS[key]);
  }
  function toast(msg, t) { const el = $('toast'); el.textContent = msg; el.classList.remove('hidden'); st.toastT = t || 1.8; }
  function ticker(text, color) {
    st.ticker.push({ text, color: color || '#fff', t: 7 });
    if (st.ticker.length > 4) st.ticker.shift();
    renderTicker();
  }
  function renderTicker() {
    $('ticker').innerHTML = st.ticker.map(x => '<div style="color:' + x.color + ';opacity:' + Math.min(1, x.t / 1.5).toFixed(2) + '">' + esc(x.text) + '</div>').join('');
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- screens ----------
  function show(name) {
    st.screen = name;
    for (const id of ['menu', 'draft', 'hud']) $(id).classList.toggle('hidden', !(id === name || (id === 'hud' && (name === 'place' || name === 'battle' || name === 'result'))));
    for (const id of ['predict', 'custom', 'challenge', 'unspent', 'share', 'cmenu']) $(id).classList.add('hidden');
    $('result').classList.toggle('hidden', name !== 'result');
    if (name === 'menu' && location.hash) history.replaceState(null, '', location.pathname + location.search);
  }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('.modal').classList.add('hidden')));
  function segment(id, fn) {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      for (const b of el.children) b.classList.toggle('on', b === btn);
      fn(btn.dataset.v); SFX.select();
    });
  }
  segment('opt-budget', v => (cfg.budget = +v)); segment('opt-weather', v => (cfg.weather = v)); segment('opt-chaos', v => (cfg.chaos = v === '1'));
  segment('opt-spec', v => (cfg.spec = +v)); segment('opt-sound', v => setSound(v === '1'));
  function setSound(on) { A.setMuted(!on); $('cm-sound').textContent = on ? '🔊 Sound on' : '🔇 Sound off'; for (const b of $('opt-sound').children) b.classList.toggle('on', (b.dataset.v === '1') === on); }

  const fe = $('featured');
  for (const f of HB.FEATURED) {
    const b = document.createElement('button'); b.className = 'card'; b.dataset.id = f.id;
    b.innerHTML = '<b>' + f.title + '</b><small>' + f.blurb + '</small><span class="vs">' + fmt(f.cost[0]) + ' vs ' + fmt(f.cost[1]) + ' pts</span>';
    b.addEventListener('click', () => { A.unlock(); startFeatured(f.id); });
    fe.appendChild(b);
  }
  const newSeed = () => (Math.random() * 2 ** 31) >>> 0;
  $('btn-quick').addEventListener('click', () => { A.unlock(); quickBattle(); });
  $('btn-spectate').addEventListener('click', () => { A.unlock(); startSpectate(); });
  $('btn-custom').addEventListener('click', () => { A.unlock(); $('custom').classList.remove('hidden'); });
  $('btn-challenge').addEventListener('click', () => { A.unlock(); $('chal-err').textContent = ''; $('challenge').classList.remove('hidden'); });
  document.querySelectorAll('#custom [data-mode]').forEach(b => b.addEventListener('click', () => {
    st.mode = b.dataset.mode; st.challenge = null; st.draft = [{}, {}]; st.draftSide = 0; openDraft();
  }));
  $('chal-go').addEventListener('click', () => {
    const v = $('chal-code').value.trim();
    const m = /#watch=([A-Za-z0-9_-]+)/.exec(v);
    if (m) { openWatch(m[1]); return; }
    const army = HB.parseArmyCode(v);
    if (!army) { $('chal-err').textContent = 'That code did not parse. It should look like TB-legion.5000_abrams.1'; return; }
    st.challenge = army; st.mode = 'ai'; st.draft = [{}, {}]; st.draftSide = 0;
    cfg.budget = Math.max(cfg.budget, Math.ceil(HB.armyCost(army) / 1000) * 1000);
    openDraft();
  });

  function armyName(entries) {
    const arr = entries.slice().sort((a, b) => HB.UNIT[b.type].cost * b.count - HB.UNIT[a.type].cost * a.count);
    const parts = arr.slice(0, 2).map(e => (e.count > 1 ? fmt(e.count) + ' ' : '') + (e.count > 1 ? HB.UNIT[e.type].short : HB.UNIT[e.type].name));
    return parts.join(' + ') + (arr.length > 2 ? ' +' + (arr.length - 2) : '');
  }

  // ---------- step 2: draft (fixed-position − count ＋, hold to repeat) ----------
  const inEra = (u, k) => u.era === k || u.alsoEra === k;
  function openDraft() {
    show('draft');
    const tabs = $('era-tabs'); tabs.innerHTML = '';
    HB.ERAS.forEach((e, k) => {
      const b = document.createElement('button'); b.textContent = e.name; b.style.color = e.color; b.classList.toggle('on', k === st.era);
      b.addEventListener('click', () => { st.era = k; for (const x of tabs.children) x.classList.toggle('on', x === b); renderUnits(); });
      tabs.appendChild(b);
    });
    $('draft-title').textContent = st.mode === '2p' ? (st.draftSide ? 'RED drafts' : 'BLUE drafts') : 'Your army';
    $('draft-title').className = 'title s' + st.draftSide;
    $('vs-line').classList.toggle('hidden', !st.challenge);
    if (st.challenge) $('vs-line').textContent = '🎯 Challenger: ' + armyName(st.challenge) + ' (' + fmt(HB.armyCost(st.challenge)) + ' pts)';
    renderUnits(); renderArmy();
  }
  function spent() { const d = st.draft[st.draftSide]; let c = 0; for (const k in d) c += HB.UNIT[k].cost * d[k]; return c; }
  function renderUnits() {
    const list = $('unit-list'); list.innerHTML = '';
    for (const u of playable.filter(u => inEra(u, st.era))) {
      const c = document.createElement('div'); c.className = 'ucard'; c.style.setProperty('--era', HB.ERAS[u.era].color); c.dataset.id = u.id;
      const pc = u.cost * u.pack;
      c.innerHTML = '<div><h3>' + u.name.replace(' (item)', '') + (u.item ? '<span class="item-tag">ITEM</span>' : '') + '</h3><div class="meta">' + u.role + ' · ' + (u.pack > 1 ? '+' + u.pack + ' for ' : '') + fmt(pc) + ' pts' + (u.pack > 1 ? ' (' + u.cost + ' each)' : '') + ' · ' + u.hp + ' hp · ' + (u.power ? '⚡ power' : '✝ faith') + '</div></div>' +
        '<div class="ctl"><button class="rem" aria-label="remove">−</button><span class="n"></span><button class="add" aria-label="add">＋</button></div>' +
        '<div class="lore">★ <b>' + u.lore.name + '</b> (cooldown ' + (u.lore.cd >= 900 ? 'one use' : u.lore.cd + 's') + ') — ' + u.lore.desc + '<i>Counter: ' + u.lore.counter + '</i></div>';
      const add = c.querySelector('.add'), rem = c.querySelector('.rem');
      repeatButton(add, () => change(u, +1)); repeatButton(rem, () => change(u, -1));
      list.appendChild(c);
    }
    refreshUnits();
  }
  function refreshUnits() {
    const left = cfg.budget - spent(), d = st.draft[st.draftSide];
    for (const c of $('unit-list').children) {
      const u = HB.UNIT[c.dataset.id], n = d[u.id] || 0;
      c.querySelector('.n').textContent = n ? '×' + fmt(n) : '';
      c.querySelector('.add').disabled = u.cost * u.pack > left;
      c.querySelector('.rem').disabled = !n;
    }
  }
  function change(u, dir) {
    const d = st.draft[st.draftSide], pc = u.cost * u.pack;
    if (dir > 0) { if (cfg.budget - spent() < pc) return false; d[u.id] = (d[u.id] || 0) + u.pack; }
    else { if (!d[u.id]) return false; d[u.id] -= u.pack; if (d[u.id] <= 0) delete d[u.id]; }
    SFX.select(); refreshUnits(); renderArmy(); return true;
  }
  // press-and-hold repeats; the buttons never move because the count cell has a fixed width
  function repeatButton(btn, fn) {
    let timer = null, fired = false;
    const stop = () => { clearTimeout(timer); timer = null; };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); fired = true; if (fn() === false) return;
      let delay = 380;
      const loop = () => { if (fn() === false) return stop(); delay = Math.max(45, delay * 0.8); timer = setTimeout(loop, delay); };
      timer = setTimeout(loop, delay);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, stop);
    btn.addEventListener('click', (e) => { if (fired) { fired = false; return; } fn(); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function renderArmy() {
    const d = st.draft[st.draftSide], s = spent(), el = $('army-list');
    $('budget-fill').style.width = Math.min(100, s / cfg.budget * 100) + '%';
    $('budget-txt').textContent = fmt(s) + ' / ' + fmt(cfg.budget) + ' pts';
    const keys = Object.keys(d);
    el.innerHTML = keys.length ? keys.map(k => '<span class="chip" style="--era:' + HB.ERAS[HB.UNIT[k].era].color + '">' + fmt(d[k]) + ' ' + HB.UNIT[k].short + '</span>').join('') : '<span class="muted">Empty: tap ＋ on a unit, or 🎲 Auto-fill</span>';
    $('draft-done').disabled = !keys.length;
  }
  const minPack = Math.min(...playable.map(u => u.cost * u.pack));
  function autoFill() {
    const d = st.draft[st.draftSide];
    const left = cfg.budget - spent();
    const rand = HB.makeRng(newSeed());
    if (!Object.keys(d).length) { for (const e of HB.aiDraft(cfg.budget, rand)) d[e.type] = e.count; }
    else {
      // top up the units already picked, cheapest packs last
      let l = left; const picks = Object.keys(d).map(k => HB.UNIT[k]).filter(u => !u.item).sort((a, b) => b.cost * b.pack - a.cost * a.pack);
      let guard = 0;
      while (guard++ < 5000) { const af = picks.filter(u => u.cost * u.pack <= l); if (!af.length) break; const u = af[guard % af.length]; d[u.id] += u.pack; l -= u.cost * u.pack; }
      for (const u of [HB.UNIT.legion, HB.UNIT.spartan]) while (l >= u.cost * u.pack) { d[u.id] = (d[u.id] || 0) + u.pack; l -= u.cost * u.pack; }
    }
    refreshUnits(); renderArmy();
  }
  $('draft-back').addEventListener('click', () => show('menu'));
  $('draft-clear').addEventListener('click', () => { st.draft[st.draftSide] = {}; refreshUnits(); renderArmy(); });
  $('draft-random').addEventListener('click', autoFill);
  $('draft-share').addEventListener('click', () => { const e = toEntries(st.draft[st.draftSide]); if (!e.length) return toast('Draft something first'); shareText('Share army', 'Friends paste this in Challenge to fight your army.', HB.armyCode(e)); });
  $('draft-done').addEventListener('click', () => {
    const left = cfg.budget - spent();
    if (left >= minPack && left > cfg.budget * 0.03) {
      $('unspent-txt').textContent = fmt(left) + ' of ' + fmt(cfg.budget) + ' pts are unspent. Auto-fill tops up the units you picked.';
      $('unspent').classList.remove('hidden'); return;
    }
    draftDone();
  });
  $('unspent-fill').addEventListener('click', () => { $('unspent').classList.add('hidden'); autoFill(); draftDone(); });
  $('unspent-go').addEventListener('click', () => { $('unspent').classList.add('hidden'); draftDone(); });
  const toEntries = (o) => Object.keys(o).map(type => ({ type, count: o[type] }));
  function draftDone() {
    if (st.mode === '2p' && st.draftSide === 0) { st.draftSide = 1; toast('Pass the phone to RED'); openDraft(); return; }
    const mine = toEntries(st.draft[0]);
    const seed = newSeed();
    let cmds, armies;
    if (st.mode === '2p') { cmds = ['human', 'human']; armies = [mine, toEntries(st.draft[1])]; }
    else if (st.mode === 'ffa3') { cmds = ['human', 'gamedev', 'remi']; armies = [mine]; }
    else if (st.mode === 'ffa4') { cmds = ['human', 'gamedev', 'remi', 'ai']; armies = [mine]; }
    else { cmds = ['human', 'ai']; armies = [mine, st.challenge || null]; }
    const m = HB.makeMatch({ seed, cmds, budget: cfg.budget, armies, chaos: cfg.chaos, weather: cfg.weather, names: st.mode === '2p' ? ['Blue', 'Red'] : st.challenge ? ['You', 'Challenger'] : null });
    st.featured = null;
    startPlacement(m);
  }

  // ---------- step 3: deploy / fight / watch ----------
  function quickBattle() {
    const seed = newSeed();
    const m = HB.makeMatch({ seed, cmds: ['human', 'ai'], budget: cfg.budget, chaos: cfg.chaos, weather: cfg.weather });
    st.featured = null; st.mode = 'ai';
    startPlacement(m, { quick: true });
  }
  function startSpectate(seed) {
    const cmds = ['remi', 'gamedev', 'ai', 'ai'].slice(0, cfg.spec);
    const m = HB.makeMatch({ seed: seed != null ? seed : newSeed(), cmds, budget: cfg.budget, chaos: cfg.chaos, weather: cfg.weather });
    st.featured = null; st.mode = 'spectate';
    startBattle(m, { spectate: true });
  }
  function startFeatured(id, opts) {
    const f = HB.FEATURED.find(x => x.id === id); if (!f) return;
    const armies = HB.featuredArmies(f);
    const m = { seed: (opts && opts.seed) || newSeed(), nF: 2, weather: (opts && opts.weather) || cfg.weather, chaos: opts && 'chaos' in opts ? opts.chaos : cfg.chaos,
      factions: [{ name: armyName(armies[0]), cmd: 'human' }, { name: armyName(armies[1]), cmd: 'ai' }], armies, ft: f.id };
    st.featured = f; st.mode = 'ai';
    startPlacement(m);
  }
  function openWatch(code) {
    let m;
    try { m = HB.decodeWatch(code); } catch (e) { toast('That watch link is broken'); show('menu'); return; }
    st.featured = m.ft ? HB.FEATURED.find(x => x.id === m.ft) : null; st.mode = 'watch';
    startBattle(m, { spectate: true, watch: true });
  }
  function resetBattleUi() {
    st.sel = -1; st.speed = 1; st.slowT = 0; st.acc = 0; st.endT = -1; st.resultShown = false; st.paused = false; st.hold = null; st.drag = null; st.ticker = []; renderTicker();
    setSpeed(1); $('cm-pause').textContent = '❚❚ Pause'; $('offer').classList.add('hidden'); $('diplo').classList.add('hidden');
  }
  function build(m, extra) {
    st.match = m;
    st.battle = HB.battleFor(m, extra);
    st.battle.buildGrid();
    R.reset(m.weather); R.nF = m.nF;
  }
  function startPlacement(m, o) {
    st.spectate = false; st.watch = false;
    build(m);
    resetBattleUi();
    st.placing = true; st.pred = null;
    show('place');
    $('btn-fight').classList.remove('hidden');
    buildChips();
    $('place-help').textContent = (st.featured ? st.featured.title + ': ' : '') + 'drag your squads inside your zone, then FIGHT!';
    tip('place');
    updateHud(true);
    if (o && o.quick) { $('place-help').textContent = ''; $('btn-fight').classList.add('hidden'); st.countdown = 3.2; $('countdown').classList.remove('hidden'); }
  }
  function startBattle(m, o) {
    st.spectate = !!(o && o.spectate); st.watch = !!(o && o.watch);
    build(m, o && o.watch ? { cmds: m.cmds || [] } : null);
    resetBattleUi();
    st.placing = false;
    show('battle');
    $('btn-fight').classList.add('hidden'); $('place-help').textContent = '';
    buildChips(); updateHud(true);
    if (st.watch) ticker('▶ Replaying a shared battle (seed ' + m.seed + ')', '#ffd166');
    else if (st.spectate) ticker('👁 ' + m.factions.map(f => f.name).join(' vs '), '#ffd166');
    tip('cam'); if (m.nF > 2 && !st.spectate) tip('ffa');
  }
  $('btn-fight').addEventListener('click', () => {
    A.unlock();
    // featured matchups always ask; anything else asks once per session
    if (st.featured || !st.predictedOnce) { st.predictedOnce = true; openPredict(); } else beginFight();
  });
  function openPredict() {
    const m = st.match;
    $('predict-sub').textContent = st.featured ? st.featured.blurb : m.factions.map(f => f.name).join(' vs ');
    const pick = $('pick'); pick.innerHTML = '';
    m.factions.forEach((f, s) => {
      const b = document.createElement('button'); b.className = 'pick-btn s' + s; b.style.color = COLORS[s];
      b.textContent = (m.nF > 2 ? f.name : armyName(m.armies[s])) + ' (' + fmt(HB.armyCost(m.armies[s])) + ' pts)';
      b.addEventListener('click', () => { st.pred = s; $('predict').classList.add('hidden'); SFX.select(); beginFight(); });
      pick.appendChild(b);
    });
    $('predict').classList.remove('hidden');
  }
  $('pick-skip').addEventListener('click', () => { st.pred = null; $('predict').classList.add('hidden'); beginFight(); });
  function beginFight() {
    // rebuild from the (rounded) deployment so the watch link replays the identical battle
    const m = st.match, pred = st.pred;
    build(m);
    resetBattleUi(); st.pred = pred;
    st.placing = false; $('btn-fight').classList.add('hidden'); $('place-help').textContent = '';
    show('battle'); buildChips();
    tip('lore'); if (m.nF > 2) tip('ffa'); else tip('cam');
    if (m.armies[0].some(e => HB.UNIT[e.type].power)) tip('faith');
  }

  // ---------- strip: faction chips with morale/energy, doom, clock ----------
  function buildChips() {
    const b = st.battle, el = $('chips'); el.innerHTML = '';
    for (let s = 0; s < b.nF; s++) {
      const c = document.createElement('button'); c.className = 'fchip'; c.dataset.s = s; c.style.color = COLORS[s];
      c.innerHTML = '<div class="nm"><b></b><span class="cnt"></span></div><div class="meter m"><i></i></div><div class="meter e"><i></i></div><div class="tags"></div>';
      c.addEventListener('click', () => chipTap(s));
      el.appendChild(c);
    }
    st.stripT = 4;
  }
  function humanSide() { if (st.spectate || !st.match) return -1; return st.match.factions.findIndex(f => f.cmd === 'human'); }
  function chipTap(s) {
    st.stripT = 4;
    const b = st.battle, me = humanSide();
    const f = b.fac[s];
    const info = f.name + ': ' + b.sideCount(s).toLocaleString() + ' units · morale ' + Math.round(f.morale) + ' · energy ' + Math.round(f.energy) + (f.oath ? ' · OATHBREAKER' : '') + (f.ally >= 0 ? ' · allied with ' + b.fac[f.ally].name : '');
    if (me < 0 || s === me || b.nF < 3 || st.placing || b.over || st.match.factions.filter(x => x.cmd === 'human').length > 1) { toast(info, 2.4); return; }
    const mf = b.fac[me], el = $('diplo');
    let html = '<div>' + esc(info) + '</div><div class="row">';
    if (mf.ally === s) html += '<button class="big-btn sm fight" data-a="bt">🗡 BETRAY</button>';
    else if (b.invasion) html += '<button class="big-btn sm fight" data-a="bt">🗡 Break truce</button>';
    else if (mf.ally < 0 && !f.oath && !mf.oath && f.ally < 0) html += '<button class="big-btn sm" data-a="pr">🤝 Propose alliance</button>';
    else html += '<span class="muted">' + (f.oath ? 'Nobody allies with an Oathbreaker.' : mf.oath ? 'Nobody trusts an Oathbreaker.' : 'Already allied elsewhere.') + '</span>';
    html += '<button class="sm-btn" data-a="x">Close</button></div>';
    el.innerHTML = html; el.classList.remove('hidden');
    el.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => {
      const a = btn.dataset.a; el.classList.add('hidden');
      if (a === 'pr') { b.command({ c: 'pr', a: me, b: s }); toast('Alliance proposed to ' + f.name); }
      if (a === 'bt') b.command({ c: 'bt', a: me, b: s });
    }));
  }
  function showOffer() {
    const b = st.battle, me = humanSide(); if (me < 0) return;
    const p = b.fac[me].pending, el = $('offer');
    if (!p) { if (!el.classList.contains('hidden') && el.dataset.k) { el.classList.add('hidden'); el.dataset.k = ''; } return; }
    const key = p.from + ':' + Math.floor(b.t); if (el.dataset.from === String(p.from) && !el.classList.contains('hidden')) return;
    el.dataset.from = String(p.from); el.dataset.k = key;
    el.innerHTML = '<div>🤝 <b style="color:' + COLORS[p.from] + '">' + esc(b.fac[p.from].name) + '</b> offers an alliance (shared vision, no friendly fire, a growing "brothers in arms" bonus).</div><div class="row"><button class="big-btn sm" data-a="ac">Accept</button><button class="sm-btn" data-a="dc">Decline</button></div>';
    el.classList.remove('hidden');
    el.querySelectorAll('[data-a]').forEach(btn => btn.addEventListener('click', () => { b.command({ c: btn.dataset.a, a: me, b: p.from }); el.classList.add('hidden'); el.dataset.from = ''; }));
  }
  function updateHud(force) {
    const b = st.battle; if (!b) return;
    const now = performance.now(); if (!force && now - st.lastHud < 200) return; st.lastHud = now;
    const chips = $('chips').children;
    for (let s = 0; s < b.nF && s < chips.length; s++) {
      const c = chips[s], f = b.fac[s], n = b.sideCount(s);
      c.querySelector('b').textContent = f.name;
      c.querySelector('.cnt').textContent = n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
      c.querySelector('.m i').style.width = Math.round(f.morale) + '%';
      c.querySelector('.e i').style.width = Math.round(f.energy) + '%';
      const tags = [];
      if (f.ally >= 0) tags.push('🤝' + b.fac[f.ally].name);
      if (f.oath) tags.push('OATHBREAKER');
      if (f.vengeT > 0) tags.push('VENGEANCE');
      if (f.dark) tags.push('⚡DARK');
      c.querySelector('.tags').textContent = tags.join(' ');
      c.classList.toggle('ally', f.ally >= 0); c.classList.toggle('out', n === 0);
    }
    const t = b.t | 0; $('clock').textContent = (t / 60 | 0) + ':' + String(t % 60).padStart(2, '0');
    $('envtxt').textContent = b.events.length ? b.events.map(e => e.name).join(' · ') : ({ day: '☀', night: '☾', storm: '⛈' }[b.weather] + (b.chaos ? ' chaos' : ''));
    const d = $('doom');
    d.classList.toggle('on', b.doom > 0 || !!b.invasion);
    $('doom-fill').style.width = (b.invasion ? b.invasion.T / b.invasion.dur * 100 : b.doom) + '%';
    $('doom-txt').textContent = b.invasion ? '👽 THEY HAVE ARRIVED · truce · ' + Math.ceil(b.invasion.T) + 's' : 'DOOMSDAY ' + Math.round(b.doom) + '%';
    const s = st.sel >= 0 ? b.squads[st.sel] : null;
    if (s && s.alive > 0) {
      const L = s.def.lore, blk = b.payBlock(s), cd = s.cd > 900 ? 'used' : s.cd > 0 ? Math.ceil(s.cd) + 's' : blk ? blk : 'READY: hold the squad';
      $('selinfo').innerHTML = '<b>' + esc(s.label || s.def.name) + '</b> ' + s.alive + '/' + s.n0 + (s.lvl > 0 ? ' · knocked back to ' + HB.ERAS[s.def.era].name : '') + '<br>★ ' + L.name + ': ' + cd + ' · ' + (s.def.power ? '⚡' + (L.en || 15) + ' energy' : '✝ ' + b.faithCost(s) + ' morale');
    } else $('selinfo').innerHTML = '';
    if (!st.spectate) showOffer();
    $('strip').classList.toggle('dim', st.stripT <= 0 && st.screen === 'battle');
  }

  // ---------- corner menu ----------
  $('btn-menu').addEventListener('click', () => { $('cmenu').classList.toggle('hidden'); st.stripT = 4; });
  segment('speed-seg', v => setSpeed(+v));
  function setSpeed(v) {
    st.speed = v;
    for (const b of $('speed-seg').children) b.classList.toggle('on', +b.dataset.v === v);
    updateBadge();
  }
  function updateBadge() { $('speed-badge').textContent = st.paused ? '❚❚' : (st.speed === 0.5 ? '½×' : st.speed + '×'); }
  $('cm-pause').addEventListener('click', () => { st.paused = !st.paused; $('cm-pause').textContent = st.paused ? '▶ Resume' : '❚❚ Pause'; updateBadge(); $('cmenu').classList.add('hidden'); });
  $('cm-center').addEventListener('click', () => { R.recenter(); $('cmenu').classList.add('hidden'); toast('Camera follows the action', 1.2); });
  $('cm-watch').addEventListener('click', () => { $('cmenu').classList.add('hidden'); shareWatch(); });
  $('cm-army').addEventListener('click', () => {
    $('cmenu').classList.add('hidden');
    const me = Math.max(0, humanSide()); shareText('Share army', 'Friends paste this in Challenge to fight this army.', HB.armyCode(st.match.armies[me]));
  });
  $('cm-sound').addEventListener('click', () => setSound(A.muted));
  $('cm-quit').addEventListener('click', () => { st.battle = null; show('menu'); });
  function watchUrl() {
    const b = st.battle; if (!b) return '';
    const log = st.watch ? (st.match.cmds || []) : b.log.slice();
    return location.origin + location.pathname + '#watch=' + HB.encodeWatch(st.match, log);
  }
  function shareWatch() {
    shareText('Watch link', 'Replays this exact battle (same seed, armies' + (st.battle.log.length ? ' and your ' + st.battle.log.length + ' orders' : '') + ') on any device.', watchUrl());
  }
  function shareText(title, sub, text) {
    $('share-title').textContent = title; $('share-sub').textContent = sub; $('share-text').value = text;
    $('share').classList.remove('hidden');
    st.lastShare = text;
  }
  $('share-copy').addEventListener('click', async () => {
    const t = $('share-text').value;
    try { await navigator.clipboard.writeText(t); toast('Copied!'); }
    catch (e) { $('share-text').select(); try { document.execCommand('copy'); toast('Copied!'); } catch (e2) { toast('Select and copy the text'); } }
  });

  // ---------- input: tap / hold / drag squads, drag-pan, pinch & double-tap zoom ----------
  const cv = $('cv');
  const ptrs = new Map();
  let down = null, pinch = null, lastTap = { t: 0, x: 0, y: 0 };
  function spreadOf(b, s) { return R.squadSpread(b, s); }
  // hit test against squads with a generous radius around each centroid (much bigger than the dots)
  function hitSquad(sx, sy, filter, minPx) {
    const b = st.battle; if (!b) return -1;
    const w = R.toWorld(sx, sy), minR = (minPx || 30) / R.scale;
    let best = -1, bd = 1e9;
    for (const s of b.squads) {
      if (s.alive <= 0 || s.temp) continue;
      if (filter && !filter(s)) continue;
      if (!ui.controllable(s.side) && !st.spectate && s.invisT > 0) continue;
      const sp = Math.min(70, spreadOf(b, s));
      const d = Math.hypot(w.x - s.cx, w.y - s.cy), reach = Math.max(sp, minR);
      if (d <= reach) { const score = d / reach; if (score < bd) { bd = score; best = s.id; } }
    }
    return best;
  }
  const mine = (s) => ui.controllable(s.side);
  cv.addEventListener('pointerdown', (e) => {
    A.unlock();
    if (!st.battle || (st.screen !== 'place' && st.screen !== 'battle')) return;
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    $('cmenu').classList.add('hidden');
    if (ptrs.size === 2) { // pinch
      const [a, c] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - c.x, a.y - c.y), mx: (a.x + c.x) / 2, my: (a.y + c.y) / 2 };
      st.hold = null; st.drag = null; if (down) down.cancel = true;
      return;
    }
    const b = st.battle;
    const sq = hitSquad(e.clientX, e.clientY, st.spectate ? null : mine, st.placing ? 26 : 34);
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), sq, moved: false, consumed: false, id: e.pointerId };
    const s = sq >= 0 ? b.squads[sq] : null;
    if (st.placing && s && mine(s)) {
      const idx = [];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < b.n; i++) if (b.alive[i] && b.sq[i] === sq) { idx.push(i); x0 = Math.min(x0, b.x[i]); x1 = Math.max(x1, b.x[i]); y0 = Math.min(y0, b.y[i]); y1 = Math.max(y1, b.y[i]); }
      const w = R.toWorld(e.clientX, e.clientY);
      st.drag = { sq, idx, x0, x1, y0, y1, wx: w.x, wy: w.y, dx: 0, dy: 0 };
      st.sel = sq;
    } else if (!st.placing && !st.spectate) {
      // hold snaps to the nearest friendly squad within a generous radius, so moving squads are easy to catch
      const hs = hitSquad(e.clientX, e.clientY, (o) => mine(o) && o.def.lore, 56);
      if (hs >= 0) st.hold = { sq: hs, f: 0, t0: performance.now() };
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, c] = [...ptrs.values()];
      const d = Math.hypot(a.x - c.x, a.y - c.y), mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
      R.zoomAt(mx, my, d / Math.max(1, pinch.d)); R.panBy(mx - pinch.mx, my - pinch.my);
      pinch.d = d; pinch.mx = mx; pinch.my = my; R.auto = false;
      return;
    }
    if (!down || e.pointerId !== down.id) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down.moved = true; st.hold = null; }
    if (st.drag) {
      const b = st.battle, d = st.drag, w = R.toWorld(e.clientX, e.clientY), z = HB.zonesFor(b.nF)[b.squads[d.sq].side];
      let dx = Math.round(w.x - d.wx), dy = Math.round(w.y - d.wy);
      dx = Math.max(z.x0 + 2 - d.x0, Math.min(z.x1 - 2 - d.x1, dx)); dy = Math.max(z.y0 - d.y0, Math.min(z.y1 - d.y1, dy));
      const ddx = dx - d.dx, ddy = dy - d.dy;
      if (ddx || ddy) {
        for (const i of d.idx) { b.x[i] += ddx; b.y[i] += ddy; }
        const s = b.squads[d.sq]; s.cx += ddx; s.cy += ddy; d.dx = dx; d.dy = dy;
      }
    } else if (down.moved && !down.cancel) {
      R.panBy(e.clientX - down.lx, e.clientY - down.ly); R.auto = false;
    }
    down.lx = e.clientX; down.ly = e.clientY;
  });
  function endPointer(e) {
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) pinch = null; if (down) down.cancel = true; }
    if (!down || e.pointerId !== down.id) return;
    const b = st.battle, d = down; down = null;
    if (st.drag) {
      const dr = st.drag; st.drag = null;
      if (dr.dx || dr.dy) {
        const s = b.squads[dr.sq], ent = st.match.armies[s.side][s.id - b.squads.findIndex(o => o.side === s.side)];
        if (ent) { ent.x = Math.round(ent.x + dr.dx); ent.y = Math.round(ent.y + dr.dy); }
        b.buildGrid(); return;
      }
    }
    if (d.consumed || d.cancel) { st.hold = null; return; }
    st.hold = null;
    if (d.moved || !b) return;
    const now = performance.now();
    if (now - lastTap.t < 320 && Math.hypot(d.x - lastTap.x, d.y - lastTap.y) < 40) { // double-tap zoom
      lastTap.t = 0;
      if (R.cam.z > 2.2) { R.cam.z = 1; R.view(); R.recenter(); } else { R.zoomAt(d.x, d.y, 2); R.auto = false; }
      return;
    }
    lastTap = { t: now, x: d.x, y: d.y };
    tap(d.x, d.y, d.sq);
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (down && e.pointerId === down.id) { down = null; st.hold = null; st.drag = null; } pinch = null; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('wheel', (e) => { e.preventDefault(); R.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); R.auto = false; }, { passive: false });
  function squadInfo(s) {
    const L = s.def.lore, f = st.battle.fac[s.side];
    return f.name + ': ' + (s.label || s.def.name) + ' (' + s.alive + ')' + (L ? ' · ★ ' + L.name + (s.cd > 900 ? ' used' : s.cd > 0 ? ' in ' + Math.ceil(s.cd) + 's' : ' ready') : '');
  }
  function tap(sx, sy, sq) {
    const b = st.battle;
    st.stripT = 4;
    if (st.spectate) { const h = hitSquad(sx, sy, null, 30); if (h >= 0) toast(squadInfo(b.squads[h]), 2); return; }
    const s = sq >= 0 ? b.squads[sq] : null;
    if (st.placing) {
      if (s) { st.sel = sq; toast(s.def.name + ': ★ ' + s.def.lore.name); } else st.sel = -1;
      return;
    }
    const sel = st.sel >= 0 ? b.squads[st.sel] : null;
    if (sel && sel.alive > 0) {
      const foe = hitSquad(sx, sy, (o) => b.hos[sel.side * NF + o.side] || (!mine(o) && o.side !== sel.side), 30);
      if (foe >= 0 && (sq < 0 || foe !== sq)) {
        b.command({ c: 'at', s: sel.id, t: foe }); st.sel = -1; SFX.order();
        toast(sel.def.short + ' → attack ' + b.squads[foe].def.short, 1.1); return;
      }
      if (s && mine(s)) { st.sel = st.sel === sq ? -1 : sq; SFX.select(); return; }
      const w = R.toWorld(sx, sy);
      b.command({ c: 'mv', s: sel.id, x: w.x, y: w.y }); st.sel = -1; SFX.order();
      return;
    }
    if (s && mine(s)) { st.sel = sq; SFX.select(); return; }
    const other = hitSquad(sx, sy, null, 30);
    if (other >= 0) toast(squadInfo(b.squads[other]) + ' · select your squad first', 1.6);
    st.sel = -1;
  }
  function updateHold() {
    if (!st.hold || !down || down.consumed) return;
    const f = (performance.now() - st.hold.t0) / 420; st.hold.f = f;
    if (f >= 1) {
      const s = st.battle.squads[st.hold.sq];
      const blk = st.battle.payBlock(s);
      down.consumed = true;
      if (s.cd > 0) { SFX.deny(); toast('★ ' + s.def.lore.name + (s.cd > 900 ? ' already used' : ' recharging: ' + Math.ceil(s.cd) + 's'), 1.5); }
      else if (blk) { SFX.deny(); toast('★ ' + blk, 1.5); }
      else { st.battle.command({ c: 'ab', s: s.id }); SFX.ability(); }
      st.hold = null;
    }
  }

  // ---------- fx → renderer, audio, ticker ----------
  function consumeFx(b) {
    const fx = b.fx;
    for (let k = 0; k < fx.length; k++) {
      const f = fx[k];
      R.ingest(f, b);
      if (f.slow) st.slowT = Math.max(st.slowT, Math.min(1.5, f.slow));
      switch (f.k) {
        case 'shot': SFX.shot(f.t); break;
        case 'boom': SFX.boom(f.r >= 15); break;
        case 'nuke': SFX.boom(true); SFX.event('emp'); break;
        case 'empflash': SFX.event('emp'); break;
        case 'clash': SFX.clash(); break;
        case 'event': SFX.event(f.id); if (f.id !== 'darkemp' && f.id !== 'nuke') tip('event'); ticker('⚠ ' + f.text, f.color); st.stripT = 4; break;
        case 'ability': {
          SFX.ability();
          const human = ui.controllable(f.side);
          if (human || st.spectate || /EMP|NUKE/.test(f.name)) ticker('★ ' + b.fac[f.side].name + ': ' + f.name, COLORS[f.side]);
          break;
        }
        case 'deny': if (ui.controllable(f.side)) { SFX.deny(); toast('★ ' + f.msg, 1.6); } break;
        case 'betrayed': SFX.event('betrayal'); ticker(f.text, '#ff6a8a'); st.stripT = 5; break;
        case 'diplo': if (f.text) ticker(f.text, f.type === 'ally' ? '#7dff9a' : '#bbb'); if (f.type === 'offer') SFX.callout(); break;
        case 'ticker': ticker(f.text, '#ffd166'); break;
        case 'callout':
          if (f.big && !f.ability) SFX.callout();
          if (/AMMO/.test(f.text)) tip('ammo');
          break;
      }
    }
    fx.length = 0;
  }
  function showResult() {
    const b = st.battle, S = b.summary(), m = st.match;
    st.resultShown = true;
    const w = S.winner;
    const nm = (s) => m.factions[s].name;
    let title;
    if (w < 0) title = 'DRAW!';
    else if (S.alliedWin) title = '🤝 ' + S.winners.map(nm).join(' & ') + ' WIN';
    else title = (m.nF === 2 && !st.spectate && m.factions[1].cmd !== 'human' ? (w === 0 ? 'VICTORY: ' : 'DEFEAT: ') : '') + nm(w).toUpperCase() + ' WINS';
    $('res-title').textContent = title;
    $('res-title').style.color = w < 0 ? '#ffd166' : COLORS[w];
    let pred = '';
    if (st.pred != null) pred = S.winners.includes(st.pred) ? '✅ You called it!' : '😱 UPSET! You picked ' + nm(st.pred) + '.';
    $('res-pred').textContent = pred + (S.timeout ? ' (time limit: decided on remaining value)' : '');
    $('res-mvp').innerHTML = S.mvp ? '🏅 MVP: <b>' + esc(S.mvp.name) + '</b> (' + esc(nm(S.mvp.side)) + '): ' + S.mvp.kills.toLocaleString() + ' kills' : '';
    // per-side tallies come from the same squads the HUD counts, so defectors are listed under the side they joined
    $('res-cols').innerHTML = S.factions.map((f, side) => '<div><h4 style="color:' + COLORS[side] + '">' + esc(f.name) + ' · ' + S.totals[side].toLocaleString() + ' left' +
      '<small>' + [f.oath ? 'Oathbreaker' : '', f.nukes ? '☢×' + f.nukes : '', f.msDmg ? '👽 ' + fmt(f.msDmg) + ' dmg to mothership' : ''].filter(Boolean).join(' · ') + '</small></h4>' +
      S.survivors[side].map(x => '<div><span>' + esc(x.name) + '</span><span>' + x.alive.toLocaleString() + '/' + x.n0.toLocaleString() + '</span></div>').join('') + '</div>').join('');
    const diplo = S.diplo.filter(d => d.type === 'betray').map(d => nm(d.a) + ' betrayed ' + nm(d.b));
    $('res-misc').textContent = 'Battle time ' + (S.time | 0) + 's · ' + S.abilities + ' lore abilities' + (S.events.length ? ' · events: ' + S.events.map(id => (HB.EVENTS[id] && HB.EVENTS[id].name) || id).join(', ') : '') + (diplo.length ? ' · ' + diplo.join(', ') : '') + ' · seed ' + m.seed;
    $('res-rematch').textContent = st.watch ? 'WATCH AGAIN' : 'REMATCH';
    $('result').classList.remove('hidden');
    st.screen = 'result';
    const me = humanSide();
    if (me < 0 || S.winners.includes(me) || w < 0) SFX.win(); else SFX.lose();
  }
  $('res-menu').addEventListener('click', () => { st.battle = null; show('menu'); });
  $('res-watch').addEventListener('click', shareWatch);
  $('res-rematch').addEventListener('click', () => {
    const m = st.match;
    if (st.watch) { startBattle(m, { spectate: true, watch: true }); return; }
    if (st.spectate) { startSpectate(); return; }
    const m2 = Object.assign({}, m, { seed: newSeed(), armies: m.armies.map(a => a.map(e => Object.assign({}, e))) });
    startPlacement(m2);
  });

  // ---------- main loop ----------
  let lastT = performance.now(), fpsAcc = 0, fpsN = 0;
  const perf = { fps: 0, frames: [] };
  function frame(now) {
    const rdt = (now - lastT) / 1000, dt = Math.min(0.1, rdt); lastT = now;
    perf.frames.push(rdt); if (perf.frames.length > 240) perf.frames.shift();
    const b = st.battle;
    if (st.countdown > 0) {
      st.countdown -= dt; const n = Math.ceil(st.countdown);
      $('countdown').textContent = n > 0 ? String(n) : 'FIGHT!';
      if (st.countdown <= 0) { $('countdown').classList.add('hidden'); beginFight(); }
    } else if (b && st.screen === 'battle' && !st.paused) {
      updateHold();
      let scale = st.speed;
      if (st.slowT > 0) { st.slowT -= dt; scale *= 0.3; }
      st.acc += dt * scale;
      const maxSteps = 2 + Math.ceil(st.speed * 3);
      let steps = 0; const t0 = performance.now();
      while (st.acc >= DT && steps < maxSteps && !b.over) {
        b.step(); st.acc -= DT; steps++;
        if (performance.now() - t0 > 24) break; // phone budget: slow time instead of dropping frames
      }
      if (st.acc > DT * 4) st.acc = DT * 4;
      consumeFx(b);
      if (b.over && st.endT < 0) st.endT = 1.8;
      if (st.endT > 0) { st.endT -= dt; if (st.endT <= 0 && !st.resultShown) showResult(); }
    } else if (b) consumeFx(b);
    R.draw(st.screen === 'menu' || st.screen === 'draft' ? null : b, ui, st.paused ? 0 : dt * (st.slowT > 0 ? 0.5 : 1));
    if (b) updateHud();
    if (st.stripT > 0) st.stripT -= dt;
    if (st.toastT > 0) { st.toastT -= dt; if (st.toastT <= 0) $('toast').classList.add('hidden'); }
    if (st.ticker.length) {
      for (const x of st.ticker) x.t -= dt;
      const before = st.ticker.length; st.ticker = st.ticker.filter(x => x.t > 0);
      if ((fpsN++ & 7) === 0 || before !== st.ticker.length) renderTicker();
    }
    if (st.tipT > 0) { st.tipT -= dt; if (st.tipT <= 0) $('tip').classList.add('hidden'); }
    else if (st.tipQ.length && (st.screen === 'battle' || st.screen === 'place')) { $('tip').innerHTML = st.tipQ.shift(); $('tip').classList.remove('hidden'); st.tipT = 5; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // deep link: #watch=<code> (read before show('menu') clears the hash)
  const wm = /#watch=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (!wm) show('menu');
  if (wm) setTimeout(() => openWatch(wm[1]), 0);
  window.addEventListener('hashchange', () => { const m = /#watch=([A-Za-z0-9_-]+)/.exec(location.hash); if (m) openWatch(m[1]); });

  // test hook
  window.__tb = {
    st, cfg, R, perf, ui,
    get battle() { return st.battle; },
    startFeatured, beginFight, showResult, startSpectate, quickBattle, openWatch, watchUrl,
    setSpeed, hitSquad,
    fastForward(sec) { const b = st.battle; const n = Math.round(sec / DT); for (let k = 0; k < n && !b.over; k++) b.step(); consumeFx(b); },
  };
})();
