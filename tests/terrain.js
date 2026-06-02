// node tests/terrain.js — new special terrains (maze, solar) and 5-6 player support.
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// 0) terrain definitions
A(D.TERRAIN.maze && D.TERRAIN.maze.blocksLOS && D.TERRAIN.maze.moveCost === 2, "maze terrain: blocksLOS + moveCost 2");
A(D.TERRAIN.solar && D.TERRAIN.solar.energy, "solar terrain: energy");
A(D.TERRAIN.mountain.moveCost === 2, "mountain still costs 2 (generalized moveCost)");
A(D.MAPS.metropolis.hexes.some(h => h.terrain === "maze"), "Metropolis features maze hexes");
A(D.MAPS.reactor.hexes.some(h => h.terrain === "solar"), "Reactor features solar hexes");

// 1) maze blocks line of sight through it (but not the endpoints)
{
  const g = E.newGame({ numPlayers: 2, seed: 1, allAI: true });
  const a = { q: 1, r: -1 }, b = { q: 1, r: 1 };           // line passes through (1,0); no tower wall on this segment
  A(E.hasLOS(g, a, b, 0), "clear LOS through a normal hex");
  g.board[E.hexKey(1, 0)].terrain = "maze";
  A(!E.hasLOS(g, a, b, 0), "maze hex blocks LOS through it");
}

// 2) maze costs 2 movement (like mountain); a non-Sora needs 2 dice
{
  const g = E.newGame({ numPlayers: 2, seed: 2, allAI: true });
  g.board[E.hexKey(1, 0)].terrain = "maze";
  const p = g.players[0]; p.character = "korat"; p.pos = { q: 1, r: -1 }; g.needsParachute = false; g.phase = "action"; g.activePlayer = 0;
  p.defensePool = 1;
  A(!E.legalRuns(g, p).includes("1,0"), "maze: cannot enter with 1 die");
  p.defensePool = 2;
  A(E.legalRuns(g, p).includes("1,0"), "maze: enterable with 2 dice");
}

// 3) solar grants a boost die at the start of your turn
{
  const g = E.newGame({ numPlayers: 2, seed: 3, allAI: true });
  const sp = g.players[g.activePlayer];
  sp.pos = { q: 1, r: 0 }; sp.injuries = 0; g.board[E.hexKey(1, 0)].terrain = "solar";
  E.beginTurn(g);
  A(sp.boostDice >= 1, "solar: occupant gains a boost die at turn start");
  A(sp.defensePool === sp.actionDice, "solar: the boost die is part of the available pool");
  // a normal terrain grants none
  const g2 = E.newGame({ numPlayers: 2, seed: 3, allAI: true });
  const np = g2.players[g2.activePlayer]; np.pos = { q: 1, r: 0 }; g2.board[E.hexKey(1, 0)].terrain = "plains";
  E.beginTurn(g2);
  A(np.boostDice === 0, "non-solar terrain grants no boost die");
}

// 4) 5- and 6-player games are supported and complete
{
  A(D.SETUP.eventRandom[5] === 20 && D.SETUP.eventRandom[6] === 22, "event decks defined for 5 & 6 players");
  const g5 = E.newGame({ numPlayers: 5, seed: 1, allAI: true, allCharacters: true });
  A(g5.players.length === 5 && new Set(g5.players.map(p => p.character)).size === 5, "5-player game seats 5 distinct characters");
  let crashed = 0;
  for (const np of [5, 6]) for (let s = 0; s < 4; s++) {
    try { let h = E.newGame({ numPlayers: np, seed: s + 1, allAI: true, allCharacters: true, map: s % 2 ? "ring" : "transit" }); let n = 0; while (!h.gameOver && n++ < 8000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
    catch (e) { crashed++; console.error("    np", np, "seed", s, e.message); }
  }
  A(crashed === 0, "5- and 6-player all-AI games complete on the big maps");
}

console.log(fails ? `TERRAIN TEST FAILED (${fails})` : "TERRAIN TEST PASSED");
process.exitCode = fails ? 1 : 0;
