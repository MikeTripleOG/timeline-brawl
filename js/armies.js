/* Timeline Brawl — featured matchups, army layout and AI drafting (no DOM). */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const { W, H } = HB.WORLD;
  HB.ZONES = [{ y0: 445, y1: 690 }, { y0: 10, y1: 255 }];
  HB.FEATURED = [
    { id: 'spartans-seals', title: '300 Spartans vs 10 Navy SEALs', blurb: 'Bronze shields vs 1,600 rounds. Can the phalanx close the distance?', a: [['spartan', 300]], b: [['seal', 10]] },
    { id: 'legion-abrams', title: '5,000 Legionaries vs 1 Abrams', blurb: 'Testudo vs the M1. It all comes down to how many shells are in the rack.', a: [['legion', 5000]], b: [['abrams', 1]] },
    { id: 'mongols-mg', title: 'Mongol Horse Archers vs WW1 MG Trench', blurb: '400 riders vs 6 machine guns. Feigned retreat meets the Maxim gun.', a: [['mongol', 400]], b: [['mgnest', 6]] },
    { id: 'chariots-apache', title: '2,000 Chariots vs 1 Apache', blurb: 'Same price tag. What happens when the Apache runs dry?', a: [['chariot', 2000]], b: [['apache', 1]] },
    { id: 'samurai-p51', title: '310 Samurai vs a P-51 Mustang', blurb: 'Strafing runs vs the divine wind.', a: [['samurai', 310]], b: [['p51', 1]] },
    { id: 'agincourt', title: 'Longbowmen + Pikes vs Knights & Hussars', blurb: 'Agincourt rematch with Polish wings on the guest list.', a: [['longbow', 300], ['pikemen', 150]], b: [['knight', 80], ['hussar', 40]] },
  ];
  HB.FEATURED.forEach(f => {
    f.cost = [f.a, f.b].map(arr => arr.reduce((s, [id, n]) => s + HB.UNIT[id].cost * n, 0));
  });
  function formationSize(def, count) {
    const sp = Math.max(3.6, def.rad * 2.3);
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * 2.2)));
    const rows = Math.ceil(count / cols);
    return { w: cols * sp, h: rows * sp };
  }
  HB.formationSize = formationSize;
  // entries: [{type,count}] -> adds x,y in the side's deployment zone
  HB.layoutArmy = function (entries, side) {
    const z = HB.ZONES[side];
    const front = [], back = [];
    for (const e of entries) {
      const d = HB.UNIT[e.type];
      e.fs = formationSize(d, e.count);
      (['Ranged', 'Siege', 'Air'].includes(d.role) && d.id !== 'trojan' ? back : front).push(e);
    }
    const rows = [];
    const pack = (list) => {
      let row = [], wsum = 0;
      for (const e of list) {
        if (row.length && wsum + e.fs.w + 8 > W - 10) { rows.push(row); row = []; wsum = 0; }
        row.push(e); wsum += e.fs.w + 8;
      }
      if (row.length) rows.push(row);
    };
    pack(front); pack(back);
    // stack rows from the front line backwards
    const frontY = side === 0 ? z.y0 : z.y1, dir = side === 0 ? 1 : -1;
    let off = 6;
    for (const row of rows) {
      const hmax = Math.max(...row.map(e => e.fs.h));
      const wsum = row.reduce((s, e) => s + e.fs.w + 8, -8);
      let x = W / 2 - wsum / 2;
      for (const e of row) {
        e.x = Math.max(e.fs.w / 2 + 3, Math.min(W - e.fs.w / 2 - 3, x + e.fs.w / 2));
        e.y = frontY + dir * (off + e.fs.h / 2);
        x += e.fs.w + 8;
      }
      off += hmax + 8;
    }
    // squeeze into the zone if too deep
    for (const e of entries) e.y = Math.max(z.y0 + Math.min(e.fs.h / 2, 120), Math.min(z.y1 - Math.min(e.fs.h / 2, 120), e.y));
    return entries;
  };
  HB.featuredArmies = function (f) {
    return [f.a, f.b].map((arr, side) => HB.layoutArmy(arr.map(([type, count]) => ({ type, count })), side));
  };
  HB.armyCost = (entries) => entries.reduce((s, e) => s + HB.UNIT[e.type].cost * e.count, 0);
  // AI draft: pick 1-4 unit types and spend the budget in packs
  HB.aiDraft = function (budget, rand) {
    rand = rand || Math.random;
    const pool = HB.UNITS.filter(u => !u.hidden);
    const out = {};
    let left = budget;
    const k = 1 + Math.floor(rand() * 4);
    const picks = [];
    for (let t = 0; t < 40 && picks.length < k; t++) {
      const u = pool[Math.floor(rand() * pool.length)];
      if (u.cost * u.pack <= left && !picks.includes(u)) picks.push(u);
    }
    if (!picks.length) picks.push(HB.UNIT.legion);
    // big-ticket single units first
    picks.sort((a, b) => b.cost * b.pack - a.cost * a.pack);
    for (const u of picks) if (u.cost * u.pack >= 1000 && left >= u.cost * u.pack) { out[u.id] = (out[u.id] || 0) + u.pack; left -= u.cost * u.pack; }
    let guard = 0;
    while (guard++ < 500) {
      const afford = picks.filter(u => u.cost * u.pack <= left && u.cost * u.pack < 1000);
      if (!afford.length) break;
      const u = afford[Math.floor(rand() * afford.length)];
      out[u.id] = (out[u.id] || 0) + u.pack; left -= u.cost * u.pack;
    }
    // spend leftovers on cheap infantry
    const cheap = [HB.UNIT.legion, HB.UNIT.spartan, HB.UNIT.pikemen];
    for (const u of cheap) while (left >= u.cost * u.pack) { out[u.id] = (out[u.id] || 0) + u.pack; left -= u.cost * u.pack; }
    return Object.keys(out).map(type => ({ type, count: out[type] }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
