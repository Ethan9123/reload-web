// node tests/rules_audit.js — compliance with the 肥龍/藍人 transcript: 2v2v2 auto-heal + up-to-2-walls-per-Build.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// ---- 1) Auto-Heal board side: Battle Royale + 2v2v2 heal; 2v2 / 3v3 do not (transcript 18:11) ----
function autoHealHeals(mode, numPlayers) {
  const g = E.newGame({ numPlayers, mode, seed: 3, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const p = g.players[0]; const tk = E.towerKey(g), tc = g.board[tk];
  p.pos = { q: tc.q, r: tc.r };
  // an OTHER player, on a clean (non-toxic) hex, with 2 injuries
  const o = g.players.find(x => x.idx !== p.idx && !E.sameTeam(p, x)) || g.players[1];
  const nb = g.board[E.neighbors(g, tc.q, tc.r)[0]];
  o.pos = { q: nb.q, r: nb.r }; o.injuries = 2; o.actionDice = 3;
  g.players.forEach(x => { if (x !== o) x.injuries = 0; });
  E.endTurn(g);
  return o.injuries;   // 1 if auto-healed, 2 if not
}
A(autoHealHeals("battleRoyale", 4) === 1, "Battle Royale: other injured player auto-heals 1");
A(autoHealHeals("team2v2v2", 6) === 1, "2v2v2: auto-heal board side IS used (heals)");
A(autoHealHeals("team", 4) === 2, "2v2 Team: non-Auto-Heal side — no auto-heal");

// ---- 2) A single Build action places UP TO 2 walls (transcript 09:25) ----
{
  const g = E.newGame({ numPlayers: 2, seed: 4, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const p = g.players[0], tk = E.towerKey(g), tc = g.board[tk];
  p.pos = { q: tc.q, r: tc.r }; p.actionDice = 5; p.defensePool = 5; p._wallCombo = 0;
  g.players[1].pos = null;   // alone, so canBuild
  const edges = E.emptyEdges(g, p);
  A(edges.length >= 2, `tower has empty edges to wall (${edges.length})`);
  // first wall: pays a die, opens the free 2nd
  A(E.doBuildBarrier(g, edges[0]) && p.defensePool === 4 && p._wallCombo === 1, "1st wall costs a die and opens a free 2nd");
  // second wall (combo): free, closes the combo
  A(E.doBuildBarrier(g, E.emptyEdges(g, p)[0], true) && p.defensePool === 4 && p._wallCombo === 0, "2nd wall (same action) is free");
  // a 3rd wall needs a fresh die; a combo with no pending build is rejected
  A(!E.doBuildBarrier(g, E.emptyEdges(g, p)[0], true), "free combo wall rejected when none is pending");
  const dp = p.defensePool;
  A(E.doBuildBarrier(g, E.emptyEdges(g, p)[0]) && p.defensePool === dp - 1, "a new wall build costs another die");
  A(p._wallCombo === 1, "...and opens its own free 2nd");
  // spending a die on a different action ends the pending combo
  if (E.legalRuns(g, p).length) { E.doRun(g, E.legalRuns(g, p)[0]); A(p._wallCombo === 0, "a different action ends the pending free 2nd-wall"); }
}

// ---- 3) regression: all-AI games (incl. 2v2v2) still complete ----
{
  let crashed = 0;
  const modes = ["battleRoyale", "team", "team2v2v2"];
  for (let s = 0; s < 18; s++) {
    const mode = modes[s % 3], n = mode === "team2v2v2" ? 6 : mode === "team" ? 4 : (2 + s % 3);
    try { let h = E.newGame({ numPlayers: n, mode, seed: s + 1700, allAI: true }); let k = 0; while (!h.gameOver && k++ < 6000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
    catch (e) { crashed++; console.error("  seed", s, mode, e.message); }
  }
  A(crashed === 0, "18 all-AI games across modes complete");
}

// ---- weighted fame token values (official rulebook p.11 scoring legend) ----
{
  const D = require("../js/data.js");
  const V = D.FAME;
  A(V.reload.value === 7, "RELOAD token = 7 fame");
  A(V.beacon.value === 4, "Beacon token = 4 fame");
  A(V.crown.value === 4, "Crown (Event) token = 4 fame");
  A(V.injury.value === 3, "Injury token = 3 fame");
  A(V.achievement.value === 3, "Achievement token = 3 fame");
  A(V.teamSpirit.value === 2, "Team Spirit token = 2 fame");
  A(V.trap.value === 2, "Trap token = 2 fame");
  // behavioral consequence: 1 RELOAD (7) outscores 3 traps (6) — equal-weight counting got this wrong
  const g = E.newGame({ numPlayers: 2, seed: 5, allAI: true });
  const a = g.players[0], b = g.players[1];
  for (const k in a.fame) { a.fame[k] = 0; b.fame[k] = 0; }
  a.fame.reload = 1; b.fame.trap = 3;
  A(E.totalFame(a) === 7 && E.totalFame(b) === 6, "totalFame is weighted: 1 RELOAD (7) beats 3 traps (6)");
}

console.log(fails ? `RULES AUDIT TEST FAILED (${fails})` : "RULES AUDIT TEST PASSED");
process.exitCode = fails ? 1 : 0;
