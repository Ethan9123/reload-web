// node tests/difficulty.js — the AI difficulty ladder (easy < medium < hard) from self-play tuning.
// Paired personas: both sides hold the same two personas, so wins reflect the POLICY (difficulty), not luck.
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const PERS = D.PERSONAS;

function playGame(seed, a, b, aSeats) {
  const g = E.newGame({ numPlayers: 4, seed, allAI: true, personas: false });
  const pA = PERS[seed % PERS.length], pB = PERS[(seed * 7 + 3) % PERS.length];
  [pA, pA, pB, pB].forEach((per, i) => { g.players[i].persona = per; });
  g.players.forEach((p, i) => { p.policy = aSeats.includes(i) ? a : b; });
  let n = 0; while (!g.gameOver && n++ < 4000) AI.takeTurn(g);
  return (g.winner != null && aSeats.includes(g.winner)) ? 1 : 0;
}
function head(a, b, N) { let w = 0, g = 0; for (let s = 0; s < N; s++) for (const seats of [[0, 2], [1, 3]]) { w += playGame(s + 1, a, b, seats); g++; } return w / g; }

const { easy, medium, hard } = D.DIFFICULTY;

// 1) plumbing: newGame(difficulty) assigns the right policy; no difficulty leaves AI on defaults
{
  const ge = E.newGame({ numPlayers: 4, seed: 1, allAI: true, difficulty: "easy" });
  A(ge.difficulty === "easy" && ge.players.every(p => p.policy === easy), "newGame(difficulty:easy) assigns the easy policy to AI players");
  const gd = E.newGame({ numPlayers: 2, seed: 1, allAI: true });
  A(gd.players.every(p => p.policy == null), "no difficulty => AI policy stays null (defaults; existing seeds unaffected)");
}

// 2) the ladder is ordered: easy << medium << hard. Engine is fully seeded => deterministic; 500 games
//    per matchup keeps the estimate stable. Thresholds sit well below the measured values for margin.
const N = 250;
const hm = head(hard, medium, N), me = head(medium, easy, N), mm = head(medium, medium, N);
console.log(`  ladder: hard-vs-medium ${hm.toFixed(3)} | medium-vs-easy ${me.toFixed(3)} | medium-vs-medium ${mm.toFixed(3)}`);
A(hm > 0.55, `hard beats medium (${hm.toFixed(3)} > 0.55)`);
A(me > 0.70, `medium beats easy (${me.toFixed(3)} > 0.70)`);
A(mm > 0.44 && mm < 0.56, `medium vs itself is fair (${mm.toFixed(3)} ~ 0.50)`);

console.log(fails ? `DIFFICULTY TEST FAILED (${fails})` : "DIFFICULTY TEST PASSED");
process.exitCode = fails ? 1 : 0;
