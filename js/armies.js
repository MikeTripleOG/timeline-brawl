/* Timeline Brawl — featured matchups, army layout and AI drafting (no DOM). */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const { W, H } = HB.WORLD;
  HB.FEATURED = [
    { id: 'spartans-seals', title: '300 Spartans vs 10 Navy SEALs', blurb: 'Bronze shields vs 1,600 rounds. Can the phalanx close the distance?', a: [['spartan', 300]], b: [['seal', 10]] },
    { id: 'legion-abrams', title: '5,000 Legionaries vs 1 Abrams', blurb: 'Testudo vs the M1. It all comes down to how many shells are in the rack.', a: [['legion', 5000]], b: [['abrams', 1]] },
    { id: 'mongols-mg', title: 'Mongol Horse Archers vs WW1 MG Trench', blurb: '400 riders vs 6 machine guns. Feigned retreat meets the Maxim gun.', a: [['mongol', 400]], b: [['mgnest', 6]] },
    { id: 'chariots-apache', title: '2,000 Chariots vs 1 Apache', blurb: 'Same price tag. What happens when the Apache runs dry?', a: [['chariot', 2000]], b: [['apache', 1]] },
    { id: 'samurai-p51', title: '310 Samurai vs a P-51 Mustang', blurb: 'Strafing runs vs the divine wind.', a: [['samurai', 310]], b: [['p51', 1]] },
    { id: 'agincourt', title: 'Longbowmen + Pikes vs Knights & Hussars', blurb: 'Agincourt rematch with Polish wings on the guest list.', a: [['longbow', 300], ['pikemen', 150]], b: [['knight', 80], ['hussar', 40]] },
  ];
  HB.FEATURED.forEach(f => {
    f.cost = [f.a, f.b].map(arr => arr.reduce((s, [id, n]) => s + HB.UNIT[id].cost * n, 0));
  });
  function formationSize(def, count, maxW) {
    const sp = Math.max(3.6, def.rad * 2.3);
    let cols = Math.max(1, Math.ceil(Math.sqrt(count * 2.2)));
    if (maxW) cols = Math.max(1, Math.min(cols, Math.floor(maxW / sp)));
    const rows = Math.ceil(count / cols);
    return { w: cols * sp, h: rows * sp };
  }
  HB.formationSize = formationSize;
  HB.ZONES = HB.zonesFor(2);
  // entries: [{type,count}] -> adds integer x,y inside the side's deployment zone
  HB.layoutArmy = function (entries, side, nF) {
    nF = nF || 2;
    const z = HB.zonesFor(nF)[side];
    const zw = z.x1 - z.x0, maxW = nF > 2 ? zw - 6 : 0, cx0 = (z.x0 + z.x1) / 2;
    const front = [], back = [];
    for (const e of entries) {
      const d = HB.UNIT[e.type];
      e.fs = formationSize(d, e.count, maxW);
      (['Ranged', 'Siege', 'Air', 'Item'].includes(d.role) && d.id !== 'trojan' ? back : front).push(e);
    }
    const rows = [];
    const pack = (list) => {
      let row = [], wsum = 0;
      for (const e of list) {
        if (row.length && wsum + e.fs.w + 8 > zw - 10) { rows.push(row); row = []; wsum = 0; }
        row.push(e); wsum += e.fs.w + 8;
      }
      if (row.length) rows.push(row);
    };
    pack(front); pack(back);
    const bottom = (z.y0 + z.y1) / 2 > H / 2;
    const frontY = bottom ? z.y0 : z.y1, dir = bottom ? 1 : -1;
    let off = 6;
    for (const row of rows) {
      const hmax = Math.max(...row.map(e => e.fs.h));
      const wsum = row.reduce((s, e) => s + e.fs.w + 8, -8);
      let x = cx0 - wsum / 2;
      for (const e of row) {
        e.x = Math.max(z.x0 + e.fs.w / 2 + 3, Math.min(z.x1 - e.fs.w / 2 - 3, x + e.fs.w / 2));
        e.y = frontY + dir * (off + e.fs.h / 2);
        x += e.fs.w + 8;
      }
      off += hmax + 8;
    }
    for (const e of entries) {
      e.y = Math.max(z.y0 + Math.min(e.fs.h / 2, 120), Math.min(z.y1 - Math.min(e.fs.h / 2, 120), e.y));
      e.x = Math.round(e.x); e.y = Math.round(e.y);
    }
    return entries;
  };
  HB.featuredArmies = function (f) {
    return [f.a, f.b].map((arr, side) => HB.layoutArmy(arr.map(([type, count]) => ({ type, count })), side, 2));
  };
  HB.armyCost = (entries) => entries.reduce((s, e) => s + HB.UNIT[e.type].cost * e.count, 0);
  HB.draftable = (u) => !u.hidden;
  // AI draft: pick 1-4 unit types and spend the budget in packs (rand must be seeded for replays)
  HB.aiDraft = function (budget, rand) {
    rand = rand || HB.makeRng(Date.now() & 0xffff);
    const pool = HB.UNITS.filter(u => !u.hidden && !u.item);
    const out = {};
    let left = budget;
    const k = 1 + Math.floor(rand() * 4);
    const picks = [];
    for (let t = 0; t < 40 && picks.length < k; t++) {
      const u = pool[Math.floor(rand() * pool.length)];
      if (u.cost * u.pack <= left && !picks.includes(u)) picks.push(u);
    }
    if (budget >= 15000 && rand() < 0.25) { out.nuke = 1; left -= HB.UNIT.nuke.cost; }
    if (!picks.length) picks.push(HB.UNIT.legion);
    picks.sort((a, b) => b.cost * b.pack - a.cost * a.pack);
    for (const u of picks) if (u.cost * u.pack >= 1000 && left >= u.cost * u.pack) { out[u.id] = (out[u.id] || 0) + u.pack; left -= u.cost * u.pack; }
    fill(out, picks, left, rand);
    return toEntries(out);
  };
  function fill(out, picks, left, rand) {
    let guard = 0;
    while (guard++ < 2000) {
      const afford = picks.filter(u => u.cost * u.pack <= left && u.cost * u.pack < 1000);
      if (!afford.length) break;
      const u = afford[Math.floor(rand() * afford.length)];
      out[u.id] = (out[u.id] || 0) + u.pack; left -= u.cost * u.pack;
    }
    const cheap = [HB.UNIT.legion, HB.UNIT.spartan, HB.UNIT.pikemen];
    for (const u of cheap) while (left >= u.cost * u.pack) { out[u.id] = (out[u.id] || 0) + u.pack; left -= u.cost * u.pack; }
    return left;
  }
  function toEntries(out) { return Object.keys(out).map(type => ({ type, count: out[type] })); }
  // Commander personalities
  HB.commanderDraft = function (cmd, budget, rand) {
    if (cmd === 'remi') {
      // huge ancient swarms
      const pool = HB.UNITS.filter(u => !u.hidden && !u.item && u.era === 0 && u.cost <= 30);
      const out = {}; const picks = [HB.UNIT.legion];
      for (let t = 0; t < 20 && picks.length < 3; t++) { const u = pool[Math.floor(rand() * pool.length)]; if (!picks.includes(u)) picks.push(u); }
      let left = budget;
      const main = picks[0], mainB = Math.floor(budget * 0.45 / (main.cost * main.pack)) * main.cost * main.pack;
      out[main.id] = mainB / main.cost; left -= mainB;
      fill(out, picks, left, rand);
      return toEntries(out);
    }
    if (cmd === 'gamedev') {
      // tech + lore combos, with an item that breaks the game
      const out = {}; let left = budget;
      if (budget >= 20000 && rand() < 0.6) { out.darkemp = 1; left -= HB.UNIT.darkemp.cost; }
      else if (budget >= 9000) { out.nuke = 1; left -= HB.UNIT.nuke.cost; }
      if (left >= 5000 && !out.nuke && rand() < 0.5) { out.nuke = 1; left -= HB.UNIT.nuke.cost; }
      const pool = HB.UNITS.filter(u => !u.hidden && !u.item && u.era >= 3 && u.lore);
      const picks = [];
      for (let t = 0; t < 40 && picks.length < 3; t++) { const u = pool[Math.floor(rand() * pool.length)]; if (!picks.includes(u) && u.cost * u.pack <= left) picks.push(u); }
      picks.sort((a, b) => b.cost * b.pack - a.cost * a.pack);
      for (const u of picks) if (u.cost * u.pack >= 1000 && left >= u.cost * u.pack) { out[u.id] = (out[u.id] || 0) + 1; left -= u.cost * u.pack; }
      fill(out, picks.length ? picks : [HB.UNIT.plasma], left, rand);
      return toEntries(out);
    }
    return HB.aiDraft(budget, rand);
  };
  HB.SPECTATE_NAMES = { remi: 'Remi', gamedev: 'Game Dev', ai: ['Khan', 'Ada', 'Nero', 'Joan'] };
  // Build a full deterministic match spec from a seed
  HB.makeMatch = function (o) {
    const seed = o.seed >>> 0, rand = HB.makeRng(seed ^ 0x5bd1e995);
    const cmds = o.cmds, nF = cmds.length, budget = o.budget || 20000;
    let ai = 0;
    const factions = cmds.map((c, i) => ({ name: (o.names && o.names[i]) || (c === 'remi' ? 'Remi' : c === 'gamedev' ? 'Game Dev' : c === 'human' ? 'You' : 'AI ' + HB.SPECTATE_NAMES.ai[ai++ % 4]), cmd: c }));
    const armies = cmds.map((c, i) => (o.armies && o.armies[i]) ? o.armies[i].map(e => ({ type: e.type, count: e.count })) : HB.commanderDraft(c, budget, rand));
    armies.forEach((a, i) => HB.layoutArmy(a, i, nF));
    return { seed, nF, budget, factions, armies, weather: o.weather || 'day', chaos: !!o.chaos };
  };
  // ---- share codes ----
  const b64e = (str) => { const b = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(str))) : Buffer.from(str, 'utf8').toString('base64'); return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const b64d = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return typeof atob === 'function' ? decodeURIComponent(escape(atob(s))) : Buffer.from(s, 'base64').toString('utf8'); };
  HB.armyCode = (entries) => 'TB-' + entries.map(e => e.type + '.' + e.count).join('_');
  HB.parseArmyCode = (code) => {
    code = String(code || '').trim().replace(/^.*TB-/, '');
    const out = [];
    for (const part of code.split('_')) { const m = /^([a-z0-9]+)\.(\d+)$/.exec(part); if (m && HB.UNIT[m[1]] && !HB.UNIT[m[1]].hidden) out.push({ type: m[1], count: Math.min(+m[2], 20000) }); }
    return out.length ? out : null;
  };
  // watch payload = seed + armies (+ placements) + recorded player commands → identical battle anywhere
  HB.encodeWatch = function (m, log) {
    const o = { v: 2, s: m.seed, w: m.weather, c: m.chaos ? 1 : 0, f: m.factions.map((f, i) => [f.name, f.cmd, m.armies[i].map(e => [e.type, e.count, Math.round(e.x), Math.round(e.y)])]) };
    if (m.ft) o.ft = m.ft;
    if (log && log.length) o.m = log.map(c => [c.k, c.c, c.s, c.x, c.y, c.t, c.a, c.b].map(v => v == null ? null : v));
    return b64e(JSON.stringify(o));
  };
  HB.decodeWatch = function (str) {
    const o = JSON.parse(b64d(str));
    const m = { seed: o.s >>> 0, weather: o.w || 'day', chaos: !!o.c, nF: o.f.length, ft: o.ft,
      factions: o.f.map(f => ({ name: String(f[0]).slice(0, 24), cmd: f[1] === 'human' ? 'human' : (HB.COMMANDERS[f[1]] ? f[1] : 'ai') })),
      armies: o.f.map(f => f[2].filter(e => HB.UNIT[e[0]]).map(e => ({ type: e[0], count: e[1] | 0, x: +e[2], y: +e[3] }))) };
    m.cmds = (o.m || []).map(a => { const c = { k: a[0], c: a[1] }; ['s', 'x', 'y', 't', 'a', 'b'].forEach((key, i) => { if (a[i + 2] != null) c[key] = a[i + 2]; }); return c; });
    return m;
  };
  // Build the Battle for a match (live or replay)
  HB.battleFor = function (m, extra) {
    return new HB.Battle(Object.assign({ armies: m.armies, seed: m.seed, weather: m.weather, chaos: m.chaos, nF: m.nF, factions: m.factions,
      human: m.factions.map(f => f.cmd === 'human') }, extra || {}));
  };
})(typeof window !== 'undefined' ? window : globalThis);
