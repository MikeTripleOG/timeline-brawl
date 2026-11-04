// FFA seed search: node test/ffa.cjs [from] [count] [chaos]
const path = require('path');
for (const f of ['units', 'sim', 'world', 'armies']) require(path.join(__dirname, '../js', f + '.js'));
const HB = globalThis.HB;
const from = +process.argv[2] || 1, cnt = +process.argv[3] || 5, chaos = process.argv[4] === 'chaos';
for (let seed = from; seed < from + cnt; seed++) {
  const m = HB.makeMatch({ seed, cmds: ['remi', 'gamedev', 'ai', 'ai'], chaos });
  const b = HB.battleFor(m); b.buildGrid();
  const ev = []; let st = 0; const t0 = Date.now();
  while (!b.over && st < 30 * 400) {
    b.step(); st++;
    for (const e of b.fx) {
      if (e.k === 'betrayed') ev.push(Math.round(b.t) + 's BETRAY ' + b.fac[e.a].name + '>' + b.fac[e.b].name + (e.truce ? ' (truce)' : ''));
      else if (e.k === 'diplo' && e.type === 'ally') ev.push(Math.round(b.t) + 's ally ' + b.fac[e.a].name + '+' + b.fac[e.b].name);
      else if (e.k === 'event') ev.push(Math.round(b.t) + 's ' + e.text);
      else if (e.k === 'ability' && /EMP|NUKE|TESLA|HAARP|GLOCKE|ANTIGRAV|STARGATE|MONTAUK/.test(e.name)) ev.push(Math.round(b.t) + 's ' + b.fac[e.side].name + ':' + e.name);
    }
    b.fx.length = 0;
  }
  const s = b.summary();
  console.log(`seed ${seed} winner=${s.winner} ${s.winners.map(w => b.fac[w].name).join('+')} t=${Math.round(b.t)} ms/step=${((Date.now() - t0) / st).toFixed(2)} units=${b.n} armies=${m.armies.map(a => a.map(e => e.type + 'x' + e.count).join(',')).join(' | ')}`);
  console.log('   ' + ev.join('; '));
}
