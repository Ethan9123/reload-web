// node tests/compliance.js — rules-compliance fixes: parachute drift, close-weapon modify,
// skull-step removes injured dice from the combat line.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// 1) Parachute drift — always lands on a valid hex; drifts off the chosen hex on some seeds
let offmap = 0, drifted = 0;
for (let s = 0; s < 80; s++) {
  const g = E.newGame({ numPlayers: 2, seed: s, allAI: true });
  const p = E.curP(g); p.pos = null; g.needsParachute = true; g.phase = "parachute";
  const tk = E.towerKey(g), tc = g.board[tk];
  E.parachute(g, tk);
  if (!g.board[E.hexKey(p.pos.q, p.pos.r)]) offmap++;
  if (p.pos.q !== tc.q || p.pos.r !== tc.r) drifted++;
}
A(offmap === 0, "parachute always lands on a valid board hex");
A(drifted > 0, `parachute drift occurs across seeds (${drifted}/80)`);

// 2) equippedClose detection
const ge = E.newGame({ numPlayers: 2, seed: 1, allAI: true });
const pe = ge.players[0]; pe.backpack = ["survival_knife"]; E.autoEquip(pe);
A(E.equippedClose(pe) && E.equippedClose(pe).id === "survival_knife", "equippedClose finds the equipped close weapon");

// 3) Close-weapon modify — Survival Knife turns highest die into a skull (deterministic rng)
const g3 = E.newGame({ numPlayers: 2, seed: 9, allAI: true });
const a3 = g3.players[0], t3 = g3.players[1];
a3.pos = { q: 1, r: 0 }; t3.pos = { q: 1, r: 0 }; g3.needsParachute = false; g3.phase = "action"; g3.activePlayer = 0;
a3.injuries = 3; a3.actionDice = 2; a3.defensePool = 2; a3.backpack = ["survival_knife"]; E.autoEquip(a3);  // owned = 2
t3.injuries = 0; t3.actionDice = 5; t3.defensePool = 5; t3.backpack = []; E.autoEquip(t3);
const seq = [0.4, 0.4, 0, 0, 0, 0, 0]; let qi = 0; g3.rnd = () => (qi < seq.length ? seq[qi++] : Math.random());
E.doClose(g3, 1);   // attacker rolls [3,3] -> knife -> [skull,3] -> aSkulls 1
A(g3.lastCombat.aSkulls === 1, `Survival Knife modify produced a skull (aSkulls=${g3.lastCombat.aSkulls})`);

// 4) Two-handed weapons occupy both hand slots (rules ~04:08)
const g4 = E.newGame({ numPlayers: 2, seed: 1, allAI: true });
const p4 = g4.players[0]; p4.backpack = ["combat_shotgun", "survival_knife"]; E.autoEquip(p4);
A(p4.equipped.hand.length === 1 && p4.equipped.hand[0] === "combat_shotgun",
  "two-handed weapon fills both hands (no second hand weapon equipped)");
const p4b = g4.players[1]; p4b.backpack = ["bow_arrow", "survival_knife"]; E.autoEquip(p4b);
A(p4b.equipped.hand.length === 2, "two single-hand weapons fill both hand slots");

// 5) Stealth — Active Camouflage: only rangeable from the same hex
const g5 = E.newGame({ numPlayers: 2, seed: 2, allAI: true });
const tk5 = E.towerKey(g5), tc5 = g5.board[tk5];
const a5 = g5.players[0], t5 = g5.players[1];
a5.pos = { q: tc5.q, r: tc5.r }; a5.defensePool = 3; a5.backpack = ["combat_shotgun"]; E.autoEquip(a5);
g5.phase = "action"; g5.activePlayer = 0;
let goodNb = null;
for (const nbk of E.neighbors(g5, tc5.q, tc5.r)) {
  const c = g5.board[nbk]; t5.pos = { q: c.q, r: c.r }; t5.backpack = []; E.autoEquip(t5);
  if (E.rangedTargets(g5, a5).includes(1)) { goodNb = c; break; }
}
A(!!goodNb, "found an adjacent hex with clear LOS for the stealth test");
t5.pos = { q: goodNb.q, r: goodNb.r }; t5.backpack = ["active_camo"]; E.autoEquip(t5);
A(E.hasStealth(t5), "Active Camouflage grants stealth");
A(!E.rangedTargets(g5, a5).includes(1), "stealth blocks ranged attack from distance 1");
t5.pos = { q: tc5.q, r: tc5.r };
A(E.rangedTargets(g5, a5).includes(1), "stealth target IS rangeable from the same hex");

