// node tests/actionfeed.js — engine emits a per-action feed (die value + kind + hex) for the UI animation.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

function setup(seed) {
  const g = E.newGame({ numPlayers: 2, seed, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const p = g.players[0], tk = E.towerKey(g), tc = g.board[tk];
  p.pos = { q: tc.q, r: tc.r }; p.actionDice = 5; p.defensePool = 5;
  return { g, p, tk };
}

// 1) each non-combat action appends one feed entry with {by, kind, die, hex, seq}
{
  const { g, p, tk } = setup(1);
  g.board[tk].tokens = [{ kind: "beacon" }];
  E.doLoot(g, 0);
  const e = g.actionFeed[g.actionFeed.length - 1];
  A(g.actionFeed.length === 1, "loot appended one feed entry");
  A(e.by === 0 && e.kind === "loot" && e.die === 1 && e.hex === tk && typeof e.seq === "number", "feed entry has by/kind/die/hex/seq");
}

// 2) a Run records its destination hex
{
  const { g, p } = setup(2);
  const dest = E.legalRuns(g, p)[0];
  E.doRun(g, dest);
  const e = g.actionFeed[g.actionFeed.length - 1];
  A(e.kind === "run" && e.hex === dest, "run feed entry records the destination hex");
}

// 3) Heal records the rolled die value (not a flat 1)
{
  const { g, p } = setup(3);
  p.injuries = 3; p.actionDice = 2; p.defensePool = 2;
  g.rnd = () => 0.6;   // rolls a 4
  E.doHeal(g, p.idx);
  const e = g.actionFeed[g.actionFeed.length - 1];
  A(e.kind === "heal" && e.die === 4, `heal feed entry carries the rolled value (${e.die})`);
}

// 4) build actions (barrier/trap/hideout) are recorded
{
  const { g, p } = setup(4);
  const edge = E.emptyEdges(g, p)[0];
  E.doBuildBarrier(g, edge);
  A(g.actionFeed.some(e => e.kind === "barrier"), "barrier recorded");
  E.doBuildTrap(g);
  A(g.actionFeed.some(e => e.kind === "trap"), "trap recorded");
}

// 5) seq is strictly increasing across actions
{
  const { g, p } = setup(5);
  E.doRun(g, E.legalRuns(g, p)[0]);
  const e2 = E.legalRuns(g, p); if (e2.length) E.doRun(g, e2[0]);
  let last = 0, mono = true;
  for (const e of (g.actionFeed || [])) { if (e.seq <= last) mono = false; last = e.seq; }
  A((g.actionFeed || []).length >= 1 && mono, "feed seq is strictly increasing across actions");
}

// 6) an AI turn produces feed entries the UI can replay, and games still complete
{
  let crashed = 0, sawFeed = false;
  for (let s = 0; s < 20; s++) {
    try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 1500, allAI: true }); let n = 0; while (!h.gameOver && n++ < 5000) AI.takeTurn(h); if (!h.gameOver) crashed++; if ((h.actionFeed || []).length) sawFeed = true; }
    catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, "20 all-AI games with the action feed complete");
  A(sawFeed, "AI turns populate the action feed");
}

console.log(fails ? `ACTIONFEED TEST FAILED (${fails})` : "ACTIONFEED TEST PASSED");
process.exitCode = fails ? 1 : 0;
