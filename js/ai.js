// ============================================================
// ai.js — RELOAD AI. INTERIM greedy pass-bot (parachute, loot, move
// toward tokens, end). Full Solo-Mode automa is task #6 (combat,
// priority loop, target/movement priority, end-phase hideout).
// Operates purely on engine state (RL.engine), no DOM.
// ============================================================
(function (root) {
  "use strict";
  function takeTurn(state) {
    const E = root.RL.engine;
    const p = E.curP(state);
    if (state.needsParachute) {
      const opts = E.legalParachute(state);
      E.parachute(state, opts[Math.floor(state.rnd() * opts.length)]);
    }
    let guard = 0;
    while (!state.gameOver && E.curP(state) === p && p.defensePool > 0 && guard++ < 30) {
      // priority (Solo Mode): close > ranged > loot > move toward tokens
      const close = E.closeTargets(state, p);
      if (close.length) { E.doClose(state, close[0]); break; }   // close ends turn
      const ranged = E.rangedTargets(state, p);
      if (ranged.length) { E.doRanged(state, ranged[0]); continue; }
      if (p.injuries >= 2 && E.canHeal(state, p)) { E.doHeal(state); continue; }
      if (E.lootOptions(state, p).length) { E.doLoot(state, 0); continue; }
      // carrying beacons: head to the Central Tower and upload them for fame
      if (p.carryingBeacons > 0) {
        if (E.canUpload(state, p)) { E.doActivate(state); continue; }
        const step = E.bfsStep(state, p, E.towerKey(state));
        if (step && E.legalRuns(state, p).includes(step)) { E.doRun(state, step); continue; }
      }
      const runs = E.legalRuns(state, p);
      if (!runs.length) break;
      const target = runs.find(k => state.board[k].tokens.length) ||
                     runs[Math.floor(state.rnd() * runs.length)];
      if (!E.doRun(state, target)) break;
    }
    E.endTurn(state);
  }
  const AI = { takeTurn };
  if (typeof module !== "undefined" && module.exports) module.exports = AI;
  root.RL = Object.assign(root.RL || {}, { ai: AI });
})(typeof globalThis !== "undefined" ? globalThis : this);
