// node tests/events.js — real event deck + effects.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const sup = (g) => Object.values(g.board).reduce((s, c) => s + c.tokens.filter(t => t.kind === "supply").length, 0);
const tox = (g) => Object.values(g.board).filter(c => c.toxin).length;

let g = E.newGame({ numPlayers: 4, seed: 1, allAI: true, achievements: false });
A(g.decks.event.length === 20, `4p base event deck = 20 (got ${g.decks.event.length})`);
A(g.decks.event.every(id => typeof id === "string" && !/^event_/.test(id)), "deck holds real event ids (no stubs)");
A(g.decks.event.filter(id => id === "supply_drop").length >= 2, "≥2 Supply Drops guaranteed");
A(g.decks.event.every(id => id !== "announcement"), "no Announcement cards when achievements module is off");
// with the achievements module on (default), the 2 Announcement cards are added
let ga = E.newGame({ numPlayers: 4, seed: 1, allAI: true });
A(ga.decks.event.length === 22, `4p event deck with achievements = 22 (got ${ga.decks.event.length})`);
A(ga.decks.event.filter(id => id === "announcement").length === 2, "2 Announcement cards added with the module");
A(ga.eventTotal === 22, `eventTotal matches deck size with module (${ga.eventTotal})`);

let g2 = E.newGame({ numPlayers: 4, seed: 2, allAI: true });
const tb = tox(g2); E.resolveEvent(g2, "contamination");
A(tox(g2) > tb, `Contamination spreads toxin (${tb} -> ${tox(g2)})`);

let g3 = E.newGame({ numPlayers: 4, seed: 3, allAI: true });
// Supply Drop refills EACH village; villages start full, so loot one empty first
const vk = Object.keys(g3.board).find(k => g3.board[k].terrain === "village");
g3.board[vk].tokens = g3.board[vk].tokens.filter(t => t.kind !== "supply");
E.resolveEvent(g3, "supply_drop");
A(g3.board[vk].tokens.some(t => t.kind === "supply" && t.star === 2), "1st Supply Drop refills a looted village with a 2★ box");
// the 2nd Supply Drop escalates to 3★ (empty a village again to receive it)
g3.board[vk].tokens = g3.board[vk].tokens.filter(t => t.kind !== "supply");
E.resolveEvent(g3, "supply_drop");
A(g3.board[vk].tokens.some(t => t.kind === "supply" && t.star === 3), "2nd Supply Drop escalates to a 3★ box");
E.resolveEvent(g3, "ex_tech");
A(Object.values(g3.board).some(c => c.tokens.some(t => t.star === 3)), "Ex-Tech Drop places 3★ supply");

let g4 = E.newGame({ numPlayers: 4, seed: 4, allAI: true });
E.resolveEvent(g4, "dome");
A(g4.board[E.towerKey(g4)].dome === true, "The Dome lands on the Central Tower");

let g5 = E.newGame({ numPlayers: 4, seed: 5, allAI: true });
const packs = g5.players.map(p => p.backpack.length);
E.resolveEvent(g5, "gift_fans");
A(g5.players.every((p, i) => p.backpack.length === packs[i] + 1), "Gift from Fans: each player +1 card");

let g6 = E.newGame({ numPlayers: 4, seed: 6, allAI: true });
E.resolveEvent(g6, "gift_sponsors");
A(g6.players.every(p => p.carryingBeacons >= 1), "Gift from Sponsors: each +1 carried beacon");

// full all-AI games with real events still terminate cleanly
let crashed = 0;
for (let s = 0; s < 15; s++) {
  try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 50, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "15 all-AI games with real events all completed");

console.log(fails ? `EVENTS TEST FAILED (${fails})` : "EVENTS TEST PASSED");
process.exitCode = fails ? 1 : 0;
