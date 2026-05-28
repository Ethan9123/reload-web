// node tests/smoke.js — verify data.js + engine.js setup is internally consistent.
const E = require("../js/engine.js");
const g = E.newGame({ numPlayers: 4, seed: 42, allAI: true });

console.log("hexes:", Object.keys(g.board).length);
console.log("beacon hexes:", E.beaconHexCount(g));
console.log("supply hexes:", E.supplyHexCount(g));
console.log("players:", g.players.map(p => `${p.name}(dice ${p.defensePool}, pack [${p.backpack}])`).join(" | "));
console.log("decks:", { e1: g.decks.equip1.length, e2: g.decks.equip2.length, event: g.decks.event.length });

let fails = 0;
const assert = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
assert(Object.keys(g.board).length === 19, "19 hexes");
assert(E.beaconHexCount(g) === 14, "14 beacon hexes (jungle+plains+mountain)");
assert(E.supplyHexCount(g) === 4, "4 supply hexes (villages)");
assert(g.players.length === 4, "4 players");
assert(g.players.every(p => p.backpack.length === 1), "each player keeps 1 starting 1-star");
assert(g.players.every(p => p.defensePool === 5), "each player starts with 5 action dice");
assert(g.decks.equip1.length === 24 - 4 * 2, "1-star deck = 24 minus 8 drawn at setup");
// determinism: same seed -> same first player backpack
const g2 = E.newGame({ numPlayers: 4, seed: 42, allAI: true });
assert(JSON.stringify(g.players[0].backpack) === JSON.stringify(g2.players[0].backpack), "seed is deterministic");

console.log(fails ? `SMOKE FAILED (${fails})` : "SMOKE PASSED");
process.exitCode = fails ? 1 : 0;
