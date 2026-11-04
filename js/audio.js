/* Timeline Brawl — procedural WebAudio sound (no audio files, nothing to license).
   Layered battle sfx (steel, drums, horns, arrow whoosh, crowd roar) and a quiet map drone. */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  const LS = 'tb.muted';
  let ctx = null, master = null, sfxBus = null, musBus = null, verb = null, noiseBuf = null, brownBuf = null;
  let muted = false; try { muted = G.localStorage && G.localStorage.getItem(LS) === '1'; } catch (e) { /* private mode */ }
  const last = {};
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = G.AudioContext || G.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.gain.value = 0; musBus.connect(master);
      const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n); brownBuf = ctx.createBuffer(1, n * 2, n);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const b = brownBuf.getChannelData(0); let l = 0; for (let i = 0; i < b.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = l * 3.5; }
      // short synthetic room reverb for weight
      const ir = ctx.createBuffer(2, n * 1.2, n); for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3); }
      verb = ctx.createConvolver(); verb.buffer = ir; const vg = ctx.createGain(); vg.gain.value = 0.22; verb.connect(vg); vg.connect(master);
      if (wantMusic) startMusic();
    } catch (e) { ctx = null; }
  }
  function ok(key, gap) {
    if (!ctx || muted || ctx.state !== 'running') return false;
    const t = ctx.currentTime; if (last[key] && t - last[key] < gap) return false; last[key] = t; return true;
  }
  function out(node, wet) { node.connect(sfxBus); if (wet && verb) node.connect(verb); }
  function tone(freq, dur, type, vol, slide, delay, wet) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); out(g, wet); o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, freq, q, delay, opt) {
    opt = opt || {}; const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = opt.brown ? brownBuf : noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = opt.type || 'bandpass'; f.frequency.setValueAtTime(freq || 1000, t); f.Q.value = q || 0.8;
    if (opt.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, (freq || 1000) * opt.sweep), t + dur);
    const g = ctx.createGain(); const a = opt.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); out(g, opt.wet); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  // building blocks
  const steel = (v, d) => { for (let i = 0; i < 3; i++) tone(1800 + Math.random() * 2200, 0.09 + Math.random() * 0.08, 'triangle', v * (1 - i * 0.25), 0.97, (d || 0) + i * 0.012); noise(0.06, v * 1.4, 5200, 3, d); };
  const drum = (v, d, f) => { tone(f || 70, 0.32, 'sine', v, 0.45, d, true); noise(0.12, v * 0.6, 160, 0.9, d, { brown: 1 }); };
  const horn = (f, dur, v, d) => {
    if (!ctx) return; const t = ctx.currentTime + (d || 0);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.25); lp.frequency.linearRampToValueAtTime(700, t + dur); lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.12); g.gain.setValueAtTime(v, t + dur - 0.2); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    for (const det of [-6, 0, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.1); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }
    lp.connect(g); out(g, true);
  };
  const roar = (v, dur) => { noise(dur, v, 600, 0.6, 0, { attack: 0.35, wet: 1, sweep: 0.7 }); noise(dur * 0.9, v * 0.7, 1100, 1.2, 0.1, { attack: 0.3, sweep: 0.8 }); noise(dur, v * 0.8, 220, 0.7, 0, { brown: 1, attack: 0.4 }); };
  const SFX = {
    shot(kind) {
      if (kind === 'rock' || kind === 'bolt') { if (ok('rock', 0.18)) { noise(0.35, 0.22, 260, 0.7, 0, { wet: 1 }); tone(80, 0.3, 'sine', 0.22, 0.5); } }
      else if (kind === 'javelin') { if (ok('jav', 0.1)) noise(0.16, 0.08, 1400, 1.5, 0, { sweep: 0.6 }); }
      else if (ok('arrow', 0.11)) { noise(0.32, 0.07, 3200, 2.5, 0, { sweep: 0.35, attack: 0.04 }); noise(0.25, 0.04, 1800, 3, 0.05, { sweep: 0.5, attack: 0.05 }); } // a volley hiss
    },
    horn() { if (ok('horn', 0.9)) { horn(196, 0.9, 0.08); horn(294, 0.7, 0.05, 0.12); } },
    charge() { if (ok('charge', 0.8)) { horn(220, 0.7, 0.07); for (let i = 0; i < 6; i++) drum(0.22 - i * 0.02, 0.05 + i * 0.16, 64 + (i % 2) * 10); } },
    thud() { if (ok('thud', 0.22)) { noise(0.28, 0.32, 180, 0.8, 0, { brown: 1 }); tone(55, 0.28, 'sine', 0.3, 0.6); steel(0.03, 0.02); } },
    clash() { if (ok('clash', 0.11)) { steel(0.035); if (Math.random() < 0.4) noise(0.12, 0.05, 900, 1); } },
    impact(z) { if (ok('impact' + z, 0.25)) { drum(z === 2 ? 0.42 : 0.3, 0); steel(0.06); noise(0.4, z === 2 ? 0.28 : 0.18, 420, 0.7, 0.02, { brown: 1, wet: 1 }); if (z >= 1) roar(0.06, 0.8); } },
    braced() { if (ok('braced', 0.3)) { tone(140, 0.25, 'square', 0.08, 0.6); steel(0.07); noise(0.3, 0.25, 300, 0.7, 0, { brown: 1 }); } },
    boom(big) { if (ok(big ? 'bigboom' : 'boom', big ? 0.25 : 0.12)) { noise(big ? 1.1 : 0.4, big ? 0.5 : 0.22, big ? 160 : 260, 0.6, 0, { brown: big, wet: 1 }); tone(60, big ? 0.8 : 0.28, 'sine', big ? 0.42 : 0.15, 0.5); } },
    rubble() { if (ok('rubble', 0.4)) { for (let i = 0; i < 7; i++) noise(0.12, 0.14, 300 + Math.random() * 500, 1.2, i * 0.07 + Math.random() * 0.04, { brown: 1 }); tone(45, 1.1, 'sine', 0.35, 0.6, 0, true); } },
    rout() { if (ok('rout', 1.2)) { roar(0.14, 1.8); horn(147, 1.1, 0.05, 0.2); } },
    ability() { if (ok('ability', 0.25)) { [660, 880, 1320].forEach((f, k) => tone(f, 0.3, 'triangle', 0.1, 1, k * 0.07, true)); } },
    callout() { if (ok('callout', 0.3)) tone(520, 0.12, 'square', 0.05, 1.5); },
    deny() { if (ok('deny', 0.2)) tone(180, 0.18, 'square', 0.08, 0.8); },
    select() { if (ok('sel', 0.05)) tone(880, 0.06, 'triangle', 0.07); },
    order() { if (ok('ord', 0.05)) { tone(600, 0.06, 'triangle', 0.07); tone(900, 0.08, 'triangle', 0.07, 1, 0.05); } },
    page() { if (ok('page', 0.15)) noise(0.18, 0.05, 2400, 0.6, 0, { sweep: 0.5, attack: 0.03 }); },
    warn() { if (ok('warn', 1)) { horn(165, 0.6, 0.07); horn(165, 0.6, 0.07, 0.7); drum(0.2, 0.05); drum(0.2, 0.75); } },
    event(id) {
      if (!ok('event', 0.5)) return;
      if (id === 'wrath') { tone(70, 2.2, 'sawtooth', 0.18, 0.6, 0, true); noise(2, 0.35, 220, 0.4, 0, { brown: 1, wet: 1 }); }
      else if (id === 'betrayal') { [392, 370, 311, 247].forEach((f, k) => tone(f, 0.4, 'sawtooth', 0.09, 1, k * 0.16, true)); }
      else if (id === 'breach' || id === 'keep') { SFX.rubble(); noise(1.3, 0.45, 150, 0.5, 0, { brown: 1, wet: 1 }); }
      else if (id === 'relief' || id === 'held') { [392, 523, 659].forEach((f, k) => horn(f, 0.5, 0.05, k * 0.18)); }
      else if (id === 'curse') { tone(110, 1.3, 'sine', 0.2, 0.5, 0, true); tone(165, 1.3, 'sine', 0.12, 0.5); }
      else { noise(1.4, 0.3, 700, 0.3, 0, { wet: 1 }); tone(150, 0.8, 'triangle', 0.15, 0.7); }
    },
    win() { if (ok('win', 1)) { [523, 659, 784, 1047].forEach((f, k) => horn(f / 2, 0.5, 0.06, k * 0.15)); [0, 0.3, 0.6].forEach(d => drum(0.3, d)); roar(0.1, 1.6); } },
    lose() { if (ok('win', 1)) { [392, 330, 262].forEach((f, k) => horn(f / 2, 0.7, 0.05, k * 0.25)); drum(0.25, 0.1, 50); } },
  };
  // ---------- map music: a low drone with sparse pentatonic plucks ----------
  let wantMusic = false, music = null;
  function startMusic() {
    wantMusic = true; if (!ctx || music) return;
    const t = ctx.currentTime, nodes = [];
    for (const [f, v] of [[55, 0.05], [82.4, 0.03], [110, 0.018]]) { const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; lfo.frequency.value = 0.07 + Math.random() * 0.05; lg.gain.value = v * 0.5; lfo.connect(lg); lg.connect(g.gain); g.gain.value = v; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; o.connect(lp); lp.connect(g); g.connect(musBus); o.start(t); lfo.start(t); nodes.push(o, lfo); }
    const scale = [220, 247, 294, 330, 392, 440, 494, 587];
    const pluck = setInterval(() => { if (!ctx || muted || ctx.state !== 'running') return; const f = scale[Math.floor(Math.random() * scale.length)], t0 = ctx.currentTime; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.6); o.connect(g); g.connect(musBus); if (verb) g.connect(verb); o.start(t0); o.stop(t0 + 1.7); }, 1900);
    musBus.gain.cancelScheduledValues(t); musBus.gain.setValueAtTime(musBus.gain.value, t); musBus.gain.linearRampToValueAtTime(1, t + 2.5);
    music = { nodes, pluck };
  }
  function stopMusic() {
    wantMusic = false; if (!ctx || !music) return; const m = music; music = null; const t = ctx.currentTime;
    clearInterval(m.pluck); musBus.gain.cancelScheduledValues(t); musBus.gain.setValueAtTime(musBus.gain.value, t); musBus.gain.linearRampToValueAtTime(0, t + 1.2);
    setTimeout(() => m.nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } }), 1400);
  }
  function setMuted(m) {
    muted = !!m; try { G.localStorage && G.localStorage.setItem(LS, muted ? '1' : '0'); } catch (e) { /* private mode */ }
    if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
  }
  HB.Audio = { unlock, SFX, setMuted, startMusic, stopMusic, get muted() { return muted; } };
})(typeof window !== 'undefined' ? window : globalThis);
