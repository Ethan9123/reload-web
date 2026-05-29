// ============================================================
// ai.js — RELOAD Solo-Mode automa. A faithful priority bot that plays a full
// turn: parachute toward objectives, opportunistic free items, combat (target
// the enemy closest to RELOAD), heal, upload/loot beacons, move toward the best
// objective (avoiding toxin), and light building. Team-aware (engine excludes
// teammates from combat; heals self/teammate). Pure engine state, no DOM.
// ============================================================
(function (root) {
  "use strict";

  // ---- small helpers (operate via the engine API) ----
  function tokenHexes(E, state, kind) {
    const out = [];
    for (const k in state.board) if (state.board[k].tokens.some(t => t.kind === kind)) out.push(k);
    return out;
  }
  function cellOf(state, key) { return state.board[key]; }
  // owner of a structure targeted by Tactical Explosive (trap owner lives on the cell; hideout carries owner)
  function structOwner(state, t) { return t.kind === "trap" ? cellOf(state, t.key).trap : (t.kind === "hideout" ? t.owner : null); }
  function isEnemyStruct(E, state, p, t) {
    const o = structOwner(state, t);
    if (typeof o !== "number") return false;
    const op = state.players[o];
    return !!op && op !== p && !E.sameTeam(p, op);   // never blow up our own / a teammate's trap or hideout
  }
  function isToxic(E, state, p, key) {
    const c = cellOf(state, key);
    return !!(c && (c.toxin || c.toxinIcon) && !(c.dome || c.hideouts.includes(p.idx)));
  }
  function pickByInjuries(state, idxs) {            // among targets, the one nearest to RELOAD
    let best = null, bi = -1;
    for (const i of idxs) { const inj = state.players[i].injuries; if (inj > bi) { bi = inj; best = i; } }
    return best;
  }
  // nearest target hex (by hex distance) that we can actually path toward
  function nearestTarget(E, state, p, keys) {
    let best = null, bd = Infinity;
    for (const k of keys) {
      const c = cellOf(state, k); if (!c) continue;
      const d = E.hexDistance(p.pos, c);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  // step toward a target hex, preferring legal non-toxic runs; falls back to any legal run
  function stepToward(E, state, p, targetKey) {
    if (!targetKey) return false;
    const runs = E.legalRuns(state, p); if (!runs.length) return false;
    const step = E.bfsStep(state, p, targetKey);
    if (step && runs.includes(step) && !isToxic(E, state, p, step)) return E.doRun(state, step);
    // bfs step blocked/toxic — pick the legal run that most reduces distance to the target and isn't toxic
    const tc = cellOf(state, targetKey);
    let best = null, bd = Infinity;
    for (const k of runs) { if (isToxic(E, state, p, k)) continue; const d = E.hexDistance(cellOf(state, k), tc); if (d < bd) { bd = d; best = k; } }
    if (best) return E.doRun(state, best);
    if (step && runs.includes(step)) return E.doRun(state, step);   // last resort: accept a toxic step toward goal
    return false;
  }

  // ---- parachute toward the richest nearby objective ----
  function doParachute(E, state, p) {
    const opts = E.legalParachute(state);
    const beacons = tokenHexes(E, state, "beacon");
    const score = (key) => {
      const c = cellOf(state, key); let s = 0;
      if (isToxic(E, state, p, key)) s -= 5;
      for (const bk of beacons) s -= E.hexDistance(c, cellOf(state, bk)) * 0.1;   // closer to beacons = better
      return s + state.rnd() * 0.01;
    };
    let best = opts[0], bs = -Infinity;
    for (const k of opts) { const v = score(k); if (v > bs) { bs = v; best = k; } }
    E.parachute(state, best);
  }

  // ---- opportunistic free actions (no action die spent) ----
  function tryFreeItems(E, state, p) {
    const usable = E.usableSpecials ? E.usableSpecials(state, p) : [];
    // Pain Killer when injuries are dangerous (free heal that avoids RELOAD pressure)
    if (p.injuries >= 3 && usable.some(e => e.id === "pain_killer")) return E.useSpecialItem(state, "pain_killer");
    // Tactical Explosive on an adjacent enemy trap (clear our path) or enemy hideout
    if (usable.some(e => e.id === "tactical_explosive")) {
      const tgts = E.explosiveTargets(state, p);
      const trap = tgts.find(t => t.kind === "trap" && isEnemyStruct(E, state, p, t));
      const hideout = tgts.find(t => t.kind === "hideout" && isEnemyStruct(E, state, p, t));
      if (trap) return E.useSpecialItem(state, "tactical_explosive", trap);
      if (hideout) return E.useSpecialItem(state, "tactical_explosive", hideout);
    }
    return false;
  }

  // ---- one action; returns "acted" | "stop" | "idle" ----
  function chooseAction(E, state, p) {
    if (tryFreeItems(E, state, p)) return "acted";

    const close = E.closeTargets(state, p), ranged = E.rangedTargets(state, p);
    const nearDeath = (i) => state.players[i].injuries >= E.INJURY_ZONE - 2;

    // 1) finish an opponent: close combat only when it likely RELOADs (it ends the turn)
    const closeKill = close.filter(nearDeath);
    if (closeKill.length) { E.doClose(state, pickByInjuries(state, closeKill)); return "stop"; }
    // 2) ranged at the enemy nearest to RELOAD (doesn't end the turn)
    if (ranged.length) { E.doRanged(state, pickByInjuries(state, ranged), 3); return "acted"; }

    // 3) heal when hurt and safe (in team mode this also heals an injured teammate sharing the hex)
    if (E.canHeal(state, p)) {
      const ht = E.healTargets(state, p);
      const mate = ht.find(i => i !== p.idx && state.players[i].injuries >= 2);   // prioritise saving a teammate
      if (mate != null) { E.doHeal(state, mate); return "acted"; }
      if (p.injuries >= 3) { E.doHeal(state, p.idx); return "acted"; }
    }

    // 4) upload carried beacons at the tower
    if (p.carryingBeacons > 0 && E.canUpload(state, p)) { E.doActivate(state); return "acted"; }

    // 5) loot a beacon / supply box on this hex
    const loot = E.lootOptions(state, p);
    if (loot.length) {
      const bi = loot.findIndex(t => t.kind === "beacon");
      E.doLoot(state, bi >= 0 ? bi : 0); return "acted";
    }

    // 6) move toward the best objective
    const tower = E.towerKey(state);
    if (p.carryingBeacons > 0) { if (stepToward(E, state, p, tower)) return "acted"; }
    const beacons = tokenHexes(E, state, "beacon");
    if (beacons.length) { if (stepToward(E, state, p, nearestTarget(E, state, p, beacons))) return "acted"; }
    const supplies = tokenHexes(E, state, "supply");
    if (supplies.length) { if (stepToward(E, state, p, nearestTarget(E, state, p, supplies))) return "acted"; }

    // 7) nothing pressing: a weak close attack is still progress (chip damage / injury fame)
    if (close.length) { E.doClose(state, pickByInjuries(state, close)); return "stop"; }

    // 8) idle building: set a hideout (end-phase die back + toxin safety) when safe and none yet
    if (E.canBuild(state, p) && !p.hideout) { if (E.doBuildHideout(state)) return "acted"; }

    // 9) no objective to pursue — stop and keep the remaining dice (they become combat-line defense
    //    dice at End Phase, which is better than wandering them away).
    return "idle";
  }

  function takeTurn(state) {
    const E = root.RL.engine;
    const p = E.curP(state);
    if (state.needsParachute) doParachute(E, state, p);
    let guard = 0;
    // keep acting while dice remain — or while Blitz has an unspent bonus follow-up step (Fastest There Is)
    const canAct = () => p.defensePool > 0 || (p.character === "blitz" && p._runBonus && !p._runBonusUsed);
    while (!state.gameOver && E.curP(state) === p && canAct() && guard++ < 40) {
      const r = chooseAction(E, state, p);
      if (r === "stop" || r === "idle") break;     // close combat ended the turn, or nothing useful left
    }
    if (!state.gameOver && E.curP(state) === p) E.endTurn(state);
  }

  const AI = { takeTurn };
  if (typeof module !== "undefined" && module.exports) module.exports = AI;
  root.RL = Object.assign(root.RL || {}, { ai: AI });
})(typeof globalThis !== "undefined" ? globalThis : this);
