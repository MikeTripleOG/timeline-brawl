/* Timeline Brawl v3 — match setup: AI drafts, deployment layout, featured battles, army codes, #watch links. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const { cos, sin } = HB.dmath;

  const costOf = (fac, i) => { const ro = fac.roster[i]; return ro.cost || HB.TYPES[ro.t].cost; };
  HB.costOf = costOf;
  HB.BUDGETS = [600, 1000, 1500];
  HB.MAX_REGS = 12;

  // Draft plans per culture: roster indices in priority order (repeated as budget allows).
  const PLANS = {
    rome:     [0, 0, 1, 2, 3, 0, 4, 1, 0, 3, 5, 2],
    sparta:   [0, 1, 2, 3, 1, 4, 0, 2, 1, 3, 4, 0],
    macedon:  [0, 2, 0, 3, 1, 4, 0, 2, 5, 3, 1, 4],
    carthage: [0, 1, 2, 3, 4, 5, 1, 2, 3, 0, 4, 1],
    celts:    [0, 1, 2, 0, 3, 4, 5, 0, 2, 3, 0, 4],
    vikings:  [0, 1, 2, 3, 0, 2, 3, 0, 1, 2, 3, 0],
    mongols:  [0, 0, 1, 2, 0, 3, 1, 4, 0, 2, 3, 1],
    samurai:  [0, 1, 2, 3, 1, 4, 0, 2, 1, 3, 4, 2],
    aztec:    [0, 1, 2, 3, 4, 5, 2, 0, 3, 1, 2, 4],
    zulu:     [0, 1, 0, 2, 1, 3, 0, 2, 1, 0, 2, 3],
  };
  function draft(facId, budget, rnd) {
    const fac = HB.FACTION[facId]; const plan = PLANS[facId] || fac.roster.map((_, i) => i);
    const picks = []; let left = budget, guard = 0, i = 0;
    const jitter = rnd ? Math.floor(rnd() * 3) : 0;
    while (picks.length < HB.MAX_REGS && guard++ < 60) {
      const ix = plan[(i + (i > 2 ? jitter : 0)) % plan.length]; i++;
      const c = costOf(fac, ix);
      if (c <= left) { picks.push(ix); left -= c; }
      else { // try anything cheaper
        let cheap = -1; for (let k = 0; k < (fac.siege0 || fac.roster.length); k++) if (costOf(fac, k) <= left && (cheap < 0 || costOf(fac, k) > costOf(fac, cheap))) cheap = k;
        if (cheap < 0) break; picks.push(cheap); left -= costOf(fac, cheap);
      }
    }
    return picks;
  }
  HB.draft = draft;
  HB.armyCost = (facId, picks) => picks.reduce((a, i) => a + costOf(HB.FACTION[facId], i), 0);

  // Lay a list of roster picks out in a zone: skirmishers in front, the battle line, archers behind, horse on the wings, engines at the back.
  function layout(facId, picks, zone) {
    const fac = HB.FACTION[facId];
    const fx = cos(zone.f), fy = sin(zone.f), px = -fy, py = fx;
    const cx = (zone.x0 + zone.x1) / 2, cy = (zone.y0 + zone.y1) / 2;
    const depth = Math.abs(fx) > 0.5 ? zone.x1 - zone.x0 : zone.y1 - zone.y0;
    const span = Math.abs(fx) > 0.5 ? zone.y1 - zone.y0 : zone.x1 - zone.x0;
    const rows = { skirm: [], line: [], back: [], wing: [], siege: [] };
    picks.forEach((ix) => {
      const ro = fac.roster[ix], T = HB.TYPES[ro.t];
      const row = T.ram || T.tower ? 'skirm' : T.cls === 'sie' ? 'siege' : T.cls === 'cav' ? 'wing' : T.cls === 'msl' ? (T.skirm ? 'skirm' : 'back') : 'line';
      rows[row].push(ix);
    });
    const width = (ix) => { const ro = fac.roster[ix], T = HB.TYPES[ro.t]; const r = { def: T, n: T.men, form: T.forms[0] }; HB.geom(r); return r.W; };
    const out = [];
    const place = (list, d, lat0, gap) => {
      let tot = 0; for (const ix of list) tot += width(ix) + gap;
      const sc = tot > span - 20 ? (span - 20) / tot : 1;
      let off = -tot * sc / 2;
      for (const ix of list) { const w = width(ix); const l = lat0 + off + (w + gap) * sc / 2; off += (w + gap) * sc;
        out.push({ r: ix, x: Math.round(cx + fx * d + px * l), y: Math.round(cy + fy * d + py * l) }); }
      return tot * sc;
    };
    // if the line plus wings is too wide, move cavalry behind the line
    const lineW = rows.line.reduce((a, ix) => a + width(ix) + 8, 0);
    const wingW = rows.wing.reduce((a, ix) => a + width(ix) + 8, 0);
    if (lineW + wingW > span - 20 && rows.line.length) {
      const L = place(rows.line, depth * 0.08, 0, 8);
      const half = Math.max(1, Math.ceil(rows.wing.length / 2));
      const left = rows.wing.slice(0, half), right = rows.wing.slice(half);
      place(left, -depth * 0.3, -Math.min(span / 2 - 60, L / 2), 6); if (right.length) place(right, -depth * 0.3, Math.min(span / 2 - 60, L / 2), 6);
    } else {
      const L = place(rows.line, depth * 0.08, 0, 8);
      const half = Math.ceil(rows.wing.length / 2);
      let offL = -L / 2 - 12, offR = L / 2 + 12;
      rows.wing.forEach((ix, k) => { const w = width(ix); let l; if (k < half) { l = offL - w / 2; offL -= w + 8; } else { l = offR + w / 2; offR += w + 8; }
        out.push({ r: ix, x: Math.round(cx + fx * depth * 0.08 + px * l), y: Math.round(cy + fy * depth * 0.08 + py * l) }); });
    }
    place(rows.skirm, depth * 0.36, 0, 30);
    place(rows.back, -depth * 0.16, 0, 14);
    place(rows.siege, -depth * 0.4, 0, 40);
    // clamp into the zone
    for (const e of out) { e.x = Math.max(zone.x0 + 8, Math.min(zone.x1 - 8, e.x)); e.y = Math.max(zone.y0 + 8, Math.min(zone.y1 - 8, e.y)); }
    return out;
  }
  HB.layout = layout;

  // ----- matches -----
  // m = { seed, budget, weather, terrain, sides: [{ faction, cmd, name, picks?, army? }] }
  function makeMatch(o) {
    const seed = (o.seed >>> 0) || 1;
    const rnd = HB.makeRng((seed * 2654435761) >>> 0);
    const n = Math.max(2, Math.min(4, o.sides.length));
    const zones = o.siege ? HB.siegeZones(o.siege) : HB.zonesFor(n);
    const budget = o.budget || 1000;
    const sides = o.sides.slice(0, n).map((s, i) => {
      const picks = s.picks && s.picks.length ? s.picks.slice(0, HB.MAX_REGS) : draft(s.faction, budget, rnd);
      const army = s.army || layout(s.faction, picks, zones[i]);
      if (s.hp && !s.army) { // layout keeps pick order inside each row; map hp by consuming picks of the same roster index in order
        const used = {}; for (const e of army) { const idxs = []; picks.forEach((p, j) => { if (p === e.r) idxs.push(j); }); const u = used[e.r] || 0; used[e.r] = u + 1; const j = idxs[u]; if (j != null && s.hp[j] != null && s.hp[j] < 100) e.h = s.hp[j]; e.pi = j; }
      }
      return { faction: s.faction, cmd: s.cmd || 'ai', name: s.name || HB.FACTION[s.faction].name, picks, army, color: s.color, oath: s.oath, vengeOn: s.vengeOn };
    });
    return { v: 3, seed, budget, weather: o.weather || 'clear', terrain: o.siege ? 'siege' : o.terrain || '', title: o.title || '', tmax: o.tmax || 0, siege: o.siege || null, wrath: o.wrath ? 1 : 0, sides };
  }
  HB.makeMatch = makeMatch;
  function battleFor(m, extra) {
    return new HB.Battle(Object.assign({ seed: m.seed, weather: m.weather, terrain: m.terrain, title: m.title, tmax: m.tmax || 0, siege: m.siege || null, wrath: m.wrath || 0,
      armies: m.sides.map(s => s.army), factions: m.sides.map(s => ({ faction: s.faction, cmd: s.cmd, name: s.name, oath: s.oath, vengeOn: s.vengeOn, color: s.color })) }, extra || {}));
  }
  HB.battleFor = battleFor;

  HB.FEATURED = [
    { id: 'cannae', name: 'Cannae, 216 BC', sub: 'Carthage vs Rome', blurb: 'Hannibal wraps the legions. Can Rome break the centre first?', sides: ['carthage', 'rome'], terrain: 'open', weather: 'clear' },
    { id: 'pydna', name: 'Pydna, 168 BC', sub: 'Macedon vs Rome', blurb: 'The phalanx is unbeatable from the front, until the ground breaks it.', sides: ['macedon', 'rome'], terrain: 'river', weather: 'clear' },
    { id: 'steppe', name: 'Steppe vs Shield wall', sub: 'Mongols vs Vikings', blurb: 'Feigned retreats against locked shields.', sides: ['mongols', 'vikings'], terrain: 'open', weather: 'clear' },
    { id: 'kami', name: 'The Divine Wind', sub: 'Samurai vs Mongols', blurb: 'Hakata Bay: the kami wind against the horde.', sides: ['samurai', 'mongols'], terrain: 'open', weather: 'rain' },
    { id: 'spearwall', name: 'Spear vs Horn', sub: 'Sparta vs Zulu', blurb: "The hoplite wall meets Shaka's buffalo horns.", sides: ['sparta', 'zulu'], terrain: 'open', weather: 'clear' },
    { id: 'jungle', name: 'Sun and Fog', sub: 'Aztec vs Celts', blurb: 'Jaguar warriors charge into druid fog.', sides: ['aztec', 'celts'], terrain: 'woods', weather: 'clear' },
  ];

  // ----- army codes: faction + roster indices, e.g. "rome-0013245" -----
  HB.armyCode = (facId, picks) => facId + '-' + picks.map(i => i.toString(36)).join('');
  HB.parseArmyCode = (code) => {
    const m = /^\s*([a-z]+)-([0-9a-z]{1,12})\s*$/i.exec(code || ''); if (!m) return null;
    const fac = HB.FACTION[m[1].toLowerCase()]; if (!fac) return null;
    const picks = m[2].toLowerCase().split('').map(c => parseInt(c, 36));
    if (picks.some(i => !(i >= 0 && i < fac.roster.length))) return null;
    return { faction: fac.id, picks };
  };

  // ----- #watch=  base64url(JSON) replay links -----
  const b64e = (s) => { const b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'); return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64d = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); };
  HB.b64e = b64e; HB.b64d = b64d;
  // compact: armies are re-derived from picks (layout is deterministic) unless the player moved them
  HB.encodeWatch = (m, cmds) => {
    const z = m.siege ? HB.siegeZones(m.siege) : HB.zonesFor(m.sides.length);
    const sides = m.sides.map((s, i) => {
      const def = layout(s.faction, s.picks, z[i]);
      const same = def.length === s.army.length && def.every((e, k) => e.r === s.army[k].r && e.x === s.army[k].x && e.y === s.army[k].y && s.army[k].f == null && s.army[k].h == null && !s.army[k].m);
      return [s.faction, s.cmd, s.picks.map(i => i.toString(36)).join(''), same ? 0 : s.army.map(e => { const a = [e.r, e.x, e.y]; if (e.h != null || e.f != null || e.m) a.push(e.h != null ? e.h : 100); if (e.f != null || e.m) a.push(e.f != null ? Math.round(e.f * 1000) / 1000 : null, e.m || 0); return a; }), s.name, s.color || 0, s.oath ? 1 : 0, s.vengeOn != null ? s.vengeOn : -1];
    });
    const c = (cmds || []).map(x => { const o = Object.assign({}, x); return o; });
    return b64e(JSON.stringify({ v: 3, s: m.seed, b: m.budget, w: m.weather, t: m.terrain, n: m.title || 0, x: m.tmax || 0, g: m.siege || 0, r: m.wrath ? 1 : 0, d: sides, c }));
  };
  HB.decodeWatch = (str) => {
    try {
      const o = JSON.parse(b64d(str)); if (!o || o.v !== 3) return null;
      const z = o.g ? HB.siegeZones(o.g) : HB.zonesFor(o.d.length);
      const sides = o.d.map((d, i) => { const picks = d[2].split('').map(c => parseInt(c, 36));
        return { faction: d[0], cmd: d[1], picks, name: d[4] || HB.FACTION[d[0]].name, color: d[5] || undefined, oath: !!d[6], vengeOn: d[7] >= 0 ? d[7] : undefined,
          army: d[3] ? d[3].map(a => { const e = { r: a[0], x: a[1], y: a[2] }; if (a.length > 3) e.h = a[3]; if (a[4] != null) e.f = a[4]; if (a[5]) e.m = a[5]; return e; }) : layout(d[0], picks, z[i]) }; });
      return { m: { v: 3, seed: o.s, budget: o.b, weather: o.w, terrain: o.t, title: o.n || '', tmax: o.x || 0, siege: o.g || null, wrath: o.r || 0, sides }, cmds: o.c || [] };
    } catch (e) { return null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
