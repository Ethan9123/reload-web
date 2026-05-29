// node tests/team.js — Team Royale: teams, no friendly fire, team win, Team Spirit, shared walls, non-auto-heal.
const E = require("../js/engine.js");
const D = require("../js/data.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const onHex = (g, p, key) => { const c = g.board[key]; p.pos = { q: c.q, r: c.r }; };

// 1) team assignment: teammates seated diagonally (idx % 2)
const g1 = E.newGame({ numPlayers: 4, seed: 1, mode: "team", allAI: true });
A(g1.players.map(p => p.team).join("") === "0101", "4p team assignment is idx%2 (teams {0,2} and {1,3})");
A(E.sameTeam(g1.players[0], g1.players[2]) && !E.sameTeam(g1.players[0], g1.players[1]), "sameTeam: 0&2 teammates, 0&1 opponents");
A(g1.superstarFame === 28, "team mode uses the longer fame track (28)");

// 2) no friendly fire — a teammate on the same hex is not a close/ranged target
const g2 = E.newGame({ numPlayers: 4, seed: 2, mode: "team", allAI: true });
const tk2 = E.towerKey(g2), tc2 = g2.board[tk2];
const a2 = g2.players[0], mate = g2.players[2], foe = g2.players[1];
a2.pos = { q: tc2.q, r: tc2.r }; mate.pos = { q: tc2.q, r: tc2.r }; foe.pos = { q: tc2.q, r: tc2.r };
g2.phase = "action"; g2.activePlayer = 0; a2.defensePool = 5; a2.actionDice = 5;
a2.backpack = ["combat_shotgun"]; E.autoEquip(a2);
const cTargets = E.closeTargets(g2, a2);
A(!cTargets.includes(2) && cTargets.includes(1), "close targets exclude the teammate, include the opponent");
const rTargets = E.rangedTargets(g2, a2);
A(!rTargets.includes(2), "ranged targets exclude the teammate");

// 3) Team Spirit: healing a teammate restores 2 and scores +1 Team Spirit
const g3 = E.newGame({ numPlayers: 4, seed: 3, mode: "team", allAI: true });
const tk3 = E.towerKey(g3), tc3 = g3.board[tk3];
const h3 = g3.players[0], m3 = g3.players[2];
h3.pos = { q: tc3.q, r: tc3.r }; m3.pos = { q: tc3.q, r: tc3.r };
g3.phase = "action"; g3.activePlayer = 0; h3.injuries = 0; h3.defensePool = 5; h3.actionDice = 5;
m3.injuries = 3; m3.actionDice = 2;
g3.rnd = () => 0.1;  // non-skull heal die
const ts0 = h3.fame.teamSpirit;
A(E.canHeal(g3, h3), "can heal (an injured teammate shares the hex)");
A(E.doHeal(g3, 2), "heal the teammate");
A(m3.injuries === 1, "teammate healed 2 (3 -> 1)");
A(h3.fame.teamSpirit === ts0 + 1, "healer scored +1 Team Spirit fame");

// 4) Team Spirit: RELOAD an opponent in the same hex as a teammate -> +1 Team Spirit
const g4 = E.newGame({ numPlayers: 4, seed: 9, mode: "team", allAI: true });
const tk4 = E.towerKey(g4), tc4 = g4.board[tk4];
const a4 = g4.players[0], m4 = g4.players[2], t4 = g4.players[1];
a4.pos = { q: tc4.q, r: tc4.r }; m4.pos = { q: tc4.q, r: tc4.r }; t4.pos = { q: tc4.q, r: tc4.r };
g4.phase = "action"; g4.activePlayer = 0;
a4.injuries = 0; a4.actionDice = 5; a4.defensePool = 5; a4.backpack = ["survival_knife"]; E.autoEquip(a4);
t4.injuries = 4; t4.actionDice = 1; t4.defensePool = 1; t4.combatLine = []; t4.backpack = []; E.autoEquip(t4);
const seq = [0.9, 0.9, 0.9, 0.9, 0.9, 0.0]; let qi = 0; g4.rnd = () => (qi < seq.length ? seq[qi++] : 0.0);
const ts4 = a4.fame.teamSpirit;
E.doClose(g4, 1);
A(t4.reloadZone === true, "opponent RELOADed in close combat (precondition)");
A(a4.fame.teamSpirit === ts4 + 1, "RELOADing next to a teammate scored +1 Team Spirit");

// 5) shared walls — teams share the 6-wall limit
const g5 = E.newGame({ numPlayers: 4, seed: 5, mode: "team", allAI: true });
g5.players[0].barriersUsed = 4; g5.players[2].barriersUsed = 2;   // team 0 already used 6 between them
const tk5 = E.towerKey(g5); const c5 = g5.board[E.neighbors(g5, g5.board[tk5].q, g5.board[tk5].r)[0]];
const p5 = g5.players[0]; p5.pos = { q: c5.q, r: c5.r }; g5.phase = "action"; g5.activePlayer = 0; p5.defensePool = 5; p5.actionDice = 5;
const edge = E.emptyEdges(g5, p5)[0];
A(edge != null && !E.doBuildBarrier(g5, edge), "cannot build past the shared team wall limit (6)");

// 6) non-auto-heal: in Team Royale the End Phase does NOT auto-heal other players
const g6 = E.newGame({ numPlayers: 4, seed: 6, mode: "team", allAI: true });
const tk6 = E.towerKey(g6), tc6 = g6.board[tk6];
const act6 = g6.players[g6.activePlayer]; act6.pos = { q: tc6.q, r: tc6.r }; g6.needsParachute = false; g6.phase = "action";
const other6 = g6.players[(g6.activePlayer + 1) % 4]; other6.injuries = 3; other6.pos = { q: tc6.q, r: tc6.r };
const inj6 = other6.injuries; E.endTurn(g6);
A(other6.injuries === inj6, "Team Royale: no End-Phase auto-heal for other players");

// 7) team end-game scoring picks the higher-fame team
const g7 = E.newGame({ numPlayers: 4, seed: 7, mode: "team", allAI: true });
g7.players[1].fame.beacon = 8;            // team 1 (players 1,3) ahead of team 0
g7._eventsDone = true; g7.decks.event = []; g7._turnsTaken = 99;
const tk7 = E.towerKey(g7), tc7 = g7.board[tk7];
g7.activePlayer = 3;                       // last player in the round -> endTurn triggers endGame
g7.players[3].pos = { q: tc7.q, r: tc7.r };
E.endTurn(g7);
A(g7.gameOver && g7.winnerTeam === 1, "team end-game awards the team with the most fame");

// 8) giveToTeammate transfers equipment to a teammate, once per turn
const g8 = E.newGame({ numPlayers: 4, seed: 8, mode: "team", allAI: true });
g8.activePlayer = 0; g8.phase = "action";
const g8p = g8.players[0]; g8p.backpack = ["medkit"]; g8p._gaveThisTurn = false;
A(E.giveToTeammate(g8, 2, "medkit"), "give equipment to a teammate");
A(g8.players[2].backpack.includes("medkit") && !g8p.backpack.includes("medkit"), "equipment moved to the teammate");
A(!E.giveToTeammate(g8, 2, "medkit"), "only one give per turn");

// 8b) team walls are passable by teammates but block opponents
const g10 = E.newGame({ numPlayers: 4, seed: 14, mode: "team", allAI: true });
g10.phase = "action";
const tcA = g10.board[E.towerKey(g10)];
let edge10 = null, nbKey10 = null;
for (let e = 0; e < 6; e++) {
  const nk = E.hexKey(tcA.q + D.HEX_DIRS[e].q, tcA.r + D.HEX_DIRS[e].r), nb = g10.board[nk];
  if (nb && tcA.walls[e] == null && nb.walls[(e + 3) % 6] == null) { edge10 = e; nbKey10 = nk; break; }
}
A(edge10 != null, "found a clear tower edge for the team-wall test");
tcA.walls[edge10] = 0;                       // wall built by player 0
const mate10 = g10.players[2], opp10 = g10.players[1];
mate10.pos = { q: tcA.q, r: tcA.r }; mate10._noMove = false; mate10.defensePool = 5; mate10.actionDice = 5;
A(E.legalRuns(g10, mate10).includes(nbKey10), "teammate can move through a team-owned wall");
opp10.pos = { q: tcA.q, r: tcA.r }; opp10._noMove = false; opp10.defensePool = 5; opp10.actionDice = 5;
A(!E.legalRuns(g10, opp10).includes(nbKey10), "opponent is blocked by the team-owned wall");

// 8c) building a trap in the same hex as a teammate scores Team Spirit
const g11 = E.newGame({ numPlayers: 4, seed: 15, mode: "team", allAI: true });
const tc11 = g11.board[E.towerKey(g11)];
const p11 = g11.players[0], mate11 = g11.players[2];
p11.pos = { q: tc11.q, r: tc11.r }; mate11.pos = { q: tc11.q, r: tc11.r };
g11.activePlayer = 0; g11.phase = "action"; p11.defensePool = 5; p11.actionDice = 5; p11.trapsUsed = 0;
const ts11 = p11.fame.teamSpirit;
A(E.doBuildTrap(g11), "build a trap while a teammate shares the hex");
A(p11.fame.teamSpirit === ts11 + 1, "trapping next to a teammate scores +1 Team Spirit");

// 9) regression — all-AI team games complete
let crashed = 0;
for (let s = 0; s < 20; s++) {
  try { let h = E.newGame({ numPlayers: 4, seed: s + 600, mode: "team", allAI: true }); let n = 0; while (!h.gameOver && n++ < 4000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "20 all-AI Team Royale games complete");

console.log(fails ? `TEAM TEST FAILED (${fails})` : "TEAM TEST PASSED");
process.exitCode = fails ? 1 : 0;
