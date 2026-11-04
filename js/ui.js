/* Timeline Brawl v3 — screens, gestures and the glue between sim, renderer, campaign and net. */
(function (G) {
  'use strict';
  const HB = G.HB, $ = (id) => document.getElementById(id), K = HB.KINGDOMS, P = HB.PROVS, C = HB.Campaign, W = HB.WORLD;
  const sfx = (n, a) => { try { HB.Audio && HB.Audio.SFX[n] && HB.Audio.SFX[n](a); } catch (e) { /* audio is optional */ } };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BLUE = '#2f62c0', RED = '#b8302a';
  const crestCache = {};
  const crest = (k, size) => { const src = HB.artCrestSrc && HB.artCrestSrc(K[k].id); if (src) return `<img class="crestimg" src="${src}" width="${size || 24}" height="${size || 24}" style="width:${size || 24}px;height:${size || 24}px" alt="${esc(K[k].name)} crest">`; const key = k + ':' + (size || 26); if (!crestCache[key]) crestCache[key] = HB.crestURL(K[k], size || 26); return `<img src="${crestCache[key]}" alt="">`; };
  let screen = 'title';
  function show(id) {
    const changed = screen !== id;
    for (const s of document.querySelectorAll('.screen')) { s.classList.toggle('on', s.id === id); if (s.id === id && changed) { s.classList.remove('enter'); void s.offsetWidth; s.classList.add('enter'); } }
    screen = id; closeSheet();
    if (changed) { clearToast(); hideCard(); const f = $('fader'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
    if (id === 'map') MV.resize(); if (id === 'battle') R.resize(); if (id === 'title') layoutKeyArt();
    if (HB.Audio) { if (id === 'map') HB.Audio.startMusic(); else HB.Audio.stopMusic(); }
  }
  // toasts expire on their own, and a new screen clears a stale one
  let toastT = 0;
  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), Math.min(ms || 2200, 4500)); }
  function clearToast() { clearTimeout(toastT); $('toast').classList.remove('on'); }
  // ---------- first-time tips (non-blocking, skippable) and notice cards ----------
  const LSK = (k) => 'tb.tip.' + k;
  const seenTip = (k) => { try { return localStorage.getItem('tb.tips.off') === '1' || localStorage.getItem(LSK(k)) === '1'; } catch (e) { return false; } };
  const markTip = (k) => { try { localStorage.setItem(LSK(k), '1'); } catch (e) { /* private mode */ } };
  let tutQ = [], tutKey = '';
  function tutorial(key, hints) { if (seenTip(key)) return; tutKey = key; tutQ = hints.slice(); nextHint(); }
  function nextHint() {
    const t = $('tut'); if (!tutQ.length) { t.classList.remove('on', 'card'); if (tutKey) markTip(tutKey); tutKey = ''; return; }
    const total = t.dataset.total = tutQ.total || tutQ.length; tutQ.total = total; const h = tutQ.shift();
    $('tutN').textContent = total > 1 ? 'Tip ' + (total - tutQ.length) + ' of ' + total : 'First time'; $('tutT').innerHTML = h; $('tutSkip').style.display = total > 1 ? '' : 'none'; $('tutNext').textContent = tutQ.length ? 'Next' : 'Got it';
    t.classList.remove('card'); t.classList.add('on'); sfx('page');
  }
  function once(key, html) { if (seenTip(key) || $('tut').classList.contains('on')) return; tutKey = key; tutQ = [html]; nextHint(); }
  $('tutNext').onclick = () => { sfx('select'); nextHint(); };
  $('tutSkip').onclick = () => { try { localStorage.setItem('tb.tips.off', '1'); } catch (e) { /* private mode */ } tutQ = []; nextHint(); toast('Tips off — How to play has them all'); };
  function showCard(html, ms) { const t = $('tut'); tutQ = []; tutKey = ''; $('tutN').textContent = ''; $('tutT').innerHTML = html; $('tutSkip').style.display = 'none'; $('tutNext').textContent = 'OK'; t.classList.add('on', 'card'); clearTimeout(showCard.t); showCard.t = setTimeout(() => { if (t.classList.contains('card')) t.classList.remove('on', 'card'); }, ms || 7000); }
  function hideCard() { const t = $('tut'); if (t.classList.contains('card')) t.classList.remove('on', 'card'); }
  const N = () => HB.names();
  const oathArt = () => HB.ART && HB.ART.unit && HB.ART.unit.oathbound;
  function oathCard(small) { const a = oathArt(); if (!a) return ''; return `<div class="ucard${small ? ' sm' : ''}"><img src="${a.card}" alt="${esc(N().recruits)}"><div><b>${esc(N().recruits)}</b><span>${esc(N().tribute)} recruits raised as Horde regulars: crimson lamellar, dragon shields, sabres. Steady (morale 95%), cheap to keep.</span></div></div>`; }
  // ---------- victory / defeat flourish ----------
  function flourish(t, sub, good) { const f = $('flourish'); $('flT').textContent = t; $('flS').textContent = sub || ''; f.classList.remove('on', 'good', 'bad'); void f.offsetWidth; f.classList.add('on', good ? 'good' : 'bad'); clearTimeout(flourish.t); flourish.t = setTimeout(() => f.classList.remove('on'), 2600); }
  // ---------- modal scroll ----------
  function modal(html, handlers, opts) {
    const box = $('modalBody'); box.innerHTML = (opts && opts.noClose ? '' : '<button class="close" data-a="close">✕</button>') + html;
    $('modal').classList.add('on');
    box.onclick = (e) => { const el = e.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a; sfx('select'); if (a === 'close') return closeModal(); if (handlers && handlers[a]) handlers[a](el); };
    return box;
  }
  function closeModal() { $('modal').classList.remove('on'); $('modalBody').innerHTML = ''; }
  function sheet(html, handlers, opts) {
    const s = $('sheet'); s.innerHTML = '<button class="x" data-a="close" aria-label="Close">✕</button>' + html; s.classList.add('on'); s.classList.toggle('strip', !!(opts && opts.strip)); document.body.classList.toggle('hasStrip', !!(opts && opts.strip)); document.body.classList.toggle('stripOpen', !!(opts && opts.strip && CP.stripOpen)); s.classList.toggle('open', !!(opts && opts.strip && CP.stripOpen));
    s.onclick = (e) => { const el = e.target.closest('[data-a]'); if (!el) return; sfx('select'); if (el.dataset.a === 'close') return closeSheet(); if (handlers && handlers[el.dataset.a]) handlers[el.dataset.a](el); };
  }
  function closeSheet() { const s = $('sheet'); s.classList.remove('on', 'strip', 'open'); s.innerHTML = ''; document.body.classList.remove('hasStrip', 'stripOpen'); if (MV) { MV.sel = null; MV.hl = []; } }
  function cover(html, onGo) { const c = $('cover'); c.innerHTML = html + '<button class="btn big gold" style="max-width:300px" id="coverGo">Continue</button>'; c.classList.add('on'); $('coverGo').onclick = () => { c.classList.remove('on'); onGo && onGo(); }; }

  // ---------- canvases ----------
  const R = new HB.Renderer($('cv'));
  const MV = new HB.MapView($('mapcv'));
  G.addEventListener('resize', () => { if (screen === 'battle') R.resize(); if (screen === 'map') MV.resize(); });

  // =====================================================================
  //  BATTLE
  // =====================================================================
  const BR = { b: null, m: null, ctl: [], me: 0, spectate: false, speed: 1, acc: 0, sel: null, armed: false, onEnd: null, lock: null, endT: 0, hudT: 0, drag: null, turn: 0, tipT: 0, seen: {} };
  function battleColors(m, ctl, spectate) {
    if (m.sides.length === 2) {
      if (ctl.length === 1) return ctl[0] === 0 ? [BLUE, RED] : [RED, BLUE];
      const a = m.sides[0].color, b = m.sides[1].color;
      return a && b && a !== b && !spectate ? [a, b] : [BLUE, RED];
    }
    return m.sides.map((s, i) => s.color || HB.SIDE_COLORS[i]);
  }
  function startBattle(m, o) {
    o = o || {};
    const ctl = o.ctl || [];
    m.sides.forEach((s, i) => { if (ctl.includes(i)) s.cmd = 'human'; });
    const b = o.watch ? HB.battleFor(m, { cmds: o.watch }) : HB.battleFor(m, o.lock ? { net: true } : null);
    Object.assign(BR, { b, m, ctl, me: ctl.length ? ctl[0] : 0, spectate: !ctl.length, speed: 1, acc: 0, sel: null, armed: false, onEnd: o.onEnd || null, lock: o.lock || null, endT: 0, hudT: 0, drag: null, turn: o.turn || 0, tipT: 0, seen: {}, watch: !!o.watch, title: m.title,
      deploy: !!ctl.length && !o.lock && !o.watch, introT: 3.2 }); // deploy: sim frozen until Start; introT: clock held while the banner shows
    if (o.lock) o.lock.attach(b, () => HB.battleFor(m, { net: true }));
    R.setBattle(b, battleColors(m, ctl, !ctl.length), BR.me); R.sel = null; R.ringOpen = false;
    if (ctl.length && R.frameOn) R.frameOn(BR.me, true);
    $('bTitle').textContent = m.title || (m.siege ? 'Siege of ' + m.siege.name : HB.FACTION[m.sides[0].faction].name + ' vs ' + HB.FACTION[m.sides[1].faction].name);
    $('bCurse').style.display = ctl.length ? '' : 'none';
    $('bAuto').style.display = ctl.length ? '' : 'none';
    $('bSpeed').style.display = o.lock ? 'none' : '';
    $('bSpeed').textContent = '1×'; $('bAuto').classList.remove('armed'); $('bCurse').classList.remove('armed');
    $('dipl').classList.remove('on');
    show('battle');
    const intro = m.siege ? (m.siege.def === BR.me && ctl.length ? 'Hold the walls. Man the towers, plug the breaches, sally against their engines.' : 'Batter the gate with the ram, roll the tower to a wall, let the trebuchet open a breach — then take the keep.')
      : 'Tap a regiment, drag it to move, tap an enemy to attack. Pike beats horse, horse beats bow, bow beats slow foot.';
    $('bStart').style.display = BR.deploy ? '' : 'none';
    if (BR.deploy) { banner('Deploy — ' + (m.title || 'Battle'), 'Drag regiments inside the gold zone, swipe to face, tap twice for formations. Press Start when ready.', 4.5); tip(intro); }
    else { banner(m.title || 'Battle', ctl.length ? intro : 'Spectating — ' + m.sides.map(s => s.name).join(' vs '), 3.2); tip(ctl.length ? 'Tap a regiment twice (or hold it) for its formation ring. Swipe on open ground to turn it.' : 'Pinch to zoom. The camera follows the fighting.'); }
    sfx('horn'); sfx('charge');
    if (ctl.length) tutorial('battle', [
      '<b>Deploy.</b> Drag your blocks inside the gold zone. Tap a block twice for its formation ring, then press <b>Start</b>.',
      '<b>Counters.</b> Pikes stop horse — a braced pike line lowers its spears and a charge breaks on it. Horse rides down archers. Archers punish slow heavy foot.',
      '<b>Flanks and rear.</b> Hitting a block from the side or behind flashes FLANKED / REAR CHARGE: big damage and a morale shock. Rout spreads to neighbours.',
      '<b>Curse meter (☾).</b> Kills and charges fill your faith. At ' + HB.CURSE.cost + ' faith, tap Curse, then an enemy block to weaken it. Units with a mythic gift (like Rome\'s Blessing of Mars) spend faith too.']);
  }
  let bannerT = 0;
  function banner(t, s, sec) { const el = $('banner'); el.querySelector('.bt').textContent = t; el.querySelector('.bs').textContent = s || ''; el.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('on'), (sec || 2.4) * 1000); }
  function tip(s) { const el = $('tip'); el.textContent = s; el.style.opacity = 1; BR.tipT = 6; }
  function tipFor(r) {
    const t = r.type, c = r.def.cls;
    if (t === 'ram') return 'Battering ram: drive it to a gate. Missiles barely scratch it, melee kills it.';
    if (t === 'stower') return 'Siege tower: roll it against a wall — your infantry climb over it.';
    if (c === 'sie') return 'Siege engine: tap a wall segment to batter it, or an enemy to shoot it.';
    if (c === 'ele') return 'War elephants smash lines. Keep javelins off them: panicked elephants trample your own side.';
    if (t === 'pike' || t === 'hoplite' || t === 'spear') return 'Spears: brace (Phalanx / Square) and cavalry breaks on you. Slow to turn — guard the flanks.';
    if (c === 'cav') return 'Cavalry: hit flanks and the rear, ride down archers. Never charge braced pikes head-on.';
    if (c === 'msl') return 'Missiles: shoot from behind your line. Cavalry is their death. Shield walls shrug arrows off.';
    return 'Heavy foot wins the line fight but is slow; archers bleed it on the way in. Shield wall / testudo vs arrows.';
  }
  // ----- deployment: the sim is frozen; moves teleport inside the side's zone, formations apply directly -----
  function dzone(s) { return BR.b.zones[s]; }
  function deployTo(r, x, y) { const z = dzone(r.side), mx = Math.min(r.W, r.D) / 2; r.x = Math.max(z.x0 + mx, Math.min(z.x1 - mx, x)); r.y = Math.max(z.y0 + mx, Math.min(z.y1 - mx, y)); }
  function deployForm(r, m) { if (!r.def.forms.includes(m)) return; r.form = m; HB.geom(r); deployTo(r, r.x, r.y); }
  function startFight() {
    if (!BR.deploy) return; BR.deploy = false; $('bStart').style.display = 'none';
    const m = BR.m, old = BR.b;
    for (const s of BR.ctl) { const army = m.sides[s].army; for (const r of old.regs) if (r.side === s && r.ei != null && army[r.ei] && !r.relief) army[r.ei] = Object.assign({}, army[r.ei], { x: Math.round(r.x), y: Math.round(r.y), f: Math.round(r.f * 1000) / 1000, m: r.form }); }
    const cam = Object.assign({}, R.cam), sel = BR.sel;
    const b = HB.battleFor(m); BR.b = b; R.setBattle(b, R.colors, BR.me); Object.assign(R.cam, cam); R.camT && Object.assign(R.camT, cam); R.userCam = 2; R.sel = BR.sel = sel; R.ringOpen = false;
    BR.introT = 0; BR.acc = 0; $('banner').classList.remove('on'); sfx('horn'); toast('Advance!');
  }
  $('bStart').onclick = startFight;
  function issue(c) { if (BR.watch || BR.b.over) return; if (BR.lock) BR.lock.send(c); else BR.b.command(c); }
  function mine(r) { return r && r.st === 0 && BR.ctl.includes(r.side); }
  function hostileTo(r) { return r && r.st !== 2 && BR.ctl.length && BR.b.hostile(BR.me, r.side) && r.side !== BR.me; }
  function selectReg(r) { BR.sel = r ? r.id : null; R.sel = BR.sel; if (r) { sfx('select'); if (r.side !== BR.me && BR.ctl.includes(r.side)) BR.me = r.side; if (!BR.seen[r.type]) { BR.seen[r.type] = 1; tip(tipFor(r)); } } }
  const deg = (a) => Math.round(a * 180 / Math.PI);
  // pointer handling: tap select / drag move / swipe facing / tap enemy attack / tap ring formation / pinch zoom
  (function battleInput() {
    const cv = $('cv'), pts = new Map(); let g = null, pinch = null, lpT = 0;
    const xy = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => {
      HB.Audio && HB.Audio.unlock(); cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
      const p = xy(e); pts.set(e.pointerId, p);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: R.cam.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, cam: { x: R.cam.x, y: R.cam.y } }; g = null; BR.drag = null; return; }
      const w = R.toWorld(p.x, p.y);
      const on = R.pick(w.x, w.y);
      g = { x0: p.x, y0: p.y, t0: performance.now(), x: p.x, y: p.y, on: on && mine(on) ? on : null, moved: false, cam: { x: R.cam.x, y: R.cam.y } };
      clearTimeout(lpT); if (g.on && !BR.watch) { const G1 = g; lpT = setTimeout(() => { if (g === G1 && !G1.moved) { G1.long = true; selectReg(G1.on); R.ringOpen = true; sfx('select'); } }, 450); } // long-press opens the formation ring
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; const p = xy(e); pts.set(e.pointerId, p);
      if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); R.cam.z = Math.max(R.fitZ() * 0.8, Math.min(4, pinch.z * d / Math.max(10, pinch.d))); const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; R.cam.x = pinch.cam.x - (cx - pinch.cx) / R.cam.z; R.cam.y = pinch.cam.y - (cy - pinch.cy) / R.cam.z; R.clampCam(); R.userCam = 5; return; }
      if (!g) return; g.x = p.x; g.y = p.y;
      if (!g.moved && Math.hypot(p.x - g.x0, p.y - g.y0) > 12) g.moved = true;
      if (!g.moved) return;
      if (g.on && !BR.watch) { BR.drag = { id: g.on.id, x: p.x, y: p.y }; return; }
      if (performance.now() - g.t0 > 260 || !BR.sel) { R.cam.x = g.cam.x - (p.x - g.x0) / R.cam.z; R.cam.y = g.cam.y - (p.y - g.y0) / R.cam.z; R.clampCam(); R.userCam = 5; g.pan = true; }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pinch) { if (pts.size < 2) pinch = null; g = null; return; }
      if (!g || !BR.b) return; const G0 = g; g = null; BR.drag = null;
      const b = BR.b, dt = performance.now() - G0.t0;
      if (G0.moved && G0.on && BR.deploy) { const w = R.toWorld(G0.x, G0.y); deployTo(G0.on, w.x, w.y); selectReg(G0.on); sfx('order'); return; }
      if (G0.moved && G0.on) { // drag a regiment: move to the drop point, face along the drag
        const w = R.toWorld(G0.x, G0.y), r = G0.on; const f = Math.atan2(w.y - r.y, w.x - r.x);
        const t = R.pick(w.x, w.y, (x) => hostileTo(x));
        selectReg(r);
        if (t) { issue({ c: 'at', s: r.id, t: t.id }); sfx('order'); return; }
        issue({ c: 'mv', s: r.id, x: Math.max(5, Math.min(W.W - 5, w.x)), y: Math.max(5, Math.min(W.H - 5, w.y)), f: deg(f) }); sfx('order'); return;
      }
      if (G0.moved && !G0.pan && BR.sel != null && dt < 420) { // quick swipe: turn the selected regiment to face the swipe
        const r = b.regs[BR.sel]; if (mine(r) && BR.deploy) { r.f = Math.atan2(G0.y - G0.y0, G0.x - G0.x0); sfx('order'); return; } if (mine(r)) { issue({ c: 'mv', s: r.id, x: r.x, y: r.y, f: deg(Math.atan2(G0.y - G0.y0, G0.x - G0.x0)) }); sfx('order'); tip('Facing set. Flanks and rear take double shock — keep your front to the enemy.'); }
        return;
      }
      if (G0.moved || G0.long) return;
      tap(G0.x, G0.y);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); g = null; pinch = null; BR.drag = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); R.cam.z = Math.max(R.fitZ() * 0.8, Math.min(4, R.cam.z * (e.deltaY < 0 ? 1.12 : 0.89))); R.clampCam(); R.userCam = 5; }, { passive: false });
  })();
  function tap(sx, sy) {
    const b = BR.b; if (!b || BR.watch) return;
    const ro = R.hitRing(sx, sy);
    if (ro && BR.sel != null && R.ringOpen) { const r = b.regs[BR.sel]; R.ringOpen = false; if (mine(r) && BR.deploy) { if (ro.k === 'fm') { deployForm(r, ro.m); tip(HB.FORMS[ro.m].name + ': ' + HB.FORMS[ro.m].tip); sfx('order'); } else toast('Abilities can be used once the battle starts'); return; } if (mine(r)) { if (ro.k === 'fm') { issue({ c: 'fm', s: r.id, m: ro.m }); tip(HB.FORMS[ro.m].name + ': ' + HB.FORMS[ro.m].tip); } else { issue({ c: 'ab', s: r.id }); const L = HB.LORE[r.lore]; L && tip(L.name + ' — ' + L.desc); } sfx('order'); } return; }
    const w = R.toWorld(sx, sy), hit = R.pick(w.x, w.y);
    if (BR.armed) { // curse targeting
      if (hit && hostileTo(hit)) { issue({ c: 'cu', a: BR.me, t: hit.id }); sfx('ability'); }
      else toast('Tap an enemy regiment to curse it');
      BR.armed = false; $('bCurse').classList.remove('armed'); return;
    }
    if (hit && mine(hit)) {
      if (BR.sel === hit.id) { R.ringOpen = !R.ringOpen; if (R.ringOpen) sfx('select'); } // second tap opens the formation ring
      else { R.ringOpen = false; selectReg(hit); }
      return;
    }
    R.ringOpen = false;
    const sel = BR.sel != null ? b.regs[BR.sel] : null;
    if (BR.deploy) { if (mine(sel) && !hit) { deployTo(sel, w.x, w.y); sfx('order'); } else if (hit) toast(hit.name + ' — ' + Math.round(hit.n) + ' men'); return; }
    if (!mine(sel)) { selectReg(hit && hit.side !== BR.me ? null : null); if (hit) toast(hit.name + ' — ' + Math.round(hit.n) + ' men' + (hit.st === 1 ? ' (routing)' : '')); return; }
    if (hit && hostileTo(hit)) { issue({ c: 'at', s: sel.id, t: hit.id }); sfx('order'); return; }
    if (b.S && sel.def.wall) { const sg = R.pickWall(w.x, w.y); if (sg) { issue({ c: 'wl', s: sel.id, w: sg.id }); sfx('order'); tip('Engine ordered to pound that wall.'); return; } }
    issue({ c: 'mv', s: sel.id, x: Math.max(5, Math.min(W.W - 5, w.x)), y: Math.max(5, Math.min(W.H - 5, w.y)), f: -999 }); sfx('order');
  }
  $('bCurse').onclick = () => { if (!BR.b) return; const f = BR.b.fac[BR.me]; if (f.faith < HB.CURSE.cost) return toast('Curse needs ' + HB.CURSE.cost + ' faith (you have ' + Math.floor(f.faith) + ')'); BR.armed = !BR.armed; $('bCurse').classList.toggle('armed', BR.armed); if (BR.armed) tip(HB.CURSE.desc); };
  $('bAuto').onclick = () => { if (!BR.b) return; const on = !BR.b.fac[BR.me].auto; for (const s of BR.ctl) issue({ c: 'au', a: s, on: on ? 1 : 0 }); $('bAuto').classList.toggle('armed', on); toast(on ? 'Your generals take command' : 'You have command'); };
  $('bSpeed').onclick = () => { BR.speed = BR.speed === 1 ? 2 : BR.speed === 2 ? 4 : 1; $('bSpeed').textContent = BR.speed + '×'; };
  $('bExit').onclick = () => {
    if (!BR.b) return;
    if (BR.b.over) return endBattle();
    const camp = !!BR.onEnd;
    modal(`<h2>Leave the field?</h2><p class="muted">${camp ? 'Your generals will fight the rest of this battle for you.' : 'The battle will be abandoned.'}</p>
      ${camp && !BR.lock ? '<button class="btn gold" data-a="auto">Let the generals finish</button>' : ''}<button class="btn" data-a="stay">Keep fighting</button>${camp ? '' : '<button class="btn red" data-a="quit">Quit to title</button>'}`,
      { stay: closeModal, quit: () => { closeModal(); quitBattle(); }, auto: () => { closeModal(); const b = BR.b; for (const f of b.fac) f.auto = true; let n = 0; while (!b.over && n++ < 20 * 900) b.step(); b.fx.length = 0; } });
  };
  function quitBattle() { if (BR.lock) BR.lock.close(); BR.b = null; BR.lock = null; R.b = null; goTitle(); }
  function sideMorale(b, s) { let a = 0, n0 = 0; for (const r of b.regs) { if (r.side !== s || r.def.cls === 'mon' || r.relief && r.st === 0 && false) continue; n0 += r.n0; if (r.st === 0) a += r.n * Math.min(1, Math.max(0, r.morale) / 100); } return n0 ? a / n0 : 0; }
  function battleHud() {
    const b = BR.b, m = BR.m; const cols = R.colors;
    let h = '';
    if (b.S) { const wi = b.wallIntegrity(); h += `<div class="mrow"><span style="width:58px">Walls</span><div class="bar"><b style="width:${Math.round(wi * 100)}%;background:linear-gradient(#cfc6b4,#8a8174)"></b></div></div>`; }
    const order = b.nF === 2 && BR.ctl.length === 1 ? [BR.me, 1 - BR.me] : [...Array(b.nF).keys()];
    for (const s of order) { const v = sideMorale(b, s); const nm = b.nF === 2 && BR.ctl.length === 1 ? (s === BR.me ? 'Morale' : 'Enemy') : b.fac[s].name; h += `<div class="mrow"><span style="width:58px;overflow:hidden;white-space:nowrap">${esc(nm)}</span><div class="bar"><b style="width:${Math.round(v * 100)}%;background:${cols[s]}"></b></div></div>`; }
    $('morPanel').innerHTML = h;
    if (BR.turn && b.S) { $('bTurnLbl').textContent = 'Turn'; $('timer').textContent = BR.turn; }
    else { const left = Math.max(0, b.tmax - b.t); $('bTurnLbl').textContent = 'Timer'; $('timer').textContent = Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0'); }
    if (BR.ctl.length) { const f = b.fac[BR.me]; $('faith').textContent = Math.floor(f.faith) + '/' + HB.CURSE.cost; $('bCurse').disabled = f.faith < HB.CURSE.cost; if (f.faith >= HB.CURSE.cost && !b.over) once('curse', '<b>The Curse is ready.</b> The ☾ meter counts your army\'s <b>faith</b> (it builds up as the battle rages). Tap <b>Curse</b>, then an enemy block: −30% attack and shaken morale for a while. Oathbreakers pay double.'); }
    // pending alliance offer to me (FFA)
    const d = $('dipl');
    if (BR.ctl.length && b.fac[BR.me].pending && !BR.lock) {
      const p = b.fac[BR.me].pending; if (!d.classList.contains('on')) { d.innerHTML = `<b>${esc(b.fac[p.from].name)}</b> offers an alliance<br><button class="btn sm gold" data-a="ac">Accept</button><button class="btn sm" data-a="dc">Decline</button>`; d.classList.add('on'); d.onclick = (e) => { const a = e.target.dataset.a; if (!a) return; issue({ c: a, a: BR.me, b: p.from }); d.classList.remove('on'); }; }
    } else if (d.classList.contains('on') && !(b.fac[BR.me] && b.fac[BR.me].pending)) d.classList.remove('on');
  }
  function onFx(e) {
    R.event(e);
    const b = BR.b;
    switch (e.k) {
      case 'volley': if (!e.wall || Math.random() < 0.3) sfx('shot', e.kind); break;
      case 'impact': if (e.braced) sfx('braced'); else if (e.zone) { sfx('impact', e.zone); if (e.zone === 2) sfx('horn'); } else if (e.cav) { sfx('charge'); sfx('impact', 0); } else sfx('clash'); break;
      case 'ram': sfx('thud'); break;
      case 'breach': sfx('rubble'); sfx('event', 'breach'); break;
      case 'ability': sfx('ability'); if (BR.ctl.includes(e.side) && e.lore === 'mars') once('mars', '<b>Blessing of Mars</b> — your Legionaries spent faith: +40% attack, full cohesion and +25 morale for 9 seconds. Use it when a grinding melee is about to turn. Enemies answer by hitting the blessed block in the flank.'); break;
      case 'callout': if (e.big) sfx('callout'); break;
      case 'curse': sfx('event', 'curse'); break;
      case 'deny': if (BR.ctl.includes(e.side)) { toast(e.msg); sfx('deny'); } break;
      case 'event': banner(e.text, e.sub, e.big ? 3.4 : 2.6); sfx('event', e.id); break;
      case 'betrayed': banner('BETRAYAL', e.text, 3); sfx('event', 'betrayal'); break;
      case 'diplo': if (e.type !== 'offer' || !BR.ctl.includes(e.b)) toast(e.text || ''); break;
      case 'rout': sfx('rout'); if (BR.ctl.includes(e.side) && Math.random() < 0.5) tip('A regiment is routing! Rally comes if no enemy is near — or pull it back.'); break;
      case 'over': break;
    }
    if (e.k === 'impact' && e.zone === 2 && b) BR.slow = 1.1;
    if (R.slowReq > 0) { BR.slow = Math.max(BR.slow || 0, R.slowReq); R.slowReq = 0; } // flank hits, breaches and routs ask the renderer for a beat of slow motion
  }
  function battleFrame(dt) {
    const b = BR.b; if (!b) return;
    let rate = BR.speed; if (BR.slow > 0) { BR.slow -= dt; rate *= 0.3; }
    if (BR.introT > 0 && !BR.deploy) BR.introT -= dt;
    const hold = BR.deploy || BR.introT > 0; // nothing moves and the clock is still while deploying or while the intro banner shows
    if (hold && !b.over) { /* frozen */ }
    else if (BR.lock) { BR.lock.pump(dt); const wt = BR.lock.host ? BR.lock.waiting : !BR.lock.ready; if (wt && !b.over) { BR.waitT = (BR.waitT || 0) + dt; if (BR.waitT > 1.5) { $('tip').textContent = 'Waiting for the other commander…'; $('tip').style.opacity = 1; BR.tipT = 0.5; } } else BR.waitT = 0; }
    else if (!b.over) { BR.acc += dt * rate; let n = 0; while (BR.acc >= W.DT && n++ < 10 && !b.over) { b.step(); BR.acc -= W.DT; } if (n >= 10) BR.acc = 0; }
    if (b.fx.length) { for (const e of b.fx) onFx(e); b.fx.length = 0; }
    R.autoCam(dt, BR.spectate);
    R.draw(dt, { spectate: BR.spectate || BR.watch, ctl: BR.ctl });
    if (BR.deploy) { // the deployment zone
      const z = dzone(BR.me), g = R.g, a0 = R.toScreen(z.x0, z.y0), a1 = R.toScreen(z.x1, z.y1);
      g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); g.fillStyle = 'rgba(245,207,90,0.08)'; g.strokeStyle = '#f5cf5a'; g.lineWidth = 2; g.setLineDash([10, 6]);
      const x = Math.min(a0.x, a1.x), y = Math.min(a0.y, a1.y), w = Math.abs(a1.x - a0.x), h = Math.abs(a1.y - a0.y); g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); g.setLineDash([]);
    }
    if (BR.drag) { // drag preview: gold dashed arrow
      const r = b.regs[BR.drag.id], g = R.g, p = R.toScreen(r.x, r.y);
      g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); g.strokeStyle = '#f5cf5a'; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(BR.drag.x, BR.drag.y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(BR.drag.x, BR.drag.y, 10, 0, Math.PI * 2); g.stroke();
    }
    BR.hudT -= dt; if (BR.hudT <= 0) { BR.hudT = 0.25; battleHud(); }
    if (BR.tipT > 0) { BR.tipT -= dt; if (BR.tipT <= 0) $('tip').style.opacity = 0; }
    if (b.over) { BR.endT += dt; if (BR.endT > 1.4 && !BR.flo) { BR.flo = true; const s = b.summary(), won = BR.ctl.length && s.winners.some(w => BR.ctl.includes(w)); flourish(BR.ctl.length === 1 ? (won ? 'Victory' : 'Defeat') : (s.winner >= 0 ? b.fac[s.winner].name : 'No one') + ' wins', b.siegeResult === 'keep' ? 'The keep has fallen' : b.siegeResult === 'held' ? 'The walls held' : '', !BR.ctl.length || won); }
      if (BR.endT > 2.3 && !BR.ended) { BR.ended = true; endBattle(); } } else { BR.ended = false; BR.flo = false; }
  }
  function endBattle() {
    const b = BR.b, m = BR.m; if (!b) return; $('flourish').classList.remove('on');
    const s = b.summary(); const won = BR.ctl.length && s.winners.some(w => BR.ctl.includes(w));
    if (BR.ctl.length) sfx(won ? 'win' : 'lose');
    const wname = s.winner >= 0 ? b.fac[s.winner].name : 'No one';
    const head = BR.ctl.length === 1 ? (won ? 'Victory' : 'Defeat') : wname + ' wins';
    const sub = b.siegeResult === 'keep' ? 'The keep has fallen.' : b.siegeResult === 'held' ? 'The walls held.' : s.alliedWin ? 'An allied victory.' : s.timeout ? 'Time ran out: the field goes to the side left standing strongest.' : 'The enemy army is broken.';
    const watch = location.origin + location.pathname + '#watch=' + HB.encodeWatch(m, b.log);
    const rows = s.sides.map((x, i) => `<div class="item"><span style="width:12px;height:12px;border-radius:2px;background:${R.colors[i]}"></span><span class="grow">${esc(x.name)}${x.oath ? ' <small>(oathbreaker)</small>' : ''}</span><span>⚔ ${x.kills}</span><span class="muted">lost ${x.lost}</span></div>`).join('');
    const myCode = BR.ctl.length ? HB.armyCode(m.sides[BR.me].faction, m.sides[BR.me].picks) : '';
    const done = () => { closeModal(); const cb = BR.onEnd; const lock = BR.lock; BR.b = null; BR.lock = null; R.b = null; if (cb) cb(b, m); else { if (lock) lock.close(); goTitle(); } };
    BR.lastWatch = watch;
    modal(`<h4>${esc(m.title || 'Battle')}</h4><h2>${esc(head)}</h2><div class="muted">${esc(sub)} ${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}</div>
      <div class="list">${rows}</div>${s.mvp ? `<div class="muted">Hero of the day: ${esc(s.mvp.name)} (${esc(b.fac[s.mvp.side].name)}) — ${s.mvp.kills} kills</div>` : ''}
      <div class="muted" style="margin-top:6px">Rear charges ${s.stats.rearCharges} · flank hits ${s.stats.flankHits} · routs ${s.stats.routs} · rallies ${s.stats.rallies}</div>
      ${myCode ? `<div class="muted" style="margin-top:6px">Army code: <b id="acode">${esc(myCode)}</b></div>` : ''}
      <div style="margin-top:10px"><button class="btn sm" data-a="copy">Copy replay link</button>${BR.onEnd ? '' : '<button class="btn sm" data-a="again">Rematch</button>'}</div>
      <button class="btn big gold" data-a="done">${BR.onEnd ? 'Return to the map' : 'Continue'}</button>`,
      { done, copy: () => { copyText(watch); toast('Replay link copied'); }, again: () => { closeModal(); const mm = JSON.parse(JSON.stringify(m)); mm.seed = (m.seed * 7 + 13) >>> 0; startBattle(mm, { ctl: BR.ctl.slice() }); } }, { noClose: true });
  }
  function copyText(t) { try { navigator.clipboard.writeText(t); } catch (e) { /* clipboard unavailable */ } }

  // =====================================================================
  //  TITLE AND MENUS
  // =====================================================================
  const rndInt = (n) => Math.floor(Math.random() * n);
  const TERRAINS = ['open', 'river', 'hills', 'woods'];
  function goTitle() { closeModal(); $('cover').classList.remove('on'); if (CP.timer) { clearInterval(CP.timer); CP.timer = 0; } show('title'); if (location.hash) history.replaceState(null, '', location.pathname); }
  function quickBattle() {
    const F = HB.FACTIONS, a = F[rndInt(F.length)]; let b = F[rndInt(F.length)]; while (b === a) b = F[rndInt(F.length)];
    const m = HB.makeMatch({ seed: (Math.random() * 1e9) >>> 0, budget: 1000, terrain: TERRAINS[rndInt(4)], weather: ['clear', 'clear', 'rain', 'fog', 'wind'][rndInt(5)],
      sides: [{ faction: a.id, cmd: 'human', name: a.name }, { faction: b.id, cmd: Math.random() < 0.5 ? 'remi' : 'gamedev', name: b.name }] });
    m.title = 'Battle of the ' + ['Eastern Hills', 'Black Ford', 'Ashen Field', 'Crossroads', 'Thorn Wood', 'Red River'][rndInt(6)];
    startBattle(m, { ctl: [0] });
  }
  function spectateBattle(kind) {
    const seed = (Math.random() * 1e9) >>> 0, F = HB.FACTIONS;
    const pick = () => F[rndInt(F.length)].id;
    let m;
    if (kind === 'siege') m = HB.makeMatch({ seed, budget: 1000, title: 'Siege of Northgard', siege: { def: 0, rings: 3, name: 'Northgard', relief: { side: 0, t: 100, edge: 'left', picks: [0, 1, 2] } }, sides: [{ faction: 'vikings', cmd: 'remi', name: 'Northgard (Remi)' }, { faction: 'mongols', cmd: 'gamedev', name: 'Crimson Horde (Game Dev)' }] });
    else if (kind === 'ffa') m = HB.makeMatch({ seed, budget: 800, terrain: 'open', sides: [0, 1, 2, 3].map(i => ({ faction: pick(), cmd: i % 2 ? 'gamedev' : 'remi', name: (i % 2 ? 'Game Dev' : 'Remi') + ' ' + HB.SIDE_NAMES[i] })) });
    else m = HB.makeMatch({ seed, budget: 1000, terrain: TERRAINS[rndInt(4)], title: 'Remi vs Game Dev', sides: [{ faction: pick(), cmd: 'remi', name: 'Remi' }, { faction: pick(), cmd: 'gamedev', name: 'Game Dev' }] });
    startBattle(m, {});
  }
  function featured(f) { const m = HB.makeMatch({ seed: (Math.random() * 1e9) >>> 0, budget: 1000, terrain: f.terrain, weather: f.weather, title: f.name, sides: [{ faction: f.sides[0], cmd: 'human' }, { faction: f.sides[1], cmd: 'gamedev' }] }); startBattle(m, { ctl: [0] }); }
  function playMenu() {
    const saved = loadSaved();
    modal(`<h2>Play</h2><div class="muted">The Five Crowns: five kingdoms and the Crimson Horde.</div>
      ${saved ? `<button class="btn big gold" data-a="cont">Continue campaign (turn ${saved.st.turn})</button>` : ''}
      <button class="btn big ${saved ? '' : 'gold'}" data-a="solo">Solo vs AI</button>
      <button class="btn big" data-a="pass">Pass &amp; Play</button>
      <button class="btn big" data-a="online">Online with a friend</button>
      <button class="btn big" data-a="spec">Spectate</button>`,
      { cont: () => { closeModal(); resumeCampaign(saved); }, solo: () => seatPicker(false), pass: () => passMenu(), online: () => onlineMenu(), spec: () => spectateMenu() });
  }
  const rulerOf = (i) => K[i].ruler || K[i].name;
  function seatButtons(sel, taken) { return K.map((k, i) => `<button class="seatb ${sel.includes(i) ? 'on' : ''}" data-a="seat" data-i="${i}" ${taken && taken.includes(i) ? 'disabled style="opacity:.4"' : ''}>${crest(i, 26)}<span>${esc(k.name)}<small>${i === HB.INV ? 'The Invader · Mongol horde' : HB.FACTION[k.culture].name + ' · ' + esc(k.motto)}</small></span></button>`).join(''); }
  function seatPicker(multi, onPick) {
    let sel = multi ? [0, 5] : [0];
    const draw = () => modal(`<h2>${multi ? 'Who is at the table?' : 'Choose your crown'}</h2><div class="muted">${multi ? 'Tap the seats played on this device (2–6). The rest are AI.' : 'A kingdom must survive the Horde — or lead it.'}</div>
      <div class="seats">${seatButtons(sel)}</div><button class="btn big gold" data-a="go">${multi ? 'Begin (' + sel.length + ' players)' : 'Begin the campaign'}</button>`,
      { seat: (el) => { const i = +el.dataset.i; if (multi) { sel = sel.includes(i) ? sel.filter(x => x !== i) : sel.concat(i); } else sel = [i]; draw(); },
        go: () => { if (multi && sel.length < 2) return toast('Pick at least two seats'); closeModal(); if (onPick) onPick(sel); else startCampaign({ humans: sel.sort((a, b) => a - b) }); } });
    draw();
  }
  function passMenu() {
    modal(`<h2>Pass &amp; Play</h2><div class="muted">One device, turns passed hand to hand.</div>
      <button class="btn big gold" data-a="camp">Campaign (2–6 players)</button><button class="btn big" data-a="duel">Battle duel (2 players)</button>`,
      { camp: () => seatPicker(true), duel: () => { closeModal(); const F = HB.FACTIONS; const a = F[rndInt(F.length)], b = F[rndInt(F.length)]; const m = HB.makeMatch({ seed: (Math.random() * 1e9) >>> 0, budget: 1000, terrain: TERRAINS[rndInt(4)], title: 'The Duel', sides: [{ faction: a.id, cmd: 'human', name: 'Player 1 · ' + a.name }, { faction: b.id, cmd: 'human', name: 'Player 2 · ' + b.name }] }); startBattle(m, { ctl: [0, 1] }); toast('Both armies are yours to command — share the screen'); } });
  }
  function spectateMenu() {
    modal(`<h2>Spectate</h2><div class="muted">Remi swarms. Game Dev flanks, feints and betrays.</div>
      <button class="btn big gold" data-a="field">Remi vs Game Dev — field battle</button><button class="btn big" data-a="siege">Siege of Northgard</button><button class="btn big" data-a="ffa">Four-way brawl (alliances & betrayal)</button><button class="btn big" data-a="camp">Watch the campaign</button>
      <h4>Famous battles (you command)</h4><div class="list">${HB.FEATURED.map((f, i) => `<button class="item" data-a="feat" data-i="${i}" style="border:0;font-family:inherit;text-align:left"><span class="grow"><b>${esc(f.name)}</b><br><span class="muted">${esc(f.sub)} — ${esc(f.blurb)}</span></span></button>`).join('')}</div>`,
      { field: () => { closeModal(); spectateBattle('field'); }, siege: () => { closeModal(); spectateBattle('siege'); }, ffa: () => { closeModal(); spectateBattle('ffa'); }, camp: () => { closeModal(); startCampaign({ humans: [], spectate: true }); }, feat: (el) => { closeModal(); featured(HB.FEATURED[+el.dataset.i]); } });
  }
  function customMenu() {
    const st = { a: 'rome', b: 'carthage', cmd: 'gamedev', budget: 1000, field: 'open', code: '' };
    const draw = () => modal(`<h2>Custom battle</h2>
      <h4>Your army</h4><div class="chips">${HB.FACTIONS.map(f => `<button class="chip ${st.a === f.id ? 'on' : ''}" data-a="a" data-v="${f.id}">${f.emblem} ${esc(f.name)}</button>`).join('')}</div>
      <div class="muted">${esc(HB.FACTION[st.a].blurb)}</div>
      <h4>Enemy</h4><div class="chips">${HB.FACTIONS.map(f => `<button class="chip ${st.b === f.id ? 'on' : ''}" data-a="b" data-v="${f.id}">${f.emblem} ${esc(f.name)}</button>`).join('')}</div>
      <div class="chips"><button class="chip ${st.cmd === 'remi' ? 'on' : ''}" data-a="cmd" data-v="remi">vs Remi</button><button class="chip ${st.cmd === 'gamedev' ? 'on' : ''}" data-a="cmd" data-v="gamedev">vs Game Dev</button></div>
      <h4>Battlefield</h4><div class="chips">${[['open', 'Open field'], ['river', 'River & fords'], ['hills', 'Hills'], ['woods', 'Forest & village'], ['siegeA', 'Siege: attack'], ['siegeD', 'Siege: defend']].map(([v, n]) => `<button class="chip ${st.field === v ? 'on' : ''}" data-a="field" data-v="${v}">${n}</button>`).join('')}</div>
      <h4>Budget</h4><div class="chips">${HB.BUDGETS.map(v => `<button class="chip ${st.budget === v ? 'on' : ''}" data-a="bud" data-v="${v}">${v}</button>`).join('')}</div>
      <h4>Army code (optional)</h4><input class="input" id="acodeIn" style="width:220px;font-size:14px;letter-spacing:.05em;text-transform:none" placeholder="rome-0013245" value="${esc(st.code)}">
      <button class="btn big gold" data-a="go">To battle</button>`,
      { a: (el) => { st.a = el.dataset.v; keep(); }, b: (el) => { st.b = el.dataset.v; keep(); }, cmd: (el) => { st.cmd = el.dataset.v; keep(); }, field: (el) => { st.field = el.dataset.v; keep(); }, bud: (el) => { st.budget = +el.dataset.v; keep(); },
        go: () => {
          st.code = $('acodeIn').value.trim(); let mine = { faction: st.a, cmd: 'human' };
          if (st.code) { const pc = HB.parseArmyCode(st.code); if (!pc) return toast('That army code is not valid'); mine = { faction: pc.faction, cmd: 'human', picks: pc.picks }; }
          const enemy = { faction: st.b, cmd: st.cmd }; const sg = st.field.startsWith('siege');
          const sides = st.field === 'siegeA' ? [enemy, mine] : [mine, enemy];
          const m = HB.makeMatch({ seed: (Math.random() * 1e9) >>> 0, budget: st.budget, terrain: sg ? '' : st.field, siege: sg ? { def: 0, rings: 3, name: 'the Citadel', relief: null } : null, title: sg ? 'Siege of the Citadel' : '', sides });
          closeModal(); startBattle(m, { ctl: [st.field === 'siegeA' ? 1 : 0] });
        } });
    const keep = () => { const i = $('acodeIn'); if (i) st.code = i.value; draw(); };
    draw();
  }
  function howTo() {
    modal(`<h2>How to play</h2><div style="text-align:left;font-size:13.5px;line-height:1.45">
      <p><b>Tap</b> a regiment to select it · <b>drag</b> it to move (it faces the way you drag) · <b>swipe</b> on open ground to turn it · <b>tap an enemy</b> to attack · tap the selected regiment again (or a gold medallion) to change formation.</p>
      <p><b>Counters:</b> pikes beat cavalry · cavalry beats archers · archers beat slow heavy foot · heavy foot grinds spears down. Shield wall and testudo shrug off arrows but crawl.</p>
      <p><b>Flanks &amp; rear</b> deal extra damage and a morale shock. A cavalry charge into the rear is devastating. Braced spears stop a frontal charge cold. Rout spreads: a fleeing regiment shakes its neighbours.</p>
      <p><b>Terrain:</b> hills give reach and morale, forests hide troops and break cavalry, rivers slow everyone except at fords, villages blunt arrows.</p>
      <p><b>Elephants</b> crush lines but panic under javelins and trample their own side.</p>
      <p><b>Sieges:</b> walls in rings — outer, inner, keep. Rams break gates, towers dock, trebuchets breach, infantry put up ladders. Breach a ring and the fight moves inward. Take the keep to win; defenders win if the walls hold.</p>
      <p><b>Faith &amp; the gods:</b> curse an enemy regiment; after a long, bloody, treacherous war the Gods' Wrath may descend late in a battle — a titan walks the field and forces a truce. Oathbreakers are cursed.</p>
      <p><b>Campaign:</b> move armies along roads, recruit at capitals, send envoys with treaties. A walled capital means a siege. The Horde wins with three crowns; the kingdoms win by taking its camp.</p>
      <p><b>${HB.names().tribute}:</b> a Treaty of Tribute can demand a ${HB.names().tribute} of young recruits. Three turns later they return as <b>${HB.names().recruits}</b> in the army of whoever took them. The Horde demands it often.</p></div>
      <button class="btn gold" data-a="close">To war</button>`);
  }
  function pikesVsCharge() { // Quick Battle preset: a braced phalanx against a lancer charge
    const mac = HB.FACTION.macedon, mon = HB.FACTION.mongols, ph = mac.roster.findIndex(r => r.name === 'Phalangites'), ar = mac.roster.findIndex(r => r.t === 'archer'), ke = mon.roster.findIndex(r => r.name === 'Keshig lancers'), ha = mon.roster.findIndex(r => r.t === 'horsearcher');
    const m = HB.makeMatch({ seed: (Math.random() * 1e9) >>> 0, budget: 1000, terrain: 'open', weather: 'clear', title: 'Pikes vs Charge',
      sides: [{ faction: 'macedon', cmd: 'human', name: 'Macedon phalanx', picks: [ph, ph, ph, ph, ph, ar, ar] }, { faction: 'mongols', cmd: 'remi', name: 'Keshig charge', picks: [ke, ke, ke, ke, ke, ke, ha, ha] }] });
    startBattle(m, { ctl: [0] }); tip('Keep the pikes still and facing the horse: the spears come down and the charge breaks on them — BRACED.');
  }
  function applyConfig() { // every title string lives in HB.CONFIG (js/config.js); art drops in through HB.ART (tools/import_art.py)
    const CF = HB.CONFIG || {};
    for (const [id, v] of [['logoTxt', CF.title], ['ldLogo', CF.title], ['subTxt', CF.subtitle], ['ldSub', CF.subtitle], ['tagTxt', CF.tag]]) if (v && $(id)) $(id).textContent = v;
    if (CF.title) document.title = CF.title + (CF.subtitle ? ' — ' + CF.subtitle : '');
    const c1 = document.querySelector('#map .cartouche .c1'); if (c1 && CF.subtitle) c1.textContent = CF.subtitle;
    keyArt();
    $('crestRow').innerHTML = K.map((k, i) => crest(i, 30)).join('');
    syncMute();
  }
  function syncMute() { const m = HB.Audio && HB.Audio.muted; $('bMute').textContent = m ? '🔇' : '🔊'; $('bMute').setAttribute('aria-pressed', m ? 'true' : 'false'); $('bMute').title = m ? 'Sound off — tap to turn on' : 'Sound on — tap to mute'; }
  $('bMute').onclick = () => { if (!HB.Audio) return; HB.Audio.unlock(); HB.Audio.setMuted(!HB.Audio.muted); syncMute(); sfx('select'); };
  $('bPreset').onclick = () => { HB.Audio && HB.Audio.unlock(); pikesVsCharge(); };
  $('bQuick').onclick = () => { HB.Audio && HB.Audio.unlock(); quickBattle(); };
  $('bPlay').onclick = () => { HB.Audio && HB.Audio.unlock(); playMenu(); };
  $('bCustom').onclick = () => { HB.Audio && HB.Audio.unlock(); customMenu(); };
  $('bHow').onclick = howTo;

  // =====================================================================
  //  CAMPAIGN
  // =====================================================================
  const CP = { st: null, local: [], cur: -1, queue: [], draft: null, online: null, spectate: false, timer: 0, waiting: false, shown: {} };
  const SAVE = 'tb-campaign', SAVE_V = 4; // bump SAVE_V whenever the campaign state changes shape: older saves are dropped, never half-loaded
  function validSave(s) { const st = s && s.st; return !!(s && s.v === SAVE_V && st && st.v === 3 && !st.over && Array.isArray(st.owner) && st.owner.length === P.length && Array.isArray(st.armies) && Array.isArray(st.gold) && st.gold.length === K.length && Array.isArray(s.local) && s.local.length); }
  function loadSaved() {
    try { localStorage.removeItem('tb3-campaign'); } catch (e) { /* ignore */ } // the pre-versioning key
    try { const s = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (validSave(s)) return s; if (s) localStorage.removeItem(SAVE); } catch (e) { try { localStorage.removeItem(SAVE); } catch (e2) { /* ignore */ } }
    return null;
  }
  function save() { if (CP.online || CP.spectate || !CP.st) return; try { localStorage.setItem(SAVE, JSON.stringify({ v: SAVE_V, st: CP.st, local: CP.local })); } catch (e) { /* storage full or blocked */ } }
  function startCampaign(o) {
    const seed = o.seed || ((Math.random() * 1e9) >>> 0);
    const st = C.create({ seed, seats: K.map((k, i) => ({ cmd: o.humans.includes(i) ? 'human' : 'ai' })) });
    Object.assign(CP, { st, local: o.humans.slice(), cur: o.humans[0] != null ? o.humans[0] : -1, queue: [], draft: null, online: null, spectate: !!o.spectate, waiting: false, shown: {} });
    enterMap();
    if (CP.spectate) { banner0('The Five Crowns', 'Every crown is played by Remi, Game Dev or a steady AI.'); CP.timer = setInterval(spectateTurn, 1700); return; }
    const k = K[CP.cur];
    modal(`<div class="crests">${crest(CP.cur, 40)}</div><h2>${esc(k.name)}</h2><div class="muted">${esc(k.motto)}</div>
      <p style="font-size:13.5px">${CP.cur === HB.INV ? 'You lead the Crimson Horde. Take three crowns before your supply runs dry — every province away from the camp costs supply.' : 'The Crimson Horde has crossed the mountains. Hold your capital, win allies, and break the Invader Camp in the east.'}</p>
      <p class="muted">Tap an army, then a glowing neighbour to march. Tap your capital to recruit. Envoys carry treaties. End Turn seals your orders.</p>
      <button class="btn big gold" data-a="go">Begin</button>`, { go: () => { closeModal(); beginOrders(); } }, { noClose: true });
  }
  function resumeCampaign(s) { Object.assign(CP, { st: s.st, local: s.local, cur: s.local[0], queue: [], draft: null, online: null, spectate: false, waiting: false, shown: {} }); enterMap(); beginOrders(); }
  function banner0(t, s) { toast(t + ' — ' + s, 3000); }
  function enterMap() { show('map'); MV.camSet = 0; MV.resize(); MV.setState(CP.st, CP.cur); if (CP.cur >= 0) MV.center(capitalOf(CP.cur)); $('bEnd').style.display = CP.spectate ? 'none' : ''; mapHud(); }
  function capitalOf(f) { let p = P.findIndex((q, i) => (q.cap || q.camp) && CP.st.owner[i] === f); if (p < 0) { const a = CP.st.armies.find(x => x.f === f); p = a ? a.p : 10; } return p; }
  function spectateTurn() {
    if (screen !== 'map' || !CP.spectate) { clearInterval(CP.timer); CP.timer = 0; return; }
    if (CP.st.over) { clearInterval(CP.timer); CP.timer = 0; victory(); return; }
    C.resolve(CP.st); animateTurn(); mapHud();
  }
  function animateTurn() {
    const st = CP.st, l = st.last || {};
    MV.envoys = (l.envoys || []).map(e => Object.assign({ t0: MV.t }, e));
    MV.marks = (l.battles || []).map(b => ({ p: b.p, t0: MV.t }));
    MV.setState(st, CP.cur); MV.arrows = [];
  }
  function mapHud() {
    const st = CP.st, f = CP.cur >= 0 ? CP.cur : HB.INV;
    const sup = Math.round(st.supply[f]);
    $('supTxt').textContent = sup + '/' + C.SUPPLY_CAP + (sup < 30 ? ' ⚠ low' : ''); $('supTxt').classList.toggle('supplow', sup < 30);
    const pay = st.pay ? st.pay[f] || 0 : 0;
    let seg = ''; for (let i = 0; i < 12; i++) seg += `<i class="${sup >= (i + 1) * C.SUPPLY_CAP / 12 - 4 ? 'on' : ''}"></i>`; $('supBar').innerHTML = seg;
    $('goldTxt').textContent = 'Gold ' + Math.round(st.gold[f] - plannedGold()) + (pay ? ' (−' + pay + '/turn)' : '') + (CP.cur >= 0 ? '' : ' · ' + K[f].name);
    $('turnTxt').textContent = st.turn;
    $('ticker').innerHTML = st.log.slice(-2).map(l => `<div>${l.f >= 0 ? '<b style="color:' + K[l.f].color + '">◆</b> ' : ''}${esc(l.text)}</div>`).join('');
  }
  function plannedGold() { if (!CP.draft) return 0; return CP.draft.rc.reduce((s, o) => s + C.recruitCost(CP.st, CP.cur, o.r), 0) + (CP.draft.sp != null ? C.SPY_COST : 0); }
  // ---- orders ----
  function beginOrders() {
    const st = CP.st; save();
    if (st.over) return victory();
    if (CP.online) { CP.queue = CP.local.filter(s => C.alive(st, s)); }
    else CP.queue = CP.local.filter(s => C.alive(st, s));
    if (!CP.queue.length) { // every human is dead: watch the AI finish
      toast('Your crown has fallen. The chronicle continues without you.', 3000); CP.spectate = true; $('bEnd').style.display = 'none'; CP.timer = setInterval(spectateTurn, 1500); return; }
    nextSeat();
  }
  function nextSeat() {
    const s = CP.queue.shift();
    const go = () => { CP.cur = s; CP.draft = { mv: {}, rc: [], of: [], rs: {} }; for (const a of CP.st.armies) if (a.f === s && a.dest != null && a.dest !== a.p) CP.draft.mv[a.id] = a.dest; refreshArrows(); MV.setState(CP.st, s); MV.center(capitalOf(s)); mapHud(); $('bEnd').disabled = false; headsUp(s); offersFor(s); };
    if (CP.local.length > 1 && !CP.online) cover(`${crest(s, 45)}<h2>${esc(K[s].name)}</h2><p>Pass the device to the ruler of ${esc(K[s].name)}.<br>Turn ${CP.st.turn}</p>`, go);
    else go();
  }
  function headsUp(s) { // start-of-turn warnings: the Horde closing on you, your supply, late marches
    const st = CP.st; CP.eta = CP.eta || {};
    MV.warn = s === HB.INV ? [] : C.hordeThreats(st, s);
    if (MV.warn.length) { const t = MV.warn.slice().sort((a, b) => a.eta - b.eta)[0]; sfx('warn'); toast(`⚠ The Horde rides on ${P[t.p].name}${t.eta <= 1 ? ' — next turn' : ' — ' + t.eta + ' turns away'} (strength ${Math.round(t.str)} vs your ${Math.round(t.def)}). Recruit there or call armies home.`, 4500); }
    else if (s === HB.INV && st.supply[s] < 30) { sfx('warn'); toast('⚠ Supply low (' + Math.round(st.supply[s]) + '): pull armies back toward the camp or take a town, or men start to starve.', 4500); }
    for (const a of st.armies) { const e = CP.eta[a.id]; if (!e || a.f !== s) continue; if (a.dest == null || a.dest === a.p) { delete CP.eta[a.id]; continue; } if (st.turn >= e.turn) { const left = C.dist(a.dest)[a.p]; e.turn = st.turn + left; toast(`${K[s].name}'s march on ${P[a.dest].name} is delayed (a battle or a blocked road) — new ETA turn ${e.turn}.`, 3800); } }
    if (s >= 0) tutorial('campaign', [
      '<b>Your armies.</b> Tap an army, then any province to march there. Far marches take several turns; the gold tag shows the ETA.',
      '<b>Gold.</b> Every regiment costs upkeep each turn (more abroad). Capitals and towns pay income; if the chest runs dry, men desert.',
      '<b>Envoys.</b> Treaties of tribute, truce, alliance — or the Grand Coalition against the Horde. Watch for the red ⚠: the Horde is coming.']);
  }
  function offersFor(s) {
    const st = CP.st, list = st.offers.filter(o => o.to === s && !o.done && CP.draft.rs[o.id] == null);
    if (!list.length) return;
    const o = list[0];
    treatyScroll(o, true, (ok) => { CP.draft.rs[o.id] = ok ? 1 : 0; toast(ok ? 'Your seal is set: the envoy rides back' : 'The envoy is sent away'); offersFor(s); });
  }
  const ICON = { gold: '💰', supply: '📦', land: '⛰', levy: '⚔', truce: '🕊', alliance: '🤝' };
  function termsHtml(o) {
    const g = o.give || {}, t = [];
    if (o.kind === 'alliance') t.push([ICON.alliance, 'Mutual defence — breaking it marks you Oathbreaker']);
    if (o.kind === 'coalition') { t.push([ICON.alliance, 'Alliance with every Coalition crown']); t.push([ICON.supply, 'Coalition riders harry the Horde\'s supply wagons each turn']); }
    if (g.gold) t.push([ICON.gold, g.gold + ' Gold']);
    if (g.supply) t.push([ICON.supply, g.supply + ' Supplies']);
    if (g.land != null && g.land >= 0) t.push([ICON.land, 'Cede ' + P[g.land].name]);
    if (g.levy) t.push([ICON.levy, HB.names().tribute + ': ' + g.levy + ' ' + HB.names().recruits + ' (ready in 3 turns)']);
    if (o.kind !== 'alliance' && o.kind !== 'coalition') t.push([ICON.truce, 'Truce: ' + (o.truce || 4) + ' turns']);
    return t.map(([i, s]) => `<div class="term"><i>${i}</i><span>${esc(s)}</span></div>`).join('');
  }
  const tName = (k) => k === 'tribute' ? 'Treaty of Tribute' : k === 'alliance' ? 'Treaty of Alliance' : k === 'coalition' ? 'The Grand Coalition' : 'Treaty of Truce';
  function treatyScroll(o, incoming, cb) {
    const from = K[o.from], to = K[o.to];
    modal(`<div class="crests">${crest(o.from, 52)}<span>⚜</span>${crest(o.to, 52)}</div><h2>${tName(o.kind)}</h2>
      <div class="muted">${esc(from.name)} ${o.kind === 'tribute' ? 'demands of' : 'offers'} ${esc(to.name)}</div>
      <div class="terms">${termsHtml(o)}</div>${o.give && o.give.levy ? oathCard(true) : ''}
      ${incoming ? '<div class="seals"><button class="seal gold" data-a="yes">Accept</button><button class="seal red" data-a="no">Refuse</button></div>' : '<div class="seals"><button class="seal gold" data-a="yes">Send<br>Envoy</button><button class="seal red" data-a="no">Tear<br>it up</button></div>'}`,
      { yes: () => { closeModal(); cb(true); }, no: () => { closeModal(); cb(false); } }, { noClose: true });
  }
  function relation(a, b) { const t = C.treaty(CP.st, a, b); if (!t) return 'At war'; return t.kind === 'alliance' ? 'Allied' : 'Truce until turn ' + t.until; }
  function intelLine(me, i) {
    const st = CP.st, until = st.intel && st.intel[me + ':' + i]; if (!(until >= st.turn)) return '';
    const ar = st.armies.filter(a => a.f === i);
    return `<br><span class="muted">🗝 Spy report: ${Math.round(st.gold[i])} gold · supply ${Math.round(st.supply[i])} · ${ar.length} armies, strength ${Math.round(ar.reduce((t, a) => t + C.strength(st, a), 0))}</span>`;
  }
  function diploSheet() {
    if (CP.cur < 0) return;
    const st = CP.st, me = CP.cur;
    const rows = K.map((k, i) => i === me || !C.alive(st, i) ? '' : `<div class="item">${crest(i, 26)}<span class="grow"><b>${esc(k.name)}</b><br><span class="muted">${relation(me, i)} · ${esc(rulerOf(i))}${st.seats[i].cmd === 'ai' ? '' : ' (player)'}${CP.draft.of.some(o => o.to === i) ? ' · envoy ready' : ''}</span></span>
      ${intelLine(me, i)}</span></span>
      <button class="btn sm" data-a="env" data-i="${i}">Envoy</button> <button class="btn sm ${CP.draft.sp === i ? 'gold' : ''}" data-a="spy" data-i="${i}">🗝 Spy</button></div>`).join('');
    const co = (st.coalition || []).filter(m => C.alive(st, m));
    sheet(`<h3>Envoys &amp; spies</h3><div class="muted">One envoy per crown per turn; answers come next turn. A spy costs ${C.SPY_COST} gold: a 3-turn report, and against the Horde it burns supply wagons. A caught spy closes their court to you for 3 turns.</div>
      ${co.length ? `<div class="muted">Coalition against the Horde: ${co.map(m => esc(K[m].name)).join(', ')}</div>` : ''}<div class="list">${rows}</div>`,
      { env: (el) => envoyCompose(+el.dataset.i), spy: (el) => { const i = +el.dataset.i; if (CP.draft.sp === i) delete CP.draft.sp; else { if (st.gold[me] - plannedGold() < C.SPY_COST) return toast('Not enough gold for a spy'); CP.draft.sp = i; toast('A spy slips out toward ' + K[i].name); } mapHud(); diploSheet(); } });
  }
  function envoyCompose(to) {
    const st = CP.st, me = CP.cur;
    const o = { k: 'of', from: me, to, kind: 'tribute', give: { gold: 200, supply: 0, land: -1, levy: 0 }, truce: 8 };
    const lands = P.map((p, i) => i).filter(i => st.owner[i] === to && !P[i].cap && !P[i].camp);
    const draw = () => modal(`<div class="crests">${crest(me, 46)}<span>⚜</span>${crest(to, 46)}</div><h2>${tName(o.kind)}</h2><div class="muted">To ${esc(K[to].name)} · ${relation(me, to)}</div>
      <div class="chips" style="justify-content:center">${['alliance', 'truce', 'tribute'].concat(me !== HB.INV && to !== HB.INV ? ['coalition'] : []).map(k => `<button class="chip ${o.kind === k ? 'on' : ''}" data-a="kind" data-v="${k}">${k === 'tribute' ? 'Demand tribute' : k === 'coalition' ? 'Coalition' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      ${o.kind === 'tribute' ? `<h4>They pay</h4>
      <div class="chips">${[0, 100, 200, 400].map(v => `<button class="chip ${o.give.gold === v ? 'on' : ''}" data-a="gold" data-v="${v}">💰 ${v}</button>`).join('')}</div>
      <div class="chips">${[0, 40, 120].map(v => `<button class="chip ${o.give.supply === v ? 'on' : ''}" data-a="sup" data-v="${v}">📦 ${v}</button>`).join('')}</div>
      <div class="chips">${[-1].concat(lands).map(v => `<button class="chip ${o.give.land === v ? 'on' : ''}" data-a="land" data-v="${v}">⛰ ${v < 0 ? 'No land' : esc(P[v].name)}</button>`).join('')}</div>
      <div class="chips">${[0, 50].map(v => `<button class="chip ${o.give.levy === v ? 'on' : ''}" data-a="levy" data-v="${v}">⚔ ${v ? HB.names().tribute + ' ' + v : 'No ' + HB.names().tribute}</button>`).join('')}</div>` : ''}
      ${o.kind !== 'alliance' && o.kind !== 'coalition' ? `<div class="chips">${[4, 8].map(v => `<button class="chip ${o.truce === v ? 'on' : ''}" data-a="truce" data-v="${v}">🕊 Truce ${v} turns</button>`).join('')}</div>` : ''}
      <div class="terms">${termsHtml(o)}</div>
      <div class="seals"><button class="seal gold" data-a="send">Send<br>Envoy</button><button class="seal red" data-a="close">Tear<br>it up</button></div>`,
      { kind: (el) => { o.kind = el.dataset.v; draw(); }, gold: (el) => { o.give.gold = +el.dataset.v; draw(); }, sup: (el) => { o.give.supply = +el.dataset.v; draw(); }, land: (el) => { o.give.land = +el.dataset.v; draw(); }, levy: (el) => { o.give.levy = +el.dataset.v; draw(); }, truce: (el) => { o.truce = +el.dataset.v; draw(); },
        send: () => { CP.draft.of = CP.draft.of.filter(x => x.to !== to); const x = { k: 'of', to, kind: o.kind, truce: o.kind === 'alliance' || o.kind === 'coalition' ? 0 : o.truce }; if (o.kind === 'tribute') x.give = Object.assign({}, o.give); CP.draft.of.push(x); closeModal(); closeSheet(); MV.envoys = (MV.envoys || []).concat([{ f: me, a: capitalOf(me), b: capitalOf(to), t0: MV.t }]); toast('An envoy rides for ' + K[to].name); } }, { noClose: true });
    draw();
  }
  function armySheet(a) {
    const st = CP.st, F = HB.FACTION[K[a.f].culture], mineA = a.f === CP.cur;
    const rows = a.picks.map((ix, i) => { const ro = F.roster[ix], art = ro.art && HB.ART && HB.ART.unit && HB.ART.unit[ro.art]; return `<div class="item">${art ? `<img class="uface" src="${art.face}" alt="">` : ''}<span class="grow">${esc(ro.name)} <span class="muted">${esc(HB.TYPES[ro.t].role)}</span></span><span class="hp"><b style="width:${a.hp[i]}%"></b></span></div>`; }).join('');
    const hasOath = a.picks.some(ix => F.roster[ix].art === 'oathbound');
    const mv = CP.draft && CP.draft.mv[a.id], open = !!CP.stripOpen;
    const counts = {}; for (const ix of a.picks) { const k = HB.TYPES[F.roster[ix].t].role; counts[k] = (counts[k] || 0) + 1; }
    const sum = Object.entries(counts).map(([k, n]) => n + '× ' + k).join(' · ');
    sheet(`<div class="striphead" data-a="tog"><h3>${crest(a.f, 22)} ${esc(K[a.f].name)} · ${esc(P[a.p].name)}</h3><button class="tog" data-a="tog" aria-label="${open ? 'Collapse' : 'Expand'}">${open ? '▾' : '▴'} ${a.picks.length}</button></div>
      <div class="muted">Strength ${Math.round(C.strength(st, a))}${mv != null ? ' · marching to ' + esc(P[mv].name) + (HB.ADJ[a.p].includes(mv) ? '' : ' (ETA turn ' + (st.turn + C.dist(mv)[a.p]) + ')') : ''}${open ? '' : ' · ' + esc(sum)}</div>
      ${open ? `${hasOath ? oathCard(true) : ''}${mineA ? '<div class="muted">Tap any province to march there — far marches take the roads over several turns.</div>' : ''}<div class="list">${rows}</div>` : ''}
      ${mineA && mv != null ? '<button class="btn sm" data-a="hold">Hold position</button>' : ''}${mineA && C.canRecruit(st, a.f, a.p) ? ' <button class="btn sm gold" data-a="rec">Recruit here</button>' : ''}`,
      { tog: () => { CP.stripOpen = !CP.stripOpen; armySheet(a); }, hold: () => { delete CP.draft.mv[a.id]; if (CP.eta) delete CP.eta[a.id]; refreshArrows(); armySheet(a); }, rec: () => recruitSheet(a.p) }, { strip: true });
    if (mineA) { MV.sel = a.id; MV.hl = HB.ADJ[a.p].map(p => ({ p })); }
  }
  function recruitSheet(p) {
    const st = CP.st, me = CP.cur, F = HB.FACTION[K[me].culture];
    const n = F.siege0 || F.roster.length; const ex = st.armies.find(a => a.f === me && a.p === p);
    const queued = CP.draft.rc.filter(o => o.p === p).length, room = HB.MAX_REGS - (ex ? ex.picks.length : 0) - queued;
    const left = st.gold[me] - plannedGold();
    let rows = ''; for (let i = 0; i < n; i++) { const c = C.recruitCost(st, me, i); rows += `<div class="item"><span class="grow">${esc(F.roster[i].name)} <span class="muted">${esc(HB.TYPES[F.roster[i].t].role)}</span></span><span>💰${c}</span><button class="btn sm" data-a="buy" data-i="${i}" ${c > left || room <= 0 ? 'disabled' : ''}>+</button></div>`; }
    sheet(`<h3>Recruit at ${esc(P[p].name)}</h3><div class="muted">Gold left ${Math.round(left)} · room for ${Math.max(0, room)} more regiments${queued ? ' · ' + queued + ' queued' : ''}</div><div class="list">${rows}</div>${queued ? '<button class="btn sm" data-a="clr">Clear queue</button>' : ''}`,
      { buy: (el) => { CP.draft.rc.push({ k: 'rc', p, r: +el.dataset.i }); sfx('order'); mapHud(); recruitSheet(p); }, clr: () => { CP.draft.rc = CP.draft.rc.filter(o => o.p !== p); mapHud(); recruitSheet(p); } });
  }
  function provSheet(p) {
    const st = CP.st, o = st.owner[p], here = st.armies.filter(a => a.p === p);
    const rows = here.map(a => `<div class="item" data-a="army" data-id="${a.id}">${crest(a.f, 22)}<span class="grow">${esc(K[a.f].name)}</span><span class="muted">strength ${Math.round(C.strength(st, a))}</span></div>`).join('');
    sheet(`<h3>${o >= 0 ? crest(o, 22) : ''} ${esc(P[p].name)}</h3><div class="muted">${o >= 0 ? 'Held by ' + esc(K[o].name) : 'Unclaimed'} · ${P[p].cap ? 'walled capital (siege)' : P[p].camp ? 'fortified camp (siege)' : P[p].hills ? 'hill country' : 'open country'} · income ${P[p].cap ? 70 : P[p].camp ? 40 : 35}</div>
      <div class="list">${rows || '<div class="muted">No armies here.</div>'}</div>
      ${CP.cur >= 0 && C.canRecruit(st, CP.cur, p) ? '<button class="btn sm gold" data-a="rec">Recruit</button>' : ''}${CP.cur >= 0 && o >= 0 && o !== CP.cur ? ' <button class="btn sm" data-a="env">Send envoy</button>' : ''}`,
      { rec: () => recruitSheet(p), env: () => envoyCompose(o), army: (el) => { const a = st.armies.find(x => x.id === +el.dataset.id); a && armySheet(a); } });
  }
  function marchPath(from, dest) { const out = []; let p = from, g = 0; while (p !== dest && p >= 0 && g++ < 12) { const n = C.pathStep(p, dest); if (n < 0) break; out.push([p, n]); p = n; } return out; }
  function refreshArrows() { MV.arrows = []; for (const [id, to] of Object.entries(CP.draft ? CP.draft.mv : {})) { const a = CP.st.armies.find(x => x.id === +id); if (!a) continue; const path = marchPath(a.p, to); path.forEach(([f, t], i) => MV.arrows.push({ from: f, to: t, col: i ? 'rgba(245,207,90,0.75)' : K[CP.cur].color, dest: to, label: i === path.length - 1 && path.length > 1 ? 'ETA turn ' + (CP.st.turn + path.length) : '' })); } }
  function mapTap(sx, sy) {
    if (CP.waiting || CP.spectate) { const h = MV.pick(sx, sy); if (h.prov >= 0) provSheet(h.prov); return; }
    const st = CP.st, h = MV.pick(sx, sy);
    const selA = MV.sel != null ? st.armies.find(a => a.id === MV.sel) : null;
    if (selA && h.prov >= 0 && h.prov !== selA.p && C.dist(h.prov)[selA.p] < 99 && !(h.army && h.army.f === CP.cur && h.army.id !== selA.id && h.army.p !== h.prov)) {
      const dest = h.prov, to = HB.ADJ[selA.p].includes(dest) ? dest : C.pathStep(selA.p, dest), own = st.owner[to], hops = C.dist(dest)[selA.p];
      const doIt = () => { CP.draft.mv[selA.id] = dest; CP.eta = CP.eta || {}; CP.eta[selA.id] = { turn: st.turn + hops }; refreshArrows(); sfx('order'); armySheet(selA); toast(`March on ${P[dest].name}${hops > 1 ? ' — ' + hops + ' turns, via ' + P[to].name + ' (ETA turn ' + (st.turn + hops) + ')' : ''}${(P[dest].cap || P[dest].camp) && st.owner[dest] !== CP.cur ? ' — a siege!' : ''}`); };
      const there = st.armies.filter(a => a.p === to && a.f !== CP.cur).map(a => a.f).concat(own >= 0 && own !== CP.cur ? [own] : []);
      const oath = there.find(f => C.friendly(st, CP.cur, f) && own === f);
      if (oath != null) return modal(`<div class="crests">${crest(oath, 44)}</div><h2>Break your oath?</h2><p>You are bound to ${esc(K[oath].name)} (${relation(CP.cur, oath)}). Marching on ${esc(P[to].name)} is betrayal: the gods will mark you Oathbreaker.</p><button class="btn red" data-a="y">Betray them</button><button class="btn" data-a="close">Keep faith</button>`, { y: () => { closeModal(); doIt(); } });
      return doIt();
    }
    if (h.army) return armySheet(h.army);
    if (h.prov >= 0) { MV.sel = null; MV.hl = []; return provSheet(h.prov); }
    closeSheet();
  }
  (function mapInput() {
    const cv = $('mapcv'), pts = new Map(); let g = null, pinch = null;
    const xy = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', (e) => { HB.Audio && HB.Audio.unlock(); const p = xy(e); pts.set(e.pointerId, p);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: MV.cam.z, cam: { x: MV.cam.x, y: MV.cam.y }, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; g = null; return; }
      g = { x0: p.x, y0: p.y, moved: false, cam: { x: MV.cam.x, y: MV.cam.y } }; });
    cv.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId)) return; const p = xy(e); pts.set(e.pointerId, p);
      if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; MV.cam.z = pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(10, pinch.d); MV.cam.x = pinch.cam.x - ((a.x + b.x) / 2 - pinch.cx) / MV.cam.z; MV.cam.y = pinch.cam.y - ((a.y + b.y) / 2 - pinch.cy) / MV.cam.z; MV.clamp(); return; }
      if (!g) return; if (Math.hypot(p.x - g.x0, p.y - g.y0) > 10) g.moved = true;
      if (g.moved) { MV.cam.x = g.cam.x - (p.x - g.x0) / MV.cam.z; MV.cam.y = g.cam.y - (p.y - g.y0) / MV.cam.z; MV.clamp(); } });
    const up = (e) => { if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId); if (pinch) { if (pts.size < 2) pinch = null; g = null; return; } if (g && !g.moved) mapTap(g.x0, g.y0); g = null; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); g = null; pinch = null; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); MV.cam.z *= e.deltaY < 0 ? 1.12 : 0.89; MV.clamp(); }, { passive: false });
  })();
  $('bDiplo').onclick = () => { if (CP.spectate || CP.cur < 0) return toast('Spectating'); diploSheet(); };
  $('bLog').onclick = () => sheet(`<h3>Chronicle</h3><div class="list">${CP.st.log.slice().reverse().slice(0, 40).map(l => `<div class="item"><span class="muted">T${l.t}</span><span class="grow">${l.f >= 0 ? crest(l.f, 18) : ''} ${esc(l.text)}</span></div>`).join('')}</div>`);
  $('bMapMenu').onclick = () => modal(`<h2>The Five Crowns</h2><div class="muted">Turn ${CP.st.turn} of ${CP.st.maxTurns}${CP.online ? ' · room ' + esc(CP.online.code) : ''}</div>
    <button class="btn big" data-a="snd">${HB.Audio && HB.Audio.muted ? 'Sound on' : 'Sound off'}</button><button class="btn big" data-a="how">How to play</button><button class="btn big red" data-a="quit">${CP.online || CP.spectate ? 'Leave' : 'Save & quit'}</button>`,
    { snd: () => { HB.Audio.setMuted(!HB.Audio.muted); syncMute(); closeModal(); toast(HB.Audio.muted ? 'Sound off' : 'Sound on'); }, how: howTo, quit: () => { save(); if (CP.online) CP.online.close(); CP.online = null; goTitle(); } });
  $('bEnd').onclick = () => {
    if (CP.waiting || !CP.draft || CP.cur < 0) return;
    const d = CP.draft, orders = [];
    for (const id in d.mv) { const a = CP.st.armies.find(x => x.id === +id); if (!a || a.p === d.mv[id]) continue; const to = HB.ADJ[a.p].includes(d.mv[id]) ? d.mv[id] : C.pathStep(a.p, d.mv[id]); orders.push(to === d.mv[id] ? { k: 'mv', a: +id, to } : { k: 'mv', a: +id, to, d: d.mv[id] }); }
    for (const o of d.rc) orders.push(o);
    for (const o of d.of) orders.push(o);
    if (d.sp != null) orders.push({ k: 'sp', to: d.sp });
    for (const id in d.rs) orders.push({ k: 'rs', id: +id, ok: d.rs[id] });
    sfx('order'); closeSheet(); MV.arrows = [];
    if (CP.online) { CP.online.submit(orders); CP.waiting = true; waitMsg('Orders sealed. Waiting for the other rulers…'); return; }
    C.submit(CP.st, CP.cur, orders); CP.draft = null;
    if (CP.queue.length) return nextSeat();
    resolveLocal();
  };
  function waitMsg(t) { const w = $('waiting'); if (t) { w.textContent = t; w.style.display = 'block'; } else w.style.display = 'none'; $('bEnd').disabled = !!t; }
  function resolveLocal() {
    const st = CP.st; C.resolve(st); animateTurn(); mapHud(); runBattles();
  }
  // human battles of this turn, one by one (pre-battle card: Fight / Auto-resolve)
  function runBattles() {
    const st = CP.st;
    if (st.phase !== 'battles') return turnDone();
    const bt = st.battles.find(b => !b.done && b.sides.some(f => CP.local.includes(f)) && !(CP.online && (b.sides.filter(f => st.seats[f].cmd !== 'ai').length > 1 || CP.reported[st.turn + ':' + b.p])));
    if (!bt) { if (CP.online) return; return turnDone(); }
    const p = P[bt.p], m = C.battleMatch(st, bt);
    const sideRows = bt.sides.map(f => { const a = st.armies.find(x => x.f === f && x.p === bt.p); return `<div class="item">${crest(f, 26)}<span class="grow"><b>${esc(K[f].name)}</b>${f === bt.sides[0] && bt.siege ? ' <span class="muted">(defends)</span>' : ''}</span><span class="muted">${a ? a.picks.length + ' regiments' : ''}</span></div>`; }).join('');
    MV.center(bt.p);
    modal(`<h4>${bt.siege ? 'A walled city' : 'Field battle'}</h4><h2>${esc(m.title)}</h2><div class="list">${sideRows}</div>
      <div class="muted">${bt.siege ? 'Walls in ' + (p.camp ? 2 : 3) + ' rings. The attacker brings a ram, a siege tower and a trebuchet.' + (m.siege.relief ? ' A relief army is near.' : '') : 'Terrain: ' + m.terrain + ' · weather: ' + m.weather}</div>
      <button class="btn big gold" data-a="fight">⚔ Fight</button><button class="btn big" data-a="auto">Auto-resolve</button>`,
      { fight: () => { closeModal(); fightCampaignBattle(bt); }, auto: () => { closeModal(); const res = C.autoResolve(st, bt); reportBattle(bt, res); } }, { noClose: true });
  }
  function fightCampaignBattle(bt) {
    const st = CP.st;
    const m = C.battleMatch(st, bt, (f) => CP.local.includes(f) ? 'human' : (st.seats[f].ai === 'steady' ? 'ai' : st.seats[f].ai));
    const ctl = m.cf.map((f, i) => CP.local.includes(f) ? i : -1).filter(i => i >= 0);
    startBattle(m, { ctl, turn: st.turn, onEnd: (b, mm) => { show('map'); reportBattle(bt, C.battleResult(st, bt, mm, b)); } });
  }
  function reportBattle(bt, res) {
    const w = res.winner >= 0 ? K[res.winner].name : 'No one';
    toast(`${res.title}: ${res.winner >= 0 ? w + ' wins' : 'no victor'}`, 2600);
    if (CP.online) { CP.reported[CP.st.turn + ':' + bt.p] = 1; CP.online.reportBattle(bt.p, res); runBattles(); return; }
    C.finishBattle(CP.st, bt, res); MV.setState(CP.st, CP.cur); mapHud(); runBattles();
  }
  function turnDone() {
    const st = CP.st; animateTurn(); mapHud();
    if (st.over) return victory();
    const mineLog = st.log.filter(l => l.t === st.turn - 1 && (l.text.includes('BETRAYAL') || l.text.includes('falls') || l.text.includes('captures') || l.text.includes('Siege')));
    if (mineLog.length) toast(mineLog.slice(-1)[0].text, 3200);
    const paid = st.log.filter(l => l.t === st.turn - 1 && l.text.startsWith(N().tribute + ' paid') && (CP.local.includes(l.f) || CP.local.length === 0));
    if (paid.length) showCard(`${oathCard(true)}<div class="muted" style="margin-top:4px">${esc(paid[paid.length - 1].text)}</div>`, 6500);
    beginOrders();
  }
  function victory() {
    const st = CP.st, w = st.winner; save(); try { localStorage.removeItem(SAVE); } catch (e) { /* ignore */ }
    const mine = CP.local.includes(w);
    if (CP.local.length) sfx(mine ? 'win' : 'lose');
    flourish(w >= 0 ? (CP.local.length === 1 ? (mine ? 'Victory' : 'Defeat') : K[w].name) : 'Ruin', w >= 0 ? K[w].name + ' triumphs' : 'The realm is broken', !CP.local.length || mine);
    setTimeout(() => { $('flourish').classList.remove('on'); modal(`<div class="crests">${w >= 0 ? crest(w, 70) : ''}</div><h4>Turn ${st.turn}</h4><h2>${w >= 0 ? esc(K[w].name) + ' triumphs' : 'The realm is broken'}</h2>
      <p>${w === HB.INV ? 'The Crimson Horde holds three crowns. The dragon banner flies over the realm.' : 'The Horde is broken and the Five Crowns endure.'}</p>
      <div class="muted">${esc(st.log.slice(-1)[0].text)}</div><button class="btn big gold" data-a="t">To the title</button>`, { t: () => { if (CP.online) CP.online.close(); CP.online = null; goTitle(); } }, { noClose: true }); }, 900);
  }

  // =====================================================================
  //  ONLINE (rooms over ntfy.sh, battles over WebRTC lockstep — see net.js)
  // =====================================================================
  function onlineMenu() {
    modal(`<h2>Online with a friend</h2><div class="muted">No accounts. Share a room link; your friend picks the Invader or a kingdom. Empty seats are AI.</div>
      <button class="btn big gold" data-a="host">Host a room</button><h4>or join</h4><input class="input" id="roomIn" maxlength="6" placeholder="CODE"><br><button class="btn" data-a="join">Join</button>`,
      { host: () => hostRoom(0), join: () => { const c = ($('roomIn').value || '').trim().toUpperCase(); if (!/^[A-Z0-9]{4,6}$/.test(c)) return toast('Enter the 4–6 letter room code'); joinRoom(c); } });
  }
  function lobbyModal(s) {
    const L = s.lobby || {}, taken = Object.keys(L.seats || {}).map(Number);
    const link = location.origin + location.pathname + '#room=' + s.code;
    const rows = taken.map(i => `<div class="item">${crest(i, 24)}<span class="grow">${esc(K[i].name)}</span><span class="muted">${esc(L.seats[i])}${s.seat === i ? ' (you)' : ''}</span></div>`).join('');
    const alone = taken.length < 2;
    modal(`<h4>Room code</h4><h2 id="roomCode" style="letter-spacing:.25em;font-size:40px;margin:2px 0">${esc(s.code)}</h2>
      ${s.isHost ? `<div class="muted">${alone ? 'Send this code or link to a friend. It stays here until they join.' : 'A friend has joined.'}</div>
      <div id="roomLink" style="font-size:12px;word-break:break-all;margin:6px 0;padding:6px;border:1px dashed #b89a55;border-radius:6px">${esc(link)}</div>
      <button class="btn gold" data-a="copy">Copy link</button> <button class="btn" data-a="share">Share…</button>` : '<div class="muted">Joined. Pick your side, then wait for the host.</div>'}
      <h4>Rulers</h4><div class="list">${rows || '<div class="muted">Waiting…</div>'}</div>
      ${!s.isHost && s.seat < 0 ? `<h4>Choose your side</h4><div class="seats">${seatButtons([], taken)}</div>` : ''}
      ${s.isHost && alone ? `<h4>Your crown</h4><div class="seats">${seatButtons([s.seat], taken.filter(i => i !== s.seat))}</div>` : ''}
      ${s.isHost ? `<button class="btn big gold" data-a="start" ${taken.length < 2 ? 'disabled' : ''}>Begin the campaign</button>` : '<div class="muted">The host begins the campaign.</div>'}
      <div class="muted" id="netStatus">${esc(s.status || '')}</div><button class="btn sm red" data-a="leave">Leave</button>`,
      { copy: () => { copyText(link); toast('Room link copied — code ' + s.code); }, share: () => { const CF = HB.CONFIG || {}, txt = CF.shareText ? CF.shareText(s.code) : 'Join my room: ' + s.code; const fallback = () => { copyText(link); toast('Sharing is not available here — link copied instead'); }; if (navigator.share) navigator.share({ title: CF.title || document.title, text: txt, url: link }).catch((e) => { if (!e || e.name !== 'AbortError') fallback(); }); else fallback(); }, seat: (el) => s.pickSeat(+el.dataset.i), start: () => s.start(), leave: () => { s.close(); CP.online = null; closeModal(); goTitle(); } }, { noClose: true });
  }
  function wire(s) {
    CP.online = s; CP.reported = {}; CP.netKey = '';
    s.on('lobby', () => { if (!CP.st || CP.st.v !== 3 || screen !== 'map') lobbyModal(s); });
    s.on('status', (t) => { const el = $('netStatus'); if (el) el.textContent = t; else if (t) toast(t); });
    s.on('state', (st) => onNetState(st));
    s.on('h2h', (o) => netBattle(o));
    s.on('error', (t) => toast(t, 3500));
    s.on('replace', (nb) => { if (BR.lock && BR.b) { BR.b = nb; R.b = nb; R.spr.clear(); } });
  }
  function hostRoom(seat) { closeModal(); const s = HB.Net.host({ seat, name: 'Host' }); wire(s); lobbyModal(s); }
  function joinRoom(code) { closeModal(); const s = HB.Net.join({ code, name: 'Guest' }); wire(s); lobbyModal(s); }
  function onNetState(st) {
    const s = CP.online; if (!s) return;
    const first = !CP.st || CP.st !== st && (CP.st.seed !== st.seed);
    CP.st = st; CP.local = [s.seat]; CP.spectate = false;
    if (first || screen !== 'map' && screen !== 'battle') { closeModal(); enterMap(); }
    if (screen === 'battle') return; // picked up again when the battle ends
    const key = st.turn + ':' + st.phase, newTurn = CP.netKey !== key; CP.netKey = key;
    MV.setState(st, s.seat); mapHud();
    if (st.over) { waitMsg(''); return victory(); }
    if (st.phase === 'orders') {
      if (newTurn || !CP.draft && !CP.waiting) { if (newTurn && st.turn > 1) animateTurn(); CP.waiting = false; waitMsg(''); if (st.orders && st.orders[s.seat]) { CP.waiting = true; waitMsg('Orders sealed. Waiting for the other rulers…'); } else beginOrders(); }
    } else if (st.phase === 'battles') {
      if (newTurn) animateTurn(); waitMsg('Battles are being fought…');
      const mineB = st.battles.find(b => !b.done && b.sides.includes(s.seat) && b.sides.filter(f => st.seats[f].cmd !== 'ai').length === 1 && !CP.reported[st.turn + ':' + b.p]);
      if (mineB && !$('modal').classList.contains('on')) runBattlesOnline();
    }
  }
  function runBattlesOnline() { runBattles(); }
  function netBattle(o) {
    const st = CP.st, s = CP.online, bt = st.battles.find(b => b.p === o.p); if (!bt) return;
    const m = C.battleMatch(st, bt, (f) => st.seats[f].cmd !== 'ai' ? 'human' : (st.seats[f].ai === 'steady' ? 'ai' : st.seats[f].ai));
    const ctl = m.cf.map((f, i) => f === s.seat ? i : -1).filter(i => i >= 0);
    closeModal(); closeSheet();
    startBattle(m, { ctl, lock: o.lock, turn: st.turn, onEnd: (b, mm) => { show('map'); o.lock.close(); if (s.isHost) s.h2hDone(bt.p, C.battleResult(st, bt, mm, b)); onNetState(CP.st); } });
    toast(ctl.length ? 'Live battle against ' + m.sides.filter((x, i) => !ctl.includes(i)).map(x => x.name).join(', ') : 'Watching a live battle', 2500);
  }

  // =====================================================================
  //  MAIN LOOP, LINKS, TEST HOOK
  // =====================================================================
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    try {
      if (screen === 'battle') battleFrame(dt);
      else if (screen === 'map' && CP.st) MV.draw(dt);
    } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  function route() {
    const h = location.hash;
    if (h.startsWith('#watch=')) { const d = HB.decodeWatch(h.slice(7)); if (!d) return toast('That replay link is broken'); startBattle(d.m, { watch: d.cmds }); toast('Replay — the battle exactly as it was fought', 2500); return; }
    if (h.startsWith('#room=')) { const c = h.slice(6).toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c) joinRoom(c); }
  }
  G.addEventListener('hashchange', route);
  applyConfig();
  // ---------- title key art: one 16:9 painting cropped live for portrait and landscape phones ----------
  // Landscape: the whole painting minus its bottom strip, cropped so the painted title stays in view.
  // Portrait: the painted title (title_logo.webp) on top, then the battle below the tagline, cropped round the clash.
  function keyArt() {
    const T = HB.ART && HB.ART.title, L = HB.ART && HB.ART.titleLayers, ti = $('title');
    ti.classList.toggle('keyart', !!(T && L)); if (!T || !L) { ti.classList.remove('splash'); return; }
    $('kaScene').style.backgroundImage = 'url(' + T + ')'; $('kaLogo').style.backgroundImage = 'url(' + L.logo + ')'; $('kaStrip').style.backgroundImage = 'url(' + L.strip + ')';
    $('kaLogo').setAttribute('aria-label', L.logoAlt || ''); layoutKeyArt();
  }
  function layoutKeyArt() {
    const L = HB.ART && HB.ART.titleLayers, ti = $('title'); if (!L || !ti.classList.contains('keyart')) return;
    const vw = ti.clientWidth || innerWidth, vh = ti.clientHeight || innerHeight, portrait = vw / vh < 1.45, splash = ti.classList.contains('splash');
    ti.classList.toggle('ka-portrait', portrait); ti.classList.toggle('ka-landscape', !portrait);
    const stripH = splash ? Math.round(portrait ? Math.max(56, Math.min(84, vh * 0.09)) : Math.max(44, Math.min(96, vh * 0.12))) : 0;
    $('kaStrip').style.height = stripH + 'px';
    const [lx0, lx1, ly1] = L.logoBox, la = (lx1 - lx0) * L.w / (ly1 * L.h); // logo aspect
    let top = 0, y0 = 0, y1 = L.stripTop - 0.01, logoH = 0;
    if (portrait) { const lw = Math.min(vw, 560); logoH = Math.round(lw / la); const lg = $('kaLogo'); lg.style.width = lw + 'px'; lg.style.height = logoH + 'px'; y0 = Math.max(L.sceneTop, ly1 + 0.005); } // the battle runs under the painted title, so tablets get no dark side bars
    ti.style.setProperty('--logoH', logoH + 'px');
    const bw = vw, bh = Math.max(1, vh - stripH - top), sc = $('kaScene');
    sc.style.top = top + 'px'; sc.style.height = bh + 'px';
    const s = Math.max(bw / L.w, bh / ((y1 - y0) * L.h)), iw = L.w * s, ih = L.h * s, vis = bw / iw; // vis = fraction of the width in view
    let fx = L.focusX - vis / 2; if (!portrait) fx = Math.min(fx, lx0 - 0.01); fx = Math.max(0, Math.min(1 - vis, fx));
    const visH = bh / ih, fy = portrait ? y0 + Math.max(0, (y1 - y0) - visH) * 0.45 : Math.max(0, Math.min(y1 - visH, 0.012)); // landscape: a sliver off the sky at most // landscape: keep the painted title at the top
    sc.style.backgroundSize = Math.round(iw) + 'px ' + Math.round(ih) + 'px'; sc.style.backgroundPosition = Math.round(-fx * iw) + 'px ' + Math.round(-fy * ih) + 'px';
  }
  addEventListener('resize', layoutKeyArt); addEventListener('orientationchange', () => setTimeout(layoutKeyArt, 120));
  function begin() { // the splash's "Tap to begin": unlock audio and reveal the menu
    const ti = $('title'); if (!ti.classList.contains('splash') || !ti.classList.contains('ready')) return;
    HB.Audio && HB.Audio.unlock(); sfx('horn'); ti.classList.remove('splash'); ti.classList.add('menu-in'); layoutKeyArt(); setTimeout(() => ti.classList.remove('menu-in'), 600);
  }
  $('title').addEventListener('click', (e) => { if ($('title').classList.contains('splash')) { e.stopPropagation(); begin(); } }, true);
  addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && screen === 'title') begin(); });
  (function boot() { // loading: a progress bar on the parchment strip while the painting arrives, then "Tap to begin"
    const ti = $('title');
    if (location.hash.length > 1 || !ti.classList.contains('keyart')) { ti.classList.remove('splash'); ti.classList.add('ready'); layoutKeyArt(); return; } // deep links (#room, #watch) skip the splash
    const srcs = [HB.ART.title, HB.ART.titleLayers.logo, HB.ART.titleLayers.strip].concat([...document.querySelectorAll('#crestRow img')].map(i => i.src));
    let n = 0, done = false; const fill = $('ldFill');
    const ready = () => { if (done) return; done = true; fill.style.width = '100%'; setTimeout(() => ti.classList.add('ready'), 200); };
    for (const src of srcs) { const im = new Image(); im.onload = im.onerror = () => { n++; fill.style.width = Math.round(15 + 85 * n / srcs.length) + '%'; if (n >= srcs.length) ready(); }; im.src = src; }
    setTimeout(ready, 4000); // never hold the player hostage to a slow image
  })();
  route();
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
  HB.UI = { startBattle, startCampaign, quickBattle, spectateBattle, show, toast, pikesVsCharge };
  G.__tb = {
    HB, BR, CP, R, MV,
    quick: quickBattle, spectate: spectateBattle, preset: pikesVsCharge, loadSaved, SAVE, SAVE_V, campaign: (humans, seed) => startCampaign({ humans, seed }), host: hostRoom, join: joinRoom,
    // advance the running battle by `sec` simulated seconds (tests)
    start() { startFight(); BR.introT = 0; },
    ff(sec) { if (BR.deploy) startFight(); BR.introT = 0; const b = BR.b; if (!b || BR.lock) return; let n = Math.round(sec / W.DT); while (n-- > 0 && !b.over) b.step(); },
    screen: () => screen,
    endTurn: () => $('bEnd').click(),
  };
})(window);
