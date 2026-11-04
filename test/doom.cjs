// Forces Doomsday: checks the invasion starts, resets tech, truces, ends and restores tech.
const path = require('path');
for (const f of ['units', 'sim', 'world', 'armies']) require(path.join(__dirname, '../js', f + '.js'));
const HB = globalThis.HB;
const m = HB.makeMatch({ seed: 9, cmds: ['remi', 'gamedev', 'ai', 'ai'], budget: 20000, chaos: false, weather: 'day' });
const b = HB.battleFor(m); b.buildGrid();
for (let k = 0; k < 30 * 5; k++) b.step();
b.fac[2].nukes = 2; b.addDoom(100);
const seen = {}; let devo = 0, maxAliens = 0, t0 = b.t;
while (!b.over && b.t < t0 + 110) {
  b.step();
  for (const e of b.fx) { if (e.k === 'event') seen[e.id] = (seen[e.id] || 0) + 1; if (e.k === 'devo') devo++; }
  b.fx.length = 0;
  maxAliens = Math.max(maxAliens, b.sideCount(4));
}
const ok = seen.doomsday === 1 && seen.aliensgone === 1 && maxAliens > 0 && devo > 0;
console.log(JSON.stringify({ seen, devo, maxAliens, after: b.t - t0, invasion: !!b.invasion }), ok ? 'DOOM OK' : 'DOOM FAIL');
process.exit(ok ? 0 : 1);
