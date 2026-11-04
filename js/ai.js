/* Timeline Brawl v3 — AI commanders. Deterministic (uses the battle RNG), runs inside the sim.
   Anvil (infantry line) pins, hammer (cavalry/chariots/elephants) swings round a flank to hit the rear,
   missiles stay behind the line, skirmishers screen, horse archers kite and feign retreat.
   Game Dev holds hills, feints and curses; Remi swarms straight in. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const { sin, cos, atan2, hyp, wrap, clamp } = HB.dmath;

  function makeAI(b, side) {
    const C = b.fac[side].cmd;
    const style = C === 'remi' ? 'swarm' : C === 'gamedev' ? 'schemer' : 'line';
    const mem = { feintId: -1, feintT: 0, holdHill: null, advance: false, t0: 0 };
    const isAnvil = (r) => r.def.cls === 'inf';
    const isHammer = (r) => (r.def.cls === 'cav' && r.type !== 'horsearcher') || r.def.cls === 'ele';
    const isMsl = (r) => r.def.cls === 'msl' || r.def.cls === 'sie';
    function centroid(list) { let x = 0, y = 0, n = 0; for (const r of list) { x += r.x * r.n; y += r.y * r.n; n += r.n; } return n ? { x: x / n, y: y / n } : null; }
    function order(r, o) { // only re-issue when it really changed (keeps formations calm)
      const c = r.order;
      if (o.k === 'mv') {
        if (c && c.k === 'mv' && hyp(c.x - o.x, c.y - o.y) < 10 && (o.f == null || c.f == null || Math.abs(wrap(o.f - c.f)) < 0.3)) return;
        if (!c && hyp(r.x - o.x, r.y - o.y) < 6 && (o.f == null || Math.abs(wrap(o.f - r.f)) < 0.25)) return;
      } else if (c && c.k === 'at' && c.t === o.t) return;
      r.order = o;
    }
    function form(r, m) { if (r.form !== m && r.def.forms.includes(m) && !(r.cs && r.coh < 0.6)) b.setForm(r, m); }
    function threatCav(r, rad) { for (const e of b.regs) if (e.st === 0 && b.hostile(side, e.side) && (e.def.cls === 'cav' || e.def.cls === 'ele') && e.type !== 'horsearcher' && hyp(e.x - r.x, e.y - r.y) < rad && b.visibleTo(e, side)) return e; return null; }
    function enemyMissilesOn(r) { for (const e of b.regs) if (e.st === 0 && b.hostile(side, e.side) && e.def.rng && e.ammo > 0 && hyp(e.x - r.x, e.y - r.y) < e.def.rng + 20) return true; return false; }
    function nearestEnemy(r, filt, maxD) {
      let best = null, bd = maxD || 1e9;
      for (const e of b.regs) {
        if (e.st === 2 || !b.hostile(side, e.side) || !b.visibleTo(e, side)) continue;
        if (filt && !filt(e)) continue;
        const d = hyp(e.x - r.x, e.y - r.y); if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    function think() {
      if (b.over) return;
      const mine = b.regs.filter(r => r.side === side && r.st === 0 && r.def.cls !== 'mon');
      if (!mine.length) return;
      // Gods' Wrath: everybody turns on the monster
      if (b.wrath && b.wrath.mon && b.wrath.mon.st !== 2) {
        for (const r of mine) { if (!isMsl(r) && r.def.cls !== 'ele') order(r, { k: 'at', t: b.wrath.mon.id }); else if (isMsl(r)) r.order = null; }
        return;
      }
      if (b.S) { siegeThink(mine); return; }
      const foes = b.regs.filter(r => r.st === 0 && b.hostile(side, r.side) && r.def.cls !== 'mon' && b.visibleTo(r, side));
      const foesAll = b.regs.filter(r => r.st === 0 && b.hostile(side, r.side) && r.def.cls !== 'mon');
      if (!foesAll.length) return;
      const C0 = centroid(mine);
      // pick the enemy army to fight: nearest; schemers prefer whoever is already busy
      let tgtSide = -1, bs = 1e9;
      for (let s = 0; s < b.nF; s++) {
        if (!b.hostile(side, s) || !b.unbroken(s)) continue;
        const list = foesAll.filter(r => r.side === s); const c = centroid(list); if (!c) continue;
        let score = hyp(c.x - C0.x, c.y - C0.y);
        if (style === 'schemer') { let busy = 0; for (const r of list) if (r.cs && r.cs.some(o => o.side !== side)) busy++; score -= busy * 60; score += b.sideStrength(s) * 0.05; }
        if (score < bs) { bs = score; tgtSide = s; }
      }
      if (tgtSide < 0) return;
      const enemy = (foes.length ? foes : foesAll).filter(r => r.side === tgtSide);
      const CE = centroid(enemy.length ? enemy : foesAll.filter(r => r.side === tgtSide));
      let ux = CE.x - C0.x, uy = CE.y - C0.y; const dist = hyp(ux, uy) || 1; ux /= dist; uy /= dist;
      const px = -uy, py = ux, face = atan2(uy, ux);

      const anvil = mine.filter(isAnvil), hammer = mine.filter(isHammer), msl = mine.filter(isMsl), ha = mine.filter(r => r.type === 'horsearcher');
      // ----- where does the line stand? -----
      let LX, LY;
      const engagedAny = anvil.some(r => r.cs);
      if (style === 'schemer' && !mem.advance) {
        if (!mem.holdHill) { // best hill on our side of the field
          let best = null, bh = 0.35;
          for (const h of b.T.hills) { const toE = hyp(h.x - CE.x, h.y - CE.y), toMe = hyp(h.x - C0.x, h.y - C0.y); if (toMe < toE && toMe < 330 && h.h > bh) { bh = h.h; best = h; } }
          mem.holdHill = best || { x: C0.x + ux * 120, y: C0.y + uy * 120, none: 1 };
        }
        LX = mem.holdHill.x; LY = mem.holdHill.y;
        const close = foes.some(e => e.def.cls !== 'msl' && hyp(e.x - LX, e.y - LY) < 170);
        if (b.t > 75 || (close && b.t > 45) || engagedAny && b.t > 30 || mem.holdHill.none && b.t > 25) mem.advance = true;
        if (enemy.every(e => e.def.cls === 'msl' || e.def.cls === 'sie')) mem.advance = true;
      } else {
        mem.advance = true;
        LX = C0.x + ux * Math.min(dist * 0.55, 140); LY = C0.y + uy * Math.min(dist * 0.55, 140);
      }
      // ----- anvil: a line of regiments facing the enemy -----
      anvil.sort((a, c) => ((a.x - C0.x) * px + (a.y - C0.y) * py) - ((c.x - C0.x) * px + (c.y - C0.y) * py) || a.id - c.id);
      let total = 0; for (const r of anvil) total += r.W + 8;
      let off = -total / 2;
      for (const r of anvil) {
        const slot = off + r.W / 2; off += r.W + 8;
        const sx = LX + px * slot, sy = LY + py * slot;
        const cav = threatCav(r, 150);
        // formations
        if (r.type === 'pike') form(r, cav && HB.zoneOf(r, cav.x, cav.y) > 0 && !r.cs ? 'square' : 'phalanx');
        else if (r.type === 'legion') form(r, !r.cs && enemyMissilesOn(r) && !nearestEnemy(r, e => e.def.cls !== 'msl' && e.def.cls !== 'sie', 90) ? 'testudo' : 'line');
        else if (r.type === 'hoplite' || r.type === 'axe') form(r, r.def.forms.includes('shieldwall') ? 'shieldwall' : 'line');
        else if (r.type === 'spear') form(r, cav && !r.cs ? (HB.zoneOf(r, cav.x, cav.y) > 0 ? 'square' : 'shieldwall') : 'line');
        else if (r.type === 'impi') form(r, 'horns');
        else if (r.type === 'warband') form(r, 'wedge');
        else if (r.type === 'elite') form(r, style === 'swarm' ? 'wedge' : 'line');
        if (r.cs) continue;
        const e = nearestEnemy(r, x => x.def.cls !== 'cav' || hyp(x.x - r.x, x.y - r.y) < 50, mem.advance ? (style === 'swarm' ? 900 : 260) : 120);
        if (e && (mem.advance || hyp(e.x - r.x, e.y - r.y) < 120)) {
          // never charge braced pikes head-on if a flank is open: angle in slightly
          order(r, { k: 'at', t: e.id });
        } else order(r, { k: 'mv', x: sx, y: sy, f: face });
      }
      // ----- missiles behind the line -----
      msl.forEach((r, i) => {
        if (r.cs) return;
        const back = r.def.cls === 'sie' ? 80 : 42;
        const lat = (i - (msl.length - 1) / 2) * 55;
        const cav = threatCav(r, 120);
        if (cav && r.type !== 'javelin') { // run behind the nearest friendly infantry
          let best = null, bd = 1e9; for (const a of anvil) { const d = hyp(a.x - r.x, a.y - r.y); if (d < bd) { bd = d; best = a; } }
          if (best) { order(r, { k: 'mv', x: best.x - ux * 30, y: best.y - uy * 30, f: face }); return; }
        }
        if (r.type === 'javelin' && !engagedAny) { // skirmish screen ahead of the line, hunting elephants
          const ele = nearestEnemy(r, x => x.def.cls === 'ele', 260);
          if (ele) { order(r, { k: 'at', t: ele.id }); return; }
          order(r, { k: 'mv', x: LX + ux * 45 + px * lat, y: LY + uy * 45 + py * lat, f: face }); return;
        }
        order(r, { k: 'mv', x: LX - ux * back + px * lat, y: LY - uy * back + py * lat, f: face });
      });
      // ----- horse archers: kite at range, from the flank -----
      ha.forEach((r, i) => {
        if (r.cs) return; form(r, 'loose');
        const e = nearestEnemy(r, null, 400); if (!e) return;
        if (r.ammo <= 0) { const t = nearestEnemy(r, x => x.def.cls === 'msl' || x.def.cls === 'sie' || x.st === 1, 300); if (t) order(r, { k: 'at', t: t.id }); return; }
        const sg = i % 2 ? 1 : -1;
        const dx = r.x - e.x, dy = r.y - e.y, d = hyp(dx, dy) || 1;
        const tx = e.x + dx / d * 105 + px * sg * 40, ty = e.y + dy / d * 105 + py * sg * 40;
        order(r, { k: 'mv', x: tx, y: ty, f: null });
      });
      // ----- feint (Game Dev): one fast unit pokes the enemy line to pull it out of shape -----
      if (style === 'schemer' && b.t > 6 && b.t < 40 && mem.feintId < 0) {
        const f = mine.find(r => r.type === 'lightcav' || r.type === 'horsearcher');
        if (f) { mem.feintId = f.id; mem.feintT = b.t; }
      }
      // ----- hammer: flank and hit the rear, hunt archers, avoid braced pikes -----
      hammer.forEach((r, i) => {
        if (r.cs) return;
        if (r.id === mem.feintId && b.t - mem.feintT < 14) {
          const e = nearestEnemy(r, null, 600); if (e) order(r, { k: 'mv', x: e.x - ux * 70 + px * 30, y: e.y - uy * 70 + py * 30, f: null });
          if (r.ammo <= 0 || b.t - mem.feintT > 12) mem.feintId = -2;
          return;
        }
        if (r.def.cls === 'ele') { form(r, 'line'); const e = nearestEnemy(r, x => x.def.cls === 'inf' || x.def.cls === 'cav', 500) || nearestEnemy(r, null, 900); if (e && (mem.advance || hyp(e.x - r.x, e.y - r.y) < 140)) order(r, { k: 'at', t: e.id }); else order(r, { k: 'mv', x: LX + ux * 20 + px * (i ? 1 : -1) * 30, y: LY + uy * 20 + py * (i ? 1 : -1) * 30, f: face }); return; }
        if (r.fat > 75) { order(r, { k: 'mv', x: LX - ux * 60 + px * (i % 2 ? 1 : -1) * (total / 2 + 50), y: LY - uy * 60 + py * (i % 2 ? 1 : -1) * (total / 2 + 50), f: face }); return; }
        const sg = i % 2 ? 1 : -1;
        // 1) archers / siege that nobody protects
        const soft = nearestEnemy(r, x => (x.def.cls === 'msl' || x.def.cls === 'sie' || x.st === 1) && !b.regs.some(p => p.st === 0 && p.side === x.side && p.def.brace >= 2 && hyp(p.x - x.x, p.y - x.y) < 60), 330);
        // 2) an enemy regiment locked in melee with our line: go for its rear
        let pinned = null, pd = 1e9;
        for (const e of foes) { if (!e.cs || !e.cs.some(o => o.side === side) || e.def.cls === 'ele') continue; const d = hyp(e.x - r.x, e.y - r.y); if (d < pd) { pd = d; pinned = e; } }
        const tgt = pinned && (!soft || pd < hyp(soft.x - r.x, soft.y - r.y) * 0.8) ? pinned : soft;
        if (tgt && (mem.advance || hyp(tgt.x - r.x, tgt.y - r.y) < 200 || pinned)) {
          if (r.def.forms.includes('wedge')) form(r, 'wedge');
          const z = HB.zoneOf(tgt, r.x, r.y);
          const braced = b.braced(tgt, z) >= 1;
          if (z === 0 && (braced || tgt.cs || tgt.def.brace > 0)) { // swing wide around a flank to the rear
            const fx = cos(tgt.f), fy = sin(tgt.f), rx = -fy, ry = fx;
            const side2 = ((r.x - tgt.x) * rx + (r.y - tgt.y) * ry) >= 0 ? 1 : -1;
            const wpx = tgt.x + rx * side2 * (tgt.W / 2 + 60) - fx * (tgt.D / 2 + 25), wpy = tgt.y + ry * side2 * (tgt.W / 2 + 60) - fy * (tgt.D / 2 + 25);
            order(r, { k: 'mv', x: clamp(wpx, 10, HB.WORLD.W - 10), y: clamp(wpy, 10, HB.WORLD.H - 10), f: null });
          } else order(r, { k: 'at', t: tgt.id });
          return;
        }
        // 3) wait on the wing
        const wx = LX + px * sg * (total / 2 + 55) - ux * 10, wy = LY + py * sg * (total / 2 + 55) - uy * 10;
        if (style === 'swarm' && mem.advance && b.t > 15) { const e = nearestEnemy(r, x => !(b.braced(x, HB.zoneOf(x, r.x, r.y)) >= 1), 500); if (e) { order(r, { k: 'at', t: e.id }); return; } }
        order(r, { k: 'mv', x: clamp(wx, 10, HB.WORLD.W - 10), y: clamp(wy, 10, HB.WORLD.H - 10), f: face });
      });
      // ----- mythic abilities -----
      for (const r of mine) {
        if (!r.lore || b.canActivate(r)) continue;
        let go = false;
        switch (r.lore) {
          case 'mars': go = r.cs && (r.morale < 55 || r.coh < 0.5); break;
          case 'thermopylae': go = r.cs && (r.morale < 50 || r.cs.length >= 2); break;
          case 'alexander': go = r.order && r.order.k === 'at' && hyp(b.regs[r.order.t].x - r.x, b.regs[r.order.t].y - r.y) < 170; break;
          case 'hannibal': go = mine.some(o => o.def.cls === 'ele' && (o.cs || o.morale < 45)); break;
          case 'druidfog': go = foes.some(e => e.def.rng && e.ammo > 0 && hyp(e.x - r.x, e.y - r.y) < e.def.rng); break;
          case 'berserk': go = !!r.cs; break;
          case 'tengri': go = ha.some(h => nearestEnemy(h, null, 130)); break;
          case 'kamikaze': go = foes.filter(e => hyp(e.x - r.x, e.y - r.y) < 200).length >= 2; break;
          case 'fifthsun': go = mine.filter(o => o.cs).length >= 2; break;
          case 'shaka': go = !!nearestEnemy(r, null, 190); break;
        }
        if (go) b.activate(r, false);
      }
      // ----- curses -----
      const f = b.fac[side];
      const cth = style === 'schemer' ? 55 : style === 'swarm' ? 95 : 75;
      if (f.faith >= cth && f.curseCd <= 0) {
        let best = null, bsc = 0;
        for (const e of foes) { if (!e.cs || !e.cs.some(o => o.side === side)) continue; const sc = e.n * (e.def.brace >= 2 ? 1.5 : 1) * (e.morale > 80 ? 0.5 : 1); if (sc > bsc) { bsc = sc; best = e; } }
        if (best) b.curse(side, best, false);
      }
    }
    // ---------- sieges ----------
    function siegeThink(mine) {
      const S = b.S, CX = HB.CASTLE.x, CY = HB.CASTLE.y;
      const defending = side === S.def || b.friendly(side, S.def);
      const foes = b.regs.filter(r => r.st === 0 && b.hostile(side, r.side) && r.def.cls !== 'mon');
      // the outermost ring that still stands between attackers and the keep
      const ringUp = (ri) => S.segs.some(s => s.ring === ri && s.hp > 0) && !S.segs.some(s => s.ring === ri && (s.hp <= 0));
      let front = -1; for (let ri = 3 - S.nR; ri < 3; ri++) { const open = S.segs.some(s => s.ring === ri && (s.hp <= 0 || s.tower >= 0 || s.lad > 0)); if (!open) { front = ri; break; } }
      const gateOf = (ri) => S.segs.find(s => s.ring === ri && s.gate);
      const segsOf = (ri) => S.segs.filter(s => s.ring === ri && !s.gate && s.hp > 0);
      const atkIn = (ri) => foes.some(e => HB.ringOf(e.x, e.y) > ri);
      if (defending) {
        // the defended ring: the outermost ring no attacker has got inside yet
        let ri = 3 - S.nR; while (ri < 2 && atkIn(ri)) ri++;
        const g = gateOf(ri), walls = S.segs.filter(s => s.ring === ri && s.hp > 0 && s.my > CY - 40);
        const breaches = S.segs.filter(s => s.ring === ri && s.hp <= 0);
        const hot = breaches.concat(g && g.hp <= 0 ? [] : [g]).concat(S.segs.filter(s => s.ring === ri && (s.tower >= 0 || s.lad > 0)));
        let mi = 0, ii = 0;
        for (const r of mine) {
          if (r.relief) { const e = nearestEnemy(r, x => x.def.cls !== 'sie' || x.def.ram || x.def.tower, 900) || nearestEnemy(r, null, 900); if (e) order(r, { k: 'at', t: e.id }); continue; }
          if (r.cs) continue;
          if (r.def.rng) { // man the walls facing the attackers
            const w = walls.length ? walls[mi++ % walls.length] : null;
            if (w) order(r, { k: 'mv', x: w.mx - w.nx * 22, y: w.my - w.ny * 22, f: atan2(w.ny, w.nx) });
            continue;
          }
          if (r.def.cls === 'cav') { // sally against unprotected siege engines, then come back
            const eng = foes.find(e => e.def.cls === 'sie' && !foes.some(p => p !== e && p.def.cls !== 'sie' && hyp(p.x - e.x, p.y - e.y) < 90) && hyp(e.x - CX, e.y - CY) < 420);
            if (eng && b.t > 20) { order(r, { k: 'at', t: eng.id }); continue; }
            order(r, { k: 'mv', x: CX + (ii++ % 2 ? 40 : -40), y: CY - 20, f: HPI }); continue;
          }
          // infantry: plug the gate and the breaches, or charge whoever came over the wall
          const inside = foes.find(e => HB.ringOf(e.x, e.y) > ri && e.def.cls !== 'sie');
          if (inside && hyp(inside.x - r.x, inside.y - r.y) < 260) { order(r, { k: 'at', t: inside.id }); continue; }
          const h = hot.filter(Boolean); const t = h.length ? h[ii++ % h.length] : g;
          if (t) { form(r, r.def.forms.includes('shieldwall') ? 'shieldwall' : r.def.forms.includes('phalanx') ? 'phalanx' : 'line'); order(r, { k: 'mv', x: t.mx - t.nx * 34, y: t.my - t.ny * 34, f: atan2(t.ny, t.nx) }); }
        }
        return;
      }
      // ---- attackers ----
      const relief = foes.filter(e => e.relief && HB.ringOf(e.x, e.y) === 0);
      let ri = 3 - S.nR; while (ri < 2 && S.segs.some(s => s.ring === ri && (s.hp <= 0)) && mine.some(r => HB.ringOf(r.x, r.y) > ri)) ri++;
      const g = gateOf(ri);
      const openings = S.segs.filter(s => s.ring === ri && (s.hp <= 0 || s.tower === side || s.lad > 0));
      const ws = segsOf(ri).filter(s => s.my > CY); ws.sort((p, q) => q.my - p.my || p.mx - q.mx);
      let ti = 0, ei = 0;
      for (const r of mine) {
        if (r.cs) continue;
        if (r.def.ram) { if (g && g.hp > 0) order(r, { k: 'wl', w: g.id }); else { const ng = gateOf(Math.min(2, ri + (g && g.hp <= 0 ? 0 : 1))); if (ng && ng.hp > 0) order(r, { k: 'wl', w: ng.id }); } continue; }
        if (r.def.tower) { if (r.docked == null) { const w = ws[(ti++ * 2) % Math.max(1, ws.length)]; if (w) order(r, { k: 'wl', w: w.id }); } continue; }
        if (r.def.cls === 'sie') { // engines pound the wall section next to the gate, then switch to defenders
          const tgt = ws.length ? ws[(ei++) % Math.min(2, ws.length)] : null;
          if (tgt) order(r, { k: 'wl', w: tgt.id }); else if (r.order && r.order.k === 'wl') r.order = null;
          continue;
        }
        if (relief.length && (r.def.cls === 'cav' || (r.def.cls === 'inf' && relief.some(e => hyp(e.x - r.x, e.y - r.y) < 200)))) { // turn to face the relief army
          const e = nearestEnemy(r, x => x.relief, 900); if (e) { order(r, { k: 'at', t: e.id }); continue; }
        }
        if (r.def.rng) { // archers suppress the walls
          const tgt = nearestEnemy(r, x => x.def.cls !== 'sie', 600);
          if (tgt) { const d = hyp(tgt.x - r.x, tgt.y - r.y); if (d > r.def.rng * 0.85) { const ux = (tgt.x - r.x) / d, uy = (tgt.y - r.y) / d; order(r, { k: 'mv', x: tgt.x - ux * r.def.rng * 0.8, y: tgt.y - uy * r.def.rng * 0.8, f: atan2(uy, ux) }); } else order(r, { k: 'at', t: tgt.id }); }
          continue;
        }
        if (r.def.cls === 'cav' && !openings.length) { // guard the engines
          order(r, { k: 'mv', x: CX + (r.id % 2 ? 220 : -220), y: 840, f: -HPI }); continue;
        }
        // infantry: through the opening (gate, breach, tower, ladders) once there is one; otherwise wait or escalade
        const e = nearestEnemy(r, x => x.def.cls !== 'sie', 140);
        if (e && HB.ringOf(e.x, e.y) === HB.ringOf(r.x, r.y)) { order(r, { k: 'at', t: e.id }); continue; }
        if (openings.length || b.t > 70) { order(r, { k: 'mv', x: CX, y: CY, f: null }); continue; }
        const lat = ((r.id * 37) % 7 - 3) * 60;
        order(r, { k: 'mv', x: CX + lat, y: CY + RINGS0(ri).b + 120, f: -HPI });
      }
    }
    const RINGS0 = (ri) => HB.SIEGE_RINGS[ri];
    const HPI = Math.PI / 2;
    return { think, mem };
  }
  HB.makeAI = makeAI;
})(typeof window !== 'undefined' ? window : globalThis);
