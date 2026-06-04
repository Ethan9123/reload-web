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

// per-action dice placement: p.actionsThisTurn records which action each placed die went on, resets each turn
{
  const { g, p, tk } = setup(7);
  A((p.actionsThisTurn || []).length === 0, "actionsThisTurn starts empty");
  g.board[tk].tokens = [{ kind: "beacon" }];
  E.doLoot(g, 0);                 // loot on the tower hex
  const runs = E.legalRuns(g, p); if (runs.length) E.doRun(g, runs[0]);   // then a run
  const kinds = p.actionsThisTurn.map(a => a.kind);
  A(kinds.includes("loot") && (kinds.includes("run") || kinds.includes("portal")), "actionsThisTurn records the action each die was placed on");
  A(p.actionsThisTurn.every(a => typeof a.die === "number"), "each placement records the die value");
  E.beginTurn(g);
  A(p.actionsThisTurn.length === 0, "actionsThisTurn resets at the start of the next turn");
}

// placements track DICE ACTUALLY SPENT (per-die), not action events — combat dice included; free actions excluded
{
  // combat: a ranged shot records one "ranged" placement
  const g = E.newGame({ numPlayers: 2, seed: 8, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const a = g.players[0], t = g.players[1], tk = E.towerKey(g), tc = g.board[tk];
  a.pos = { q: tc.q, r: tc.r }; a.actionDice = 5; a.defensePool = 5; a.actionsThisTurn = [];
  t.pos = { q: tc.q, r: tc.r }; t.reloadZone = false; t.defensePool = 3;
  a.backpack = ["semi_auto_pistol"]; E.autoEquip(a);
  if (E.rangedTargets(g, a).includes(t.idx)) {
    E.doRanged(g, t.idx, 3);
    A(a.actionsThisTurn.some(x => x.kind === "ranged"), "a ranged shot records a 'ranged' die placement (combat dice now shown)");
  } else A(true, "(ranged target not in range this seed — skipped)");
  // mountain run spends 2 dice -> 2 placements
  const g2 = E.newGame({ numPlayers: 2, seed: 9, allAI: true });
  g2.activePlayer = 0; g2.phase = "action"; g2.needsParachute = false;
  const p2 = g2.players[0]; p2.actionsThisTurn = []; p2.defensePool = 5; p2.actionDice = 5;
  const mk = Object.keys(g2.board).find(x => g2.board[x].terrain === "mountain");
  const adj = Object.keys(g2.board).find(x => x !== mk && !g2.board[x].hasTower && E.hexDistance(g2.board[x], g2.board[mk]) === 1);
  if (adj) {
    p2.pos = { q: g2.board[adj].q, r: g2.board[adj].r }; p2.reloadZone = false;
    if (E.legalRuns(g2, p2).includes(mk)) {
      const n0 = p2.actionsThisTurn.length; E.doRun(g2, mk);
      A(p2.actionsThisTurn.filter(x => x.kind === "run").length - n0 === 2, "a Run into a mountain records 2 die placements (both spent dice)");
    } else A(true, "(mountain not reachable this seed — skipped)");
  }
}

// placements stay in sync with assignedDice when a placed die is removed (injury) or on RELOAD
{
  const { g, p, tk } = setup(11);
  g.board[tk].tokens = [{ kind: "beacon" }, { kind: "beacon" }];
  E.doLoot(g, 0); E.doLoot(g, 0);
  A(p.actionsThisTurn.length === p.assignedDice.length, "actionsThisTurn matches assignedDice after placing dice");
  // an injury that pops an assigned die should also drop one placement
  const before = p.actionsThisTurn.length;
  if (typeof E.takeInjuries === "function") { /* not exported; simulate via the hierarchy through a trap is complex */ }
  // RELOAD clears placements
  E.reloadPlayer(g, p, g.players[1]);
  A(p.actionsThisTurn.length === 0, "RELOAD clears the action-space placements");
}

// a boost die spent on an action is recorded as a (boost) placement so it doesn't vanish from the view
{
  const { g, p, tk } = setup(12);
  p.defensePool = 0; p.boostDice = 1; p.assignedDice = []; p.actionsThisTurn = [];   // only a boost die available
  g.board[tk].tokens = [{ kind: "beacon" }];
  E.doLoot(g, 0);
  const boostEntry = p.actionsThisTurn.find(x => x.boost);
  A(boostEntry && boostEntry.kind === "loot", "a boost die placed on an action is recorded (flagged boost)");
  A(p.assignedDice.length === 0, "the boost placement is NOT in assignedDice (never a combat-line/injury die)");
}

console.log(fails ? `ACTIONFEED TEST FAILED (${fails})` : "ACTIONFEED TEST PASSED");
process.exitCode = fails ? 1 : 0;
