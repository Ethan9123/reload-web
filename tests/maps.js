// node tests/maps.js — validate every map in DATA.MAPS (geometry + engine build) and that all-AI games
// complete on each. Catches authoring mistakes: duplicate coords, disconnected islands, missing tower, etc.
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const key = (q, r) => q + "," + r;
const NB = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

A(Object.keys(D.MAPS).length >= 4, `registry has >= 4 maps (${Object.keys(D.MAPS).length})`);

for (const id in D.MAPS) {
  const map = D.MAPS[id];
  const coords = new Set(map.hexes.map(h => key(h.q, h.r)));

  A(map.hexes.length === coords.size, `${id}: no duplicate hex coordinates (${map.hexes.length} hexes)`);
  A(map.hexes.every(h => D.TERRAIN[h.terrain]), `${id}: every hex uses a known terrain`);

  const towers = map.hexes.filter(h => h.terrain === "tower");
  A(towers.length === 1, `${id}: exactly one Central Tower`);

  // contiguity: BFS from the tower must reach every hex
  if (towers.length === 1) {
    const seen = new Set([key(towers[0].q, towers[0].r)]); const q = [towers[0]];
    while (q.length) { const c = q.shift(); for (const [dq, dr] of NB) { const k = key(c.q + dq, c.r + dr); if (coords.has(k) && !seen.has(k)) { seen.add(k); const [a, b] = k.split(",").map(Number); q.push({ q: a, r: b }); } } }
    A(seen.size === coords.size, `${id}: all hexes are contiguous (${seen.size}/${coords.size})`);
  }

  // portals come in a set (0 or >=2) and sit on real hexes
  A((map.portals || []).length !== 1, `${id}: portals form a set (not exactly 1)`);
  for (const p of (map.portals || [])) A(coords.has(key(p.q, p.r)), `${id}: portal ${key(p.q, p.r)} is on the map`);
  for (const w of (map.neutralWalls || [])) A(coords.has(key(w.q, w.r)), `${id}: wall host ${key(w.q, w.r)} is on the map`);

  // token sources exist (otherwise nobody can earn beacon/loot fame)
  A(map.hexes.some(h => D.TERRAIN[h.terrain].beacon), `${id}: has beacon terrain`);
  A(map.hexes.some(h => D.TERRAIN[h.terrain].supply), `${id}: has supply (village) terrain`);

  // engine builds the map and reports it
  const g = E.newGame({ numPlayers: 4, seed: 1, allAI: true, map: id });
  A(Object.keys(g.board).length === map.hexes.length, `${id}: engine builds ${map.hexes.length} hexes`);
  A(g.map === map.name, `${id}: state.map === "${map.name}"`);
  A(g.players.every(p => p.pos == null), `${id}: players start off-map (parachute)`);

  // all-AI games complete on this map across sizes + full roster
  let crashed = 0;
  for (let s = 0; s < 8; s++) {
    try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 700, allAI: true, allCharacters: true, map: id }); let n = 0; while (!h.gameOver && n++ < 6000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
    catch (e) { crashed++; console.error("   ", id, "seed", s, e.message); }
  }
  A(crashed === 0, `${id}: 8 all-AI games complete without error`);
}

// default (no map opt) is still Arcadia — guards the existing smoke assumptions
const def = E.newGame({ numPlayers: 4, seed: 1, allAI: true });
A(def.map === D.ARCADIA.name && Object.keys(def.board).length === 19, "default map is Arcadia (19 hexes)");

console.log(fails ? `MAPS TEST FAILED (${fails})` : "MAPS TEST PASSED");
process.exitCode = fails ? 1 : 0;
