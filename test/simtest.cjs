// Headless balance runner: node test/simtest.cjs [runs] [chaos]
const path = require('path');
for (const f of ['units', 'sim', 'armies']) require(path.join(__dirname, '../js', f + '.js'));
const HB = globalThis.HB;
const runs = +process.argv[2] || 6, chaos = process.argv[3] === 'chaos';
const only = process.argv[4];
const res = {};
for (const f of HB.FEATURED) {
  if (only && f.id !== only) continue;
  const r = res[f.id] = { A: 0, B: 0, draw: 0, times: [], notes: [] };
  for (let k = 0; k < runs; k++) {
    const t0 = Date.now();
    const b = new HB.Battle({ armies: HB.featuredArmies(f), seed: 1000 + k * 7919, chaos, weather: 'day' });
    let steps = 0;
    const ammoLog = [];
    while (!b.over && steps < 30 * 300) {
      b.step(); steps++;
      for (const e of b.fx) if (e.k === 'callout' && /AMMO|FUEL|LANDED|DESTROYED|RETURNING/.test(e.text)) ammoLog.push(Math.round(b.t) + 's ' + e.text);
      b.fx.length = 0;
    }
    const s = b.summary();
    if (s.winner === 0) r.A++; else if (s.winner === 1) r.B++; else r.draw++;
    r.times.push(Math.round(b.t));
    r.notes.push(`w=${s.winner} t=${Math.round(b.t)}s ${s.timeout ? 'TIMEOUT ' : ''}A=${s.survivors[0].map(x => x.alive + '/' + x.n0).join(',')} B=${s.survivors[1].map(x => x.alive + '/' + x.n0).join(',')} ev=${s.events.join('|')} abil=${s.abilities} ms/step=${((Date.now() - t0) / steps).toFixed(2)} ${ammoLog.slice(0, 4).join('; ')}`);
  }
}
for (const id in res) { console.log(`== ${id}: A ${res[id].A} / B ${res[id].B} / draw ${res[id].draw}`); res[id].notes.forEach(n => console.log('   ' + n)); }
