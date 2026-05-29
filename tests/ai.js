// node tests/ai.js — Solo automa decision quality (not just completion).
const E = require("../js/engine.js");
const AI = require("../js/ai.js");
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const setPos = (g, p, key) => { const c = g.board[key]; p.pos = { q: c.q, r: c.r }; p.reloadZone = false; };
// put the AI (player 0) on its turn, on the board, ready to act
function prep(seed, opts) {
  const g = E.newGame(Object.assign({ numPlayers: 2, seed, allAI: true }, opts || {}));
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const p = g.players[0]; const tk = E.towerKey(g); setPos(g, p, tk);
  p.injuries = 0; p.actionDice = 5; p.defensePool = 5; p.combatLine = []; p.assignedDice = []; p.hasActed = false;
  // clear stray tokens so each scenario isolates one decision
  for (const k in g.board) g.board[k].tokens = [];
  return g;
}

// 1) shoots a reachable enemy (prefers combat when a ranged target exists)
{
  const g = prep(1); const p = g.players[0], foe = g.players[1];
  p.backpack = ["combat_shotgun"]; E.autoEquip(p);
  let placed = null;
  for (const nbk of E.neighbors(g, p.pos.q, p.pos.r)) { setPos(g, foe, nbk); if (E.rangedTargets(g, p).includes(1)) { placed = nbk; break; } }
  A(!!placed, "set up a ranged-reachable enemy");
  AI.takeTurn(g);
  A(g.lastCombat && g.lastCombat.type === "ranged" && g.lastCombat.a === 0, "automa took a ranged shot at the enemy");
}

// 2) finishes a near-death enemy with close combat (worth ending the turn)
{
  const g = prep(2); const p = g.players[0], foe = g.players[1];
  setPos(g, foe, E.hexKey(p.pos.q, p.pos.r));          // same hex
  foe.injuries = E.INJURY_ZONE - 1; foe.actionDice = 1; foe.defensePool = 1; foe.combatLine = [];
  AI.takeTurn(g);
  A(g.lastCombat && g.lastCombat.type === "close" && g.lastCombat.a === 0, "automa chose close combat to finish a near-death enemy");
}

// 3) heals when badly injured and safe
{
  const g = prep(3); const p = g.players[0];
  p.injuries = 4; p.actionDice = 1; p.defensePool = 1;   // alone, hurt
  g.players[1].pos = null; g.players[1].reloadZone = true;
  AI.takeTurn(g);
  A(p.injuries < 4, "automa healed when badly injured");
}

// 4) uploads carried beacons at the tower
{
  const g = prep(4); const p = g.players[0];
  p.carryingBeacons = 2; const fb = p.fame.beacon;
  AI.takeTurn(g);
  A(p.carryingBeacons === 0 && p.fame.beacon === fb + 2, "automa uploaded carried beacons at the tower (+2 beacon fame)");
}

// 5) loots a beacon sitting on its (non-tower) hex
{
  const g = prep(5); const p = g.players[0];
  g.players[1].pos = null; g.players[1].reloadZone = true;
  const tk = E.towerKey(g);
  const spot = E.neighbors(g, g.board[tk].q, g.board[tk].r).find(k => !g.board[k].hasTower);  // a non-tower hex
  setPos(g, p, spot); g.board[spot].tokens = [{ kind: "beacon" }];
  p.actionDice = 1; p.defensePool = 1;                 // one die: it can loot but can't also deliver this turn
  AI.takeTurn(g);
  A(p.carryingBeacons >= 1, "automa looted a beacon on its (non-tower) hex");
}

// 6) Team Royale: never attacks a teammate sharing the hex
{
  const g = E.newGame({ numPlayers: 4, seed: 6, mode: "team", allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const p = g.players[0], mate = g.players[2];
  for (const k in g.board) g.board[k].tokens = [];
  const tk = E.towerKey(g); setPos(g, p, tk); setPos(g, mate, tk);
  p.injuries = 0; p.actionDice = 5; p.defensePool = 5; p.backpack = ["survival_knife"]; E.autoEquip(p);
  g.players[1].pos = null; g.players[1].reloadZone = true; g.players[3].pos = null; g.players[3].reloadZone = true;
  AI.takeTurn(g);
  A(mate.injuries === 0 && mate.reloadZone === false, "automa did not attack its teammate");
}

// 7) productive idle: with nothing to chase and unhurt, it builds a hideout rather than wandering dice away
{
  const g = prep(7); const p = g.players[0];
  g.players[1].pos = null; g.players[1].reloadZone = true;   // no enemy, no tokens, not carrying, not hurt
  AI.takeTurn(g);
  A(!!p.hideout, "automa built a hideout when idle (keeps the turn productive)");
}

// 8) strength/quality: all-AI games complete and the winner earns real fame from objectives
{
  let crashed = 0, beaconFameSeen = 0, fameSum = 0, n = 30;
  for (let s = 0; s < n; s++) {
    try {
      let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 800, allAI: true });
      let g = 0; while (!h.gameOver && g++ < 5000) AI.takeTurn(h);
      if (!h.gameOver) { crashed++; continue; }
      const w = h.players[h.winner];
      fameSum += E.totalFame(w);
      if (h.players.some(pl => pl.fame.beacon > 0)) beaconFameSeen++;
    } catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, `${n} all-AI games complete without error`);
  A(fameSum / n >= 5, `winners earn meaningful fame on average (${(fameSum / n).toFixed(1)})`);
  A(beaconFameSeen >= n * 0.5, `automa uploads beacons in most games (${beaconFameSeen}/${n})`);
}

console.log(fails ? `AI TEST FAILED (${fails})` : "AI TEST PASSED");
process.exitCode = fails ? 1 : 0;