// 6) fourToFive close modify (Active Camouflage): a rolled 4 becomes 5 -> wins vs a 4
const g6 = E.newGame({ numPlayers: 2, seed: 4, allAI: true });
const a6 = g6.players[0], t6 = g6.players[1];
a6.pos = { q: tc5.q, r: tc5.r }; t6.pos = { q: tc5.q, r: tc5.r }; g6.phase = "action"; g6.activePlayer = 0;
a6.injuries = 4; a6.actionDice = 1; a6.defensePool = 1; a6.backpack = ["active_camo"]; E.autoEquip(a6); // owns 1 die
t6.injuries = 4; t6.actionDice = 1; t6.defensePool = 1; t6.backpack = []; E.autoEquip(t6);             // owns 1 die
const seq6 = [0.6, 0.5]; let qi6 = 0; g6.rnd = () => (qi6 < seq6.length ? seq6[qi6++] : 0.5); // a rolls 4, t rolls 4
E.doClose(g6, 1);
A(g6.lastCombat.shooter.includes(5) && g6.lastCombat.dealt >= 1,
  `fourToFive turned attacker's 4 into 5 and won the column (dealt=${g6.lastCombat.dealt})`);

// 7) Pain Killer — free heal, then discarded to the matching discard pile
const g7 = E.newGame({ numPlayers: 2, seed: 5, allAI: true });
const p7 = E.curP(g7); p7.injuries = 2; p7.actionDice = 3; p7.backpack = ["pain_killer"]; g7.phase = "action";
const dpre = p7.defensePool;
A(E.usableSpecials(g7, p7).some(e => e.id === "pain_killer"), "Pain Killer listed as usable while injured");
A(E.useSpecialItem(g7, "pain_killer"), "useSpecialItem(pain_killer) succeeds");
A(p7.injuries === 1 && p7.defensePool === dpre + 1, "Pain Killer healed 1 injury and recovered a die");
A(!p7.backpack.includes("pain_killer") && g7.decks.discard1.includes("pain_killer"), "Pain Killer discarded after use");

// 8) Energy Drink — +1 action die this turn, discarded; boost die NOT usable in combat or as injury
const g8 = E.newGame({ numPlayers: 2, seed: 6, allAI: true });
const p8 = E.curP(g8); p8.backpack = ["energy_drink"]; g8.phase = "action"; const d8 = p8.defensePool;
A(E.useSpecialItem(g8, "energy_drink"), "useSpecialItem(energy_drink) succeeds");
A(p8.defensePool === d8 + 1 && p8.boostDice === 1 && !p8.backpack.includes("energy_drink"), "Energy Drink +1 die and discarded");
A(E.combatDice(p8) === d8, "combatDice excludes the boost die");
// boost die alone cannot start combat
const g8b = E.newGame({ numPlayers: 2, seed: 6, allAI: true });
const tk8 = E.towerKey(g8b), tc8 = g8b.board[tk8];
const a8 = g8b.players[0], t8 = g8b.players[1];
a8.pos = { q: tc8.q, r: tc8.r }; t8.pos = { q: tc8.q, r: tc8.r }; t8.reloadZone = false;
g8b.phase = "action"; g8b.activePlayer = 0;
a8.defensePool = 0; a8.boostDice = 0; a8.backpack = []; E.autoEquip(a8);
A(E.closeTargets(g8b, a8).length === 0, "no close target with 0 combat dice");
a8.backpack = ["energy_drink"]; E.useSpecialItem(g8b, "energy_drink");
A(a8.defensePool === 1 && a8.boostDice === 1, "drinking gave a boost die (pool 1, boost 1)");
A(E.closeTargets(g8b, a8).length === 0, "boost die alone cannot start close combat");
a8.defensePool = 2;  // 1 real + 1 boost
A(E.closeTargets(g8b, a8).length === 1, "with a real die + boost, close combat is allowed");
// boost die can't be taken as injury (it is reserved by the hierarchy)
a8.defensePool = 1; a8.boostDice = 1; a8.combatLine = []; a8.assignedDice = []; a8.injuries = 0;
E.takeInjuries(g8b, a8, 1);
A(a8.defensePool === 1 && a8.injuries === 1, "injury did not consume the reserved boost die from the pool");

// 9) Tactical Explosive — destroys an adjacent trap, then discarded
const g9 = E.newGame({ numPlayers: 2, seed: 7, allAI: true });
const tk9 = E.towerKey(g9), tc9 = g9.board[tk9];
const p9 = E.curP(g9); p9.pos = { q: tc9.q, r: tc9.r }; p9.backpack = ["tactical_explosive"]; g9.phase = "action";
const nb9 = g9.board[E.neighbors(g9, tc9.q, tc9.r)[0]]; nb9.trap = 1; // an enemy trap on an adjacent hex
const tgts9 = E.explosiveTargets(g9, p9);
A(tgts9.some(t => t.kind === "trap"), "explosiveTargets finds the adjacent trap");
const trapT = tgts9.find(t => t.kind === "trap");
A(E.useSpecialItem(g9, "tactical_explosive", trapT), "useSpecialItem(tactical_explosive) succeeds");
A(nb9.trap == null && !p9.backpack.includes("tactical_explosive"), "Tactical Explosive removed the trap and was discarded");

