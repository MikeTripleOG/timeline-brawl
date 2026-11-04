/* Timeline Brawl — factions, alliances & betrayal, FAITH vs POWER meters, Dark Age EMP,
   nukes / Doomsday / alien invasion, future-tech lore and deterministic command replay.
   Extends HB.Battle (no DOM; runs in node too). */
(function (G) {
  'use strict';
  const HB = G.HB;
  const P = HB.Battle.prototype;
  const { W, H } = HB.WORLD;
  const C = HB.simConst, NF = C.NF, ALIEN = C.ALIEN, DT = C.DT, clamp = C.clamp;
  const { sind, cosd, hyp } = HB.dmath;
  const DEFAULT_NAMES = ['Blue', 'Red', 'Gold', 'Violet', 'Aliens'];
  HB.FAC_COLORS = ['#4da3ff', '#ff5a4a', '#ffd23a', '#c77dff', '#39ff6a'];
  HB.COMMANDERS = {
    remi: { name: 'Remi', style: 'swarm', betray: 0, accept: 0.95, desc: 'Huge ancient swarms. Loyal to a fault.' },
    gamedev: { name: 'Game Dev', style: 'tech', betray: 1, accept: 0.85, desc: 'Tech + lore combos. A schemer who may betray.' },
    ai: { name: 'AI', style: 'mixed', betray: 0.35, accept: 0.6, desc: 'Balanced and opportunistic.' },
    human: { name: 'You', style: 'human', betray: 0, accept: 0 },
    alien: { name: 'Aliens', betray: 0, accept: 0 },
  };

  // ---------- factions ----------
  P.initFactions = function () {
    const F = this.opts.factions || [];
    this.fac = [];
    for (let s = 0; s < NF; s++) {
      const f = F[s] || {};
      this.fac.push({
        id: s, name: f.name || DEFAULT_NAMES[s], cmd: s === ALIEN ? 'alien' : (f.cmd || (this.human[s] ? 'human' : 'ai')),
        morale: 70, energy: 100, dark: false, oath: false, oathT: 0, nukes: 0, msDmg: 0,
        ally: -1, allyT0: 0, ambushVs: -1, ambushT: 0, vengeVs: -1, vengeT: 0, surpriseFrom: -1, surpriseT: 0,
        betrayals: 0, truceBreaker: false, pending: null, foes: 0,
      });
    }
    this.doom = 0; this.invasion = null; this.nukeLeader = -1;
    this.nukesFlying = []; this.storms = []; this.beams = []; this.lifts = [];
    this.war = new Uint8Array(NF * NF);
    this.pendingCmds = []; this.log = []; this.replay = this.opts.cmds ? this.opts.cmds.map(c => Object.assign({}, c)) : null;
    this.diploLog = []; this.allyWinT = 0;
    this.recomputeHos();
  };
  P.recomputeHos = function () {
    const hos = this.hos, fac = this.fac;
    for (let a = 0; a < NF; a++) for (let b = 0; b < NF; b++) {
      let v = a !== b ? 1 : 0;
      if (v && a < ALIEN && b < ALIEN) {
        const fa = fac[a];
        if (fa.ally === b) v = 0;
        if (this.invasion && !this.war[a * NF + b]) v = 0;
        if (fa.surpriseT > 0 && fa.surpriseFrom === b) v = 0; // the victim has not realised yet
      }
      hos[a * NF + b] = v;
    }
  };
  P.recomputeMul = function () {
    const fac = this.fac, mul = this.mul;
    for (let a = 0; a < NF; a++) {
      const fa = fac[a];
      let base = 1;
      if (a < ALIEN && fa.ally >= 0) base *= 1 + Math.min(0.25, (this.t - fa.allyT0) * 0.004); // brothers in arms
      for (let b = 0; b < NF; b++) {
        let m = base;
        if (a < ALIEN) {
          if (fa.ambushT > 0 && fa.ambushVs === b) m *= 1.6;
          if (fa.vengeT > 0 && fa.vengeVs === b) m *= 1.35;
        } else {
          if (b === this.nukeLeader) m *= 1.8;
          if (fac[b].truceBreaker) m *= 1.3;
        }
        mul[a * NF + b] = m;
      }
    }
  };
  P.isAllied = function (a, b) { return a !== b && a < ALIEN && b < ALIEN && this.fac[a].ally === b; };
  P.backDir = function (side) {
    const h = this.homes[side] || { x: W / 2, y: H / 2 };
    const dx = h.x - W / 2, dy = h.y - H / 2, l = hyp(dx, dy);
    return l < 1 ? { x: 0, y: 1 } : { x: dx / l, y: dy / l };
  };
  P.otherSide = function (side) {
    for (let k = 1; k < this.nF; k++) { const o = (side + k) % this.nF; if (this.hos[side * NF + o] && this.sideCount(o) > 0) return o; }
    return -1;
  };
  P.enemyCount = function (side) {
    let c = 0;
    for (const s of this.squads) if (this.hos[side * NF + s.side] && !s.temp) c += s.alive;
    return c;
  };
  P.onKill = function (j, d, s, srcSq) {
    const fv = this.fac[s.side];
    if (fv && s.side < ALIEN) fv.morale -= Math.min(2, d.cost / 1500);
    if (srcSq >= 0) { const k = this.squads[srcSq]; if (k.side < ALIEN && k.side !== s.side) this.fac[k.side].morale += Math.min(1.5, 0.03 + d.cost / 2000); }
  };

  // ---------- FAITH vs POWER ----------
  P.faithCost = function (s) {
    const L = s.def.lore, f = this.fac[s.side];
    return (L.cd >= 900 ? 18 : 8) * (f.oathT > 0 ? 2 : 1);
  };
  P.payBlock = function (s) {
    const L = s.def.lore; if (!L) return 'No ability';
    const f = this.fac[s.side]; if (!f || s.side === ALIEN) return null;
    if (s.def.power) {
      if (f.dark) return 'POWER OUT: energy empty';
      const c = L.en || 15; if (f.energy < c) return 'Needs ' + c + ' energy';
    } else {
      const c = this.faithCost(s); if (f.morale < c) return 'Faith wavers (morale ' + Math.floor(f.morale) + ')';
    }
    return null;
  };
  P.pay = function (s) {
    const f = this.fac[s.side]; if (!f || s.side === ALIEN) return;
    if (s.def.power) f.energy -= s.def.lore.en || 15; else f.morale -= this.faithCost(s);
  };
  P.activate = function (s, manual) {
    const f = this.fac[s.side];
    if (!s.def.power && f && f.oathT > 0 && this.rand() < 0.35) {
      s.cd = Math.min(s.def.lore.cd, 10); s.abT = 1; f.morale -= this.faithCost(s) * 0.5;
      this.emit({ k: 'callout', text: 'THE GODS TURN AWAY (OATHBREAKER)', x: s.cx, y: s.cy, color: '#999', big: true, side: s.side });
      return false;
    }
    const ok = this.activateCore(s, manual);
    if (ok) {
      this.pay(s); s.abFx = 1.2;
      this.emit({ k: 'ability', sq: s.id, x: s.cx, y: s.cy, side: s.side, color: HB.ERAS[s.def.era].color, name: s.def.lore.name, manual: !!manual });
    } else if (manual) this.emit({ k: 'deny', sq: s.id, side: s.side, msg: 'No valid target in range' });
    return ok;
  };
  P.updateMeters = function () {
    const nF = this.nF, pc = new Float64Array(NF);
    for (let i = 0; i < this.n; i++) if (this.alive[i]) {
      const d = HB.UNITS[this.ti[i]];
      if (d.powered && (d.veh || d.air) && !(this.flags[i] & (C.F_LANDED | C.F_TEMPLAND))) pc[this.side[i]] += d.cost;
    }
    let hosDirty = false;
    for (let s = 0; s < nF; s++) {
      const f = this.fac[s];
      f.energy += 0.5 * (0.4 - 0.3 * pc[s] / 10000);
      f.morale += 0.15;
      f.energy = clamp(f.energy, 0, 100); f.morale = clamp(f.morale, 0, 100);
      const h = this.homes[s];
      if (!f.dark && f.energy <= 0.01 && pc[s] > 0) { f.dark = true; this.emit({ k: 'callout', text: 'POWER OUT: ' + f.name.toUpperCase() + ' GOES DARK', x: h.x, y: h.y, color: '#5fd0ff', big: true, side: s }); this.emit({ k: 'ticker', text: '⚡ ' + f.name + ' ran out of energy: vehicles and powered weapons go dark' }); }
      if (f.dark && f.energy >= 20) { f.dark = false; this.emit({ k: 'callout', text: 'POWER RESTORED', x: h.x, y: h.y, color: '#5fd0ff', big: true, side: s }); }
      for (const k of ['oathT', 'ambushT', 'vengeT']) if (f[k] > 0) f[k] -= 0.5;
      if (f.surpriseT > 0) { f.surpriseT -= 0.5; if (f.surpriseT <= 0) hosDirty = true; }
    }
    if (hosDirty) this.recomputeHos();
    // shields regenerate
    for (const s of this.squads) if (s.def.shield && s.alive > 0 && s.shieldOffT <= 0) s.shield = Math.min(s.def.shield, s.shield + 10);
  };

  // ---------- diplomacy ----------
  P.diplomacy = function () {
    const alive = [], vals = [];
    for (let s = 0; s < this.nF; s++) { vals.push(this.sideValue(s)); if (this.sideCount(s) > 0) alive.push(s); }
    if (alive.length < 2) return;
    for (const s of alive) { const f = this.fac[s]; if (f.pending) { f.pending.T -= 2; if (f.pending.T <= 0) { this.emit({ k: 'ticker', text: f.name + ' let ' + this.fac[f.pending.from].name + "'s alliance offer lapse" }); f.pending = null; } } }
    let strongest = alive[0]; for (const s of alive) if (vals[s] > vals[strongest]) strongest = s;
    if (!this.invasion && alive.length >= 3 && this.t > 5) {
      for (const a of alive) {
        const fa = this.fac[a];
        if (fa.cmd === 'human' || fa.oath || fa.ally >= 0) continue;
        if (this.rand() > 0.3) continue;
        if (a === strongest && this.rand() > 0.2) continue;
        const cands = alive.filter(b => b !== a && this.fac[b].ally < 0 && !this.fac[b].oath && !this.fac[b].pending);
        if (!cands.length) continue;
        let pick = -1; for (const b of cands) if (b !== strongest && (pick < 0 || vals[b] > vals[pick])) pick = b;
        if (pick < 0) pick = cands[0];
        this.propose(a, pick);
      }
    }
    for (const a of alive) {
      const fa = this.fac[a], CM = HB.COMMANDERS[fa.cmd] || HB.COMMANDERS.ai;
      if (fa.cmd === 'human' || !CM.betray) continue;
      if (this.invasion) {
        if (this.t - this.invasion.t0 > 15 && this.rand() < 0.03 * CM.betray) {
          let v = -1; for (const b of alive) if (b !== a && !this.war[a * NF + b] && (v < 0 || vals[b] < vals[v])) v = b;
          if (v >= 0) this.betray(a, v);
        }
        continue;
      }
      if (fa.ally < 0) continue;
      const b = fa.ally, age = this.t - fa.allyT0; if (age < 12) continue;
      const others = alive.filter(x => x !== a && x !== b).length;
      let p = CM.betray * 0.015;
      if (!others) p = CM.betray * 0.4;
      if (vals[b] < vals[a] * 0.65) p += CM.betray * 0.06;
      if (age > 40) p += CM.betray * 0.03;
      if (this.rand() < p) this.betray(a, b);
    }
  };
  P.propose = function (a, b) {
    const fa = this.fac[a], fb = this.fac[b];
    if (a === b || fa.oath || fb.oath || fa.ally >= 0 || fb.ally >= 0 || this.invasion) {
      if (fb.oath && fa.cmd === 'human') this.emit({ k: 'deny', side: a, msg: fb.name + ' is an Oathbreaker. Nobody allies with them.' });
      else if (fa.oath && fa.cmd === 'human') this.emit({ k: 'deny', side: a, msg: 'Nobody trusts an Oathbreaker.' });
      return;
    }
    if (fb.cmd === 'human') { fb.pending = { from: a, T: 10 }; this.emit({ k: 'diplo', type: 'offer', a, b }); return; }
    const CM = HB.COMMANDERS[fb.cmd] || HB.COMMANDERS.ai;
    if (this.rand() < CM.accept) this.makeAlliance(a, b);
    else this.emit({ k: 'diplo', type: 'reject', a, b, text: fb.name + ' rejects ' + fa.name + "'s alliance" });
  };
  P.makeAlliance = function (a, b) {
    const fa = this.fac[a], fb = this.fac[b];
    fa.ally = b; fb.ally = a; fa.allyT0 = fb.allyT0 = this.t; fa.pending = fb.pending = null;
    this.diploLog.push({ t: this.t, type: 'ally', a, b });
    this.emit({ k: 'diplo', type: 'ally', a, b, big: true, text: '🤝 ' + fa.name + ' & ' + fb.name + ' form an alliance' });
    this.recomputeHos();
  };
  P.betray = function (a, b) {
    const fa = this.fac[a], fb = this.fac[b];
    const allied = fa.ally === b, truce = !!this.invasion;
    if (!allied && !truce) return false;
    const age = allied ? this.t - fa.allyT0 : 0;
    if (allied) { fa.ally = -1; fb.ally = -1; }
    if (truce) { this.war[a * NF + b] = 1; this.war[b * NF + a] = 1; fa.truceBreaker = true; }
    fb.surpriseFrom = a; fb.surpriseT = 3;
    fa.ambushVs = b; fa.ambushT = 6;
    const se = fb.energy * 0.3, sm = fb.morale * 0.3;
    fb.energy -= se; fb.morale -= sm; fa.energy += se; fa.morale += sm;
    const k = truce ? 2 : 1;
    fa.morale = Math.max(0, fa.morale - 25 * k); fa.energy = Math.max(0, fa.energy - 15 * k);
    fa.oath = true; fa.oathT = 45 * k; fa.betrayals++;
    fb.vengeVs = a; fb.vengeT = 60;
    this.diploLog.push({ t: this.t, type: 'betray', a, b, age, truce });
    this.stats.events.push('betrayed');
    this.emit({ k: 'betrayed', a, b, age, truce, big: true, slow: 1.5, text: '🗡 ' + fa.name + ' BETRAYED ' + fb.name + (allied ? ' after a ' + Math.round(age) + 's alliance' : ' during the truce') });
    this.recomputeHos();
    return true;
  };

  // ---------- de-evolution ----------
  P.setForm = function (o, lvl) {
    const base = HB.UNITS[o.baseTi], chain = HB.DEVO[base.id] || [];
    lvl = clamp(lvl, 0, chain.length);
    const nd = lvl === 0 ? base : HB.UNIT[chain[lvl - 1]], od = o.def, oldLvl = o.lvl;
    if (nd === od) { o.lvl = lvl; return false; }
    if (oldLvl === 0 && lvl > 0) { o.saved = new Map(); for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === o.id) o.saved.set(i, [this.am1[i], this.am2[i], this.fuel[i], this.flags[i]]); }
    for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === o.id) {
      const hf = clamp(this.hp[i] / od.hp, 0.05, 1);
      this.ti[i] = nd.idx; this.hp[i] = hf * nd.hp;
      let fl = this.flags[i] & ~(C.F_LANDED | C.F_TEMPLAND | C.F_RTB | C.F_DRYMSG | C.F_FUELMSG | C.F_STEALTH);
      if (lvl === 0 && o.saved && o.saved.has(i)) {
        const r = o.saved.get(i); this.am1[i] = r[0]; this.am2[i] = r[1]; this.fuel[i] = r[2];
        fl |= r[3] & (C.F_DRYMSG | C.F_FUELMSG | C.F_LANDED | C.F_RTB);
      } else { this.am1[i] = nd.w1 ? (nd.w1.ammo || 1e9) : 0; this.am2[i] = nd.w2 ? (nd.w2.ammo || 1e9) : 0; this.fuel[i] = nd.fuel || 1e9; }
      if (nd.tagset.stealth) fl |= C.F_STEALTH;
      this.flags[i] = fl; this.tgt[i] = -1; this.cd1[i] = 0.5; this.cd2[i] = 0.5;
    }
    if (lvl === 0) o.saved = null;
    o.ti = nd.idx; o.def = nd; o.name = nd.short; o.lvl = lvl; o.shield = 0; o.hist = null;
    o.cd = nd.lore ? Math.min(nd.lore.cd >= 900 ? 999 : nd.lore.cd, 8) : 999;
    this.emit({ k: 'devo', x: o.cx, y: o.cy, from: od.short, to: nd.short, up: lvl < oldLvl, color: HB.ERAS[nd.era].color, side: o.side });
    return true;
  };
  P.doDarkEmp = function (s, x, y) {
    const R = 200;
    this.emit({ k: 'empflash', x, y, r: R, big: true });
    this.emit({ k: 'event', id: 'darkemp', text: 'DARK AGE EMP', sub: 'Every powered unit in the blast is knocked back through time, yours too', color: '#ffffff', big: true, slow: 1.4 });
    const mh = new Float64Array(NF); let bestEra = -1, bestV = -1, n = 0;
    for (const o of this.squads) {
      if (o.alive <= 0 || o.side === ALIEN) continue;
      const dx = o.cx - x, dy = o.cy - y, d2 = dx * dx + dy * dy;
      if (d2 > (R + 15) * (R + 15)) continue;
      const base = HB.UNITS[o.baseTi], chain = HB.DEVO[base.id];
      if (o.def.era === 0 && o.lvl === 0) continue; // ancient: immune
      if (chain && (o.def.powered || o.lvl > 0) && o.lvl < chain.length) {
        const k = d2 < (R * 0.55) * (R * 0.55) ? 2 : 1;
        const nl = Math.min(chain.length, o.lvl + k);
        if (this.setForm(o, nl)) {
          n++; o.devoT = 30; o.devoStep = 30;
          const v = o.def.cost * o.alive; if (v > bestV) { bestV = v; bestEra = o.def.era; }
        }
      } else if (o.def.era <= 2) mh[o.side] += 6;
    }
    for (let f = 0; f < this.nF; f++) if (mh[f]) this.fac[f].morale -= Math.min(20, mh[f]);
    if (bestEra >= 0) this.emit({ k: 'callout', text: 'KNOCKED BACK TO THE ' + HB.AGE_NAMES[bestEra] + '!', x, y, color: '#ffffff', big: true, slow: 1.2, ability: true });
    this.emit({ k: 'ticker', text: '⚪ ' + this.fac[s.side].name + "'s Dark Age EMP de-evolved " + n + ' squads' });
    this.addDoom(15);
  };
  P.powValue = function (o) { return o.def.cost * o.alive; };
  P.empTarget = function (s) {
    let best = null, bs = 2500;
    for (const o of this.squads) {
      if (o.alive <= 0 || !this.hos[s.side * NF + o.side] || o.side === ALIEN || !o.def.powered || !HB.DEVO[o.def.id]) continue;
      if (hyp(o.cx - s.cx, o.cy - s.cy) > 480) continue;
      let sc = 0;
      for (const q of this.squads) {
        if (q.alive <= 0 || !q.def.powered || !HB.DEVO[q.def.id]) continue;
        if (hyp(q.cx - o.cx, q.cy - o.cy) > 200) continue;
        sc += this.hos[s.side * NF + q.side] ? this.powValue(q) : -0.6 * this.powValue(q);
      }
      if (sc > bs) { bs = sc; best = { x: o.cx, y: o.cy }; }
    }
    return best;
  };
  P.nukeTarget = function (s) {
    let best = null, bs = 1500;
    for (const o of this.squads) {
      if (o.alive <= 0 || !this.hos[s.side * NF + o.side] || o.temp) continue;
      if (hyp(o.cx - s.cx, o.cy - s.cy) > 480) continue;
      let sc = 0;
      for (const q of this.squads) {
        if (q.alive <= 0 || q.temp) continue;
        if (hyp(q.cx - o.cx, q.cy - o.cy) > 80) continue;
        sc += (this.hos[s.side * NF + q.side] ? 1 : -1.3) * q.def.cost * q.alive;
      }
      if (sc > bs) { bs = sc; best = { x: o.cx, y: o.cy }; }
    }
    return best;
  };
  P.clusterTarget = function (s, R, minN, ground) {
    let best = null, bv = 0;
    for (const o of this.squads) {
      if (o.alive <= 0 || !this.hos[s.side * NF + o.side] || o.temp || o.def.tagset.ghost) continue;
      if (ground && o.def.air) continue;
      if (hyp(o.cx - s.cx, o.cy - s.cy) > R) continue;
      const v = o.def.cost * o.alive;
      if ((o.alive >= minN || v >= 1500) && v > bv) { bv = v; best = o; }
    }
    return best;
  };
  P.squadUnits = function (s) { const out = []; for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) out.push(i); return out; };

  // ---------- doomsday ----------
  P.addDoom = function (x) {
    if (this.invasion || this.over) return;
    this.doom = Math.min(100, this.doom + x);
    if (this.doom >= 100) this.startInvasion();
  };
  P.startInvasion = function () {
    let ml = -1, mn = 0; for (let s = 0; s < this.nF; s++) if (this.fac[s].nukes > mn) { mn = this.fac[s].nukes; ml = s; }
    this.nukeLeader = ml; this.doom = 100;
    this.invasion = { T: 80, dur: 80, t0: this.t, spawnT: 10, ms: -1 };
    this.stats.events.push('doomsday');
    this.emit({ k: 'event', id: 'doomsday', text: 'THEY HAVE ARRIVED', sub: 'Automatic truce. Every army vs the mothership. All tech reset to the old ways.', color: '#39ff6a', big: true, slow: 1.6 });
    for (const o of this.squads) {
      if (o.alive <= 0 || o.side === ALIEN) continue;
      const chain = HB.DEVO[HB.UNITS[o.baseTi].id];
      if (chain) { o.devoLock = true; this.setForm(o, chain.length); }
    }
    const ms = this.addSquad(ALIEN, HB.UNIT.mothership.idx, 1, W / 2, H / 2 - 30, { label: 'Mothership', cd: 999 });
    this.invasion.ms = ms.id;
    this.addSquad(ALIEN, HB.UNIT.aliendrone.idx, 14, W / 2, H / 2 + 10, { label: 'Alien Drones', cd: 999 });
    if (ml >= 0) this.emit({ k: 'ticker', text: '☢ The aliens single out ' + this.fac[ml].name + ' for using the most nukes' });
    this.recomputeHos();
  };
  P.endInvasion = function (killed) {
    for (const o of this.squads) if (o.side === ALIEN) for (const i of this.squadUnits(o)) { this.emit({ k: 'warp', x: this.x[i], y: this.y[i] }); this.kill(i, -1, 0, true); }
    let top = -1, td = 0; for (let s = 0; s < this.nF; s++) if (this.fac[s].msDmg > td && this.sideCount(s) > 0) { td = this.fac[s].msDmg; top = s; }
    this.emit({ k: 'event', id: 'aliensgone', text: killed ? 'MOTHERSHIP DOWN!' : 'THEY HAVE LEFT', sub: (top >= 0 ? this.fac[top].name + ' hit it hardest and gets its tech back first. ' : '') + 'The truce is over.', color: '#39ff6a', big: true, slow: 1.2 });
    this.invasion = null; this.doom = 0; this.war.fill(0); this.nukeLeader = -1;
    for (const o of this.squads) if (o.devoLock) {
      o.devoLock = false;
      if (o.side === top) this.setForm(o, 0); else { o.devoT = 12; o.devoStep = 12; }
    }
    this.recomputeHos();
  };

  // ---------- per-tick world update ----------
  P.updateWorld = function () {
    const tk = this.tick;
    this.recomputeMul();
    if (tk % 15 === 0) this.updateMeters();
    if (this.nF >= 3 && tk % 60 === 30) this.diplomacy();
    // nukes in flight
    for (let k = this.nukesFlying.length - 1; k >= 0; k--) {
      const nk = this.nukesFlying[k]; nk.T -= DT;
      if (nk.T <= 0) { this.nukesFlying.splice(k, 1); this.detonate(nk); }
    }
    // HAARP storms
    for (let k = this.storms.length - 1; k >= 0; k--) {
      const st = this.storms[k]; st.T -= DT;
      if (st.T <= 0) { this.storms.splice(k, 1); continue; }
      if (tk % 5 === 0) {
        const a = this.rand() * 6.283, r = Math.sqrt(this.rand()) * st.r, px = st.x + cosd(a) * r, py = st.y + sind(a) * r;
        this.emit({ k: 'bolt', x: px, y: py });
        this.query(px, py, 11, (j) => { if (this.side[j] !== st.side) this.damage(j, 26, C.SHELL, st.sq); return false; });
      }
    }
    // Tesla beams
    for (let k = this.beams.length - 1; k >= 0; k--) {
      const bm = this.beams[k]; bm.T -= DT;
      if (bm.T <= 0 || !this.alive[bm.i] || !this.alive[bm.j]) { this.beams.splice(k, 1); continue; }
      this.damage(bm.j, 300 * DT, C.MISSILE, bm.sq);
      if (tk % 2 === 0) this.emit({ k: 'tesla', x1: this.x[bm.i], y1: this.y[bm.i], x2: this.x[bm.j], y2: this.y[bm.j] });
    }
    // antigravity drops
    for (let k = this.lifts.length - 1; k >= 0; k--) {
      const lf = this.lifts[k]; lf.T -= DT;
      if (lf.T > 0) continue;
      this.lifts.splice(k, 1);
      for (const j of lf.list) if (this.alive[j]) {
        const d = HB.UNITS[this.ti[j]]; this.hp[j] -= d.hp * 0.3; this.flash[j] = 0.2; this.flags[j] &= ~C.F_LIFT;
        if (this.hp[j] <= 0) this.kill(j, lf.sq, C.CRUSH); else if ((j & 3) === 0) this.emit({ k: 'dust', x: this.x[j], y: this.y[j] });
      }
    }
    if (tk % 15 === 0) {
      for (const o of this.squads) {
        if (o.alive <= 0) continue;
        if (o.def.lore && o.def.lore.id === 'montauk') {
          (o.hist || (o.hist = [])).push(this.squadUnits(o).map(i => [i, this.x[i], this.y[i], this.hp[i]]));
          if (o.hist.length > 11) o.hist.shift();
        }
        if (o.lvl > 0 && !o.devoLock) {
          o.devoT -= 0.5;
          if (o.devoT <= 0) { this.setForm(o, o.lvl - 1); o.devoT = o.devoStep; }
        }
      }
    }
    if (this.invasion) {
      const inv = this.invasion; inv.T -= DT; inv.spawnT -= DT;
      const ms = this.squads[inv.ms];
      if (inv.spawnT <= 0 && ms && ms.alive > 0) { inv.spawnT = 10; this.addSquad(ALIEN, HB.UNIT.aliendrone.idx, 8, ms.cx, ms.cy + 20, { label: 'Alien Drones', cd: 999 }); }
      if (inv.T <= 0 || !ms || ms.alive <= 0) this.endInvasion(!ms || ms.alive <= 0);
    }
  };
  P.detonate = function (nk) {
    const R = 80, f = this.fac[nk.side];
    this.emit({ k: 'nuke', x: nk.x, y: nk.y, r: R, big: true });
    this.emit({ k: 'event', id: 'nuke', text: 'TACTICAL NUKE', sub: f.name + ' went nuclear. Doomsday draws closer…', color: '#ffb347', big: true, slow: 1.6 });
    this.query(nk.x, nk.y, R, (j, d2) => {
      const d = HB.UNITS[this.ti[j]]; if (d.tagset.ghost) return false;
      const k = 1 - 0.65 * Math.sqrt(d2) / R;
      this.hp[j] -= (d.veh || d.rad >= 5 ? d.hp * 0.85 : d.hp * 3) * k; this.flash[j] = 0.3;
      if (this.hp[j] <= 0) this.kill(j, nk.sq, C.MISSILE);
      return false;
    });
    this.fires.push({ x: nk.x, y: nk.y, r: 50, t: 10, dps: 5, side: -1, sq: nk.sq });
    f.nukes++;
    for (let s = 0; s < this.nF; s++) this.fac[s].morale -= 8;
    this.emit({ k: 'ticker', text: '☢ ' + f.name + ' launched a tactical nuke (Doomsday +40)' });
    this.addDoom(40);
  };
  P.montauk = function (s) {
    if (!s.hist || s.hist.length < 6) return false;
    const snap = s.hist[0];
    for (const [i, x, y, hp] of snap) if (this.alive[i] && this.sq[i] === s.id) {
      this.emit({ k: 'warp', x: this.x[i], y: this.y[i] });
      this.x[i] = x; this.y[i] = y; this.hp[i] = Math.max(this.hp[i], Math.min(hp, HB.UNITS[this.ti[i]].hp));
      this.emit({ k: 'warp', x, y });
    }
    s.invulnT = 1.5; s.hist = [];
    return true;
  };

  // ---------- future/modern lore ----------
  P.condExt = function (s, id, dist, tgt) {
    switch (id) {
      case 'tesla': return this.bigTargetNear(s, 420, 100) >= 0;
      case 'haarp': return !!this.clusterTarget(s, 340, 12);
      case 'glocke': return !!tgt && dist < 200 && tgt.alive >= 3;
      case 'antigrav': return !!this.clusterTarget(s, 280, 6, true);
      case 'stargate': return this.squads.some(o => this.hos[s.side * NF + o.side] && o.alive > 0 && (o.invisT > 0 || o.def.tagset.stealth || o.def.tagset.decoy)) || (s.engT > 0 && this.enemiesNear(s.cx, s.cy, 150, s.side) >= 6);
      case 'darkemp': return !!this.empTarget(s);
      case 'nuke': return !!this.nukeTarget(s);
    }
    return false;
  };
  P.activateExt = function (s, id, manual, out) {
    switch (id) {
      case 'tesla': {
        const j = this.bigTargetNear(s, 420, 1); if (j < 0) return false;
        const us = this.squadUnits(s); if (!us.length) return false;
        this.beams.push({ i: us[0], j, T: 2, sq: s.id });
        const vf = this.fac[this.side[j]]; if (vf) vf.energy = Math.max(0, vf.energy - 8);
        this.addDoom(4); return true;
      }
      case 'haarp': {
        const o = this.clusterTarget(s, 380, 1); if (!o) return false;
        this.storms.push({ x: o.cx, y: o.cy, r: 70, T: 6, side: s.side, sq: s.id });
        this.emit({ k: 'storm', x: o.cx, y: o.cy, r: 70 });
        this.addDoom(5); return true;
      }
      case 'glocke': {
        const o = this.squads[s.tgt]; if (!o || o.alive <= 0) return false;
        let dx = o.cx - s.cx, dy = o.cy - s.cy; const dl = hyp(dx, dy) || 1, r = Math.min(dl, 170);
        const x = s.cx + dx / dl * r, y = s.cy + dy / dl * r;
        let c = 0;
        this.query(x, y, 55, (j) => {
          if (this.sq[j] === s.id) return false;
          const d = HB.UNITS[this.ti[j]];
          this.stunT[j] = Math.max(this.stunT[j], d.veh || d.hover ? 2 : 4); this.flags[j] |= C.F_FROZEN; c++;
          return false;
        });
        this.emit({ k: 'freeze', x, y, r: 55 });
        this.addDoom(5); return c > 0;
      }
      case 'antigrav': {
        const o = this.clusterTarget(s, 300, 1, true); if (!o) return false;
        const list = [];
        this.query(o.cx, o.cy, 60, (j) => {
          if (!this.hos[s.side * NF + this.side[j]] || this.airborne(j)) return false;
          const d = HB.UNITS[this.ti[j]]; if (d.hover || d.item || d.tagset.ghost) return false;
          this.stunT[j] = Math.max(this.stunT[j], 2.5); this.flags[j] |= C.F_LIFT; list.push(j); return false;
        });
        if (!list.length) return false;
        this.lifts.push({ T: 2.5, list, sq: s.id });
        this.emit({ k: 'lift', x: o.cx, y: o.cy, r: 60 });
        return true;
      }
      case 'stargate': {
        let rev = 0;
        for (let i = 0; i < this.n; i++) if (this.alive[i] && this.hos[s.side * NF + this.side[i]]) {
          if (this.flags[i] & C.F_STEALTH) { this.revealT[i] = 8; rev++; }
          if ((this.flags[i] & C.F_DECOY) && hyp(this.x[i] - s.cx, this.y[i] - s.cy) < 300) { this.kill(i, s.id, 0); rev++; }
        }
        for (const o of this.squads) if (o.alive > 0 && this.hos[s.side * NF + o.side]) {
          if (o.invisT > 0) { o.invisT = 0; rev++; }
          if (hyp(o.cx - s.cx, o.cy - s.cy) < 150 && !(o.def.era <= 2 && this.fac[o.side].morale >= 70) && !o.def.veh) o.disorderT = 3;
        }
        this.emit({ k: 'psy', x: s.cx, y: s.cy, r: 150 });
        return true;
      }
      case 'darkemp': { const t = this.empTarget(s); if (!t) return false; this.doDarkEmp(s, t.x, t.y); return true; }
      case 'nuke': {
        const t = this.nukeTarget(s); if (!t) return false;
        this.nukesFlying.push({ x: t.x, y: t.y, T: 2.5, side: s.side, sq: s.id, sx: s.cx, sy: s.cy });
        this.emit({ k: 'nukewarn', x: t.x, y: t.y, r: 80, sx: s.cx, sy: s.cy, big: true });
        return true;
      }
    }
    return false;
  };

  // ---------- commands: every player input goes through here so replays are exact ----------
  P.command = function (c) {
    if (this.replay) return;
    if (c.x != null) c.x = Math.round(c.x * 10) / 10;
    if (c.y != null) c.y = Math.round(c.y * 10) / 10;
    this.pendingCmds.push(c);
  };
  P.applyCmds = function () {
    if (this.replay) { while (this.replay.length && this.replay[0].k <= this.tick) this.execCmd(this.replay.shift()); return; }
    if (!this.pendingCmds.length) return;
    for (const c of this.pendingCmds) { c.k = this.tick; this.log.push(c); this.execCmd(c); }
    this.pendingCmds.length = 0;
  };
  P.execCmd = function (c) {
    const s = c.s != null ? this.squads[c.s] : null;
    switch (c.c) {
      case 'mv': if (s && s.alive > 0) s.order = { kind: 'move', x: clamp(c.x, 4, W - 4), y: clamp(c.y, 4, H - 4), t: 25 }; break;
      case 'at': if (s && s.alive > 0 && this.squads[c.t]) { s.order = { kind: 'attack', sq: c.t, t: 30 }; s.tgt = c.t; } break;
      case 'ab': if (s) { const r = this.tryAbility(c.s); if (!r.ok) this.emit({ k: 'deny', sq: c.s, side: s.side, msg: r.msg }); } break;
      case 'pr': this.propose(c.a, c.b); break;
      case 'ac': { const f = this.fac[c.a]; if (f.pending && f.pending.from === c.b && !this.fac[c.b].oath) this.makeAlliance(c.b, c.a); f.pending = null; break; }
      case 'dc': { const f = this.fac[c.a]; if (f.pending) this.emit({ k: 'diplo', type: 'reject', a: c.b, b: c.a, text: f.name + ' rejects ' + this.fac[c.b].name + "'s alliance" }); f.pending = null; break; }
      case 'bt': this.betray(c.a, c.b); break;
    }
  };

  // ---------- end & results ----------
  P.checkEnd = function () {
    const alive = [];
    for (let s = 0; s < this.nF; s++) if (this.sideCount(s) > 0) alive.push(s);
    let w = -2, winners = null;
    if (this.invasion) { if (!alive.length) w = -1; }
    else if (!alive.length) w = -1;
    else if (alive.length === 1) w = alive[0];
    else {
      if (alive.length === 2 && this.isAllied(alive[0], alive[1])) {
        this.allyWinT += 0.5;
        if (this.allyWinT >= 20) { winners = alive.slice(); w = this.sideValue(alive[0]) >= this.sideValue(alive[1]) ? alive[0] : alive[1]; this.alliedWin = true; }
      } else this.allyWinT = 0;
      if (w === -2 && this.t > (this.opts.timeLimit || 300)) {
        let best = -1, bv = -1, second = -1;
        for (const s of alive) { const v = this.sideValue(s) / Math.max(1, this.startValue[s]); if (v > bv) { second = bv; bv = v; best = s; } else if (v > second) second = v; }
        w = bv - second < 0.02 ? -1 : best; this.timeout = true;
      }
    }
    if (w !== -2) { this.over = true; this.winner = w; this.winners = winners || (w >= 0 ? [w] : []); this.emit({ k: 'end', winner: w, winners: this.winners, big: true }); }
  };
  P.summary = function () {
    const sq = this.squads.filter(s => s.side !== ALIEN && (!s.def.hidden || s.label));
    const mvp = sq.filter(s => !s.def.tagset.decoy).sort((a, b) => (b.kv - a.kv) || (b.dmg - a.dmg))[0];
    const sides = []; for (let s = 0; s < this.nF; s++) sides.push(s);
    return {
      winner: this.winner, winners: this.winners || [], alliedWin: !!this.alliedWin, time: this.t, timeout: !!this.timeout, nF: this.nF,
      factions: sides.map(s => { const f = this.fac[s]; return { name: f.name, cmd: f.cmd, oath: f.oath, nukes: f.nukes, betrayals: f.betrayals, msDmg: f.msDmg, alive: this.sideCount(s) }; }),
      // per-side tally from exactly the same squads the HUD counts (defectors count for the side they joined)
      survivors: sides.map(side => this.squads.filter(s => s.side === side && !s.temp).map(s => ({
        name: (s.label || HB.UNITS[s.baseTi].name) + (s.traitorOf != null ? ' (from ' + this.fac[s.traitorOf].name + ')' : '') + (s.lvl > 0 ? ' [as ' + s.def.short + ']' : ''),
        alive: s.alive, n0: s.n0, kills: s.kills, kv: s.kv }))),
      totals: sides.map(s => this.sideCount(s)),
      mvp: mvp ? { name: mvp.label || HB.UNITS[mvp.baseTi].name, side: mvp.side, kills: mvp.kills, kv: mvp.kv } : null,
      events: this.stats.events.slice(), abilities: this.stats.abilities, diplo: this.diploLog.slice(),
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
