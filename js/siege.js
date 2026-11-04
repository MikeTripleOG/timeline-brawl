/* Timeline Brawl v3 — castle sieges: concentric wall rings (outer, inner, keep) with gates and towers,
   rams on gates, siege towers and ladders on walls, trebuchets breaching sections, boiling oil, sallies,
   and a relief army marching in from a map edge. Mixed into HB.Battle (deterministic, like the rest of the sim). */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const { sin, cos, atan2, hyp, clamp } = HB.dmath;
  const { W, H, DT } = HB.WORLD;
  const HPI = Math.PI / 2;
  const CX = 400, CY = 400;
  // ring: half-width a, half-height b, chamfer c (fraction), segments per straight edge
  const RINGS = [
    { name: 'outer wall', a: 320, b: 285, c: 0.3, n: 3, hp: 130, gateHp: 170 },
    { name: 'inner wall', a: 185, b: 165, c: 0.3, n: 3, hp: 160, gateHp: 200 },
    { name: 'keep',       a: 72,  b: 66,  c: 0.25, n: 1, hp: 220, gateHp: 240 },
  ];
  HB.SIEGE_RINGS = RINGS; HB.CASTLE = { x: CX, y: CY };

  function segInter(ax, ay, bx, by, cx, cy, dx, dy) { // do segments AB and CD cross?
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  function buildRings(nRings) {
    const segs = [], towers = [];
    RINGS.slice(3 - nRings).forEach((R, ri0) => {
      const ri = ri0 + (3 - nRings);
      const ca = R.a * R.c, cb = R.b * R.c;
      // octagon vertices, clockwise from bottom-left of the bottom edge
      const V = [[CX - R.a + ca, CY + R.b], [CX + R.a - ca, CY + R.b], [CX + R.a, CY + R.b - cb], [CX + R.a, CY - R.b + cb],
        [CX + R.a - ca, CY - R.b], [CX - R.a + ca, CY - R.b], [CX - R.a, CY - R.b + cb], [CX - R.a, CY + R.b - cb]];
      for (let e = 0; e < 8; e++) {
        const [x1, y1] = V[e], [x2, y2] = V[(e + 1) % 8];
        const n = e === 0 ? (R.n % 2 ? R.n : R.n + 1) : (e % 2 === 0 ? R.n : 1);
        for (let k = 0; k < n; k++) {
          const sx = x1 + (x2 - x1) * k / n, sy = y1 + (y2 - y1) * k / n, ex = x1 + (x2 - x1) * (k + 1) / n, ey = y1 + (y2 - y1) * (k + 1) / n;
          const gate = e === 0 && k === (n - 1) / 2;
          const mx = (sx + ex) / 2, my = (sy + ey) / 2; let nx = mx - CX, ny = my - CY; const L = hyp(nx, ny) || 1; nx /= L; ny /= L;
          segs.push({ id: segs.length, ring: ri, x1: sx, y1: sy, x2: ex, y2: ey, mx, my, nx, ny, gate, hp: gate ? R.gateHp : R.hp, hp0: gate ? R.gateHp : R.hp, tower: -1, lad: 0, oilT: 3 });
          towers.push({ x: sx, y: sy, ring: ri });
        }
      }
    });
    return { segs, towers };
  }
  HB.buildRings = buildRings;
  function ringOf(x, y) { // 0 outside everything .. 3 inside the keep
    let k = 0;
    for (let i = 0; i < 3; i++) { const R = RINGS[i]; const dx = Math.abs(x - CX), dy = Math.abs(y - CY);
      if (dx < R.a && dy < R.b && (dx - (R.a - R.a * R.c)) / (R.a * R.c) + (dy - (R.b - R.b * R.c)) / (R.b * R.c) < 1) k = i + 1; }
    return k;
  }
  HB.ringOf = ringOf;
  HB.siegeZones = (o) => { // [attacker zone, defender zone] ordered by side index
    const nR = o.rings || 3, inner = RINGS[Math.max(3 - nR, 1)], d = o.def != null ? o.def : 1;
    const zd = { x0: CX - inner.a + 30, x1: CX + inner.a - 30, y0: CY - inner.b + 20, y1: CY + inner.b - 20, f: HPI };
    const za = { x0: 60, x1: W - 60, y0: H - 150, y1: H - 20, f: -HPI };
    return d === 1 ? [za, zd] : [zd, za];
  };

  Object.assign(HB.Battle.prototype, {
    initSiege(o) {
      const nR = o.rings || 3;
      const { segs, towers } = buildRings(nR);
      this.S = { def: o.def != null ? o.def : 1, atk: o.def === 0 ? 1 : 0, segs, towers, nR, keepT: 0, relief: o.relief || null, reliefIn: false, breaches: 0, gatesDown: 0, name: o.name || 'the castle' };
      const d = this.S.def, a = this.S.atk;
      // defenders deploy inside the inner ring (or outer if only one ring); attackers outside the outer gate
      const Z = HB.siegeZones(o); this.zones[0] = Z[0]; this.zones[1] = Z[1];
      this.homes[d] = { x: CX, y: CY }; this.homes[a] = { x: CX, y: H + 40 };
      // no hills or woods inside the castle
      const T = this.T, GW = W / 10;
      for (let gy = 0; gy < H / 10; gy++) for (let gx = 0; gx < GW; gx++) if (ringOf(gx * 10 + 5, gy * 10 + 5) > 0) { T.elev[gy * GW + gx] = 0; T.forest[gy * GW + gx] = 0; T.water[gy * GW + gx] = 0; }
      T.river = null;
    },
    segOpen(s, r) { // can regiment r pass through this wall section?
      if (s.hp <= 0) return 1;
      if (r.side === this.S.def || this.friendly(r.side, this.S.def)) return s.gate ? 1 : 0; // defenders open their own gates (sally)
      if (r.def.cls === 'inf' && (s.tower >= 0 || s.lad > 0)) return 0.35; // over the wall by siege tower / ladders
      return 0;
    },
    crossing(x0, y0, x1, y1, r) { // first impassable wall section crossed on the way
      let best = null, bd = 1e9;
      for (const s of this.S.segs) {
        if (!segInter(x0, y0, x1, y1, s.x1, s.y1, s.x2, s.y2)) continue;
        if (r && this.segOpen(s, r)) continue;
        const d = hyp(s.mx - x0, s.my - y0); if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    wallBetween(a, b) {
      for (const s of this.S.segs) {
        if (s.hp <= 0 || !segInter(a.x, a.y, b.x, b.y, s.x1, s.y1, s.x2, s.y2)) continue;
        if (s.tower >= 0 || s.lad > 0) continue; // fighting on the ramparts
        return true;
      }
      return false;
    },
    onWall(r) { // a regiment standing right behind a wall section shoots further and is covered
      if (!(r.side === this.S.def || this.friendly(r.side, this.S.def))) return false;
      for (const s of this.S.segs) if (s.hp > 0 && hyp(r.x - s.mx, r.y - s.my) < 45) return true;
      return false;
    },
    coverMul(a, t) {
      const def = this.S.def;
      if (t.def.ram || t.def.tower) return 0.35; // hide-covered engines
      if (!(t.side === def || this.friendly(t.side, def))) return 1;
      for (const s of this.S.segs) if (s.hp > 0 && segInter(a.x, a.y, t.x, t.y, s.x1, s.y1, s.x2, s.y2)) return 0.4;
      return 1;
    },
    // waypoint through the nearest usable opening of the ring that blocks the straight line
    viaGap(r, tx, ty) {
      if (r.st !== 0) return null;
      const blk = this.crossing(r.x, r.y, tx, ty, r); if (!blk) {
        // already lined up on an open section: crossing it may be slow (ladders / tower)
        for (const s of this.S.segs) if (s.hp > 0 && segInter(r.x, r.y, tx, ty, s.x1, s.y1, s.x2, s.y2)) { const o = this.segOpen(s, r); if (o < 1 && hyp(r.x - s.mx, r.y - s.my) < 40) return { x: tx, y: ty, slow: o }; }
        return null;
      }
      let best = null, bd = 1e9;
      for (const s of this.S.segs) {
        if (s.ring !== blk.ring || !this.segOpen(s, r)) continue;
        const d = hyp(s.mx - r.x, s.my - r.y) + hyp(tx - s.mx, ty - s.my) + (this.segOpen(s, r) < 1 ? 80 : 0);
        if (d < bd) { bd = d; best = s; }
      }
      if (!best) { // nothing open: go up to the wall (rams, towers and ladders will do the rest)
        const sg = (r.x - blk.mx) * blk.nx + (r.y - blk.my) * blk.ny >= 0 ? 1 : -1;
        return { x: blk.mx + blk.nx * sg * 16, y: blk.my + blk.ny * sg * 16, wall: blk };
      }
      const sg = (r.x - best.mx) * best.nx + (r.y - best.my) * best.ny >= 0 ? 1 : -1;
      const near = hyp(r.x - best.mx, r.y - best.my) < 34;
      const slow = this.segOpen(best, r);
      return near ? { x: best.mx - best.nx * sg * 40, y: best.my - best.ny * sg * 40, slow: slow < 1 ? slow : 1 } : { x: best.mx + best.nx * sg * 28, y: best.my + best.ny * sg * 28 };
    },
    wallBlock(r, nx, ny) {
      const s = this.crossing(r.x, r.y, nx, ny, r);
      if (!s) { r.blockT = 0; return false; }
      // pressing on a wall: attacking infantry throw up ladders after a few seconds
      if (r.def.cls === 'inf' && !(r.side === this.S.def)) {
        r.blockT = (r.blockT || 0) + DT;
        if (r.blockT > 4 && s.lad <= 0) { s.lad = 20; this.callout('LADDERS UP!', s.mx, s.my - 10, '#ffe08a'); this.emit({ k: 'ladder', seg: s.id }); }
      }
      return true;
    },
    wallGoal(r, o) {
      const s = this.S.segs[o.w]; if (!s || s.hp <= 0) { r.order = null; return null; }
      const sg = (r.x - s.mx) * s.nx + (r.y - s.my) * s.ny >= 0 ? 1 : -1;
      if (r.def.ram || r.def.tower) return { x: s.mx + s.nx * sg * (r.def.ram ? 14 : 13), y: s.my + s.ny * sg * (r.def.ram ? 14 : 13), f: atan2(-s.ny * sg, -s.nx * sg) };
      if (r.def.rng) { const d = hyp(r.x - s.mx, r.y - s.my); if (d < r.def.rng * 0.9 && (!r.def.minr || d > r.def.minr)) return { x: r.x, y: r.y, f: atan2(s.my - r.y, s.mx - r.x) }; return { x: s.mx + s.nx * sg * r.def.rng * 0.75, y: s.my + s.ny * sg * r.def.rng * 0.75, f: null }; }
      return { x: s.mx + s.nx * sg * 16, y: s.my + s.ny * sg * 16, f: null };
    },
    shootWall(a) {
      const s = this.S.segs[a.order.w]; if (!s || s.hp <= 0) { a.order = null; return false; }
      const d = hyp(s.mx - a.x, s.my - a.y);
      if (d > a.def.rng || (a.def.minr && d < a.def.minr) || a.moving) return false;
      a.rcd = a.def.rof; a.ammo--;
      const dmg = a.def.rdm * a.n * (a.def.wall || 0.5) * 1.6;
      this.emit({ k: 'volley', x0: a.x, y0: a.y, x1: s.mx, y1: s.my, n: 1, kind: a.def.kind, side: a.side, wall: 1 });
      this.damageWall(s, dmg, a.side);
      // defenders on that stretch of wall get hurt too
      for (const r of this.regs) if (r.st === 0 && this.hostile(a.side, r.side) && hyp(r.x - s.mx, r.y - s.my) < 40) this.hurt(r, dmg * 0.12, a, 0, 0.6);
      return true;
    },
    damageWall(s, dmg, side) {
      if (s.hp <= 0) return;
      s.hp -= dmg;
      if (s.hp <= 0) {
        s.hp = 0; s.tower = -1;
        if (s.gate) { this.S.gatesDown++; this.callout(s.ring === 2 ? 'THE KEEP GATE FALLS!' : 'THE GATE FALLS!', s.mx, s.my - 14, '#ffcf4a', true); }
        else { this.S.breaches++; this.callout(s.ring === 2 ? 'THE KEEP IS BREACHED!' : 'THE ' + RINGS[s.ring].name.toUpperCase() + ' IS BREACHED!', s.mx, s.my - 14, '#ffcf4a', true); }
        this.emit({ k: 'breach', seg: s.id, x: s.mx, y: s.my, gate: s.gate ? 1 : 0, ring: s.ring });
        // the defenders' morale wavers when a ring falls
        for (const r of this.regs) if (r.st === 0 && r.side === this.S.def && hyp(r.x - s.mx, r.y - s.my) < 160) r.morale -= 8;
        const f = this.fac[side]; if (f) f.faith = Math.min(100, f.faith + 8);
      }
    },
    siegeStep() {
      const S = this.S;
      for (const s of S.segs) {
        if (s.lad > 0) s.lad -= DT;
        if (s.hp <= 0) continue;
        // rams batter gates; towers dock on walls
        let defNear = null;
        for (const r of this.regs) {
          if (r.st !== 0) continue;
          const d = hyp(r.x - s.mx, r.y - s.my);
          if (r.side === S.def && d < 70 && ringOf(r.x, r.y) > s.ring) defNear = r;
          if (this.hostile(r.side, S.def) && d < 26) {
            if (r.def.ram && s.gate) { this.damageWall(s, r.n * 0.55 * DT, r.side); if (this.tick % 20 === 0) this.emit({ k: 'ram', x: s.mx, y: s.my, seg: s.id }); }
            if (r.def.tower && s.tower < 0 && !s.gate && d < 22) { s.tower = r.side; r.docked = s.id; this.callout('SIEGE TOWER DOCKS!', s.mx, s.my - 12, '#ffe08a', true); this.emit({ k: 'tower', seg: s.id }); }
          }
        }
        // boiling oil and rocks on whoever is at the gate (or on the ladders)
        if ((s.gate || s.lad > 0 || s.tower >= 0) && defNear) {
          s.oilT -= DT;
          if (s.oilT <= 0) {
            s.oilT = 5; let hit = false;
            for (const r of this.regs) if (r.st === 0 && this.hostile(r.side, S.def) && hyp(r.x - s.mx, r.y - s.my) < 34 && ringOf(r.x, r.y) <= s.ring) {
              this.hurt(r, r.def.ram ? 1.4 : 4, defNear, 0, 0.9); r.coh = Math.max(0, r.coh - 0.2); hit = true;
            }
            if (hit) { this.callout(s.gate ? 'BOILING OIL!' : 'ROCKS FROM THE WALLS!', s.mx, s.my - 10, '#ff9a4a'); this.emit({ k: 'oil', x: s.mx, y: s.my }); }
          }
        }
      }
      // siege towers that get knocked out free the wall
      for (const s of S.segs) if (s.tower >= 0) { const tw = this.regs.find(r => r.docked === s.id && r.st === 0); if (!tw) s.tower = -1; }
      // relief army marches in from a map edge
      const R = S.relief;
      if (R && !S.reliefIn && this.t >= R.t) {
        S.reliefIn = true;
        const side = R.side != null ? R.side : S.def, edge = R.edge || 'left';
        const zone = edge === 'left' ? { x0: 10, x1: 120, y0: 560, y1: 940, f: 0 } : { x0: W - 120, x1: W - 10, y0: 560, y1: 940, f: Math.PI };
        const lay = HB.layout ? HB.layout(this.fac[side].faction, R.picks, zone) : [];
        const fac = HB.FACTION[this.fac[side].faction];
        for (const e of lay) { const ro = fac.roster[e.r]; const r = this.addReg(side, ro.t, ro, e.x, e.y, zone.f); r.relief = 1; r.morale += 10; }
        this.callout('A RELIEF ARMY ARRIVES!', edge === 'left' ? 140 : W - 140, 700, '#bff59a', true);
        this.emit({ k: 'event', id: 'relief', text: 'A RELIEF ARMY ARRIVES', sub: this.fac[side].name + ' marches in from the ' + edge + ' to break the siege.', big: true });
      }
      // keep capture
      let atkIn = false, defIn = false;
      for (const r of this.regs) { if (r.st !== 0 || r.def.cls === "mon" || r.side >= this.nF) continue; if (hyp(r.x - CX, r.y - CY) < 60) { if (r.side === S.def || this.friendly(r.side, S.def)) defIn = true; else if (this.hostile(r.side, S.def)) { atkIn = true; S.keepSide = r.side; } } }
      S.keepT = atkIn && !defIn ? S.keepT + DT : Math.max(0, S.keepT - DT);
    },
    siegeEnd() {
      const S = this.S;
      if (S.keepT >= 15) {
        const w = S.keepSide;
        this.over = true; this.winners = [w]; this.winner = w; this.siegeResult = 'keep';
        this.emit({ k: 'event', id: 'keep', text: 'THE KEEP HAS FALLEN', sub: this.fac[w].name + ' takes ' + S.name + '.', big: true });
        this.emit({ k: 'over', winners: [w] }); return true;
      }
      if (this.t >= this.tmax && this.unbroken(S.def)) { // the castle held out
        this.over = true; this.timeout = true; this.winners = [S.def]; this.winner = S.def; this.siegeResult = 'held';
        this.emit({ k: 'event', id: 'held', text: 'THE WALLS HOLD', sub: S.name + ' did not fall.', big: true });
        this.emit({ k: 'over', winners: [S.def] }); return true;
      }
      return false;
    },
    wallIntegrity() { let h = 0, h0 = 0; for (const s of this.S.segs) { h += s.hp; h0 += s.hp0; } return h / h0; },
  });
})(typeof window !== 'undefined' ? window : globalThis);
