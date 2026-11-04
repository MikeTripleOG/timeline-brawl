// Timeline Brawl v3 — headless sim tests: node test/simtest.cjs
const path = require('path');
for (const f of ['data', 'sim', 'siege', 'ai', 'match', 'campaign']) require(path.join(__dirname, '..', 'js', f + '.js'));
const HB = globalThis.HB;
const UP = -90, DOWN = 90; // degrees; y grows downwards
let fails = 0; const results = [];
function check(name, ok, detail) { results.push((ok ? 'PASS ' : 'FAIL ') + name + ' — ' + detail); if (!ok) fails++; }
// a scripted battle: no AI, flat open ground, both sides 'human' so only our orders count
function arena(a0, a1, opts) {
  const b = new HB.Battle(Object.assign({ seed: 7, terrain: 'open', armies: [a0, a1], factions: [{ faction: 'rome', cmd: 'human' }, { faction: 'rome', cmd: 'human' }] }, opts || {}));
  b.T.elev.fill(0); b.T.forest.fill(0); b.T.water.fill(0); b.T.river = null; b.T.hills = []; b.T.woods = [];
  for (const r of b.regs) { r.f = r.f; }
  return b;
}
const rad = (d) => d * Math.PI / 180;
function run(b, secs, each) { const n = Math.round(secs / HB.WORLD.DT); for (let i = 0; i < n && !b.over; i++) { if (each) each(b); b.step(); } return b; }
const lost = (b, s) => b.regs.filter(r => r.side === s).reduce((a, r) => a + (r.n0 - r.n), 0);
const routed = (b, s) => b.regs.filter(r => r.side === s && r.st > 0).length;
const holdOrders = (b) => { for (const r of b.regs) if (!r.order && !r.cs && r.side === 1) r.order = null; };

