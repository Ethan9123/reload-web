// node tests/expert.js — the UCT "Expert" AI: it runs (no rollout recursion blow-up) and beats easy.
// Uses a small UCT iteration budget so the suite stays fast; full strength is measured by tools/eval_expert.js.
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

A(D.DIFFICULTY.expert && D.DIFFICULTY.expert.rollouts > 0, "expert difficulty defines a UCT iteration budget");

const expert = Object.assign({}, D.DIFFICULTY.expert, { rollouts: 8 });   // few rollouts/candidate for test speed (deterministic)

// 1) functional: an expert seat completes games vs hard with no error and no infinite rollout recursion
{
  let crashed = 0;
  for (let s = 0; s < 2; s++) {
    try {
      const g = E.newGame({ numPlayers: 4, seed: s + 1, allAI: true, allCharacters: true });
      g.players.forEach((p, i) => { p.policy = i < 1 ? expert : D.DIFFICULTY.hard; });
      let n = 0; while (!g.gameOver && n++ < 3000) AI.takeTurn(g);
      if (!g.gameOver) crashed++;
    } catch (e) { crashed++; console.error("   ", e.message); }
  }
  A(crashed === 0, "expert rollout bot completes games without error (the _inRollout guard stops recursion)");
}

// 2) sanity strength: expert clearly beats easy (robust even with stochastic rollouts)
{
  const PERS = D.PERSONAS;
  const playGame = (seed, a, b, aSeats) => {
    const g = E.newGame({ numPlayers: 4, seed, allAI: true, personas: false });
    const pA = PERS[seed % PERS.length], pB = PERS[(seed * 7 + 3) % PERS.length];
    [pA, pA, pB, pB].forEach((per, i) => { g.players[i].persona = per; });
    g.players.forEach((p, i) => { p.policy = aSeats.includes(i) ? a : b; });
    let n = 0; while (!g.gameOver && n++ < 4000) AI.takeTurn(g);
    return (g.winner != null && aSeats.includes(g.winner)) ? 1 : 0;
  };
  let w = 0, games = 0;
  for (let s = 0; s < 5; s++) for (const seats of [[0, 2], [1, 3]]) { w += playGame(s + 1, expert, D.DIFFICULTY.easy, seats); games++; }
  const ws = w / games;
  console.log(`  expert(rollouts=8) vs easy: winShare ${ws.toFixed(3)} over ${games} games`);
  A(ws > 0.55, `expert clearly beats easy (${ws.toFixed(3)} > 0.55)`);
}

console.log(fails ? `EXPERT TEST FAILED (${fails})` : "EXPERT TEST PASSED");
process.exitCode = fails ? 1 : 0;
