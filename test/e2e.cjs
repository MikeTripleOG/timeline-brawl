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

  await page.goto(BASE, { waitUntil: 'load' });
  ok('page title', /Timeline Brawl/.test(await page.title()));
  ok('6 featured cards', (await page.locator('.card').count()) === 6);

  // ---- featured: chariots vs apache, live play for the screenshot ----
  await page.locator('.card[data-id="chariots-apache"]').tap();
  await sleep(300);
  ok('placement screen', await page.locator('#btn-fight').isVisible());
  await page.locator('#btn-fight').tap();
  ok('prediction modal', await page.locator('#predict').isVisible());
  await page.locator('#pick1').tap();
  await sleep(200);
  // tap-select own squad, then tap ground to move
  const pos = await page.evaluate(() => { const b = __tb.battle, s = b.squads[0], p = __tb.R.toScreen(s.cx, s.cy); return p; });
  await page.touchscreen.tap(pos.x, pos.y);
  await sleep(100);
  const sel = await page.evaluate(() => __tb.st.sel);
  ok('tap selects squad', sel === 0, 'sel=' + sel);
  const g = await page.evaluate(() => __tb.R.toScreen(120, 420));
  await page.touchscreen.tap(g.x, g.y);
  await sleep(100);
  const order = await page.evaluate(() => { const o = __tb.battle.squads[0].order; return o && o.kind; });
  ok('tap ground issues move order', order === 'move', String(order));
  // tap squad then tap enemy => attack order
  await page.touchscreen.tap(pos.x, pos.y - 10); await sleep(80);
  const ep = await page.evaluate(() => { const b = __tb.battle, s = b.squads.find(q => q.side === 1), p = __tb.R.toScreen(s.cx, s.cy); return p; });
  await page.touchscreen.tap(ep.x, ep.y); await sleep(100);
  const order2 = await page.evaluate(() => { const o = __tb.battle.squads[0].order; return o && o.kind; });
  ok('tap enemy issues attack order', order2 === 'attack', String(order2));
  // press and hold => lore ability (cooldown starts at 5-10s, so wait until ready)
  await page.waitForFunction(() => __tb.battle.squads[0].cd <= 0, null, { timeout: 20000 }).catch(() => {});
  const p2 = await page.evaluate(() => { const s = __tb.battle.squads[0]; return __tb.R.toScreen(s.cx, s.cy); });
  const before = await page.evaluate(() => __tb.battle.stats.abilities);
  await page.mouse.move(p2.x, p2.y); await page.mouse.down(); await sleep(650); await page.mouse.up();
  await sleep(150);
  const after = await page.evaluate(() => ({ a: __tb.battle.stats.abilities, cd: __tb.battle.squads[0].cd, toast: document.getElementById('toast').textContent }));
  ok('press-and-hold fires lore ability (or explains why not)', after.a > before || /★/.test(after.toast), JSON.stringify(after));
  // screenshot mid battle with an ability callout on screen
  await page.evaluate(() => __tb.setSpeed(2));
  let shot = false;
  for (let k = 0; k < 400 && !shot; k++) {
    const st = await page.evaluate(() => ({ ab: __tb.R.callouts.some(c => c.ab && c.t > 0.25 && c.t < 1.2), t: __tb.battle.t, over: __tb.battle.over, n: __tb.battle.np }));
    if (st.ab && st.t > 4 && !st.over) { await page.screenshot({ path: '/workspace/history-brawl/screenshot.png' }); shot = true; console.log('  screenshot at battle t=' + st.t.toFixed(1) + 's, projectiles in flight ' + st.n); }
    else await sleep(100);
  }
  if (!shot) await page.screenshot({ path: '/workspace/history-brawl/screenshot.png' });
  ok('mid-battle screenshot with ability callout', shot);
  // fps sample during live battle
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
  ok('frame rate sample (chariots vs apache, 2x)', fps > 20, fps.toFixed(0) + ' fps');
  // run to completion and check the result overlay
  await page.evaluate(() => __tb.fastForward(400));
  await page.waitForSelector('#result:not(.hidden)', { timeout: 8000 }).catch(() => {});
  const rt = await page.locator('#res-title').textContent().catch(() => '');
  ok('battle completes with result screen', /WINS|DRAW/.test(rt), rt + ' | ' + (await page.locator('#res-pred').textContent()) + ' | ' + (await page.locator('#res-mvp').textContent()));
  await page.screenshot({ path: '/workspace/history-brawl/test/result.png' });
  await page.locator('#res-menu').tap();

  // ---- all presets, headless-fast in page ----
  const presets = await page.evaluate(() => HB.FEATURED.map(f => f.id));
  for (const id of presets) {
    const out = await page.evaluate((id) => {
      const wins = [0, 0, 0], notes = []; const t0 = performance.now(); let steps = 0;
      for (let k = 0; k < 3; k++) {
        const f = HB.FEATURED.find(x => x.id === id);
        const b = new HB.Battle({ armies: HB.featuredArmies(f), seed: 77 + k * 1013, chaos: k === 2, weather: 'day' });
        while (!b.over) { b.step(); b.fx.length = 0; steps++; }
        wins[b.winner < 0 ? 2 : b.winner]++; notes.push((b.winner < 0 ? 'draw' : b.winner ? 'B' : 'A') + '@' + (b.t | 0) + 's');
      }
      return { wins, notes, ms: (performance.now() - t0) / steps };
    }, id);
    ok('preset ' + id + ' runs to completion', out.wins[0] + out.wins[1] + out.wins[2] === 3, 'A ' + out.wins[0] + ' / B ' + out.wins[1] + ' / draw ' + out.wins[2] + ' [' + out.notes.join(', ') + '] ' + out.ms.toFixed(2) + ' ms/step');
  }

  // ---- custom draft flow vs AI ----
  await page.locator('#btn-custom').tap();
  await sleep(150);
  for (let k = 0; k < 3; k++) await page.locator('.ucard .add').first().tap();
  await page.locator('#era-tabs button').nth(4).tap();
  await page.locator('.ucard .add').nth(1).tap();
  const budget = await page.locator('#budget-txt').textContent();
  ok('draft spends budget', !/^0 /.test(budget), budget);
  await page.locator('#draft-done').tap(); await sleep(200);
  // drag our first squad inside the zone
  const d0 = await page.evaluate(() => { const s = __tb.battle.squads[0]; return { p: __tb.R.toScreen(s.cx, s.cy), cy: s.cy }; });
  await page.mouse.move(d0.p.x, d0.p.y); await page.mouse.down(); await page.mouse.move(d0.p.x + 30, d0.p.y + 40, { steps: 5 }); await page.mouse.up();
  const d1 = await page.evaluate(() => __tb.battle.squads[0].cy);
  ok('drag squad during placement', Math.abs(d1 - d0.cy) > 1, d0.cy.toFixed(0) + ' -> ' + d1.toFixed(0));
  await page.locator('#btn-fight').tap(); await page.locator('#pick-skip').tap();
  await page.evaluate(() => __tb.fastForward(400));
  await page.waitForSelector('#result:not(.hidden)', { timeout: 8000 }).catch(() => {});
  ok('custom battle completes', /WINS|DRAW/.test(await page.locator('#res-title').textContent()));

  // ---- big battle live frame rate: 5,000 legionaries vs Abrams ----
  await page.locator('#res-menu').tap();
  await page.locator('.card[data-id="legion-abrams"]').tap(); await page.locator('#btn-fight').tap(); await page.locator('#pick0').tap();
  await sleep(4000);
  const fps2 = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r({ fps: n / 3, t: __tb.battle.t }); })(); }));
  ok('5,000-unit battle frame rate (headless, no GPU)', fps2.fps > 10, fps2.fps.toFixed(0) + ' fps, sim t=' + fps2.t.toFixed(1) + 's');

  ok('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  const fails = res.filter(r => !r.pass).length;
  console.log(fails ? fails + ' FAILED' : 'ALL PASSED (' + res.length + ')');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
