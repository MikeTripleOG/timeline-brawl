/* Timeline Brawl v3 — top-down "war table" battle renderer (Canvas2D).
   Regiments are cached sprites of hundreds of tiny soldiers (rebuilt only when strength/formation/cohesion change),
   drawn rotated with one drawImage each, so thousands of men stay smooth on phones. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const { W, H } = HB.WORLD;
  const TAU = Math.PI * 2;
  const FONT = '"Cinzel", "Trajan Pro", Georgia, "Times New Roman", serif';
  HB.FONT = FONT;
  function rngOf(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function shade(hex, k) { // k<1 darker, >1 lighter
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (k < 1) { r *= k; g *= k; b *= k; } else { r += (255 - r) * (k - 1); g += (255 - g) * (k - 1); b += (255 - b) * (k - 1); }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  HB.shade = shade;
  const VIS = 3; // visual soldiers per simulated man (as area)
  const PX = 2.6; // sprite pixels per world unit

  // ---------- painted terrain (cached) ----------
  function paintTerrain(b) {
    const S = 1.5, c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
    const g = c.getContext('2d'); g.scale(S, S);
    const T = b.T, rnd = rngOf(b.seed * 7 + 3), siege = !!b.S;
    // base: sun-dried grass with painterly blotches
    g.fillStyle = siege ? '#a39363' : '#9a9a58'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      const x = rnd() * W, y = rnd() * H, r = 6 + rnd() * 26;
      g.fillStyle = ['rgba(120,128,60,0.16)', 'rgba(170,160,90,0.14)', 'rgba(90,100,45,0.12)', 'rgba(185,170,110,0.12)'][i & 3];
      g.beginPath(); g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, TAU); g.fill();
    }
    for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,70,30,0.25)' : 'rgba(210,200,140,0.2)'; g.fillRect(rnd() * W, rnd() * H, 1, 1 + rnd() * 2); }
    // hills: light crest, shaded slopes, contour strokes
    const GW = W / 10;
    for (let gy = 0; gy < H / 10; gy++) for (let gx = 0; gx < GW; gx++) {
      const e = T.elev[gy * GW + gx]; if (e <= 0.02) continue;
      g.fillStyle = 'rgba(205,190,120,' + Math.min(0.45, e * 0.6) + ')'; g.fillRect(gx * 10, gy * 10, 10, 10);
    }
    for (const h of (T.hills || [])) {
      for (let k = 1; k <= 3; k++) { g.strokeStyle = 'rgba(95,80,40,' + (0.18 + k * 0.05) + ')'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(h.x, h.y, (h.r || h.rx || 60) * (1.1 - k * 0.25), (h.ry || h.r || 50) * (1.1 - k * 0.25), 0, 0, TAU); g.stroke(); }
      g.fillStyle = 'rgba(70,60,30,0.12)'; g.beginPath(); g.ellipse(h.x + 10, h.y + 14, (h.r || 60), (h.ry || h.r || 50) * 0.8, 0, 0, TAU); g.fill();
    }
    // river and fords
    for (let gy = 0; gy < H / 10; gy++) for (let gx = 0; gx < GW; gx++) {
      const w = T.water[gy * GW + gx]; if (!w) continue;
      g.fillStyle = w === 2 ? '#3d6f8f' : '#a9a983'; g.fillRect(gx * 10 - 1, gy * 10 - 1, 12, 12);
    }
    for (let gy = 0; gy < H / 10; gy++) for (let gx = 0; gx < GW; gx++) {
      const w = T.water[gy * GW + gx]; if (!w) continue;
      if (w === 2) { g.fillStyle = 'rgba(160,200,220,0.35)'; g.fillRect(gx * 10 + rnd() * 6, gy * 10 + rnd() * 8, 4, 1); }
      else { g.fillStyle = 'rgba(120,150,160,0.55)'; g.fillRect(gx * 10, gy * 10, 10, 10); g.fillStyle = 'rgba(230,220,180,0.5)'; g.fillRect(gx * 10 + rnd() * 8, gy * 10 + rnd() * 8, 2, 2); }
    }
    // woods: clusters of round canopies with shadows and highlights
    const trees = [];
    for (let gy = 0; gy < H / 10; gy++) for (let gx = 0; gx < GW; gx++) if (T.forest[gy * GW + gx] === 1) for (let k = 0; k < 2; k++) trees.push([gx * 10 + rnd() * 10, gy * 10 + rnd() * 10, 4 + rnd() * 4]);
    trees.sort((a, b2) => a[1] - b2[1]);
    g.fillStyle = 'rgba(30,40,15,0.35)'; for (const [x, y, r] of trees) { g.beginPath(); g.arc(x + 2.5, y + 3, r, 0, TAU); g.fill(); }
    for (const [x, y, r] of trees) {
      g.fillStyle = ['#2f4a1f', '#3a5a24', '#46682b', '#2a4219'][(x * 7 + y) & 3]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(140,170,80,0.35)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, TAU); g.fill();
    }
    // villages: little red roofs and a square
    for (const v of (T.villages || [])) {
      g.fillStyle = 'rgba(150,120,80,0.45)'; g.beginPath(); g.arc(v.x, v.y, v.r * 0.85, 0, TAU); g.fill();
      for (let i = 0; i < 16; i++) {
        const a = rnd() * TAU, d = 8 + rnd() * v.r * 0.75, x = v.x + Math.cos(a) * d, y = v.y + Math.sin(a) * d, rot = rnd() * 3;
        g.save(); g.translate(x, y); g.rotate(rot);
        g.fillStyle = 'rgba(40,30,20,0.4)'; g.fillRect(-5 + 2, -3.5 + 2, 10, 7);
        g.fillStyle = rnd() < 0.7 ? '#9e4b32' : '#7b5a3e'; g.fillRect(-5, -3.5, 10, 7);
        g.fillStyle = 'rgba(255,220,180,0.3)'; g.fillRect(-5, -3.5, 10, 1.5); g.strokeStyle = 'rgba(40,20,10,0.6)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-5, 0); g.lineTo(5, 0); g.stroke();
        g.restore();
      }
      g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(v.x, v.y, 5, 0, TAU); g.fill();
    }
    if (siege) { // trampled ground inside the walls, siege camp outside
      const R = HB.SIEGE_RINGS, C = HB.CASTLE;
      for (let i = 3 - b.S.nR; i < 3; i++) { const r = R[i]; g.fillStyle = i === 0 ? 'rgba(170,145,100,0.35)' : 'rgba(165,150,120,0.45)'; octPath(g, C.x, C.y, r.a, r.b, r.c); g.fill(); }
      for (let i = 0; i < 22; i++) { const x = 40 + rnd() * (W - 80), y = 770 + rnd() * 200; if (Math.abs(x - 400) < 60) continue; tent(g, x, y, '#9a2a22'); }
      // keep building
      g.fillStyle = '#6d6458'; g.fillRect(C.x - 28, C.y - 24, 56, 48); g.fillStyle = '#857b6c'; g.fillRect(C.x - 24, C.y - 20, 48, 40);
      g.strokeStyle = '#4a4238'; g.lineWidth = 1; g.strokeRect(C.x - 24, C.y - 20, 48, 40); g.beginPath(); g.moveTo(C.x - 24, C.y - 20); g.lineTo(C.x + 24, C.y + 20); g.moveTo(C.x + 24, C.y - 20); g.lineTo(C.x - 24, C.y + 20); g.stroke();
    }
    // vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,25,5,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  }
  function octPath(g, cx, cy, a, b, c) {
    const ca = a * c, cb = b * c; g.beginPath();
    g.moveTo(cx - a + ca, cy + b); g.lineTo(cx + a - ca, cy + b); g.lineTo(cx + a, cy + b - cb); g.lineTo(cx + a, cy - b + cb); g.lineTo(cx + a - ca, cy - b);
    g.lineTo(cx - a + ca, cy - b); g.lineTo(cx - a, cy - b + cb); g.lineTo(cx - a, cy + b - cb); g.closePath();
  }
  function tent(g, x, y, col) {
    g.fillStyle = 'rgba(30,20,10,0.35)'; g.beginPath(); g.moveTo(x - 7 + 3, y + 6 + 3); g.lineTo(x + 7 + 3, y + 6 + 3); g.lineTo(x + 3, y - 7 + 3); g.fill();
    g.fillStyle = col; g.beginPath(); g.moveTo(x - 7, y + 6); g.lineTo(x + 7, y + 6); g.lineTo(x, y - 7); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,200,170,0.25)'; g.beginPath(); g.moveTo(x - 7, y + 6); g.lineTo(x, y - 7); g.lineTo(x, y + 6); g.fill();
  }
  HB.paintTent = tent;

  // ---------- soldier stamps ----------
  const stampCache = {};
  function stamp(kind, col) {
    const key = kind + col; if (stampCache[key]) return stampCache[key];
    const s = document.createElement('canvas'); const g = s.getContext('2d');
    const dark = shade(col, 0.45), light = shade(col, 1.45);
    if (kind === 'cav') { s.width = 12; s.height = 8; // facing +x
      g.fillStyle = '#4a3020'; g.beginPath(); g.ellipse(5.5, 4, 5, 2.2, 0, 0, TAU); g.fill(); g.fillStyle = '#6b4a30'; g.beginPath(); g.ellipse(9.5, 4, 1.8, 1.3, 0, 0, TAU); g.fill();
      g.fillStyle = dark; g.beginPath(); g.arc(5, 4, 2.2, 0, TAU); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(5, 4, 1.7, 0, TAU); g.fill(); g.fillStyle = '#e8d8b0'; g.fillRect(5, 3.6, 1, 0.9);
    } else if (kind === 'ele') { s.width = 22; s.height = 16;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(11, 9, 9.5, 6.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#7d7a76'; g.beginPath(); g.ellipse(10, 8, 9, 6, 0, 0, TAU); g.fill(); g.fillStyle = '#8f8b86'; g.beginPath(); g.ellipse(18, 8, 3.2, 3, 0, 0, TAU); g.fill();
      g.strokeStyle = '#efe6cf'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(19, 6); g.lineTo(22, 4.5); g.moveTo(19, 10); g.lineTo(22, 11.5); g.stroke();
      g.fillStyle = col; g.fillRect(6, 5, 7, 6); g.strokeStyle = dark; g.lineWidth = 1; g.strokeRect(6, 5, 7, 6);
    } else if (kind === 'sie' || kind === 'ram' || kind === 'tower' || kind === 'treb') { s.width = kind === 'tower' ? 18 : 16; s.height = kind === 'tower' ? 18 : 12;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(2, 2, s.width - 2, s.height - 2);
      if (kind === 'ram') { g.fillStyle = '#5c3e22'; g.fillRect(0, 2, 16, 8); g.fillStyle = '#7a5530'; for (let i = 0; i < 4; i++) g.fillRect(1 + i * 4, 2, 3, 8); g.fillStyle = '#3a3a3a'; g.fillRect(14, 4.5, 2.5, 3); }
      else if (kind === 'tower') { g.fillStyle = '#6b4a2a'; g.fillRect(0, 0, 16, 16); g.strokeStyle = '#3d2914'; g.lineWidth = 1; for (let i = 0; i <= 16; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 16); g.stroke(); } g.fillStyle = col; g.fillRect(5, 5, 6, 6); }
      else { g.strokeStyle = '#5a3c1e'; g.lineWidth = 2; g.beginPath(); g.moveTo(1, 1); g.lineTo(11, 11); g.moveTo(1, 11); g.lineTo(11, 1); g.stroke(); g.strokeStyle = '#8a6236'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(2, 6); g.lineTo(kind === 'treb' ? 16 : 13, 6); g.stroke(); g.fillStyle = col; g.fillRect(4, 4, 3, 3); }
    } else { s.width = 6; s.height = 6; // infantry / missile, facing +x
      g.fillStyle = dark; g.beginPath(); g.arc(3, 3, 2.3, 0, TAU); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(3, 3, 1.8, 0, TAU); g.fill();
      if (kind === 'shield') { g.fillStyle = light; g.fillRect(4.1, 1.2, 1.3, 3.6); }
      else if (kind === 'spear') { g.strokeStyle = '#d9d2bd'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(3, 3); g.lineTo(6, 3); g.stroke(); }
      else if (kind === 'msl') { g.fillStyle = light; g.fillRect(2.4, 2.4, 1.2, 1.2); }
      else if (kind === 'tile') { g.fillStyle = light; g.fillRect(0.6, 0.6, 4.8, 4.8); g.strokeStyle = dark; g.lineWidth = 0.8; g.strokeRect(0.6, 0.6, 4.8, 4.8); }
    }
    stampCache[key] = s; return s;
  }
  function kindOf(r) {
    const d = r.def;
    if (d.cls === 'cav') return 'cav'; if (d.cls === 'ele') return 'ele';
    if (d.ram) return 'ram'; if (d.tower) return 'tower'; if (d.cls === 'sie') return r.type === 'trebuchet' ? 'treb' : 'sie';
    if (r.form === 'testudo') return 'tile';
    if (d.cls === 'msl') return 'msl';
    if (/pike|spear|hoplite|yari|impi/.test(r.type)) return 'spear';
    return 'shield';
  }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.g = canvas.getContext('2d', { alpha: false });
      this.cam = { x: W / 2, y: H / 2, z: 0.5 }; this.camT = null; this.userCam = 0;
      this.parts = []; this.texts = []; this.flashes = []; this.shake = 0; this.banner = null;
      this.spr = new Map(); this.colors = []; this.me = 0; this.sel = null; this.ring = null; this.hoverPath = null; this.dpr = 1;
    }
    setBattle(b, colors, me) {
      this.b = b; this.colors = colors; this.me = me; this.terrain = paintTerrain(b); this.spr.clear(); this.parts = []; this.texts = []; this.flashes = [];
      this.resize(); this.fit(true);
    }
    resize() {
      const dpr = Math.min(2, G.devicePixelRatio || 1); this.dpr = dpr;
      const w = this.cv.clientWidth || G.innerWidth, h = this.cv.clientHeight || G.innerHeight;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.vw = w; this.vh = h;
    }
    fitZ() { return Math.min(this.vw / (W * 0.98), this.vh / (H * 0.92)); }
    fit(now) { const z = this.fitZ(); this.cam.z = now ? z : this.cam.z; this.camT = { x: W / 2, y: H / 2, z }; if (now) { this.cam.x = W / 2; this.cam.y = H / 2; } }
    toWorld(sx, sy) { const c = this.cam; return { x: (sx - this.vw / 2) / c.z + c.x, y: (sy - this.vh / 2) / c.z + c.y }; }
    toScreen(x, y) { const c = this.cam; return { x: (x - c.x) * c.z + this.vw / 2, y: (y - c.y) * c.z + this.vh / 2 }; }
    clampCam() { const c = this.cam, hw = this.vw / 2 / c.z, hh = this.vh / 2 / c.z; c.x = Math.max(Math.min(hw, W / 2), Math.min(W - Math.min(hw, W / 2), c.x)); c.y = Math.max(Math.min(hh, H / 2) - 60, Math.min(H - Math.min(hh, H / 2) + 60, c.y)); }
    // auto-camera: drift toward the biggest fight when the player is not steering the view
    autoCam(dt, spectate) {
      const b = this.b; if (!b) return;
      this.userCam = Math.max(0, this.userCam - dt);
      if (this.userCam > 0) return;
      const fz = this.fitZ(); let tx = W / 2, ty = H / 2, tz = fz;
      if (spectate || b.regs.length > 30) {
        let sx = 0, sy = 0, n = 0;
        for (const r of b.regs) if (r.st === 0 && r.engaged) { sx += r.x; sy += r.y; n++; }
        if (n >= 2) { tx = sx / n; ty = sy / n; tz = fz * (spectate ? 1.35 : 1.15); }
      }
      if (this.focus && this.focus.T > 0) { this.focus.T -= dt; tx = this.focus.x; ty = this.focus.y; tz = fz * 1.8; }
      const k = Math.min(1, dt * 1.2), c = this.cam;
      c.x += (tx - c.x) * k; c.y += (ty - c.y) * k; c.z += (tz - c.z) * k * 0.8; this.clampCam();
    }
    sprite(r, col) {
      const kind = kindOf(r), nb = Math.max(1, Math.round(r.n / Math.max(1, r.n0) * 20));
      const key = r.form + '|' + nb + '|' + Math.round(r.coh * 5) + '|' + kind + '|' + col + '|' + Math.round(r.W) + '|' + Math.round(r.D);
      let s = this.spr.get(r.id); if (s && s.key === key) return s;
      const big = kind === 'ele' || kind === 'ram' || kind === 'tower' || kind === 'sie' || kind === 'treb';
      const st = stamp(kind, col);
      const D0 = Math.max(6, r.D), Ww = Math.max(6, r.W);
      // massed look (owner reference): thin battle lines are drawn as deep blocks, growing toward the rear
      const deep = !big && kind !== 'mon' && ['line', 'shieldwall', 'phalanx', 'horns', 'loose', 'skirmish'].includes(r.form) ? Math.max(D0, Math.min(Ww * 0.32, 20)) : D0;
      const Dw = deep, dens = Math.min(3, Dw / D0);
      const cw = Math.ceil((Dw + 8) * PX), ch = Math.ceil((Ww + 8) * PX);
      const c = (s && s.c) || document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d'); g.clearRect(0, 0, cw, ch);
      const rnd = rngOf(r.id * 977 + 13), jit = (1 - r.coh) * 1.4;
      // visual soldiers: men * VIS laid out on a denser grid of the same footprint
      const men = Math.max(1, Math.round(r.n)), k = big ? 1 : Math.sqrt(VIS);
      let files = Math.max(1, Math.round(r.files * k)), ranks = Math.max(1, Math.ceil(men * (big ? 1 : VIS * dens) / files));
      if (big) { files = Math.max(1, Math.min(r.files, men)); ranks = Math.max(1, Math.ceil(men / files)); if (kind === 'ele') { files = Math.ceil(Math.sqrt(men)); ranks = Math.ceil(men / files); } }
      const total = big ? (kind === 'ram' || kind === 'tower' ? 1 : (kind === 'ele' ? men : Math.max(1, Math.round(men / 3)))) : Math.round(men * VIS * dens);
      const sx = Dw / Math.max(1, ranks), sy = Ww / Math.max(1, files);
      g.save(); g.translate(cw / 2, ch / 2); g.scale(PX, PX);
      const sw = st.width / (big ? (kind === 'ele' ? 2.2 : 1.6) : 2.6), sh = st.height / (big ? (kind === 'ele' ? 2.2 : 1.6) : 2.6);
      let placed = 0;
      for (let i = 0; i < ranks && placed < total; i++) {
        for (let j = 0; j < files && placed < total; j++) {
          let lx = Dw / 2 - (i + 0.5) * sx, ly = -Ww / 2 + (j + 0.5) * sy;
          if (r.form === 'wedge') { const half = Ww / 2 * (1 - (Dw / 2 - lx) / Dw * 0.0); const fr = (i + 1) / ranks; if (Math.abs(ly) > Ww / 2 * fr + 0.1) continue; void half; }
          if (r.form === 'horns') lx -= (ly * ly) / (Ww * Ww / 4) * Dw * -0.8 + Dw * 0.4;
          lx += (rnd() - 0.5) * jit * sx * 2; ly += (rnd() - 0.5) * jit * sy * 2;
          g.drawImage(st, lx - sw / 2, ly - sh / 2, sw, sh); placed++;
        }
      }
      // regimental standard at the rear centre
      if (!big || kind === 'ele') { g.fillStyle = '#2a1a0a'; g.fillRect(-Dw / 2 - 1.5, -0.3, 1.2, 0.6); g.fillStyle = col; g.beginPath(); g.moveTo(-Dw / 2 - 1, -0.4); g.lineTo(-Dw / 2 - 5, -2.6); g.lineTo(-Dw / 2 - 5, 1.6); g.closePath(); g.fill(); g.strokeStyle = '#f2d27a'; g.lineWidth = 0.4; g.stroke(); }
      g.restore();
      s = { key, c, w: cw / PX, h: ch / PX, off: (Dw - D0) / 2 }; this.spr.set(r.id, s); return s;
    }
    colorOf(side) { return this.colors[side] || '#888'; }
    event(e) { // sim fx -> visuals
      const b = this.b; if (!b) return;
      if (e.k === 'volley') {
        const n = Math.min(e.n || 1, e.kind === 'rock' ? 1 : 10);
        for (let i = 0; i < n && this.parts.length < 500; i++) this.parts.push({ k: e.kind === 'rock' || e.kind === 'bolt' ? 'rock' : 'arrow', x0: e.x0 + (Math.random() - 0.5) * 30, y0: e.y0 + (Math.random() - 0.5) * 12, x1: e.x1 + (Math.random() - 0.5) * 30, y1: e.y1 + (Math.random() - 0.5) * 14, t: -Math.random() * 0.25, T: e.kind === 'rock' ? 1.1 : 0.55, wall: e.wall });
      } else if (e.k === 'impact') {
        const big = e.zone === 2 || e.power > 6;
        this.flashes.push({ x: e.x, y: e.y, t: 0, T: big ? 0.5 : 0.3, r: big ? 46 : 22, col: e.zone === 2 ? '#fff1b8' : e.braced ? '#e8f0ff' : '#ffe0a0' });
        const n = e.zone === 2 ? 46 : e.cav ? 16 : 6, col = this.colorOf(e.vs);
        for (let i = 0; i < n && this.parts.length < 700; i++) { const a = (e.ang || 0) + (Math.random() - 0.5) * (e.zone === 2 ? 2.4 : 1.6), v = 30 + Math.random() * (e.zone === 2 ? 110 : 50); this.parts.push({ k: 'dot', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, T: 0.7 + Math.random() * 0.6, col }); }
        if (e.zone === 2) { this.shake = Math.max(this.shake, 1); this.focus = { x: e.x, y: e.y, T: 1.6 }; this.slow = 0.9; }
        else if (e.cav) this.shake = Math.max(this.shake, 0.35);
      } else if (e.k === 'callout') {
        this.texts.push({ x: e.x, y: e.y, text: e.text, col: e.color, t: 0, T: e.big ? 2.2 : 1.4, big: e.big });
        if (this.texts.length > 14) this.texts.shift();
      } else if (e.k === 'breach') {
        this.flashes.push({ x: e.x, y: e.y, t: 0, T: 0.8, r: 60, col: '#ffd890' }); this.shake = Math.max(this.shake, 0.9); this.focus = { x: e.x, y: e.y, T: 1.4 };
        for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, v = 20 + Math.random() * 80; this.parts.push({ k: 'dot', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, T: 1 + Math.random(), col: '#8a8174' }); }
      } else if (e.k === 'oil') { for (let i = 0; i < 18; i++) { const a = Math.random() * TAU, v = 5 + Math.random() * 25; this.parts.push({ k: 'dot', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, T: 1.2, col: '#ff8a2a' }); } }
      else if (e.k === 'ram') this.flashes.push({ x: e.x, y: e.y, t: 0, T: 0.18, r: 14, col: '#ffe0a0' });
      else if (e.k === 'curse') this.flashes.push({ x: e.x, y: e.y, t: 0, T: 1.2, r: 50, col: '#b070ff', ring: 1 });
      else if (e.k === 'ability') this.flashes.push({ x: e.x, y: e.y, t: 0, T: 1, r: 70, col: '#ffd34a', ring: 1 });
      else if (e.k === 'rout') this.texts.push({ x: e.x, y: e.y - 8, text: 'ROUTED', col: '#ff9a7a', t: 0, T: 1.2 });
    }
    draw(dt, ui) {
      const b = this.b, g = this.g, dpr = this.dpr; if (!b) return;
      const c = this.cam; let shx = 0, shy = 0;
      if (this.shake > 0) { shx = (Math.random() - 0.5) * 14 * this.shake; shy = (Math.random() - 0.5) * 14 * this.shake; this.shake = Math.max(0, this.shake - dt * 1.8); }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#2b2416'; g.fillRect(0, 0, this.vw, this.vh);
      g.setTransform(dpr * c.z, 0, 0, dpr * c.z, dpr * (this.vw / 2 - c.x * c.z + shx), dpr * (this.vh / 2 - c.y * c.z + shy));
      g.drawImage(this.terrain, 0, 0, W, H);
      g.strokeStyle = 'rgba(60,40,15,0.8)'; g.lineWidth = 3 / c.z; g.strokeRect(0, 0, W, H);
      const me = this.me, specs = ui && ui.spectate;
      // druid fogs (under units)
      for (const f of b.fogs) { const gr = g.createRadialGradient(f.x, f.y, 10, f.x, f.y, f.r); gr.addColorStop(0, 'rgba(235,240,235,0.55)'); gr.addColorStop(1, 'rgba(235,240,235,0)'); g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill(); }
      if (b.S) this.drawWalls(g, b);
      // orders: thin dotted path for the selected regiment
      if (this.sel != null) { const r = b.regs[this.sel]; if (r && r.order && r.order.k === 'mv' && r.st === 0) { g.setLineDash([4 / c.z * 2, 4 / c.z * 2]); g.strokeStyle = 'rgba(255,225,140,0.85)'; g.lineWidth = 1.6 / c.z; g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.order.x, r.order.y); g.stroke(); g.setLineDash([]); } }
      // regiments: shadows, then sprites
      const vis = [];
      for (const r of b.regs) {
        if (r.st === 2) continue;
        if (r.def.cls === 'mon') { vis.push(r); continue; }
        if (!specs && r.side !== me && !(ui && ui.ctl && ui.ctl.includes(r.side)) && b.visibleTo && !b.visibleTo(r, me)) continue;
        vis.push(r);
      }
      for (const r of vis) {
        if (r.def.cls === 'mon') { this.drawMonster(g, r, b); continue; }
        const col = this.colorOf(r.side);
        if (r.st === 1) { this.drawRouters(g, r, col); continue; }
        const s = this.sprite(r, col);
        g.save(); g.translate(r.x, r.y); g.rotate(r.f);
        if (r.hidden) g.globalAlpha = 0.55;
        g.drawImage(s.c, -s.w / 2 - (s.off || 0), -s.h / 2, s.w, s.h);
        g.restore();
      }
      // missiles and debris
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i]; p.t += dt; if (p.t > p.T) { this.parts.splice(i, 1); continue; } if (p.t < 0) continue;
        if (p.k === 'arrow' || p.k === 'rock') {
          const u = p.t / p.T, x = p.x0 + (p.x1 - p.x0) * u, y = p.y0 + (p.y1 - p.y0) * u - Math.sin(u * Math.PI) * (p.k === 'rock' ? 60 : 22);
          if (p.k === 'rock') { g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(p.x0 + (p.x1 - p.x0) * u, p.y0 + (p.y1 - p.y0) * u, 2.2, 0, TAU); g.fill(); g.fillStyle = '#5a5248'; g.beginPath(); g.arc(x, y, 2.6, 0, TAU); g.fill(); if (u > 0.94) this.flashes.push({ x: p.x1, y: p.y1, t: 0, T: 0.35, r: 16, col: '#d8c7a0' }); }
          else { const dx = (p.x1 - p.x0), dy = (p.y1 - p.y0), L = Math.hypot(dx, dy) || 1; g.strokeStyle = 'rgba(40,28,15,0.85)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x - dx / L * 4, y - dy / L * 4); g.stroke(); }
        } else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; g.globalAlpha = 1 - p.t / p.T; g.fillStyle = p.col; g.fillRect(p.x - 0.8, p.y - 0.8, 1.6, 1.6); g.globalAlpha = 1; }
      }
      for (let i = this.flashes.length - 1; i >= 0; i--) {
        const f = this.flashes[i]; f.t += dt; if (f.t > f.T) { this.flashes.splice(i, 1); continue; }
        const u = f.t / f.T; g.globalAlpha = (1 - u) * 0.85;
        if (f.ring) { g.strokeStyle = f.col; g.lineWidth = 3; g.beginPath(); g.arc(f.x, f.y, f.r * (0.3 + u), 0, TAU); g.stroke(); }
        else { const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.5 + u)); gr.addColorStop(0, f.col); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, f.r * (0.5 + u), 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      }
      // selection ring + formation picker (world-anchored, screen-sized)
      if (this.sel != null) this.drawSelection(g, b.regs[this.sel], ui);
      // screen space: morale bars and callouts
      g.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr);
      for (const r of vis) {
        if (r.st !== 0 || r.def.cls === 'mon') continue;
        const p = this.toScreen(r.x, r.y), half = Math.max(r.W, r.D) / 2 * c.z;
        const bw = Math.max(16, Math.min(34, r.W * c.z * 0.6)), y = p.y - half - 7;
        if (p.x < -40 || p.x > this.vw + 40 || p.y < -40 || p.y > this.vh + 40) continue;
        const m = Math.max(0, Math.min(1, r.morale / 100));
        g.fillStyle = 'rgba(20,14,6,0.8)'; g.fillRect(p.x - bw / 2 - 1, y - 1, bw + 2, 4);
        g.fillStyle = m > 0.55 ? '#7fbf4a' : m > 0.3 ? '#e0b53a' : '#d0452f'; g.fillRect(p.x - bw / 2, y, bw * m, 2);
        g.fillStyle = this.colorOf(r.side); g.fillRect(p.x - bw / 2 - 3, y - 1, 2, 4);
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const t = this.texts[i]; t.t += dt; if (t.t > t.T) { this.texts.splice(i, 1); continue; }
        const p = this.toScreen(t.x, t.y), u = t.t / t.T, sz = t.big ? 17 : 12;
        g.globalAlpha = u < 0.8 ? 1 : (1 - u) / 0.2; g.font = '700 ' + sz + 'px ' + FONT;
        g.lineWidth = 3.5; g.strokeStyle = 'rgba(25,15,5,0.9)'; g.strokeText(t.text, p.x, p.y - u * 18); g.fillStyle = t.col || '#ffe9b0'; g.fillText(t.text, p.x, p.y - u * 18);
        g.globalAlpha = 1;
      }
      // wrath tint
      if (b.wrath && b.wrath.mon) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = 'rgba(120,20,10,0.12)'; g.fillRect(0, 0, this.vw, this.vh); }
      if (b.weather === 'fog') { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = 'rgba(220,220,210,0.18)'; g.fillRect(0, 0, this.vw, this.vh); }
      if (b.weather === 'rain') { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.strokeStyle = 'rgba(200,210,230,0.25)'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < 60; i++) { const x = Math.random() * this.vw, y = Math.random() * this.vh; g.moveTo(x, y); g.lineTo(x - 3, y + 10); } g.stroke(); }
    }
    drawRouters(g, r, col) {
      const rnd = rngOf(r.id * 31 + 7), n = Math.min(160, Math.round(r.n * 2)), spread = 8 + Math.min(40, (r.routT || 0) * 8);
      g.fillStyle = col;
      for (let i = 0; i < n; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * spread; g.fillRect(r.x + Math.cos(a) * d * 1.3 - 0.8, r.y + Math.sin(a) * d - 0.8, 1.6, 1.6); }
    }
    drawMonster(g, r, b) {
      const kind = b.wrath && b.wrath.kind, t = performance.now() / 1000;
      g.save(); g.translate(r.x, r.y);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(14, 18, 34, 24, 0, 0, TAU); g.fill();
      g.rotate(r.f);
      if (kind === 'dragon') {
        const flap = Math.sin(t * 6) * 0.25;
        g.fillStyle = '#7a1414';
        for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(0, 0); g.lineTo(-10, sgn * (38 + flap * 20)); g.lineTo(-22, sgn * 30); g.lineTo(-18, sgn * 8); g.closePath(); g.fill(); }
        g.fillStyle = '#a3201c'; g.beginPath(); g.ellipse(0, 0, 22, 8, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(22, 0, 7, 5, 0, 0, TAU); g.fill();
        g.strokeStyle = '#a3201c'; g.lineWidth = 4; g.beginPath(); g.moveTo(-20, 0); g.quadraticCurveTo(-34, 10 * Math.sin(t * 3), -44, 0); g.stroke();
        g.fillStyle = '#ffcf4a'; g.fillRect(25, -3, 2, 2); g.fillRect(25, 1, 2, 2);
      } else {
        g.fillStyle = '#5b5550'; g.beginPath(); g.ellipse(0, 0, 14, 24, 0, 0, TAU); g.fill();
        g.fillStyle = '#6d6660'; g.beginPath(); g.arc(4, 0, 10, 0, TAU); g.fill();
        g.fillStyle = '#4c4642'; g.beginPath(); g.arc(2 + Math.sin(t * 3) * 4, -22, 6, 0, TAU); g.arc(2 - Math.sin(t * 3) * 4, 22, 6, 0, TAU); g.fill();
        g.fillStyle = '#ff7a2a'; g.fillRect(10, -3, 3, 2); g.fillRect(10, 1, 3, 2);
      }
      g.restore();
      const hp = r.hp / (r.def.hp || 1); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(r.x - 30, r.y - 44, 60, 5); g.fillStyle = '#d0452f'; g.fillRect(r.x - 30, r.y - 44, 60 * hp, 5);
    }
    drawWalls(g, b) {
      const S = b.S;
      for (const s of S.segs) {
        const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx), th = s.ring === 2 ? 11 : s.ring === 1 ? 10 : 9;
        g.save(); g.translate(s.x1, s.y1); g.rotate(ang);
        if (s.hp <= 0) { // rubble
          const rnd = rngOf(s.id * 13 + 1); g.fillStyle = '#7d756a';
          for (let i = 0; i < 26; i++) g.fillRect(rnd() * L, (rnd() - 0.5) * th * 2.2, 2 + rnd() * 3, 2 + rnd() * 3);
          g.restore(); continue;
        }
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2, -th / 2 + 3, L, th);
        if (s.gate) { g.fillStyle = '#857b6c'; g.fillRect(0, -th / 2, L * 0.3, th); g.fillRect(L * 0.7, -th / 2, L * 0.3, th); g.fillStyle = '#5c3e22'; g.fillRect(L * 0.3, -th / 2 + 1.5, L * 0.4, th - 3); g.strokeStyle = '#3a2412'; g.lineWidth = 0.8; for (let x = L * 0.3; x < L * 0.7; x += 3) { g.beginPath(); g.moveTo(x, -th / 2 + 1.5); g.lineTo(x, th / 2 - 1.5); g.stroke(); } }
        else {
          const dmg = 1 - s.hp / s.hp0; g.fillStyle = dmg > 0.6 ? '#7a7062' : '#8e8576'; g.fillRect(0, -th / 2, L, th);
          g.fillStyle = '#a69d8c'; g.fillRect(0, -th / 2, L, 2.2);
          g.fillStyle = '#6a6256'; for (let x = 2; x < L - 2; x += 5) g.fillRect(x, -th / 2 - 1.2, 2.6, 2.4); // crenellations
          if (dmg > 0.3) { g.strokeStyle = 'rgba(40,30,20,0.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(L * 0.4, -th / 2); g.lineTo(L * 0.5, 0); g.lineTo(L * 0.45, th / 2); g.stroke(); }
        }
        if (s.lad > 0) { g.strokeStyle = '#8a6236'; g.lineWidth = 1.2; for (const x of [L * 0.3, L * 0.6]) { g.beginPath(); g.moveTo(x, th / 2); g.lineTo(x, th / 2 + 10); g.stroke(); } }
        g.restore();
      }
      for (const s of S.segs) { // towers on the corners
        if (s.hp <= 0) continue; const sz = s.ring === 2 ? 9 : 7.5;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(s.x1 - sz + 2.5, s.y1 - sz + 3, sz * 2, sz * 2);
        g.fillStyle = '#7f7668'; g.fillRect(s.x1 - sz, s.y1 - sz, sz * 2, sz * 2); g.fillStyle = '#9c9282'; g.fillRect(s.x1 - sz + 1.5, s.y1 - sz + 1.5, sz * 2 - 3, sz * 2 - 3);
        g.fillStyle = '#5f574c'; g.fillRect(s.x1 - 1.5, s.y1 - 1.5, 3, 3);
      }
      // keep banner
      const C = HB.CASTLE, col = this.colorOf(S.def), t = performance.now() / 600;
      g.fillStyle = '#2a1a0a'; g.fillRect(C.x - 0.8, C.y - 18, 1.6, 18); g.fillStyle = col; g.beginPath(); g.moveTo(C.x, C.y - 18); g.lineTo(C.x + 13, C.y - 15 + Math.sin(t) * 1.5); g.lineTo(C.x, C.y - 11); g.fill();
      if (S.keepT > 0) { g.strokeStyle = '#ffcf4a'; g.lineWidth = 3; g.beginPath(); g.arc(C.x, C.y, 62, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, S.keepT / 15)); g.stroke(); }
    }
    drawSelection(g, r, ui) {
      if (!r || r.st === 2) return;
      const c = this.cam, R = Math.max(r.W, r.D) / 2 + 10;
      g.strokeStyle = '#f5cf5a'; g.lineWidth = 2.2 / c.z; g.beginPath(); g.arc(r.x, r.y, R, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(80,50,10,0.8)'; g.lineWidth = 0.8 / c.z; g.beginPath(); g.arc(r.x, r.y, R + 2.2 / c.z, 0, TAU); g.stroke();
      // facing tick
      g.strokeStyle = '#f5cf5a'; g.lineWidth = 2 / c.z; g.beginPath(); g.moveTo(r.x + Math.cos(r.f) * R, r.y + Math.sin(r.f) * R); g.lineTo(r.x + Math.cos(r.f) * (R + 9 / c.z), r.y + Math.sin(r.f) * (R + 9 / c.z)); g.stroke();
      // formation picker: 2-4 gold medallions around the ring (screen-sized)
      const opts = this.ringOpts(r); this.ring = { id: r.id, items: [] };
      const rs = R * c.z + 22, p0 = this.toScreen(r.x, r.y), n = opts.length, start = -Math.PI / 2 - (n - 1) * 0.42;
      g.save(); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      opts.forEach((o, i) => {
        const a = start + i * 0.84, x = p0.x + Math.cos(a) * rs, y = p0.y + Math.sin(a) * rs, on = o.on;
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.arc(x + 1.5, y + 2, 17, 0, TAU); g.fill();
        const gr = g.createRadialGradient(x - 4, y - 5, 2, x, y, 17); gr.addColorStop(0, on ? '#fff0b0' : '#f3dc95'); gr.addColorStop(1, on ? '#c8961e' : '#9c7424');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, 16, 0, TAU); g.fill();
        g.strokeStyle = on ? '#fff6d0' : '#4a3210'; g.lineWidth = on ? 2.2 : 1.4; g.stroke();
        g.fillStyle = '#2a1a06'; g.font = '700 15px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.icon, x, y + 1);
        g.font = '600 9px ' + FONT; g.lineWidth = 3; g.strokeStyle = 'rgba(20,12,4,0.85)'; g.strokeText(o.label, x, y + 25); g.fillStyle = '#f6e3a8'; g.fillText(o.label, x, y + 25);
        this.ring.items.push({ x, y, r: 19, o });
      });
      g.restore();
    }
    ringOpts(r) {
      const forms = r.def.forms.slice(0, r.lore && HB.LORE[r.lore] ? 3 : 4);
      const out = forms.map(f => ({ k: 'fm', m: f, icon: HB.FORMS[f].icon, label: HB.FORMS[f].name, on: r.form === f }));
      if (r.lore && HB.LORE[r.lore]) out.push({ k: 'ab', icon: '✦', label: HB.LORE[r.lore].name.split(' ')[0], on: false });
      return out;
    }
    hitRing(sx, sy) { if (!this.ring) return null; for (const it of this.ring.items) if (Math.hypot(sx - it.x, sy - it.y) < it.r) return it.o; return null; }
    pick(wx, wy, pred) { // nearest regiment under a world point (generous for fingers)
      let best = null, bd = 1e9; const tol = 16 / this.cam.z;
      for (const r of this.b.regs) {
        if (r.st === 2 || (pred && !pred(r))) continue;
        const dx = wx - r.x, dy = wy - r.y, ca = Math.cos(-r.f), sa = Math.sin(-r.f);
        const lx = dx * ca - dy * sa, ly = dx * sa + dy * ca;
        const ex = Math.max(0, Math.abs(lx) - r.D / 2), ey = Math.max(0, Math.abs(ly) - r.W / 2), d = Math.hypot(ex, ey);
        if (d < tol && d < bd) { bd = d; best = r; }
      }
      return best;
    }
    pickWall(wx, wy) { if (!this.b.S) return null; let best = null, bd = 30; for (const s of this.b.S.segs) { if (s.hp <= 0) continue; const d = Math.hypot(wx - s.mx, wy - s.my); if (d < bd) { bd = d; best = s; } } return best; }
  }
  HB.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
