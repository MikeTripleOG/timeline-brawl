const path = require('path');
for (const f of ['units', 'sim', 'world', 'armies']) require(path.join(__dirname, '../js', f + '.js'));
const HB = globalThis.HB;
const f = HB.FEATURED.find(x => x.id === process.argv[2]);
const b = new HB.Battle({ armies: HB.featuredArmies(f), seed: +process.argv[3] || 1, chaos: process.argv[4] === 'chaos' });
let steps = 0;
while (!b.over && steps < 30 * 300) {
  b.step(); steps++;
  for (const e of b.fx) if (e.k === 'callout' || e.k === 'event') console.log(b.t.toFixed(1), e.text);
  b.fx.length = 0;
  if (steps % (+process.env.EVERY || 150) === 0) {
    const big = []; for (let i = 0; i < b.n; i++) if (b.alive[i] && HB.UNITS[b.ti[i]].rad >= 4) big.push(`${HB.UNITS[b.ti[i]].short} hp${b.hp[i] | 0} a${b.am1[i] > 1e8 ? 'inf' : b.am1[i] | 0}/${b.am2[i] > 1e8 ? 'inf' : b.am2[i] | 0} f${b.fuel[i] > 1e8 ? '-' : b.fuel[i] | 0} @${b.x[i] | 0},${b.y[i] | 0} fl${b.flags[i]}`);
    console.log(`t=${b.t.toFixed(0)} A=${b.sideCount(0)} B=${b.sideCount(1)} ${big.slice(0, 4).join(' | ')} sq=${b.squads.map(s => s.name + ':' + s.alive + '@' + (s.cx | 0) + ',' + (s.cy | 0)).slice(0, 4).join(' ')}`);
  }
}
console.log('winner', b.winner, b.t.toFixed(0));
