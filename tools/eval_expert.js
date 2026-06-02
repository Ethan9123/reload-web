// node tools/eval_expert.js — measure the rollout "Expert" bot vs "hard" (paired personas).
// Expert is stochastic (rollouts use independent RNG), so the number wiggles run to run; more games = steadier.
//   R=10 N=8 node tools/eval_expert.js     (R = rollouts, N = seeds -> 2N games)
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
function head(a, b, N) { let w = 0, games = 0; for (let s = 0; s < N; s++) for (const seats of [[0, 2], [1, 3]]) { w += playGame(s + 1, a, b, seats); games++; } return { ws: w / games, games }; }

const N = +process.env.N || 8, R = +process.env.R || 16;   // R = rollouts per candidate
const hard = D.DIFFICULTY.hard;
const expert = Object.assign({}, D.DIFFICULTY.expert, { rollouts: R });
const t0 = Date.now();
const r = head(expert, hard, N);
console.log(`expert(rollouts=${R}) vs hard: winShare ${r.ws.toFixed(3)} over ${r.games} games  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
