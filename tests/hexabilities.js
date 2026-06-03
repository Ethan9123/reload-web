// node tests/hexabilities.js — hex Activate abilities (rulebook hex reference): Village draw-3-keep-2.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

function villageKey(g) { return Object.keys(g.board).find(k => g.board[k].terrain === "village"); }
function placeAt(g, p, key) { p.pos = { q: g.board[key].q, r: g.board[key].r }; p.reloadZone = false; }

// 1) canVillageDraw / canActivateHex gating
{
  const g = E.newGame({ numPlayers: 4, seed: 1, allAI: true });
  const p = g.players[0]; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p.actionDice = 5; p.defensePool = 5;
  const vk = villageKey(g); placeAt(g, p, vk);
  A(E.canVillageDraw(g, p), "can Activate-draw while standing on a village");
  A(E.canActivateHex(g, p), "canActivateHex true on a village");
  // move off the village onto a plains/jungle → no village draw
  const nonV = Object.keys(g.board).find(k => !g.board[k].hasTower && g.board[k].terrain !== "village");
  placeAt(g, p, nonV);
  A(!E.canVillageDraw(g, p), "cannot Activate-draw off a village");
  A(!E.canActivateHex(g, p) || E.canUpload(g, p), "canActivateHex false off any activate hex");
}

// 2) Village Activate draws 3 from the 1★ deck, keeps 2, discards 1, spends a die
{
  const g = E.newGame({ numPlayers: 4, seed: 2, allAI: true });
  const p = g.players[0]; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p.actionDice = 5; p.defensePool = 5;
  placeAt(g, p, villageKey(g)); p.backpack = [];
  const deck0 = g.decks.equip1.length, disc0 = g.decks.discard1.length, def0 = p.defensePool;
  A(E.doActivate(g), "doActivate resolves the village ability");
  A(p.backpack.length === 2, "kept 2 cards from the village draw");
  A(g.decks.equip1.length === deck0 - 3, "drew 3 cards from the 1★ deck");
  A(g.decks.discard1.length === disc0 + 1, "discarded the 3rd card");
  A(p.defensePool === def0 - 1, "village Activate spends one action die");
  // repeatable: do it again
  A(E.doActivate(g) && p.backpack.length === 4, "village Activate is repeatable (drew again)");
}

// 2b) gating on cards: empty 1★ deck+discard → no village draw (don't waste a die on an empty deck)
{
  const g = E.newGame({ numPlayers: 4, seed: 22, allAI: true });
  const p = g.players[0]; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p.actionDice = 5; p.defensePool = 5;
  placeAt(g, p, villageKey(g));
  g.decks.equip1 = []; g.decks.discard1 = [];
  A(!E.canVillageDraw(g, p), "no village draw when the 1★ deck AND its discard are both empty");
  A(E.doActivate(g) === false && p.defensePool === 5, "doActivate is a no-op (no die spent) with no 1★ cards");
  // with only a discard pile, the deck reshuffles in and the draw works
  g.decks.discard1 = ["riot_vest", "sickle", "light_helmet", "bow_arrow"]; p.backpack = [];
  A(E.canVillageDraw(g, p), "village draw available once the discard can be reshuffled");
  A(E.doActivate(g) && p.backpack.length === 2, "village draw reshuffles the discard into the deck and draws");
}

// 3) tower upload still works through the generalized doActivate
{
  const g = E.newGame({ numPlayers: 4, seed: 3, allAI: true });
  const p = g.players[0]; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p.actionDice = 5; p.defensePool = 5;
  const tk = E.towerKey(g); placeAt(g, p, tk); p.carryingBeacons = 2; const fame0 = p.fame.beacon;
  A(E.canActivateHex(g, p), "canActivateHex true on the tower while carrying beacons");
  A(E.doActivate(g) && p.fame.beacon === fame0 + 2 && p.carryingBeacons === 0, "tower upload still scores beacons through doActivate");
}

