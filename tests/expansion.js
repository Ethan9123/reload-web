// node tests/expansion.js — the 8 expansion characters (Rumble + Capture the Flag) and their abilities.
// Abilities are transcribed from the official Chinese edition. Each test force-assigns p.character so it
// is independent of the random draw; the regression at the end plays full all-AI games with the full roster.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// helper: a 2-player game put straight into the action phase, player 0 active
function mk(seed) {
  const g = E.newGame({ numPlayers: 2, seed, allAI: true });
  g.needsParachute = false; g.phase = "action"; g.activePlayer = 0;
  return g;
}

// 1) Kaiser — Regeneration: heal 1 injury at End Phase
{
  const g = mk(1);
  const k = g.players[0]; k.character = "kaiser"; k.pos = { q: 1, r: 0 }; k.injuries = 2; k.actionDice = 3; k.defensePool = 3;
  g.players[1].pos = { q: 0, r: -1 };
  E.endTurn(g);
  A(k.injuries === 1, "Kaiser heals 1 injury at End Phase (2 -> 1)");
  // a non-Kaiser in the same spot does not auto-heal at end phase
  const g2 = mk(1); const n = g2.players[0]; n.character = "korat"; n.pos = { q: 1, r: 0 }; n.injuries = 2; n.actionDice = 3; n.defensePool = 3;
  g2.players[1].pos = { q: 0, r: -1 };
  E.endTurn(g2);
  A(n.injuries === 2, "non-Kaiser does not self-heal at End Phase");
}

// 2) Diana — Huntress: ranged range +1
{
  const g = mk(2);
  const d = g.players[0]; d.character = "diana"; d.pos = { q: 2, r: 0 }; d.injuries = 0; d.actionDice = 5; d.defensePool = 5;
  d.backpack = ["bow_arrow"]; E.autoEquip(d);                       // bow range [0,0]
  const t = g.players[1]; t.character = "korat"; t.pos = { q: 1, r: 0 };  // distance 1
  g.board[E.hexKey(1, 0)].terrain = "plains";                        // isolate the range rule from jungle stealth
  A(E.rangedTargets(g, d).includes(1), "Diana's range +1 lets a range-0 bow hit a target 1 hex away");
  d.character = "korat";
  A(!E.rangedTargets(g, d).includes(1), "without Diana, the range-0 bow cannot reach 1 hex away");
}

// 3) Echo — Cloak: stealth until she takes part in combat
{
  const g = mk(3);
  const atk = g.players[0]; atk.character = "korat"; atk.pos = { q: 2, r: 0 }; atk.injuries = 0; atk.actionDice = 5; atk.defensePool = 5;
  atk.backpack = ["sniper_rifle"]; E.autoEquip(atk);               // range [0,2] w/ LOS
  const e = g.players[1]; e.character = "echo"; e._revealed = false; e.pos = { q: 1, r: 0 };  // dist 1
  A(!E.rangedTargets(g, atk).includes(1), "cloaked Echo is NOT targetable by ranged from another hex");
  e.pos = { q: 2, r: 0 };                                          // same hex as attacker (dist 0)
  A(E.rangedTargets(g, atk).includes(1), "Echo IS targetable by ranged from the same hex");
  // taking part in combat reveals her
  const g2 = mk(13); const ee = g2.players[0]; ee.character = "echo"; ee._revealed = false; ee.pos = { q: 1, r: 0 }; ee.defensePool = 5; ee.actionDice = 5; ee.injuries = 0;
  const victim = g2.players[1]; victim.character = "korat"; victim.pos = { q: 1, r: 0 }; victim.actionDice = 5;
  A(E.hasStealth(ee), "Echo starts the turn cloaked");
  E.doClose(g2, 1);
  A(ee._revealed && !E.hasStealth(ee), "Echo is revealed after taking part in combat");
}

// 4) Emmet — Field Medic: Heal is unrestricted (works with an enemy on the hex)
{
  const g = mk(4);
  const m = g.players[0]; m.character = "emmet"; m.pos = { q: 1, r: 0 }; m.injuries = 2; m.actionDice = 3; m.defensePool = 3;
  g.players[1].character = "korat"; g.players[1].pos = { q: 1, r: 0 };   // enemy shares the hex
  A(E.healTargets(g, m).includes(0), "Emmet can Heal even with an enemy on the hex");
  m.character = "korat";
  A(!E.canHeal(g, m), "a normal character cannot Heal with an enemy on the hex");
}

