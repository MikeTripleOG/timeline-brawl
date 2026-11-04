/* Timeline Brawl v3 — "The Five Crowns" campaign: five kingdoms and a crimson Invader on a parchment map.
   Pure, deterministic and JSON-serialisable so the online host can broadcast state and guests can hash-check it. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const KINGDOMS = [
    { id: 'eldenvale', name: 'Eldenvale', culture: 'celts', color: '#3f7d3a', tint: '#6f9a4f', crest: 'tree', motto: 'Root and thorn' },
    { id: 'northgard', name: 'Northgard', culture: 'vikings', color: '#3b64a8', tint: '#8fb0d6', crest: 'wolf', motto: 'The cold remembers' },
    { id: 'solenthia', name: 'Solenthia', culture: 'macedon', color: '#c9962a', tint: '#e2bf5a', crest: 'sun', motto: 'The sun does not kneel' },
    { id: 'vellorien', name: 'Vellorien', culture: 'carthage', color: '#6d3f9a', tint: '#a07cc4', crest: 'fleur', motto: 'Gold buys the sea' },
    { id: 'drakonia', name: 'Drakonia', culture: 'rome', color: '#b0302a', tint: '#d0614f', crest: 'lion', motto: 'Iron and law' },
    { id: 'invader', name: 'The Crimson Horde', culture: 'mongols', color: '#8e1020', tint: '#6e1022', crest: 'dragon', motto: 'Everything under the sky', invader: true },
  ];
  const INV = 5;
  // p: owner kingdom (-1 neutral); cap: capital (walled city -> sieges); x,y on a 1600x900 map
  const PROVS = [
    { name: 'Elden Keep', k: 0, cap: 1, x: 250, y: 600 }, { name: 'Thornwood', k: 0, x: 215, y: 340 },
    { name: 'Northgard', k: 1, cap: 1, x: 650, y: 165 }, { name: 'Frostmere', k: 1, x: 395, y: 160 },
    { name: 'Solenthia', k: 2, cap: 1, x: 640, y: 735 }, { name: 'Sunreach', k: 2, x: 455, y: 520 },
    { name: 'Vellorien', k: 3, cap: 1, x: 1060, y: 300 }, { name: 'Amethyst Vale', k: 3, x: 860, y: 175 },
    { name: 'Drakonia', k: 4, cap: 1, x: 1060, y: 715 }, { name: 'Emberfall', k: 4, x: 870, y: 590 },
    { name: 'The Crossroads', k: -1, x: 720, y: 445 }, { name: 'Eastern Hills', k: -1, x: 1265, y: 520, hills: 1 },
    { name: 'Ashen Pass', k: INV, x: 1275, y: 195 }, { name: 'Invader Camp', k: INV, camp: 1, x: 1465, y: 360 },
  ];
  const ROADS = [[0, 1], [0, 5], [1, 3], [1, 5], [3, 2], [2, 7], [2, 10], [5, 4], [5, 10], [4, 9], [9, 8], [9, 10], [7, 6], [7, 10], [6, 9], [6, 12], [6, 11], [8, 11], [11, 13], [12, 13], [9, 11]];
  const ADJ = PROVS.map(() => []); for (const [a, b] of ROADS) { ADJ[a].push(b); ADJ[b].push(a); }
  const CAMP = 13;
  const INCOME = (p) => p.cap ? 70 : p.camp ? 40 : 35;
  const SUPPLY_CAP = 120;
  HB.KINGDOMS = KINGDOMS; HB.PROVS = PROVS; HB.ROADS = ROADS; HB.ADJ = ADJ; HB.INV = INV; HB.CAMP = CAMP;

  function hashStr(s) { let h = 0x811c9dc5 | 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const fac = (f) => HB.FACTION[KINGDOMS[f].culture];
  function dist(from, pred) { // BFS hops over roads
    const d = PROVS.map(() => 99); const q = [from]; d[from] = 0;
    while (q.length) { const p = q.shift(); for (const n of ADJ[p]) if (d[n] > d[p] + 1 && (!pred || pred(n))) { d[n] = d[p] + 1; q.push(n); } }
    return d;
  }
  function pathStep(from, to, pred) { // next province on a shortest path
    const d = dist(to, pred); let best = -1;
    for (const n of ADJ[from]) if (d[n] < d[from] && (best < 0 || d[n] < d[best] || (d[n] === d[best] && n < best))) best = n;
    return best;
  }

  function create(o) {
    const seed = (o.seed >>> 0) || 1, rnd = HB.makeRng(seed);
    const seats = KINGDOMS.map((k, i) => {
      const s = (o.seats && o.seats[i]) || {};
      return { cmd: s.cmd || 'ai', name: s.name || k.name, ai: s.ai || (i === INV ? (rnd() < 0.5 ? 'gamedev' : 'remi') : ['remi', 'gamedev', 'steady'][(seed + i) % 3]) };
    });
    const st = { v: 3, seed, turn: 1, maxTurns: o.maxTurns || 24, phase: 'orders', seats,
      owner: PROVS.map(p => p.k), gold: KINGDOMS.map((k, i) => i === INV ? 150 : 200), supply: KINGDOMS.map((k, i) => i === INV ? 78 : 90),
      armies: [], nextId: 1, treaties: [], offers: [], nextOffer: 1, levies: [], oath: KINGDOMS.map(() => 0), venge: KINGDOMS.map(() => -1),
      orders: {}, battles: [], log: [], over: false, winner: -1, envoys: [], last: null, coalition: [], intel: {}, grudge: {} };
    for (let k = 0; k < 5; k++) {
      const cap = PROVS.findIndex(p => p.k === k && p.cap);
      addArmy(st, k, cap, HB.draft(KINGDOMS[k].culture, 800, rnd));
      const town = PROVS.findIndex(p => p.k === k && !p.cap);
      addArmy(st, k, town, HB.draft(KINGDOMS[k].culture, 400, rnd));
    }
    st.owner[11] = INV;
    addArmy(st, INV, CAMP, HB.draft('mongols', 700, rnd));
    addArmy(st, INV, 12, HB.draft('mongols', 1000, rnd));
    addArmy(st, INV, 11, HB.draft('mongols', 900, rnd));
    log(st, 'The Crimson Horde has crossed the eastern mountains. Five crowns must stand together, or fall one by one.');
    return st;
  }
  function addArmy(st, f, p, picks, hp) {
    const ex = st.armies.find(a => a.f === f && a.p === p);
    if (ex) { for (let i = 0; i < picks.length && ex.picks.length < HB.MAX_REGS; i++) { ex.picks.push(picks[i]); ex.hp.push(hp ? hp[i] : 100); } return ex; }
    const a = { id: st.nextId++, f, p, picks: picks.slice(0, HB.MAX_REGS), hp: (hp || picks.map(() => 100)).slice(0, HB.MAX_REGS) };
    st.armies.push(a); return a;
  }
  function strength(st, a) { const F = fac(a.f); return a.picks.reduce((s, ix, i) => s + HB.costOf(F, ix) * a.hp[i] / 100, 0); }
  function log(st, text, f) { st.log.push({ t: st.turn, text, f: f == null ? -1 : f }); if (st.log.length > 60) st.log.shift(); }
  const tKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
  function treaty(st, a, b) { return st.treaties.find(t => t.key === tKey(a, b)); }
  function friendly(st, a, b) { if (a === b) return true; const t = treaty(st, a, b); return !!t && (t.kind === 'alliance' || t.until >= st.turn); }
  function capitalsHeldBy(st, f) { return PROVS.reduce((n, p, i) => n + (p.cap && st.owner[i] === f ? 1 : 0), 0); }
  function alive(st, f) { return st.armies.some(a => a.f === f) || st.owner.some(o => o === f); }

  // ---------- orders ----------
  // orders: [{k:'mv', a:armyId, to:prov} | {k:'rc', p:prov, r:rosterIdx} | {k:'of', to, kind:'alliance'|'tribute'|'truce', give:{gold,supply,land,levy}, truce} | {k:'rs', id, ok}]
  function submit(st, seat, orders) { st.orders[seat] = (orders || []).slice(0, 40); }
  function humanSeats(st) { return st.seats.map((s, i) => s.cmd !== 'ai' && alive(st, i) ? i : -1).filter(i => i >= 0); }
  function ready(st) { return humanSeats(st).every(i => st.orders[i]); }
  function validMove(st, a, to) { return a && ADJ[a.p].includes(to); }
  function recruitCost(st, f, r) { return HB.costOf(fac(f), r); }
  function canRecruit(st, f, p) { return st.owner[p] === f && (PROVS[p].cap || PROVS[p].camp || (f === INV && PROVS[p].k !== INV && PROVS[p].cap)); }

  // ---------- AI ----------
  function aiOrders(st, f, rnd) {
    const S = st.seats[f], style = S.ai, out = [];
    const mine = st.armies.filter(a => a.f === f);
    const foesAt = (p) => st.armies.filter(a => a.p === p && !friendly(st, f, a.f));
    const myStr = (p) => st.armies.filter(a => a.p === p && a.f === f).reduce((s, a) => s + strength(st, a), 0);
    const threat = (p) => ADJ[p].concat([p]).reduce((s, q) => s + foesAt(q).reduce((t, a) => t + strength(st, a), 0), 0);
    // respond to offers
    for (const o of st.offers.filter(o => o.to === f)) {
      const from = st.armies.filter(a => a.f === o.from).reduce((s, a) => s + strength(st, a), 0), me = mine.reduce((s, a) => s + strength(st, a), 0);
      let ok;
      if (st.grudge && st.grudge[f + ':' + o.from] >= st.turn) ok = false; // caught their spies recently
      else if (o.kind === 'coalition') ok = f !== INV && st.venge[f] !== o.from && (capitalsHeldBy(st, INV) > 0 || st.armies.filter(a => a.f === INV).reduce((t, a) => t + strength(st, a), 0) > me * 0.8 || rnd() < 0.5);
      else if (o.kind === 'alliance') ok = !friendly(st, f, o.from) && (f !== INV) && (o.from !== INV) && (style !== 'remi' || rnd() < 0.5) && (st.venge[f] !== o.from);
      else if (o.kind === 'truce') ok = from > me * 0.8 || rnd() < 0.4;
      else { const g = o.give || {}; const cost = (g.gold || 0) + (g.supply || 0) * 1.5 + (g.land >= 0 && g.land != null ? 150 : 0) + (g.levy || 0) * 2; ok = from > me * (style === 'remi' ? 1.6 : 1.25) && cost <= st.gold[f] + 200 && (g.gold || 0) <= st.gold[f] && (g.supply || 0) <= st.supply[f]; }
      out.push({ k: 'rs', id: o.id, ok: ok ? 1 : 0 });
    }
    const rival = (g) => !friendly(st, f, g);
    for (const a of mine) {
      const s = strength(st, a), here = PROVS[a.p];
      let to = -1;
      if (f === INV && a.p === CAMP && mine.filter(x => x.p !== CAMP).length) to = -1; // the camp guard stays home
      else if (f === INV) {
        // the horde: pick the weakest reachable capital, mind the supply line
        const lowSupply = st.supply[f] < 25;
        let best = -1, bs = -1e9;
        for (let i = 0; i < PROVS.length; i++) {
          if (st.owner[i] === f || !rival(st.owner[i] < 0 ? 99 : st.owner[i]) && st.owner[i] >= 0) continue;
          const d = dist(a.p)[i]; if (d > 8) continue;
          const def = foesAt(i).reduce((t, x) => t + strength(st, x), 0);
          const v = (PROVS[i].cap ? 900 : 260) - def * 0.8 - d * (lowSupply ? 260 : 90) + (style === 'remi' ? 200 : 0) - (dist(CAMP)[i] * (lowSupply ? 120 : 20));
          if (v > bs && (s > def * (style === 'gamedev' ? 1.25 : 0.9) || def === 0)) { bs = v; best = i; }
        }
        if (best >= 0 && best !== a.p) to = pathStep(a.p, best);
        // never walk into a truce partner unless scheming
        if (to >= 0) { const tg = foesAt(to); const ownerT = st.owner[to]; if (ownerT >= 0 && ownerT !== f && friendly(st, f, ownerT) && !(style === 'gamedev' && s > threat(to) * 1.8)) to = -1; void tg; }
      } else {
        const cap = PROVS.findIndex((p, i) => p.cap && st.owner[i] === f);
        const home = cap >= 0 ? cap : PROVS.findIndex(p => p.k === f && p.cap);
        const capArmies = st.armies.filter(x => x.f === f && x.p === home);
        const isGuard = capArmies.length && capArmies[0].id === a.id;
        if (isGuard && threat(home) > s * 0.7) to = -1; // hold the walls
        else {
          // attack adjacent enemies we can beat, retake our land, help allies, or march on the invader
          let best = -1, bs = 0;
          for (const n of ADJ[a.p]) {
            const en = foesAt(n).reduce((t, x) => t + strength(st, x), 0);
            const own = st.owner[n];
            let v = 0;
            if (en > 0 && s > en * (style === 'remi' ? 0.9 : 1.2)) v = 200 + en * 0.3 + (foesAt(n).some(x => x.f === INV) ? 300 : 0);
            else if (en === 0 && own >= 0 && own !== f && !friendly(st, f, own) && (own === INV || PROVS[n].k === f || (style === 'gamedev' && st.turn > 8) || st.venge[f] === own)) v = (PROVS[n].k === f ? 500 : 150) + (PROVS[n].cap ? 200 : 0);
            else if (en === 0 && own < 0) v = 120;
            if (style === 'gamedev' && own >= 0 && own !== f && own !== INV && friendly(st, f, own) && en < s * 0.4 && PROVS[n].cap && st.turn > 6) v = 700; // betrayal of a weak ally
            if (v > bs) { bs = v; best = n; }
          }
          if (best >= 0) to = best;
          else if (!isGuard && a.p !== home && threat(home) > myStr(home)) to = pathStep(a.p, home);
          else if (!isGuard && st.turn > 3) { const inv = st.armies.filter(x => x.f === INV).sort((x, y) => dist(a.p)[x.p] - dist(a.p)[y.p])[0]; if (inv && s > strength(st, inv) * 1.1) to = pathStep(a.p, inv.p); }
        }
        void here;
      }
      if (to >= 0) out.push({ k: 'mv', a: a.id, to });
    }
    // recruit
    const rp = PROVS.map((p, i) => i).filter(i => canRecruit(st, f, i));
    let gold = st.gold[f], guard = 0;
    while (rp.length && gold > 90 && guard++ < 6) {
      const p = rp.slice().sort((x, y) => threat(y) - threat(x))[0];
      const ix = HB.draft(KINGDOMS[f].culture, Math.min(gold, 200), rnd)[0]; if (ix == null) break;
      const c = recruitCost(st, f, ix); if (c > gold) break;
      out.push({ k: 'rc', p, r: ix }); gold -= c;
    }
    // envoys
    if (st.turn % 2 === f % 2 || f === INV) {
      if (f === INV) {
        // demand tribute from the kingdom nearest the horde's strongest army
        const big = mine.slice().sort((x, y) => strength(st, y) - strength(st, x))[0];
        if (big) {
          const vict = [0, 1, 2, 3, 4].filter(k => alive(st, k) && !friendly(st, f, k)).sort((x, y) => Math.min(...PROVS.map((p, i) => st.owner[i] === x ? dist(big.p)[i] : 99)) - Math.min(...PROVS.map((p, i) => st.owner[i] === y ? dist(big.p)[i] : 99)))[0];
          if (vict != null && !st.offers.some(o => o.from === f && o.to === vict) && rnd() < 0.6) {
            const land = PROVS.findIndex((p, i) => st.owner[i] === vict && !p.cap && ADJ[i].some(n => st.owner[n] === f));
            out.push({ k: 'of', to: vict, kind: 'tribute', give: { gold: Math.min(400, Math.max(100, Math.round(st.gold[vict] * 0.6 / 10) * 10)), supply: 20 + Math.round(rnd() * 4) * 10, land, levy: rnd() < 0.5 ? 50 : 0 }, truce: 4 + Math.floor(rnd() * 5) });
          }
        }
      } else {
        const partner = [0, 1, 2, 3, 4].filter(k => k !== f && alive(st, k) && !friendly(st, f, k) && st.venge[f] !== k).sort((x, y) => (x * 7 + st.turn) % 5 - (y * 7 + st.turn) % 5)[0];
        const co = st.coalition || [];
        const hordeBig = capitalsHeldBy(st, INV) > 0 || st.turn >= 4;
        if (partner != null && rnd() < 0.5) out.push({ k: 'of', to: partner, kind: hordeBig && !co.includes(partner) ? 'coalition' : 'alliance' });
      }
    }
    // spies: kingdoms watch the Horde's wagons; the Horde (and schemers) spy on the strongest crown
    if (st.gold[f] >= 260 && rnd() < (style === 'gamedev' ? 0.35 : 0.15)) {
      const tgt = f === INV ? [0, 1, 2, 3, 4].filter(k => alive(st, k)).sort((x, y) => st.gold[y] - st.gold[x])[0] : INV;
      if (tgt != null && alive(st, tgt)) out.push({ k: 'sp', to: tgt });
    }
    return out;
  }

  // ---------- resolution ----------
  function resolve(st) {
    if (st.over || st.phase !== 'orders') return st;
    const rnd = HB.makeRng(hashStr(st.seed + ':' + st.turn) || 1);
    for (let f = 0; f < 6; f++) if (st.seats[f].cmd === 'ai' && alive(st, f)) st.orders[f] = aiOrders(st, f, rnd);
    st.envoys = [];
    // 1. responses to last turn's offers
    for (let f = 0; f < 6; f++) for (const o of (st.orders[f] || [])) if (o.k === 'rs') respond(st, f, o.id, !!o.ok);
    st.offers = st.offers.filter(o => o.turn >= st.turn - 1 && !o.done);
    // 2. recruits
    for (let f = 0; f < 6; f++) for (const o of (st.orders[f] || [])) if (o.k === 'rc' && canRecruit(st, f, o.p)) {
      const F = fac(f); if (!(o.r >= 0 && o.r < (F.siege0 || F.roster.length))) continue;
      const c = recruitCost(st, f, o.r); if (c > st.gold[f]) continue;
      const ex = st.armies.find(a => a.f === f && a.p === o.p); if (ex && ex.picks.length >= HB.MAX_REGS) continue;
      st.gold[f] -= c; addArmy(st, f, o.p, [o.r]);
    }
    // 3. simultaneous moves (and betrayals)
    const moves = [];
    for (let f = 0; f < 6; f++) for (const o of (st.orders[f] || [])) if (o.k === 'mv' && !(f === INV && st.turn === 1)) { // the Horde spends turn 1 crossing the mountains
      const a = st.armies.find(x => x.id === o.a && x.f === f); if (validMove(st, a, o.to) && !moves.some(m => m.a === a)) moves.push({ a, to: o.to }); }
    for (const m of moves) {
      const own = st.owner[m.to], there = st.armies.filter(x => x.p === m.to && x.f !== m.a.f);
      for (const g of new Set(there.map(x => x.f).concat(own >= 0 && own !== m.a.f ? [own] : []))) if (friendly(st, m.a.f, g) && (there.some(x => x.f === g) || own === g) && (own === g)) betray(st, m.a.f, g);
      m.a.p = m.to; m.a.moved = 1;
    }
    for (let f = 0; f < 6; f++) for (const o of (st.orders[f] || [])) if (o.k === 'of') offer(st, f, o);
    for (let f = 0; f < 6; f++) { const o = (st.orders[f] || []).find(x => x.k === 'sp'); if (o) spy(st, f, o.to | 0); }
    // merge armies of a faction in one province
    mergeAll(st);
    // 4. an undefended capital (or the Horde camp) is not simply walked into: its city watch mans the walls
    for (let p = 0; p < PROVS.length; p++) {
      const own = st.owner[p]; if (own < 0 || !(PROVS[p].cap || PROVS[p].camp)) continue;
      const here = st.armies.filter(a => a.p === p); if (here.some(a => a.f === own) || !here.some(a => !friendly(st, a.f, own))) continue;
      const F = fac(own), cheap = F.roster.map((r, i) => i).filter(i => i < F.siege0).sort((x, y) => HB.costOf(F, x) - HB.costOf(F, y));
      addArmy(st, own, p, [cheap[0], cheap[0], cheap[1] != null ? cheap[1] : cheap[0], cheap[1] != null ? cheap[1] : cheap[0]], [85, 85, 85, 85]);
      log(st, `The city watch of ${PROVS[p].name} mans the walls.`, own);
    }
    // 5. battles
    st.battles = [];
    for (let p = 0; p < PROVS.length; p++) {
      const here = st.armies.filter(a => a.p === p); const fs = [...new Set(here.map(a => a.f))];
      if (fs.length < 2) continue;
      if (!fs.some((x, i) => fs.some((y, j) => j > i && !friendly(st, x, y)))) continue;
      // defender first: the province owner if present
      const own = st.owner[p]; fs.sort((x, y) => (y === own) - (x === own) || strength(st, here.find(a => a.f === y)) - strength(st, here.find(a => a.f === x)));
      const sides = fs.slice(0, 4);
      const siege = !!(PROVS[p].cap || PROVS[p].camp) && sides[0] === own && sides.length === 2;
      st.battles.push({ p, sides, siege, done: false, human: sides.some(f => st.seats[f].cmd !== 'ai'), seed: hashStr(st.seed + ':' + st.turn + ':' + p) || 1 });
    }
    st.phase = 'battles';
    for (const b of st.battles) if (!b.human) finishBattle(st, b, autoResolve(st, b));
    if (st.phase === 'battles' && st.battles.every(b => b.done)) endTurn(st);
    return st;
  }
  function respond(st, f, id, ok) {
    const o = st.offers.find(x => x.id === id && x.to === f && !x.done); if (!o) return;
    o.done = 1;
    const A = KINGDOMS[o.from].name, B = KINGDOMS[f].name;
    if (!ok) { log(st, `${B} refused the ${o.kind === 'tribute' ? 'Treaty of Tribute' : o.kind === 'coalition' ? 'call to the Coalition' : o.kind} offered by ${A}.`, f); return; }
    if (o.kind === 'alliance') { setTreaty(st, o.from, f, 'alliance', 99); log(st, `${A} and ${B} swear an alliance.`, f); return; }
    if (o.kind === 'coalition') { // every member is allied with every other member
      const co = st.coalition = st.coalition || [];
      for (const m of [o.from, f]) if (!co.includes(m)) co.push(m);
      for (const a of co) for (const b of co) if (a < b) setTreaty(st, a, b, 'alliance', 99);
      log(st, `${B} joins ${A} in the Coalition against the Horde (${co.map(m => KINGDOMS[m].name).join(', ')}).`, f); return; }
    const g = o.give || {};
    if (g.gold) { const x = Math.min(g.gold, st.gold[f]); st.gold[f] -= x; st.gold[o.from] += x; }
    if (g.supply) { const x = Math.min(g.supply, st.supply[f]); st.supply[f] -= x; st.supply[o.from] = Math.min(SUPPLY_CAP, st.supply[o.from] + x); }
    if (g.land != null && g.land >= 0 && st.owner[g.land] === f && !PROVS[g.land].cap) {
      st.owner[g.land] = o.from;
      const cap = PROVS.findIndex((p, i) => p.cap && st.owner[i] === f);
      for (const a of st.armies) if (a.f === f && a.p === g.land) { if (cap >= 0) a.p = cap; }
      mergeAll(st);
    }
    if (g.levy) st.levies.push({ f: o.from, at: st.turn + 3, men: g.levy, from: f });
    setTreaty(st, o.from, f, 'truce', o.truce || 4);
    log(st, `${B} accepted the ${o.kind === 'tribute' ? 'Treaty of Tribute' : 'truce'} with ${A}${o.truce ? ' — truce for ' + o.truce + ' turns' : ''}.`, f);
  }
  // spies: 60 gold. Success = a 3-turn report on the target (gold, supply, armies) and, against the Horde, burnt wagons.
  // Caught = the target refuses your envoys for 3 turns.
  const SPY_COST = 60;
  function spy(st, f, to) {
    if (to === f || !(to >= 0 && to < 6) || !alive(st, to) || st.gold[f] < SPY_COST) return;
    st.gold[f] -= SPY_COST; st.intel = st.intel || {}; st.grudge = st.grudge || {};
    const rnd = HB.makeRng(hashStr(st.seed + ':spy:' + st.turn + ':' + f + ':' + to) || 1);
    const A = KINGDOMS[f].name, B = KINGDOMS[to].name;
    if (rnd() < 0.7) {
      st.intel[f + ':' + to] = st.turn + 3;
      if (to === INV) { st.supply[INV] = Math.max(0, st.supply[INV] - 20); log(st, `${A}'s spies fire the Horde's supply wagons (−20 supply).`, f); }
      else log(st, `${A}'s spies slip into ${B}.`, f);
    } else { st.grudge[to + ':' + f] = st.turn + 3; log(st, `${B} hangs a spy sent by ${A}. No envoys from ${A} will be heard for 3 turns.`, to); }
  }
  function setTreaty(st, a, b, kind, turns) {
    st.treaties = st.treaties.filter(t => t.key !== tKey(a, b));
    st.treaties.push({ key: tKey(a, b), a, b, kind, until: st.turn + turns });
  }
  function betray(st, f, victim) {
    st.treaties = st.treaties.filter(t => t.key !== tKey(f, victim));
    st.oath[f] = 1; st.venge[victim] = f; if (st.coalition) st.coalition = st.coalition.filter(m => m !== f);
    log(st, `BETRAYAL! ${KINGDOMS[f].name} breaks its oath and attacks ${KINGDOMS[victim].name}. The gods mark the Oathbreaker.`, f);
  }
  function offer(st, f, o) {
    if (!(o.to >= 0 && o.to < 6) || o.to === f || !alive(st, o.to)) return;
    if (st.offers.some(x => x.from === f && x.to === o.to && !x.done)) return;
    const give = o.give ? { gold: Math.max(0, Math.min(1000, o.give.gold | 0)), supply: Math.max(0, Math.min(120, o.give.supply | 0)), land: o.give.land == null ? -1 : o.give.land | 0, levy: Math.max(0, Math.min(200, o.give.levy | 0)) } : null;
    const x = { id: st.nextOffer++, from: f, to: o.to, kind: ['alliance', 'tribute', 'truce', 'coalition'].includes(o.kind) && !(o.kind === 'coalition' && (f === INV || o.to === INV)) ? o.kind : 'truce', give, truce: Math.max(0, Math.min(12, o.truce | 0)), turn: st.turn };
    st.offers.push(x);
    // an envoy rides from the sender's capital (or camp) to the receiver's capital
    const fromP = PROVS.findIndex((p, i) => (p.cap || p.camp) && st.owner[i] === f), toP = PROVS.findIndex((p, i) => p.cap && st.owner[i] === o.to);
    if (fromP >= 0 && toP >= 0) st.envoys.push({ f, a: fromP, b: toP });
    log(st, `${KINGDOMS[f].name} sends an envoy to ${KINGDOMS[o.to].name}: ${x.kind === 'tribute' ? 'a Treaty of Tribute' : x.kind === 'coalition' ? 'join the Coalition against the Horde' : x.kind}.`, f);
  }
  function mergeAll(st) {
    const keep = [];
    for (const a of st.armies) { const ex = keep.find(k => k.f === a.f && k.p === a.p); if (ex) { for (let i = 0; i < a.picks.length && ex.picks.length < HB.MAX_REGS; i++) { ex.picks.push(a.picks[i]); ex.hp.push(a.hp[i]); } } else keep.push(a); }
    st.armies = keep;
  }
  // build the battle match for a campaign battle; humanSides lists campaign factions played by people
  function battleMatch(st, bt, cmdOf) {
    const p = PROVS[bt.p];
    const sides = bt.sides.map(f => {
      const a = st.armies.find(x => x.f === f && x.p === bt.p);
      let picks = a.picks.slice(), hp = a.hp.slice();
      const F = fac(f);
      if (bt.siege && f !== bt.sides[0] && F.siege0) { picks = picks.slice(0, HB.MAX_REGS - 3).concat([F.siege0, F.siege0 + 1, F.siege0 + 2]); hp = hp.slice(0, HB.MAX_REGS - 3).concat([100, 100, 100]); }
      return { faction: KINGDOMS[f].culture, cmd: cmdOf ? cmdOf(f) : (st.seats[f].ai === 'steady' ? 'ai' : st.seats[f].ai), name: KINGDOMS[f].name, picks, hp, color: KINGDOMS[f].color, oath: !!st.oath[f], vengeOn: -1, cf: f };
    });
    // vengeance: the betrayed side gets the morale/faith boost against the oathbreaker if both fight here
    sides.forEach((s, i) => { const v = st.venge[s.cf]; const j = sides.findIndex(x => x.cf === v); if (j >= 0) s.vengeOn = j; });
    const title = bt.siege ? (p.camp ? 'Assault on the ' + p.name : 'Siege of ' + p.name) : 'Battle of ' + p.name;
    const weather = ['clear', 'clear', 'rain', 'fog', 'clear', 'wind'][bt.seed % 6];
    const terrain = p.hills ? 'hills' : ['open', 'river', 'woods', 'hills', 'river'][bt.seed % 5];
    const m = HB.makeMatch({ seed: bt.seed, sides, title, weather, terrain: bt.siege ? 'siege' : terrain, tmax: bt.siege ? 420 : 300,
      siege: bt.siege ? { def: 0, rings: p.camp ? 2 : 3, name: p.name, relief: reliefFor(st, bt) } : null });
    m.cf = sides.map(s => s.cf);
    return m;
  }
  function reliefFor(st, bt) { // an allied or own army next door marches to break the siege
    const d = bt.sides[0];
    for (const n of ADJ[bt.p]) { const a = st.armies.find(x => x.p === n && (x.f === d || (friendly(st, x.f, d) && !bt.sides.includes(x.f))) && x.picks.length); if (a && a.f === d) return { side: 0, t: 90, edge: PROVS[n].x < PROVS[bt.p].x ? 'left' : 'right', picks: a.picks.slice(0, 6), from: a.id }; }
    return null;
  }
  function autoResolve(st, bt) {
    const m = battleMatch(st, bt);
    const b = HB.battleFor(m); let guard = 0;
    while (!b.over && guard++ < 20 * 600) b.step();
    return battleResult(st, bt, m, b);
  }
  // map a finished battle back onto campaign armies: per side survivors (hp per pick), winner faction
  function battleResult(st, bt, m, b) {
    const res = { winner: b.winner >= 0 && b.winner < m.cf.length ? m.cf[b.winner] : -1, hp: {}, t: Math.round(b.t), siege: b.siegeResult || '', title: m.title };
    m.sides.forEach((s, i) => {
      const regs = b.regs.filter(r => r.side === i && !r.relief);
      const hp = s.picks.map(() => 0);
      s.army.forEach((e, k) => { const r = regs[k]; if (!r || e.pi == null) return; const alive = r.st === 2 || r.n <= 0.5 ? 0 : r.n / r.n0 * 100 * (r.st === 1 ? 0.7 : 1); hp[e.pi] = Math.round(alive); });
      res.hp[s.cf] = hp;
    });
    if (bt.siege && m.siege.relief) { const rl = b.regs.filter(r => r.side === 0 && r.relief); res.relief = { id: m.siege.relief.from, hp: rl.map(r => r.st === 2 ? 0 : Math.round(r.n / r.n0 * 100)) }; }
    return res;
  }
  function finishBattle(st, bt, res) {
    if (bt.done) return;
    bt.done = true; bt.res = { winner: res.winner, t: res.t, siege: res.siege };
    const p = bt.p;
    for (const f of bt.sides) {
      const a = st.armies.find(x => x.f === f && x.p === p); if (!a) continue;
      const hp = res.hp[f] || [];
      const keepI = []; a.picks.forEach((ix, i) => { const h = hp[i] != null ? hp[i] : a.hp[i]; if (h >= 8) keepI.push([ix, Math.min(100, h)]); });
      a.picks = keepI.map(x => x[0]); a.hp = keepI.map(x => x[1]);
      if (!a.picks.length) { st.armies = st.armies.filter(x => x !== a); continue; }
      if (res.winner >= 0 && f !== res.winner && !friendly(st, f, res.winner)) {
        // retreat to an adjacent friendly province, or be destroyed
        const back = ADJ[p].filter(n => st.owner[n] === f || friendly(st, st.owner[n], f)).sort((x, y) => x - y)[0];
        if (back != null && !bt.siege) a.p = back; else { st.armies = st.armies.filter(x => x !== a); log(st, `${KINGDOMS[f].name}'s army at ${PROVS[p].name} is destroyed.`, f); }
      }
    }
    if (res.relief && res.relief.id) { const ra = st.armies.find(x => x.id === res.relief.id); if (ra) { ra.hp = ra.hp.map((h, i) => i < res.relief.hp.length ? Math.min(h, res.relief.hp[i]) : h); } }
    mergeAll(st);
    const W = res.winner >= 0 ? KINGDOMS[res.winner].name : 'No one';
    log(st, `${bt.siege ? 'Siege' : 'Battle'} of ${PROVS[p].name}: ${res.winner >= 0 ? W + ' wins' : 'both armies break, no victor'}${res.siege === 'keep' ? ' — the keep has fallen' : res.siege === 'held' ? ' — the walls hold' : ''}.`, res.winner);
    if (st.phase === 'battles' && st.battles.every(b => b.done)) endTurn(st);
  }
  function endTurn(st) {
    const rnd = HB.makeRng((hashStr(st.seed + ':end:' + st.turn)) || 1);
    // occupation: a lone faction (or allies) in a province takes it
    for (let p = 0; p < PROVS.length; p++) {
      const fs = [...new Set(st.armies.filter(a => a.p === p).map(a => a.f))];
      if (fs.length === 1 && st.owner[p] !== fs[0] && !(st.owner[p] >= 0 && friendly(st, fs[0], st.owner[p]))) {
        const prev = st.owner[p]; st.owner[p] = fs[0];
        log(st, `${KINGDOMS[fs[0]].name} takes ${PROVS[p].name}${prev >= 0 ? ' from ' + KINGDOMS[prev].name : ''}.`, fs[0]);
        if (fs[0] === INV) { st.supply[INV] = Math.min(SUPPLY_CAP, st.supply[INV] + 25); st.gold[INV] += PROVS[p].cap ? 200 : 60; log(st, `The Horde plunders ${PROVS[p].name}.`, INV); }
      }
    }
    // economy and supply
    const campD = dist(CAMP, (n) => st.owner[n] === INV);
    for (let f = 0; f < 6; f++) {
      let inc = 0; st.owner.forEach((o, i) => { if (o === f) inc += INCOME(PROVS[i]); });
      st.gold[f] += inc;
      let up = 0;
      for (const a of st.armies.filter(a => a.f === f)) {
        if (f === INV) up += 3 + Math.min(8, campD[a.p] === 99 ? 8 : campD[a.p]) * 2 + Math.round(a.picks.length / 3);
        else up += st.owner[a.p] === f ? 1 : 4;
      }
      const sinc = f === INV ? (st.owner[CAMP] === INV ? 14 : 0) + st.owner.filter((o, i) => o === f && i !== CAMP).length * 3 : 4 + st.owner.filter(o => o === f).length * 3;
      const raid = f === INV && st.coalition && st.coalition.length >= 2 ? 3 * st.coalition.filter(m => alive(st, m)).length : 0; // coalition riders harry the wagons
      st.supply[f] = Math.min(SUPPLY_CAP, st.supply[f] + sinc - up - raid);
      if (st.supply[f] < 0) { // starvation
        for (const a of st.armies.filter(a => a.f === f)) a.hp = a.hp.map(h => Math.max(8, Math.round(h * 0.88)));
        log(st, `${KINGDOMS[f].name} is starving: the supply line is too long.`, f); st.supply[f] = 0;
      }
      // armies recover a little in their own land
      for (const a of st.armies.filter(a => a.f === f && st.owner[a.p] === f)) a.hp = a.hp.map(h => Math.min(100, h + 10));
    }
    // levies arrive
    for (const l of st.levies.filter(l => l.at <= st.turn + 1)) {
      const p = PROVS.findIndex((pp, i) => (pp.cap || pp.camp) && st.owner[i] === l.f);
      if (p >= 0) { const F = fac(l.f); const cheap = F.roster.map((r, i) => i).filter(i => i < F.siege0).sort((x, y) => HB.costOf(F, x) - HB.costOf(F, y))[0]; addArmy(st, l.f, p, Array(Math.max(1, Math.round(l.men / 50))).fill(cheap)); log(st, l.f === INV ? `The Janissary levy: ${l.men} boys taken from ${KINGDOMS[l.from].name} march under the dragon banner.` : `A levy of ${l.men} recruits from ${KINGDOMS[l.from].name} joins ${KINGDOMS[l.f].name}.`, l.f); }
    }
    st.levies = st.levies.filter(l => l.at > st.turn + 1);
    st.treaties = st.treaties.filter(t => t.kind === 'alliance' || t.until > st.turn);
    for (const a of st.armies) delete a.moved;
    // victory
    const caps = capitalsHeldBy(st, INV);
    // the steppe keeps sending riders while the camp stands
    if (st.owner[CAMP] === INV && st.turn % 3 === 0) {
      const F = fac(INV), line = F.roster.map((r, i) => i).filter(i => i < F.siege0).sort((x, y) => HB.costOf(F, x) - HB.costOf(F, y)).slice(0, 3);
      addArmy(st, INV, CAMP, [line[0], line[1] != null ? line[1] : line[0], line[2] != null ? line[2] : line[0], line[0]]);
      log(st, 'A fresh tumen rides out of the steppe to the Invader Camp.', INV);
    }
    const invAlive = st.owner[CAMP] === INV || st.armies.some(a => a.f === INV);
    if (caps >= 3) { st.over = true; st.winner = INV; log(st, 'The Crimson Horde holds three crowns. The realm falls.', INV); }
    else if (st.owner[CAMP] !== INV || !invAlive) { st.over = true; st.winner = st.owner[CAMP] >= 0 && st.owner[CAMP] < 5 ? st.owner[CAMP] : crownWinner(st); log(st, `The Horde is broken! ${KINGDOMS[st.winner].name} is hailed as High King.`, st.winner); }
    else if (st.turn >= st.maxTurns) { st.over = true; st.winner = crownWinner(st); log(st, `The Horde's campaign season ends. ${KINGDOMS[st.winner].name} stands tallest.`, st.winner); }
    st.last = { turn: st.turn, battles: st.battles.map(b => ({ p: b.p, sides: b.sides, siege: b.siege, res: b.res })), envoys: st.envoys };
    st.orders = {}; st.battles = []; st.phase = st.over ? 'over' : 'orders';
    if (!st.over) st.turn++;
    void rnd;
  }
  function crownWinner(st) {
    let best = 0, bs = -1;
    for (let k = 0; k < 5; k++) { const s = st.owner.filter(o => o === k).length * 100 + st.armies.filter(a => a.f === k).reduce((t, a) => t + strength(st, a), 0) * 0.05 - st.oath[k] * 50; if (s > bs) { bs = s; best = k; } }
    return best;
  }
  function hashState(st) { const c = Object.assign({}, st); delete c.log; return hashStr(JSON.stringify(c)); }

  HB.Campaign = { create, submit, ready, resolve, finishBattle, battleMatch, battleResult, autoResolve, aiOrders, strength, friendly, treaty, alive, humanSeats,
    capitalsHeldBy, dist, pathStep, canRecruit, recruitCost, hash: hashState, KINGDOMS, PROVS, ROADS, ADJ, INV, CAMP, SUPPLY_CAP, SPY_COST, endTurn };
})(typeof window !== 'undefined' ? window : globalThis);
