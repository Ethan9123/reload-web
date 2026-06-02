// node tools/eval_ladder.js — measure the difficulty ladder: pairwise win-share among DIFFICULTY tiers.
// Uses paired personas (both sides hold the same two personas) so results reflect the POLICY only.
//   node tools/eval_ladder.js            (200 seeds * 2 seatings = 400 games per matchup)
//   N=400 node tools/eval_ladder.js
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
const PERS = D.PERSONAS;

function playGame(seed, polA, polB, aSeats) {
  const g = E.newGame({ numPlayers: 4, seed, allAI: true, personas: false });
  const pA = PERS[seed % PERS.length], pB = PERS[(seed * 7 + 3) % PERS.length];
  [pA, pA, pB, pB].forEach((per, i) => { g.players[i].persona = per; });
  g.players.forEach((p, i) => { p.policy = aSeats.includes(i) ? polA : polB; });
  let n = 0; while (!g.gameOver && n++ < 4000) AI.takeTurn(g);
  return (g.winner != null && aSeats.includes(g.winner)) ? 1 : 0;
}
function head(a, b, N) {                       // win share of policy a vs policy b
  let wins = 0, games = 0;
  for (let s = 0; s < N; s++) for (const seats of [[0, 2], [1, 3]]) { wins += playGame(s + 1, a, b, seats); games++; }
  return wins / games;
}
const N = +process.env.N || 200;
const { easy, medium, hard } = D.DIFFICULTY;
console.log(`difficulty ladder — ${N * 2} games per matchup, paired personas`);
console.log("  hard   vs medium:", head(hard, medium, N).toFixed(3), " (expect > 0.50)");
console.log("  medium vs easy  :", head(medium, easy, N).toFixed(3), " (expect > 0.50)");
console.log("  hard   vs easy  :", head(hard, easy, N).toFixed(3), " (expect >> 0.50)");
console.log("  medium vs medium:", head(medium, medium, N).toFixed(3), " (expect ~0.50)");
