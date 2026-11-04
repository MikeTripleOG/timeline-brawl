/* Timeline Brawl — tiny WebAudio synth (no audio files). */
(function (G) {
  'use strict';
  const HB = G.HB || (G.HB = {});
  let ctx = null, master = null, noiseBuf = null, muted = false;
  const last = {};
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = G.AudioContext || G.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function ok(key, gap) {
    if (!ctx || muted || ctx.state !== 'running') return false;
    const t = ctx.currentTime; if (last[key] && t - last[key] < gap) return false; last[key] = t; return true;
  }
  function tone(freq, dur, type, vol, slide, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, q, delay) {
    const t = ctx.currentTime + (delay || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 1000; f.Q.value = q || 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  const SFX = {
    shot(kind) {
      if (kind === 'rock' || kind === 'bolt') { if (ok('rock', 0.18)) { noise(0.3, 0.2, 260, 0.7); tone(80, 0.25, 'sine', 0.2, 0.5); } }
      else if (kind === 'javelin') { if (ok('jav', 0.1)) noise(0.12, 0.08, 1400, 1.5); }
      else if (ok('arrow', 0.09)) noise(0.08, 0.06, 2500, 2);
    },
    horn() { if (ok('horn', 0.8)) { tone(196, 0.7, 'sawtooth', 0.09, 1.02); tone(294, 0.6, 'sawtooth', 0.05, 1, 0.1); } },
    thud() { if (ok('thud', 0.25)) { noise(0.25, 0.3, 180, 0.8); tone(55, 0.25, 'sine', 0.3, 0.6); } },
    clash() { if (ok('clash', 0.12)) { tone(1200 + Math.random() * 800, 0.05, 'square', 0.03); } },
    boom(big) { if (ok(big ? 'bigboom' : 'boom', big ? 0.25 : 0.12)) { noise(big ? 0.9 : 0.35, big ? 0.5 : 0.22, big ? 160 : 260, 0.6); tone(60, big ? 0.7 : 0.25, 'sine', big ? 0.4 : 0.15, 0.5); } },
    ability() { if (ok('ability', 0.25)) { [660, 880, 1320].forEach((f, k) => tone(f, 0.25, 'triangle', 0.12, 1, k * 0.07)); } },
    callout() { if (ok('callout', 0.3)) tone(520, 0.12, 'square', 0.06, 1.5); },
    deny() { if (ok('deny', 0.2)) tone(180, 0.18, 'square', 0.1, 0.8); },
    select() { if (ok('sel', 0.05)) tone(880, 0.06, 'triangle', 0.08); },
    order() { if (ok('ord', 0.05)) { tone(600, 0.06, 'triangle', 0.08); tone(900, 0.08, 'triangle', 0.08, 1, 0.05); } },
    event(id) {
      if (!ok('event', 0.5)) return;
      if (id === 'wrath') { tone(70, 2, 'sawtooth', 0.2, 0.6); noise(1.8, 0.35, 220, 0.4); }
      else if (id === 'betrayal') { [392, 370, 311, 247].forEach((f, k) => tone(f, 0.35, 'sawtooth', 0.12, 1, k * 0.16)); }
      else if (id === 'breach' || id === 'keep') { noise(1.2, 0.5, 150, 0.5); tone(50, 0.9, 'sine', 0.35, 0.5); }
      else if (id === 'relief' || id === 'held') { [392, 523, 659].forEach((f, k) => tone(f, 0.4, 'sawtooth', 0.08, 1, k * 0.18)); }
      else if (id === 'curse') { tone(110, 1.2, 'sine', 0.2, 0.5); tone(165, 1.2, 'sine', 0.12, 0.5); }
      else { noise(1.4, 0.3, 700, 0.3); tone(150, 0.8, 'triangle', 0.15, 0.7); }
    },
    win() { if (ok('win', 1)) [523, 659, 784, 1047].forEach((f, k) => tone(f, 0.35, 'triangle', 0.15, 1, k * 0.13)); },
    lose() { if (ok('win', 1)) [392, 330, 262].forEach((f, k) => tone(f, 0.4, 'triangle', 0.12, 1, k * 0.18)); },
  };
  HB.Audio = { unlock, SFX, setMuted(m) { muted = m; }, get muted() { return muted; } };
})(typeof window !== 'undefined' ? window : globalThis);
