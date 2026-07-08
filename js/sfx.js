// ============================================================
// sfx.js — tiny PROCEDURAL sound effects via the Web Audio API. No audio files:
// every sound is synthesized from noise bursts + oscillators shaped by gain
// envelopes and filters (technique per MDN / web.dev game-audio / ZzFX). Keeps the
// project asset-free. Browser-only (no-ops where Web Audio is unavailable, e.g. Node).
// Exposes RL.sfx with one method per game action + mute toggle + volume (persisted).
// Craft notes (web.dev game-audio): every trigger is humanized (±6% pitch, ±20% gain)
// so no repeat is bit-identical; a master DynamicsCompressor keeps stacked bursts from
// clipping; identical sounds within ~90ms are throttled (skip-speed machine-guns them).
// ============================================================
(function (root) {
  "use strict";
  let ctx = null, master = null;
  let muted = false, volume = 0.5;
  try { muted = localStorage.getItem("rl-mute") === "1"; const v = parseFloat(localStorage.getItem("rl-vol")); if (v >= 0 && v <= 1) volume = v; } catch (e) { }

  function ensure() {
    if (typeof window === "undefined") return null;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = volume;
      const comp = ctx.createDynamicsCompressor();   // defaults are tuned for game-UI sound stacking
      master.connect(comp); comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  // browsers block audio until a user gesture — create/resume the context on the first interaction
  if (typeof window !== "undefined") {
    const unlock = () => ensure();
    ["pointerdown", "keydown", "touchstart"].forEach(e => window.addEventListener(e, unlock, { passive: true }));
  }

  const hum = (v, pct) => v * (1 + (Math.random() * 2 - 1) * pct);   // humanize: no two triggers identical
  function env(g, t, a, peak, d) {   // gain envelope: ramp up to `peak` over `a`, exp-decay to ~0 over `d`
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(0.001, peak), t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function noise(dur) {             // a white-noise buffer source
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; return s;
  }
  // shaped noise burst: connect noise -> filter -> gain(env) -> master
  function burst(t, dur, { type = "lowpass", f0 = 1500, f1 = f0, q = 0, peak = 0.6, atk = 0.002, dec = dur } = {}) {
    const s = noise(dur), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    const h0 = hum(f0, 0.06), h1 = f1 === f0 ? h0 : hum(f1, 0.06);
    flt.type = type; flt.frequency.setValueAtTime(h0, t); if (h1 !== h0) flt.frequency.exponentialRampToValueAtTime(Math.max(20, h1), t + dur); if (q) flt.Q.value = q;
    s.connect(flt); flt.connect(g); g.connect(master); env(g.gain, t, atk, hum(peak, 0.2), dec);
    s.start(t); s.stop(t + dur + 0.02);
  }
  // tone with optional pitch slide: osc -> gain(env) -> master
  function tone(t, dur, { type = "sine", f0 = 440, f1 = f0, slide = "exp", peak = 0.4, atk = 0.004, dec = dur } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const h0 = hum(f0, 0.06), h1 = f1 === f0 ? h0 : hum(f1, 0.06);
    o.type = type; o.frequency.setValueAtTime(h0, t);
    if (h1 !== h0) { if (slide === "lin") o.frequency.linearRampToValueAtTime(h1, t + dur); else o.frequency.exponentialRampToValueAtTime(Math.max(20, h1), t + dur); }
    o.connect(g); g.connect(master); env(g.gain, t, atk, hum(peak, 0.2), dec);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function play(fn) { if (muted || !ensure()) return; try { fn(ctx.currentTime); } catch (e) { /* never let audio break the game */ } }

  const SFX = {
    get muted() { return muted; },
    set muted(v) { muted = !!v; try { localStorage.setItem("rl-mute", muted ? "1" : "0"); } catch (e) { } },
    toggle() { this.muted = !muted; if (!muted) ensure(); return muted; },
    get volume() { return volume; },
    set volume(v) {
      volume = Math.max(0, Math.min(1, +v || 0));
      if (master) master.gain.value = volume;
      try { localStorage.setItem("rl-vol", String(volume)); } catch (e) { }
    },

    dice()      { play(t => burst(t, 0.05, { type: "highpass", f0: 2000, peak: 0.4, dec: 0.05 })); },                 // a die clack
    shoot()     { play(t => { burst(t, 0.18, { f0: 2600, f1: 380, peak: 0.95, dec: 0.16 }); tone(t, 0.1, { type: "square", f0: 430, f1: 90, peak: 0.4, dec: 0.1 }); }); },
    explosion() { play(t => { burst(t, 0.6, { f0: 1300, f1: 120, peak: 1.0, atk: 0.005, dec: 0.55 }); tone(t, 0.5, { type: "sine", f0: 95, f1: 32, peak: 0.85, dec: 0.5 }); }); },
    melee()     { play(t => { tone(t, 0.14, { type: "sine", f0: 190, f1: 60, peak: 0.8, dec: 0.14 }); burst(t, 0.08, { type: "bandpass", f0: 1300, q: 1, peak: 0.5, dec: 0.08 }); }); },
    reload()    { play(t => { tone(t, 0.55, { type: "sawtooth", f0: 720, f1: 70, peak: 0.7, dec: 0.55 }); burst(t, 0.5, { f0: 900, peak: 0.55, dec: 0.5 }); }); },
    parachute() { play(t => burst(t, 0.5, { type: "bandpass", f0: 380, f1: 950, q: 1.4, peak: 0.5, atk: 0.15, dec: 0.4 })); },
    build()     { play(t => { tone(t, 0.13, { type: "triangle", f0: 170, f1: 80, peak: 0.7, dec: 0.13 }); burst(t, 0.05, { f0: 1200, peak: 0.3, dec: 0.05 }); }); },
    mine()      { play(t => tone(t, 0.08, { type: "square", f0: 900, peak: 0.25, dec: 0.07 })); },                    // a placed/armed beep
    heal()      { play(t => tone(t, 0.24, { type: "sine", f0: 440, f1: 760, slide: "lin", peak: 0.4, atk: 0.01, dec: 0.22 })); },
    move()      { play(t => burst(t, 0.06, { type: "lowpass", f0: 520, peak: 0.3, dec: 0.06 })); },                   // a footstep tick
    loot()      { play(t => tone(t, 0.13, { type: "square", f0: 520, f1: 900, slide: "lin", peak: 0.3, dec: 0.12 })); },
    upload()    { play(t => [523, 659, 784].forEach((f, i) => tone(t + i * 0.08, 0.14, { type: "triangle", f0: f, peak: 0.32, dec: 0.13 }))); },
    throwItem() { play(t => burst(t, 0.3, { type: "bandpass", f0: 1200, f1: 300, q: 2, peak: 0.45, atk: 0.02, dec: 0.28 })); },
    win()       { play(t => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, 0.2, { type: "square", f0: f, peak: 0.4, dec: 0.18 }))); },
    turn()      { play(t => [659, 988].forEach((f, i) => tone(t + i * 0.1, 0.22, { type: "triangle", f0: f, peak: 0.34, atk: 0.012, dec: 0.2 }))); }, // gentle "it's your turn" chime
    buzz()      { play(t => tone(t, 0.17, { type: "square", f0: 220, f1: 110, slide: "lin", peak: 0.38, atk: 0.004, dec: 0.16 })); },               // invalid / not-allowed action
    lose()      { play(t => { [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.13, 0.24, { type: "sawtooth", f0: f, peak: 0.32, dec: 0.22 })); tone(t, 0.7, { type: "sine", f0: 110, f1: 66, peak: 0.4, atk: 0.02, dec: 0.66 }); }); }, // defeat: descending minor + low swell
    achievement() { play(t => { [784, 1047, 1319].forEach((f, i) => tone(t + i * 0.07, 0.16, { type: "triangle", f0: f, peak: 0.34, dec: 0.15 })); tone(t + 0.21, 0.3, { type: "sine", f0: 1568, peak: 0.22, atk: 0.005, dec: 0.28 }); }); },  // bright unlock bell + sparkle
    event()     { play(t => { burst(t, 0.18, { type: "highpass", f0: 1900, peak: 0.4, atk: 0.004, dec: 0.16 }); tone(t + 0.08, 0.2, { type: "triangle", f0: 392, f1: 587, slide: "lin", peak: 0.3, dec: 0.18 }); }); }, // card-flip whoosh + reveal
    score()     { play(t => [988, 1319].forEach((f, i) => tone(t + i * 0.09, 0.13, { type: "square", f0: f, peak: 0.3, dec: 0.12 }))); },           // coin-drop "you banked points"
    airdrop()   { play(t => { tone(t, 0.5, { type: "sawtooth", f0: 180, f1: 140, peak: 0.4, dec: 0.5 }); tone(t + 0.18, 0.55, { type: "sawtooth", f0: 240, f1: 175, peak: 0.34, dec: 0.5 }); burst(t + 0.5, 0.5, { type: "bandpass", f0: 450, f1: 1200, q: 1.2, peak: 0.42, atk: 0.14, dec: 0.36 }); }); },   // supply-drop horn + chute whoosh
  };

  // rate-limit identical sounds (fast-forwarded AI turns fire loot/move/dice in machine-gun bursts).
  // Impact/moment sounds keep a longer window than ticks; win/lose/turn are once-a-moment anyway.
  const THROTTLE_MS = { airdrop: 400, dice: 45, move: 60, loot: 80, build: 80, heal: 80, mine: 80, shoot: 70, melee: 70, event: 120, score: 100, upload: 150, achievement: 200, reload: 120, explosion: 100, buzz: 120, parachute: 150, throwItem: 100, turn: 250, win: 400, lose: 400 };
  const lastAt = {};
  for (const k of Object.keys(THROTTLE_MS)) {
    const orig = SFX[k].bind(SFX), lim = THROTTLE_MS[k];
    SFX[k] = function () {
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      if (lastAt[k] != null && now - lastAt[k] < lim) return;
      lastAt[k] = now; orig();
    };
  }

  root.RL = Object.assign(root.RL || {}, { sfx: SFX });
})(typeof globalThis !== "undefined" ? globalThis : this);