// 10) Mode-aware Superstar threshold (fame-track length)
// weighted fame: each track piece ≈15 fame units → BR 1+2+1=60, Team 1+4+1=90
A(E.superstarThreshold("battleRoyale", 4) === 60, "4p Battle Royale threshold = 60 (Start+2 mid+End)");
A(E.superstarThreshold("team") === 90, "Team threshold = 90 (Start+4 mid+End, longer track)");
A(E.superstarThreshold("battleRoyale", 2) === 90, "2-player uses the longer track (90) per rulebook recommendation");
A(E.newGame({ numPlayers: 2, seed: 8, allAI: true }).superstarFame === 90, "2-player game state.superstarFame = 90");
A(E.newGame({ numPlayers: 4, seed: 8, allAI: true }).superstarFame === 60, "4-player game state.superstarFame = 60");

// 10b) Boost die must NOT persist into the combat line — even when Heal recovers a die mid-turn.
// Scenario (from Codex): injuries 4, drink, spend the real die on an action, then Heal with the boost die.
const g10 = E.newGame({ numPlayers: 2, seed: 11, allAI: true });
const tk10 = E.towerKey(g10), tc10 = g10.board[tk10];
const p10 = E.curP(g10), other10 = g10.players[1];
p10.pos = { q: tc10.q, r: tc10.r }; other10.pos = null; other10.reloadZone = true; // p10 alone -> can Heal
g10.phase = "action"; g10.activePlayer = 0;
// state right after: drank Energy Drink (boost die) + spent the 1 real die on a Run (assignedDice=[1])
p10.injuries = 4; p10.actionDice = 2; p10.defensePool = 1; p10.boostDice = 1; p10.assignedDice = [1]; p10.combatLine = [];
g10.rnd = () => 0.7;                                    // Heal rolls a 5
A(E.doHeal(g10), "Heal succeeds using the boost die");
A(p10.injuries === 3, "Heal reduced injuries 4 -> 3");
A(p10.boostDice === 0, "boost die was the die spent on Heal (real die was kept)");
E.moveAssignedDiceToCombatLine(p10);                   // End Phase
A(!p10.combatLine.includes(5), "boost-die Heal roll (5) did NOT enter the combat line");
A(p10.combatLine.length === 1 && p10.combatLine[0] === 1, "only the real action die remains in the combat line");
A(p10.defensePool === 1, "the recovered real die sits in the defense pool, not the combat line");

// 10c) Tactical Explosive range is enforced by the engine (out-of-range target rejected)
const g10c = E.newGame({ numPlayers: 2, seed: 12, allAI: true });
const tk10c = E.towerKey(g10c), tc10c = g10c.board[tk10c];
const p10c = E.curP(g10c); p10c.pos = { q: tc10c.q, r: tc10c.r }; p10c.backpack = ["tactical_explosive"]; g10c.phase = "action";
// pick a far hex (distance >= 2) and plant a trap there
let farKey = null;
for (const k in g10c.board) { const c = g10c.board[k]; if (E.hexDistance(p10c.pos, c) >= 2) { farKey = k; break; } }
A(!!farKey, "found a far hex for the out-of-range explosive test");
g10c.board[farKey].trap = 1;
A(!E.useSpecialItem(g10c, "tactical_explosive", { key: farKey, kind: "trap" }),
  "engine rejects a Tactical Explosive target outside same/adjacent range");
A(g10c.board[farKey].trap === 1 && p10c.backpack.includes("tactical_explosive"),
  "out-of-range explosive did not destroy the trap nor consume the item");

