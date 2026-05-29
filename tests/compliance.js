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

// 4) regression — all-AI games with the new combat/parachute rules still complete
let crashed = 0;
for (let s = 0; s < 25; s++) {
  try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 200, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "25 all-AI games complete with the compliance fixes");

console.log(fails ? `COMPLIANCE TEST FAILED (${fails})` : "COMPLIANCE TEST PASSED");
process.exitCode = fails ? 1 : 0;
