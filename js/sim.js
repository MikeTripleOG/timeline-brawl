/* Timeline Brawl v3 — deterministic regiment simulation (no DOM).
   Regiments with facing, formation, cohesion, momentum, fatigue and morale fight on generated terrain. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const DT = 1 / 20, MON = 4, NS = 5;
  const W = 800, H = 1000, CS = 10, GW = W / CS, GH = H / CS;
  HB.WORLD = { W, H, DT, MON, NS, CS };

  // Deterministic math: only + - * / and sqrt, so replays match on every device/engine.
  const PI = 3.141592653589793, TAU = 6.283185307179586, HPI = 1.5707963267948966;
  function sin(x) {
    x = x - TAU * Math.floor(x / TAU + 0.5);
    if (x > HPI) x = PI - x; else if (x < -HPI) x = -PI - x;
    const x2 = x * x;
    return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156))))));
  }
  function cos(x) { return sin(x + HPI); }
  function atand(z) { const z2 = z * z; return z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.01172120))))); }
  function atan2(y, x) {
    if (x === 0 && y === 0) return 0;
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    let a = ax >= ay ? atand(ay / ax) : HPI - atand(ax / ay);
    if (x < 0) a = PI - a;
    return y < 0 ? -a : a;
  }
  const hyp = (x, y) => Math.sqrt(x * x + y * y);
  const wrap = (a) => a - TAU * Math.floor(a / TAU + 0.5);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  HB.dmath = { sin, cos, atan2, hyp, wrap, clamp };
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  HB.makeRng = makeRng;

  // ---------- terrain ----------
  function makeTerrain(seed, nF, kind) {
    const rnd = makeRng((seed ^ 0x51ed27) >>> 0);
    const elev = new Float32Array(GW * GH), forest = new Uint8Array(GW * GH), water = new Uint8Array(GW * GH);
    const hills = [], woods = [], villages = [];
    const nh = kind === 'hills' ? 4 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < nh; k++) hills.push({ x: 120 + rnd() * (W - 240), y: 200 + rnd() * (H - 400), r: 70 + rnd() * 70, h: 0.6 + rnd() * 0.4 });
    const nw = kind === 'woods' ? 3 + Math.floor(rnd() * 2) : kind === 'snow' ? 1 : 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < nw; k++) {
      const left = rnd() < 0.5;
      woods.push({ x: left ? 40 + rnd() * 200 : W - 40 - rnd() * 200, y: 250 + rnd() * (H - 500), r: 45 + rnd() * 45 });
    }
    if (kind !== 'siege' && rnd() < 0.6) villages.push({ x: 160 + rnd() * (W - 320), y: H / 2 + (rnd() - 0.5) * 300, r: 40 + rnd() * 20 });
    let river = null;
    const wantRiver = kind === 'river' || (kind !== 'open' && nF === 2 && rnd() < 0.45);
    if (wantRiver) {
      const fords = [];
      const nf = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < nf; k++) fords.push(90 + (k + 0.25 + rnd() * 0.5) * ((W - 180) / nf));
      river = { y: H / 2 + (rnd() - 0.5) * 60, a: 18 + rnd() * 22, k: 0.006 + rnd() * 0.006, ph: rnd() * 6, hw: 13, fords, fw: 30 };
    }
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      const x = gx * CS + 5, y = gy * CS + 5, i = gy * GW + gx;
      let e = 0;
      for (const h of hills) { const d = hyp(x - h.x, y - h.y) / h.r; if (d < 1) e = Math.max(e, h.h * (1 - d * d)); }
      elev[i] = e;
      for (const w of woods) {
        const wob = 1 + 0.18 * sin(x * 0.07 + w.x) * cos(y * 0.06 + w.y);
        if (hyp(x - w.x, (y - w.y) * 0.8) < w.r * wob) forest[i] = 1;
      }
      for (const v of villages) if (hyp(x - v.x, y - v.y) < v.r) forest[i] = 2;
      if (river) {
        const ry = river.y + river.a * sin(x * river.k + river.ph);
        if (Math.abs(y - ry) < river.hw) { water[i] = river.fords.some(f => Math.abs(x - f) < river.fw) ? 2 : 1; forest[i] = 0; }
      }
    }
    if (kind === 'siege') { forest.fill(0); }
    return { elev, forest, water, hills, woods, villages, river };
  }
  HB.makeTerrain = makeTerrain;
  function cell(T, x, y) { const gx = clamp((x / CS) | 0, 0, GW - 1), gy = clamp((y / CS) | 0, 0, GH - 1); return gy * GW + gx; }

  // ---------- deployment zones ----------
  function zonesFor(n) {
    if (n <= 2) return [{ x0: 60, x1: W - 60, y0: H - 230, y1: H - 40, f: -HPI }, { x0: 60, x1: W - 60, y0: 40, y1: 230, f: HPI }];
    const z = [{ x0: 170, x1: W - 170, y0: H - 190, y1: H - 30, f: -HPI }, { x0: 170, x1: W - 170, y0: 30, y1: 190, f: HPI },
      { x0: 20, x1: 180, y0: 260, y1: H - 260, f: 0 }, { x0: W - 180, x1: W - 20, y0: 260, y1: H - 260, f: PI }];
    return z.slice(0, n);
  }
  HB.zonesFor = zonesFor;

  // ---------- regiment geometry ----------
  function formOf(r) { return HB.FORMS[r.form]; }
  function geom(r) {
    const d = r.def, F = formOf(r), n = Math.max(1, Math.ceil(r.n));
    const sp = d.sp * F.sp;
    let files, ranks;
    if (d.cls === 'ele' || d.cls === 'sie' || d.cls === 'mon') { files = n; ranks = 1; }
    else if (r.form === 'square') { files = Math.ceil(Math.sqrt(n)); ranks = files; }
    else if (r.form === 'testudo') { files = Math.ceil(Math.sqrt(n * 1.6)); ranks = Math.ceil(n / files); }
    else if (r.form === 'wedge') { files = Math.ceil(Math.sqrt(n * 1.4)); ranks = Math.ceil(n / files); }
    else if (r.form === 'column') { files = d.cls === 'cav' ? 4 : 6; ranks = Math.ceil(n / files); }
    else {
      let rk = F.ranks; if (d.cls === 'cav') rk = r.form === 'line' ? 2 : 2; if (d.cls === 'msl') rk = r.form === 'line' ? 3 : 2;
      ranks = Math.min(rk, n); files = Math.ceil(n / ranks); ranks = Math.ceil(n / files);
    }
    r.files = files; r.ranks = ranks;
    if (d.ram || d.tower) { r.files = 4; r.ranks = 2; r.W = d.ram ? 12 : 20; r.D = d.ram ? 28 : 22; return; }
    r.W = d.cls === 'mon' ? 34 : Math.max(sp, files * sp); r.D = d.cls === 'mon' ? 34 : Math.max(sp, ranks * sp * (d.cls === 'cav' ? 1.5 : 1));
  }
  function ext(r, ux, uy) { // half extent of the regiment rectangle along unit vector u
    const fx = cos(r.f), fy = sin(r.f);
    const a = ux * fx + uy * fy, b = -ux * fy + uy * fx;
    return (a < 0 ? -a : a) * r.D / 2 + (b < 0 ? -b : b) * r.W / 2;
  }
  function zoneOf(def, ax, ay) { // where point a sits relative to regiment def's facing: 0 front, 1 flank, 2 rear
    const ang = Math.abs(wrap(atan2(ay - def.y, ax - def.x) - def.f));
    return ang < 0.85 ? 0 : ang < 2.2 ? 1 : 2;
  }
  HB.geom = geom; HB.zoneOf = zoneOf;

  const ZMUL = [1, 1.5, 2.2], ZSHOCK = [1, 2.2, 3.5], ZNAME = ['front', 'flank', 'rear'];
  const BUFFS = ['mars', 'stand', 'charge2', 'nopanic', 'berserk', 'tengri', 'sun', 'shaka', 'curse', 'ambush'];

  class Battle {
    constructor(o) {
      this.opts = o; this.seed = o.seed >>> 0;
      this.rand = makeRng(this.seed || 1);
      this.t = 0; this.tick = 0; this.over = false; this.winner = -1; this.winners = []; this.alliedWin = false; this.timeout = false;
      this.weather = o.weather || 'clear'; this.tmax = o.tmax || (o.armies.length > 2 ? 420 : 300); this.title = o.title || '';
      this.nF = Math.max(2, Math.min(4, o.armies.length));
      this.zones = zonesFor(this.nF);
      this.homes = this.zones.map(z => ({ x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 }));
      this.T = makeTerrain(this.seed, this.nF, o.siege ? 'siege' : o.terrain);
      this.S = null; if (o.siege && this.initSiege) this.initSiege(o.siege);
      this.fx = []; this.log = []; this.replay = !!o.cmds; this.net = !!o.net; this.cmdQ = o.cmds ? o.cmds.slice().sort((a, b) => a.k - b.k) : []; this.cmdI = 0; this.pending = [];
      this.hos = new Uint8Array(NS * NS);
      for (let a = 0; a < NS; a++) for (let b = 0; b < NS; b++) this.hos[a * NS + b] = a !== b && a < this.nF + 1 && b < this.nF + 1 ? 1 : 0;
      this.regs = []; this.contacts = new Map(); this.prevContacts = new Map();
      this.fac = [];
      const facs = o.factions || [];
      for (let s = 0; s < this.nF; s++) {
        const fi = facs[s] || {};
        this.fac.push({ name: fi.name || HB.SIDE_NAMES[s], color: fi.color || HB.SIDE_COLORS[s], faction: fi.faction || 'rome', cmd: fi.cmd || (s === 0 ? 'human' : 'ai'), auto: fi.cmd !== 'human',
          faith: 30, curseCd: 15, ally: -1, allyT0: 0, oath: false, vengeT: 0, vengeOn: -1, betrayals: 0, pending: null, kills: 0, lost: 0, msDmg: 0 });
        if (fi.oath) this.fac[s].oath = true;
        if (fi.vengeOn != null && fi.vengeOn >= 0) { this.fac[s].vengeT = 9999; this.fac[s].vengeOn = fi.vengeOn; }
        this.spawnArmy(s, o.armies[s] || []);
      }
      this.men0 = this.regs.reduce((a, r) => a + r.n0, 0);
      this.deaths = 0; this.bloodshed = 0; this.wrath = null; this.wrathDone = false; this.curses = 0; this.wrathOk = !!o.wrath; // the gods only stir when the campaign has earned it
      this.fogs = []; this.winds = []; this.events = []; this.diplo = []; this.allyWinT = 0;
      this.ai = HB.makeAI ? this.fac.map((f, s) => HB.makeAI(this, s)) : [];
      this.stats = { abilities: 0, charges: 0, rearCharges: 0, flankHits: 0, routs: 0, rallies: 0 };
    }
    // entries: [{t: rosterIndex | type, x, y, f?}] using the side's faction roster
    spawnArmy(s, entries) {
      const fac = HB.FACTION[this.fac[s].faction] || HB.FACTIONS[0], z = this.zones[s];
      entries.forEach((e, ei) => {
        const ro = typeof e.r === 'number' ? fac.roster[e.r] : null;
        const r = this.addReg(s, ro ? ro.t : e.t, ro, e.x, e.y, e.f != null ? e.f : z.f);
        if (e.h != null && e.h < 100) { r.n = Math.max(1, Math.round(r.n0 * e.h / 100)); geom(r); }
        if (e.m && r.def.forms.includes(e.m)) { r.form = e.m; geom(r); } // formation chosen during deployment
        r.ei = ei; // index of the army entry this regiment came from (deployment writes back to it)
      });
    }
    addReg(side, type, ro, x, y, f) {
      const base = HB.TYPES[type], m = (ro && ro.m) || {};
      const def = Object.assign({}, base);
      for (const k of ['atk', 'def', 'chg', 'mor', 'rdm', 'rng', 'brace']) if (m[k]) def[k] = (def[k] || 0) * m[k];
      const r = { id: this.regs.length, side, type, def, name: (ro && ro.name) || base.role, lore: ro && ro.lore || null,
        n: base.men, n0: base.men, x, y, f, form: base.forms[0], morale: def.mor, coh: 1, fat: 0, mom: 0, st: 0, rallies: 0, routT: 0,
        order: null, ammo: def.ammo || 0, rcd: 1 + (this.rand() * 1.5), cd: 6, pilum: def.pilum ? 1 : 0, kills: 0, buf: {}, hp: def.hp || 0,
        vx: 0, vy: 0, moving: 0, hidden: 0, engaged: 0, waver: 0, panic: 0, lastHit: -9, autoT: 0, hold: 0 };
      if (def.cls === 'mon') { r.form = 'line'; r.morale = 999; }
      geom(r); this.regs.push(r); return r;
    }

    // ---------- helpers ----------
    hostile(a, b) { return this.hos[a * NS + b] === 1; }
    allied(a, b) { return a !== b && a < this.nF && b < this.nF && this.fac[a].ally === b; }
    friendly(a, b) { return a === b || this.allied(a, b); }
    alive(r) { return r.st !== 2; }
    elevAt(x, y) { return this.T.elev[cell(this.T, x, y)]; }
    forestAt(x, y) { return this.T.forest[cell(this.T, x, y)] === 1; }
    villageAt(x, y) { return this.T.forest[cell(this.T, x, y)] === 2; }
    waterAt(x, y) { return this.T.water[cell(this.T, x, y)]; }
    riverY(x) { const R = this.T.river; return R.y + R.a * sin(x * R.k + R.ph); }
    emit(f) { this.fx.push(f); }
    callout(text, x, y, color, big) { this.emit({ k: 'callout', text, x, y, color: color || '#ffe9b0', big: !!big }); }
    sideStrength(s) { let n = 0; for (const r of this.regs) if (r.side === s && r.st === 0) n += r.n; return Math.round(n); }
    sideCount(s) { let n = 0; for (const r of this.regs) if (r.side === s && r.st !== 2) n += r.n; return Math.round(n); }
    unbroken(s) { for (const r of this.regs) if (r.side === s && r.st === 0) return true; return false; }
    visibleTo(r, viewer) {
      if (viewer < 0 || r.side === viewer || this.friendly(r.side, viewer) || r.side === MON) return true;
      if (!r.hidden) return true;
      for (const o of this.regs) if (o.st === 0 && this.friendly(o.side, viewer) && hyp(o.x - r.x, o.y - r.y) < 60 + o.W / 2) return true;
      return false;
    }
    fatMul(r) { return r.fat > 40 ? Math.max(0.55, 1 - (r.fat - 40) / 120) : 1; }
    effForm(r, key) { const v = formOf(r)[key]; return lerp(1, v, r.coh); }
    atkMul(a, b) {
      const da = a.def, db = b.def; let m = da.atk * this.effForm(a, 'atk') * this.fatMul(a) * (0.6 + 0.4 * a.coh);
      if (a.buf.mars > 0) m *= 1.4; if (a.buf.berserk > 0) m *= 2; if (a.buf.sun > 0 && da.cls === 'inf') m *= 1.5; if (a.buf.curse > 0) m *= 0.7;
      if (a.waver) m *= 0.85;
      const bc = db.cls;
      if (da.brace > 0 && (bc === 'cav' || bc === 'ele')) m *= da.brace >= 3 ? 2 : 1.6;
      if (da.cls === 'cav' && (bc === 'msl' || bc === 'sie')) m *= 1.8;
      if (da.cls === 'ele' && (bc === 'inf' || bc === 'cav' || bc === 'msl')) m *= 1.3;
      if (bc === 'sie') m *= 2;
      if (da.cls === 'cav' && bc === 'ele') m *= 0.6;
      const fa = this.fac[a.side], fb = this.fac[b.side];
      if (fa && fb) {
        if (fa.vengeT > 0 && fa.vengeOn === b.side) m *= 1.35;
        if (a.buf.ambush > 0 && fa.ambushOn === b.side) m *= 1.6;
        if (fa.ally >= 0) m *= 1 + Math.min(0.2, (this.t - fa.allyT0) / 300);
        if (fa.oath && a.lore) m *= 0.95;
      }
      m *= 1 + 0.6 * clamp(this.elevAt(a.x, a.y) - this.elevAt(b.x, b.y), -0.6, 0.6);
      return m;
    }
    defMul(b, zone) {
      const db = b.def; let m = db.def * this.fatMul(b) * (zone === 0 ? this.effForm(b, 'front') : this.effForm(b, 'flank'));
      if (b.buf.stand > 0 && zone === 0) m *= 2; if (b.buf.berserk > 0) m *= 0.7;
      if (this.waterAt(b.x, b.y) === 2) m *= 0.75;
      if (b.st === 1) m *= 0.4;
      return m;
    }
    braced(b, zone) {
      if (b.st !== 0 || b.def.brace <= 0 || b.coh < 0.4 || this.waterAt(b.x, b.y)) return 0;
      const br = formOf(b).brace;
      let k = br === 'all' ? 1 : br === 'front' && zone === 0 ? 1 : br === 'stand' && zone === 0 && !b.moving ? 0.55 : 0;
      return k * b.def.brace * b.coh;
    }

    // ---------- commands (replayable) ----------
    command(c) {
      if (this.replay || this.net || this.over) return;
      const o = Object.assign({}, c);
      if (o.x != null) o.x = Math.round(o.x); if (o.y != null) o.y = Math.round(o.y);
      if (o.f != null) o.f = Math.round(o.f);
      this.pending.push(o);
    }
    // lockstep / host-authoritative online play: commands arrive in tick-stamped frames
    feed(cmds) { for (const c of cmds) this.cmdQ.push(c); }
    hash() { // cheap FNV-1a over the state that matters, for desync checks
      let h = 0x811c9dc5 | 0; const mix = (v) => { h ^= v | 0; h = Math.imul(h, 16777619); };
      mix(this.tick);
      for (const r of this.regs) { mix(Math.round(r.x * 8)); mix(Math.round(r.y * 8)); mix(Math.round(r.n * 64)); mix(Math.round(r.morale * 16)); mix(r.st); mix(Math.round(r.coh * 256)); }
      for (const f of this.fac) mix(Math.round(f.faith * 16));
      if (this.S) for (const sg of this.S.segs) mix(Math.round(sg.hp * 8));
      return h >>> 0;
    }
    applyCmds() {
      if (this.net) { while (this.cmdI < this.cmdQ.length && this.cmdQ[this.cmdI].k <= this.tick) { const c = this.cmdQ[this.cmdI++]; this.log.push(c); this.exec(c); } return; }
      if (this.replay) { while (this.cmdI < this.cmdQ.length && this.cmdQ[this.cmdI].k <= this.tick) this.exec(this.cmdQ[this.cmdI++]); return; }
      for (const c of this.pending) { c.k = this.tick; this.log.push(c); this.exec(c); }
      this.pending.length = 0;
    }
    exec(c) {
      const r = c.s != null ? this.regs[c.s] : null;
      switch (c.c) {
        case 'mv': if (r && r.st === 0) { r.order = { k: 'mv', x: c.x, y: c.y, f: c.f != null && c.f > -900 ? c.f * PI / 180 : null }; r.hold = 0; } break;
        case 'at': { const t = this.regs[c.t]; if (r && r.st === 0 && t && this.alive(t)) {
          if (!this.hostile(r.side, t.side)) { this.emit({ k: 'deny', side: r.side, msg: this.wrath ? 'Truce! The gods are watching.' : 'Not an enemy' }); break; }
          r.order = { k: 'at', t: t.id }; r.hold = 0; } break; }
        case 'fm': if (r && r.st === 0 && r.def.forms.includes(c.m)) this.setForm(r, c.m); break;
        case 'ab': if (r) this.activate(r, true); break;
        case 'cu': { const t = this.regs[c.t]; if (t) this.curse(c.a, t, true); break; }
        case 'pr': this.propose(c.a, c.b); break;
        case 'ac': this.accept(c.a, c.b); break;
        case 'dc': { const f = this.fac[c.a]; if (f.pending && f.pending.from === c.b) { f.pending = null; this.diploEv('decline', c.b, c.a, f.name + ' declines ' + this.fac[c.b].name + "'s alliance"); } break; }
        case 'bt': if (this.fac[c.a].ally === c.b) this.betray(c.a, c.b); break;
        case 'au': this.fac[c.a].auto = !!c.on; break;
        case 'wl': if (r && r.st === 0 && this.S && this.S.segs[c.w]) { r.order = { k: 'wl', w: c.w }; r.hold = 0; } break;
      }
    }
    setForm(r, m) {
      if (r.form === m) return;
      const old = r.form; r.form = m; geom(r);
      r.coh = Math.min(r.coh, r.engaged ? 0.45 : 0.75); r.mom = 0;
      this.emit({ k: 'form', id: r.id, from: old, to: m });
    }

    // ---------- the tick ----------
    step() {
      if (this.over) return;
      this.applyCmds();
            for (let s = 0; s < this.nF; s++) if (this.fac[s].auto && this.ai[s] && (this.tick + s * 5) % 20 === 0) this.ai[s].think();
      if (this.wrath && this.wrath.mon) this.monsterThink();
      if (this.S) this.siegeStep();
      this.findContacts();
      this.melee();
      this.missiles();
      this.move();
      this.updateState();
      if (this.tick % 20 === 0) { this.updateMeters(); if (this.nF >= 3) this.diplomacy(); this.checkEnd(); }
      this.t += DT; this.tick++;
    }

    findContacts() {
      const R = this.regs, C = this.contacts; this.prevContacts = C; this.contacts = new Map();
      for (const r of R) { r.engaged = 0; r.cs = null; }
      for (let i = 0; i < R.length; i++) {
        const a = R[i]; if (a.st === 2) continue;
        for (let j = i + 1; j < R.length; j++) {
          const b = R[j]; if (b.st === 2 || !this.hostile(a.side, b.side)) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy); if (d > 140) continue;
          if (this.S && this.wallBetween(a, b)) continue;
          const ux = d > 0 ? dx / d : 1, uy = d > 0 ? dy / d : 0;
          const gap = d - ext(a, ux, uy) - ext(b, -ux, -uy);
          if (gap < 2) {
            (a.cs || (a.cs = [])).push(b); (b.cs || (b.cs = [])).push(a);
            if (a.st === 0) a.engaged = 1; if (b.st === 0) b.engaged = 1;
            const key = i * 4096 + j; this.contacts.set(key, 1);
            if (!this.prevContacts.has(key)) { this.impact(a, b); this.impact(b, a); }
          }
        }
      }
    }
    // charge impact on first contact
    impact(a, b) {
      if (a.st !== 0 || a.mom < 0.35 || a.def.chg < 0.6 || a.def.cls === 'mon' || b.def.cls === 'mon') return;
      const zone = zoneOf(b, a.x, a.y);
      let chg = a.def.chg * this.effForm(a, 'chg') * a.mom * (a.buf.charge2 > 0 ? 2 : 1) * (1 + 0.9 * clamp(this.elevAt(a.x, a.y) - this.elevAt(b.x, b.y), -0.5, 0.5));
      const fr = Math.min(a.files, a.def.cls === 'ele' ? a.files : b.files + 3);
      const br = this.braced(b, zone);
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      this.stats.charges++;
      if ((a.def.cls === 'cav' || a.def.cls === 'ele') && br >= 1) {
        const loss = Math.min(a.n * 0.75, b.files * br * a.mom * 0.5 / a.def.def * (a.def.cls === 'ele' ? 0.25 : 1));
        this.hurt(a, loss, b, 0, 0.8);
        a.morale -= 20 * a.mom; a.coh = Math.max(0, a.coh - 0.5); a.mom = 0; a.buf.charge2 = 0;
        this.hurt(b, fr * chg * 0.08 / b.def.def, a, 0, 0.5);
        this.emit({ k: 'impact', x: cx, y: cy, zone: 0, braced: 1, side: a.side, vs: b.side, power: loss, ang: a.f });
        this.callout('BRACED!', cx, cy - 10, '#ffe08a');
        return;
      }
      if (br > 0) chg /= 1 + br;
      let dmg = fr * chg * ZMUL[zone] / this.defMul(b, zone) * 0.5;
      if (a.def.cls === 'ele') dmg *= 0.75;
      dmg = Math.min(dmg, b.n * 0.65);
      this.hurt(b, dmg, a, zone, 0);
      const shock = (8 + dmg / b.n0 * 50) * ZSHOCK[zone] / this.depthK(b) * (1 - 0.6 * clamp(this.elevAt(b.x, b.y) - this.elevAt(a.x, a.y), 0, 0.6));
      if (!(b.buf.stand > 0 || b.buf.berserk > 0)) b.morale -= shock;
      b.coh = Math.max(0, b.coh - [0.25, 0.5, 0.85][zone]);
      a.fat += 8; a.buf.charge2 = 0;
      const f = this.fac[a.side]; if (f) f.faith = Math.min(100, f.faith + 3 + zone * 2);
      if (zone === 2) this.stats.rearCharges++; else if (zone === 1) this.stats.flankHits++;
      this.emit({ k: 'impact', x: cx, y: cy, zone, side: a.side, vs: b.side, power: dmg, ang: atan2(b.y - a.y, b.x - a.x), cav: a.def.cls !== 'inf' ? 1 : 0, id: b.id });
      if (zone === 2) this.callout('REAR CHARGE!', cx, cy - 12, '#ffcf4a', true);
      else if (zone === 1) this.callout('FLANKED!', cx, cy - 12, '#ffb04a', true);
      else if (dmg > 10) this.callout('CHARGE!', cx, cy - 10, '#ffe9b0');
      a.mom = 0.15;
    }
    depthK(r) { return clamp(r.ranks / 4, 0.75, 1.5); }
    hurt(b, loss, a, zone, moraleK) {
      if (loss <= 0 || b.st === 2) return;
      if (b.def.cls === 'mon') {
        b.hp -= loss * 2; if (a && a.side < this.nF) { this.fac[a.side].msDmg += loss * 2; }
        if (a) a.kills += loss * 0.1; return;
      }
      if (b.def.mass) loss /= b.def.mass; // one elephant soaks the blows of several men
      loss = Math.min(loss, b.n);
      b.n -= loss; this.deaths += loss; b.lastHit = this.t;
      if (a) { a.kills += loss; if (a.side < this.nF) { const fa = this.fac[a.side]; fa.kills += loss; fa.faith = Math.min(100, fa.faith + loss * 0.1); } }
      if (b.side < this.nF) this.fac[b.side].lost += loss;
      if (moraleK && !(b.buf.stand > 0 || b.buf.berserk > 0)) b.morale -= loss / b.n0 * 100 * moraleK * ZSHOCK[zone] / this.depthK(b) * (b.def.mass ? 0.55 : 1) * (1 - 0.5 * clamp(this.elevAt(b.x, b.y) - (a ? this.elevAt(a.x, a.y) : 0), 0, 0.6));
      if (b.n < 1) { b.n = 0; this.killReg(b, a); }
    }
    killReg(b, a) {
      if (b.st === 2) return;
      const was = b.st; b.st = 2; b.n = 0; b.order = null;
      this.emit({ k: 'destroyed', id: b.id, x: b.x, y: b.y, side: b.side });
      if (was === 0 && b.def.cls !== 'mon') this.contagion(b);
    }

    melee() {
      const R = this.regs;
      for (const a of R) {
        if (!a.cs || a.st !== 0) continue;
        // weight contacts: what is in front gets the most of our men
        let sw = 0; const ws = [];
        for (const b of a.cs) { const z = zoneOf(a, b.x, b.y); const w = z === 0 ? 1 : z === 1 ? 0.35 : 0.15; ws.push(w); sw += w; }
        const cap = Math.min(a.n, a.files * (a.def.cls === 'cav' ? 1.5 : a.def.cls === 'ele' ? 1 : 2));
        for (let k = 0; k < a.cs.length; k++) {
          const b = a.cs[k], share = ws[k] / Math.max(1, sw);
          let zone = b.st === 1 ? 2 : zoneOf(b, a.x, a.y);
          let shockK = 1;
          if (a.form === 'horns' && zone === 0 && a.files > b.files * 1.2) { zone = 1; shockK = 0.7; }
          if (b.def.cls === 'mon') { this.hurt(b, cap * share * a.def.atk * this.fatMul(a) / 12 * DT, a, 0, 0); continue; }
          const dmg = cap * share * this.atkMul(a, b) * ZMUL[zone] / (this.defMul(b, zone) * 12) * DT;
          this.hurt(b, dmg, a, zone, 1.25 * shockK);
          if (zone > 0 && b.st === 0) b.coh = Math.max(0, b.coh - (zone === 1 ? 0.2 : 0.45) * DT);
        }
        a.coh = Math.max(0, a.coh - 0.02 * DT);
        a.fat = Math.min(100, a.fat + 0.8 * a.def.heavy * DT);
      }
    }

    // ---------- missiles ----------
    missiles() {
      for (const a of this.regs) {
        const d = a.def;
        if (a.st !== 0) continue;
        // pila / throwing spears just before contact
        if (a.pilum && !a.cs) {
          const t = this.nearestHostile(a, 34 + a.D / 2, true);
          if (t && t.def.cls !== 'mon') {
            a.pilum = 0;
            const z = zoneOf(t, a.x, a.y);
            const loss = a.n * 0.09 * d.pilum * lerp(1, formOf(t).rdef, t.coh) * (z ? 1.5 : 1) / (t.def.cls === 'ele' ? 3 : 1);
            this.hurt(t, loss, a, z, 0.8);
            if (t.form === 'testudo' || t.form === 'shieldwall') t.coh = Math.max(0, t.coh - 0.15);
            this.emit({ k: 'volley', x0: a.x, y0: a.y, x1: t.x, y1: t.y, n: 12, kind: 'javelin', side: a.side });
          }
        }
        if (!d.rng || a.ammo <= 0 || a.cs) continue;
        a.rcd -= DT * (a.buf.tengri > 0 ? 2 : 1);
        if (a.rcd > 0) continue;
        if (this.S && d.cls === 'sie' && a.order && a.order.k === 'wl' && this.shootWall(a)) continue;
        if (d.cls === 'sie' && a.moving) { a.rcd = 0.5; continue; }
        if (!d.shoot360 && !d.skirm && a.moving && d.cls === 'msl' && a.mom > 0.5) { a.rcd = 0.3; continue; }
        const rng = d.rng * (1 + 0.3 * this.elevAt(a.x, a.y)) * (this.weather === 'fog' ? 0.75 : 1) * (this.S && this.onWall(a) ? 1.25 : 1);
        let t = null;
        if (a.order && a.order.k === 'at') { const o = this.regs[a.order.t]; if (o && this.alive(o) && this.canShoot(a, o, rng)) t = o; }
        if (!t) t = this.pickShot(a, rng);
        if (!t) { a.rcd = 0.5; continue; }
        a.rcd = d.rof; a.ammo--;
        if (!d.shoot360 && !a.moving && !a.order) a.f = wrap(atan2(t.y - a.y, t.x - a.x));
        this.shoot(a, t);
      }
    }
    canShoot(a, t, rng) {
      if (t.st === 2 || !this.hostile(a.side, t.side) || !this.visibleTo(t, a.side)) return false;
      const dd = hyp(t.x - a.x, t.y - a.y);
      if (dd > rng || (a.def.minr && dd < a.def.minr)) return false;
      if (t.cs) for (const o of t.cs) if (this.friendly(o.side, a.side)) return false; // no shooting into our own men
      return true;
    }
    pickShot(a, rng) {
      let best = null, bs = 1e9;
      for (const t of this.regs) {
        if (!this.canShoot(a, t, rng)) continue;
        const dd = hyp(t.x - a.x, t.y - a.y);
        let s = dd;
        if (!a.def.shoot360 && a.def.cls !== 'sie') { const ang = Math.abs(wrap(atan2(t.y - a.y, t.x - a.x) - a.f)); if (ang > 1.4 && a.moving) continue; s += ang * 40; }
        if (a.def.splash && (t.form === 'phalanx' || t.form === 'testudo' || t.form === 'square')) s -= 60;
        if (t.def.cls === 'ele' && a.def.vsEle) s -= 80;
        if (t.st === 1) s += 150;
        if (s < bs) { bs = s; best = t; }
      }
      return best;
    }
    shoot(a, t) {
      const d = a.def, z = zoneOf(t, a.x, a.y);
      if (t.def.cls === 'mon') { this.hurt(t, a.n * d.rdm * 0.6, a, 0, 0); this.emit({ k: 'volley', x0: a.x, y0: a.y, x1: t.x, y1: t.y, n: 10, kind: d.kind, side: a.side }); return; }
      let m = d.rdm * a.n * this.fatMul(a);
      m *= lerp(1, formOf(t).rdef, t.coh);
      if (z) m *= 1.5;
      if (this.forestAt(t.x, t.y)) m *= d.cls === 'sie' ? 0.3 : 0.5;
      else if (this.villageAt(t.x, t.y)) m *= 0.6;
      if (this.weather === 'rain') m *= d.kind === 'arrow' ? 0.6 : 0.85;
      m *= 1 + 0.15 * this.elevAt(a.x, a.y);
      if (t.moving && t.def.cls === 'cav') m *= 0.7;
      if ((t.type === 'pike' || t.type === 'hoplite' || t.type === 'axe' || t.type === 'legion' || t.type === 'spear') && t.form !== 'testudo') m *= 1.3; // archers beat slow heavy infantry
      if (t.def.cls === 'ele') m *= (d.vsEle || 1);
      if (d.splash) m *= t.form === 'phalanx' || t.form === 'testudo' || t.form === 'square' ? 1.6 : t.form === 'loose' ? 0.35 : 1;
      for (const fg of this.fogs) if (fg.side !== a.side && hyp(t.x - fg.x, t.y - fg.y) < fg.r) m *= 0.3;
      for (const w of this.winds) if (w.side === t.side || this.allied(w.side, t.side)) m *= 0.25;
      if (this.S) m *= this.coverMul(a, t);
      const loss = m / t.def.def;
      const mk = t.def.cls === 'ele' ? (d.vsEle || 1) * 1.5 : 0.75;
      this.hurt(t, loss, a, z, mk);
      if (t.def.cls === 'ele' && d.vsEle && t.st === 0) t.morale -= 2 * d.vsEle;
      if (d.splash) {
        for (const o of this.regs) if (o !== t && o.st !== 2 && o.def.cls !== 'mon' && hyp(o.x - t.x, o.y - t.y) < 26) this.hurt(o, loss * 0.4, this.hostile(a.side, o.side) ? a : null, 0, 0.6);
        t.coh = Math.max(0, t.coh - 0.08);
      }
      this.emit({ k: 'volley', x0: a.x, y0: a.y, x1: t.x, y1: t.y, n: d.cls === 'sie' ? 1 : Math.min(18, Math.ceil(a.n / 4)), kind: d.kind, side: a.side, hit: t.id });
    }
    nearestHostile(a, maxD, front) {
      let best = null, bd = maxD;
      for (const t of this.regs) {
        if (t.st === 2 || !this.hostile(a.side, t.side)) continue;
        const dd = hyp(t.x - a.x, t.y - a.y) - t.D / 2;
        if (dd > bd) continue;
        if (front && Math.abs(wrap(atan2(t.y - a.y, t.x - a.x) - a.f)) > 0.9) continue;
        bd = dd; best = t;
      }
      return best;
    }

    // ---------- movement ----------
    goal(r) {
      const o = r.order;
      if (r.st === 1) return null;
      if (o && o.k === 'mv') return { x: o.x, y: o.y, f: o.f };
      if (o && o.k === 'wl') return this.S ? this.wallGoal(r, o) : null;
      if (o && o.k === 'at') {
        const t = this.regs[o.t];
        if (!t || t.st === 2 || !this.hostile(r.side, t.side)) { r.order = null; return null; }
        if (r.def.rng && r.ammo > 0 && !r.def.pilum) { // archers close to range, not into melee
          const dd = hyp(t.x - r.x, t.y - r.y);
          if (dd < r.def.rng * 0.85) return { x: r.x, y: r.y, f: atan2(t.y - r.y, t.x - r.x) };
        }
        return { x: t.x, y: t.y, f: null, chase: t };
      }
      return null;
    }
    viaFord(r, gx, gy) {
      const R = this.T.river; if (!R) return null;
      const s0 = r.y - this.riverY(r.x), s1 = gy - this.riverY(gx);
      if ((s0 < 0) === (s1 < 0) || Math.abs(s0) > 400) return null;
      let bf = R.fords[0], bd = 1e9;
      for (const f of R.fords) { const dd = Math.abs(f - r.x) + Math.abs(f - gx); if (dd < bd) { bd = dd; bf = f; } }
      const sg = s0 < 0 ? -1 : 1, ry = this.riverY(bf);
      if (Math.abs(r.x - bf) > R.fw * 0.5 || Math.abs(s0) > 40) return { x: bf, y: ry + sg * 30 };
      return { x: bf, y: ry - sg * 34 };
    }
    move() {
      for (const r of this.regs) {
        if (r.st === 2 || r.def.cls === 'mon') continue;
        const d = r.def; let tx, ty, tf = null, speed = d.spd * formOf(r).spd;
        r.moving = 0;
        if (r.st === 1) {
          // rout: away from the enemy, toward home; panicking elephants stampede through their own lines
          const h = this.homes[r.side];
          let ax = 0, ay = 0;
          const e = this.nearestHostile(r, 200, false);
          if (e) { const dd = hyp(r.x - e.x, r.y - e.y) || 1; ax = (r.x - e.x) / dd; ay = (r.y - e.y) / dd; }
          const hd = hyp(h.x - r.x, h.y - r.y) || 1;
          let dx = ax + (h.x - r.x) / hd * (r.panic ? 1.6 : 0.9), dy = ay + (h.y - r.y) / hd * (r.panic ? 1.6 : 0.9);
          if (r.panic) { dx += (r.panic - 0.5); }
          const z = this.zones[r.side];
          dx -= cos(z.f) * 0.6; dy -= sin(z.f) * 0.6;
          const L = hyp(dx, dy) || 1;
          tx = r.x + dx / L * 50; ty = r.y + dy / L * 50; speed = d.spd * (r.panic ? 1.3 : 1.15);
        } else {
          let g = this.goal(r);
          if (!g && r.hold && hyp(r.hold.x - r.x, r.hold.y - r.y) > 3) g = r.hold;
          // skirmishers keep their distance from melee troops
          if (d.skirm && !r.cs && (!r.order || r.order.k !== 'mv')) {
            const e = this.nearestHostile(r, d.rng ? Math.min(55, d.rng * 0.7) : 60, false);
            if (e && e.st === 0 && e.def.cls !== 'msl' && e.def.cls !== 'sie' && !(e.def.cls === 'inf' && d.cls === 'cav' && !e.moving)) {
              const dd = hyp(r.x - e.x, r.y - e.y) || 1;
              g = { x: r.x + (r.x - e.x) / dd * 70, y: r.y + (r.y - e.y) / dd * 70, f: d.shoot360 ? null : atan2(e.y - r.y, e.x - r.x), evade: 1 };
              if (!r.evading) { r.evading = 1; if (d.shoot360) this.callout('FEIGNED RETREAT', r.x, r.y - 10, '#ffe9b0'); }
            } else r.evading = 0;
          }
          if (r.cs) { // locked in melee: turn to the main threat if only one enemy, otherwise pinned
            if (r.cs.length === 1 && !(r.order && r.order.k === 'mv')) {
              const e = r.cs[0], want = atan2(e.y - r.y, e.x - r.x), df = wrap(want - r.f);
              const rate = 0.6 * formOf(r).turn * r.coh * DT;
              r.f = wrap(r.f + clamp(df, -rate, rate));
            }
            if (!(r.order && r.order.k === 'mv')) { r.mom = 0; this.terrainEffects(r, 0); continue; }
          }
          if (!g) {
            r.mom = Math.max(0, r.mom - 2 * DT);
            // idle: face the nearest threat
            const e = this.nearestHostile(r, 160, false);
            if (e && !r.cs && r.def.cls !== 'sie') { const df = wrap(atan2(e.y - r.y, e.x - r.x) - r.f); if (Math.abs(df) > 0.5) { const rate = 0.5 * formOf(r).turn * DT; r.f = wrap(r.f + clamp(df, -rate, rate)); } }
            this.terrainEffects(r, 0); continue;
          }
          tx = g.x; ty = g.y; tf = g.f;
          const via = this.viaFord(r, tx, ty); if (via) { tx = via.x; ty = via.y; tf = null; }
          if (this.S) { const v = this.viaGap(r, tx, ty); if (v) { tx = v.x; ty = v.y; tf = null; if (v.slow) speed *= v.slow; } }
          if (g.chase) { // approach the target's nearest face, aim for contact
            const t = g.chase; const dd = hyp(t.x - r.x, t.y - r.y);
            if (dd < 110 && d.chg >= 1) speed *= 1.2; // charge!
          }
        }
        const dx = tx - r.x, dy = ty - r.y, dist = hyp(dx, dy);
        const want = atan2(dy, dx);
        const turnRate = (d.cls === 'cav' ? 1.8 : d.cls === 'ele' ? 0.9 : d.cls === 'sie' ? 0.5 : 1.1) * formOf(r).turn;
        if (dist < 2) {
          if (r.st === 0 && r.order && r.order.k === 'mv') { r.hold = { x: r.order.x, y: r.order.y }; if (tf == null) r.order = null; }
          if (tf != null) {
            const df = wrap(tf - r.f), rate = turnRate * 0.8 * DT;
            r.f = wrap(r.f + clamp(df, -rate, rate));
            if (Math.abs(df) > 0.3 && (r.form === 'phalanx' || r.form === 'testudo' || r.form === 'shieldwall')) r.coh = Math.max(0.3, r.coh - 0.04 * DT);
            if (Math.abs(df) < 0.02 && r.order && r.order.k === 'mv') r.order = null;
          }
          r.mom = Math.max(0, r.mom - 2 * DT);
          this.terrainEffects(r, 0);
          continue;
        }
        // wheel toward the direction of travel; big turns slow the regiment down
        let df = wrap(want - r.f);
        const back = Math.abs(df) > 2.4 && dist < 60 && r.st === 0 && d.cls !== 'cav'; // short step back keeps facing
        if (back) df = wrap(want + PI - r.f);
        const rate = turnRate * DT;
        r.f = wrap(r.f + clamp(df, -rate, rate));
        if (Math.abs(df) > rate && (r.form === 'phalanx' || r.form === 'testudo' || r.form === 'square' || r.form === 'shieldwall')) r.coh = Math.max(0.25, r.coh - 0.05 * DT);
        let sp = speed * (Math.abs(df) > 0.7 ? 0.3 : 1) * (back ? 0.4 : 1) * this.fatMul(r);
        if (r.buf.shaka > 0) sp *= 1.4; if (r.buf.tengri > 0) sp *= 1.3;
        sp *= this.terrainEffects(r, 1);
        // hills: uphill slows, downhill speeds up
        const ux = dx / dist, uy = dy / dist;
        const dh = this.elevAt(r.x + ux * 12, r.y + uy * 12) - this.elevAt(r.x, r.y);
        sp *= clamp(1 - dh * 2.5, 0.6, 1.2);
        const stepL = Math.min(dist, sp * DT);
        let nx = r.x + ux * stepL, ny = r.y + uy * stepL;
        if (this.T.river && this.waterAt(nx, ny) === 1) { // rivers only cross at fords
          if (this.waterAt(nx, r.y) !== 1) ny = r.y; else if (this.waterAt(r.x, ny) !== 1) nx = r.x; else { nx = r.x; ny = r.y; }
        }
        if (this.S && r.st === 0 && this.wallBlock(r, nx, ny)) { nx = r.x; ny = r.y; }
        if (r.st === 0) { nx = clamp(nx, 5, W - 5); ny = clamp(ny, 5, H - 5); }
        r.vx = (nx - r.x) / DT; r.vy = (ny - r.y) / DT; r.x = nx; r.y = ny;
        r.moving = stepL > 0.2 * DT ? 1 : 0;
        const fast = sp > d.spd * 0.8;
        if (fast && Math.abs(df) < 0.25) r.mom = Math.min(1, r.mom + DT / (d.cls === 'inf' ? 2.2 : 1.3));
        else r.mom = Math.max(0, r.mom - 1.5 * DT);
        r.fat = Math.min(100, r.fat + (fast ? (d.cls === 'cav' ? 1.6 : 1.4) : 0.35) * d.heavy * DT * (this.weather === 'rain' ? 1.25 : 1) * (r.buf.shaka > 0 ? 0 : 1));
        if (r.st === 1 && (r.x < -20 || r.x > W + 20 || r.y < -20 || r.y > H + 20)) { r.st = 2; this.emit({ k: 'fled', id: r.id, side: r.side }); }
      }
      this.separate();
    }
    terrainEffects(r, moving) {
      const d = r.def, fo = this.forestAt(r.x, r.y), wa = this.waterAt(r.x, r.y);
      let sp = 1;
      r.hidden = fo || this.fogs.some(f => f.side === r.side && hyp(r.x - f.x, r.y - f.y) < f.r) ? 1 : 0;
      if (fo) {
        if (d.cls === 'cav' || d.cls === 'ele') { sp *= d.chariot ? 0.3 : 0.45; r.coh = Math.max(0, r.coh - (d.chariot ? 0.35 : 0.12) * DT); r.mom = Math.min(r.mom, 0.2); if (d.chariot && moving) this.hurt(r, 0.5 * DT, null, 0, 0.5); }
        else { sp *= 0.75; if (r.form === 'phalanx' || r.form === 'testudo' || r.form === 'square' || r.form === 'shieldwall') r.coh = Math.max(0.2, r.coh - 0.08 * DT); }
      }
      if (!fo && this.villageAt(r.x, r.y)) { sp *= d.cls === 'cav' || d.cls === 'ele' ? 0.55 : 0.85; if (d.cls === 'cav' || r.form === 'phalanx') r.coh = Math.max(0.3, r.coh - 0.06 * DT); }
      if (wa === 2) { sp *= 0.45; r.coh = Math.max(0.2, r.coh - 0.05 * DT); r.mom = Math.min(r.mom, 0.2); if (d.chariot) r.coh = Math.max(0, r.coh - 0.25 * DT); }
      if (d.chariot && moving && this.elevAt(r.x, r.y) > 0.5) { r.coh = Math.max(0, r.coh - 0.2 * DT); sp *= 0.7; }
      if (d.chariot && r.coh < 0.25 && !r._broke && (fo || wa || this.elevAt(r.x, r.y) > 0.5)) { r._broke = 1; this.callout('CHARIOTS BREAK ON ROUGH GROUND', r.x, r.y - 10, '#ffb04a'); }
      return sp;
    }
    separate() {
      const R = this.regs;
      for (let i = 0; i < R.length; i++) {
        const a = R[i]; if (a.st === 2 || a.def.cls === 'mon') continue;
        for (let j = i + 1; j < R.length; j++) {
          const b = R[j]; if (b.st === 2 || b.def.cls === 'mon') continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy); if (d > 130) continue;
          const ux = d > 0 ? dx / d : 1, uy = d > 0 ? dy / d : 0;
          const ov = ext(a, ux, uy) + ext(b, -ux, -uy) - d;
          if (ov <= 0) continue;
          const hostile = this.hostile(a.side, b.side);
          if (!hostile && (a.st === 1 || b.st === 1)) { // routers and panicking elephants run through friends
            const p = a.st === 1 ? a : b, o = p === a ? b : a;
            if (p.panic && o.st === 0) { this.hurt(o, p.n * 0.3 * DT, null, 1, 1.2); o.coh = Math.max(0, o.coh - 0.3 * DT); }
            else if (o.st === 0) o.coh = Math.max(0.2, o.coh - 0.1 * DT);
            continue;
          }
          if (hostile && (a.panic || b.panic)) { const p = a.panic ? a : b, o = p === a ? b : a; this.hurt(o, p.n * 0.3 * DT, p, 1, 1.2); }
          // movers yield to stationary regiments; hostile pushes stop at contact
          const am = a.moving ? 1 : 0.25, bm = b.moving ? 1 : 0.25, s = am + bm;
          const push = Math.min(ov, hostile ? ov : 3);
          a.x -= ux * push * am / s; a.y -= uy * push * am / s;
          b.x += ux * push * bm / s; b.y += uy * push * bm / s;
        }
      }
    }

    // ---------- morale, rout, rally ----------
    updateState() {
      const regeo = this.tick % 10 === 0;
      for (const r of this.regs) {
        if (r.st === 2) continue;
        if (regeo && r.def.cls !== 'mon') geom(r);
        for (const k of BUFFS) if (r.buf[k] > 0) r.buf[k] -= DT;
        if (r.cd > 0) r.cd -= DT;
        if (r.def.cls === 'mon') continue;
        if (r.st === 0) {
          if (!r.cs) {
            r.coh = Math.min(1, r.coh + (r.moving ? 0.03 : 0.1) * DT);
            if (!r.moving) r.fat = Math.max(0, r.fat - 2.5 * DT);
            if (this.t - r.lastHit > 4) r.morale = Math.min(r.def.mor + 10, r.morale + 0.8 * DT);
          }
          r.waver = r.morale < 30 ? 1 : 0;
          const immune = r.buf.stand > 0 || r.buf.berserk > 0;
          const ele = r.def.cls === 'ele';
          const brk = ele ? (r.morale < 32 && !(r.buf.nopanic > 0)) : !immune && (r.morale <= 0 || (r.morale < 18 && (r.coh < 0.35 || this.flanked(r))));
          if (brk) this.rout(r);
        } else if (r.st === 1) {
          r.routT += DT;
          const e = this.nearestHostile(r, 110, false);
          if (!e && !r.panic) r.morale += 5 * DT;
          if (!r.panic && r.morale >= 40 && r.routT > 4 && r.rallies < (r.def.mor >= 75 ? 2 : 1) && r.n >= r.n0 * 0.22) {
            r.st = 0; r.rallies++; r.coh = 0.35; r.mom = 0; r.order = null; r.routT = 0; r.hold = { x: r.x, y: r.y }; r.form = r.def.forms[0]; geom(r);
            this.stats.rallies++;
            this.callout('RALLIED!', r.x, r.y - 10, '#bff59a');
          }
        }
      }
    }
    flanked(r) { if (!r.cs) return false; for (const e of r.cs) if (zoneOf(r, e.x, e.y) > 0) return true; return false; }
    rout(r) {
      r.st = 1; r.order = null; r.mom = 0; r.routT = 0; r.hold = 0; r.morale = Math.min(r.morale, 5);
      this.stats.routs++;
      if (r.def.cls === 'ele') { r.panic = 0.2 + this.rand() * 0.6; this.callout('ELEPHANTS PANIC!', r.x, r.y - 12, '#ff9a6a', true); }
      else this.callout(r.name.toUpperCase() + ' ROUT!', r.x, r.y - 12, '#ffd0a0');
      this.emit({ k: 'rout', id: r.id, side: r.side, x: r.x, y: r.y });
      for (let s = 0; s < this.nF; s++) if (this.hostile(s, r.side)) this.fac[s].faith = Math.min(100, this.fac[s].faith + 6);
      this.contagion(r);
    }
    contagion(r) { // a breaking regiment shakes its neighbours
      for (const o of this.regs) {
        if (o === r || o.st !== 0 || !this.friendly(o.side, r.side) || o.def.cls === 'mon') continue;
        const dd = hyp(o.x - r.x, o.y - r.y);
        if (dd > 100) continue;
        if (o.buf.stand > 0 || o.buf.berserk > 0) continue;
        const hit = (dd < 50 ? 14 : 9) * (o.side === r.side ? 1 : 0.6) / this.depthK(o);
        o.morale -= hit;
        if (o.morale < 30 && !o.waver) { o.waver = 1; this.callout('WAVERING', o.x, o.y - 10, '#ffc890'); }
      }
    }

    // ---------- faith, abilities, curse ----------
    updateMeters() {
      for (let s = 0; s < this.nF; s++) {
        const f = this.fac[s];
        if (!this.unbroken(s)) continue;
        let hill = 0; for (const r of this.regs) if (r.side === s && r.st === 0 && this.elevAt(r.x, r.y) > 0.45) hill++;
        f.faith = Math.min(100, f.faith + 0.6 + 0.25 * Math.min(4, hill));
        if (f.curseCd > 0) f.curseCd -= 1;
        if (f.vengeT > 0) f.vengeT -= 1;
        if (f.pending) { f.pending.T -= 1; if (f.pending.T <= 0) f.pending = null; }
      }
      for (const fg of this.fogs) fg.T -= 1; this.fogs = this.fogs.filter(f => f.T > 0);
      for (const w of this.winds) w.T -= 1; this.winds = this.winds.filter(w => w.T > 0);
      // Gods' Wrath: too much blood (and betrayal) angers the gods
      this.bloodshed = Math.min(100, this.deaths / (this.men0 * 0.42) * 100 + this.diplo.filter(d => d.type === 'betray').length * 22 + this.curses * 3);
      if (this.wrathOk && !this.wrath && !this.wrathDone && this.bloodshed >= 100 && this.t > this.tmax * 0.5) this.startWrath(); // rare and late: never early in a battle
      if (this.wrath) { this.wrath.T -= 1; if (this.wrath.T <= 0 || (this.wrath.mon && this.wrath.mon.hp <= 0)) this.endWrath(); }
    }
    faithCost(r) { const L = HB.LORE[r.lore]; return L ? L.cost * (this.fac[r.side].oath ? 2 : 1) : 0; }
    canActivate(r) {
      if (!r.lore || r.st !== 0) return 'No ability';
      if (r.cd > 0) return 'Recharging ' + Math.ceil(r.cd) + 's';
      const c = this.faithCost(r); if (this.fac[r.side].faith < c) return 'Needs ' + c + ' faith';
      return '';
    }
    activate(r, manual) {
      const why = this.canActivate(r);
      if (why) { if (manual) this.emit({ k: 'deny', side: r.side, msg: why }); return false; }
      const f = this.fac[r.side], L = HB.LORE[r.lore];
      f.faith -= this.faithCost(r); r.cd = L.cd;
      if (f.oath && this.rand() < 0.3) { this.callout('THE GODS TURN AWAY', r.x, r.y - 14, '#c8a0ff', true); this.emit({ k: 'ability', id: r.id, side: r.side, name: 'FIZZLED', x: r.x, y: r.y }); return true; }
      const own = (fn) => { for (const o of this.regs) if (o.side === r.side && o.st === 0) fn(o); };
      const near = (rad, fn) => { for (const o of this.regs) if (o.st === 0 && this.hostile(r.side, o.side) && o.def.cls !== 'mon' && hyp(o.x - r.x, o.y - r.y) < rad) fn(o); };
      switch (r.lore) {
        case 'mars': r.buf.mars = 9; r.coh = 1; r.morale += 25; break;
        case 'thermopylae': r.buf.stand = 14; r.morale = Math.max(r.morale, 60); break;
        case 'alexander': r.buf.charge2 = 20; own(o => { if (hyp(o.x - r.x, o.y - r.y) < 110) o.morale += 15; }); break;
        case 'hannibal': own(o => { if (o.def.cls === 'ele') { o.buf.nopanic = 15; o.morale = Math.max(o.morale, 55); for (const e of this.regs) if (e.st === 0 && this.hostile(r.side, e.side) && e.def.cls !== 'mon' && hyp(e.x - o.x, e.y - o.y) < 90) e.morale -= 15; } }); break;
        case 'druidfog': this.fogs.push({ x: r.x, y: r.y, r: 120, side: r.side, T: 16 }); break;
        case 'berserk': r.buf.berserk = 10; break;
        case 'tengri': own(o => { if (o.type === 'horsearcher') o.buf.tengri = 10; }); break;
        case 'kamikaze': {
          this.winds.push({ side: r.side, T: 10, x: r.x, y: r.y });
          near(260, o => { o.coh = Math.max(0, o.coh - 0.6); o.morale -= 8; o.mom = 0; });
          break;
        }
        case 'fifthsun': own(o => { o.morale += 25; if (o.type === 'elite') o.buf.sun = 10; }); break;
        case 'shaka': own(o => { if (o.type === 'impi') { o.buf.shaka = 8; o.fat = 0; for (const e of this.regs) if (e.st === 0 && this.hostile(r.side, e.side) && e.def.cls !== 'mon' && hyp(e.x - o.x, e.y - o.y) < 100) e.morale -= 10 / 3; } }); break;
      }
      this.stats.abilities++;
      this.emit({ k: 'ability', id: r.id, side: r.side, name: L.name, lore: r.lore, x: r.x, y: r.y });
      this.callout(L.name + '!', r.x, r.y - 16, '#ffd84a', true);
      return true;
    }
    canCurse(side, t) {
      const f = this.fac[side];
      if (!t || t.st !== 0 || t.def.cls === 'mon') return 'Pick an enemy regiment';
      if (!this.hostile(side, t.side)) return 'Not an enemy';
      if (f.curseCd > 0) return 'Curse recharging ' + Math.ceil(f.curseCd) + 's';
      const c = HB.CURSE.cost * (f.oath ? 2 : 1); if (f.faith < c) return 'Curse needs ' + c + ' faith';
      return '';
    }
    curse(side, t, manual) {
      const why = this.canCurse(side, t);
      if (why) { if (manual) this.emit({ k: 'deny', side, msg: why }); return false; }
      const f = this.fac[side];
      f.faith -= HB.CURSE.cost * (f.oath ? 2 : 1); f.curseCd = HB.CURSE.cd; this.curses++;
      const k = t.morale > 80 ? 0.5 : 1;
      t.coh = Math.min(t.coh, 1 - 0.85 * k); t.buf.curse = 10 * k; t.morale -= 15 * k; t.mom = 0;
      this.emit({ k: 'curse', id: t.id, side, x: t.x, y: t.y });
      this.callout('CURSED!', t.x, t.y - 14, '#c58cff', true);
      return true;
    }

    // ---------- diplomacy (3-4 armies) ----------
    diploEv(type, a, b, text) { this.diplo.push({ t: Math.round(this.t), type, a, b }); this.emit({ k: 'diplo', type, a, b, text }); }
    propose(a, b) {
      const fa = this.fac[a], fb = this.fac[b];
      if (!fa || !fb || a === b || fa.ally >= 0 || fb.ally >= 0 || fa.oath || fb.oath || !this.unbroken(a) || !this.unbroken(b) || this.wrath) return;
      if (fb.cmd === 'human' && !fb.auto) { fb.pending = { from: a, T: 12 }; this.emit({ k: 'diplo', type: 'offer', a, b, text: fa.name + ' offers ' + fb.name + ' an alliance' }); return; }
      const C = HB.COMMANDERS[fb.cmd] || HB.COMMANDERS.ai;
      if (this.rand() < C.accept) this.makeAlliance(a, b);
      else this.diploEv('decline', a, b, fb.name + ' rejects ' + fa.name + "'s alliance");
    }
    accept(a, b) { const f = this.fac[a]; if (f.pending && f.pending.from === b) { f.pending = null; this.makeAlliance(a, b); } }
    makeAlliance(a, b) {
      const fa = this.fac[a], fb = this.fac[b];
      if (fa.ally >= 0 || fb.ally >= 0) return;
      fa.ally = b; fb.ally = a; fa.allyT0 = fb.allyT0 = this.t;
      this.hos[a * NS + b] = this.hos[b * NS + a] = 0;
      for (const r of this.regs) if ((r.side === a || r.side === b) && r.order && r.order.k === 'at') { const t = this.regs[r.order.t]; if (t.side === a || t.side === b) r.order = null; }
      this.diploEv('ally', a, b, '🤝 ' + fa.name + ' & ' + fb.name + ' form an alliance');
    }
    betray(a, b) {
      const fa = this.fac[a], fb = this.fac[b];
      const age = Math.round(this.t - fa.allyT0);
      fa.ally = fb.ally = -1;
      if (!this.wrath) this.hos[a * NS + b] = this.hos[b * NS + a] = 1;
      // the loot: a surprise attack and the victim's faith
      const loot = Math.round(fb.faith * 0.5); fb.faith -= loot; fa.faith = Math.min(100, fa.faith + loot);
      fa.ambushOn = b;
      for (const r of this.regs) {
        if (r.side === a && r.st === 0) { r.buf.ambush = 8; r.morale -= 12; }
        if (r.side === b && r.st === 0) { r.morale += 5; }
      }
      fa.oath = true; fa.betrayals++;
      fb.vengeT = 45; fb.vengeOn = a;
      this.diploEv('betray', a, b, '🗡 ' + fa.name + ' BETRAYED ' + fb.name + ' after a ' + age + 's alliance');
      this.emit({ k: 'betrayed', a, b, age, text: '🗡 ' + fa.name + ' BETRAYED ' + fb.name + ' after a ' + age + 's alliance' });
    }
    diplomacy() {
      if (this.over || this.wrath) return;
      const live = []; for (let s = 0; s < this.nF; s++) if (this.unbroken(s)) live.push(s);
      for (const s of live) {
        const f = this.fac[s]; if (!f.auto) continue;
        const C = HB.COMMANDERS[f.cmd] || HB.COMMANDERS.ai;
        if (f.ally >= 0) {
          const v = f.ally, age = this.t - f.allyT0;
          const others = live.filter(x => x !== s && x !== v).length;
          let p = 0;
          if (age > 20) p = others === 0 ? C.betray * 0.5 : C.betray * 0.02 * (this.sideStrength(v) < this.sideStrength(s) * 0.85 ? 2.5 : 1);
          if (p > 0 && this.rand() < p) this.betray(s, v);
        } else if (live.length >= 3 && this.t > 4 && !f.oath && this.rand() < C.propose) {
          const cands = live.filter(x => x !== s && this.fac[x].ally < 0 && !this.fac[x].oath);
          if (!cands.length) continue;
          cands.sort((x, y) => this.sideStrength(y) - this.sideStrength(x) || x - y);
          const pick = cands.length > 1 && this.rand() < 0.6 ? cands[1] : cands[0];
          this.propose(s, pick);
        }
      }
    }

    // ---------- Gods' Wrath ----------
    startWrath() {
      const kind = 'titan'; // no flying units: the wrath walks
      const mon = this.addReg(MON, kind, null, W / 2, kind === 'dragon' ? 60 : H / 2, HPI);
      mon.name = kind === 'titan' ? 'The Titan' : 'The Dragon'; mon.n = mon.n0 = 1;
      const saved = Array.from(this.hos);
      for (let a = 0; a < this.nF; a++) for (let b = 0; b < this.nF; b++) this.hos[a * NS + b] = 0;
      for (let a = 0; a < this.nF; a++) { this.hos[a * NS + MON] = 1; this.hos[MON * NS + a] = 1; }
      for (const r of this.regs) if (r.order && r.order.k === 'at' && this.regs[r.order.t].side !== MON) r.order = null;
      this.wrath = { kind, T: 45, dur: 45, mon, saved, atkT: 3 };
      for (const f of this.fac) f.msDmg = 0;
      this.events.push('wrath');
      this.emit({ k: 'event', id: 'wrath', kind, text: "GODS' WRATH", sub: 'A Titan walks. Too much blood was spilled: every army is under truce until it is gone.', big: true });
    }
    monsterThink() {
      const w = this.wrath, m = w.mon; if (m.st === 2) return;
      // walk toward the densest knot of men
      let best = null, bs = -1;
      for (const r of this.regs) { if (r.st === 2 || r.side === MON) continue; let s = r.n; for (const o of this.regs) if (o !== r && o.st !== 2 && o.side !== MON && hyp(o.x - r.x, o.y - r.y) < 80) s += o.n; s -= hyp(r.x - m.x, r.y - m.y) * 0.3; if (s > bs) { bs = s; best = r; } }
      if (best) {
        const dx = best.x - m.x, dy = best.y - m.y, d = hyp(dx, dy) || 1;
        m.f = wrap(m.f + clamp(wrap(atan2(dy, dx) - m.f), -1.5 * DT, 1.5 * DT));
        if (d > 30) { m.x += dx / d * m.def.spd * DT; m.y += dy / d * m.def.spd * DT; m.moving = 1; } else m.moving = 0;
      }
      w.atkT -= DT;
      if (w.atkT <= 0) {
        w.atkT = w.kind === 'titan' ? 2.4 : 3;
        const hits = [];
        for (const r of this.regs) {
          if (r.st === 2 || r.side === MON) continue;
          const dx = r.x - m.x, dy = r.y - m.y, d = hyp(dx, dy);
          const inArea = w.kind === 'titan' ? d < 55 + r.W / 3 : d < 120 && Math.abs(wrap(atan2(dy, dx) - m.f)) < 0.6;
          if (!inArea) continue;
          this.hurt(r, (r.def.cls === 'ele' ? 1.2 : w.kind === 'titan' ? 8 : 9) * (r.n0 > 30 ? 1 : 0.4), null, 1, 0.8);
          if (r.st === 0) { r.morale -= 10; r.coh = Math.max(0, r.coh - 0.45); }
          hits.push(r.id);
        }
        this.emit({ k: w.kind === 'titan' ? 'stomp' : 'breath', x: m.x, y: m.y, f: m.f, hits });
      }
    }
    endWrath() {
      const w = this.wrath; const m = w.mon; const killed = m.hp <= 0;
      m.st = 2; this.wrath = null; this.wrathDone = true;
      for (let i = 0; i < this.hos.length; i++) this.hos[i] = w.saved[i];
      for (let a = 0; a < this.nF; a++) for (let b = 0; b < this.nF; b++) if (this.allied(a, b)) this.hos[a * NS + b] = 0;
      let top = -1, td = 0;
      for (let s = 0; s < this.nF; s++) if (this.fac[s].msDmg > td) { td = this.fac[s].msDmg; top = s; }
      if (top >= 0) { this.fac[top].faith = 100; for (const r of this.regs) if (r.side === top && r.st === 0) r.morale += 20; }
      const nm = w.kind === 'titan' ? 'TITAN' : 'DRAGON';
      this.emit({ k: 'event', id: 'wrathend', text: killed ? 'THE ' + nm + ' FALLS' : 'THE ' + nm + ' DEPARTS', sub: (top >= 0 ? this.fac[top].name + ' fought it hardest: full faith and +20 morale. ' : '') + 'The truce is over.', big: true });
    }

    // ---------- end ----------
    checkEnd() {
      if (this.over) return;
      if (this.S && this.siegeEnd()) return;
      const live = []; for (let s = 0; s < this.nF; s++) if (this.unbroken(s)) live.push(s);
      let done = false, winners = [];
      if (live.length <= 1) { done = true; winners = live; }
      else if (live.length === 2 && this.allied(live[0], live[1]) && !this.wrath) {
        this.allyWinT += 1; if (this.allyWinT >= 20) { done = true; winners = live; this.alliedWin = true; }
      } else this.allyWinT = 0;
      if (!done && this.t >= this.tmax) {
        done = true; this.timeout = true;
        let bs = -1; for (const s of live) { const v = this.sideStrength(s); if (v > bs) { bs = v; winners = [s]; } }
      }
      if (done) { this.over = true; this.winners = winners; this.winner = winners.length ? winners[0] : -1; this.emit({ k: 'over', winners }); }
    }
    summary() {
      const sides = [];
      for (let s = 0; s < this.nF; s++) {
        const f = this.fac[s];
        sides.push({ name: f.name, faction: f.faction, cmd: f.cmd, oath: f.oath, betrayals: f.betrayals, kills: Math.round(f.kills), lost: Math.round(f.lost), faith: Math.round(f.faith), msDmg: Math.round(f.msDmg),
          regs: this.regs.filter(r => r.side === s).map(r => ({ name: r.name, n: Math.round(r.n), n0: r.n0, st: r.st, kills: Math.round(r.kills) })),
          total: this.sideCount(s), inOrder: this.sideStrength(s) });
      }
      let mvp = null; for (const r of this.regs) if (r.side < this.nF && (!mvp || r.kills > mvp.kills)) mvp = r;
      return { winner: this.winner, winners: this.winners, alliedWin: this.alliedWin, timeout: this.timeout, time: this.t, sides,
        mvp: mvp && { name: mvp.name, side: mvp.side, kills: Math.round(mvp.kills) }, stats: this.stats, events: this.events, diplo: this.diplo, deaths: Math.round(this.deaths) };
    }
  }
  HB.Battle = Battle;
  HB.COMMANDERS = {
    remi:    { name: 'Remi', betray: 0, accept: 0.95, propose: 0.5, blurb: 'Swarms of ancient warriors. Loyal to a fault.' },
    gamedev: { name: 'Game Dev', betray: 1, accept: 0.85, propose: 0.4, blurb: 'Flanks, feints, curses, and holds the high ground. Will betray you.' },
    ai:      { name: 'AI', betray: 0.35, accept: 0.6, propose: 0.15 },
    human:   { name: 'You', betray: 0, accept: 0, propose: 0 },
  };
})(typeof window !== 'undefined' ? window : globalThis);
