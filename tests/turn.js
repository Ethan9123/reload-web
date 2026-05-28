// node tests/turn.js — play a full all-AI game headlessly; verify it terminates & stays sane.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;

let g = E.newGame({ numPlayers: 4, seed: 7, allAI: true });
let safety = 0;
while (!g.gameOver && safety++ < 3000) AI.takeTurn(g);

console.log("gameOver:", g.gameOver, "round:", g.round, "turns:", g._turnsTaken,
  "events:", g.eventsResolved + "/" + g.eventTotal, "superstar:", !!g.superstar);
console.log("fame:", g.players.map(p => `${p.name}:${E.totalFame(p)}`).join(" "));
console.log("winner:", g.players[g.winner].name);

let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
A(g.gameOver, "game terminated");
A(safety < 3000, "no runaway loop");
A(g.players.every(p => p.pos), "all players are on the map");
A(g.players.every(p => p.defensePool >= 0), "no negative dice pools");
A(g.superstar || g.eventsResolved === g.eventTotal, "ended via superstar or event-deck exhaustion");
A(g.players.some(p => E.totalFame(p) > 0), "someone earned fame (beacons looted)");
// run several seeds for stability
let crashed = 0;
for (let s = 0; s < 20; s++) {
  try { let h = E.newGame({ numPlayers: 1 + (s % 4 || 2), seed: s, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "20 mixed-size games all completed without error");

// upload-at-center: beacons are NOT auto-scored; only Activate at the Central Tower uploads them
const u = E.newGame({ numPlayers: 2, seed: 3, allAI: true });
const pp = u.players[u.activePlayer];
pp.carryingBeacons = 3; pp.pos = null;
E.beginTurn(u);
A(pp.fame.beacon === 0, "carried beacons are NOT auto-scored at turn start");
const tk = E.towerKey(u), tc = u.board[tk];
pp.pos = { q: tc.q, r: tc.r }; u.needsParachute = false; u.phase = "action"; pp.defensePool = 5;
A(E.canUpload(u, pp), "canUpload true when on tower carrying beacons");
const okU = E.doActivate(u);
A(okU && pp.fame.beacon === 3 && pp.carryingBeacons === 0, "Activate at Central Tower uploads 3 beacons -> +3 fame");
// not on tower -> cannot upload
const v = E.newGame({ numPlayers: 2, seed: 4, allAI: true });
const vp = v.players[v.activePlayer]; vp.carryingBeacons = 2; vp.pos = { q: 1, r: 0 }; v.needsParachute = false; v.phase = "action"; vp.defensePool = 5;
A(!E.canUpload(v, vp), "cannot upload when not on the Central Tower");

console.log(fails ? `TURN TEST FAILED (${fails})` : "TURN TEST PASSED");
process.exitCode = fails ? 1 : 0;