// 4) AI sitting idle on a village draws equipment (and all-AI games still complete)
{
  let crashed = 0;
  for (let s = 0; s < 20; s++) {
    try {
      const g = E.newGame({ numPlayers: 4, mode: "battleRoyale", seed: s + 400, allAI: true });
      let n = 0; while (!g.gameOver && n++ < 6000) AI.takeTurn(g);
      if (!g.gameOver) crashed++;
    } catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  // direct AI check: with NO other objective, an idle bot on a village must Activate-draw → backpack grows.
  const g = E.newGame({ numPlayers: 4, seed: 99, allAI: true });
  const p = g.players[0]; p.persona = null;                       // baseline traits (no aggressive rush / heavy build)
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p.actionDice = 5; p.defensePool = 5;
  placeAt(g, p, villageKey(g)); p.backpack = []; p.hideout = villageKey(g);   // hideout set → skip the build-hideout step
  for (const k in g.board) g.board[k].tokens = g.board[k].tokens.filter(t => t.kind === "flag");  // strip beacons/supplies/crown
  g.crown = null;
  for (const o of g.players) if (o !== p) { o.pos = null; o.reloadZone = true; }  // no enemies on the map → no combat
  const bp0 = p.backpack.length; AI.takeTurn(g);
  A(crashed === 0, "20 all-AI games complete with the village Activate available");
  A(g.players[0].backpack.length > bp0, "an idle AI on a village draws equipment (backpack grew)");
}

// 5) human loot CHOICE: interactive draw pauses for the player to pick which to keep; resolveLoot finalizes
{
  const g = E.newGame({ numPlayers: 4, seed: 30, allAI: false });
  const p = g.players[0]; p.human = true;
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p.actionDice = 5; p.defensePool = 5;
  placeAt(g, p, villageKey(g)); p.backpack = []; p.equipped = { head: null, torso: null, hand: [] };
  // interactive village draw -> pending choice, nothing kept yet
  E.doActivate(g, true);
  A(g.pendingLoot && g.pendingLoot.keep === 2 && g.pendingLoot.drawn.length === 3, "interactive village draw pauses with 3 drawn, keep 2");
  A(p.backpack.length === 0, "nothing is kept until the player chooses");
  // choose to keep indices 0 and 2
  const want = [g.pendingLoot.drawn[0], g.pendingLoot.drawn[2]];
  A(E.resolveLoot(g, [0, 2]), "resolveLoot finalizes the choice");
  A(!g.pendingLoot, "pending choice cleared after resolve");
  A(p.backpack.length === 2 && want.every(id => p.backpack.includes(id)), "exactly the chosen 2 cards are kept");

  // AI / non-interactive path auto-keeps best (no pending)
  const g2 = E.newGame({ numPlayers: 4, seed: 31, allAI: true });
  const a = g2.players[0]; g2.activePlayer = a.idx; E.beginTurn(g2);
  placeAt(g2, a, villageKey(g2)); a.backpack = []; a.defensePool = 5; g2.phase = "action"; g2.needsParachute = false;
  E.doActivate(g2);   // no interactive flag
  A(!g2.pendingLoot && a.backpack.length === 2, "AI village draw auto-keeps 2 with no pending choice");

  // invalid pick count falls back to best (never strands the player)
  const g3 = E.newGame({ numPlayers: 4, seed: 32, allAI: false });
  const q = g3.players[0]; q.human = true; g3.activePlayer = q.idx; g3.phase = "action"; g3.needsParachute = false; q.defensePool = 5;
  placeAt(g3, q, villageKey(g3)); q.backpack = []; q.equipped = { head: null, torso: null, hand: [] };
  E.doActivate(g3, true);
  A(E.resolveLoot(g3, []) && q.backpack.length === 2, "an empty/invalid pick falls back to keeping the best 2");
}

console.log(fails ? `HEX ABILITIES TEST FAILED (${fails})` : "HEX ABILITIES TEST PASSED");
process.exitCode = fails ? 1 : 0;
