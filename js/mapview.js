/* Timeline Brawl v3 — "The Five Crowns" parchment campaign map, painted procedurally on canvas:
   aged parchment, tinted kingdoms with inked borders, castles, towns, mountains, forests, banner name plates,
   the crimson Invader's dragon banner, supply wagons and dotted supply line, and envoy riders on the roads. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const MW = 1600, MH = 900, CELL = 8, GX = MW / CELL, GY = MH / CELL, TAU = Math.PI * 2;
  const FONT = HB.FONT || 'Georgia, serif';
  function rngOf(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function noise2(seed) { // cheap value noise
    const r = rngOf(seed), N = 64, v = new Float32Array(N * N); for (let i = 0; i < v.length; i++) v[i] = r();
    return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, a = v[(yi & 63) * N + (xi & 63)], b = v[(yi & 63) * N + ((xi + 1) & 63)], c = v[((yi + 1) & 63) * N + (xi & 63)], d = v[((yi + 1) & 63) * N + ((xi + 1) & 63)];
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
  }
  // ----- crests (shared with the DOM: treaty scroll, HUD) -----
  function drawCrest(g, id, x, y, s, col) {
    g.save(); g.translate(x, y); g.scale(s / 20, s / 20);
    // shield
    g.fillStyle = col; g.strokeStyle = '#e8c76a'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-9, -10); g.lineTo(9, -10); g.lineTo(9, 1); g.quadraticCurveTo(9, 8, 0, 11); g.quadraticCurveTo(-9, 8, -9, 1); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#f3dc95'; g.strokeStyle = '#f3dc95'; g.lineWidth = 1.3;
    if (id === 'tree') { g.fillRect(-0.8, -1, 1.6, 7); g.beginPath(); g.arc(0, -3, 4.5, 0, TAU); g.fill(); g.beginPath(); g.arc(-3.5, -1, 2.8, 0, TAU); g.arc(3.5, -1, 2.8, 0, TAU); g.fill(); }
    else if (id === 'wolf') { g.beginPath(); g.moveTo(-5, 6); g.lineTo(-4, -2); g.lineTo(-5, -7); g.lineTo(-2, -4); g.lineTo(1, -4); g.lineTo(4, -7); g.lineTo(3, -2); g.lineTo(6, 0); g.lineTo(3, 2); g.lineTo(2, 6); g.closePath(); g.fill(); }
    else if (id === 'sun') { g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 4.8, Math.sin(a) * 4.8); g.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5); g.stroke(); } }
    else if (id === 'fleur') { g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(3, -3, 0, 2); g.quadraticCurveTo(-3, -3, 0, -8); g.fill(); g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(-8, -4, -6, 3); g.quadraticCurveTo(-4, 1, -1, 2); g.fill(); g.beginPath(); g.moveTo(1, 0); g.quadraticCurveTo(8, -4, 6, 3); g.quadraticCurveTo(4, 1, 1, 2); g.fill(); g.fillRect(-4, 2, 8, 1.6); g.beginPath(); g.moveTo(-1, 3.6); g.lineTo(1, 3.6); g.lineTo(0, 8); g.fill(); }
    else if (id === 'lion') { g.beginPath(); g.arc(-1, -3, 3.5, 0, TAU); g.fill(); g.beginPath(); g.moveTo(-4, 0); g.lineTo(5, 0); g.lineTo(6, 6); g.lineTo(3, 6); g.lineTo(2, 2); g.lineTo(-2, 2); g.lineTo(-3, 6); g.lineTo(-6, 6); g.closePath(); g.fill(); g.beginPath(); g.moveTo(5, 0); g.quadraticCurveTo(9, -3, 7, -7); g.stroke(); }
    else if (id === 'dragon') { g.lineWidth = 2; g.beginPath(); g.moveTo(5, -7); g.quadraticCurveTo(-6, -6, -2, -1); g.quadraticCurveTo(4, 3, -4, 7); g.stroke(); g.beginPath(); g.moveTo(5, -7); g.lineTo(8, -8); g.lineTo(6, -5); g.fill(); }
    g.restore();
  }
  HB.drawCrest = drawCrest;
  HB.crestURL = (k, size) => { const c = document.createElement('canvas'); c.width = c.height = size * 2; const g = c.getContext('2d'); drawCrest(g, k.crest, size, size, size * 1.7, k.color); return c.toDataURL(); };

  function landAt(n, x, y) { // irregular coast: sea down the west edge and in the south-west corner
    const coast = 70 + n(y / 90, 3.3) * 70 + (y > 620 ? (y - 620) * 0.45 : 0);
    return x > coast && x < MW - 6 && y > 6 && y < MH - 6;
  }

  class MapView {
    constructor(canvas) { this.cv = canvas; this.g = canvas.getContext('2d', { alpha: false }); this.cam = { x: MW / 2, y: MH / 2, z: 1 }; this.sel = null; this.t = 0; this.hl = []; this.arrows = []; this.anim = []; }
    resize() {
      const dpr = Math.min(2, G.devicePixelRatio || 1); this.dpr = dpr; const w = this.cv.clientWidth || G.innerWidth, h = this.cv.clientHeight || G.innerHeight;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.vw = w; this.vh = h;
      this.zmin = Math.min(this.vw / MW, this.vh / MH); this.zfit = Math.max(this.vw / MW, this.vh / MH * 0.98);
      if (!this.camSet) { this.cam.z = this.zfit; this.camSet = 1; } this.clamp();
    }
    clamp() { const c = this.cam; c.z = Math.max(this.zmin, Math.min(3, c.z)); const hw = this.vw / 2 / c.z, hh = this.vh / 2 / c.z; c.x = hw * 2 >= MW ? MW / 2 : Math.max(hw, Math.min(MW - hw, c.x)); c.y = hh * 2 >= MH ? MH / 2 : Math.max(hh, Math.min(MH - hh, c.y)); }
    center(p) { this.cam.x = HB.PROVS[p].x; this.cam.y = HB.PROVS[p].y; this.clamp(); }
    toWorld(sx, sy) { const c = this.cam; return { x: (sx - this.vw / 2) / c.z + c.x, y: (sy - this.vh / 2) / c.z + c.y }; }
    toScreen(x, y) { const c = this.cam; return { x: (x - c.x) * c.z + this.vw / 2, y: (y - c.y) * c.z + this.vh / 2 }; }
    setState(st, me) {
      this.st = st; this.me = me;
      if (!this.base) this.paintBase(st.seed);
      const key = st.owner.join(',');
      if (key !== this.ownKey) { this.ownKey = key; this.paintRegions(); }
    }
    // province cell assignment (fixed): nearest province centre with a little noise, land only
    paintBase(seed) {
      const P = HB.PROVS, n = noise2(seed * 3 + 1), n2 = noise2(seed * 5 + 7), rnd = rngOf(seed + 99);
      this.cellProv = new Int16Array(GX * GY).fill(-1);
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
        const x = gx * CELL + 4, y = gy * CELL + 4; if (!landAt(n, x, y)) continue;
        let best = -1, bd = 1e9;
        for (let i = 0; i < P.length; i++) { const w = P[i].camp ? 0.8 : 1; const d = Math.hypot(x - P[i].x, (y - P[i].y) * 1.05) * w + n2(x / 60, y / 60) * 70; if (d < bd) { bd = d; best = i; } }
        this.cellProv[gy * GX + gx] = best;
      }
      const c = document.createElement('canvas'); c.width = MW; c.height = MH; const g = c.getContext('2d');
      // parchment: warm base, blotches, fibres, burnt edges
      g.fillStyle = '#d9c39a'; g.fillRect(0, 0, MW, MH);
      for (let i = 0; i < 900; i++) { const x = rnd() * MW, y = rnd() * MH, r = 10 + rnd() * 70; g.fillStyle = ['rgba(150,110,60,0.06)', 'rgba(240,225,190,0.08)', 'rgba(120,85,45,0.05)'][i % 3]; g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, TAU); g.fill(); }
      for (let i = 0; i < 5000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(90,60,30,0.10)' : 'rgba(255,245,220,0.12)'; g.fillRect(rnd() * MW, rnd() * MH, 1 + rnd() * 3, 1); }
      // sea with hatched ripples
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) if (this.cellProv[gy * GX + gx] < 0) { g.fillStyle = 'rgba(70,110,130,0.55)'; g.fillRect(gx * CELL, gy * CELL, CELL, CELL); }
      g.strokeStyle = 'rgba(230,240,240,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 160; i++) { const x = rnd() * MW, y = rnd() * MH; const ci = this.cellProv[Math.floor(y / CELL) * GX + Math.floor(x / CELL)]; if (ci >= 0) continue; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 5, y - 3, x + 10, y); g.stroke(); }
      this.base = c;
      // glyph layer (mountains, forests, hills) drawn above the region tint
      const gl = document.createElement('canvas'); gl.width = MW; gl.height = MH; const q = gl.getContext('2d');
      const cellAt = (x, y) => this.cellProv[Math.floor(y / CELL) * GX + Math.floor(x / CELL)];
      const items = [];
      for (let i = 0; i < 1500; i++) {
        const x = 20 + rnd() * (MW - 40), y = 20 + rnd() * (MH - 40), p = cellAt(x, y); if (p < 0) continue;
        if (P.some(pp => Math.hypot(pp.x - x, pp.y - y) < 55)) continue;
        const k = P[p].k, mtn = (k === 1 && rnd() < 0.75) || (p === 12 && rnd() < 0.8) || (k === 4 && rnd() < 0.35) || (p === 11 && rnd() < 0.5) || (k === 3 && rnd() < 0.3);
        const tree = !mtn && ((k === 0 && rnd() < 0.85) || (k === 3 && rnd() < 0.35) || rnd() < 0.18);
        if (mtn) items.push(['m', x, y, 9 + rnd() * 10]); else if (tree) items.push(['t', x, y, 3 + rnd() * 2.5]);
      }
      items.sort((a, b) => a[2] - b[2]);
      for (const [k, x, y, s] of items) {
        if (k === 'm') {
          const snowy = cellAt(x, y) >= 0 && P[cellAt(x, y)].k === 1;
          q.fillStyle = 'rgba(80,60,35,0.25)'; q.beginPath(); q.moveTo(x - s, y); q.lineTo(x + s * 0.2, y - s * 1.2); q.lineTo(x + s * 1.2, y); q.fill();
          q.fillStyle = snowy ? '#cfd6d8' : '#b49a72'; q.beginPath(); q.moveTo(x - s, y); q.lineTo(x, y - s * 1.3); q.lineTo(x + s, y); q.closePath(); q.fill();
          q.fillStyle = snowy ? '#8b98a3' : '#8a6f4a'; q.beginPath(); q.moveTo(x, y - s * 1.3); q.lineTo(x + s, y); q.lineTo(x + s * 0.15, y); q.closePath(); q.fill();
          if (snowy || s > 15) { q.fillStyle = '#f6f4ee'; q.beginPath(); q.moveTo(x, y - s * 1.3); q.lineTo(x - s * 0.3, y - s * 0.9); q.lineTo(x + s * 0.3, y - s * 0.92); q.closePath(); q.fill(); }
          q.strokeStyle = 'rgba(60,40,20,0.75)'; q.lineWidth = 0.9; q.beginPath(); q.moveTo(x - s, y); q.lineTo(x, y - s * 1.3); q.lineTo(x + s, y); q.stroke();
        } else {
          q.fillStyle = 'rgba(40,40,20,0.25)'; q.beginPath(); q.ellipse(x + 1.5, y + 2, s, s * 0.6, 0, 0, TAU); q.fill();
          q.fillStyle = '#4f6a2c'; q.beginPath(); q.moveTo(x, y - s * 2.2); q.lineTo(x + s, y); q.lineTo(x - s, y); q.closePath(); q.fill();
          q.strokeStyle = 'rgba(30,40,15,0.7)'; q.lineWidth = 0.7; q.stroke(); q.fillStyle = '#5b3d20'; q.fillRect(x - 0.5, y, 1, 2);
        }
      }
      // roads: dashed brown
      q.strokeStyle = 'rgba(110,75,35,0.75)'; q.lineWidth = 2; q.setLineDash([6, 4]);
      for (const [a, b] of HB.ROADS) { const A = P[a], B = P[b], mx = (A.x + B.x) / 2 + (A.y - B.y) * 0.08, my = (A.y + B.y) / 2 + (B.x - A.x) * 0.08; q.beginPath(); q.moveTo(A.x, A.y); q.quadraticCurveTo(mx, my, B.x, B.y); q.stroke(); }
      q.setLineDash([]);
      // settlements
      P.forEach((p, i) => { if (p.camp) this.camp(q, p.x, p.y); else if (p.cap) this.castle(q, p.x, p.y, 1); else this.town(q, p.x, p.y); });
      this.glyphs = gl;
      // frame
      const fr = document.createElement('canvas'); fr.width = MW; fr.height = MH; const f = fr.getContext('2d');
      const vg = f.createRadialGradient(MW / 2, MH / 2, MH * 0.45, MW / 2, MH / 2, MW * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,40,10,0.55)'); f.fillStyle = vg; f.fillRect(0, 0, MW, MH);
      f.strokeStyle = 'rgba(70,45,20,0.85)'; f.lineWidth = 6; f.strokeRect(3, 3, MW - 6, MH - 6); f.lineWidth = 1.5; f.strokeRect(12, 12, MW - 24, MH - 24);
      // compass rose
      f.save(); f.translate(110, 800); f.strokeStyle = 'rgba(70,45,20,0.8)'; f.fillStyle = 'rgba(120,80,35,0.7)'; f.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { f.rotate(Math.PI / 2); f.beginPath(); f.moveTo(0, 0); f.lineTo(6, -6); f.lineTo(0, -34); f.lineTo(-6, -6); f.closePath(); f.fill(); f.stroke(); }
      f.font = '700 14px ' + FONT; f.fillStyle = 'rgba(60,35,15,0.9)'; f.textAlign = 'center'; f.fillText('N', 0, -40); f.restore();
      this.frame = fr;
    }
    castle(q, x, y, s) {
      q.save(); q.translate(x, y); q.scale(s, s);
      q.fillStyle = 'rgba(50,30,10,0.3)'; q.beginPath(); q.ellipse(4, 14, 34, 10, 0, 0, TAU); q.fill();
      q.fillStyle = '#9b9384'; q.strokeStyle = '#3e3326'; q.lineWidth = 1;
      q.fillRect(-26, -4, 52, 18); q.strokeRect(-26, -4, 52, 18);
      for (const tx of [-28, -10, 8, 24]) { q.fillStyle = '#a8a091'; q.fillRect(tx, -16, 8, 30); q.strokeRect(tx, -16, 8, 30); q.fillStyle = '#6a3a2a'; q.beginPath(); q.moveTo(tx - 1.5, -16); q.lineTo(tx + 4, -26); q.lineTo(tx + 9.5, -16); q.closePath(); q.fill(); q.stroke(); }
      q.fillStyle = '#b5ad9d'; q.fillRect(-7, -24, 14, 22); q.strokeRect(-7, -24, 14, 22); q.fillStyle = '#6a3a2a'; q.beginPath(); q.moveTo(-9, -24); q.lineTo(0, -38); q.lineTo(9, -24); q.closePath(); q.fill(); q.stroke();
      q.fillStyle = '#3e3326'; q.fillRect(-3, 6, 6, 8); for (let i = -22; i < 24; i += 6) q.fillRect(i, -6, 3, 2);
      q.restore();
    }
    town(q, x, y) {
      q.save(); q.translate(x, y);
      q.fillStyle = 'rgba(50,30,10,0.25)'; q.beginPath(); q.ellipse(3, 8, 20, 6, 0, 0, TAU); q.fill();
      const hs = [[-14, 0], [-4, -6], [6, 1], [14, -4], [0, 6]];
      for (const [hx, hy] of hs) { q.fillStyle = '#c7b897'; q.fillRect(hx - 4, hy - 2, 8, 7); q.strokeStyle = '#3e3326'; q.lineWidth = 0.8; q.strokeRect(hx - 4, hy - 2, 8, 7); q.fillStyle = '#9a4a30'; q.beginPath(); q.moveTo(hx - 5, hy - 2); q.lineTo(hx, hy - 7); q.lineTo(hx + 5, hy - 2); q.closePath(); q.fill(); q.stroke(); }
      q.fillStyle = '#b8b0a0'; q.fillRect(-1.5, -16, 3, 12); q.fillStyle = '#9a4a30'; q.beginPath(); q.moveTo(-3, -16); q.lineTo(0, -22); q.lineTo(3, -16); q.fill();
      q.restore();
    }
    camp(q, x, y) {
      // a red walled camp with tents
      q.save(); q.translate(x, y);
      q.fillStyle = 'rgba(50,20,10,0.3)'; q.beginPath(); q.ellipse(4, 10, 46, 30, 0, 0, TAU); q.fill();
      q.fillStyle = '#7a2a22'; q.strokeStyle = '#2a0a06'; q.lineWidth = 1.2; q.beginPath(); q.ellipse(0, 0, 42, 28, 0, 0, TAU); q.fill(); q.stroke();
      q.fillStyle = '#a63a2e'; q.beginPath(); q.ellipse(0, -2, 36, 22, 0, 0, TAU); q.fill();
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; const tx = Math.cos(a) * 24, ty = Math.sin(a) * 14; HB.paintTent ? HB.paintTent(q, tx, ty, '#c8392c') : 0; }
      q.fillStyle = '#5a1810'; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; q.fillRect(Math.cos(a) * 42 - 2, Math.sin(a) * 28 - 4, 4, 6); }
      q.restore();
    }
    paintRegions() {
      const st = this.st, P = HB.PROVS, K = HB.KINGDOMS;
      const c = this.reg || document.createElement('canvas'); c.width = MW; c.height = MH; const g = c.getContext('2d'); g.clearRect(0, 0, MW, MH);
      const own = (ci) => ci < 0 ? -2 : st.owner[ci];
      // tints: one pixel per cell, upscaled with smoothing so kingdom edges blend like watercolour
      const lo = document.createElement('canvas'); lo.width = GX; lo.height = GY; const lg = lo.getContext('2d');
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
        const p = this.cellProv[gy * GX + gx]; if (p < 0) continue; const o = st.owner[p];
        lg.fillStyle = o >= 0 ? K[o].tint : '#cdb58a'; lg.globalAlpha = o >= 0 ? 0.62 : 0.25; lg.fillRect(gx, gy, 1, 1);
      }
      const tint = document.createElement('canvas'); tint.width = MW; tint.height = MH; const tg = tint.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high'; tg.drawImage(lo, 0, 0, MW, MH);
      g.globalAlpha = 1;
      // soft inked borders: province borders thin, kingdom borders thick
      for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
        const p = this.cellProv[gy * GX + gx]; if (p < 0) continue;
        const r = gx + 1 < GX ? this.cellProv[gy * GX + gx + 1] : -1, d = gy + 1 < GY ? this.cellProv[(gy + 1) * GX + gx] : -1;
        if (r !== p && r >= 0) { const kb = own(r) !== own(p); g.fillStyle = kb ? 'rgba(60,35,15,0.75)' : 'rgba(80,55,30,0.35)'; g.fillRect((gx + 1) * CELL - (kb ? 1.2 : 0.6), gy * CELL, kb ? 2.4 : 1.2, CELL); }
        if (d !== p && d >= 0) { const kb = own(d) !== own(p); g.fillStyle = kb ? 'rgba(60,35,15,0.75)' : 'rgba(80,55,30,0.35)'; g.fillRect(gx * CELL, (gy + 1) * CELL - (kb ? 1.2 : 0.6), CELL, kb ? 2.4 : 1.2); }
        if (r < 0 && gx + 1 < GX || d < 0 && gy + 1 < GY) { g.fillStyle = 'rgba(50,35,20,0.6)'; if (r < 0) g.fillRect((gx + 1) * CELL - 1, gy * CELL, 2, CELL); if (d < 0) g.fillRect(gx * CELL, (gy + 1) * CELL - 1, CELL, 2); }
      }
      // blur slightly for the painted look
      const b = this.regB || document.createElement('canvas'); b.width = MW; b.height = MH; const bg = b.getContext('2d'); bg.clearRect(0, 0, MW, MH);
      bg.drawImage(tint, 0, 0);
      try { bg.filter = 'blur(2.5px)'; } catch (e) { /* older browsers */ }
      bg.drawImage(c, 0, 0); bg.drawImage(c, 0, 0); bg.filter = 'none';
      this.reg = c; this.regB = b;
    }
    draw(dt) {
      const g = this.g, c = this.cam, dpr = this.dpr, st = this.st; if (!st || !this.base) return; this.t += dt;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#2b2012'; g.fillRect(0, 0, this.vw, this.vh);
      g.setTransform(dpr * c.z, 0, 0, dpr * c.z, dpr * (this.vw / 2 - c.x * c.z), dpr * (this.vh / 2 - c.y * c.z));
      g.drawImage(this.base, 0, 0); g.drawImage(this.regB, 0, 0); g.drawImage(this.glyphs, 0, 0);
      const P = HB.PROVS, K = HB.KINGDOMS;
      // highlights (legal destinations)
      for (const h of this.hl) { const p = P[h.p]; g.strokeStyle = h.col || '#f5cf5a'; g.lineWidth = 3; g.setLineDash([7, 5]); g.beginPath(); g.arc(p.x, p.y, 44 + Math.sin(this.t * 4) * 3, 0, TAU); g.stroke(); g.setLineDash([]); }
      // supply line: dotted red from each Invader army back to the camp
      const INV = HB.INV, campD = HB.Campaign.dist(HB.CAMP);
      for (const a of st.armies.filter(a => a.f === INV)) {
        let p = a.p, guard = 0; const pts = [[P[p].x, P[p].y]];
        while (p !== HB.CAMP && guard++ < 12) { const n = HB.ADJ[p].filter(q => campD[q] < campD[p]).sort((x, y) => campD[x] - campD[y])[0]; if (n == null) break; p = n; pts.push([P[p].x, P[p].y]); }
        if (pts.length < 2) continue;
        g.strokeStyle = 'rgba(150,20,20,0.85)'; g.lineWidth = 2.6; g.setLineDash([2, 6]); g.lineCap = 'round'; g.lineDashOffset = -this.t * 10;
        g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + 18); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1] + 18); g.stroke(); g.setLineDash([]); g.lineCap = 'butt';
        // supply wagons along the line
        for (let i = 0; i < pts.length - 1; i++) { const u = (this.t * 0.06 + i * 0.37) % 1, x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y = pts[i][1] + 18 + (pts[i + 1][1] - pts[i][1]) * u; this.wagon(g, x, y, pts[i + 1][0] < pts[i][0] ? -1 : 1); }
      }
      // order arrows
      for (const a of this.arrows) this.arrow(g, P[a.from], P[a.to], a.col || '#f5cf5a');
      // name plates over each kingdom's capital (current owner's crest)
      this.plates = []; for (let k = 0; k < 5; k++) { const capP = P.findIndex(p => p.k === k && p.cap); this.plates.push({ p: capP, x: P[capP].x, y: P[capP].y - 62, w: K[k].name.length * 12 + 70 }); this.plate(g, P[capP].x, P[capP].y - 62, K[k].name, K[k], st.owner[capP] !== k ? st.owner[capP] : -1); }
      // province labels
      g.textAlign = 'center'; g.textBaseline = 'middle';
      P.forEach((p, i) => { if (p.cap && p.k < 5) return; g.font = '600 13px ' + FONT; g.lineWidth = 3; g.strokeStyle = 'rgba(240,225,190,0.85)'; g.strokeText(p.name, p.x, p.y + 30); g.fillStyle = '#3a2410'; g.fillText(p.name, p.x, p.y + 30); });
      // armies
      const byP = {}; for (const a of st.armies) (byP[a.p] = byP[a.p] || []).push(a);
      for (const p in byP) byP[p].forEach((a, j) => this.army(g, a, P[a.p].x + (j - (byP[p].length - 1) / 2) * 40, P[a.p].y - 4, this.sel === a.id));
      // envoys riding the roads
      for (const e of (this.envoys || [])) { const u = Math.min(1, (this.t - e.t0) / 3), A = P[e.a], B = P[e.b]; if (u >= 1) continue; this.rider(g, A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u + 10, K[e.f].color, B.x < A.x ? -1 : 1); }
      // battle markers from the last turn
      for (const bt of (this.marks || [])) { const p = P[bt.p], k = Math.max(0, 1 - (this.t - bt.t0) / 6); if (k <= 0) continue; g.globalAlpha = k; g.font = '700 22px ' + FONT; g.fillStyle = '#7a1010'; g.fillText('⚔', p.x + 30, p.y - 30); g.globalAlpha = 1; }
      g.drawImage(this.frame, 0, 0);
    }
    plate(g, x, y, text, k, capturedBy) {
      g.save(); g.font = '700 17px ' + FONT; const w = g.measureText(text.toUpperCase()).width + 48, h = 28;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - w / 2 + 3, y - h / 2 + 3, w, h);
      g.fillStyle = '#2a2a3a'; g.fillStyle = k.color; g.fillRect(x - w / 2, y - h / 2, w, h);
      const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(x - w / 2, y - h / 2, w, h);
      g.strokeStyle = '#e2bf5a'; g.lineWidth = 2; g.strokeRect(x - w / 2 + 1, y - h / 2 + 1, w - 2, h - 2);
      // swallow-tail ends
      g.fillStyle = k.color; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * w / 2, y - h / 2 + 4); g.lineTo(x + s * (w / 2 + 12), y - h / 2 + 4); g.lineTo(x + s * (w / 2 + 6), y + 2); g.lineTo(x + s * (w / 2 + 12), y + h / 2 - 2); g.lineTo(x + s * w / 2, y + h / 2 - 2); g.fill(); }
      drawCrest(g, k.crest, x - w / 2 + 16, y, 20, shadeHex(k.color));
      g.fillStyle = '#f6e7b8'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text.toUpperCase(), x - w / 2 + 31, y + 1);
      if (capturedBy >= 0) { const K2 = HB.KINGDOMS[capturedBy]; g.font = '600 11px ' + FONT; g.fillStyle = K2.color; g.textAlign = 'center'; g.fillText('held by ' + K2.name, x, y + 22); }
      g.restore();
    }
    army(g, a, x, y, sel) {
      const K = HB.KINGDOMS[a.f], inv = a.f === HB.INV, n = a.picks.length;
      g.save(); g.translate(x, y);
      if (sel) { g.strokeStyle = '#f5cf5a'; g.lineWidth = 3; g.beginPath(); g.arc(0, 4, 24, 0, TAU); g.stroke(); }
      g.fillStyle = 'rgba(30,15,5,0.35)'; g.beginPath(); g.ellipse(2, 12, 20, 6, 0, 0, TAU); g.fill();
      // soldiers block
      const cols = Math.min(6, 2 + Math.ceil(n / 2));
      for (let i = 0; i < cols * 2; i++) { const sx = -cols * 2.6 + (i % cols) * 5.2, sy = 2 + Math.floor(i / cols) * 5; g.fillStyle = K.color; g.fillRect(sx, sy, 3.6, 3.6); g.fillStyle = 'rgba(255,240,200,0.6)'; g.fillRect(sx + 1, sy - 2.5, 0.7, 3); }
      // banner
      const big = inv ? 1.6 : 1, wav = Math.sin(this.t * 3 + a.id) * 1.5;
      g.fillStyle = '#3a2410'; g.fillRect(-1, -26 * big, 2, 30 * big);
      g.fillStyle = K.color; g.beginPath(); g.moveTo(1, -26 * big); g.lineTo(18 * big, -24 * big + wav); g.lineTo(13 * big, -18 * big); g.lineTo(18 * big, -11 * big + wav); g.lineTo(1, -12 * big); g.closePath(); g.fill();
      g.strokeStyle = '#e2bf5a'; g.lineWidth = 1; g.stroke();
      drawCrest(g, K.crest, 9 * big, -18.5 * big, 9 * big, K.color);
      // strength pip
      g.font = '700 10px ' + FONT; g.textAlign = 'center'; g.fillStyle = '#1e1208'; g.fillRect(-9, 15, 18, 11); g.fillStyle = '#f3dc95'; g.fillText(String(n), 0, 21);
      g.restore();
    }
    wagon(g, x, y, dir) {
      g.save(); g.translate(x, y); g.scale(dir, 1);
      g.fillStyle = '#5b3d20'; g.fillRect(-7, -4, 12, 6); g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(-1, -5, 6, 3.5, 0, Math.PI, 0); g.fill(); g.strokeStyle = '#3a2410'; g.lineWidth = 0.6; g.stroke();
      g.fillStyle = '#2a1a0a'; g.beginPath(); g.arc(-5, 3, 1.8, 0, TAU); g.arc(3, 3, 1.8, 0, TAU); g.fill(); g.fillStyle = '#6b4a30'; g.fillRect(6, -3, 6, 3);
      g.restore();
    }
    rider(g, x, y, col, dir) {
      g.save(); g.translate(x, y); g.scale(dir, 1);
      g.fillStyle = '#4a3020'; g.fillRect(-6, -3, 11, 4); g.fillRect(4, -6, 3, 4); g.fillRect(-5, 1, 1.5, 4); g.fillRect(2, 1, 1.5, 4);
      g.fillStyle = col; g.fillRect(-2, -9, 4, 6); g.fillStyle = '#e8d8b0'; g.beginPath(); g.arc(0, -10.5, 1.8, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-3, -14, 1, 6); g.fillStyle = '#f3dc95'; g.fillRect(-7, -14, 4, 3);
      g.restore();
    }
    arrow(g, A, B, col) {
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, x1 = A.x + ux * 22, y1 = A.y + uy * 22, x2 = B.x - ux * 30, y2 = B.y - uy * 30;
      g.strokeStyle = 'rgba(30,15,5,0.6)'; g.lineWidth = 7; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = col; g.lineWidth = 4; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.fillStyle = col; g.beginPath(); g.moveTo(x2 + ux * 12, y2 + uy * 12); g.lineTo(x2 - uy * 9, y2 + ux * 9); g.lineTo(x2 + uy * 9, y2 - ux * 9); g.closePath(); g.fill();
    }
    pick(sx, sy) {
      const w = this.toWorld(sx, sy), st = this.st, P = HB.PROVS;
      const byP = {}; for (const a of st.armies) (byP[a.p] = byP[a.p] || []).push(a);
      let army = null, bd = 30;
      for (const p in byP) byP[p].forEach((a, j) => { const x = P[a.p].x + (j - (byP[p].length - 1) / 2) * 40, y = P[a.p].y - 10; const d = Math.hypot(w.x - x, w.y - y); if (d < bd) { bd = d; army = a; } });
      // what the player sees decides the target: a kingdom's name plate or a settlement (icon + name) beats the painted border cells
      let prov = -1;
      for (const pl of (this.plates || [])) if (Math.abs(w.x - pl.x) < pl.w / 2 + 12 && Math.abs(w.y - pl.y) < 18) prov = pl.p;
      if (prov < 0) { let sd = 40; P.forEach((p, i) => { const d = Math.min(Math.hypot(w.x - p.x, w.y - p.y), Math.hypot((w.x - p.x) * 0.6, w.y - p.y - 30)); if (d < sd) { sd = d; prov = i; } }); }
      const cx = Math.floor(w.x / CELL), cy = Math.floor(w.y / CELL);
      if (prov < 0 && cx >= 0 && cy >= 0 && cx < GX && cy < GY) prov = this.cellProv[cy * GX + cx];
      return { army, prov, w };
    }
  }
  function shadeHex(hex) { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) * 0.75 | 0, g = ((n >> 8) & 255) * 0.75 | 0, b = (n & 255) * 0.75 | 0; return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  HB.MapView = MapView; HB.MAP_W = MW; HB.MAP_H = MH;
})(typeof window !== 'undefined' ? window : globalThis);
