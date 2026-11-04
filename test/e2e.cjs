// Mobile e2e: node test/e2e.cjs [baseUrl]  (needs playwright-core + Chrome; serves nothing itself)
const PW = process.env.PW || '/workspace/frontline-game/tools/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const SHOTS = process.env.SHOTS || '/tmp/shots';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
(async () => {
  const br = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  const ev = (f, a) => pg.evaluate(f, a);
  const tapAt = async (x, y) => { await pg.touchscreen.tap(x, y); await pg.waitForTimeout(120); };
  const drag = async (x0, y0, x1, y1, steps = 8) => { // touch drag via pointer events
    await pg.mouse.move(x0, y0); await pg.mouse.down(); for (let i = 1; i <= steps; i++) { await pg.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await pg.waitForTimeout(20); } await pg.mouse.up(); await pg.waitForTimeout(100); };

  console.log('title');
  await pg.goto(BASE); await pg.waitForTimeout(1200);
  ok(await pg.isVisible('text=Trial version'), 'title shows the gold "Trial version" tag');
  await pg.screenshot({ path: SHOTS + '/e2e-title.png' });

  console.log('quick battle (tap-first controls)');
  await pg.click('#bQuick'); await pg.waitForTimeout(800);
  ok(await ev(() => __tb.screen()) === 'battle', 'one tap starts a battle');
  await ev(() => { __tb.R.userCam = 99; __tb.R.fit(true); });
  const r0 = await ev(() => { const b = __tb.BR.b, r = b.regs.find(r => r.side === 0 && r.def.cls === 'inf'); const p = __tb.R.toScreen(r.x, r.y); return { id: r.id, x: p.x, y: p.y }; });
  await tapAt(r0.x, r0.y);
  ok(await ev(() => __tb.BR.sel) === r0.id, 'tap selects a regiment');
  await drag(r0.x, r0.y, r0.x + 30, r0.y - 90);
  await pg.waitForTimeout(150);
  const ord = await ev((id) => { const r = __tb.BR.b.regs[id]; return r.order; }, r0.id);
  ok(ord && ord.k === 'mv' && ord.f != null, 'drag issues a move with facing');
  // tap the selected regiment's ring medallion to change formation
  const ring = await ev(() => __tb.R.ring && __tb.R.ring.items.map(i => ({ x: i.x, y: i.y, k: i.o.k, m: i.o.m, on: i.o.on })));
  ok(ring && ring.length >= 2 && ring.length <= 4, 'formation ring shows 2–4 options (' + (ring ? ring.length : 0) + ')');
  const alt = ring && ring.find(o => o.k === 'fm' && !o.on);
  if (alt) { await tapAt(alt.x, alt.y); await pg.waitForTimeout(150); ok(await ev((id) => __tb.BR.b.regs[id].form, r0.id) === alt.m, 'tapping a medallion switches formation to ' + alt.m); }
  // tap an enemy to attack
  const en = await ev(() => { const b = __tb.BR.b, r = b.regs.find(r => r.side === 1 && r.st === 0); const p = __tb.R.toScreen(r.x, r.y); return { id: r.id, x: p.x, y: p.y }; });
  await tapAt(en.x, en.y); await pg.waitForTimeout(120);
  const o2 = await ev((id) => __tb.BR.b.regs[id].order, r0.id);
  ok(o2 && o2.k === 'at' && o2.t === en.id, 'tap an enemy with a regiment selected = attack');
  await pg.waitForTimeout(1500); await pg.screenshot({ path: SHOTS + '/e2e-battle.png' });
  await ev(() => __tb.ff(400)); await pg.waitForTimeout(3200);
  ok(await pg.isVisible('#modal.on'), 'battle ends with a results scroll');
  const watch = await ev(() => __tb.BR.lastWatch);
  const winner = await ev(() => __tb.BR.b.winner);
  ok(/^https?:.*#watch=/.test(watch || ''), 'results carry a #watch replay link');
  await pg.screenshot({ path: SHOTS + '/e2e-result.png' });
  await pg.click('[data-a=done]'); await pg.waitForTimeout(300);

  console.log('replay link');
  await pg.goto(watch); await pg.waitForTimeout(800);
  ok(await ev(() => __tb.screen()) === 'battle' && await ev(() => __tb.BR.watch), '#watch opens a replay');
  await ev(() => __tb.ff(400)); await pg.waitForTimeout(3000);
  const w2 = await ev(() => __tb.BR.b.winner);
  ok(await pg.isVisible('#modal.on') && w2 === winner, 'replay reproduces the same winner (side ' + w2 + ')');
  await pg.click('[data-a=done]'); await pg.waitForTimeout(300);

  console.log('custom siege (attack)');
  await pg.goto(BASE); await pg.waitForTimeout(800);
  await pg.click('#bCustom'); await pg.click('[data-a=field][data-v=siegeA]'); await pg.click('[data-a=go]'); await pg.waitForTimeout(1000);
  ok(await ev(() => !!__tb.BR.b.S && __tb.BR.b.S.segs.length > 20), 'siege battle has walls in rings (' + await ev(() => __tb.BR.b.S.segs.length) + ' segments)');
  ok(await pg.isVisible('text=Walls'), 'siege HUD shows wall integrity');
  // tap the trebuchet then a wall segment = wall order
  const tre = await ev(() => { __tb.R.userCam = 99; __tb.R.fit(true); const b = __tb.BR.b, r = b.regs.find(r => r.side === 1 && r.def.wall > 0 && r.def.rng > 0) || b.regs.find(r => r.side === 1 && r.def.cls === 'sie'); const p = __tb.R.toScreen(r.x, r.y); const s = b.S.segs.filter(s => s.ring === 0 && !s.gate).sort((a, c) => Math.hypot(a.mx - r.x, a.my - r.y) - Math.hypot(c.mx - r.x, c.my - r.y))[0]; const q = __tb.R.toScreen(s.mx, s.my); return { id: r.id, x: p.x, y: p.y, sx: q.x, sy: q.y, sid: s.id }; });
  await tapAt(tre.x, tre.y); await tapAt(tre.sx, tre.sy); await pg.waitForTimeout(150);
  const wo = await ev((id) => __tb.BR.b.regs[id].order, tre.id);
  ok(wo && wo.k === 'wl', 'tap a wall with a trebuchet selected = bombard order');
  await ev(() => __tb.ff(60)); await pg.waitForTimeout(1200); await pg.screenshot({ path: SHOTS + '/e2e-siege.png' });
  await ev(() => { const b = __tb.BR.b; for (const f of b.fac) f.auto = true; }); await ev(() => __tb.ff(500)); await pg.waitForTimeout(3000);
  ok(await pg.isVisible('#modal.on'), 'siege ends (' + await ev(() => __tb.BR.b && (__tb.BR.b.siegeResult || (__tb.BR.b.winner === 1 ? 'attackers' : 'defenders') + ' win in the field')) + ')');
  await pg.click('[data-a=done]');

  console.log('spectate Remi vs Game Dev');
  await pg.click('#bPlay'); await pg.click('[data-a=spec]'); await pg.click('[data-a=field]'); await pg.waitForTimeout(600);
  ok(await ev(() => __tb.BR.spectate), 'spectate mode');
  await ev(() => __tb.ff(600)); const sw = await ev(() => __tb.BR.b.winner); ok(sw >= 0, 'AI spectate finishes with a winner (' + await ev(() => __tb.BR.b.fac[__tb.BR.b.winner].name) + ')');
  await pg.waitForTimeout(2800); await pg.click('[data-a=done]');

  console.log('campaign (solo)');
  await pg.click('#bPlay'); await pg.click('[data-a=solo]'); await pg.click('[data-a=seat][data-i="1"]'); await pg.click('[data-a=go]'); await pg.waitForTimeout(500);
  await pg.click('[data-a=go]'); await pg.waitForTimeout(600);
  ok(await ev(() => __tb.screen()) === 'map', 'campaign map opens');
  ok(await pg.isVisible('#map .cartouche') && await pg.isVisible('#supTxt'), 'cartouche and supply panel visible');
  // tap my army at Frostmere then Thornwood... instead: tap the capital army and an adjacent province
  const a = await ev(() => { const st = __tb.CP.st, a = st.armies.find(x => x.f === 1 && x.p === 3); __tb.MV.center(3); const P = __tb.HB.PROVS; const p = __tb.MV.toScreen(P[3].x, P[3].y - 10); return { id: a.id, x: p.x, y: p.y }; });
  await tapAt(a.x, a.y);
  ok(await ev(() => __tb.MV.sel) === a.id && await pg.isVisible('#sheet.on'), 'tap my army: army sheet + highlighted roads');
  const dest = await ev(() => { const P = __tb.HB.PROVS; const p = __tb.MV.toScreen(P[1].x, P[1].y + 15); return p; });
  await tapAt(dest.x, dest.y);
  ok(await ev(() => __tb.MV.arrows.length) === 1, 'tap a neighbouring province: march arrow');
  await pg.screenshot({ path: SHOTS + '/e2e-map.png' });
  // envoy: compose a tribute treaty
  await pg.click('#bDiplo'); await pg.click('[data-a=env][data-i="0"]'); await pg.waitForTimeout(200);
  ok(await pg.isVisible('text=Treaty of Tribute'), 'treaty scroll opens');
  await pg.screenshot({ path: SHOTS + '/e2e-treaty.png' });
  await pg.click('[data-a=send]');
  // coalition offer to another kingdom, and a spy against the Horde
  await pg.click('#bDiplo'); await pg.click('[data-a=env][data-i="2"]'); await pg.waitForTimeout(200);
  await pg.click('[data-a=kind][data-v=coalition]'); await pg.waitForTimeout(150);
  ok(await pg.isVisible('text=The Grand Coalition'), 'coalition treaty scroll between kingdoms');
  await pg.click('[data-a=send]');
  await pg.click('#bDiplo'); await pg.click('[data-a=spy][data-i="5"]'); await pg.waitForTimeout(150);
  ok(await ev(() => __tb.CP.draft.sp) === 5 && await ev(() => __tb.CP.draft.of.some(o => o.kind === 'coalition')), 'spy sent at the Horde + coalition envoy drafted');
  await pg.screenshot({ path: SHOTS + '/e2e-diplo.png' });
  await pg.evaluate(() => document.querySelector('#sheet.on') && document.querySelector('#sheet [data-a=close], #sheetClose') && document.querySelector('#sheet [data-a=close], #sheetClose').click());
  for (let t = 0; t < 4; t++) {
    await pg.click('#bEnd'); await pg.waitForTimeout(400);
    for (let k = 0; k < 6 && await pg.isVisible('#modal.on'); k++) {
      if (await pg.isVisible('[data-a=auto]')) await pg.click('[data-a=auto]');
      else if (await pg.isVisible('[data-a=no]')) await pg.click('[data-a=no]');
      else if (await pg.isVisible('[data-a=t]')) break;
      await pg.waitForTimeout(400);
    }
  }
  const turn = await ev(() => __tb.CP.st.turn);
  ok(turn >= 4 || await ev(() => __tb.CP.st.over), 'campaign advances (turn ' + turn + ')');

  console.log('campaign battle played on the field');
  await ev(() => { const st = __tb.CP.st; }); 
  await pg.goto(BASE); await pg.waitForTimeout(600);
  await ev(() => __tb.campaign([4], 11)); await pg.click('[data-a=go]'); await pg.waitForTimeout(300);
  // march Drakonia's capital army onto the Eastern Hills (held by the Horde) -> field battle
  await ev(() => { const st = __tb.CP.st, a = st.armies.find(x => x.f === 4 && x.p === 8); __tb.CP.draft.mv[a.id] = 11; });
  await pg.click('#bEnd'); await pg.waitForTimeout(600);
  let fought = false;
  for (let k = 0; k < 6; k++) {
    if (await pg.isVisible('[data-a=fight]')) { await pg.click('[data-a=fight]'); await pg.waitForTimeout(800); fought = true; break; }
    if (await pg.isVisible('[data-a=no]')) await pg.click('[data-a=no]');
    await pg.waitForTimeout(300);
  }
  ok(fought && await ev(() => __tb.screen()) === 'battle', 'pre-battle card → Fight opens the battle');
  await pg.waitForTimeout(1200); await pg.screenshot({ path: SHOTS + '/e2e-campaign-battle.png' });
  await ev(() => { const b = __tb.BR.b; for (const f of b.fac) f.auto = true; }); await ev(() => __tb.ff(600)); await pg.waitForTimeout(3000);
  await pg.click('[data-a=done]'); await pg.waitForTimeout(500);
  ok(await ev(() => __tb.screen()) === 'map', 'battle result returns to the map');
  ok(await ev(() => __tb.CP.st.log.some(l => /^(Battle|Siege) of .*: /.test(l.text) && l.t === 1)), 'result written to the chronicle');

  console.log('pass & play');
  await ev(() => __tb.campaign([0, 5], 3)); await pg.click('[data-a=go]'); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#cover.on'), 'hot-seat cover screen asks to pass the device');
  await pg.click('#coverGo'); await pg.click('#bEnd'); await pg.waitForTimeout(300);
  ok(await pg.isVisible('#cover.on') && /Crimson Horde/.test(await pg.textContent('#cover')), 'then passes to the second ruler');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await br.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