// 10d) Manual equip: choose at turn start, locked once an action die is assigned (rules 04:00)
const geq = E.newGame({ numPlayers: 2, seed: 21, allAI: true });
const peq = geq.players[0]; geq.activePlayer = 0; geq.phase = "action";
peq.assigned = 0; peq.combatLine = []; peq._closeEndedTurn = false;
peq.backpack = ["light_helmet", "survival_knife", "combat_shotgun", "bow_arrow"];
peq.equipped = { head: null, torso: null, hand: [] };
A(E.canEquip(geq, peq), "can equip at turn start (no die assigned)");
A(E.equipItem(geq, peq, "light_helmet") && peq.equipped.head === "light_helmet", "equip a head item from the backpack");
A(E.equipItem(geq, peq, "combat_shotgun") && peq.equipped.hand.includes("combat_shotgun"), "equip a two-handed weapon");
A(!E.equipItem(geq, peq, "survival_knife"), "two-handed weapon fills both hands — second hand item rejected");
A(E.unequipItem(geq, peq, "combat_shotgun") && peq.equipped.hand.length === 0, "unequip frees the hand slots");
A(E.equipItem(geq, peq, "bow_arrow") && E.equipItem(geq, peq, "survival_knife") && peq.equipped.hand.length === 2, "two single-hand weapons fit");
peq.assigned = 1; peq.hasActed = true;  // a die has now been spent on an action this turn
A(!E.canEquip(geq, peq), "equipment locks once an action die is assigned");
A(!E.equipItem(geq, peq, "light_helmet"), "equip rejected after a die is assigned");
// edge case: spend the last die on an action, then an injury pops it (assigned -> 0). Equipment must stay locked.
const gel = E.newGame({ numPlayers: 2, seed: 22, allAI: true });
const pel = gel.players[0], tel = gel.players[1];
const tkl = E.towerKey(gel), tcl = gel.board[tkl];
pel.pos = { q: tcl.q, r: tcl.r }; gel.activePlayer = 0; gel.phase = "action";
pel.injuries = 0; pel.actionDice = 1; pel.defensePool = 1; pel.assignedDice = []; pel.combatLine = []; pel.hasActed = false;
pel.backpack = ["light_helmet"]; pel.equipped = { head: null, torso: null, hand: [] };
const run = E.legalRuns(gel, pel)[0]; E.doRun(gel, run);     // spend the only die on a Run -> hasActed
E.takeInjuries(gel, pel, 1);                                 // injury pops the spent die: assigned back to 0
A(pel.assigned === 0, "precondition: injury reset assigned to 0");
A(!E.canEquip(gel, pel), "equipment stays locked after a spent die is removed by injury");

// 10f) Blitz — Fastest There Is: a paid Run unlocks one free bonus follow-up step (extra reach, not a free die)
const gbl = E.newGame({ numPlayers: 2, seed: 30, allAI: true });
const bl = gbl.players[0]; bl.character = "blitz";
gbl.activePlayer = 0; gbl.phase = "action"; gbl.needsParachute = false;
const tcb = gbl.board[E.towerKey(gbl)];
bl.pos = { q: tcb.q, r: tcb.r }; bl.actionDice = 5; bl.defensePool = 5; bl._runBonus = false; bl._runBonusUsed = false; bl._noMove = false;
const dp0 = bl.defensePool; A(E.doRun(gbl, E.legalRuns(gbl, bl)[0]) && bl.defensePool < dp0, "Blitz's first Run costs a die (not free)");
A(bl._runBonus === true, "the paid Run unlocked Blitz's bonus step");
const dp1 = bl.defensePool; A(E.doRun(gbl, E.legalRuns(gbl, bl)[0]) && bl.defensePool === dp1 && bl._runBonusUsed === true, "the bonus follow-up step is free (extra hex, no die)");
const dp2 = bl.defensePool; A(E.doRun(gbl, E.legalRuns(gbl, bl)[0]) && bl.defensePool < dp2, "subsequent Runs cost a die again");
// Blitz cannot run from 0 dice cold (the bonus requires a prior paid Run)
const gbz = E.newGame({ numPlayers: 2, seed: 31, allAI: true });
const bz = gbz.players[0]; bz.character = "blitz";
gbz.activePlayer = 0; gbz.phase = "action"; gbz.needsParachute = false;
const tcz = gbz.board[E.towerKey(gbz)];
bz.pos = { q: tcz.q, r: tcz.r }; bz.actionDice = 0; bz.defensePool = 0; bz._runBonus = false; bz._runBonusUsed = false; bz._noMove = false;
A(E.legalRuns(gbz, bz).length === 0, "Blitz cannot Run at 0 dice without a paid Run first");
// a non-Blitz Run always costs a die
const gnb = E.newGame({ numPlayers: 2, seed: 32, allAI: true });
const nb = gnb.players[0]; nb.character = "korat";
gnb.activePlayer = 0; gnb.phase = "action"; gnb.needsParachute = false;
const tcn = gnb.board[E.towerKey(gnb)];
nb.pos = { q: tcn.q, r: tcn.r }; nb.actionDice = 5; nb.defensePool = 5; nb._noMove = false;
A(E.doRun(gnb, E.legalRuns(gnb, nb)[0]) && nb.defensePool < 5, "non-Blitz Run costs a die");

// 11) regression — all-AI games with the new combat/parachute rules still complete
let crashed = 0;
for (let s = 0; s < 25; s++) {
  try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 200, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "25 all-AI games complete with the compliance fixes");

console.log(fails ? `COMPLIANCE TEST FAILED (${fails})` : "COMPLIANCE TEST PASSED");
process.exitCode = fails ? 1 : 0;
