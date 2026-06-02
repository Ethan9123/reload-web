// node tools/train_ai.js — self-play evolutionary tuning of the AI "hard" skill policy.
//
// The bot (js/ai.js) is parameterized: DEFAULT_POLICY are the hand-tuned "medium" thresholds, and a
// player's p.policy overrides any subset. This script runs a small genetic algorithm over headless
// self-play tournaments to find a policy that MAXIMIZES win-share vs the medium baseline, then prints
// it as JSON to paste into js/data.js DIFFICULTY.hard.
//
// Personas are disabled during training so the ONLY difference between candidate and baseline players
// is their policy (clean skill signal). No external deps. Tune size via env: GEN, POP, SEEDS.
//   node tools/train_ai.js                 (default run)
//   GEN=12 POP=12 SEEDS=40 node tools/train_ai.js   (bigger / slower / lower-variance)

const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
const PERS = D.PERSONAS;

const BASELINE = {};   // medium = all DEFAULT_POLICY values

// parameter space (key -> [min, max]); blunder is fixed at 0 for a strong bot
const SPACE = {
  healBase:     [2, 5],
  healCautionK: [0, 3],
  healMin:      [1, 3],
  rangedAggro:  [0.10, 0.70],
  closeAggro:   [0.20, 0.90],
  rushAggro:    [0.40, 1.00],
  buildTrap:    [0.40, 1.00],
};
const KEYS = Object.keys(SPACE);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function normalize(p) {                       // round to sensible granularities + clamp
  const q = { blunder: 0 };
  q.healBase     = Math.round(clamp(p.healBase, 2, 5));
  q.healMin      = Math.round(clamp(p.healMin, 1, 3));
  q.healCautionK = Math.round(clamp(p.healCautionK, 0, 3) * 2) / 2;            // halves
  for (const k of ["rangedAggro", "closeAggro", "rushAggro", "buildTrap"]) q[k] = +clamp(p[k], SPACE[k][0], SPACE[k][1]).toFixed(2);
  return q;
}
function randomPolicy() {
  const p = {};
  for (const k of KEYS) { const [lo, hi] = SPACE[k]; p[k] = lo + Math.random() * (hi - lo); }
  return normalize(p);
}
function mutate(p, rate) {
  const q = Object.assign({}, p);
  for (const k of KEYS) {
    if (Math.random() < 0.6) { const [lo, hi] = SPACE[k]; q[k] = clamp(p[k] + (Math.random() * 2 - 1) * rate * (hi - lo), lo, hi); }
  }
  return normalize(q);
}

// one 4-player all-AI game. Paired personas: seats {0,1} share persona A, {2,3} share persona B — so the
// candidate side and baseline side hold the SAME two personas and wins reflect POLICY, not persona luck.
// Persona variety also exercises the policy's trait cutoffs (which are inert when every trait is fixed).
function playGame(seed, cand, candSeats) {
  const g = E.newGame({ numPlayers: 4, seed, allAI: true, personas: false });
  const pA = PERS[seed % PERS.length], pB = PERS[(seed * 7 + 3) % PERS.length];
  [pA, pA, pB, pB].forEach((per, i) => { g.players[i].persona = per; });
  g.players.forEach((p, i) => { p.policy = candSeats.includes(i) ? cand : BASELINE; });
  let n = 0; while (!g.gameOver && n++ < 4000) AI.takeTurn(g);
  const candFame = candSeats.reduce((s, i) => s + E.totalFame(g.players[i]), 0);
  const baseFame = g.players.reduce((s, p, i) => s + (candSeats.includes(i) ? 0 : E.totalFame(p)), 0);
  return { won: (g.winner != null && candSeats.includes(g.winner)) ? 1 : 0, margin: candFame - baseFame };
}
// candidate plays BOTH diagonal seat-pairs of every seed -> cancels turn-order bias
function evaluate(cand, seeds) {
  let wins = 0, margin = 0, games = 0;
  for (const seed of seeds) for (const seats of [[0, 2], [1, 3]]) {
    const r = playGame(seed, cand, seats); wins += r.won; margin += r.margin; games++;
  }
  return { winShare: wins / games, fameMargin: margin / games, games };
}
const fitness = (e) => e.winShare * 1000 + e.fameMargin;   // win-share dominates; fame margin breaks ties

function run() {
  const GEN = +process.env.GEN || 8;
  const POP = +process.env.POP || 8;
  const SEEDS = +process.env.SEEDS || 24;
  const ELITE = 3;
  const t0 = Date.now();

  const sanitySeeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  console.log(`sanity: medium-vs-medium win share = ${evaluate(BASELINE, sanitySeeds).winShare.toFixed(3)} (expect ~0.50)`);

  let pop = [normalize({ healBase: 4, healMin: 2, healCautionK: 2, rangedAggro: 0.3, closeAggro: 0.45, rushAggro: 0.65, buildTrap: 0.7 })];
  while (pop.length < POP) pop.push(randomPolicy());

  let best = null, bestF = -Infinity, bestE = null;
  for (let gen = 0; gen < GEN; gen++) {
    const seeds = Array.from({ length: SEEDS }, (_, i) => gen * 1000 + i + 1);   // common seeds across candidates this gen
    const scored = pop.map(pl => { const e = evaluate(pl, seeds); return { pl, e, f: fitness(e) }; }).sort((a, b) => b.f - a.f);
    if (scored[0].f > bestF) { best = scored[0].pl; bestF = scored[0].f; bestE = scored[0].e; }
    console.log(`gen ${gen}: winShare ${scored[0].e.winShare.toFixed(3)} fameΔ ${scored[0].e.fameMargin.toFixed(1)}  ${JSON.stringify(scored[0].pl)}`);
    const rate = 0.30 * (1 - gen / GEN) + 0.05;
    const next = scored.slice(0, ELITE).map(s => s.pl);
    while (next.length < POP) next.push(mutate(scored[Math.floor(Math.random() * ELITE)].pl, rate));
    pop = next;
  }

  const holdout = Array.from({ length: 80 }, (_, i) => 900000 + i);   // unseen seeds
  const fin = evaluate(best, holdout);
  console.log(`\n=== BEST "hard" policy (held-out ${fin.games} games vs medium: winShare ${fin.winShare.toFixed(3)}, fameΔ ${fin.fameMargin.toFixed(1)}) ===`);
  console.log(JSON.stringify(best));
  // validate the difficulty ladder vs the medium baseline on held-out seeds (expect easy < 0.5 < hard)
  const easy = D.DIFFICULTY.easy;
  console.log(`\nladder vs medium (held-out): easy ${evaluate(easy, holdout).winShare.toFixed(3)} | medium ${evaluate(BASELINE, holdout).winShare.toFixed(3)} | hard ${fin.winShare.toFixed(3)}`);
  console.log(`\ntrained in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
run();
