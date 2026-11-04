/* Timeline Brawl — canvas renderer. Reads the sim's typed arrays and consumes its fx queue. */
(function (G) {
  'use strict';
  const HB = G.HB;
  const { W, H, NML0, NML1 } = HB.WORLD;
  const FL = HB.FLAGS;
  const SIDE = ['#4da3ff', '#ff5a4a', '#ffd23a', '#c77dff', '#39ff6a'], SIDE_DARK = ['#1d4f86', '#8a2218', '#8a6d10', '#5a2a86', '#118a2e'];
  const NB = 64, NSIDE = 5;
  const PCOL = ['#fff', '#d8c49a', '#ffe680', '#ffb347', '#ff7a1a', '#ffffff', '#fff'];
  const MAXPART = 3000;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  // per side, per unit type colour: side hue, lightness by role so mixed armies read clearly
  const ROLE_SHADE = { Infantry: 0, Ranged: 0.35, Cavalry: -0.25, Siege: 0.15, Vehicle: -0.1, Air: 0.2, Item: 0.3 };
  const TCOL = [0, 1, 2, 3, 4].map(s => HB.UNITS.map(u => shade(SIDE[s], (ROLE_SHADE[u.role] || 0) + ((u.idx * 7) % 5 - 2) * 0.03)));

  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.dpr = 1; this.scale = 1; this.ox = 0; this.oy = 0;
      this.n = 0;
      this.px = new Float32Array(MAXPART); this.py = new Float32Array(MAXPART); this.pvx = new Float32Array(MAXPART); this.pvy = new Float32Array(MAXPART);
      this.pl = new Float32Array(MAXPART); this.pm = new Float32Array(MAXPART); this.ps = new Float32Array(MAXPART); this.pc = new Array(MAXPART).fill('#fff');
      this.rings = []; this.lines = []; this.callouts = []; this.banner = null; this.flash = null; this.ufos = [];
      this.time = 0; this.shake = 0;
      this.bucketCount = new Int32Array(NB * NSIDE); this.bucketStart = new Int32Array(NB * NSIDE + 1);
      this.cam = { z: 1, x: W / 2, y: H / 2 }; this.auto = true; this.userT = 0; this.stamp = null; this.warns = []; this.bolts = []; this.tickerCb = null; this.nF = 2; this.bucketIdx = new Int32Array(14000);
      this.ground = {}; this.decal = null; this.weather = 'day';
      this.resize();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      this.dpr = Math.min(2, G.devicePixelRatio || 1);
      this.cw = Math.max(1, r.width); this.ch = Math.max(1, r.height);
      this.cv.width = Math.round(this.cw * this.dpr); this.cv.height = Math.round(this.ch * this.dpr);
      this.view();
    }
    // camera: base fit * zoom, centred on cam.x/cam.y (world coords)
    view() {
      const top = 30, bot = 6;
      this.vt = top; this.vb = bot;
      this.base = Math.min(this.cw / W, (this.ch - top - bot) / H);
      const c = this.cam;
      c.z = Math.max(1, Math.min(5, c.z));
      this.scale = this.base * c.z;
      const vw = this.cw / this.scale, vh = (this.ch - top - bot) / this.scale;
      const hx = Math.max(0, (W - vw) / 2), hy = Math.max(0, (H - vh) / 2);
      c.x = Math.max(W / 2 - hx, Math.min(W / 2 + hx, c.x)); c.y = Math.max(H / 2 - hy, Math.min(H / 2 + hy, c.y));
      this.ox = this.cw / 2 - c.x * this.scale; this.oy = top + (this.ch - top - bot) / 2 - c.y * this.scale;
    }
    panBy(dx, dy) { this.cam.x -= dx / this.scale; this.cam.y -= dy / this.scale; this.userT = 6; this.view(); }
    zoomAt(sx, sy, f) {
      const w = this.toWorld(sx, sy); this.cam.z *= f; this.view();
      const w2 = this.toWorld(sx, sy); this.cam.x += w.x - w2.x; this.cam.y += w.y - w2.y; this.userT = 6; this.view();
    }
    recenter() { this.auto = true; this.userT = 0; }
    // auto-camera: smoothly frame the bounding box of everything still alive
    follow(b, dt) {
      if (this.userT > 0) { this.userT -= dt; return; }
      if (!this.auto || !b) { return; }
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0, sx = 0, sy = 0;
      for (const s of b.squads) {
        if (s.alive <= 0 || s.temp || s.def.item) continue;
        const r = Math.min(60, Math.sqrt(s.alive) * 1.6 + 6);
        x0 = Math.min(x0, s.cx - r); x1 = Math.max(x1, s.cx + r); y0 = Math.min(y0, s.cy - r); y1 = Math.max(y1, s.cy + r);
        sx += s.cx * s.alive; sy += s.cy * s.alive; n += s.alive;
      }
      if (!n) return;
      const pad = 30, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
      const vh = this.ch - this.vt - this.vb;
      const tz = Math.max(1, Math.min(2.6, Math.min(this.cw / (bw * this.base), vh / (bh * this.base))));
      const tx = (x0 + x1) / 2 * 0.7 + sx / n * 0.3, ty = (y0 + y1) / 2 * 0.7 + sy / n * 0.3;
      const k = 1 - Math.exp(-dt * 1.6);
      this.cam.z += (tz - this.cam.z) * k; this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
      this.view();
    }
    toWorld(sx, sy) { return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale }; }
    toScreen(x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }
    reset(weather) {
      this.n = 0; this.rings = []; this.lines = []; this.callouts = []; this.banner = null; this.flash = null; this.ufos = [];
      this.stamp = null; this.warns = []; this.bolts = []; this.cam.z = 1; this.cam.x = W / 2; this.cam.y = H / 2; this.auto = true; this.userT = 0; this.view();
      this.weather = weather || 'day';
      this.decal = document.createElement('canvas'); this.decal.width = W * 2; this.decal.height = H * 2;
      this.dctx = this.decal.getContext('2d'); this.dctx.scale(2, 2);
    }
    groundFor(weather) {
      if (this.ground[weather]) return this.ground[weather];
      const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
      const g = c.getContext('2d'); g.scale(2, 2);
      const base = weather === 'night' ? ['#1d2a22', '#1a2420'] : weather === 'storm' ? ['#3c4a3a', '#334033'] : ['#5d7a45', '#4f6b3b'];
      const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, base[0]); grd.addColorStop(1, base[1]);
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      // speckle
      let s = 7;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      for (let k = 0; k < 2600; k++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,230,0.05)';
        const r = 1 + rnd() * 3; g.fillRect(rnd() * W, rnd() * H, r, r);
      }
      // no man's land: churned dirt
      g.fillStyle = weather === 'night' ? 'rgba(60,45,30,0.35)' : 'rgba(120,95,60,0.28)'; g.fillRect(0, NML0, W, NML1 - NML0);
      for (let k = 0; k < 120; k++) { g.fillStyle = 'rgba(40,30,20,0.18)'; g.beginPath(); g.arc(rnd() * W, NML0 + rnd() * (NML1 - NML0), 2 + rnd() * 6, 0, 6.283); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.setLineDash([6, 6]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, NML0); g.lineTo(W, NML0); g.moveTo(0, NML1); g.lineTo(W, NML1); g.stroke();
      this.ground[weather] = c; return c;
    }
    // ---------- effects ingestion ----------
    part(x, y, vx, vy, life, size, color) {
      let i = this.n < MAXPART ? this.n++ : (Math.random() * MAXPART) | 0;
      this.px[i] = x; this.py[i] = y; this.pvx[i] = vx; this.pvy[i] = vy; this.pl[i] = life; this.pm[i] = life; this.ps[i] = size; this.pc[i] = color;
    }
    burst(x, y, n, sp, life, size, color) {
      for (let k = 0; k < n; k++) { const a = Math.random() * 6.283, v = sp * (0.3 + Math.random()); this.part(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size, color); }
    }
    ingest(f, b) {
      switch (f.k) {
        case 'boom': {
          const r = f.r || 6; this.rings.push({ x: f.x, y: f.y, r: 1, R: r * 1.3, t: 0, T: 0.35, c: '#ffdd88' });
          this.burst(f.x, f.y, Math.min(24, 4 + r), r * 3, 0.5, 2.2, '#ffae42'); this.burst(f.x, f.y, Math.min(10, 2 + r / 3), r, 1.2, 3.5, 'rgba(70,60,55,0.7)');
          if (this.dctx) { this.dctx.fillStyle = 'rgba(30,22,15,0.25)'; this.dctx.beginPath(); this.dctx.arc(f.x, f.y, r * 0.6, 0, 6.283); this.dctx.fill(); }
          if (r >= 20) this.shake = Math.min(8, this.shake + r / 6);
          break;
        }
        case 'die': {
          this.burst(f.x, f.y, 2, 12, 0.35, 1.6, f.side ? '#ff9a8a' : '#a6d4ff');
          if (this.dctx) { this.dctx.fillStyle = 'rgba(70,10,10,0.28)'; this.dctx.fillRect(f.x - 1.2, f.y - 1.2, 2.4, 2.4); }
          break;
        }
        case 'shot': if (f.t >= 3) this.burst(f.x, f.y, 3, 20, 0.15, 2.5, '#fff1a8'); else if (Math.random() < 0.5) this.part(f.x, f.y, 0, 0, 0.06, 2, '#fff7c0'); break;
        case 'flame': this.burst(f.x, f.y, 4, 14, 0.5, 2.6, Math.random() < 0.5 ? '#ff7a1a' : '#ffcf3a'); break;
        case 'spark': this.burst(f.x, f.y, 6, 30, 0.35, 1.8, f.color || '#ffd76a'); break;
        case 'ray': this.lines.push({ x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, t: 0, T: 0.35, c: '#fff3a0', w: 3 }); this.burst(f.x2, f.y2, 4, 20, 0.4, 2.2, '#ffdd55'); break;
        case 'beam': this.lines.push({ x1: f.ux, y1: f.uy, x2: f.x, y2: f.y, t: 0, T: 0.5, c: '#5dff8a', w: 2 }); this.burst(f.x, f.y, 4, 14, 0.5, 2, '#9dffb0'); break;
        case 'smoke': this.burst(f.x, f.y, 10, 18, 1.6, 6, 'rgba(200,200,210,0.5)'); break;
        case 'warp': this.rings.push({ x: f.x, y: f.y, r: 2, R: 26, t: 0, T: 0.5, c: '#c08cff' }); this.burst(f.x, f.y, 8, 30, 0.5, 2, '#d8b4ff'); break;
        case 'heal': this.rings.push({ x: f.x, y: f.y, r: 4, R: 40, t: 0, T: 0.7, c: '#7dff9a' }); this.burst(f.x, f.y, 12, 20, 0.8, 2, '#a8ffbc'); break;
        case 'dirt': this.burst(f.x, f.y, 2, 12, 0.4, 1.8, '#7a5a3a'); break;
        case 'dust': this.burst(f.x, f.y, 1, 8, 0.7, 3, 'rgba(190,160,110,0.45)'); break;
        case 'pop': this.burst(f.x, f.y, 10, 30, 0.5, 2, '#eeeeee'); this.rings.push({ x: f.x, y: f.y, r: 2, R: 14, t: 0, T: 0.3, c: '#fff' }); break;
        case 'clash': if (Math.random() < 0.3) this.part(f.x + (Math.random() - 0.5) * 3, f.y + (Math.random() - 0.5) * 3, 0, -6, 0.12, 1.6, '#ffffff'); break;
        case 'ufo': this.ufos.push({ x: f.x, y: f.y, t: 0, T: 4.5 }); break;
        case 'firepool': this.rings.push({ x: f.x, y: f.y, r: 4, R: f.r || 30, t: 0, T: 0.4, c: '#ff8a2a' }); break;
        case 'callout': this.addCallout(f); break;
        case 'ability': {
          const c = f.color || '#ffd166';
          this.rings.push({ x: f.x, y: f.y, r: 4, R: 46, t: 0, T: 0.7, c }); this.rings.push({ x: f.x, y: f.y, r: 2, R: 26, t: 0, T: 0.5, c: '#fff' });
          this.burst(f.x, f.y, 18, 40, 0.7, 2.4, c);
          const key = (f.name || '').slice(0, 10);
          if (key && !this.callouts.some(q => q.text.indexOf(key) >= 0 && q.t < 0.5)) this.addCallout({ text: f.name + '!', x: f.x, y: f.y, color: c, big: true, ability: true });
          break;
        }
        case 'empflash':
          this.flash = { color: '#ffffff', t: 0, T: 1.6, a: 0.95 }; this.shake = 9;
          this.rings.push({ x: f.x, y: f.y, r: 5, R: f.r, t: 0, T: 1.1, c: '#ffffff' }); this.rings.push({ x: f.x, y: f.y, r: 5, R: f.r * 0.55, t: 0, T: 0.8, c: '#bfefff' });
          this.burst(f.x, f.y, 60, f.r * 1.2, 1.2, 2.5, '#e8fbff');
          break;
        case 'devo':
          this.addCallout({ text: (f.up ? '▲ ' : '▼ ') + f.from.toUpperCase() + ' → ' + f.to.toUpperCase(), x: f.x, y: f.y - 10, color: f.up ? '#7dff9a' : '#ffffff', big: false });
          this.rings.push({ x: f.x, y: f.y, r: 2, R: 22, t: 0, T: 0.6, c: f.up ? '#7dff9a' : '#fff' });
          break;
        case 'nukewarn': this.warns.push({ x: f.x, y: f.y, r: f.r, t: 0, T: 2.5, sx: f.sx, sy: f.sy }); this.addCallout({ text: '☢ NUKE INBOUND', x: f.x, y: f.y, color: '#ffb347', big: true }); break;
        case 'nuke':
          this.flash = { color: '#fff3c0', t: 0, T: 1.8, a: 0.95 }; this.shake = 14;
          for (let k = 0; k < 3; k++) this.rings.push({ x: f.x, y: f.y, r: 3, R: f.r * (1 + k * 0.5), t: 0, T: 0.9 + k * 0.4, c: k ? '#ff7a1a' : '#ffffff' });
          this.burst(f.x, f.y, 120, f.r * 1.4, 2.2, 4, '#ffae42'); this.burst(f.x, f.y, 60, f.r * 0.6, 3.5, 7, 'rgba(90,70,60,0.7)');
          if (this.dctx) { this.dctx.fillStyle = 'rgba(20,14,10,0.45)'; this.dctx.beginPath(); this.dctx.arc(f.x, f.y, f.r * 0.8, 0, 6.283); this.dctx.fill(); }
          break;
        case 'storm': this.rings.push({ x: f.x, y: f.y, r: f.r * 0.3, R: f.r, t: 0, T: 0.8, c: '#9ad8ff' }); break;
        case 'bolt': {
          const pts = []; let x = f.x + (Math.random() - 0.5) * 30, y = f.y - 90;
          for (let k = 0; k <= 6; k++) { pts.push([x, y]); x += (f.x - x) / (6 - k + 1) + (Math.random() - 0.5) * 10; y += (f.y - y) / (6 - k + 1); }
          pts.push([f.x, f.y]);
          this.bolts.push({ pts, t: 0, T: 0.25 }); this.burst(f.x, f.y, 6, 30, 0.3, 2, '#dff4ff');
          if (Math.random() < 0.3) this.flash = this.flash || { color: '#dff4ff', t: 0, T: 0.15, a: 0.25 };
          break;
        }
        case 'tesla': this.lines.push({ x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, t: 0, T: 0.12, c: '#8ff0ff', w: 2.5 }); this.burst(f.x2, f.y2, 3, 30, 0.3, 2, '#bff8ff'); break;
        case 'freeze': this.rings.push({ x: f.x, y: f.y, r: 3, R: f.r, t: 0, T: 0.9, c: '#9ff3ff' }); this.burst(f.x, f.y, 40, f.r, 1, 2, '#d8fbff'); break;
        case 'lift': this.rings.push({ x: f.x, y: f.y, r: f.r, R: 3, t: 0, T: 0.9, c: '#c08cff' }); this.burst(f.x, f.y, 30, 20, 1.5, 2, '#d8b4ff'); break;
        case 'psy': this.rings.push({ x: f.x, y: f.y, r: 3, R: f.r, t: 0, T: 1, c: '#e07dff' }); this.rings.push({ x: f.x, y: f.y, r: 3, R: 300, t: 0, T: 1.6, c: 'rgba(224,125,255,0.5)' }); break;
        case 'betrayed': {
          const N = b && b.fac ? b.fac : null;
          this.stamp = { a: N ? N[f.a].name : '?', b: N ? N[f.b].name : '?', ca: SIDE[f.a], cb: SIDE[f.b], age: f.age, truce: f.truce, t: 0, T: 3.2 };
          this.flash = { color: '#9b30ff', t: 0, T: 1.0, a: 0.6 }; this.shake = 8;
          break;
        }
        case 'event':
          this.banner = { text: f.text, sub: f.sub, color: f.color, t: 0, T: 2.8 };
          this.flash = { color: f.color, t: 0, T: ['betrayal', 'emp', 'aliens', 'eclipse', 'doomsday', 'darkemp', 'nuke'].includes(f.id) ? 1.1 : 0.6, a: ['betrayal', 'emp', 'aliens', 'doomsday', 'darkemp'].includes(f.id) ? 0.75 : 0.45 };
          if (f.id === 'darkemp' || f.id === 'nuke') this.flash = null;
          this.shake = 6;
          break;
      }
    }
    addCallout(f) {
      if (!f.big && this.callouts.length > 5) return;
      // avoid stacking: nudge up if another callout is near
      let y = f.y;
      for (const c of this.callouts) if (Math.abs(c.x - f.x) < 80 && Math.abs(c.y - y) < 16) y -= 18;
      this.callouts.push({ text: f.text, x: f.x, y, color: f.color || '#fff', big: !!f.big, ab: !!f.ability, t: 0, T: f.big ? 2.2 : 1.4 });
      if (this.callouts.length > 9) this.callouts.shift();
      if (f.ability && f.big) this.flash = this.flash && this.flash.t < this.flash.T * 0.5 ? this.flash : { color: f.color || '#fff', t: 0, T: 0.35, a: 0.18 };
      if (/KAMIKAZE|DIVINE WIND/.test(f.text)) { this.flash = { color: '#e8f4ff', t: 0, T: 1.0, a: 0.7 }; this.shake = 7; }
    }
    // ---------- drawing ----------
    draw(b, ui, dt) {
      const ctx = this.ctx, sc = this.scale;
      this.time += dt;
      if (b && ui && !ui.placing) this.follow(b, dt); else if (this.userT > 0) this.userT -= dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#14121c'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      let sx = 0, sy = 0;
      if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake; sy = (Math.random() - 0.5) * this.shake; this.shake = Math.max(0, this.shake - dt * 14); }
      const d = this.dpr;
      ctx.setTransform(d * sc, 0, 0, d * sc, d * (this.ox + sx), d * (this.oy + sy));
      ctx.drawImage(this.groundFor(this.weather), 0, 0, W, H);
      if (this.decal) ctx.drawImage(this.decal, 0, 0, W, H);
      if (!b) return;
      // deployment zones in placement
      if (ui && ui.placing) {
        const Z = HB.zonesFor(b.nF);
        for (let s = 0; s < b.nF; s++) {
          const z = Z[s];
          if (!ui.controllable(s)) continue;
          ctx.fillStyle = SIDE[s]; ctx.globalAlpha = 0.1;
          ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
          ctx.strokeStyle = SIDE[s]; ctx.globalAlpha = 0.6; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
          ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0); ctx.setLineDash([]); ctx.globalAlpha = 1;
        }
      }
      // HAARP storm clouds
      for (const st of b.storms) {
        const a = Math.min(1, st.T) * 0.5;
        const g = ctx.createRadialGradient(st.x, st.y, 4, st.x, st.y, st.r);
        g.addColorStop(0, 'rgba(40,50,80,' + a + ')'); g.addColorStop(1, 'rgba(40,50,80,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.283); ctx.fill();
      }
      // fire pools
      for (const f of b.fires) {
        const a = Math.min(1, f.t / 2) * (0.35 + 0.1 * Math.sin(this.time * 20 + f.x));
        const g = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
        g.addColorStop(0, 'rgba(255,220,90,' + a + ')'); g.addColorStop(0.6, 'rgba(255,100,20,' + a * 0.8 + ')'); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.fill();
        if (Math.random() < 0.3) this.part(f.x + (Math.random() - 0.5) * f.r, f.y + (Math.random() - 0.5) * f.r, 0, -10, 0.5, 2, '#ffae42');
      }
      this.drawSelection(b, ui);
      this.drawUnits(b, ui);
      this.drawProjectiles(b);
      this.drawParticles(dt);
      this.drawUfos(dt);
      this.drawWorldFx(b, dt);
      this.drawSquadMarks(b, ui);
      this.drawEnv(b, dt);
      // screen-space overlays
      ctx.setTransform(d, 0, 0, d, 0, 0);
      this.drawCallouts(dt);
      this.drawBanner(dt);
      this.drawStamp(dt);
    }
    drawWorldFx(b, dt) {
      const ctx = this.ctx;
      for (let k = this.bolts.length - 1; k >= 0; k--) {
        const B = this.bolts[k]; B.t += dt; if (B.t >= B.T) { this.bolts.splice(k, 1); continue; }
        ctx.globalAlpha = 1 - B.t / B.T; ctx.strokeStyle = '#eaf8ff'; ctx.lineWidth = 1.6; ctx.beginPath();
        B.pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
        ctx.lineWidth = 5; ctx.globalAlpha *= 0.25; ctx.stroke();
      }
      for (let k = this.warns.length - 1; k >= 0; k--) {
        const w = this.warns[k]; w.t += dt; if (w.t >= w.T) { this.warns.splice(k, 1); continue; }
        const p = 0.5 + 0.5 * Math.sin(this.time * 18);
        ctx.globalAlpha = 0.35 + 0.4 * p; ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,120,30,0.12)'; ctx.fill();
        const f = w.t / w.T; ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(w.sx + (w.x - w.sx) * f, w.sy + (w.y - w.sy) * f - Math.sin(f * Math.PI) * 120, 2.5, 0, 6.283); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (b.invasion) { // the sky darkens
        const a = Math.min(0.45, (b.invasion.dur - b.invasion.T) * 0.2, b.invasion.T * 0.2);
        ctx.fillStyle = 'rgba(4,10,6,' + a + ')'; ctx.fillRect(0, 0, W, H);
      }
    }
    drawStamp(dt) {
      const S = this.stamp; if (!S) return;
      S.t += dt; if (S.t >= S.T) { this.stamp = null; return; }
      const ctx = this.ctx, a = Math.min(1, (S.T - S.t) * 2), sc = S.t < 0.15 ? 2.2 - S.t / 0.15 * 1.2 : 1, cx = this.cw / 2, cy = this.ch * 0.36;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha = a;
      const w = Math.min(this.cw * 0.86, 360);
      ctx.strokeStyle = '#ff2a4a'; ctx.lineWidth = 5; ctx.strokeRect(-w / 2, -40, w, 80);
      ctx.lineWidth = 2; ctx.strokeRect(-w / 2 + 6, -34, w - 12, 68);
      ctx.fillStyle = 'rgba(20,0,8,0.55)'; ctx.fillRect(-w / 2, -40, w, 80);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.min(44, w / 6.5) + 'px system-ui, sans-serif'; ctx.fillStyle = '#ff2a4a'; ctx.fillText('BETRAYED', 0, -10);
      ctx.font = '800 13px system-ui, sans-serif';
      const t1 = S.a + '  🗡  ' + S.b, t2 = S.truce ? 'broke the truce during the invasion' : 'after a ' + Math.round(S.age) + 's alliance';
      ctx.fillStyle = S.ca; ctx.fillText(t1, 0, 18); ctx.fillStyle = '#ddd'; ctx.font = '600 11px system-ui, sans-serif'; ctx.fillText(t2, 0, 32);
      ctx.restore();
    }
    drawUnits(b, ui) {
      const ctx = this.ctx, n = b.n, U = HB.UNITS;
      const cnt = this.bucketCount, st = this.bucketStart, idx = this.bucketIdx;
      cnt.fill(0);
      const big = [], special = [];
      for (let i = 0; i < n; i++) {
        if (!b.alive[i]) continue;
        const u = U[b.ti[i]];
        if (u.veh || u.air || u.rad >= 3) { big.push(i); continue; }
        if (b.flags[i] & (FL.F_GHOST | FL.F_STEALTH | FL.F_ZOMBIE | FL.F_FROZEN | FL.F_LIFT) || b.burnT[i] > 0 || b.flash[i] > 0) { special.push(i); continue; }
        cnt[b.side[i] * NB + b.ti[i]]++;
      }
      const NBT = NB * NSIDE; let acc = 0; for (let k = 0; k < NBT; k++) { st[k] = acc; acc += cnt[k]; cnt[k] = st[k]; } st[NBT] = acc;
      const darkF = b.fac ? b.fac.map(f => f.dark) : [];
      for (let i = 0; i < n; i++) {
        if (!b.alive[i]) continue; const u = U[b.ti[i]];
        if (u.veh || u.air || u.rad >= 3 || (b.flags[i] & (FL.F_GHOST | FL.F_STEALTH | FL.F_ZOMBIE | FL.F_FROZEN | FL.F_LIFT)) || b.burnT[i] > 0 || b.flash[i] > 0) continue;
        idx[cnt[b.side[i] * NB + b.ti[i]]++] = i;
      }
      for (let k = 0; k < NBT; k++) {
        const s0 = st[k], s1 = st[k + 1]; if (s0 === s1) continue;
        const side = (k / NB) | 0, ti = k % NB, u = U[ti];
        const r = Math.max(1.2, u.rad * (u.role === 'Cavalry' ? 0.85 : 0.72));
        ctx.fillStyle = SIDE_DARK[side];
        for (let q = s0; q < s1; q++) { const i = idx[q]; ctx.fillRect(b.x[i] - r + 0.5, b.y[i] - r + 0.6, r * 2, r * 2); }
        ctx.fillStyle = darkF[side] && u.power && u.tech ? '#555a60' : TCOL[side][ti];
        if (u.role === 'Cavalry') {
          for (let q = s0; q < s1; q++) { const i = idx[q]; const h = b.hd[i], cx = Math.cos(h) * r * 0.6, cy = Math.sin(h) * r * 0.6; ctx.fillRect(b.x[i] - r * 0.8 - cx * 0.3, b.y[i] - r * 0.8 - cy * 0.3, r * 1.6, r * 1.6); ctx.fillRect(b.x[i] + cx - r * 0.5, b.y[i] + cy - r * 0.5, r, r); }
        } else for (let q = s0; q < s1; q++) { const i = idx[q]; ctx.fillRect(b.x[i] - r, b.y[i] - r, r * 2, r * 2); }
      }
      // specials: ghosts, stealth, zombies, burning, flashing
      for (const i of special) {
        const u = U[b.ti[i]], f = b.flags[i], r = Math.max(1.2, u.rad * 0.75), side = b.side[i];
        let col = TCOL[side][b.ti[i]], a = 1;
        if (f & FL.F_GHOST) { col = '#e8f6ff'; a = 0.45 + 0.2 * Math.sin(this.time * 8 + i); }
        else if ((f & FL.F_STEALTH) && b.revealT[i] <= 0) { a = 0.22; col = '#222'; }
        if (f & FL.F_ZOMBIE) col = '#ff2a2a';
        if ((f & FL.F_FROZEN) && b.stunT[i] > 0) col = '#bff6ff';
        if (b.flash[i] > 0) col = '#ffffff';
        let ly = 0;
        if ((f & FL.F_LIFT) && b.stunT[i] > 0) { ly = -6 - 2 * Math.sin(this.time * 6 + i); ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.fillRect(b.x[i] - r, b.y[i] - r, r * 2, r * 2); col = '#e2c8ff'; }
        ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(b.x[i] - r, b.y[i] - r + ly, r * 2, r * 2);
        if (b.burnT[i] > 0) { ctx.fillStyle = Math.random() < 0.5 ? '#ff7a1a' : '#ffd23a'; ctx.fillRect(b.x[i] - 0.8, b.y[i] - r - 1.6, 1.6, 1.8); }
      }
      ctx.globalAlpha = 1;
      for (const i of big) this.drawBig(b, i);
    }
    drawBig(b, i) {
      const ctx = this.ctx, u = HB.UNITS[b.ti[i]], side = b.side[i], f = b.flags[i];
      const x = b.x[i], y = b.y[i], h = b.hd[i], r = u.rad, airborne = u.air && !(f & (FL.F_LANDED | FL.F_TEMPLAND));
      let col = (f & FL.F_ZOMBIE) ? '#ff2a2a' : TCOL[side][b.ti[i]], dark = SIDE_DARK[side];
      if (b.fac && b.fac[side] && b.fac[side].dark && u.power && u.tech) col = '#555a60';
      if ((f & FL.F_FROZEN) && b.stunT[i] > 0) col = '#bff6ff';
      ctx.save();
      if (airborne) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + 7, y + 10, r * 1.1, r * 0.7, 0, 0, 6.283); ctx.fill(); }
      if (b.stunT[i] > 0 && Math.random() < 0.4) this.part(x + (Math.random() - 0.5) * r * 2, y + (Math.random() - 0.5) * r * 2, 0, 0, 0.12, 1.5, '#7ff6ff');
      ctx.translate(x, y);
      if (b.flash[i] > 0) ctx.globalAlpha = 0.6;
      switch (u.id) {
        case 'abrams': case 'sherman': case 'decoy': {
          ctx.rotate(h);
          ctx.fillStyle = dark; ctx.fillRect(-r * 1.15, -r * 0.85, r * 2.3, r * 1.7);
          ctx.fillStyle = col; ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
          ctx.fillStyle = '#222'; ctx.fillRect(-r * 1.1, -r * 0.88, r * 2.2, r * 0.25); ctx.fillRect(-r * 1.1, r * 0.63, r * 2.2, r * 0.25);
          let ta = 0; const j = b.tgt[i]; if (j >= 0 && b.alive[j]) ta = Math.atan2(b.y[j] - y, b.x[j] - x) - h;
          ctx.rotate(ta); ctx.fillStyle = shade(SIDE[side], -0.15); ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#333'; ctx.fillRect(0, -r * 0.12, r * 1.6, r * 0.24);
          break;
        }
        case 'apache': {
          if (airborne) { ctx.translate(0, -3); }
          ctx.rotate(h);
          ctx.fillStyle = dark; ctx.fillRect(-r * 1.4, -r * 0.14, r * 1.2, r * 0.28);
          ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.8, r * 0.42, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#111'; ctx.fillRect(-r * 0.2, -r * 0.7, r * 0.3, r * 1.4);
          ctx.rotate(airborne ? this.time * 25 : 0.4); ctx.strokeStyle = airborne ? 'rgba(230,230,230,0.55)' : '#444'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-r * 1.4, 0); ctx.lineTo(r * 1.4, 0); ctx.moveTo(0, -r * 1.4); ctx.lineTo(0, r * 1.4); ctx.stroke();
          break;
        }
        case 'p51': {
          if (airborne) ctx.translate(0, -3);
          ctx.rotate(h);
          ctx.fillStyle = col; ctx.fillRect(-r, -r * 0.18, r * 2, r * 0.36);
          ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(r * 0.3, 0); ctx.lineTo(-r * 0.2, -r * 1.3); ctx.lineTo(-r * 0.5, -r * 1.3); ctx.lineTo(-r * 0.3, 0); ctx.lineTo(-r * 0.5, r * 1.3); ctx.lineTo(-r * 0.2, r * 1.3); ctx.closePath(); ctx.fill();
          ctx.fillRect(-r, -r * 0.5, r * 0.3, r);
          ctx.fillStyle = '#ddd'; ctx.fillRect(r * 0.95, -r * 0.5, 0.6, r);
          break;
        }
        case 'mgnest': {
          ctx.fillStyle = '#8a7a55'; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, 6.283); ctx.fill();
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0, 6.283); ctx.fill();
          let ta = side ? Math.PI / 2 : -Math.PI / 2; const j = b.tgt[i]; if (j >= 0 && b.alive[j]) ta = Math.atan2(b.y[j] - y, b.x[j] - x);
          ctx.rotate(ta); ctx.fillStyle = '#222'; ctx.fillRect(0, -0.6, r * 1.6, 1.2);
          break;
        }
        case 'trojan': {
          ctx.fillStyle = '#7a5530'; ctx.fillRect(-r, -r * 0.5, r * 2, r);
          ctx.fillRect(r * 0.5, -r * 1.3, r * 0.5, r); ctx.fillRect(r * 0.4, -r * 1.5, r * 0.9, r * 0.4);
          ctx.fillStyle = '#4a3218'; for (const lx of [-0.8, -0.4, 0.4, 0.8]) ctx.fillRect(lx * r - 0.6, r * 0.5, 1.2, r * 0.6);
          ctx.strokeStyle = SIDE[side]; ctx.lineWidth = 1; ctx.strokeRect(-r, -r * 0.5, r * 2, r);
          break;
        }
        case 'archimedes': {
          ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill();
          const g = ctx.createRadialGradient(-1, -1, 0, 0, 0, r * 0.8); g.addColorStop(0, '#fffbe0'); g.addColorStop(1, '#d4a52a');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 6.283); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
          break;
        }
        case 'mech': {
          ctx.rotate(h);
          const st = Math.sin(this.time * 8 + i) * r * 0.35;
          ctx.fillStyle = dark; ctx.fillRect(-r * 0.3 + st, -r * 0.9, r * 0.6, r * 0.4); ctx.fillRect(-r * 0.3 - st, r * 0.5, r * 0.6, r * 0.4);
          ctx.fillStyle = col; ctx.fillRect(-r * 0.6, -r * 0.65, r * 1.2, r * 1.3);
          ctx.fillStyle = '#8ff0ff'; ctx.fillRect(r * 0.2, -r * 0.2, r * 0.35, r * 0.4);
          ctx.fillStyle = '#333'; ctx.fillRect(0, -r * 0.95, r * 1.2, r * 0.25); ctx.fillRect(0, r * 0.7, r * 1.2, r * 0.25);
          break;
        }
        case 'ufo': case 'mothership': {
          const R2 = r * (u.id === 'mothership' ? 1.2 : 1), bob = Math.sin(this.time * 3 + i) * 1.5;
          ctx.translate(0, -4 + bob);
          if (u.id === 'mothership') { ctx.globalAlpha = 0.18; ctx.fillStyle = '#5dff8a'; ctx.beginPath(); ctx.moveTo(-R2 * 0.4, 0); ctx.lineTo(R2 * 0.4, 0); ctx.lineTo(R2, 40); ctx.lineTo(-R2, 40); ctx.fill(); ctx.globalAlpha = 1; }
          ctx.fillStyle = u.id === 'mothership' ? '#3a4a40' : '#9aa4b0'; ctx.beginPath(); ctx.ellipse(0, 0, R2 * 1.3, R2 * 0.45, 0, 0, 6.283); ctx.fill();
          ctx.strokeStyle = u.id === 'mothership' ? '#39ff6a' : col; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.fillStyle = '#c8f7ff'; ctx.beginPath(); ctx.ellipse(0, -R2 * 0.2, R2 * 0.55, R2 * 0.4, 0, Math.PI, 0); ctx.fill();
          for (let q = 0; q < 6; q++) { ctx.fillStyle = (q + ((this.time * 8) | 0)) % 2 ? '#5dff8a' : '#ffef5a'; ctx.fillRect(-R2 + q * R2 * 0.4, -0.8, 1.6, 1.6); }
          const sq = b.squads[b.sq[i]];
          if (sq && sq.shield > 0 && u.shield) { ctx.globalAlpha = 0.25 + 0.3 * sq.shield / u.shield; ctx.strokeStyle = '#8ff0ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, R2 * 1.6, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
          break;
        }
        case 'biplane': {
          if (airborne) ctx.translate(0, -3);
          ctx.rotate(h);
          ctx.fillStyle = col; ctx.fillRect(-r, -r * 0.15, r * 1.8, r * 0.3);
          ctx.fillStyle = '#c9b48a'; ctx.fillRect(-r * 0.1, -r * 1.2, r * 0.45, r * 2.4); ctx.fillRect(-r * 0.9, -r * 0.5, r * 0.25, r);
          break;
        }
        case 'balloon': {
          ctx.translate(0, -6); ctx.fillStyle = '#eeeeee'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, 6.283); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, r * 0.8); ctx.lineTo(0, r * 1.6); ctx.stroke();
          break;
        }
        case 'darkemp': case 'nuke': {
          ctx.fillStyle = '#2a2a30'; ctx.fillRect(-r, -r, r * 2, r * 2);
          ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.strokeRect(-r, -r, r * 2, r * 2);
          ctx.fillStyle = u.id === 'nuke' ? '#ffd23a' : '#ffffff'; ctx.font = '900 ' + (r * 1.6) + 'px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(u.id === 'nuke' ? '☢' : 'ϟ', 0, 0.5);
          break;
        }
        default: { // cannon / greek fire siphon
          ctx.rotate(h);
          ctx.fillStyle = '#5a3d22'; ctx.fillRect(-r * 0.9, -r * 0.8, r * 1.2, r * 1.6);
          ctx.fillStyle = u.id === 'greekfire' ? '#b8862a' : '#2a2a2a'; ctx.fillRect(-r * 0.4, -r * 0.3, r * 1.6, r * 0.6);
          ctx.fillStyle = col; ctx.fillRect(-r * 1.1, -r * 0.4, r * 0.5, r * 0.8);
        }
      }
      ctx.restore();
      // status bars for the expensive stuff
      if (u.cost >= 100 && !(f & FL.F_DECOY) && u.id !== 'decoy') {
        const bw = Math.max(10, r * 2.6), bx = x - bw / 2; let by = y - r - (airborne ? 9 : 6);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, 2.2);
        ctx.fillStyle = b.hp[i] / u.hp > 0.35 ? '#5dff7a' : '#ff4a3a'; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, b.hp[i] / u.hp)), 1.4);
        if (u.hasAmmo) {
          const am = (u.w1 && u.w1.ammo ? b.am1[i] / u.w1.ammo : 0) * 0.5 + (u.w2 && u.w2.ammo ? b.am2[i] / u.w2.ammo : (u.w1 && u.w1.ammo ? b.am1[i] / u.w1.ammo : 0)) * 0.5;
          by += 2.2; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, 2.2);
          ctx.fillStyle = am > 0.01 ? '#ffd23a' : (Math.sin(this.time * 12) > 0 ? '#ff3a3a' : '#550000'); ctx.fillRect(bx, by, am > 0.01 ? bw * am : bw, 1.4);
        }
        if (u.fuel) {
          by += 2.2; const fu = Math.max(0, b.fuel[i] / u.fuel); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, 2.2);
          ctx.fillStyle = fu > 0.01 ? '#5fd0ff' : (Math.sin(this.time * 12) > 0 ? '#ff3a3a' : '#550000'); ctx.fillRect(bx, by, fu > 0.01 ? bw * fu : bw, 1.4);
        }
      }
    }
    drawProjectiles(b) {
      const ctx = this.ctx, np = b.np;
      ctx.lineWidth = 0.8;
      for (let k = 1; k <= 5; k++) {
        ctx.strokeStyle = PCOL[k]; ctx.fillStyle = PCOL[k];
        ctx.beginPath();
        for (let p = 0; p < np; p++) {
          if (b.pk[p] !== k) continue;
          const f = b.pt[p] / b.pT[p], x0 = b.px[p], y0 = b.py[p], dx = b.tx[p] - x0, dy = b.ty[p] - y0;
          let x = x0 + dx * f, y = y0 + dy * f;
          if (k === 1) { const L = Math.sqrt(dx * dx + dy * dy); y -= Math.sin(f * Math.PI) * L * 0.12; const ux = dx / (L || 1) * 2.4, uy = dy / (L || 1) * 2.4; ctx.moveTo(x - ux, y - uy); ctx.lineTo(x, y); }
          else if (k === 2) { const L = Math.sqrt(dx * dx + dy * dy) || 1; ctx.moveTo(x - dx / L * 5, y - dy / L * 5); ctx.lineTo(x, y); }
          else if (k === 3) { ctx.moveTo(x + 1.6, y); ctx.arc(x, y, 1.6, 0, 6.283); }
          else if (k === 4) { ctx.moveTo(x + 2.2, y); ctx.arc(x, y, 2.2, 0, 6.283); }
          else { ctx.moveTo(x + 1.3, y); ctx.arc(x, y, 1.3, 0, 6.283); if (Math.random() < 0.5) this.part(x, y, 0, 0, 0.5, 1.8, 'rgba(220,220,220,0.5)'); }
        }
        if (k <= 2) ctx.stroke(); else ctx.fill();
      }
    }
    drawParticles(dt) {
      const ctx = this.ctx;
      let w = 0;
      for (let i = 0; i < this.n; i++) {
        this.pl[i] -= dt; if (this.pl[i] <= 0) continue;
        this.px[i] += this.pvx[i] * dt; this.py[i] += this.pvy[i] * dt; this.pvx[i] *= 0.94; this.pvy[i] *= 0.94;
        const a = this.pl[i] / this.pm[i], s = this.ps[i];
        ctx.globalAlpha = a; ctx.fillStyle = this.pc[i]; ctx.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s);
        if (w !== i) { this.px[w] = this.px[i]; this.py[w] = this.py[i]; this.pvx[w] = this.pvx[i]; this.pvy[w] = this.pvy[i]; this.pl[w] = this.pl[i]; this.pm[w] = this.pm[i]; this.ps[w] = this.ps[i]; this.pc[w] = this.pc[i]; }
        w++;
      }
      this.n = w;
      for (let k = this.rings.length - 1; k >= 0; k--) {
        const r = this.rings[k]; r.t += dt; if (r.t >= r.T) { this.rings.splice(k, 1); continue; }
        const f = r.t / r.T; ctx.globalAlpha = 1 - f; ctx.strokeStyle = r.c; ctx.lineWidth = 2 * (1 - f) + 0.5;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.R - r.r) * f, 0, 6.283); ctx.stroke();
      }
      for (let k = this.lines.length - 1; k >= 0; k--) {
        const l = this.lines[k]; l.t += dt; if (l.t >= l.T) { this.lines.splice(k, 1); continue; }
        ctx.globalAlpha = 1 - l.t / l.T; ctx.strokeStyle = l.c; ctx.lineWidth = l.w; ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
        ctx.lineWidth = l.w * 3; ctx.globalAlpha *= 0.25; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    drawUfos(dt) {
      const ctx = this.ctx;
      for (let k = this.ufos.length - 1; k >= 0; k--) {
        const u = this.ufos[k]; u.t += dt; if (u.t >= u.T) { this.ufos.splice(k, 1); continue; }
        const a = Math.min(1, u.t * 3, (u.T - u.t) * 3), x = u.x + Math.sin(u.t * 2) * 8, y = u.y;
        ctx.globalAlpha = a * 0.25; ctx.fillStyle = '#5dff8a'; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y); ctx.lineTo(x + 40, y + 70); ctx.lineTo(x - 40, y + 70); ctx.fill();
        ctx.globalAlpha = a; ctx.fillStyle = '#9aa4b0'; ctx.beginPath(); ctx.ellipse(x, y, 24, 7, 0, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#c8f7ff'; ctx.beginPath(); ctx.ellipse(x, y - 4, 10, 6, 0, Math.PI, 0); ctx.fill();
        for (let q = 0; q < 6; q++) { ctx.fillStyle = (q + ((u.t * 8) | 0)) % 2 ? '#5dff8a' : '#ffef5a'; ctx.fillRect(x - 18 + q * 7, y - 1, 2.5, 2.5); }
      }
      ctx.globalAlpha = 1;
    }
    squadSpread(b, s) {
      let r2 = 0;
      if (s.alive > 400) return Math.sqrt(s.alive) * 2.2;
      for (let i = 0; i < b.n; i++) if (b.alive[i] && b.sq[i] === s.id) { const dx = b.x[i] - s.cx, dy = b.y[i] - s.cy, d2 = dx * dx + dy * dy; if (d2 > r2) r2 = d2; }
      return Math.min(160, Math.sqrt(r2) + HB.UNITS[s.ti].rad + 3);
    }
    drawSelection(b, ui) {
      if (!ui || ui.sel < 0) return;
      const s = b.squads[ui.sel]; if (!s || s.alive <= 0) return;
      const ctx = this.ctx, r = this.squadSpread(b, s), p = 0.5 + 0.5 * Math.sin(this.time * 6);
      ctx.strokeStyle = '#fff'; ctx.globalAlpha = 0.5 + 0.4 * p; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(s.cx, s.cy, r, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1;
    }
    drawSquadMarks(b, ui) {
      const ctx = this.ctx;
      for (const s of b.squads) {
        if (s.alive <= 0 || s.temp) continue;
        // orders
        if (s.order && ui && ui.controllable(s.side) && !(s.order.kind === 'move' && s.order.arrived)) {
          let tx, ty;
          if (s.order.kind === 'move') { tx = s.order.x; ty = s.order.y; } else { const o = b.squads[s.order.sq]; if (!o) continue; tx = o.cx; ty = o.cy; }
          ctx.strokeStyle = s.order.kind === 'move' ? 'rgba(255,255,255,0.6)' : 'rgba(255,80,60,0.8)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(s.cx, s.cy); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
          ctx.beginPath(); if (s.order.kind === 'move') { ctx.moveTo(tx - 4, ty - 4); ctx.lineTo(tx + 4, ty + 4); ctx.moveTo(tx + 4, ty - 4); ctx.lineTo(tx - 4, ty + 4); } else ctx.arc(tx, ty, 7, 0, 6.283); ctx.stroke();
        }
        // ability ring: cooldown arc fills up, pulses + ★ when ready (all squads while spectating)
        if (ui && !ui.placing && (ui.controllable(s.side) || ui.spectate) && s.def.lore && !s.def.hidden) {
          const L = s.def.lore, y = s.cy - Math.min(40, HB.UNITS[s.ti].rad * 2 + 8), col = HB.ERAS[s.def.era].color, rr = 5.5 / Math.max(1, this.cam.z * 0.6);
          const used = s.cd > 900, ready = s.cd <= 0 && !used, f = used ? 0 : ready ? 1 : 1 - Math.min(1, s.cd / Math.max(1, L.cd));
          const blocked = b.payBlock ? b.payBlock(s) : null;
          ctx.globalAlpha = 0.55; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(s.cx, y, rr + 1.2, 0, 6.283); ctx.fill();
          ctx.globalAlpha = 1; ctx.strokeStyle = used ? '#555' : blocked && ready ? '#777' : col; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(s.cx, y, rr, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
          if (ready && !blocked) {
            const p = 0.6 + 0.4 * Math.sin(this.time * 5 + s.id);
            ctx.globalAlpha = p; ctx.fillStyle = col; star(ctx, s.cx, y, rr * 0.8);
            ctx.globalAlpha = 0.5 * p; ctx.beginPath(); ctx.arc(s.cx, y, rr + 2 + 2 * p, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
          }
          if (s.abFx > 0) { s.abFx -= 1 / 60; ctx.globalAlpha = Math.max(0, s.abFx); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.cx, s.cy, 30 * (1.3 - s.abFx), 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1; }
        }
      }
      // hold progress ring
      if (ui && ui.hold && ui.hold.sq >= 0) {
        const s = b.squads[ui.hold.sq]; if (s) {
          const f = Math.min(1, ui.hold.f);
          const rr = Math.max(16, Math.min(40, this.squadSpread(b, s)));
          ctx.globalAlpha = 0.3; ctx.strokeStyle = '#000'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.cx, s.cy, rr, 0, 6.283); ctx.stroke(); ctx.globalAlpha = 1;
          ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.cx, s.cy, rr, -Math.PI / 2, -Math.PI / 2 + f * 6.283); ctx.stroke();
        }
      }
    }
    drawEnv(b, dt) {
      const ctx = this.ctx, t = this.time;
      if (this.weather === 'night') { ctx.fillStyle = 'rgba(5,8,30,0.32)'; ctx.fillRect(0, 0, W, H); }
      const rainy = this.weather === 'storm' || b.flagsEnv.rain;
      for (const e of b.events) {
        const a = Math.min(1, (e.dur - e.t) * 2, e.t * 2);
        if (e.id === 'eclipse') { ctx.fillStyle = 'rgba(8,4,24,' + 0.5 * a + ')'; ctx.fillRect(0, 0, W, H); }
        else if (e.id === 'sandstorm') {
          ctx.fillStyle = 'rgba(217,154,58,' + 0.32 * a + ')'; ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(240,200,130,' + 0.35 * a + ')'; ctx.lineWidth = 1; ctx.beginPath();
          for (let k = 0; k < 70; k++) { const x = ((k * 97 + t * 260) % (W + 60)) - 30, y = (k * 53) % H; ctx.moveTo(x, y); ctx.lineTo(x + 22, y + 3); } ctx.stroke();
        } else if (e.id === 'plague') { ctx.fillStyle = 'rgba(60,110,40,' + 0.18 * a + ')'; ctx.fillRect(0, 0, W, H); }
        else if (e.id === 'emp') { if (Math.random() < 0.3) { ctx.fillStyle = 'rgba(0,229,255,' + 0.1 * a + ')'; ctx.fillRect(0, 0, W, H); } }
        else if (e.id === 'betrayal') { ctx.fillStyle = 'rgba(155,48,255,' + 0.15 * a + ')'; ctx.fillRect(0, 0, W, H); }
        else if (e.id === 'aliens') { ctx.fillStyle = 'rgba(57,255,106,' + 0.08 * a + ')'; ctx.fillRect(0, 0, W, H); }
      }
      if (rainy) {
        ctx.strokeStyle = 'rgba(170,200,255,0.35)'; ctx.lineWidth = 0.8; ctx.beginPath();
        for (let k = 0; k < 110; k++) { const x = (k * 71 + t * 60) % W, y = (k * 137 + t * 700) % H; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); } ctx.stroke();
        if (this.weather === 'storm' && Math.random() < 0.004) this.flash = { color: '#ffffff', t: 0, T: 0.25, a: 0.5 };
      }
    }
    drawCallouts(dt) {
      const ctx = this.ctx;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (let k = this.callouts.length - 1; k >= 0; k--) {
        const c = this.callouts[k]; c.t += dt; if (c.t >= c.T) { this.callouts.splice(k, 1); continue; }
        const p = this.toScreen(c.x, c.y - c.t * 10);
        const pop = c.t < 0.18 ? 0.5 + (c.t / 0.18) * 0.75 : c.t < 0.3 ? 1.25 - (c.t - 0.18) / 0.12 * 0.25 : 1;
        const size = (c.big ? (c.ab ? 21 : 18) : 12) * pop;
        ctx.font = '900 ' + size.toFixed(1) + 'px system-ui, -apple-system, Segoe UI, sans-serif';
        const tw = ctx.measureText(c.text).width;
        const x = Math.max(tw / 2 + 6, Math.min(this.cw - tw / 2 - 6, p.x)), y = Math.max(46, Math.min(this.ch - 40, p.y - 14));
        ctx.globalAlpha = Math.min(1, (c.T - c.t) * 3);
        ctx.lineWidth = c.big ? 5 : 3; ctx.strokeStyle = '#000'; ctx.strokeText(c.text, x, y);
        ctx.fillStyle = c.color; ctx.fillText(c.text, x, y);
      }
      ctx.globalAlpha = 1;
    }
    drawBanner(dt) {
      const ctx = this.ctx;
      if (this.flash) {
        const f = this.flash; f.t += dt; if (f.t >= f.T) this.flash = null;
        else { ctx.globalAlpha = f.a * (1 - f.t / f.T); ctx.fillStyle = f.color; ctx.fillRect(0, 0, this.cw, this.ch); ctx.globalAlpha = 1; }
      }
      const B = this.banner; if (!B) return;
      B.t += dt; if (B.t >= B.T) { this.banner = null; return; }
      const a = Math.min(1, B.t * 5, (B.T - B.t) * 3), y = this.ch * 0.42, sl = B.t < 0.2 ? (1 - B.t / 0.2) * this.cw : 0;
      ctx.globalAlpha = a * 0.85; ctx.fillStyle = '#000'; ctx.fillRect(0, y - 36, this.cw, 72);
      ctx.fillStyle = B.color; ctx.fillRect(0, y - 36, this.cw, 4); ctx.fillRect(0, y + 32, this.cw, 4);
      ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 ' + Math.min(38, this.cw / 11) + 'px system-ui, sans-serif'; ctx.lineWidth = 6; ctx.strokeStyle = '#000';
      ctx.strokeText(B.text, this.cw / 2 + sl, y - 8); ctx.fillStyle = shade(B.color, 0.45); ctx.fillText(B.text, this.cw / 2 + sl, y - 8);
      ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = '#eee'; ctx.fillText(B.sub || '', this.cw / 2 - sl, y + 20);
      ctx.globalAlpha = 1;
    }
  }
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  HB.Renderer = Renderer;
  HB.SIDE_COLORS = SIDE;
})(window);
