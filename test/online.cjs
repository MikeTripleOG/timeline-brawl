// Two-browser online test: node test/online.cjs [baseUrl] [local|ntfy]
//  local = BroadcastChannel relay (two tabs, one browser context); ntfy = real ntfy.sh relay + WebRTC (two separate contexts)
const PW = process.env.PW || '/workspace/frontline-game/tools/node_modules/playwright-core';
const { chromium } = require(PW);
const BASE = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const MODE = process.argv[3] || 'local';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(f, ms, step = 250) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await f(); if (v) return v; } catch (e) { /* page busy */ } await sleep(step); } return null; }
(async () => {
  const br = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const opt = { viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true };
  const cA = await br.newContext(opt), cB = MODE === 'local' ? cA : await br.newContext(opt);
  const url = BASE + (MODE === 'local' ? '?relay=local' : '');
  const errs = []; const watch = (pg, n) => { pg.on('console', m => { if (m.type() === 'error') errs.push(n + ': ' + m.text()); }); pg.on('pageerror', e => errs.push(n + ' PAGEERR ' + e.message)); };
  const A = await cA.newPage(); watch(A, 'host');
  await A.goto(url); await sleep(600);
  await A.evaluate(() => { __tb.HB.Net.rate = 4; __tb.host(0); });
  const code = await until(() => A.evaluate(() => __tb.CP.online && __tb.CP.online.code), 5000);
  console.log('room', code, 'relay', MODE);
  ok(await until(() => A.evaluate(() => /Room open/.test(__tb.CP.online.status)), 15000), 'host opens a room on the relay');
  ok(await A.isVisible('#roomCode') && (await A.textContent('#roomCode')).trim() === code && await A.isVisible('[data-a=copy]') && /#room=/.test(await A.textContent('#roomLink')), 'host sees the room code, the link and a Copy link button');
  ok(await A.isVisible('[data-a=share]'), 'Share… sits next to Copy link (falls back to copying when the browser cannot share)');
  let B = await cB.newPage(); watch(B, 'guest');
  await B.goto(url + '#room=' + code); await sleep(300);
  await B.evaluate(() => { __tb.HB.Net.rate = 4; });
  ok(await until(() => B.isVisible('[data-a=seat][data-i="1"]'), 20000), 'guest joins via the #room link and sees free seats');
  await B.click('[data-a=seat][data-i="1"]');
  ok(await until(() => A.evaluate(() => __tb.CP.online.lobby.seats[1] != null), 20000), 'host sees the guest take Northgard');
  await until(() => A.isEnabled('[data-a=start]'), 5000); await A.click('[data-a=start]');
  ok(await until(() => B.evaluate(() => __tb.screen() === 'map' && __tb.CP.st && __tb.CP.st.turn === 1), 20000), 'guest receives the campaign state');
  const hashes = async () => Promise.all([A, B].map(p => p.evaluate(() => __tb.HB.Campaign.hash(__tb.CP.st))));
  let [hA, hB] = await hashes(); ok(hA === hB, 'turn 1 state hashes match (' + hA + ')');
  // both pages: dismiss treaty/cover modals automatically, auto-resolve AI battles, toggle Auto in live battles
  const helper = () => { setInterval(() => {
    const q = (s) => document.querySelector(s), vis = (e) => e && e.offsetParent !== null;
    if (vis(q('#coverGo'))) q('#coverGo').click();
    if (vis(q('[data-a=auto]'))) q('[data-a=auto]').click();
    else if (vis(q('[data-a=no]'))) q('[data-a=no]').click();
    else if (__tb.screen() === 'battle' && __tb.BR.b && __tb.BR.b.over && vis(q('[data-a=done]'))) q('[data-a=done]').click();
    if (__tb.screen() === 'battle' && __tb.BR.lock && !window.__autoOn && !window.__holdAuto) { window.__autoOn = 1; q('#bAuto').click(); }
    if (__tb.screen() !== 'battle') window.__autoOn = 0;
  }, 300); };
  await A.evaluate(() => { window.__holdAuto = 1; }); await B.evaluate(() => { window.__holdAuto = 1; }); // keep the first battle alive until the guest's order is checked
  await A.evaluate(helper); await B.evaluate(helper);
  // turn 1: host marches Thornwood's army into Frostmere (the guest's province) => a human-vs-human battle
  await A.evaluate(() => { const st = __tb.CP.st, a = st.armies.find(x => x.f === 0 && x.p === 1); __tb.CP.draft.mv[a.id] = 3; });
  await A.click('#bEnd'); await B.click('#bEnd');
  ok(await until(() => A.evaluate(() => __tb.screen() === 'battle' && !!__tb.BR.lock), 30000), 'host enters the live battle');
  ok(await until(() => B.evaluate(() => __tb.screen() === 'battle' && !!__tb.BR.lock && __tb.BR.lock.ready), 30000), 'guest enters the same battle (lockstep)');
  await sleep(4000);
  const mode = await A.evaluate(() => __tb.BR.lock && (__tb.BR.lock.fallback ? 'relay fallback' : __tb.BR.lock.open() ? 'WebRTC DataChannel' : 'connecting'));
  console.log('  lockstep transport:', mode);
  // give the guest a manual order through lockstep too
  const gid = await B.evaluate(() => { const b = __tb.BR.b, r = b.regs.find(r => r.side === __tb.BR.ctl[0] && r.st === 0 && r.def.forms.length > 1); __tb.BR.lock.send({ c: 'fm', s: r.id, m: r.def.forms[r.def.forms.length - 1] }); return r.id; });
  ok(await until(() => A.evaluate((id) => __tb.BR.b && __tb.BR.b.log.some(c => c.c === 'fm' && c.s === id), gid), 60000), 'the guest\'s order reaches the host through lockstep');
  await A.evaluate(() => { window.__holdAuto = 0; }); await B.evaluate(() => { window.__holdAuto = 0; });
  const t0 = Date.now();
  const done = await until(() => A.evaluate(() => __tb.screen() !== 'battle' || (__tb.BR.b && __tb.BR.b.over)), 420000, 1000);
  console.log('  battle took', Math.round((Date.now() - t0) / 1000), 's real time');
  ok(done, 'live battle finishes');
  const net = await B.evaluate(() => ({ ok: __tb.CP.online.hashOk || 0, bad: __tb.CP.online.desyncs || 0, syncs: __tb.CP.online.syncs || 0 }));
  ok(net.ok > 0 && net.bad === 0, `no desync in the live battle (${net.ok} hash checks passed, ${net.bad} desyncs, ${net.syncs} syncs)`);
  ok(await until(async () => { [hA, hB] = await hashes(); return hA === hB && await A.evaluate(() => __tb.CP.st.turn) >= 2; }, 120000, 1000), 'turn 2: both browsers agree on the state (' + hA + ')');
  const log = await A.evaluate(() => __tb.CP.st.log.filter(l => l.t === 1).map(l => l.text));
  console.log('  chronicle:', log.filter(t => /Frostmere/.test(t)).join(' / '));
  // a closed tab rejoins
  await B.reload(); await sleep(500); await B.evaluate(() => { __tb.HB.Net.rate = 4; }); await B.evaluate(helper);
  ok(await until(() => B.evaluate(() => __tb.screen() === 'map' && __tb.CP.st && __tb.CP.online.seat === 1), 30000), 'guest reloads the tab and rejoins its seat');
  // two more turns
  for (let t = 0; t < 2; t++) {
    const turn = await A.evaluate(() => __tb.CP.st.turn);
    await until(() => A.evaluate(() => !__tb.CP.waiting && __tb.CP.st.phase === 'orders' && __tb.screen() === 'map' && !document.querySelector('#modal.on')), 60000);
    await until(() => B.evaluate(() => !__tb.CP.waiting && __tb.CP.st.phase === 'orders' && __tb.screen() === 'map' && !document.querySelector('#modal.on')), 60000);
    await A.click('#bEnd'); await B.click('#bEnd');
    const adv = await until(async () => { [hA, hB] = await hashes(); return hA === hB && await A.evaluate((n) => __tb.CP.st.turn > n || __tb.CP.st.over, turn) && await B.evaluate((n) => __tb.CP.st.turn > n || __tb.CP.st.over, turn); }, 420000, 1000);
    ok(adv, `turn ${turn} → ${turn + 1}: states match (${hA})`);
    if (!adv) for (const [n, P] of [['host', A], ['guest', B]]) console.log('   ', n, JSON.stringify(await P.evaluate(() => ({ turn: __tb.CP.st.turn, phase: __tb.CP.st.phase, screen: __tb.screen(), waiting: !!__tb.CP.waiting, orders: Object.keys(__tb.CP.st.orders || {}), battles: (__tb.CP.st.battles || []).map(b => [b.p, b.done, b.live]), modal: !!document.querySelector('#modal.on'), last: __tb.CP.st.log.slice(-3).map(l => l.text) }))));
  }
  const bytes = await A.evaluate(() => __tb.CP.online.relay.bytes || 0);
  if (bytes) console.log('  relay bytes sent by host:', bytes);
  await A.screenshot({ path: '/tmp/shots/online-host.png' }); await B.screenshot({ path: '/tmp/shots/online-guest.png' });
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 4).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await br.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