// 1. Flanking beats a frontal attack of equal strength
function flankTest(flank) {
  const b = arena(
    [{ t: 'legion', x: 400, y: 600 }, flank ? { t: 'legion', x: 640, y: 470, f: rad(180) } : { t: 'legion', x: 470, y: 600 }],
    [{ t: 'legion', x: 400, y: 470 }, { t: 'legion', x: 470, y: 470 }]);
  for (const r of b.regs) if (r.side === 0 && r.y > 550) r.f = rad(UP); else if (r.side === 1) r.f = rad(DOWN);
  b.regs[0].order = { k: 'at', t: 2 }; b.regs[1].order = { k: 'at', t: flank ? 3 : 3 };
  let tb = -1; run(b, 60, (bb) => { if (tb < 0 && routed(bb, 1) === 2) tb = bb.t; });
  return { b, l0: lost(b, 0), l1: lost(b, 1), r0: routed(b, 0), r1: routed(b, 1), tb };
}
{
  const F = flankTest(false), K = flankTest(true);
  const ratioF = F.l1 / Math.max(1, F.l0), ratioK = K.l1 / Math.max(1, K.l0);
  check('flank attack beats frontal (equal strength)', K.l0 < F.l0 * 0.75 && K.tb > 0 && (F.tb < 0 || K.tb < F.tb),
    `2 legions vs 2 legions — frontal: we lost ${Math.round(F.l0)}, enemy lost ${Math.round(F.l1)}, enemy line broke at ${F.tb.toFixed(1)}s; one pins + one hits the flank: we lost ${Math.round(K.l0)}, enemy lost ${Math.round(K.l1)}, enemy line broke at ${K.tb.toFixed(1)}s`);
}
// 2. Braced pikes beat a frontal cavalry charge; the same pikes caught marching in column get ridden down
function pikeTest(form) {
  const b = arena([{ t: 'heavycav', x: 400, y: 700 }], [{ t: 'pike', x: 400, y: 450 }]);
  b.regs[0].f = rad(UP); b.regs[1].f = rad(DOWN); b.setForm(b.regs[1], form); b.regs[1].coh = 1;
  b.regs[0].order = { k: 'at', t: 1 };
  let braced = 0; run(b, 40, (bb) => { for (const f of bb.fx) if (f.k === 'callout' && f.text === 'BRACED!') braced++; bb.fx.length = 0; });
  return { cav: b.regs[0], pike: b.regs[1], braced };
}
{
  const P = pikeTest('phalanx'), C = pikeTest('column');
  check('braced pikes beat a frontal cavalry charge', P.cav.st > 0 && P.pike.st === 0 && P.braced > 0 && (P.cav.n0 - P.cav.n) / P.cav.n0 > (P.pike.n0 - P.pike.n) / P.pike.n0,
    `phalanx: cav ${Math.round(P.cav.n)}/${P.cav.n0} ${['ok', 'ROUTED', 'destroyed'][P.cav.st]}, pikes ${Math.round(P.pike.n)}/${P.pike.n0} ${['holding', 'routed', 'destroyed'][P.pike.st]}, BRACED! x${P.braced}; ` +
    `same pikes in column: cav ${Math.round(C.cav.n)}/${C.cav.n0} ${['ok', 'routed', 'destroyed'][C.cav.st]}, pikes ${Math.round(C.pike.n)}/${C.pike.n0} ${['holding', 'routed', 'destroyed'][C.pike.st]}`);
}
// 3. A flank (rear) cavalry charge routs archers
{
  const b = arena([{ t: 'heavycav', x: 700, y: 330 }], [{ t: 'archer', x: 400, y: 400 }, { t: 'legion', x: 400, y: 800 }]);
  b.regs[1].f = rad(DOWN); b.regs[0].order = { k: 'at', t: 1 };
  let t0 = -1, impacts = []; run(b, 30, (bb) => { for (const f of bb.fx) if (f.k === 'impact') impacts.push(['front', 'flank', 'rear'][f.zone]); bb.fx.length = 0; if (t0 < 0 && bb.regs[1].st > 0) t0 = bb.t; });
  check('cavalry charge into the flank/rear routs archers', t0 > 0 && t0 < 20, `archers broke at t=${t0.toFixed(1)}s after impact(s): ${impacts.join(',') || 'none'}; archers left ${Math.round(b.regs[1].n)}/60, cav lost ${Math.round(40 - b.regs[0].n)}`);
}
// 4. Terrain: the regiment on the hill wins a mirror fight
function hillTest(onHill) {
  const b = arena([{ t: 'legion', x: 400, y: 620 }], [{ t: 'legion', x: 400, y: 480 }]);
  b.regs[0].f = rad(UP); b.regs[1].f = rad(DOWN);
  if (onHill) { const T = b.T, GW = HB.WORLD.W / HB.WORLD.CS; for (let gy = 0; gy < 49; gy++) for (let gx = 0; gx < GW; gx++) T.elev[gy * GW + gx] = Math.min(0.7, (49 - gy) * 0.12); } // defender on the crest
  b.regs[0].order = { k: 'at', t: 1 };
  run(b, 45);
  return { atk: b.regs[0], def: b.regs[1] };
}
{
  const flat = hillTest(false), hill = hillTest(true);
  const lf = flat.atk.n0 - flat.atk.n, lh = hill.atk.n0 - hill.atk.n, df = flat.def.n0 - flat.def.n, dh = hill.def.n0 - hill.def.n;
  check('hill bonus: defenders on the crest trade better', dh / Math.max(1, lh) < df / Math.max(1, lf) * 0.75,
    `flat: attacker lost ${Math.round(lf)}, defender lost ${Math.round(df)}; defender on hill: attacker lost ${Math.round(lh)}, defender lost ${Math.round(dh)}`);
}
// 5. Shield wall / testudo resists archers
function arrowTest(form) {
  const b = arena([{ t: 'archer', x: 400, y: 600 }, { t: 'archer', x: 470, y: 600 }], [{ t: 'legion', x: 430, y: 480 }]);
  for (const r of b.regs) r.f = r.side ? rad(DOWN) : rad(UP);
  b.setForm(b.regs[2], form); b.regs[2].coh = 1; b.regs[2].order = { k: 'mv', x: 430, y: 480, f: null };
  run(b, 25); return b.regs[2].n0 - b.regs[2].n;
}
{ const L = arrowTest('line'), Tt = arrowTest('testudo'); check('testudo shrugs off arrows', Tt < L * 0.35, `legion lost ${Math.round(L)} in line vs ${Math.round(Tt)} in testudo`); }
// 6. War elephants: scary vs infantry, bled by javelins, panic and trample
{
  const b = arena([{ t: 'elephant', x: 400, y: 620 }, { t: 'spear', x: 60, y: 950 }], [{ t: 'legion', x: 400, y: 480 }, { t: 'spear', x: 740, y: 40 }]);
  b.regs[0].f = rad(UP); b.regs[2].f = rad(DOWN); b.regs[0].order = { k: 'at', t: 2 }; run(b, 30);
  const E = b.regs[0], Lg = b.regs[2];
  const e2 = arena([{ t: 'elephant', x: 400, y: 640 }, { t: 'legion', x: 400, y: 720 }], [{ t: 'javelin', x: 400, y: 510 }, { t: 'javelin', x: 330, y: 510 }, { t: 'spear', x: 740, y: 40 }]);
  e2.regs[0].f = rad(UP); e2.regs[1].f = rad(UP); for (const r of e2.regs) if (r.side) r.f = rad(DOWN);
  e2.regs[0].order = { k: 'at', t: 2 }; e2.regs[1].order = { k: 'mv', x: 400, y: 700, f: -90 * Math.PI / 180 };
  let panic = 0; run(e2, 45, (bb) => { for (const f of bb.fx) if (f.k === 'callout' && /PANIC/.test(f.text)) panic++; bb.fx.length = 0; });
  check('elephants smash infantry but javelins make them panic', Lg.st > 0 && E.st === 0 && e2.regs[0].st > 0,
    `elephants vs legion: legion ${['held', 'ROUTED', 'destroyed'][Lg.st]} (${Math.round(Lg.n)}/80), elephants ${E.n.toFixed(1)}/8; vs javelins: elephants ${['ok', 'PANICKED/routed', 'dead'][e2.regs[0].st]} (${e2.regs[0].n.toFixed(1)}/8, panic callouts ${panic}), friendly legion lost ${Math.round(80 - e2.regs[1].n)} to trampling`);
}
// 7. Morale contagion: a rout shakes neighbours
{
  const b = arena([{ t: 'spear', x: 400, y: 600 }, { t: 'spear', x: 470, y: 600 }], [{ t: 'legion', x: 400, y: 200 }]);
  const before = b.regs[1].morale; b.regs[0].morale = -1; run(b, 1.1);
  check('morale contagion: a routing regiment shakes its neighbour', b.regs[0].st === 1 && b.regs[1].morale < before - 8, `neighbour morale ${Math.round(before)} → ${Math.round(b.regs[1].morale)}`);
}
// 8. AI vs AI spectate completes with a winner (2 and 4 armies), deterministic
{
  let ok = true, det = true, lines = [];
  for (const [n, seed] of [[2, 11], [2, 12], [4, 13], [4, 14]]) {
    const facs = ['rome', 'carthage', 'mongols', 'vikings', 'samurai', 'zulu'];
    const sides = []; for (let i = 0; i < n; i++) sides.push({ faction: facs[(seed + i * 2) % facs.length], cmd: i === 0 ? 'remi' : i === 1 ? 'gamedev' : 'ai' });
    const m = HB.makeMatch({ seed, sides });
    const b = HB.battleFor(m); while (!b.over) b.step();
    const b2 = HB.battleFor(m); while (!b2.over) b2.step();
    if (b.hash() !== b2.hash()) det = false;
    if (b.winner < 0) ok = false;
    const S = b.summary();
    lines.push(`${n}p seed ${seed}: ${S.sides.map(s => s.name).join(' v ')} → ${S.winners.map(w => S.sides[w].name).join('+')} in ${Math.round(S.time)}s${S.timeout ? ' (timeout)' : ''}${b.wrathDone ? ', Gods’ Wrath' : ''}${S.diplo.some(d => d.type === 'betray') ? ', betrayal' : ''}`);
  }
  check('AI vs AI spectate finishes with a winner', ok, lines.join('; '));
  check('deterministic replays (same seed → same hash)', det, 'two runs of each match hash identically');
}
// 9. Replay via #watch link reproduces a battle with player commands
{
  const m = HB.makeMatch({ seed: 21, sides: [{ faction: 'macedon', cmd: 'human' }, { faction: 'rome', cmd: 'gamedev' }] });
  const b = HB.battleFor(m);
  for (let i = 0; i < 2400 && !b.over; i++) { if (i === 10) b.command({ c: 'au', a: 0, on: 1 }); if (i === 30) b.command({ c: 'fm', s: 0, m: 'square' }); if (i === 50) b.command({ c: 'mv', s: 1, x: 300, y: 700, f: -90 }); b.step(); }
  const code = HB.encodeWatch(m, b.log); const d = HB.decodeWatch(code);
  const r = HB.battleFor(d.m, { cmds: d.cmds }); while (r.tick < b.tick) r.step();
  check('#watch replay reproduces the battle', r.hash() === b.hash(), `${b.log.length} commands, link ${code.length} chars`);
}
// 10. Lockstep: two sims fed the same tick-stamped frames stay in sync
{
  const m = HB.makeMatch({ seed: 31, sides: [{ faction: 'sparta', cmd: 'human' }, { faction: 'zulu', cmd: 'human' }] });
  const A = HB.battleFor(m, { net: 1 }), B = HB.battleFor(m, { net: 1 });
  let L = 4, desync = 0;
  for (let T = 0; T < 600; T++) {
    const cmds = [];
    if (T === 3) cmds.push({ c: 'au', a: 0, on: 1 }, { c: 'au', a: 1, on: 1 });
    if (T === 10) cmds.push({ c: 'fm', s: 0, m: 'phalanx' });
    for (const c of cmds) c.k = (T + 2) * L;
    A.feed(cmds); B.feed(JSON.parse(JSON.stringify(cmds)));
    for (let i = 0; i < L; i++) { A.step(); B.step(); }
    if (T % 10 === 0 && A.hash() !== B.hash()) desync++;
  }
  check('lockstep frames keep two sims identical', desync === 0, `600 frames x ${L} ticks, ${desync} hash mismatches`);
}
// 11. Sieges: walls stop cavalry, a ram breaks the gate and the horsemen pour through
{
  const b = new HB.Battle({ seed: 5, siege: { def: 1 }, armies: [[{ t: 'ram', x: 400, y: 760 }, { t: 'heavycav', x: 300, y: 760 }], [{ t: 'spear', x: 400, y: 400 }]],
    factions: [{ faction: 'rome', cmd: 'human' }, { faction: 'rome', cmd: 'human' }] });
  const gate = b.S.segs.find(s => s.gate && s.ring === 0), ram = b.regs[0], cav = b.regs[1];
  ram.order = { k: 'wl', w: gate.id }; cav.order = { k: 'mv', x: 400, y: 600 };
  let outside = true, tGate = -1;
  run(b, 120, (bb) => { if (tGate < 0 && HB.ringOf(cav.x, cav.y) > 0) outside = false; if (tGate < 0 && gate.hp <= 0) tGate = bb.t; });
  const inside = HB.ringOf(cav.x, cav.y) >= 1;
  check('siege: the wall stops cavalry until a ram breaks the gate', outside && tGate > 0 && inside,
    `cavalry held outside the intact outer wall; ram broke the gate at t=${tGate.toFixed(1)}s; cavalry then rode in (ring ${HB.ringOf(cav.x, cav.y)})`);
}
// 12. Sieges: archers behind a wall take far fewer losses than in the open
{
  const shoot = (walls) => { const b = new HB.Battle({ seed: 6, siege: { def: 1 }, armies: [[{ t: 'archer', x: 400, y: 840 }], [{ t: 'archer', x: 400, y: 660 }, { t: 'spear', x: 400, y: 300 }]],
    factions: [{ faction: 'rome', cmd: 'human' }, { faction: 'rome', cmd: 'human' }] });
    if (!walls) for (const s of b.S.segs) if (s.ring === 0) s.hp = 0;
    b.regs[0].f = rad(UP); b.regs[1].f = rad(DOWN); b.regs[0].order = { k: 'at', t: 1 }; run(b, 40); return { l: lost(b, 1), e: lost(b, 0) }; };
  const open = shoot(false), wall = shoot(true);
  check('siege: defenders on the walls are covered from arrows', wall.l < open.l * 0.6, `defending archers lost ${Math.round(open.l)} with the wall knocked down vs ${Math.round(wall.l)} behind it (attackers lost ${Math.round(open.e)} / ${Math.round(wall.e)})`);
}
// 13. Sieges with AI: engines breach the rings, the fight moves inward, a relief army arrives, and there is a result
{
  const lines = []; let ok = true, inward = 0, relief = 0, breached = 0;
  for (const [af, df, seed] of [['rome', 'vikings', 3], ['mongols', 'macedon', 4], ['carthage', 'celts', 9]]) {
    const A = HB.FACTION[af];
    const m = HB.makeMatch({ seed, siege: { def: 1, relief: { side: 1, t: 80, edge: 'left', picks: HB.draft(df, 400) } }, tmax: 480,
      sides: [{ faction: af, cmd: 'ai', picks: HB.draft(af, 1000).slice(0, 9).concat([A.siege0, A.siege0 + 1, A.siege0 + 2, A.siege0 + 2]) }, { faction: df, cmd: 'ai', picks: HB.draft(df, 800) }] });
    const b = HB.battleFor(m); let deep = 0, br = 0, rl = 0;
    while (!b.over) { b.step(); for (const f of b.fx) { if (f.k === 'breach') br++; if (f.k === 'event' && f.id === 'relief') rl = 1; } b.fx.length = 0;
      for (const r of b.regs) if (r.side === 0 && r.st === 0) deep = Math.max(deep, HB.ringOf(r.x, r.y)); }
    if (!(b.winner >= 0)) ok = false; if (deep >= 2) inward++; if (rl) relief++; if (br) breached++;
    lines.push(`${af} besieging ${df}: ${br} breaches/gates, attackers reached ring ${deep}, relief ${rl ? 'arrived' : 'no'}, winner ${b.fac[b.winner] ? b.fac[b.winner].faction : '?'} (${b.siegeResult || 'army broken'}) at ${b.t.toFixed(0)}s`);
  }
  check('siege AI: walls breached, fight moves inward, relief arrives, a winner', ok && inward >= 2 && relief === 3 && breached === 3, lines.join('; '));
}
// 14. Five Crowns campaign: AI-only campaigns finish; resolution is deterministic and survives a JSON round trip (what the online host broadcasts)
{
  const C = HB.Campaign, lines = []; let ok = true, det = true;
  for (const seed of [2, 6]) {
    const a = C.create({ seed }), b = JSON.parse(JSON.stringify(C.create({ seed })));
    let sieges = 0, battles = 0, offers = 0;
    while (!a.over && a.turn < 40) { C.resolve(a); const bb = JSON.parse(JSON.stringify(b)); C.resolve(bb); Object.assign(b, bb);
      if (C.hash(a) !== C.hash(b)) det = false; if (a.last) { battles += a.last.battles.length; sieges += a.last.battles.filter(x => x.siege).length; offers += a.last.envoys.length; } }
    if (!(a.over && a.winner >= 0)) ok = false;
    lines.push(`seed ${seed}: ${C.KINGDOMS[a.winner].name} wins on turn ${a.turn}; ${battles} battles (${sieges} sieges), ${offers} envoys`);
  }
  check('campaign: AI campaigns finish with a winner', ok, lines.join('; '));
  check('campaign: turn resolution is deterministic across a JSON round trip', det, 'host and guest copies hash identically every turn');
}
// 15. Multi-turn marches go where the player ordered, along the drawn path (bug: "march on Vellorien" went to Ashen Pass and stopped)
{
  const C = HB.Campaign, INV = C.INV, P = HB.PROVS, V = P.findIndex(p => p.name === 'Vellorien');
  const lines = []; let ok = true;
  for (const start of [C.CAMP, P.findIndex(p => p.name === 'Eastern Hills'), P.findIndex(p => p.name === 'Ashen Pass')]) {
    const st = C.create({ seed: 5, seats: HB.KINGDOMS.map(() => ({ cmd: 'human' })) });
    const a = st.armies.find(x => x.f === INV); a.p = start; for (const o of st.armies) if (o !== a && o.p === start) o.p = C.CAMP === start ? 11 : C.CAMP;
    for (let f = 0; f < 6; f++) C.submit(st, f, []); C.resolve(st); // turn 1: the Horde is still crossing the mountains
    const want = [start]; { let p = start; while (p !== V) { p = C.pathStep(p, V); want.push(p); } }
    const went = [start]; let t = 0, arrived = false, bogus = false;
    while (t++ < 6 && !arrived) {
      const ords = a.dest != null || t === 1 ? [{ k: 'mv', a: a.id, to: t === 1 ? (start === C.CAMP ? 12 : C.pathStep(start, V)) : C.pathStep(a.p, a.dest), d: V }] : [];
      for (let f = 0; f < 6; f++) C.submit(st, f, f === INV ? ords : []);
      C.resolve(st);
      const bt = (st.battles || []).find(b => !b.done && b.sides.includes(INV));
      const at = bt ? bt.p : a.p; if (went[went.length - 1] !== at) went.push(at);
      if (at === V) arrived = true;
      if (st.phase === 'battles') for (const b of st.battles.filter(b => !b.done)) C.finishBattle(st, b, C.autoResolve(st, b));
      if (!st.armies.includes(a)) break;
      if (!arrived && a.dest !== V) bogus = true;
    }
    const good = arrived && !bogus && went.every((p, i) => i === 0 || HB.ADJ[went[i - 1]].includes(p)) && went.length === want.length;
    ok = ok && good; lines.push(`${P[start].name} → Vellorien: ${went.map(p => P[p].name).join(' → ')} in ${went.length - 1} turn(s)${good ? '' : ' (WRONG)'}`);
  }
  check('campaign: a march order reaches the ordered province along the path', ok, lines.join('; '));
}
// 16. The Gods' Wrath is rare and late: never in quick battles, never in a campaign's first battles, never before the battle's second half
{
  const lines = []; let ok = true;
  const m = HB.makeMatch({ seed: 9, sides: [{ faction: 'rome' }, { faction: 'carthage' }] }); const b = HB.battleFor(m); while (!b.over) b.step();
  ok = ok && !b.wrath && !b.wrathDone; lines.push(`quick battle: ${Math.round(b.bloodshed)} bloodshed, wrath ${b.wrathDone ? 'YES' : 'no'}`);
  const m2 = HB.makeMatch({ seed: 9, wrath: 1, sides: [{ faction: 'rome' }, { faction: 'carthage' }] }); const b2 = HB.battleFor(m2); let tW = -1; while (!b2.over) { b2.step(); if (tW < 0 && b2.wrath) tW = b2.t; }
  ok = ok && (tW < 0 || tW >= b2.tmax * 0.5); lines.push(`battle with the gods stirred: wrath ${tW < 0 ? 'did not come' : 'at ' + tW.toFixed(0) + 's of ' + b2.tmax + 's'}`);
  const C = HB.Campaign; let first = 99, n = 0, games = 0, withW = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const st = C.create({ seed, seats: HB.KINGDOMS.map(() => ({ cmd: 'ai' })) }); let g = 0; games++;
    const w = []; let wt = st.wrathT; const seen = () => { if (st.wrathT !== wt) { wt = st.wrathT; w.push(wt); } };
    while (!st.over && g++ < 300) { if (st.phase === 'orders') { C.resolve(st); seen(); } if (st.phase === 'battles') for (const bt of st.battles.filter(b => !b.done)) { C.finishBattle(st, bt, C.autoResolve(st, bt)); seen(); } }
    n += w.length; if (w.length) withW++;
    for (const t of w) { first = Math.min(first, t); ok = ok && t >= 7; }
    ok = ok && w.length <= 2;
  }
  lines.push(`${games} full AI campaigns: the gods walked ${n} time(s) in ${withW} campaign(s), earliest on turn ${first === 99 ? '—' : first} (never before turn 7, at most twice a war)`);
  check('Gods\' Wrath is gated: rare, late, earned by campaign bloodshed', ok, lines.join('; '));
}
console.log(results.join('\n'));
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
