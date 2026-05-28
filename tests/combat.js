// node tests/combat.js — combat engine: range/LOS, damage, RELOAD, beacon-drop.
const E = require("../js/engine.js");
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// setup helper: two players, attacker idx0 with weapon, target idx1
function scenario(seed, atkWeapon, atkPos, tgtPos, tgtInjuries, tgtBeacons) {
  const g = E.newGame({ numPlayers: 2, seed, allAI: true });
  const a = g.players[0], t = g.players[1];
  a.pos = atkPos; t.pos = tgtPos;
  g.needsParachute = false; g.phase = "action"; g.activePlayer = 0;
  a.injuries = 0; a.actionDice = 5; a.defensePool = 5; a.backpack = [atkWeapon]; E.autoEquip(a);
  t.injuries = tgtInjuries || 0; t.actionDice = 5 - (tgtInjuries || 0); t.defensePool = t.actionDice;
  t.carryingBeacons = tgtBeacons || 0; t.backpack = []; E.autoEquip(t);
  return g;
}

// 1) ranged: weapon equipped, target in range+LOS
let g = scenario(1, "combat_shotgun", { q: 2, r: 0 }, { q: 1, r: 0 }); // off-tower, no wall between
A(!!E.equippedRanged(g.players[0]), "attacker auto-equips ranged weapon");
A(E.rangedTargets(g, g.players[0]).includes(1), "adjacent target is in range + LOS");
// and confirm the tower's neutral wall DOES block LOS (engine correctness):
const gw = scenario(1, "combat_shotgun", { q: 0, r: 0 }, { q: 1, r: 0 }); // across tower wall edge 0
A(!E.rangedTargets(gw, gw.players[0]).includes(1), "neutral wall blocks LOS (no shot across tower wall)");

// 2) ranged deals injuries across seeds (sniper, 5 def dice)
let dmg = 0;
for (let s = 0; s < 150; s++) {
  const h = scenario(s, "sniper_rifle", { q: 2, r: 0 }, { q: 1, r: 0 });
  const t = h.players[1], before = t.injuries;
  E.doRanged(h, 1, 3);
  if (t.injuries > before || t.reloadZone) dmg++;
}
A(dmg > 0, `ranged combat deals injuries (happened in ${dmg}/150 seeds)`);

// 3) attacker spends 1 action die per ranged attack
g = scenario(2, "combat_shotgun", { q: 2, r: 0 }, { q: 1, r: 0 });
const dpBefore = g.players[0].defensePool;
E.doRanged(g, 1, 3);
A(g.players[0].defensePool === dpBefore - 1, "ranged attack costs 1 action die");

// 4) RELOAD: target near-full injuries, close combat -> reload, beacons drop, attacker reload-fame
let reloaded = false;
for (let s = 0; s < 300 && !reloaded; s++) {
  const h = scenario(s + 1000, "survival_knife", { q: 0, r: 0 }, { q: 0, r: 0 }, 4, 2);
  const t = h.players[0] === undefined ? null : h.players[1];
  const cell = h.board[E.hexKey(0, 0)];
  const beaconsBefore = cell.tokens.filter(x => x.kind === "beacon").length;
  E.doClose(h, 1);
  if (t.reloadZone) {
    reloaded = true;
    A(t.pos === null, "reloaded player removed from map");
    A(t.injuries === 0, "reloaded player injuries reset to 0");
    A(h.players[0].fame.reload >= 1, "attacker gained RELOAD fame");
    A(cell.tokens.filter(x => x.kind === "beacon").length === beaconsBefore + 2, "reloaded player's 2 beacons dropped on hex");
  }
}
A(reloaded, "close combat caused a RELOAD when target near full injuries");

// 5) close combat ends the attacker's turn (dice zeroed)
g = scenario(3, "survival_knife", { q: 0, r: 0 }, { q: 0, r: 0 });
E.doClose(g, 1);
A(g.players[0].defensePool === 0 && g.players[0]._closeEndedTurn, "close combat ends attacker turn");

// 6) LOS export + out-of-range rejection
g = scenario(4, "bow_arrow", { q: 2, r: 0 }, { q: 1, r: 0 }); // bow range [0,0]; dist 1 illegal
A(!E.rangedTargets(g, g.players[0]).includes(1), "out-of-range target rejected (bow range 0, dist 1)");

console.log(fails ? `COMBAT TEST FAILED (${fails})` : "COMBAT TEST PASSED");
process.exitCode = fails ? 1 : 0;
