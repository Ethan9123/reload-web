// ============================================================
// ai.js — RELOAD Solo-Mode automa. A faithful priority bot that plays a full
// turn: parachute toward objectives, opportunistic free items, combat (target
// the enemy closest to RELOAD), heal, upload/loot beacons, move toward the best
// objective (avoiding toxin), and light building. Team-aware (engine excludes
// teammates from combat; heals self/teammate). Pure engine state, no DOM.
// ============================================================
(function (root) {
  "use strict";

  // ---- persona traits (0..1) that bend the automa's decisions; missing keys fall back to DEF ----
  const DEF = { aggression: .5, frag: .3, objective: .6, caution: .5, loot: .4, build: .2, diplomacy: .4, betray: .3, vendetta: .3, leaderHunt: .4, trash: .3 };
  function T(p, k) { const t = p.persona && p.persona.traits; return (t && t[k] != null) ? t[k] : (DEF[k] != null ? DEF[k] : .5); }

  // ---- skill policy (difficulty): decision thresholds + a blunder rate. Separate from persona STYLE.
  // Defaults below = the hand-tuned "medium" bot. p.policy (set per difficulty, or by the self-play trainer)
  // overrides any subset of these keys. ----
  const DEFAULT_POLICY = { healBase: 4, healCautionK: 2, healMin: 2, rangedAggro: 0.35, closeAggro: 0.5, rushAggro: 0.7, buildTrap: 0.7, blunder: 0 };
  function POL(p, k) { const v = p.policy && p.policy[k]; return (v != null) ? v : DEFAULT_POLICY[k]; }

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

  // honor a truce — backstabbers ignore it, the loyal never break it, others only to finish the (near-)leader
  function attackable(E, state, p, idx) {
    if (!E.hasTruce || !E.hasTruce(state, p.idx, idx)) return true;
    const betray = T(p, "betray");
    if (betray >= 0.6) return true;
    if (betray <= 0.05) return false;
    const leaderFame = Math.max(...state.players.map(x => E.totalFame(x)));
    return E.totalFame(state.players[idx]) >= leaderFame && state.players[idx].injuries >= E.INJURY_ZONE - 2;
  }
  // choose a target by persona: vendetta > focus pact > leader-hunt > frag (nearest to RELOAD)
  function pickTarget(E, state, p, idxs) {
    if (!idxs.length) return null;
    if (T(p, "vendetta") >= 0.7 && p._lastAttacker != null && idxs.includes(p._lastAttacker)) return p._lastAttacker;
    const focus = state.diplomacy && state.diplomacy.focus;
    if (focus != null && idxs.includes(focus)) return focus;
    if (T(p, "leaderHunt") >= 0.6) { let best = null, bf = -1; for (const i of idxs) { const f = E.totalFame(state.players[i]); if (f > bf) { bf = f; best = i; } } if (best != null) return best; }
    return pickByInjuries(state, idxs);
  }
  // once-per-turn table talk, scaled by the persona's diplomacy/trash traits
  function runDiplomacy(E, state, p) {
    const d = state.diplomacy;
    if (!d || !E.proposeTruce || state.players.length < 3 || state.gameOver) return;
    if (T(p, "trash") >= 0.7 && state.rnd() < 0.4 && E.dipTaunt) E.dipTaunt(state, p.idx);   // loudmouths run their mouth
    const dip = T(p, "diplomacy");
    if (dip < 0.35 || state.rnd() > 0.45 * dip + 0.1) return;    // loners stay silent; talkers speak more
    let leader = -1, lf = -1;
    for (const o of state.players) { if (o.idx === p.idx || E.sameTeam(p, o)) continue; const f = E.totalFame(o); if (f > lf) { lf = f; leader = o.idx; } }
    if (leader < 0) return;
    const myFame = E.totalFame(p);
    if (lf > myFame + 1) {                                       // behind the leader
      if (d.focus == null) { E.proposeFocus(state, p.idx, leader); return; }   // rally the table on the leader
      const rival = state.players.find(o => o.idx !== p.idx && o.idx !== leader && !E.sameTeam(p, o) && !E.hasTruce(state, p.idx, o.idx));
      if (rival) E.proposeTruce(state, p.idx, rival.idx, 3);     // truce a side rival to cut mutual damage
    } else if (!E.hasTruce(state, p.idx, leader)) {
      E.proposeTruce(state, p.idx, leader, 3);                   // ahead/peer: offer the threat a truce to coast
    }
  }

  // nearest on-map opponent hex (for rushers to push toward when idle)
  function nearestEnemyHex(E, state, p) {
    const keys = state.players.filter(o => o.pos && !E.sameTeam(p, o) && o.idx !== p.idx).map(o => E.hexKey(o.pos.q, o.pos.r));
    return nearestTarget(E, state, p, keys);
  }

  // ---- one action; returns "acted" | "stop" | "idle" ----
  function chooseAction(E, state, p) {
    if (tryFreeItems(E, state, p)) return "acted";

    // difficulty: weaker bots sometimes blunder — waste the die wandering instead of playing the best line
    const blunder = POL(p, "blunder");
    if (blunder > 0 && state.rnd() < blunder) {
      const runs = E.legalRuns(state, p);
      if (runs.length) { E.doRun(state, runs[Math.floor(state.rnd() * runs.length)]); return "acted"; }
    }

    const aggr = T(p, "aggression"), caution = T(p, "caution");
    // respect truces (skip partners) unless betrayal finishes the leader; honor a focus pact when choosing
    const close = E.closeTargets(state, p).filter(i => attackable(E, state, p, i));
    const ranged = E.rangedTargets(state, p).filter(i => attackable(E, state, p, i));
    const nearDeath = (i) => state.players[i].injuries >= E.INJURY_ZONE - 2;

    // 0) cautious personas patch up before they're in danger (aggressive ones tough it out)
    const healAt = Math.max(POL(p, "healMin"), Math.round(POL(p, "healBase") - POL(p, "healCautionK") * caution));   // caution + skill set when to patch up
    if (E.canHeal(state, p)) {
      const ht = E.healTargets(state, p);
      const mate = ht.find(i => i !== p.idx && state.players[i].injuries >= 2);   // always try to save a teammate
      if (mate != null) { E.doHeal(state, mate); return "acted"; }
      if (p.injuries >= healAt) { E.doHeal(state, p.idx); return "acted"; }
    }

    // 1) finish an opponent: close combat that likely RELOADs (ends the turn) — everyone takes the kill
    const closeKill = close.filter(nearDeath);
    if (closeKill.length) { E.doClose(state, pickTarget(E, state, p, closeKill)); return "stop"; }
    // 2) proactive ranged: aggressive personas always; cautious ones only when it's a (near-)kill
    if (ranged.length && (aggr >= POL(p, "rangedAggro") || ranged.some(nearDeath))) { E.doRanged(state, pickTarget(E, state, p, ranged), 3); return "acted"; }

    // 3) upload carried beacons at the tower
    if (p.carryingBeacons > 0 && E.canUpload(state, p)) { E.doActivate(state); return "acted"; }

    // 4) loot a beacon / supply box on this hex (loot goblins also grab supplies eagerly)
    const loot = E.lootOptions(state, p);
    if (loot.length) {
      const bi = loot.findIndex(t => t.kind === "beacon");
      E.doLoot(state, bi >= 0 ? bi : 0); return "acted";
    }
    // 4b) Cody & Buzz: send the drone to grab a token on an ADJACENT hex (current hex handled by loot above)
    if (p.character === "codybuzz" && E.droneLootOptions) {
      const here = p.pos && E.hexKey(p.pos.q, p.pos.r);
      const opts = E.droneLootOptions(state, p);
      const tgt = opts.find(o => o.kind === "beacon" && o.key !== here) || opts.find(o => o.key !== here);
      if (tgt && E.doDroneLoot(state, tgt.key, tgt.tokenIdx)) return "acted";
    }

    // 5) move toward the best objective
    const tower = E.towerKey(state);
    if (p.carryingBeacons > 0) { if (stepToward(E, state, p, tower)) return "acted"; }
    const beacons = tokenHexes(E, state, "beacon");
    if (beacons.length) { if (stepToward(E, state, p, nearestTarget(E, state, p, beacons))) return "acted"; }
    const supplies = tokenHexes(E, state, "supply");
    if (supplies.length) { if (stepToward(E, state, p, nearestTarget(E, state, p, supplies))) return "acted"; }

    // 6) aggressive personas would rather a weak close attack (or a push) than sit still
    if (aggr >= POL(p, "closeAggro") && close.length) { E.doClose(state, pickTarget(E, state, p, close)); return "stop"; }
    if (aggr >= POL(p, "rushAggro")) { if (stepToward(E, state, p, nearestEnemyHex(E, state, p))) return "acted"; }   // rush the nearest enemy

    // 7) builders fortify when idle and safe (Architect / Map Controller)
    if (E.canBuild(state, p)) {
      if (T(p, "build") >= POL(p, "buildTrap") && p.pos && state.board[E.hexKey(p.pos.q, p.pos.r)].trap == null && p.trapsUsed < 6) { if (E.doBuildTrap(state)) return "acted"; }
      if (!p.hideout) { if (E.doBuildHideout(state)) return "acted"; }
    }

    // 9) no objective to pursue — stop and keep the remaining dice (they become combat-line defense
    //    dice at End Phase, which is better than wandering them away).
    return "idle";
  }

  // ============================================================
  // Expert tier — rollout (flat Monte-Carlo) look-ahead.
  // The headless engine is its own fast simulator, so on each sub-decision the expert tries every
  // candidate action, simulates the rest of the game N times with the heuristic bot as the rollout
  // policy (for everyone), and keeps the action with the best expected outcome. That is one step of
  // policy improvement over the heuristic = real "thinking ahead". The rollout count is the strength
  // dial. Clones run with state._inRollout = true so the rollout policy never recurses into rollouts.
  // ============================================================
  function cloneForRollout(E, state) {
    const r = state.rnd; state.rnd = null;
    const g = JSON.parse(JSON.stringify(state));   // state is plain data apart from rnd
    state.rnd = r;
    g.rnd = E.makeRng((r() * 1e9) | 0);            // seed from the real game RNG -> expert is deterministic per game seed
    g._inRollout = true;
    return g;
  }
  function rolloutScore(E, g, me) {
    let s = E.scoreFor(g, me);                       // team-aware fame
    if (g.gameOver) { const won = me.team != null ? (g.winnerTeam === me.team) : (g.winner === me.idx); s += won ? 1000 : -40; }   // win dominates; fame is the tiebreak
    return s;
  }
  function playout(E, g, depth) {
    let n = 0; const stopRound = depth > 0 ? g.round + depth : Infinity;
    while (!g.gameOver && g.round < stopRound && n++ < 4000) root.RL.ai.takeTurn(g);
  }
  // candidate actions for the current player; each { apply(g)->bool, ends }. apply=null means "end the turn now".
  // legal actions for the current player, each tagged with a stable label (so the open-loop tree can key on it)
  function enumerateActions(E, state, p) {
    const out = [];
    for (const t of E.closeTargets(state, p)) out.push({ label: "close:" + t, apply: g => E.doClose(g, t), ends: true });
    for (const t of E.rangedTargets(state, p)) out.push({ label: "ranged:" + t, apply: g => E.doRanged(g, t, 3), ends: false });
    if (p.carryingBeacons > 0 && E.canUpload(state, p)) out.push({ label: "upload", apply: g => E.doActivate(g), ends: false });
    E.lootOptions(state, p).forEach((tok, i) => out.push({ label: "loot:" + i, apply: g => E.doLoot(g, i), ends: false }));
    if (E.droneLootOptions) { const here = p.pos && E.hexKey(p.pos.q, p.pos.r); for (const o of E.droneLootOptions(state, p)) if (o.key !== here) out.push({ label: "drone:" + o.key + ":" + o.tokenIdx, apply: g => E.doDroneLoot(g, o.key, o.tokenIdx), ends: false }); }
    for (const t of E.healTargets(state, p)) out.push({ label: "heal:" + t, apply: g => E.doHeal(g, t), ends: false });
    for (const k of E.legalRuns(state, p)) out.push({ label: "run:" + k, apply: g => E.doRun(g, k), ends: false });
    if (E.canBuild(state, p)) {
      for (const e of E.emptyEdges(state, p)) out.push({ label: "wall:" + e, apply: g => E.doBuildBarrier(g, e), ends: false });
      out.push({ label: "hideout", apply: g => E.doBuildHideout(g), ends: false });
      out.push({ label: "trap", apply: g => E.doBuildTrap(g), ends: false });
    }
    out.push({ label: "end", apply: null, ends: true });   // always an option: end the turn, keep remaining dice for defense
    return out;
  }
  // apply a candidate to a simulated game; false = it was illegal (no-op, e.g. wall budget gone)
  function applyAct(E, g, me, c) {
    if (c.apply) { if (!c.apply(g)) return false; }
    if (c.ends && !g.gameOver && E.curP(g) === me) E.endTurn(g);
    return true;
  }
  // Open-loop UCT. Each iteration re-samples a clone and walks a label-keyed tree over the searcher's
  // remaining sub-actions THIS turn (deeper than 1-ply: it plans action sequences), then rolls out to the
  // end. Legality is re-checked every iteration (dice make the action set vary); illegal labels are pruned.
  function evalCandidate(E, state, p, c, rollouts, depth) {
    let sum = 0;
    for (let i = 0; i < rollouts; i++) {
      const g = cloneForRollout(E, state), me = g.players[p.idx];
      if (!applyAct(E, g, me, c)) return -Infinity;   // illegal (e.g. wall budget gone) — never choose it
      playout(E, g, depth);
      sum += rolloutScore(E, g, me);
    }
    return sum / rollouts;
  }
  // 1-ply rollout look-ahead: score each candidate first-action by N rollouts (heuristic plays the rest), pick best.
  // NOTE: a full open-loop UCT was tried; at feasible budgets it lost to this on RELOAD's shallow turns + sparse win
  // reward (UCT root estimates get polluted by exploring bad deep lines). So we keep this cleaner estimator and
  // scale strength via the rollout count (POL rollouts). Deterministic per game seed (cloneForRollout seeds from state.rnd).
  function rolloutAction(E, state, p) {
    if (tryFreeItems(E, state, p)) return "acted";    // free items handled heuristically (no die cost)
    const N = POL(p, "rollouts"), depth = POL(p, "rolloutDepth") || 0;
    let best = null, bestScore = -Infinity;
    for (const c of enumerateActions(E, state, p)) { const sc = evalCandidate(E, state, p, c, N, depth); if (sc > bestScore) { bestScore = sc; best = c; } }
    if (!best || !best.apply) return "stop";          // ending the turn scored best (the end candidate has apply=null)
    const ended = best.ends;
    best.apply(state);                                // commit the chosen action to the real game
    return ended ? "stop" : "acted";
  }

  function takeTurn(state) {
    const E = root.RL.engine;
    const p = E.curP(state);
    if (state.needsParachute) doParachute(E, state, p);
    runDiplomacy(E, state, p);                          // table talk: truces / focus pacts
    const expert = !state._inRollout && POL(p, "rollouts") > 0;   // rollout look-ahead only at the real top level
    let guard = 0;
    // keep acting while on the map and either dice remain, or Blitz has an unspent bonus step (Fastest There Is).
    // The p.pos guard stops the loop if a mid-turn RELOAD (e.g. a trap kill on the last die) sent us off-map.
    const canAct = () => !!p.pos && (p.defensePool > 0 || (p.character === "blitz" && p._runBonus && !p._runBonusUsed));
    while (!state.gameOver && E.curP(state) === p && canAct() && guard++ < 40) {
      const r = expert ? rolloutAction(E, state, p) : chooseAction(E, state, p);
      if (r === "stop" || r === "idle") break;     // close combat ended the turn, or nothing useful left
    }
    if (!state.gameOver && E.curP(state) === p) E.endTurn(state);
  }

  const AI = { takeTurn };
  if (typeof module !== "undefined" && module.exports) module.exports = AI;
  root.RL = Object.assign(root.RL || {}, { ai: AI });
})(typeof globalThis !== "undefined" ? globalThis : this);
