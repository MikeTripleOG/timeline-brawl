/* Timeline Brawl v3 — online play without a backend.
   Rooms, campaign turns and WebRTC signaling ride on public ntfy.sh topics (tbrawl3-<CODE>).
   The host is authoritative: guests send orders / battle results, the host resolves and broadcasts the
   compressed state with a hash. Human-vs-human battles run as deterministic lockstep over a WebRTC
   DataChannel (host relays and stamps input frames); if no DataChannel opens, frames fall back to ntfy
   in 10-second segments (orders phase, then play out). Nothing secret is stored or sent. */
(function (G) {
  'use strict';
  const HB = G.HB, C = HB.Campaign;
  const NTFY = 'https://ntfy.sh/';
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  const LS = { L: 3, D: 5 };          // DataChannel lockstep: a frame every 3 ticks (150 ms), input delay 5 ticks (250 ms)
  const FB = { L: 200, D: 200 };      // ntfy fallback: 10 s segments
  const rid = (n) => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
  const b64 = (buf) => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function pack(obj) {
    const str = JSON.stringify(obj);
    if (!G.CompressionStream || str.length < 300) return 'j' + str;
    const buf = await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return 'z' + b64(buf);
  }
  async function unpack(s) {
    if (s[0] === 'j') return JSON.parse(s.slice(1));
    if (s[0] !== 'z') return null;
    return JSON.parse(await new Response(new Blob([unb64(s.slice(1))]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text());
  }
  const slim = (st) => { const c = Object.assign({}, st); c.log = st.log.slice(-14); return c; };

  // local test relay keeps each tab's room record separate (tabs share localStorage)
  const STORE = () => /[?&]relay=local/.test(location.search) ? sessionStorage : localStorage;
  // ---------- relay: ntfy.sh topic (or BroadcastChannel with ?relay=local for offline testing) ----------
  class Relay {
    constructor(code, onMsg, onOpen) {
      this.topic = 'tbrawl3-' + code; this.onMsg = onMsg; this.q = Promise.resolve(); this.parts = {}; this.sent = 0;
      if (/[?&]relay=local/.test(location.search) && G.BroadcastChannel) {
        this.bc = new BroadcastChannel(this.topic); this.bc.onmessage = (e) => this.recv(e.data); setTimeout(() => onOpen && onOpen(), 0);
      } else {
        this.es = new EventSource(NTFY + this.topic + '/sse');
        this.es.onmessage = (e) => { try { const m = JSON.parse(e.data); if (m.event === 'message' && m.message) this.recv(m.message); } catch (err) { /* not ours */ } };
        this.es.onopen = () => onOpen && onOpen();
      }
    }
    recv(text) { this.q = this.q.then(async () => { let o = await unpack(text); if (!o) return;
      if (o.t === 'part') { const p = this.parts[o.id] = this.parts[o.id] || []; p[o.i] = o.d; if (p.filter(Boolean).length < o.n) return; delete this.parts[o.id]; o = await unpack(p.join('')); }
      this.onMsg(o); }).catch((e) => console.warn('relay', e)); }
    async send(obj) {
      const body = await pack(obj); const chunks = [];
      if (body.length > 3500) { const id = rid(6), n = Math.ceil(body.length / 3000); for (let i = 0; i < n; i++) chunks.push('j' + JSON.stringify({ t: 'part', id, i, n, d: body.slice(i * 3000, (i + 1) * 3000) })); }
      else chunks.push(body);
      for (const c of chunks) {
        this.sent++;
        if (this.bc) { this.bc.postMessage(c); this.recv(c); continue; }
        try { const r = await fetch(NTFY + this.topic, { method: 'POST', body: c }); if (r.status === 429) throw new Error('ntfy rate limit — wait a minute'); }
        catch (e) { this.onMsg({ t: '_err', msg: String(e.message || e) }); }
      }
    }
    close() { if (this.es) this.es.close(); if (this.bc) this.bc.close(); }
  }

  // ---------- lockstep battle controller ----------
  // host: every L ticks emits frame {f: seq, at: tick, c: cmds stamped k = at + D}; guests may simulate up to (last.at + L + D)
  class Lock {
    constructor(sess, p, opts) { this.s = sess; this.p = p; this.host = sess.isHost; this.links = []; this.frames = []; this.inbox = []; this.out = []; this.acc = 0; this.lastF = -1; this.nextAt = 0; this.acks = {}; this.hashes = {}; this.L = LS.L; this.D = LS.D; this.ready = false; this.flushT = 0; this.rqT = 0; this.closed = false; this.peers = opts.peers || []; this.fallback = false; }
    attach(b, rebuild) { this.b = b; this.rebuild = rebuild; if (this.host) this.ready = true; }
    setMode(fb) { if (this.fallback) return; this.fallback = !!fb; if (fb && this.host) { this.L = FB.L; this.D = FB.D; } }
    send(c) { const o = Object.assign({}, c); for (const k of ['x', 'y', 'f']) if (o[k] != null) o[k] = Math.round(o[k]); if (this.host) this.inbox.push(o); else this.out.push(o); }
    open(cid) { return this.links.find(l => (!cid || l.cid === cid) && l.dc && l.dc.readyState === 'open'); }
    tx(obj, to) {
      if (this.host) {
        for (const c of (to ? [to] : this.peers)) { const l = this.open(c); if (l) l.dc.send(JSON.stringify(obj)); else if (this.fallback) this.s.relay.send({ t: 'ls', p: this.p, to: c, from: this.s.cid, m: obj }); }
        return;
      }
      const l = this.open(); if (l) l.dc.send(JSON.stringify(obj)); else this.s.relay.send({ t: 'ls', p: this.p, to: '', from: this.s.cid, m: obj });
    }
    rx(m, from) {
      if (this.closed) return;
      if (this.host) {
        if (m.i) for (const c of m.i) this.inbox.push(c);
        if (m.ack != null) this.acks[from] = m.ack;
        if (m.rq) { this.tx({ rs: { frames: this.frames } }, from); this.acks[from] = 0; }
        return;
      }
      if (m.rs) return this.resync(m.rs);
      if (m.f == null || !this.ready) return;
      if (m.f !== this.lastF + 1) { if (m.f > this.lastF + 1) this.ask(); return; }
      this.take(m, this.b);
    }
    take(m, b) { this.frames.push(m); this.lastF = m.f; if (m.c.length) b.feed(m.c); if (m.h) this.hashes[m.h[0]] = m.h[1]; this.L = m.L || LS.L; this.D = m.D || LS.D; }
    ask() { const now = Date.now(); if (now - this.rqT < 3000) return; this.rqT = now; this.ready = false; this.tx({ rq: 1 }); }
    resync(rs) { // rebuild the battle from the start and replay every frame (join, rejoin or desync)
      const b = this.rebuild(); this.frames = []; this.lastF = -1; this.hashes = {};
      for (const f of rs.frames) this.take(f, b);
      this.b = b; this.ready = true; this.rqT = 0; this.s.syncs = (this.s.syncs || 0) + 1; this.s.emit('replace', b);
    }
    limit() { const f = this.frames[this.frames.length - 1]; return f ? f.at + (f.L || LS.L) + (f.D || LS.D) : -1; }
    pump(dt) {
      const b = this.b; if (!b || this.closed) return;
      const DT = HB.WORLD.DT;
      if (this.host) {
        const minAck = this.peers.length ? Math.min(...this.peers.map(c => this.acks[c] == null ? 0 : this.acks[c])) : b.tick;
        this.waiting = !this.ready || b.tick - minAck > (this.fallback ? 3 * this.L : 60);
        if (this.waiting) return;
        const rate = HB.Net.rate || 1; this.acc += dt * rate; let n = 0;
        while (this.acc >= DT && n++ < 6 * rate && !b.over) {
          if (b.tick >= this.nextAt) {
            const k = b.tick + this.D, c = this.inbox.splice(0).map(x => Object.assign(x, { k }));
            const fr = { f: this.lastF + 1, at: b.tick, c }; if (fr.f % (this.fallback ? 1 : 12) === 0) fr.h = [b.tick, b.hash()];
            if (this.L !== LS.L) { fr.L = this.L; fr.D = this.D; }
            this.frames.push(fr); this.lastF = fr.f; this.nextAt = b.tick + this.L; if (c.length) b.feed(c); this.tx(fr);
          }
          b.step(); this.acc -= DT;
        }
        if (n >= 6 * rate) this.acc = 0;
        if (b.over && !this.endSent) { this.endSent = true; const fr = { f: this.lastF + 1, at: b.tick, c: [], h: [b.tick, b.hash()], end: 1 }; this.frames.push(fr); this.lastF = fr.f; this.tx(fr); }
        return;
      }
      if (this.ready) {
        const lim = this.limit(); this.acc += dt * (HB.Net.rate || 1); let n = 0; const behind = lim - b.tick > 2 * (this.L + this.D) + 4;
        while ((behind ? n < 40 : this.acc >= DT && n < 6 * (HB.Net.rate || 1)) && b.tick < lim && !b.over) {
          const h0 = this.hashes[b.tick];
          if (h0 != null) { delete this.hashes[b.tick]; if (b.hash() !== h0) { this.s.desyncs = (this.s.desyncs || 0) + 1; this.s.emit('status', 'Desync at tick ' + b.tick + ' — resyncing'); this.ask(); return; } this.s.hashOk = (this.s.hashOk || 0) + 1; }
          b.step(); if (!behind) this.acc -= DT; n++;
        }
        if (this.acc > 0.3 * (HB.Net.rate || 1)) this.acc = 0.3 * (HB.Net.rate || 1);
      }
      this.flushT -= dt;
      const dc = !!this.open();
      if ((this.out.length && dc) || this.flushT <= 0) { this.tx({ i: this.out.splice(0), ack: b.tick }); this.flushT = dc ? 0.25 : 8; }
    }
    close() { this.closed = true; for (const l of this.links) { try { l.dc && l.dc.close(); l.pc && l.pc.close(); } catch (e) { /* closing */ } } this.links = []; if (this.s.lock === this) this.s.lock = null; }
  }

  // ---------- session ----------
  class Session {
    constructor(o) {
      this.code = o.code; this.isHost = !!o.host; this.seat = o.seat != null ? o.seat : -1; this.name = o.name || (this.isHost ? 'Host' : 'Guest');
      const key = 'tb3-room-' + this.code; let rec = null; try { rec = JSON.parse(STORE().getItem(key) || 'null'); } catch (e) { rec = null; }
      if (rec && rec.cid && rec.host === this.isHost) { this.cid = rec.cid; if (rec.seat != null && this.seat < 0) this.seat = rec.seat; } else this.cid = rid(8);
      this.key = key; this.ev = {}; this.lobby = { seats: {}, cids: {} }; this.st = null; this.lock = null; this.status = 'Connecting to the relay…';
      if (this.isHost) { this.lobby.seats[this.seat] = this.name; this.lobby.cids[this.seat] = this.cid; if (rec && rec.st) { this.st = rec.st; this.lobby = rec.lobby || this.lobby; } }
      this.remember();
      this.relay = new Relay(this.code, (m) => this.onMsg(m), () => this.onOpen());
    }
    on(e, f) { (this.ev[e] = this.ev[e] || []).push(f); }
    emit(e, a) { for (const f of this.ev[e] || []) try { f(a); } catch (err) { console.error(err); } }
    setStatus(t) { this.status = t; this.emit('status', t); }
    remember() { try { STORE().setItem(this.key, JSON.stringify({ cid: this.cid, host: this.isHost, seat: this.seat, st: this.isHost ? this.st : null, lobby: this.isHost ? this.lobby : null })); } catch (e) { /* storage blocked */ } }
    send(o) { o.from = this.cid; return this.relay.send(o); }
    onOpen() {
      this.setStatus(this.isHost ? 'Room open. Waiting for a friend…' : 'Connected. Asking the host…');
      if (this.isHost) { this.send({ t: 'lobby', lobby: this.lobby }); if (this.st) this.broadcast(); this.emit('lobby'); }
      else this.send({ t: 'hello', name: this.name });
    }
    // ----- host side -----
    pickSeat(seat) {
      if (this.isHost) return;
      this.send({ t: 'seat', seat, name: this.name });
    }
    start() {
      if (!this.isHost || this.st) return;
      const seats = HB.KINGDOMS.map((k, i) => ({ cmd: i === this.seat ? 'human' : this.lobby.seats[i] != null ? 'net' : 'ai' }));
      this.st = C.create({ seed: (Math.random() * 1e9) >>> 0, seats });
      this.broadcast();
    }
    async broadcast() {
      const st = this.st; this.remember();
      this.emit('state', st);
      await this.send({ t: 'state', st: slim(st), h: C.hash(st), lobby: this.lobby });
      if (st.phase === 'battles') this.nextH2H();
    }
    submit(orders) {
      if (this.isHost) { if (this.st.phase !== 'orders') return; C.submit(this.st, this.seat, orders); this.checkReady(); return; }
      const msg = { t: 'orders', seat: this.seat, turn: this.st.turn, o: orders, h: C.hash(this.st) }, turn = this.st.turn;
      this.send(msg);
      // the relay can drop a message: re-send the sealed orders until the next turn's state arrives (the host ignores duplicates / answers with its state)
      clearInterval(this.rsT); this.rsT = setInterval(() => { if (!this.st || this.st.turn !== turn || this.st.phase !== 'orders') { clearInterval(this.rsT); return; } this.send(msg); }, 15000);
    }
    checkReady() {
      const st = this.st;
      if (st.phase === 'orders' && C.ready(st)) { C.resolve(st); this.broadcast(); }
      else this.send({ t: 'wait', turn: st.turn, have: Object.keys(st.orders).map(Number) });
    }
    reportBattle(p, res) {
      if (this.isHost) { const bt = this.st.battles.find(b => b.p === p && !b.done); if (bt) { C.finishBattle(this.st, bt, res); this.broadcast(); } return; }
      this.send({ t: 'bres', seat: this.seat, turn: this.st.turn, p, res });
    }
    humans(bt) { return bt.sides.filter(f => this.st.seats[f].cmd !== 'ai'); }
    nextH2H() {
      if (this.lock || !this.st || this.st.phase !== 'battles') return;
      const bt = this.st.battles.find(b => !b.done && this.humans(b).length > 1); if (!bt) return;
      const peers = this.humans(bt).map(f => this.lobby.cids[f]).filter(c => c && c !== this.cid);
      const lock = this.lock = new Lock(this, bt.p, { peers }); lock.turn = this.st.turn;
      this.emit('h2h', { p: bt.p, lock });
      for (const c of peers) this.offerTo(lock, c);
      // no DataChannel within 12 s: fall back to ntfy segments
      setTimeout(() => { if (this.lock === lock && !lock.open()) { lock.setMode(true); this.setStatus('Direct link failed — playing in 10 s segments over the relay'); this.send({ t: 'fb', p: bt.p }); lock.ready = true; } }, 12000);
    }
    h2hDone(p, res) { const bt = this.st.battles.find(b => b.p === p && !b.done); this.lock = null; if (bt) { C.finishBattle(this.st, bt, res); this.broadcast(); } }
    async offerTo(lock, cid) {
      if (!G.RTCPeerConnection) return;
      const pc = new RTCPeerConnection({ iceServers: ICE }), dc = pc.createDataChannel('ls', { ordered: true });
      const link = { cid, pc, dc }; lock.links = lock.links.filter(l => l.cid !== cid).concat([link]);
      dc.onopen = () => this.setStatus('Direct link open');
      dc.onmessage = (e) => { try { lock.rx(JSON.parse(e.data), cid); } catch (err) { console.warn(err); } };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      this.send({ t: 'sdp', to: cid, p: lock.p, kind: 'offer', sdp: pc.localDescription.sdp, turn: this.st.turn });
    }
    // ----- incoming -----
    async onMsg(m) {
      if (m.t === '_err') { this.emit('error', m.msg); return; }
      if (m.from === this.cid) return;
      if (this.isHost) return this.hostMsg(m);
      return this.guestMsg(m);
    }
    hostMsg(m) {
      const L = this.lobby;
      const seatOf = (cid) => { for (const s in L.cids) if (L.cids[s] === cid) return +s; return -1; };
      switch (m.t) {
        case 'hello': case 'sync': {
          this.send({ t: 'lobby', lobby: L });
          if (this.st) { this.send({ t: 'state', st: slim(this.st), h: C.hash(this.st), lobby: L, to: m.from }); if (this.lock && this.lock.peers.includes(m.from)) { this.send({ t: 'h2h', p: this.lock.p, to: m.from }); this.offerTo(this.lock, m.from); } }
          break; }
        case 'seat': {
          if (this.st) break; const s = m.seat | 0;
          if (s < 0 || s > 5 || L.seats[s] != null) break;
          const old = seatOf(m.from); if (old >= 0) { delete L.seats[old]; delete L.cids[old]; }
          L.seats[s] = m.name || 'Guest'; L.cids[s] = m.from; this.remember();
          this.send({ t: 'lobby', lobby: L }); this.emit('lobby'); this.setStatus(HB.KINGDOMS[s].name + ' has joined.'); break; }
        case 'orders': {
          const s = seatOf(m.from); if (s < 0 || !this.st || m.turn !== this.st.turn || this.st.phase !== 'orders') { if (this.st) this.send({ t: 'state', st: slim(this.st), h: C.hash(this.st), lobby: L, to: m.from }); break; }
          if (m.h !== C.hash(this.st)) this.send({ t: 'state', st: slim(this.st), h: C.hash(this.st), lobby: L, to: m.from }); // their view was stale: resync, but their orders still count
          C.submit(this.st, s, m.o); this.remember(); this.checkReady(); break; }
        case 'bres': {
          const s = seatOf(m.from); if (s < 0 || !this.st || m.turn !== this.st.turn) break;
          const bt = this.st.battles.find(b => b.p === m.p && !b.done && b.sides.includes(s) && this.humans(b).length === 1);
          if (bt) { C.finishBattle(this.st, bt, m.res); this.broadcast(); } break; }
        case 'sdp': if (m.kind === 'answer' && this.lock) { const l = this.lock.links.find(x => x.cid === m.from); if (l) l.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp }).catch((e) => console.warn(e)); } break;
        case 'ls': if (this.lock && m.p === this.lock.p) this.lock.rx(m.m, m.from); break;
      }
    }
    guestMsg(m) {
      if (m.to && m.to !== this.cid) return;
      switch (m.t) {
        case 'lobby': {
          this.lobby = m.lobby; let s = -1; for (const k in m.lobby.cids) if (m.lobby.cids[k] === this.cid) s = +k;
          if (s !== this.seat) { this.seat = s; this.remember(); }
          if (this.seat >= 0 && !this.st) this.setStatus('You rule ' + HB.KINGDOMS[this.seat].name + '. Waiting for the host to begin…');
          this.emit('lobby'); break; }
        case 'state': {
          if (m.lobby) { this.lobby = m.lobby; for (const k in m.lobby.cids) if (m.lobby.cids[k] === this.cid) this.seat = +k; }
          if (this.seat < 0) break;
          if (C.hash(m.st) !== m.h) { this.send({ t: 'sync' }); break; }
          this.hashChecks = (this.hashChecks || 0) + 1;
          this.st = m.st; this.remember(); this.emit('state', this.st); break; }
        case 'wait': if (this.st && m.turn === this.st.turn) this.setStatus('Waiting for ' + (6 - m.have.length) + ' seat(s)…'); break;
        case 'h2h': this.prepLock(m.p); break;
        case 'fb': { const lk = this.prepLock(m.p); if (lk && !lk.open()) { lk.setMode(true); lk.rqT = 0; lk.ask(); } break; }
        case 'sdp': if (m.kind === 'offer') this.answer(m); break;
        case 'ls': if (this.lock && m.p === this.lock.p && (!m.to || m.to === this.cid)) this.lock.rx(m.m, m.from); break;
      }
    }
    prepLock(p) {
      if (this.lock && this.lock.p === p && !this.lock.closed) return this.lock;
      if (!this.st) return null;
      const lock = this.lock = new Lock(this, p, {}); lock.turn = this.st.turn;
      this.emit('h2h', { p, lock });
      setTimeout(() => { if (this.lock === lock && !lock.ready && !lock.open()) { lock.setMode(true); lock.rqT = 0; lock.ask(); } }, 14000);
      return lock;
    }
    async answer(m) {
      if (!G.RTCPeerConnection) return;
      const lock = this.prepLock(m.p); if (!lock) return;
      const pc = new RTCPeerConnection({ iceServers: ICE }); const link = { cid: m.from, pc, dc: null };
      lock.links = [link];
      pc.ondatachannel = (e) => { const dc = link.dc = e.channel; dc.onopen = () => { this.setStatus('Direct link open'); lock.rqT = 0; lock.ask(); }; dc.onmessage = (ev) => { try { lock.rx(JSON.parse(ev.data), m.from); } catch (err) { console.warn(err); } }; };
      await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      this.send({ t: 'sdp', to: m.from, p: m.p, kind: 'answer', sdp: pc.localDescription.sdp });
    }
    close() { if (this.lock) this.lock.close(); this.relay.close(); this.closed = true; }
  }
  function gathered(pc) { return new Promise((res) => { if (pc.iceGatheringState === 'complete') return res(); const t = setTimeout(res, 3000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); }); }

  HB.Net = {
    host(o) { return new Session({ code: o.code || rid(5), host: true, seat: o.seat, name: o.name }); },
    join(o) { // a host that reloads its tab resumes as host from local storage
      let rec = null; try { rec = JSON.parse(STORE().getItem('tb3-room-' + o.code) || 'null'); } catch (e) { rec = null; }
      if (rec && rec.host) return new Session({ code: o.code, host: true, seat: rec.seat, name: 'Host' });
      return new Session({ code: o.code, host: false, name: o.name });
    },
    Lock, pack, unpack,
  };
})(window);
