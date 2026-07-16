// node tests/personas.js — AI persona roster + trait-driven behaviour.
const E = require("../js/engine.js");
const D = require("../js/data.js");
const AI = require("../js/ai.js");
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const byId = (id) => D.PERSONAS.find(x => x.id === id);

// 1) roster: 20+ distinct personas, each with a name + trait profile
A(D.PERSONAS.length >= 20, `roster has 20+ personas (${D.PERSONAS.length})`);
A(new Set(D.PERSONAS.map(p => p.id)).size === D.PERSONAS.length, "persona ids are unique");
A(D.PERSONAS.every(p => p.name && p.archetype && p.traits && typeof p.traits.aggression === "number"), "every persona has a name, archetype and traits");

// 2) newGame assigns distinct personas (and personas:false disables)
{
  const g = E.newGame({ numPlayers: 4, seed: 1, allAI: true });
  A(g.players.every(p => p.persona && p.persona.id), "every player gets a persona");
  A(new Set(g.players.map(p => p.persona.id)).size === 4, "4 players get 4 distinct personas");
  A(E.newGame({ numPlayers: 4, seed: 1, personas: false }).players.every(p => p.persona == null), "personas:false disables assignment");
}

// helper: rig a 1-vs scenario where player 0 has a clear ranged shot at a non-near-death foe
function rangedScenario(seed, personaId) {
  const g = E.newGame({ numPlayers: 2, seed, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  for (const k in g.board) g.board[k].tokens = [];
  const p = g.players[0], foe = g.players[1];
  p.persona = byId(personaId); p.injuries = 0; p.actionDice = 5; p.defensePool = 5; p.combatLine = [];
  p.backpack = ["combat_shotgun"]; E.autoEquip(p);
  const tk = E.towerKey(g); p.pos = { q: g.board[tk].q, r: g.board[tk].r }; p.reloadZone = false;
  let placed = false;
  for (const nbk of E.neighbors(g, p.pos.q, p.pos.r)) { const c = g.board[nbk]; foe.pos = { q: c.q, r: c.r }; foe.reloadZone = false; foe.injuries = 0; foe.actionDice = 5; foe.defensePool = 5;
    if (E.rangedTargets(g, p).includes(1)) { placed = true; break; } }
  return placed ? g : null;
}

// 3) aggression: a Rusher takes the shot; a Bush Master holds fire (no near-kill)
{
  const gr = rangedScenario(2, "rusher"); A(!!gr, "set up the ranged scenario (rusher)");
  AI.takeTurn(gr);
  // the shot may be followed by a melee finish (which overwrites lastCombat) — check the log for the gunshot
  const shot = gr.log.some(l => l.k === "shootHit" || l.k === "shootMiss");
  A(shot && gr.lastCombat && gr.lastCombat.a === 0, "Rusher (high aggression) opens fire");
  const gb = rangedScenario(2, "bushmaster"); AI.takeTurn(gb);
  A(!gb.log.some(l => l.k === "shootHit" || l.k === "shootMiss"), "Bush Master (low aggression) holds fire on a healthy foe");
}

// 4) vendetta: targets the player who last attacked, even if another is easier to kill
{
  const g = E.newGame({ numPlayers: 3, seed: 3, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  for (const k in g.board) g.board[k].tokens = [];
  const p = g.players[0]; p.persona = byId("vendetta");
  p.injuries = 0; p.actionDice = 1; p.defensePool = 1; p.backpack = ["combat_shotgun"]; E.autoEquip(p);   // one die = one attack, so lastCombat is unambiguously the vendetta target
  const tk = E.towerKey(g), tc = g.board[tk]; p.pos = { q: tc.q, r: tc.r };
  // both foes share our hex (d=0 -> ranged sees both, no LOS issues). f1 is easier (injured), f2 is the grudge.
  const f1 = g.players[1], f2 = g.players[2];
  f1.pos = { q: tc.q, r: tc.r }; f1.reloadZone = false; f1.injuries = 1; f1.actionDice = 4; f1.defensePool = 4;  // injured but not near-death (INJURY_ZONE=4 => nearDeath at >=2, so no closeKill)
  f2.pos = { q: tc.q, r: tc.r }; f2.reloadZone = false; f2.injuries = 0; f2.actionDice = 5; f2.defensePool = 5;
  p._lastAttacker = 2;
  const rt = E.rangedTargets(g, p);
  A(rt.includes(1) && rt.includes(2), "both foes are valid ranged targets");
  AI.takeTurn(g);
  A(g.lastCombat && g.lastCombat.a === 0 && g.lastCombat.t === 2, "Vendetta shoots the grudge target (last attacker), not the easier kill");
}

// 4b) targeting: line softness is a TIE-BREAKER, never an override (Codex P2 on PR #46).
// pickTarget scores injuries*100 - lineStrength - pool*0.5; since a line maxes at 5x5=25 and the pool
// term at 2.5, the 27.5 ceiling can never cross the 100-per-injury step. Codex's exact counter-example:
// a 2-injury enemy behind [5,5,5] must still outrank a healthier 1-injury enemy with an empty line.
{
  const g = E.newGame({ numPlayers: 3, seed: 8, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  for (const k in g.board) g.board[k].tokens = [];
  const p = g.players[0]; p.persona = null;                       // no vendetta/leaderHunt override
  p.injuries = 0; p.actionDice = 5; p.defensePool = 5; p.spacesUsed = {}; p.cardSpacesUsed = {};
  p.backpack = ["combat_shotgun"]; E.autoEquip(p);
  const tk = E.towerKey(g), tc = g.board[tk]; p.pos = { q: tc.q, r: tc.r }; p.reloadZone = false;
  const hurt = g.players[1], healthy = g.players[2];
  // both share the attacker's hex so they are unambiguously both legal ranged targets (d=0)
  hurt.pos = { q: tc.q, r: tc.r }; hurt.reloadZone = false;
  hurt.injuries = 2; hurt.combatLine = [5, 5, 5]; hurt.defensePool = 0;      // wounded but DUG IN
  healthy.pos = { q: tc.q, r: tc.r }; healthy.reloadZone = false;
  healthy.injuries = 1; healthy.combatLine = []; healthy.defensePool = 4;    // softer but healthier
  const rt = E.rangedTargets(g, p);
  A(rt.includes(1) && rt.includes(2), "both the wounded and the healthy enemy are legal targets");
  AI.takeTurn(g);
  A(g.lastCombat && g.lastCombat.a === 0 && g.lastCombat.t === 1,
    "the AI shoots the MORE INJURED enemy even though the healthier one has a softer line");
}

// 5) diplomacy trait gates truce acceptance: a Dove accepts where a Lurker (loner) refuses
{
  const mk = (personaId) => { const g = E.newGame({ numPlayers: 3, seed: 4, allAI: true }); g.players[1].persona = byId(personaId); g.diplomacy.rep[0] = 50; g.rnd = () => 0.5; return g; };
  const gd = mk("dove"); const rd = E.proposeTruce(gd, 0, 1, 3);
  A(rd.accepted === true && E.hasTruce(gd, 0, 1), "Dove (high diplomacy) accepts the truce");
  const gl = mk("lurker"); const rl = E.proposeTruce(gl, 0, 1, 3);
  A(rl.accepted === false && !E.hasTruce(gl, 0, 1), "Lurker (loner) refuses the same truce");
}

// 6) signature chatter: dipTaunt speaks the persona's own line
{
  const g = E.newGame({ numPlayers: 3, seed: 5, allAI: true });
  g.players[0].persona = byId("griefer"); g.rnd = () => 0;
  E.dipTaunt(g, 0);
  A(g.diplomacy.feed.length >= 1 && byId("griefer").lines.includes(g.diplomacy.feed[0].line), "dipTaunt emits the persona's signature line");
}

// 7) regression — all-AI games with personas complete
{
  let crashed = 0;
  for (let s = 0; s < 25; s++) {
    try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 1100, allAI: true }); let n = 0; while (!h.gameOver && n++ < 5000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
    catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, "25 all-AI games with personas complete without error");
}

console.log(fails ? `PERSONAS TEST FAILED (${fails})` : "PERSONAS TEST PASSED");
process.exitCode = fails ? 1 : 0;