// 5) Sora — All-Terrain: ignores barrier + terrain movement limits
{
  const g = mk(5);
  g.board[E.hexKey(1, 0)].walls[0] = "n";                          // neutral wall on the (1,0)->(2,0) edge
  const s = g.players[0]; s.character = "sora"; s.pos = { q: 1, r: 0 }; s.defensePool = 5;
  A(E.legalRuns(g, s).includes("2,0"), "Sora moves through a barrier (ignores walls)");
  const n = g.players[1]; n.character = "korat"; n.pos = { q: 1, r: 0 }; n.defensePool = 5;
  A(!E.legalRuns(g, n).includes("2,0"), "a normal character is blocked by the same wall");
  // mountain costs 1 (not 2) for Sora
  const g2 = mk(15); const s2 = g2.players[0]; s2.character = "sora"; s2.pos = { q: 0, r: -1 }; s2.defensePool = 1;  // 1 die
  A(E.legalRuns(g2, s2).includes("-1,0"), "Sora enters a mountain hex for 1 die");
  const k2 = g2.players[1]; k2.character = "korat"; k2.pos = { q: 0, r: -1 }; k2.defensePool = 1;
  A(!E.legalRuns(g2, k2).includes("-1,0"), "a normal character needs 2 dice for a mountain (can't with 1)");
}

// 6) Betty — Demolitions: one free Build per turn (no action die)
{
  const g = mk(6);
  const bt = g.players[0]; bt.character = "betty"; bt.pos = { q: 1, r: 0 }; bt.defensePool = 0; bt.actionDice = 5;  // ZERO dice
  g.players[1].pos = { q: 2, r: 0 };
  A(E.canBuild(g, bt), "Betty can Build with 0 dice (free build available)");
  const ok = E.doBuildTrap(g);
  A(ok && bt.defensePool === 0 && bt._freeBuildUsed, "Betty's free Build places a trap without spending a die");
  A(!E.canBuild(g, bt), "after her free Build, Betty needs a die to build again");
}

// 7) Cody & Buzz — Drone Buzz: Loot a token on an adjacent hex
{
  const g = mk(7);
  const cb = g.players[0]; cb.character = "codybuzz"; cb.pos = { q: 1, r: 0 }; cb.defensePool = 5; cb.carryingBeacons = 0;
  const adj = E.neighbors(g, 1, 0).find(k => k !== E.hexKey(1, 0));
  g.board[adj].tokens.push({ kind: "beacon" });
  const opts = E.droneLootOptions(g, cb);
  A(opts.some(o => o.key === adj && o.kind === "beacon"), "drone can target a beacon on an adjacent hex");
  const o = opts.find(o => o.key === adj && o.kind === "beacon");
  const dpB = cb.defensePool, bcB = cb.carryingBeacons;
  A(E.doDroneLoot(g, o.key, o.tokenIdx), "drone loots the adjacent beacon");
  A(cb.carryingBeacons === bcB + 1 && cb.defensePool === dpB - 1, "drone loot: +1 carried beacon, -1 action die");
  // once per turn: after using the drone, no more drone options and a second drone loot is rejected this turn
  g.board[adj].tokens.push({ kind: "beacon" });
  A(E.droneLootOptions(g, cb).length === 0, "drone is once per turn — no options after using it");
  A(!E.doDroneLoot(g, adj, 0), "a second drone loot the same turn is rejected");
  // a non-Cody character has no drone options
  cb.character = "korat";
  A(E.droneLootOptions(g, cb).length === 0, "only Cody & Buzz has drone-loot options");
}

// 8) Butcher — Brawler: close combat resolves (re-roll wired, no crash) and ends the turn
{
  const g = mk(8);
  const b = g.players[0]; b.character = "butcher"; b.pos = { q: 0, r: 0 }; b.injuries = 0; b.actionDice = 5; b.defensePool = 5;
  const t = g.players[1]; t.character = "korat"; t.pos = { q: 0, r: 0 }; t.actionDice = 5;
  A(E.closeTargets(g, b).includes(1), "Butcher can engage a foe sharing his hex");
  A(E.doClose(g, 1) && b._closeEndedTurn, "Butcher's close combat resolves and ends his turn");
}

// 9) data integrity: all 12 characters present with implemented abilities
{
  const D = require("../js/data.js");
  A(D.CHARACTERS.length === 12, `roster has 12 characters (${D.CHARACTERS.length})`);
  const ids = new Set(D.CHARACTERS.map(c => c.id));
  ["sora", "betty", "butcher", "emmet", "echo", "diana", "kaiser", "codybuzz"].forEach(id =>
    A(ids.has(id), `expansion character present: ${id}`));
  A(D.CHARACTERS.every(c => c.ability && c.ability.impl), "every character's ability is marked implemented");
  // base pool stays 4 unless allCharacters is set
  const base = E.newGame({ numPlayers: 4, seed: 1, allAI: true });
  A(base.players.every(p => ["korat", "duke", "dax", "blitz"].includes(p.character)), "default games draw only the 4 base characters");
}

// 10) regression: all-AI games with the FULL 12-character roster complete without error
{
  let crashed = 0;
  for (let s = 0; s < 25; s++) {
    try {
      let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 5000, allAI: true, allCharacters: true });
      let n = 0; while (!h.gameOver && n++ < 5000) AI.takeTurn(h);
      if (!h.gameOver) crashed++;
    } catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, "25 all-AI games with the full roster complete without error");
}

console.log(fails ? `EXPANSION TEST FAILED (${fails})` : "EXPANSION TEST PASSED");
process.exitCode = fails ? 1 : 0;
