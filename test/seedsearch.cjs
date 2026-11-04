// Find a spectate seed with a betrayal + (Dark Age EMP or alien invasion). node test/seedsearch.cjs from count
const path = require('path');
for (const f of ['units', 'sim', 'world', 'armies']) require(path.join(__dirname, '../js', f + '.js'));
const HB = globalThis.HB;
const from = +process.argv[2] || 1, cnt = +process.argv[3] || 5;
for (let seed = from; seed < from + cnt; seed++) {
  const m = HB.makeMatch({ seed, cmds: ['remi', 'gamedev', 'ai', 'ai'], budget: 20000, chaos: true, weather: 'day' });
  const b = HB.battleFor(m); b.buildGrid();
  const ev = []; let st = 0, bet = -1, emp = -1, inv = -1, nuke = -1;
  while (!b.over && st < 30 * 150) {
    b.step(); st++;
    for (const e of b.fx) {
      if (e.k === 'betrayed' && bet < 0) bet = b.t;
      if (e.k === 'empflash' && emp < 0) emp = b.t;
      if (e.k === 'nuke' && nuke < 0) nuke = b.t;
      if (e.k === 'event' && e.id === 'doomsday' && inv < 0) inv = b.t;
      if (e.k === 'event' && e.id === 'aliens' && inv < 0) inv = b.t;
    }
    b.fx.length = 0;
  }
  const r = (x) => x < 0 ? '-' : Math.round(x);
  console.log(`seed ${seed} end=${b.over ? Math.round(b.t) : '>150'} betray=${r(bet)} emp=${r(emp)} nuke=${r(nuke)} aliens=${r(inv)} winner=${b.winner}`);
}
