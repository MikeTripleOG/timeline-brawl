/* Timeline Brawl — deterministic battle simulation (no DOM). Typed arrays + spatial hash. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const W = 500, H = 700, CS = 10, GW = Math.ceil(W / CS), GH = Math.ceil(H / CS);
  const DT = 1 / 30, MAXU = 14000, MAXP = 5000;
  const NML0 = 270, NML1 = 430;
  const D = HB.DMG, MELEE = 0, ARROW = 1, BULLET = 2, SHELL = 3, FIRE = 4, MISSILE = 5, CRUSH = 6;
  const F_LANDED = 1, F_DECOY = 2, F_GHOST = 4, F_STEALTH = 8, F_ZOMBIE = 16, F_RTB = 32, F_TEMPLAND = 64, F_DRYMSG = 128, F_FUELMSG = 256, F_FROZEN = 512, F_LIFT = 1024;
  const NF = 5, ALIEN = 4; // up to 4 armies + the aliens
  const PSPEED = [0, 170, 650, 320, 120, 260, 0];
  HB.WORLD = { W, H, NML0, NML1, DT, NF, ALIEN };
  HB.FLAGS = { F_LANDED, F_DECOY, F_GHOST, F_STEALTH, F_ZOMBIE, F_RTB, F_TEMPLAND, F_FROZEN, F_LIFT };

  // Deterministic math: only + - * / and sqrt (IEEE exact) so replays match on every device/engine.
  const PI = 3.141592653589793, TAU = 6.283185307179586, HPI = 1.5707963267948966;
  function sind(x) {
    x = x - TAU * Math.floor(x / TAU + 0.5);
    if (x > HPI) x = PI - x; else if (x < -HPI) x = -PI - x;
    const x2 = x * x;
    return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156))))));
  }
  function cosd(x) { return sind(x + HPI); }
  function atand(z) { // |z| <= 1
    const z2 = z * z;
    return z * (0.99997726 + z2 * (-0.33262347 + z2 * (0.19354346 + z2 * (-0.11643287 + z2 * (0.05265332 + z2 * -0.01172120)))));
  }
  function atan2d(y, x) {
    if (x === 0 && y === 0) return 0;
    const ax = x < 0 ? -x : x, ay = y < 0 ? -y : y;
    let a = ax >= ay ? atand(ay / ax) : HPI - atand(ax / ay);
    if (x < 0) a = PI - a;
    return y < 0 ? -a : a;
  }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  HB.dmath = { sind, cosd, atan2d, hyp };
  // deployment zones for 2-4 armies (FFA uses the corners)
  HB.zonesFor = function (n) {
    if (n <= 2) return [{ x0: 10, x1: 490, y0: 445, y1: 690 }, { x0: 10, x1: 490, y0: 10, y1: 255 }];
    if (n === 3) return [{ x0: 135, x1: 365, y0: 450, y1: 690 }, { x0: 260, x1: 490, y0: 10, y1: 250 }, { x0: 10, x1: 240, y0: 10, y1: 250 }];
    return [{ x0: 10, x1: 240, y0: 450, y1: 690 }, { x0: 260, x1: 490, y0: 10, y1: 250 }, { x0: 10, x1: 240, y0: 10, y1: 250 }, { x0: 260, x1: 490, y0: 450, y1: 690 }];
  };
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const EVENTS = {
    sandstorm: { name: 'SANDSTORM', sub: 'Range & accuracy down, the death ray is blinded', color: '#d99a3a', dur: 12 },
    plague: { name: 'BLACK DEATH', sub: 'Plague ravages flesh and blood; no healing', color: '#3a5a2a', dur: 10 },
    eclipse: { name: 'TOTAL ECLIPSE', sub: 'Darkness falls: all aircraft must land!', color: '#14102a', dur: 10 },
    betrayal: { name: 'BETRAYAL!', sub: 'Part of a squad on each side switches sides', color: '#9b30ff', dur: 2 },
    emp: { name: 'EMP BLAST', sub: 'Electronics fried: tech units stunned, aircraft drop', color: '#00e5ff', dur: 6 },
    aliens: { name: 'ALIEN ABDUCTION', sub: 'A scout UFO beams up troops from every side', color: '#39ff6a', dur: 4 },
    monsoon: { name: 'MONSOON', sub: 'Fires doused, bowstrings wet, gunpowder damp', color: '#2a5fb0', dur: 12 },
  };
  HB.EVENTS = EVENTS;

  class Battle {
    constructor(opts) {
      this.opts = opts;
      this.rand = makeRng(opts.seed || 12345);
      this.t = 0; this.tick = 0; this.n = 0;
      this.weather = opts.weather || 'day';
      this.chaos = opts.chaos !== false;
      this.human = opts.human || [true, false];
      this.nF = Math.max(2, Math.min(4, opts.armies.length));
      this.zones = HB.zonesFor(this.nF);
      this.homes = this.zones.map(z => ({ x: (z.x0 + z.x1) / 2, y: (z.y0 + z.y1) / 2 }));
      this.homes[ALIEN] = { x: W / 2, y: 40 };
      this.hos = new Uint8Array(NF * NF); this.mul = new Float32Array(NF * NF).fill(1);
      for (let a = 0; a < NF; a++) for (let b = 0; b < NF; b++) this.hos[a * NF + b] = a !== b ? 1 : 0;
      const N = MAXU;
      this.x = new Float32Array(N); this.y = new Float32Array(N); this.hp = new Float32Array(N);
      this.ti = new Uint8Array(N); this.side = new Uint8Array(N); this.sq = new Uint16Array(N);
      this.alive = new Uint8Array(N); this.flags = new Uint16Array(N);
      this.cd0 = new Float32Array(N); this.cd1 = new Float32Array(N); this.cd2 = new Float32Array(N);
      this.am1 = new Float32Array(N); this.am2 = new Float32Array(N); this.fuel = new Float32Array(N);
      this.tgt = new Int32Array(N); this.rt = new Float32Array(N);
      this.ox = new Float32Array(N); this.oy = new Float32Array(N); this.hd = new Float32Array(N);
      this.burnT = new Float32Array(N); this.burnD = new Float32Array(N); this.burnS = new Int16Array(N);
      this.fearT = new Float32Array(N); this.revealT = new Float32Array(N); this.stunT = new Float32Array(N);
      this.flash = new Float32Array(N); this.life = new Float32Array(N);
      this.swarm = new Uint16Array(N); this.swarmPrev = new Uint16Array(N);
      this.cellCount = new Int32Array(GW * GH + 1); this.cellStart = new Int32Array(GW * GH + 1); this.order = new Int32Array(N);
      // projectiles
      const P = MAXP;
      this.np = 0;
      this.px = new Float32Array(P); this.py = new Float32Array(P); this.tx = new Float32Array(P); this.ty = new Float32Array(P);
      this.pt = new Float32Array(P); this.pT = new Float32Array(P); this.pd = new Float32Array(P); this.pk = new Uint8Array(P);
      this.psp = new Float32Array(P); this.pj = new Int32Array(P); this.pside = new Uint8Array(P); this.psq = new Int16Array(P); this.pair = new Uint8Array(P);
      this.squads = [];
      this.fires = [];
      this.fx = [];
      this.events = [];
      this.flagsEnv = { sand: 0, plague: 0, eclipse: 0, emp: 0, rain: 0 };
      this.over = false; this.winner = -1;
      this.stats = { abilities: 0, events: [] };
      this.initFactions();
      for (let s = 0; s < this.nF; s++) for (const e of opts.armies[s]) this.addSquad(s, HB.UNIT[e.type].idx, e.count, e.x, e.y, this.nF > 2 ? { maxW: this.zones[s].x1 - this.zones[s].x0 - 6 } : null);
      this.startValue = []; for (let s = 0; s < this.nF; s++) this.startValue.push(this.sideValue(s));
      this.chaosAt = this.chaos ? [16 + this.rand() * 8, 42 + this.rand() * 12, 75 + this.rand() * 15] : [];
      this.usedEvents = {};
      if (opts.forceEvent) this.chaosAt = [opts.forceEventAt || 6];
    }
    emit(o) { if (this.fx.length < 2500 || o.big) this.fx.push(o); }

    // ---------- spawning ----------
    addSquad(side, ti, count, cx, cy, extra) {
      const def = HB.UNITS[ti];
      const s = {
        id: this.squads.length, side, ti, def, n0: count, alive: 0, cx, cy, kills: 0, kv: 0, dmg: 0, lost: 0,
        cd: def.lore ? (def.lore.cd0 != null ? def.lore.cd0 : Math.min(def.lore.cd, 5 + this.rand() * 5)) : 999, baseTi: ti, lvl: 0, devoT: 0, devoStep: 30, devoLock: false, shield: def.shield || 0, shieldOffT: 0, abFx: 0, abT: 0, ph: 0, used: 0,
        order: null, tgt: -1, routT: 0, routed: false, engT: 0, holdT: 0, dmgMul: 1, buffT: 0, disorderT: 0,
        joanT: 0, joanBuffT: 0, barbara: 0, lockon: 0, invisT: 0, dazeT: 0, stunT: 0, evadeT: 0, freeAmmoT: 0,
        zombieT: 0, immortalT: 0, chargeT: 0, chargeMul: 1, fleeT: 0, invulnT: 0, fooT: 0, openT: 0,
        temp: false, name: def.short, label: (extra && extra.label) || null,
      };
      if (extra) Object.assign(s, extra);
      this.squads.push(s);
      const sp = Math.max(3.6, def.rad * 2.3);
      let cols = Math.max(1, Math.ceil(Math.sqrt(count * 2.2)));
      if (extra && extra.maxW) cols = Math.max(1, Math.min(cols, Math.floor(extra.maxW / sp)));
      const rows = Math.ceil(count / cols);
      for (let k = 0; k < count; k++) {
        const c = k % cols, r = (k / cols) | 0;
        const ox = (c - (cols - 1) / 2) * sp + (this.rand() - 0.5) * sp * 0.3;
        const oy = (r - (rows - 1) / 2) * sp * (this.homes[side].y > H / 2 ? 1 : -1) + (this.rand() - 0.5) * sp * 0.3;
        this.spawn(side, ti, s.id, cx + ox, cy + oy, ox, oy);
      }
      return s;
    }
    spawn(side, ti, sqi, x, y, ox, oy) {
      if (this.n >= MAXU) return -1;
      const i = this.n++, d = HB.UNITS[ti], s = this.squads[sqi];
      this.x[i] = clamp(x, 2, W - 2); this.y[i] = clamp(y, 2, H - 2);
      this.hp[i] = d.hp; this.ti[i] = ti; this.side[i] = side; this.sq[i] = sqi; this.alive[i] = 1;
      this.flags[i] = (d.tagset.stealth ? F_STEALTH : 0) | (d.tagset.ghost ? F_GHOST : 0) | (d.tagset.decoy ? F_DECOY : 0);
      this.cd0[i] = this.rand() * 0.8; this.cd1[i] = this.rand() * (d.w1 ? d.w1.rof : 1); this.cd2[i] = this.rand() * (d.w2 ? d.w2.rof : 1);
      this.am1[i] = d.w1 ? (d.w1.ammo || 1e9) : 0; this.am2[i] = d.w2 ? (d.w2.ammo || 1e9) : 0;
      this.fuel[i] = d.fuel || 1e9; this.tgt[i] = -1; this.rt[i] = this.rand() * 0.4;
      this.ox[i] = ox || 0; this.oy[i] = oy || 0; this.hd[i] = atan2d(H / 2 - this.homes[side].y, W / 2 - this.homes[side].x);
      this.burnT[i] = 0; this.fearT[i] = 0; this.revealT[i] = 0; this.stunT[i] = 0; this.life[i] = -1; this.flash[i] = 0;
      s.alive++;
      return i;
    }
    sideValue(side) {
      let v = 0;
      for (let i = 0; i < this.n; i++) if (this.alive[i] && this.side[i] === side && this.life[i] < 0) {
        const d = HB.UNITS[this.ti[i]]; v += d.cost * Math.max(0, Math.min(1, this.hp[i] / d.hp + 0.25)) / 1.25;
      }
      return v;
    }
    sideCount(side) {
      let c = 0;
      for (const s of this.squads) if (s.side === side && !s.temp) c += s.alive;
      return c;
    }

    // ---------- spatial hash ----------
    buildGrid() {
      const cc = this.cellCount, cs = this.cellStart, ord = this.order, n = this.n;
      cc.fill(0);
      for (let i = 0; i < n; i++) if (this.alive[i]) cc[cellOf(this.x[i], this.y[i])]++;
      let acc = 0;
      for (let c = 0; c < GW * GH; c++) { cs[c] = acc; acc += cc[c]; cc[c] = cs[c]; }
      cs[GW * GH] = acc;
      for (let i = 0; i < n; i++) if (this.alive[i]) ord[cc[cellOf(this.x[i], this.y[i])]++] = i;
    }
    // visit all alive units within radius R of (x,y); cb(j, d2) returns true to stop
    query(x, y, R, cb) {
      const c0 = Math.max(0, ((x - R) / CS) | 0), c1 = Math.min(GW - 1, ((x + R) / CS) | 0);
      const r0 = Math.max(0, ((y - R) / CS) | 0), r1 = Math.min(GH - 1, ((y + R) / CS) | 0);
      const R2 = R * R, cs = this.cellStart, ord = this.order;
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const cell = r * GW + c;
        for (let k = cs[cell], e = cs[cell + 1]; k < e; k++) {
          const j = ord[k]; const dx = this.x[j] - x, dy = this.y[j] - y, d2 = dx * dx + dy * dy;
          if (d2 <= R2 && cb(j, d2)) return;
        }
      }
    }
    airborne(j) { return HB.UNITS[this.ti[j]].air && !(this.flags[j] & (F_LANDED | F_TEMPLAND)); }
    visibleTo(j, i, d2) {
      const f = this.flags[j];
      if (f & F_GHOST) return false;
      const sj = this.squads[this.sq[j]];
      if (sj.invisT > 0) return this.squads[this.sq[i]].lockon > 0;
      if ((f & F_STEALTH) && this.revealT[j] <= 0) {
        if (sj.invisT > 0) return false;
        return HB.UNITS[this.ti[i]].radar && d2 < 150 * 150 && !this.flagsEnv.emp;
      }
      return true;
    }
    // nearest valid enemy for unit i within R (ring search)
    findTarget(i, R, prefSq) {
      const x = this.x[i], y = this.y[i], side = this.side[i], d = HB.UNITS[this.ti[i]], HS = this.hos, sb = side * NF;
      const canAir = d.canAir, radar = d.radar, lock = this.squads[this.sq[i]].lockon > 0;
      const cx = Math.min(GW - 1, (x / CS) | 0), cy = Math.min(GH - 1, (y / CS) | 0);
      const maxRing = Math.ceil(R / CS);
      let best = -1, bestS = 1e18, bestRaw = 1e18;
      const cs = this.cellStart, ord = this.order;
      for (let ring = 0; ring <= maxRing; ring++) {
        if (best >= 0 && (ring - 1) * CS > Math.sqrt(bestRaw) + CS) break;
        const ra = cy - ring, rb = cy + ring, ca = cx - ring, cb = cx + ring;
        for (let r = ra; r <= rb; r++) {
          if (r < 0 || r >= GH) continue;
          const edge = r === ra || r === rb;
          for (let c = ca; c <= cb; c += edge ? 1 : (cb - ca || 1)) {
            if (c < 0 || c >= GW) continue;
            const cell = r * GW + c;
            for (let k = cs[cell], e = cs[cell + 1]; k < e; k++) {
              const j = ord[k];
              if (!HS[sb + this.side[j]]) continue;
              const dx = this.x[j] - x, dy = this.y[j] - y, d2 = dx * dx + dy * dy;
              if (d2 > R * R) continue;
              if (!canAir && this.airborne(j)) continue;
              if (!this.visibleTo(j, i, d2)) continue;
              let sc = d2;
              if (prefSq >= 0 && this.sq[j] === prefSq) sc *= 0.15;
              if (this.flags[j] & F_DECOY) { if (radar || lock) continue; sc *= 0.3; }
              if (sc < bestS) { bestS = sc; best = j; bestRaw = Math.min(bestRaw, d2); }
            }
            if (!edge && cb === ca) break;
          }
        }
      }
      return best;
    }

    // ---------- damage ----------
    damage(j, amt, dt, srcSq) {
      if (!this.alive[j] || amt <= 0) return;
      const d = HB.UNITS[this.ti[j]], s = this.squads[this.sq[j]];
      if (s.invulnT > 0) return;
      if (s.shield > 0 && s.shieldOffT <= 0) { const ab = Math.min(s.shield, amt); s.shield -= ab; amt -= ab; this.flash[j] = 0.05; if (amt <= 0) return; }
      if (this.flags[j] & F_DECOY) { this.kill(j, srcSq, dt); return; }
      let m = d.armorArr[dt];
      if ((dt === MELEE || dt === CRUSH) && (d.veh || d.air)) {
        const landed = d.air && !this.airborne(j);
        if (d.air && !landed) return;
        m = (landed ? 0.25 : m) + Math.min(0.2, this.swarmPrev[j] * 0.004);
        if (this.isDry(j)) m += this.fuel[j] <= 0 ? 0.6 : 0.4; // hatches pried open
      }
      if (s.holdT > 0 && dt <= BULLET) m *= 0.25;
      if (s.disorderT > 0) m *= 1.6;
      if (s.joanBuffT > 0) m *= 0.8;
      amt *= m;
      if (amt <= 0) return;
      this.hp[j] -= amt; this.flash[j] = 0.12;
      if (srcSq >= 0) { const ss = this.squads[srcSq]; ss.dmg += amt; if (s.side === ALIEN && ss.side < NF - 1) this.fac[ss.side].msDmg += amt; }
      if (this.hp[j] <= 0) {
        if (s.zombieT > 0 && dt !== FIRE && dt !== SHELL && dt !== MISSILE) { this.flags[j] |= F_ZOMBIE; return; }
        this.kill(j, srcSq, dt);
      }
    }
    isDry(j) {
      const d = HB.UNITS[this.ti[j]];
      return d.hasAmmo && this.am1[j] <= 0 && this.am2[j] <= 0;
    }
    kill(j, srcSq, dt, silent) {
      if (!this.alive[j]) return;
      this.alive[j] = 0;
      const d = HB.UNITS[this.ti[j]], s = this.squads[this.sq[j]];
      s.alive--; s.lost++;
      if (silent) return;
      if (srcSq >= 0) { const k = this.squads[srcSq]; if (k.side !== this.side[j]) { k.kills++; k.kv += d.cost; } }
      this.onKill(j, d, s, srcSq);
      const x = this.x[j], y = this.y[j];
      if (this.flags[j] & F_DECOY) { this.emit({ k: 'pop', x, y }); return; }
      if (d.rad >= 5) {
        this.emit({ k: 'boom', x, y, r: 26, big: true });
        this.emit({ k: 'callout', text: d.short.toUpperCase() + ' DESTROYED!', x, y, color: '#ff5533', big: true, slow: 1.4, side: this.side[j] });
      } else if (d.rad >= 3) this.emit({ k: 'boom', x, y, r: 12 });
      else this.emit({ k: 'die', x, y, side: this.side[j] });
      // immortals replacement
      if (s.immortalT > 0 && dt !== FIRE && dt !== SHELL && dt !== MISSILE && !this.flagsEnv.plague && this.rand() < 0.6) {
        const bk = this.backDir(s.side), bd = 14 + this.rand() * 10;
        const ni = this.spawn(s.side, s.ti, s.id, s.cx + (this.rand() - 0.5) * 30 + bk.x * bd, s.cy + bk.y * bd, this.ox[j], this.oy[j]);
        if (ni >= 0) this.emit({ k: 'spark', x: this.x[ni], y: this.y[ni], color: '#ffd76a' });
      }
    }

    // ---------- projectiles ----------
    fire(i, w, j, slot) {
      const s = this.squads[this.sq[i]];
      const d = HB.UNITS[this.ti[i]];
      let acc = w.acc;
      const env = this.flagsEnv, tdef = HB.UNITS[this.ti[j]];
      if (env.sand) acc *= 0.6;
      if (env.rain && (w.t === ARROW)) acc *= 0.7;
      if ((env.rain || this.weather === 'storm') && d.era === 2 && w.t === BULLET) acc *= 0.5;
      if ((this.weather === 'night' || env.eclipse) && !d.tech) acc *= 0.7;
      if (this.weather === 'storm' && this.airborne(j)) acc *= 0.7;
      if (d.tech && this.jammedAt(this.x[i], this.y[i], this.side[i]) && s.lockon <= 0) acc *= 0.25;
      const ts = this.squads[this.sq[j]];
      if (ts.evadeT > 0) acc *= 0.4;
      if (this.airborne(j) && w.t === ARROW) acc *= 0.6;
      let sp = w.sp || 0;
      let guaranteed = false;
      if (slot === 1 && s.barbara > 0) { s.barbara--; guaranteed = true; sp *= 3; }
      if (w.t === MISSILE && s.lockon > 0) { s.lockon--; guaranteed = true; }
      const hit = guaranteed || this.rand() < acc;
      let tx = this.x[j], ty = this.y[j];
      if (!hit) { const a = this.rand() * 6.283, r = 5 + this.rand() * (sp ? sp * 1.5 : 12); tx += cosd(a) * r; ty += sind(a) * r; }
      const dx = tx - this.x[i], dy = ty - this.y[i], dist = Math.sqrt(dx * dx + dy * dy);
      let dmg = w.d * s.dmgMul * (s.joanBuffT > 0 ? 1.25 : 1) * bonusMul(d, tdef) * this.mul[this.side[i] * NF + this.side[j]];
      if (w.en) this.fac[this.side[i]].energy -= w.en;
      if (s.chargeT > 0 && s.fleeT <= 0 && s.def.lore && s.def.lore.id === 'feigned') dmg *= 2;
      const p = this.np < MAXP ? this.np++ : -1;
      const T = Math.max(0.03, dist / PSPEED[w.t]);
      if (p < 0) { this.impact(this.x[i], this.y[i], tx, ty, dmg, w.t, sp, hit ? j : -1, this.side[i], s.id, this.airborne(j)); return; }
      this.px[p] = this.x[i]; this.py[p] = this.y[i]; this.tx[p] = tx; this.ty[p] = ty; this.pt[p] = 0; this.pT[p] = T;
      this.pd[p] = dmg; this.pk[p] = w.t; this.psp[p] = sp; this.pj[p] = hit ? j : -1; this.pside[p] = this.side[i]; this.psq[p] = s.id;
      this.pair[p] = this.airborne(j) ? 1 : 0;
      if (w.t >= SHELL || this.rand() < 0.25) this.emit({ k: 'shot', t: w.t, x: this.x[i], y: this.y[i] });
    }
    impact(sx, sy, tx, ty, dmg, t, sp, j, side, srcSq, air) {
      if (sp > 0) {
        this.emit({ k: t === FIRE ? 'flame' : 'boom', x: tx, y: ty, r: sp });
        this.query(tx, ty, sp, (k, d2) => {
          if (!this.hos[side * NF + this.side[k]]) return false;
          if (this.airborne(k) !== !!air) return false;
          if (this.flags[k] & F_GHOST) return false;
          const f = 1 - 0.5 * Math.sqrt(d2) / sp;
          this.damage(k, dmg * f, t, srcSq);
          return false;
        });
        if (t === FIRE && j >= 0 && this.alive[j]) this.ignite(j, 1.5, dmg, srcSq);
      } else if (j >= 0 && this.alive[j]) {
        this.damage(j, dmg, t, srcSq);
      }
    }
    ignite(j, T, dps, srcSq) {
      if (this.flagsEnv.rain || this.weather === 'storm') return;
      this.burnT[j] = Math.max(this.burnT[j], T); this.burnD[j] = Math.max(this.burnD[j], dps); this.burnS[j] = srcSq;
    }
    stepProjectiles() {
      let w = 0;
      for (let p = 0; p < this.np; p++) {
        this.pt[p] += DT;
        if (this.pt[p] >= this.pT[p]) {
          this.impact(this.px[p], this.py[p], this.tx[p], this.ty[p], this.pd[p], this.pk[p], this.psp[p], this.pj[p], this.pside[p], this.psq[p], this.pair[p]);
          continue;
        }
        if (w !== p) {
          this.px[w] = this.px[p]; this.py[w] = this.py[p]; this.tx[w] = this.tx[p]; this.ty[w] = this.ty[p]; this.pt[w] = this.pt[p];
          this.pT[w] = this.pT[p]; this.pd[w] = this.pd[p]; this.pk[w] = this.pk[p]; this.psp[w] = this.psp[p]; this.pj[w] = this.pj[p];
          this.pside[w] = this.pside[p]; this.psq[w] = this.psq[p]; this.pair[w] = this.pair[p];
        }
        w++;
      }
      this.np = w;
    }
    jammedAt(x, y, side) {
      for (const s of this.squads) if (s.fooT > 0 && this.hos[s.side * NF + side] && s.alive > 0) {
        const dx = s.cx - x, dy = s.cy - y; if (dx * dx + dy * dy < 260 * 260) return true;
      }
      return false;
    }

    // ---------- main step ----------
    step() {
      if (this.over) return;
      this.t += DT; this.tick++;
      if (this.fx.length > 4000) this.fx.length = 0;
      this.applyCmds();
      this.updateEvents();
      this.updateWorld();
      this.buildGrid();
      this.updateSquads();
      this.updateUnits();
      this.separate();
      this.stepProjectiles();
      this.updateFires();
      if (this.tick % 15 === 0) this.checkEnd();
    }

    updateEvents() {
      const env = this.flagsEnv;
      if (this.chaosAt.length && this.t >= this.chaosAt[0]) {
        this.chaosAt.shift();
        const pool = Object.keys(EVENTS).filter(k => !this.usedEvents[k]);
        let id = this.opts.forceEvent || pool[(this.rand() * pool.length) | 0];
        if (id) { this.usedEvents[id] = 1; this.startEvent(id); }
      }
      for (let k = this.events.length - 1; k >= 0; k--) {
        const e = this.events[k]; e.t -= DT;
        if (e.t <= 0) { this.events.splice(k, 1); this.endEvent(e.id); }
      }
      // plague damage
      if (env.plague && this.tick % 10 === 0) {
        for (let i = 0; i < this.n; i++) if (this.alive[i]) {
          const d = HB.UNITS[this.ti[i]];
          if (d.veh || d.air || d.tagset.siege || d.tagset.ghost) continue;
          this.damage(i, d.hp * (d.tech ? 0.012 : 0.03), CRUSH, -1);
        }
      }
    }
    startEvent(id) {
      const E = EVENTS[id], env = this.flagsEnv;
      this.events.push({ id, t: E.dur, dur: E.dur, color: E.color, name: E.name });
      this.stats.events.push(id);
      this.emit({ k: 'event', id, text: E.name, sub: E.sub, color: E.color, big: true, slow: 1.2 });
      if (id === 'sandstorm') env.sand = 1;
      if (id === 'plague') env.plague = 1;
      if (id === 'monsoon') { env.rain = 1; this.fires.length = 0; for (let i = 0; i < this.n; i++) this.burnT[i] = 0; }
      if (id === 'eclipse' || id === 'emp') {
        if (id === 'eclipse') env.eclipse = 1; else env.emp = 1;
        for (let i = 0; i < this.n; i++) if (this.alive[i]) {
          const d = HB.UNITS[this.ti[i]];
          if (id === 'emp' && d.tech) { this.stunT[i] = Math.max(this.stunT[i], E.dur); const sq = this.squads[this.sq[i]]; if (sq.shield > 0 || d.shield) { sq.shield = 0; sq.shieldOffT = 12; } }
          if (d.air && this.airborne(i) && (id === 'eclipse' || d.tech)) {
            this.flags[i] |= F_TEMPLAND;
            this.emit({ k: 'callout', text: d.short.toUpperCase() + ' FORCED DOWN!', x: this.x[i], y: this.y[i], color: E.color, big: true });
          }
        }
      }
      if (id === 'betrayal') {
        for (let side = 0; side < this.nF; side++) {
          const to = this.otherSide(side); if (to < 0) continue;
          const cands = this.squads.filter(s => s.side === side && !s.temp && s.alive >= 8 && !s.def.veh && !s.def.air);
          if (!cands.length) continue;
          const s = cands[(this.rand() * cands.length) | 0];
          const take = Math.floor(s.alive * 0.12);
          const ns = this.addSquad(to, s.ti, 0, s.cx, s.cy, { label: 'Traitor ' + s.def.short, routed: true, traitorOf: side });
          ns.n0 = take; ns.cd = 999;
          let moved = 0;
          for (let i = 0; i < this.n && moved < take; i++) if (this.alive[i] && this.sq[i] === s.id) {
            this.sq[i] = ns.id; this.side[i] = to; s.alive--; s.n0--; ns.alive++; moved++; this.tgt[i] = -1;
          }
          this.emit({ k: 'callout', text: moved + ' ' + s.def.short.toUpperCase() + ' DEFECT!', x: s.cx, y: s.cy, color: '#c77dff', big: true });
        }
      }
      if (id === 'aliens') {
        const ux = 80 + this.rand() * 340, uy = 200 + this.rand() * 300;
        this.emit({ k: 'ufo', x: ux, y: uy, big: true });
        for (let side = 0; side < this.nF; side++) {
          let budget = this.sideValue(side) * 0.08;
          const idx = [];
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.side[i] === side && this.life[i] < 0 && !(this.flags[i] & F_DECOY)) idx.push(i);
          for (let k = idx.length - 1; k > 0; k--) { const r = (this.rand() * (k + 1)) | 0; const t = idx[k]; idx[k] = idx[r]; idx[r] = t; }
          let taken = 0;
          for (const i of idx) {
            const c = HB.UNITS[this.ti[i]].cost;
            if (c > budget) continue;
            budget -= c; taken++;
            this.emit({ k: 'beam', x: this.x[i], y: this.y[i], ux, uy });
            this.kill(i, -1, MELEE, true);
            if (budget < 1) break;
          }
        }
      }
    }
    endEvent(id) {
      const env = this.flagsEnv;
      if (id === 'sandstorm') env.sand = 0;
      if (id === 'plague') env.plague = 0;
      if (id === 'monsoon') env.rain = 0;
      if (id === 'eclipse') env.eclipse = 0;
      if (id === 'emp') env.emp = 0;
      if (id === 'eclipse' || id === 'emp') {
        if (env.eclipse || env.emp) return;
        for (let i = 0; i < this.n; i++) if (this.flags[i] & F_TEMPLAND) {
          this.flags[i] &= ~F_TEMPLAND;
          if (this.fuel[i] > 0 && this.alive[i]) this.emit({ k: 'callout', text: 'TAKING OFF', x: this.x[i], y: this.y[i], color: '#fff' });
        }
      }
    }
    darkNow() { return this.weather === 'night' || this.flagsEnv.eclipse; }
    sunnyNow() { const e = this.flagsEnv; return this.weather === 'day' && !e.eclipse && !e.sand && !e.rain; }

    updateSquads() {
      const S = this.squads, ns = S.length;
      const sx = new Float64Array(ns), sy = new Float64Array(ns), sc = new Int32Array(ns);
      for (let i = 0; i < this.n; i++) if (this.alive[i]) { const q = this.sq[i]; sx[q] += this.x[i]; sy[q] += this.y[i]; sc[q]++; }
      const retarget = this.tick % 15 === 0;
      for (const s of S) {
        if (sc[s.id]) { s.cx = sx[s.id] / sc[s.id]; s.cy = sy[s.id] / sc[s.id]; }
        s.alive = sc[s.id];
        // timers
        for (const k of ['holdT', 'buffT', 'disorderT', 'joanT', 'joanBuffT', 'invisT', 'dazeT', 'stunT', 'evadeT', 'freeAmmoT', 'zombieT', 'immortalT', 'chargeT', 'fleeT', 'invulnT', 'fooT', 'routT', 'engT', 'shieldOffT', 'abFx']) if (s[k] > 0) s[k] -= DT;
        if (s.buffT <= 0) s.dmgMul = 1;
        if (s.ph === 1 && s.fleeT <= 0) this.feignedTurn(s);
        if (s.alive <= 0) continue;
        if (s.cd > 0 && s.cd < 900) s.cd -= DT;
        if (s.invisT <= 0 && s.wasInvis) { s.wasInvis = false; if (s.def.lore && s.def.lore.id === 'phila') { s.dazeT = 1; this.emit({ k: 'callout', text: 'SEALs REAPPEAR!', x: s.cx, y: s.cy, color: '#5fd0ff' }); } }
        if (s.zombieT <= 0 && s.wasZombie) {
          s.wasZombie = false;
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id && (this.flags[i] & F_ZOMBIE)) { this.flags[i] &= ~F_ZOMBIE; if (this.hp[i] <= 0) this.kill(i, -1, MELEE, false); }
        }
        if (s.joanT > 0) {
          if (s.alive < s.n0 * 0.25) { s.joanT = 0; this.emit({ k: 'callout', text: 'THE BANNER FALLS', x: s.cx, y: s.cy, color: '#aaa' }); }
          else for (const o of S) if (!this.hos[s.side * NF + o.side] && o.alive > 0) { const dx = o.cx - s.cx, dy = o.cy - s.cy; if (dx * dx + dy * dy < 160 * 160) { o.joanBuffT = 0.6; o.routT = 0; } }
        }
        if (s.openT > 0) {
          s.openT -= DT;
          if (s.openT <= 0) this.trojanOpen(s);
        }
        // order upkeep
        if (s.order) {
          s.order.t -= DT;
          if (s.order.kind === 'move') {
            const dx = s.order.x - s.cx, dy = s.order.y - s.cy;
            if (!s.order.arrived && dx * dx + dy * dy < 15 * 15) { s.order.arrived = true; s.order.t = Math.min(s.order.t, 8); }
          }
          if (s.order.kind === 'attack' && (!S[s.order.sq] || S[s.order.sq].alive <= 0)) s.order = null;
          if (s.order && s.order.t <= 0) s.order = null;
        }
        // morale
        if (!s.routed && !s.temp && s.alive < s.n0 * 0.4 && s.n0 >= 8 && !s.def.tagset.fearless && !s.def.veh && !s.def.air && !s.def.tagset.siege && s.joanBuffT <= 0) {
          s.routed = true;
          const lowM = this.fac[s.side] && this.fac[s.side].morale < 20 ? 0.25 : 0;
          if (this.rand() < (s.def.tagset.disc ? 0.25 : 0.6) + lowM) { if (this.fac[s.side]) this.fac[s.side].morale -= 4; s.routT = 3.5; this.emit({ k: 'callout', text: s.def.short.toUpperCase() + ' ROUT!', x: s.cx, y: s.cy, color: '#ddd', tip: 'rout' }); }
        }
        if (retarget) s.tgt = this.pickSquadTarget(s);
        // abilities
        if (s.def.lore && s.cd <= 0 && (this.tick + s.id) % 15 === 0 && s.abT <= 0) {
          if (!this.payBlock(s) && this.abilityCond(s)) this.activate(s, false);
        }
        if (s.abT > 0) s.abT -= DT;
      }
    }
    pickSquadTarget(s) {
      if (s.order && s.order.kind === 'attack') return s.order.sq;
      let best = -1, bd = 1e18, anyBest = -1, anyD = 1e18;
      for (const o of this.squads) {
        if (!this.hos[s.side * NF + o.side] || o.alive <= 0 || o.def.tagset.ghost || o.def.tagset.decoy) continue;
        const dx = o.cx - s.cx, dy = o.cy - s.cy, d2 = dx * dx + dy * dy;
        if (d2 < anyD) { anyD = d2; anyBest = o.id; }
        const air = o.def.air && this.squadAirborne(o);
        if (air && !s.def.canAir) continue;
        if (o.invisT > 0) continue;
        if (d2 < bd) { bd = d2; best = o.id; }
      }
      return best >= 0 ? best : anyBest;
    }
    squadAirborne(o) {
      for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === o.id) return this.airborne(i);
      return false;
    }
    enemiesNear(x, y, R, side, filt) {
      let c = 0;
      this.query(x, y, R, (j) => { if (this.hos[side * NF + this.side[j]] && !(this.flags[j] & (F_GHOST | F_DECOY)) && (!filt || filt(j))) c++; return false; });
      return c;
    }

    // ---------- lore abilities ----------
    abilityCond(s) {
      const id = s.def.lore.id, S = this.squads, tgt = S[s.tgt];
      const dist = tgt ? hyp(tgt.cx - s.cx, tgt.cy - s.cy) : 1e9;
      switch (id) {
        case 'thermopylae': return s.engT > 0 && this.enemiesNear(s.cx, s.cy, 60, s.side) >= s.alive * 1.3;
        case 'mars': return (s.engT > 0 || s.alive < s.n0 * 0.8) && !this.flagsEnv.eclipse;
        case 'immortal': return s.alive < s.n0 * 0.85 && !this.flagsEnv.plague;
        case 'ra': return dist < 130 && !this.darkNow();
        case 'deathray': return this.sunnyNow() && this.bigTargetNear(s, 320) >= 0;
        case 'trojan': return this.t > 6;
        case 'berserk': return s.engT > 0;
        case 'agincourt': return !this.flagsEnv.rain && this.weather !== 'storm' && this.enemiesNear(s.cx, s.cy, 150, s.side) >= 12;
        case 'grail': return s.alive < s.n0 * 0.75 && !this.flagsEnv.plague;
        case 'feigned': return dist < 100 && tgt && (tgt.def.m > 0) && !tgt.def.veh;
        case 'greekfire': return !this.flagsEnv.rain && this.weather !== 'storm' && this.enemiesNear(s.cx, s.cy, 70, s.side) >= 3;
        case 'kamikaze': return this.squads.some(o => this.hos[s.side * NF + o.side] && o.alive > 0 && o.def.air && this.squadAirborne(o)) || this.enemyCount(s.side) > this.sideCount(s.side) * 3 && dist < 150;
        case 'tell': return this.bigTargetNear(s, 250, 100) >= 0;
        case 'joan': return s.engT > 0 || S.some(o => o.side === s.side && o.routT > 0) || dist < 120;
        default: return this.condExt(s, id, dist, tgt);
        case 'wings': return dist < 110;
        case 'barbara': return this.enemiesNear(tgt ? tgt.cx : s.cx, tgt ? tgt.cy : s.cy, 25, s.side) >= 8 && dist < 220;
        case 'smoke': return s.engT > 0 && s.alive < s.n0;
        case 'angels': return s.alive < s.n0 * 0.5;
        case 'deserters': return this.nmlCluster(s) != null;
        case 'ghostarmy': return dist < 260;
        case 'foo': return dist < 300;
        case 'phila': return s.engT > 0 && this.enemiesNear(s.cx, s.cy, 30, s.side, (j) => HB.UNITS[this.ti[j]].m > 0) >= 3;
        case 'roswell': return this.bigTargetNear(s, 260, 500) >= 0;
        case 'montauk': case 'desertstorm': { let low = false; for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id && this.hp[i] < s.def.hp * 0.5) low = true; return low; }
        case 'ghostkyiv': return dist < 300;
      }
      return false;
    }
    bigTargetNear(s, R, minCost) {
      const sb = s.side * NF;
      let best = -1, bv = -1;
      this.query(s.cx, s.cy, R, (j) => {
        if (!this.hos[sb + this.side[j]] || (this.flags[j] & (F_GHOST | F_DECOY))) return false;
        const d = HB.UNITS[this.ti[j]];
        const ok = minCost ? d.cost >= minCost : (d.veh || d.air || d.tagset.siege);
        if (ok && d.cost > bv) { bv = d.cost; best = j; }
        return false;
      });
      return best;
    }
    nmlCluster(s) {
      let sx = 0, sy = 0, c = 0;
      for (let i = 0; i < this.n; i++) if (this.alive[i] && this.hos[s.side * NF + this.side[i]] && this.y[i] > NML0 && this.y[i] < NML1 && !this.airborne(i) && this.life[i] < 0) {
        const dx = this.x[i] - s.cx, dy = this.y[i] - s.cy;
        if (dx * dx + dy * dy < 240 * 240) { sx += this.x[i]; sy += this.y[i]; c++; }
      }
      return c >= 15 ? { x: sx / c, y: sy / c } : null;
    }
    // manual trigger from press-and-hold
    tryAbility(sqi) {
      const s = this.squads[sqi];
      if (!s || !s.def.lore || s.alive <= 0) return { ok: false, msg: 'No ability' };
      if (s.cd > 0) return { ok: false, msg: s.cd > 900 ? 'Already used' : 'Ready in ' + Math.ceil(s.cd) + 's' };
      const blocked = this.blockedReason(s) || this.payBlock(s);
      if (blocked) return { ok: false, msg: blocked };
      return this.activate(s, true) ? { ok: true } : { ok: false, msg: 'No valid target' };
    }
    blockedReason(s) {
      const id = s.def.lore.id, e = this.flagsEnv;
      if (id === 'mars' && e.eclipse) return 'Bad omen: eclipse!';
      if ((id === 'grail' || id === 'immortal') && e.plague) return 'Black Death blocks it';
      if (id === 'deathray' && !this.sunnyNow()) return 'Needs clear sunlight';
      if (id === 'ra' && this.darkNow()) return 'Ra sleeps at night';
      if ((id === 'agincourt' || id === 'greekfire') && (e.rain || this.weather === 'storm')) return 'Too wet!';
      if (id === 'trojan' && this.t < 1) return 'Wait for the battle';
      return null;
    }
    activateCore(s, manual) {
      const id = s.def.lore.id, L = s.def.lore, S = this.squads;
      const tgt = S[s.tgt];
      const out = (text, color, opts) => this.emit(Object.assign({ k: 'callout', text, x: s.cx, y: s.cy, color: color || HB.ERAS[s.def.era].color, big: true, ability: true, side: s.side, tip: 'lore' }, opts || {}));
      switch (id) {
        case 'thermopylae': s.holdT = 7; break;
        case 'mars': s.dmgMul = 1.6; s.buffT = 6; if (!this.flagsEnv.plague) this.healSquad(s, 0.25); break;
        case 'immortal': s.immortalT = 8; break;
        case 'ra': s.chargeT = 4; s.chargeMul = 3; break;
        case 'deathray': {
          const j = this.bigTargetNear(s, 320); if (j < 0) return false;
          const d = HB.UNITS[this.ti[j]];
          this.burnT[j] = 6; this.burnD[j] = (d.hp * 0.05 + 5) / Math.max(0.25, d.armorArr[FIRE]); this.burnS[j] = s.id;
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) this.emit({ k: 'ray', x1: this.x[i], y1: this.y[i], x2: this.x[j], y2: this.y[j] });
          break;
        }
        case 'trojan': {
          let horse = -1; for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) horse = i;
          if (horse < 0) return false;
          const ex = this.enemyCentroid(s.side);
          this.x[horse] = clamp(ex.x + (this.rand() - 0.5) * 60, 20, W - 20);
          { const vx = ex.x - s.cx, vy = ex.y - s.cy, vl = hyp(vx, vy) || 1; this.x[horse] = clamp(ex.x + vx / vl * 70 + (this.rand() - 0.5) * 60, 20, W - 20); this.y[horse] = clamp(ex.y + vy / vl * 70, 25, H - 25); }
          s.openT = 2.5; s.cd = 999;
          out('A GIFT APPEARS...', '#e8b04a', { x: this.x[horse], y: this.y[horse] });
          this.stats.abilities++;
          return true;
        }
        case 'berserk': s.zombieT = 5; s.wasZombie = true; s.dmgMul = 1.5; s.buffT = 5; break;
        case 'agincourt': {
          let shots = 0;
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) {
            const j = this.tgt[i] >= 0 && this.alive[this.tgt[i]] ? this.tgt[i] : this.findTarget(i, 150, -1);
            if (j < 0) continue;
            const w = { r: 160, d: s.def.w1.d * 2, rof: 1, t: ARROW, acc: 0.65, air: true };
            for (let k = 0; k < 3; k++) { const jj = k === 0 ? j : this.findTarget(i, 150, -1); if (jj >= 0) { this.fire(i, w, jj, 0); shots++; } }
          }
          if (!shots) return false;
          break;
        }
        case 'grail': this.healSquad(s, 1); s.invulnT = 2.5; break;
        case 'feigned': s.fleeT = 2.5; s.chargeT = 6.5; s.ph = 1; break;
        case 'greekfire': {
          const c = tgt ? { x: tgt.cx, y: tgt.cy } : null; if (!c) return false;
          const fx = s.cx + clamp(c.x - s.cx, -70, 70), fy = s.cy + clamp(c.y - s.cy, -70, 70);
          this.fires.push({ x: fx, y: fy, r: 30, t: 6, dps: 10, side: s.side, sq: s.id });
          this.emit({ k: 'firepool', x: fx, y: fy, r: 30 });
          break;
        }
        case 'kamikaze': {
          s.cd = 999;
          this.emit({ k: 'event', id: 'kamikaze', text: 'KAMIKAZE!', sub: 'The divine wind scatters the enemy', color: '#7fb3ff', big: true, slow: 1.5 });
          this.fires = this.fires.filter(f => f.side === s.side);
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.hos[s.side * NF + this.side[i]]) {
            const d = HB.UNITS[this.ti[i]];
            if (d.air && this.airborne(i)) {
              this.stunT[i] = 8; this.fuel[i] *= 0.6;
              this.x[i] = 20 + this.rand() * (W - 40); this.y[i] = 20 + this.rand() * (H - 40);

            } else if (!d.veh) {
              const dx = this.x[i] - s.cx, dy = this.y[i] - s.cy, dd = hyp(dx, dy);
              if (dd < 200 && dd > 0.01) { const push = 45 * (1 - dd / 200); this.x[i] = clamp(this.x[i] + dx / dd * push, 2, W - 2); this.y[i] = clamp(this.y[i] + dy / dd * push, 2, H - 2); this.stunT[i] = 1.5; }
            }
          }
          this.stats.abilities++;
          return true;
        }
        case 'tell': {
          const j = this.bigTargetNear(s, 250, 100); if (j < 0) return false;
          const d = HB.UNITS[this.ti[j]];
          this.emit({ k: 'ray', x1: s.cx, y1: s.cy, x2: this.x[j], y2: this.y[j], color: '#ffffff' });
          if (this.squads[this.sq[j]].invulnT <= 0) {
            this.hp[j] -= d.hp * 0.35; this.flash[j] = 0.3;
            if (this.hp[j] <= 0) this.kill(j, s.id, MISSILE);
          }
          break;
        }
        case 'joan': s.joanT = 8; break;
        case 'wings': {
          s.chargeT = 3; s.chargeMul = 2.5;
          const fx = tgt ? tgt.cx : s.cx, fy = tgt ? tgt.cy : s.cy;
          this.query((s.cx + fx) / 2, (s.cy + fy) / 2, 90, (j) => {
            if (!this.hos[s.side * NF + this.side[j]]) return false;
            const d = HB.UNITS[this.ti[j]];
            if (d.tagset.disc || d.veh || d.air || d.tagset.fearless || d.tagset.siege) return false;
            this.fearT[j] = 2.5; return false;
          });
          break;
        }
        case 'barbara': s.barbara = 3; break;
        case 'smoke': {
          s.invisT = 3;
          const ec = this.enemyCentroid(s.side), vx = ec.x - s.cx, vy = ec.y - s.cy, vl = hyp(vx, vy) || 1;
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) {
            this.emit({ k: 'smoke', x: this.x[i], y: this.y[i] });
            this.x[i] = clamp(this.x[i] + vx / vl * 50, 2, W - 2); this.y[i] = clamp(this.y[i] + vy / vl * 50, 2, H - 2); this.revealT[i] = 0;
          }
          break;
        }
        case 'angels': {
          const bk = this.backDir(s.side);
          const ns = this.addSquad(s.side, HB.UNIT.angel.idx, 20, clamp(s.cx + bk.x * 30, 20, W - 20), clamp(s.cy + bk.y * 30, 20, H - 20), { temp: true, label: 'Angels of Mons', cd: 999 });
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === ns.id) this.life[i] = 7;
          break;
        }
        case 'deserters': {
          const c = this.nmlCluster(s); if (!c) return false;
          const ns = this.addSquad(s.side, HB.UNIT.deserter.idx, 15, c.x, c.y, { label: 'Wild Deserters', cd: 999 });
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === ns.id) this.emit({ k: 'dirt', x: this.x[i], y: this.y[i] });
          out("THEY CAME FROM NO MAN'S LAND!", '#9fd36b', { x: c.x, y: c.y });
          this.stats.abilities++;
          s.cd = L.cd; s.abT = 1;
          return true;
        }
        case 'ghostarmy': {
          const ns = this.addSquad(s.side, HB.UNIT.decoy.idx, 0, s.cx, s.cy, { temp: true, label: 'Ghost Army', cd: 999 });
          for (let k = 0; k < 4; k++) {
            const a = k * 1.57 + this.rand(), i = this.spawn(s.side, ns.ti, ns.id, s.cx + cosd(a) * 30, s.cy + sind(a) * 30, 0, 0);
            if (i >= 0) this.life[i] = 12;
          }
          ns.n0 = 4;
          break;
        }
        case 'foo': s.fooT = 6; break;
        case 'phila': {
          const ec = this.enemyCentroid(s.side);
          let ax = s.cx - ec.x, ay = s.cy - ec.y; const al = hyp(ax, ay) || 1;
          const lat = this.rand() < 0.5 ? -1 : 1;
          const px = clamp(ec.x + (ax / al) * 110 + (-ay / al) * 70 * lat, 20, W - 20), py = clamp(ec.y + (ay / al) * 110 + (ax / al) * 70 * lat, 20, H - 20);
          for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) {
            this.emit({ k: 'warp', x: this.x[i], y: this.y[i] });
            this.x[i] = clamp(px + this.ox[i] * 0.6 + (this.rand() - 0.5) * 8, 2, W - 2);
            this.y[i] = clamp(py + this.oy[i] * 0.6 + (this.rand() - 0.5) * 8, 2, H - 2);
            this.emit({ k: 'warp', x: this.x[i], y: this.y[i] });
          }
          s.invisT = 4; s.wasInvis = true;
          break;
        }
        case 'roswell': s.lockon = 2; break;
        case 'desertstorm': s.invulnT = 4; this.healSquad(s, 0.2); break;
        case 'montauk': if (!this.montauk(s)) return false; break;
        case 'ghostkyiv': s.freeAmmoT = 6; s.evadeT = 6; break;
        default: if (!this.activateExt(s, id, manual, out)) return false;
      }
      s.cd = L.cd; s.abT = 1;
      this.stats.abilities++;
      out(L.name + '!', null, { slow: s.def.cost >= 400 || ['kamikaze', 'thermopylae', 'agincourt', 'tell', 'deathray', 'phila', 'berserk'].includes(id) ? 1.1 : 0, manual });
      return true;
    }
    trojanOpen(s) {
      let horse = -1; for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) horse = i;
      if (horse < 0) { this.emit({ k: 'callout', text: 'THE HORSE BURNED - NO ONE SURVIVED', x: s.cx, y: s.cy, color: '#aaa', big: true }); return; }
      const hs = this.addSquad(s.side, HB.UNIT.hoplite.idx, 30, this.x[horse], this.y[horse], { label: 'Trojan Hoplites', cd: 999 });
      this.emit({ k: 'callout', text: 'THE TROJAN HORSE OPENS!', x: this.x[horse], y: this.y[horse], color: '#e8b04a', big: true, slow: 1.3, ability: true, tip: 'lore' });
      void hs;
    }
    healSquad(s, frac) {
      for (let i = 0; i < this.n; i++) if (this.alive[i] && this.sq[i] === s.id) {
        const d = HB.UNITS[this.ti[i]]; this.hp[i] = Math.min(d.hp, Math.max(0, this.hp[i]) + d.hp * frac);
      }
      this.emit({ k: 'heal', x: s.cx, y: s.cy });
    }
    enemyCentroid(side) {
      let sx = 0, sy = 0, c = 0;
      for (const s of this.squads) if (this.hos[side * NF + s.side] && s.alive > 0 && !s.temp) { sx += s.cx * s.alive; sy += s.cy * s.alive; c += s.alive; }
      return c ? { x: sx / c, y: sy / c } : { x: W / 2, y: H / 2 };
    }
    updateFires() {
      for (let k = this.fires.length - 1; k >= 0; k--) {
        const f = this.fires[k]; f.t -= DT;
        if (f.t <= 0 || this.flagsEnv.rain) { this.fires.splice(k, 1); continue; }
        if (this.tick % 3 === 0) this.query(f.x, f.y, f.r, (j) => {
          if ((f.side >= 0 && !this.hos[f.side * NF + this.side[j]]) || this.airborne(j)) return false;
          this.damage(j, f.dps * DT * 3, FIRE, f.sq); return false;
        });
      }
    }

    // ---------- units ----------
    updateUnits() {
      const n = this.n, S = this.squads, env = this.flagsEnv;
      this.swarmPrev.set(this.swarm.subarray(0, n)); this.swarm.fill(0, 0, n);
      const rangeMul = env.sand ? 0.6 : (this.darkNow() ? 0.8 : 1);
      for (let i = 0; i < n; i++) {
        if (!this.alive[i]) continue;
        const d = HB.UNITS[this.ti[i]], s = S[this.sq[i]];
        if (this.life[i] > 0) { this.life[i] -= DT; if (this.life[i] <= 0) { this.kill(i, -1, MELEE, true); if (d.tagset.ghost) this.emit({ k: 'smoke', x: this.x[i], y: this.y[i], color: '#cfe8ff' }); continue; } }
        if (this.burnT[i] > 0) {
          this.burnT[i] -= DT;
          if (env.rain || this.weather === 'storm') this.burnT[i] = 0;
          if (this.tick % 6 === 0) { this.damage(i, this.burnD[i] * DT * 6, FIRE, this.burnS[i]); if (this.tick % 12 === 0) this.emit({ k: 'flame', x: this.x[i], y: this.y[i], r: 3 }); if (!this.alive[i]) continue; }
        }
        if (this.flash[i] > 0) this.flash[i] -= DT;
        if (this.revealT[i] > 0) this.revealT[i] -= DT;
        if (this.fearT[i] > 0) this.fearT[i] -= DT;
        if (this.cd0[i] > 0) this.cd0[i] -= DT;
        if (this.cd1[i] > 0) this.cd1[i] -= DT;
        if (this.cd2[i] > 0) this.cd2[i] -= DT;
        if (this.stunT[i] > 0) { this.stunT[i] -= DT; if (this.stunT[i] <= 0) this.flags[i] &= ~(F_FROZEN | F_LIFT); continue; }
        if (d.powered && this.fac[this.side[i]].dark && (d.veh || d.air)) continue; // power out: vehicles and aircraft go dark
        if (s.stunT > 0 || s.openT > 0) continue;
        if (d.air) { this.updateAir(i, d, s, rangeMul); continue; }
        if (d.tagset.decoy) continue;
        // ---- ground ----
        let spd = d.spd * (env.sand ? 0.8 : 1) * (env.plague && !d.veh ? 0.85 : 1);
        if (s.chargeT > 0) spd *= (s.fleeT > 0 ? 1.3 : (s.def.lore && s.def.lore.id === 'feigned' ? 1 : 2));
        if (s.holdT > 0) spd = 0;
        // fleeing (rout / fear / feigned retreat)
        if (s.routT > 0 || this.fearT[i] > 0 || s.fleeT > 0) {
          const e = s.tgt >= 0 ? S[s.tgt] : null;
          let ax = this.x[i] - (e ? e.cx : W / 2), ay = this.y[i] - (e ? e.cy : H / 2);
          if (Math.abs(ay) < 5 && Math.abs(ax) < 5) { const bk = this.backDir(s.side); ax = bk.x * 10; ay = bk.y * 10; }
          this.moveDir(i, ax, ay, spd * (s.fleeT > 0 ? 1 : 0.9), d);
          continue;
        }
        // retarget
        this.rt[i] -= DT;
        let j = this.tgt[i];
        const ordered = s.order;
        if (j >= 0 && (!this.alive[j] || !this.hos[this.side[i] * NF + this.side[j]] || (!d.canAir && this.airborne(j)) || ((this.flags[j] & F_STEALTH) && this.revealT[j] <= 0 && !d.radar) || S[this.sq[j]].invisT > 0)) { j = -1; this.tgt[i] = -1; this.rt[i] = 0; }
        if (this.rt[i] <= 0) {
          this.rt[i] = 0.35 + this.rand() * 0.3;
          const R = d.maxR ? d.maxR * rangeMul + 20 : 55;
          j = this.findTarget(i, R, ordered && ordered.kind === 'attack' ? ordered.sq : s.tgt);
          this.tgt[i] = j;
        }
        // movement goal
        let gx = -1, gy = -1, dj = 1e9;
        if (j >= 0) { const dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i]; dj = Math.sqrt(dx * dx + dy * dy); }
        const contact = j >= 0 ? d.rad + HB.UNITS[this.ti[j]].rad + 1.5 : 0;
        let attacked = false;
        if (j >= 0 && !(s.dazeT > 0)) {
          // melee
          if (d.m > 0 && dj <= contact && !this.airborne(j)) {
            if (this.cd0[i] <= 0) {
              this.cd0[i] = d.mrof * (0.85 + this.rand() * 0.3);
              let dmg = d.m * s.dmgMul * (s.joanBuffT > 0 ? 1.25 : 1) * bonusMul(d, HB.UNITS[this.ti[j]]) * this.mul[this.side[i] * NF + this.side[j]];
              if (s.chargeT > 0 && s.fleeT <= 0) { const td = HB.UNITS[this.ti[j]]; if (!td.tagset.spear) dmg *= s.chargeMul; }
              this.swarm[j]++;
              this.damage(j, dmg, MELEE, s.id);
              if (this.flags[i] & F_STEALTH) this.revealT[i] = 2;
              if (this.rand() < 0.08) this.emit({ k: 'clash', x: this.x[j], y: this.y[j] });
            }
            attacked = true; s.engT = 1.5;
            const ts = S[this.sq[j]]; ts.engT = 1.5;
          } else {
            // ranged weapons (fire every ready weapon in range)
            for (let k = 1; k <= 2; k++) {
              const w = k === 1 ? d.w1 : d.w2; if (!w) continue;
              const am = k === 1 ? this.am1[i] : this.am2[i]; if (am <= 0) continue;
              if (w.en && this.fac[this.side[i]].dark) continue;
              if (dj > w.r * rangeMul) continue;
              const air = this.airborne(j); if (air && !w.air) continue;
              let jj = j;
              const td = HB.UNITS[this.ti[j]];
              if (!air && d.m > 0 && w.d * td.armorArr[w.t] < 0.15 && d.m * td.armorArr[0] >= w.d * td.armorArr[w.t]) continue; // pointless volley: close to melee
              if (w.heavy && !(td.veh || td.air || td.tagset.siege)) { jj = this.bigTargetNear({ cx: this.x[i], cy: this.y[i], side: this.side[i] }, w.r * rangeMul); if (jj < 0) continue; }
              attacked = true;
              if ((k === 1 ? this.cd1[i] : this.cd2[i]) > 0) continue;
              if (k === 1) this.cd1[i] = w.rof * (0.9 + this.rand() * 0.2); else this.cd2[i] = w.rof * (0.9 + this.rand() * 0.2);
              if (!(k === 1 && s.freeAmmoT > 0)) { if (k === 1) this.am1[i]--; else this.am2[i]--; }
              this.fire(i, w, jj, k);
              if (this.flags[i] & F_STEALTH) this.revealT[i] = 2;
              if (d.hasAmmo && this.am1[i] <= 0 && this.am2[i] <= 0 && !(this.flags[i] & F_DRYMSG)) {
                this.flags[i] |= F_DRYMSG;
                if (d.rad >= 4 || d.veh) this.emit({ k: 'callout', text: d.short.toUpperCase() + ' OUT OF AMMO!', x: this.x[i], y: this.y[i], color: '#ffcc00', big: true, slow: d.cost >= 1000 ? 1.2 : 0, tip: 'ammo' });
              }
            }
            if (attacked) s.engT = Math.max(s.engT, 0.5);
          }
        }
        // movement
        if (spd <= 0) continue;
        if (d.veh) { this.vehicleMove(i, d, s, j, dj, attacked, spd); continue; }
        if (ordered && ordered.kind === 'move') {
          if (ordered.arrived) { if (attacked || j < 0 || dj > 40) continue; }
          else { if (attacked && d.m > 0 && dj <= contact) continue; gx = ordered.x + this.ox[i] * 0.7; gy = ordered.y + this.oy[i] * 0.7; this.moveTo(i, gx, gy, spd, d); continue; }
        }
        if (j >= 0 && d.tagset.kite && dj < 45 && !this.isDry(i) && HB.UNITS[this.ti[j]].m > 0 && !this.airborne(j) && !HB.UNITS[this.ti[j]].veh) {
          this.moveDir(i, this.x[i] - this.x[j], this.y[i] - this.y[j], spd * 0.9, d); continue;
        }
        if (attacked) continue;
        if (j >= 0) {
          // ranged units with no usable ammo close to melee
          this.moveTo(i, this.x[j], this.y[j], spd, d);
        } else if (s.tgt >= 0 && S[s.tgt]) {
          const o = S[s.tgt];
          const ddc = hyp(o.cx - this.x[i], o.cy - this.y[i]), om = o.alive < 6 ? Math.min(0.5, ddc / 500) : 0.5;
          this.moveTo(i, o.cx + this.ox[i] * om, o.cy + this.oy[i] * om, spd, d);
        }
      }
    }
    feignedTurn(s) {
      s.ph = 2;
      let c = 0;
      this.query(s.cx, s.cy, 140, (j) => {
        if (!this.hos[s.side * NF + this.side[j]]) return false;
        const d = HB.UNITS[this.ti[j]];
        if (d.tagset.disc || d.veh || d.air) return false;
        const t = this.squads[this.sq[j]]; if (t.disorderT <= 0) { t.disorderT = 4; c++; }
        return false;
      });
      this.emit({ k: 'callout', text: c ? 'THEY TOOK THE BAIT!' : 'NOBODY FELL FOR IT', x: s.cx, y: s.cy, color: c ? '#b48cff' : '#aaa', big: !!c });
    }
    moveTo(i, gx, gy, spd, d) {
      const dx = gx - this.x[i], dy = gy - this.y[i], dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 0.5) return;
      const st = Math.min(dd, spd * DT);
      this.x[i] = clamp(this.x[i] + dx / dd * st, 2, W - 2); this.y[i] = clamp(this.y[i] + dy / dd * st, 2, H - 2);
      this.hd[i] = atan2d(dy, dx);
      if (d.fuel) this.useFuel(i, d, DT);
    }
    moveDir(i, dx, dy, spd, d) {
      const dd = Math.sqrt(dx * dx + dy * dy) || 1;
      this.x[i] = clamp(this.x[i] + dx / dd * spd * DT, 2, W - 2); this.y[i] = clamp(this.y[i] + dy / dd * spd * DT, 2, H - 2);
      this.hd[i] = atan2d(dy, dx);
    }
    useFuel(i, d, amt) {
      if (!d.fuel) return true;
      this.fuel[i] -= amt;
      if (this.fuel[i] <= 0) {
        this.fuel[i] = 0;
        if (!(this.flags[i] & F_FUELMSG)) {
          this.flags[i] |= F_FUELMSG;
          this.emit({ k: 'callout', text: d.short.toUpperCase() + (d.air ? ' OUT OF FUEL - LANDING!' : ' OUT OF FUEL!'), x: this.x[i], y: this.y[i], color: '#ffcc00', big: true, slow: d.cost >= 1000 ? 1.2 : 0, tip: 'fuel' });
        }
        return false;
      }
      return true;
    }
    vehicleMove(i, d, s, j, dj, attacked, spd) {
      if (this.fuel[i] <= 0) return;
      const dry = this.isDry(i);
      const o = s.order;
      let mx = 0, my = 0, want = false;
      // threats in melee range -> back off while shooting
      let tx = 0, ty = 0, tc = 0;
      this.query(this.x[i], this.y[i], d.rad + 22, (k) => {
        if (this.hos[this.side[i] * NF + this.side[k]] && HB.UNITS[this.ti[k]].m > 0 && !this.airborne(k)) { tx += this.x[k]; ty += this.y[k]; tc++; }
        return false;
      });
      if (o && o.kind === 'move' && !o.arrived) { mx = o.x - this.x[i]; my = o.y - this.y[i]; want = true; }
      else if (dry) { const hm = this.homes[this.side[i]]; mx = hm.x - this.x[i]; my = hm.y - this.y[i]; want = Math.abs(my) + Math.abs(mx) > 14; if (tc) { mx = this.x[i] - tx / tc; my = this.y[i] - ty / tc; want = true; } }
      else if (tc) { mx = this.x[i] - tx / tc; my = this.y[i] - ty / tc; want = true; }
      else if (!attacked) {
        if (j >= 0) { mx = this.x[j] - this.x[i]; my = this.y[j] - this.y[i]; want = true; }
        else if (s.tgt >= 0) { const e = this.squads[s.tgt]; mx = e.cx - this.x[i]; my = e.cy - this.y[i]; want = true; }
      }
      if (!want) return;
      const dd = Math.sqrt(mx * mx + my * my) || 1;
      // crowd slows vehicles
      const slow = tc > 6 ? (dry ? 0 : 0.35) : tc > 2 ? (dry ? 0.3 : 0.6) : 1; // a dry tank gets bogged down by the swarm
      const st = spd * slow * DT;
      this.x[i] = clamp(this.x[i] + mx / dd * st, 4, W - 4); this.y[i] = clamp(this.y[i] + my / dd * st, 4, H - 4);
      this.hd[i] = atan2d(my, mx);
      this.useFuel(i, d, DT);
      // crush infantry under the tracks
      if (this.tick % 3 === 0 && !d.hover) this.query(this.x[i], this.y[i], d.rad, (k) => {
        if (this.hos[this.side[i] * NF + this.side[k]] && !HB.UNITS[this.ti[k]].veh && !this.airborne(k)) this.damage(k, 2.5 * slow, CRUSH, s.id);
        return false;
      });
    }
    updateAir(i, d, s, rangeMul) {
      const f = this.flags[i];
      if (f & (F_LANDED | F_TEMPLAND)) return; // grounded: sitting duck
      const isPlane = d.spd > 80;
      if (!this.useFuel(i, d, DT * (s.freeAmmoT > 0 ? 3 : 1))) { this.flags[i] |= F_LANDED; this.emit({ k: 'dust', x: this.x[i], y: this.y[i] }); if (isPlane) this.hp[i] *= 0.5; return; }
      const dry = this.isDry(i);
      if (dry || (f & F_RTB)) {
        if (!(f & F_RTB)) { this.flags[i] |= F_RTB; this.emit({ k: 'callout', text: d.short.toUpperCase() + ' RETURNING TO BASE', x: this.x[i], y: this.y[i], color: '#ffcc00', big: true, tip: 'rtb' }); }
        const hm = this.homes[this.side[i]];
        const dy = hm.y - this.y[i], dx0 = hm.x - this.x[i];
        if (Math.abs(dy) < 6 && Math.abs(dx0) < 8) { this.flags[i] |= F_LANDED; this.emit({ k: 'callout', text: d.short.toUpperCase() + ' LANDED - SWARM IT!', x: this.x[i], y: this.y[i], color: '#ff7744', big: true, slow: 1, tip: 'landed' }); return; }
        this.moveDir(i, dx0, dy, Math.min(d.spd * (isPlane ? 0.6 : 1), hyp(dx0, dy) / DT), d);
        return;
      }
      if (s.dazeT > 0) return;
      // target
      this.rt[i] -= DT;
      let j = this.tgt[i];
      if (j >= 0 && (!this.alive[j] || !this.hos[this.side[i] * NF + this.side[j]])) j = -1;
      if (this.rt[i] <= 0 || (j < 0 && this.tick % 6 === i % 6)) { this.rt[i] = 0.4; j = this.findTarget(i, d.maxR * rangeMul + 60, s.order && s.order.kind === 'attack' ? s.order.sq : s.tgt); this.tgt[i] = j; }
      let gx, gy;
      if (s.order && s.order.kind === 'move' && !s.order.arrived) { gx = s.order.x; gy = s.order.y; }
      else if (j >= 0) { gx = this.x[j]; gy = this.y[j]; }
      else if (s.tgt >= 0) { gx = this.squads[s.tgt].cx; gy = this.squads[s.tgt].cy; }
      else { gx = W / 2; gy = H / 2; }
      const dx = gx - this.x[i], dy = gy - this.y[i], dd = Math.sqrt(dx * dx + dy * dy) || 1;
      if (isPlane) {
        // strafing runs: dive at the enemy squad, extend past it, turn back
        if (s.order && s.order.kind === 'move' && !s.order.arrived) { /* fly to the ordered point */ }
        else if (s.tgt >= 0) { gx = this.squads[s.tgt].cx; gy = this.squads[s.tgt].cy; }
        const ddx = gx - this.x[i], ddy = gy - this.y[i], dg = Math.sqrt(ddx * ddx + ddy * ddy);
        if (this.revealT[i] > 0) this.revealT[i] -= DT; // reused as 'extend' timer for planes
        else if (dg < 25) this.revealT[i] = 1.3;
        else {
          let da = atan2d(ddy, ddx) - this.hd[i]; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
          this.hd[i] += clamp(da, -1.9 * DT, 1.9 * DT);
        }
        let h = this.hd[i]; while (h > Math.PI) h -= 6.283; while (h < -Math.PI) h += 6.283; this.hd[i] = h;
        this.x[i] += cosd(h) * d.spd * DT; this.y[i] += sind(h) * d.spd * DT;
        if (this.x[i] < 5 || this.x[i] > W - 5 || this.y[i] < 5 || this.y[i] > H - 5) { this.revealT[i] = 0; this.hd[i] += 2.5 * DT * (this.x[i] < W / 2 ? 1 : -1); this.x[i] = clamp(this.x[i], 5, W - 5); this.y[i] = clamp(this.y[i], 5, H - 5); }
        // guns: shoot whatever is in the nose cone
        if (this.cd1[i] <= 0 && this.am1[i] > 0) {
          const fx = this.x[i] + cosd(h) * d.w1.r * 0.55, fy = this.y[i] + sind(h) * d.w1.r * 0.55;
          let best = -1, bd = 1e9;
          this.query(fx, fy, d.w1.r * 0.5, (k, d2) => { if (this.hos[this.side[i] * NF + this.side[k]] && d2 < bd && this.visibleTo(k, i, d2)) { bd = d2; best = k; } return false; });
          if (best >= 0) this.airShoot(i, d, s, best, hyp(this.x[best] - this.x[i], this.y[best] - this.y[i]), rangeMul);
        }
      } else {
        const R = (d.w1 ? d.w1.r : 150) * rangeMul;
        let mv = 0;
        if (dd > R * 0.8) mv = 1; else if (dd < R * 0.5) mv = -0.7;
        if (mv) { this.x[i] = clamp(this.x[i] + dx / dd * d.spd * mv * DT, 5, W - 5); this.y[i] = clamp(this.y[i] + dy / dd * d.spd * mv * DT, 5, H - 5); }
        this.hd[i] = atan2d(dy, dx);
        if (j >= 0) this.airShoot(i, d, s, j, dd, rangeMul);
      }
    }
    airShoot(i, d, s, j, dj, rangeMul) {
      for (let k = 1; k <= 2; k++) {
        const w = k === 1 ? d.w1 : d.w2; if (!w) continue;
        if ((k === 1 ? this.am1[i] : this.am2[i]) <= 0) continue;
        if (w.en && this.fac[this.side[i]].dark) continue;
        if (dj > w.r * rangeMul) continue;
        if (this.airborne(j) && !w.air) continue;
        if ((k === 1 ? this.cd1[i] : this.cd2[i]) > 0) continue;
        if (k === 1) this.cd1[i] = w.rof * (0.9 + this.rand() * 0.2); else this.cd2[i] = w.rof * (0.9 + this.rand() * 0.2);
        if (!(k === 1 && s.freeAmmoT > 0)) { if (k === 1) this.am1[i]--; else this.am2[i]--; }
        this.fire(i, w, j, k);
        s.engT = Math.max(s.engT, 0.5);
      }
    }
    separate() {
      const n = this.n, cs = this.cellStart, ord = this.order, par = this.tick & 1;
      for (let i = 0; i < n; i++) {
        if (!this.alive[i] || (i & 1) !== par) continue;
        const di = HB.UNITS[this.ti[i]];
        if ((di.air && this.airborne(i)) || di.hover) continue;
        const xi = this.x[i], yi = this.y[i], ri = di.rad;
        const cx = (xi / CS) | 0, cy = (yi / CS) | 0;
        const span = ri > 4 ? 1 : (xi - cx * CS < CS / 2 ? -1 : 0);
        for (let r = cy - 1; r <= cy + 1; r++) {
          if (r < 0 || r >= GH) continue;
          for (let c = cx - 1; c <= cx + 1; c++) {
            if (c < 0 || c >= GW) continue;
            void span;
            const cell = r * GW + c;
            for (let k = cs[cell], e = cs[cell + 1]; k < e; k++) {
              const j = ord[k]; if (j === i || !this.alive[j]) continue;
              const dj = HB.UNITS[this.ti[j]];
              if ((dj.air && this.airborne(j)) || dj.hover) continue;
              let dx = this.x[j] - this.x[i], dy = this.y[j] - this.y[i];
              const min = ri + dj.rad, d2 = dx * dx + dy * dy;
              if (d2 >= min * min) continue;
              let dd = Math.sqrt(d2);
              if (dd < 0.01) { dx = this.rand() - 0.5; dy = this.rand() - 0.5; dd = Math.sqrt(dx * dx + dy * dy); }
              const ov = (min - dd) * 0.5;
              const wi = di.veh ? (dj.veh ? 0.5 : 0.03) : (dj.veh ? 0.97 : 0.5);
              const fixed_i = di.spd === 0 || (di.air && !dj.air) || (di.fuel && this.fuel[i] <= 0);
              const fixed_j = dj.spd === 0 || (dj.fuel && this.fuel[j] <= 0);
              const mi = fixed_i ? 0 : (fixed_j ? 1 : wi), mj = fixed_j ? 0 : (fixed_i ? 1 : 1 - wi);
              this.x[i] = clamp(this.x[i] - dx / dd * ov * 2 * mi, 2, W - 2); this.y[i] = clamp(this.y[i] - dy / dd * ov * 2 * mi, 2, H - 2);
              this.x[j] = clamp(this.x[j] + dx / dd * ov * 2 * mj, 2, W - 2); this.y[j] = clamp(this.y[j] + dy / dd * ov * 2 * mj, 2, H - 2);
            }
          }
        }
      }
    }
    checkEnd2() {
      const c0 = this.sideCount(0), c1 = this.sideCount(1);
      let w = -2;
      if (c0 === 0 && c1 === 0) w = -1;
      else if (c0 === 0) w = 1;
      else if (c1 === 0) w = 0;
      else if (this.t > (this.opts.timeLimit || 300)) {
        const v0 = this.sideValue(0) / Math.max(1, this.startValue[0]), v1 = this.sideValue(1) / Math.max(1, this.startValue[1]);
        w = Math.abs(v0 - v1) < 0.02 ? -1 : (v0 > v1 ? 0 : 1);
        this.timeout = true;
      }
      if (w !== -2) { this.over = true; this.winner = w; this.emit({ k: 'end', winner: w, big: true }); }
    }
    // ---------- results ----------
    summary2() {
      const sq = this.squads.filter(s => !s.def.hidden || s.label);
      const mvp = sq.filter(s => !s.def.tagset.decoy).sort((a, b) => (b.kv - a.kv) || (b.dmg - a.dmg))[0];
      return {
        winner: this.winner, time: this.t, timeout: !!this.timeout,
        survivors: [0, 1].map(side => this.squads.filter(s => s.side === side && !s.temp).map(s => ({ name: s.label || s.def.name, alive: s.alive, n0: s.n0, kills: s.kills, kv: s.kv }))),
        mvp: mvp ? { name: mvp.label || mvp.def.name, side: mvp.side, kills: mvp.kills, kv: mvp.kv } : null,
        events: this.stats.events.slice(), abilities: this.stats.abilities,
      };
    }
  }
  function bonusMul(d, t) {
    if (!d.bonus) return 1;
    let m = 1;
    for (const k in d.bonus) if (t.tagset[k]) m *= d.bonus[k];
    return m;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function cellOf(x, y) {
    let c = (x / CS) | 0, r = (y / CS) | 0;
    if (c < 0) c = 0; else if (c >= GW) c = GW - 1;
    if (r < 0) r = 0; else if (r >= GH) r = GH - 1;
    return r * GW + c;
  }
  HB.Battle = Battle;
  HB.makeRng = makeRng;
  HB.simConst = { F_LANDED, F_DECOY, F_GHOST, F_STEALTH, F_ZOMBIE, F_RTB, F_TEMPLAND, F_DRYMSG, F_FUELMSG, F_FROZEN, F_LIFT, NF, ALIEN, DT, MELEE, ARROW, BULLET, SHELL, FIRE, MISSILE, CRUSH, clamp, cellOf };
})(typeof window !== 'undefined' ? window : globalThis);
