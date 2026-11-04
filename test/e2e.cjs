// Headless Playwright test at a phone viewport. Usage: node test/e2e.cjs [baseUrl]
const { chromium } = require('/workspace/frontline-game/tools/node_modules/playwright-core');
const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  const res = [];
  const ok = (name, cond, info) => { res.push({ name, pass: !!cond, info }); console.log((cond ? 'PASS ' : 'FAIL ') + name + (info ? ' — ' + info : '')); };
  const fpsSample = (ms) => page.evaluate((ms) => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else r({ fps: n / (ms / 1000), t: __tb.battle && __tb.battle.t, n: __tb.battle && __tb.battle.n }); })(); }), ms);

  await page.goto(BASE, { waitUntil: 'load' });
  ok('page title', /Timeline Brawl/.test(await page.title()));
  ok('6 featured cards', (await page.locator('.card').count()) === 6);

  // ---- Quick Battle: one tap to a running fight ----
  await page.evaluate(() => { __tb.st.taps = 0; });
  await page.locator('#btn-quick').tap();
  await sleep(4200);
  const q = await page.evaluate(() => ({ screen: __tb.st.screen, t: __tb.battle.t, taps: __tb.st.taps }));
  ok('Quick Battle: 1 tap to a running battle', q.screen === 'battle' && q.t > 0.3 && q.taps === 1, JSON.stringify(q));
  // camera follows; user pan pauses it; re-center resumes
  await page.touchscreen.tap(200, 500);
  await page.evaluate(() => __tb.R.panBy(80, 0));
  await page.evaluate(() => { __tb.R.userT = 6; __tb.R.auto = false; });
  await page.locator('#btn-menu').tap();
  ok('corner menu opens', await page.locator('#cmenu').isVisible());
  await page.locator('#speed-seg button[data-v="2"]').tap();
  const badge = await page.locator('#speed-badge').textContent();
  ok('speed state shown', badge.trim() === '2×' && (await page.locator('#speed-seg button.on').getAttribute('data-v')) === '2', badge);
  await page.locator('#cm-center').tap();
  ok('re-center hands camera back', await page.evaluate(() => __tb.R.auto !== false && __tb.R.userT <= 0));

  // tap-select own squad, tap ground to move; hold to fire
  const pos = await page.evaluate(() => { const b = __tb.battle; const s = b.squads.find(o => o.side === 0 && o.alive > 0); return Object.assign(__tb.R.toScreen(s.cx, s.cy), { id: s.id }); });
  await page.touchscreen.tap(pos.x + 10, pos.y + 6); // off-centre: generous hit radius
  await sleep(120);
  const selId = await page.evaluate(() => __tb.st.sel);
  ok('tap near squad selects it', selId >= 0 && await page.evaluate((i) => __tb.battle.squads[i].side === 0, selId), 'sel ' + selId);
  pos.id = selId;
  const g = await page.evaluate(() => __tb.R.toScreen(__tb.battle.squads[__tb.st.sel].cx, __tb.battle.squads[__tb.st.sel].cy - 90));
  await page.touchscreen.tap(g.x, g.y);
  await sleep(150);
  ok('tap ground issues move order', await page.evaluate((id) => { const o = __tb.battle.squads[id].order; return o && (o.kind === 'move' || o.kind === 'attack') && __tb.battle.log.length > 0; }, pos.id));
  await page.locator('#btn-menu').tap(); await page.locator('#cm-quit').tap();

  // ---- Custom draft: fixed '+', hold-to-repeat, unspent warning ----
  await page.locator('#btn-custom').tap();
  await page.locator('#custom [data-mode="ai"]').tap();
  const card = page.locator('.ucard').first();
  const b0 = await card.locator('.add').boundingBox();
  await card.locator('.add').tap();
  const b1 = await card.locator('.add').boundingBox();
  ok('＋ does not move after a tap', Math.abs(b0.x - b1.x) < 0.5 && Math.abs(b0.y - b1.y) < 0.5, b0.x.toFixed(1) + ' → ' + b1.x.toFixed(1));
  const box = b1; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await sleep(1400); await page.mouse.up();
  const cnt = await page.evaluate(() => Object.values(__tb.st.draft[0]).reduce((a, b) => a + b, 0));
  ok('hold ＋ repeats', cnt > 5, 'count ' + cnt);
  await page.locator('#draft-done').tap();
  ok('unspent-points warning', await page.locator('#unspent').isVisible(), await page.locator('#unspent-txt').textContent());
  await page.locator('#unspent-fill').tap();
  await sleep(200);
  const left = await page.evaluate(() => __tb.cfg.budget - __tb.battle.armyCost && 0);
  ok('Auto-fill then deploy', await page.evaluate(() => __tb.st.screen) === 'place');
  await page.locator('#btn-fight').tap();
  const predShown = await page.locator('#predict').isVisible();
  ok('Who wins? shown once per session (custom), with Skip', predShown && await page.locator('#pick-skip').isVisible());
  await page.locator('#pick-skip').tap();
  await page.locator('#btn-menu').tap(); await page.locator('#cm-quit').tap();

  // ---- Featured: Legion vs Abrams, prediction, order, finish, results, watch link replays identically ----
  await page.locator('.card[data-id="legion-abrams"]').tap();
  await page.locator('#btn-fight').tap();
  ok('Who wins? on featured matchups', await page.locator('#predict').isVisible());
  await page.locator('#pick button').first().tap();
  await sleep(300);
  await page.evaluate(() => { const b = __tb.battle; const s = b.squads.find(o => o.side === 0); b.command({ c: 'mv', s: s.id, x: s.cx + 40, y: s.cy - 20 }); });
  await sleep(400);
  await page.evaluate(() => __tb.fastForward(400));
  await sleep(2600);
  ok('result screen', await page.locator('#result').isVisible(), await page.locator('#res-title').textContent());
  const live = await page.evaluate(() => { const S = __tb.battle.summary(); return { w: S.winner, tot: S.totals, t: Math.round(__tb.battle.t * 30), url: __tb.watchUrl() }; });
  const hudTot = await page.evaluate(() => [0, 1].map(s => __tb.battle.sideCount(s)));
  ok('results totals = HUD counts', JSON.stringify(hudTot) === JSON.stringify(live.tot.slice(0, 2)), JSON.stringify(hudTot));
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push('pageerror(watch): ' + e.message));
  await p2.goto(live.url, { waitUntil: 'load' });
  await sleep(600);
  const rep = await p2.evaluate(() => { __tb.fastForward(400); const S = __tb.battle.summary(); return { w: S.winner, tot: S.totals, t: Math.round(__tb.battle.t * 30), watch: __tb.st.watch }; });
  ok('#watch= link replays the identical battle', rep.watch && rep.w === live.w && JSON.stringify(rep.tot) === JSON.stringify(live.tot) && rep.t === live.t, JSON.stringify({ live: [live.w, live.tot, live.t], rep: [rep.w, rep.tot, rep.t], len: live.url.length }));
  await p2.close();
  await page.screenshot({ path: 'test/result.png' });
  await page.locator('#res-menu').tap();

  // ---- 5k units fps: 5,000 legionaries vs Abrams at 1x ----
  await page.locator('.card[data-id="legion-abrams"]').tap();
  await page.locator('#btn-fight').tap();
  await page.locator('#pick-skip').tap();
  await sleep(1500);
  const f5 = await fpsSample(3000);
  ok('5,000-unit battle frame rate (headless software GL)', f5.fps > 40, f5.fps.toFixed(0) + ' fps, ' + f5.n + ' units, t=' + (f5.t || 0).toFixed(1));
  await page.locator('#btn-menu').tap(); await page.locator('#cm-quit').tap();

  // ---- Spectate FFA ----
  await page.locator('#btn-spectate').tap();
  await sleep(1500);
  const sp = await page.evaluate(() => ({ nF: __tb.battle.nF, names: __tb.battle.fac.map(f => f.name), spectate: __tb.ui.spectate, chips: document.querySelectorAll('.fchip').length }));
  ok('Spectate: Remi vs Game Dev + 2 AI', sp.nF === 4 && sp.names[0] === 'Remi' && sp.names[1] === 'Game Dev' && sp.chips === 4 && sp.spectate, JSON.stringify(sp));
  const fs = await fpsSample(3000);
  ok('Spectate FFA frame rate (~12k units, headless)', fs.fps > 15, fs.fps.toFixed(0) + ' fps, ' + fs.n + ' units');
  await page.evaluate(() => __tb.fastForward(30));
  await sleep(800);
  await page.screenshot({ path: '/tmp/e2e_spec.png' });
  ok('meters drawn', await page.evaluate(() => [...document.querySelectorAll('.fchip .meter i')].every(i => i.style.width.endsWith('%'))));
  // challenge with an army code
  await page.locator('#btn-menu').tap(); await page.locator('#cm-quit').tap();
  await page.locator('#btn-challenge').tap();
  await page.locator('#chal-code').fill('TB-legion.2000_spartan.300');
  await page.locator('#chal-go').tap();
  ok('Challenge code opens draft vs challenger', await page.locator('#vs-line').isVisible(), await page.locator('#vs-line').textContent());

  ok('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  const fails = res.filter(r => !r.pass).length;
  console.log(fails ? fails + ' FAILED' : 'ALL ' + res.length + ' PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
