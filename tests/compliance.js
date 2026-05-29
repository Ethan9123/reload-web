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

// 8) Energy Drink — +1 action die this turn, discarded
const g8 = E.newGame({ numPlayers: 2, seed: 6, allAI: true });
const p8 = E.curP(g8); p8.backpack = ["energy_drink"]; g8.phase = "action"; const d8 = p8.defensePool;
A(E.useSpecialItem(g8, "energy_drink"), "useSpecialItem(energy_drink) succeeds");
A(p8.defensePool === d8 + 1 && !p8.backpack.includes("energy_drink"), "Energy Drink +1 die and discarded");

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
A(E.superstarThreshold("battleRoyale") === 16, "Battle Royale threshold = 16 (Start+2 mid+End)");
A(E.superstarThreshold("team") === 28, "Team/2P threshold = 28 (Start+4 mid+End, longer track)");
A(E.newGame({ numPlayers: 2, seed: 8, allAI: true }).superstarFame === 16, "state.superstarFame set from mode");

// 11) regression — all-AI games with the new combat/parachute rules still complete
let crashed = 0;
for (let s = 0; s < 25; s++) {
  try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 200, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "25 all-AI games complete with the compliance fixes");

console.log(fails ? `COMPLIANCE TEST FAILED (${fails})` : "COMPLIANCE TEST PASSED");
process.exitCode = fails ? 1 : 0;
