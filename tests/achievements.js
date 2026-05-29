// node tests/achievements.js — achievements module: NEXT instant claims, MOST end-game scoring, announcement.
const E = require("../js/engine.js");
const D = require("../js/data.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const AB = D.ACHIEVEMENT_BY_ID;

// helper: force a specific NEXT card into the faceup board slot 0 with a known fame pile
function forceFaceup(g, id, fameBelow) { g.achievements.board[0] = { id, fameBelow: fameBelow == null ? 1 : fameBelow }; }

// 1) board setup: 3 faceup, each with 1 fame token, deck has the rest
const g1 = E.newGame({ numPlayers: 2, seed: 1, allAI: true });
A(g1.achievements && g1.achievements.board.length === 3, "achievement board deals 3 faceup cards");
A(g1.achievements.board.every(s => s.fameBelow === 1), "each faceup card starts with 1 fame token");
A(g1.achievements.deck.length === D.ACHIEVEMENTS.length - 3, "remaining achievements sit in the deck");
A(E.newGame({ numPlayers: 2, seed: 1, achievements: false }).achievements === null, "module can be turned off");

// 2) MECHANIC (NEXT): the claim helper pays out the accumulated fame pile and replaces the card
const g2 = E.newGame({ numPlayers: 2, seed: 2, allAI: true });
forceFaceup(g2, "mechanic", 3);
const p2 = g2.players[0]; g2.activePlayer = 0;
const fame0 = p2.fame.achievement;
A(E.awardNextAchievement(g2, p2, "trapFame"), "MECHANIC claim succeeds when faceup");
A(p2.fame.achievement === fame0 + 3, "MECHANIC pays the accumulated fame pile (3)");
A(p2.achievementsWon.includes("mechanic"), "claimed card recorded on the player");
A(g2.achievements.board[0].id !== "mechanic", "claimed NEXT card is replaced from the deck");
A(g2.lastAchievement && g2.lastAchievement.id === "mechanic", "lastAchievement recorded for the UI");

// 3) MARTIAL ARTIST via real close combat that RELOADs the opponent
const g3 = E.newGame({ numPlayers: 2, seed: 9, allAI: true });
forceFaceup(g3, "martial_artist", 1);
const a3 = g3.players[0], t3 = g3.players[1];
const tk3 = E.towerKey(g3), tc3 = g3.board[tk3];
a3.pos = { q: tc3.q, r: tc3.r }; t3.pos = { q: tc3.q, r: tc3.r }; g3.phase = "action"; g3.activePlayer = 0;
a3.injuries = 0; a3.actionDice = 5; a3.defensePool = 5; a3.backpack = ["survival_knife"]; E.autoEquip(a3);
t3.injuries = 4; t3.actionDice = 1; t3.defensePool = 1; t3.combatLine = []; t3.backpack = []; E.autoEquip(t3); // near death -> easy RELOAD
const seq = [0.9, 0.9, 0.9, 0.9, 0.9, 0.0]; let qi = 0; g3.rnd = () => (qi < seq.length ? seq[qi++] : 0.0);
E.doClose(g3, 1);
A(t3.reloadZone === true, "close combat RELOADed the opponent (precondition)");
A(a3.achievementsWon.includes("martial_artist"), "MARTIAL ARTIST claimed by the player who RELOADed in close combat");

// 4) DOUBLE TROUBLE: claimable once a player has 2 injury fame in the same turn
const g4 = E.newGame({ numPlayers: 2, seed: 4, allAI: true });
forceFaceup(g4, "double_trouble", 2);
const p4 = g4.players[0]; g4.activePlayer = 0; p4._injFameTurn = 2;
A(E.awardNextAchievement(g4, p4, "twoInjuryFame"), "DOUBLE TROUBLE claimable after 2 injury fame in a turn");
A(p4.achievementsWon.includes("double_trouble"), "DOUBLE TROUBLE recorded");

// 5) MOST end-game scoring: PREDATOR (most reload), TREASURE HUNTER (most beacon)
const g5 = E.newGame({ numPlayers: 2, seed: 7, allAI: true });
g5.achievements.board = [{ id: "predator", fameBelow: 1 }, { id: "treasure_hunter", fameBelow: 1 }, { id: "collector", fameBelow: 1 }];
g5.players[0].fame.reload = 3; g5.players[1].fame.reload = 1;      // p0 predator
g5.players[1].fame.beacon = 5; g5.players[0].fame.beacon = 2;      // p1 treasure hunter
g5.players[0].backpack = ["active_camo"];                          // p0 a 3-star -> collector
E.scoreMostAchievements(g5);
A(g5.players[0].achievementsWon.includes("predator"), "PREDATOR awarded to most RELOAD fame");
A(g5.players[1].achievementsWon.includes("treasure_hunter"), "TREASURE HUNTER awarded to most beacon fame");
A(g5.players[0].achievementsWon.includes("collector"), "COLLECTOR awarded to most 3-star equipment");

// 6) Announcement: awards MOST leaders +1 and refreshes a NEXT card
const g6 = E.newGame({ numPlayers: 2, seed: 8, allAI: true });
g6.achievements.board = [{ id: "predator", fameBelow: 1 }, { id: "marksman", fameBelow: 1 }, { id: "treasure_hunter", fameBelow: 1 }];
g6.players[0].fame.reload = 2;
const before0 = g6.players[0].fame.achievement;
E.resolveAnnouncement(g6);
A(g6.players[0].fame.achievement > before0, "Announcement awards the current MOST leader +1 achievement fame");
A(g6.achievements.board[0].fameBelow >= 2, "Announcement tops up the leftmost card");

// 7) achievement fame counts toward total fame + tie-break, and games still complete
const g7 = E.newGame({ numPlayers: 2, seed: 11, allAI: true });
const tot0 = E.totalFame(g7.players[0]);
g7.players[0].fame.achievement += 2;
A(E.totalFame(g7.players[0]) === tot0 + 2, "achievement fame counts toward total fame");

let crashed = 0;
for (let s = 0; s < 20; s++) {
  try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 400, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "20 all-AI games with the achievements module all complete");

console.log(fails ? `ACHIEVEMENTS TEST FAILED (${fails})` : "ACHIEVEMENTS TEST PASSED");
process.exitCode = fails ? 1 : 0;
