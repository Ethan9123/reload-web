// node tests/build.js — Heal, Build (barriers/hideout/trap), trap RPS, restrictions.
const E = require("../js/engine.js");
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// ---- Heal ----
let g = E.newGame({ numPlayers: 2, seed: 1, allAI: true });
let p = E.curP(g);
p.pos = { q: 1, r: 0 }; g.needsParachute = false; g.phase = "action"; p.injuries = 3; p.actionDice = 2; p.defensePool = 2;
g.players[1].pos = { q: 0, r: -1 };
A(E.canHeal(g, p), "canHeal when injured and alone");
const injB = p.injuries; E.doHeal(g);
A(p.injuries < injB, "Heal reduced injuries");
g.players[1].pos = { q: 1, r: 0 };
A(!E.canHeal(g, p), "cannot Heal with an enemy on the hex (restricted)");

// ---- Barrier ownership ----
g = E.newGame({ numPlayers: 2, seed: 2, allAI: true });
const a = g.players[0], b = g.players[1];
a.pos = { q: 1, r: 0 }; b.pos = { q: 2, r: 0 }; g.needsParachute = false; g.phase = "action"; a.defensePool = 5;
A(E.emptyEdges(g, a).includes(0), "edge toward neighbor is buildable");
A(E.doBuildBarrier(g, 0), "build barrier on edge 0");
b.defensePool = 5;
A(!E.legalRuns(g, b).includes("1,0"), "enemy barrier blocks opponent movement");
A(E.legalRuns(g, a).includes("2,0"), "own barrier does NOT block owner movement");
A(E.doDemolish(g, 0), "demolish barrier");
A(E.legalRuns(g, b).includes("1,0"), "movement restored after demolish");

// ---- Trap RPS always resolves ----
let effect = 0;
for (let s = 0; s < 100; s++) {
  const h = E.newGame({ numPlayers: 2, seed: s + 50, allAI: true });
  const o = h.players[0], w = h.players[1];
  o.pos = { q: 1, r: 0 }; h.needsParachute = false; h.phase = "action"; o.defensePool = 5;
  E.doBuildTrap(h);
  h.activePlayer = 1; w.pos = { q: 2, r: 0 }; h.phase = "action"; w.defensePool = 5; w.injuries = 0;
  const fb = o.fame.trap + w.fame.trap, ib = w.injuries;
  E.doRun(h, "1,0");
  if (o.fame.trap + w.fame.trap > fb || w.injuries > ib || w._noMove || w.reloadZone) effect++;
}
A(effect === 100, "trap always resolves with an effect (fame/injury/stop)");

// ---- Build restrictions & cost ----
g = E.newGame({ numPlayers: 2, seed: 9, allAI: true });
const c = E.curP(g); c.pos = { q: 1, r: 0 }; g.needsParachute = false; g.phase = "action"; c.defensePool = 3;
g.players[1].pos = { q: 0, r: 0 };
const dp = c.defensePool; A(E.doBuildTrap(g), "build trap ok when alone");
A(c.defensePool === dp - 1, "build costs 1 action die");
g.players[1].pos = { q: 1, r: 0 };
A(!E.canBuild(g, c), "cannot build with an enemy on the hex (restricted)");

// ---- Hideout placement ----
g = E.newGame({ numPlayers: 2, seed: 11, allAI: true });
const hp = E.curP(g); hp.pos = { q: 1, r: 0 }; g.needsParachute = false; g.phase = "action"; hp.defensePool = 3;
g.players[1].pos = { q: 0, r: -1 };
A(E.doBuildHideout(g), "build hideout");
A(hp.hideout === E.hexKey(1, 0) && g.board[E.hexKey(1, 0)].hideouts.includes(hp.idx), "hideout recorded on hex + player");

console.log(fails ? `BUILD TEST FAILED (${fails})` : "BUILD TEST PASSED");
process.exitCode = fails ? 1 : 0;
