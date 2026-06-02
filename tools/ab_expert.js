// node tools/ab_expert.js — head-to-head A/B between two AI configs (paired personas, both seats swapped).
// Pass configs as JSON merged onto DIFFICULTY.expert; B defaults to the current expert baseline.
//   N=6 A='{"rollouts":32}' B='{"rollouts":16}' node tools/ab_expert.js
//   N=6 A='{"rollouts":24,"rolloutDepth":3}' node tools/ab_expert.js   (B omitted -> baseline expert)
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

const N = +process.env.N || 6;
const merge = (str) => Object.assign({}, D.DIFFICULTY.expert, str ? JSON.parse(str) : {});
const A = merge(process.env.A), B = merge(process.env.B);
const t0 = Date.now();
const r = head(A, B, N);
console.log(`A=${process.env.A || "expert(baseline)"}  vs  B=${process.env.B || "expert(baseline)"}`);
console.log(`winShare(A) = ${r.ws.toFixed(3)} over ${r.games} games  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
