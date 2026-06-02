// node tests/events_crown_quake.js — Hunter's Crown + Earthquake events (from the playthrough videos)
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// helper: a started 4p battle-royale game with a couple of players placed on the board
function game(seed) {
  const g = E.newGame({ numPlayers: 4, mode: "battleRoyale", seed, allAI: true });
  E.beginTurn(g);
  return g;
}
function placeOnBoard(g, p, key) { p.pos = { q: g.board[key].q, r: g.board[key].r }; p.reloadZone = false; }
function anyHex(g) { return Object.keys(g.board).find(k => !g.board[k].hasTower); }

// 1) crown drops on a hex; lootOptions offers it (unlike a flag)
{
  const g = game(11);
  E.placeCrown(g);
  A(g.crown && g.crown.at && g.crown.carrier == null, "placeCrown sets state.crown with an at-hex and no carrier");
  A(g.board[g.crown.at].tokens.some(t => t.kind === "crown"), "a crown token sits on the chosen hex");
  const p = g.players[0]; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false;
  placeOnBoard(g, p, g.crown.at); p.actionDice = 5; p.defensePool = 5;
  A(E.lootOptions(g, p).some(t => t.kind === "crown"), "the crown IS a lootable token (a generic Loot can pick it up)");
}

// 1b) crown never lands on toxin while a toxin-free non-tower hex exists (Codex P2)
{
  const g = game(17);
  // toxify the entire outer ring so the preferred candidates are gone, but leave inner hexes clean
  const tc = g.board[Object.keys(g.board).find(k => g.board[k].hasTower)];
  const ring = g.maxRing;
  for (const k in g.board) { const c = g.board[k]; if (!c.hasTower && E.hexDistance({ q: c.q, r: c.r }, { q: tc.q, r: tc.r }) === ring) c.toxin = true; }
  const cleanLeft = Object.keys(g.board).some(k => !g.board[k].hasTower && !g.board[k].toxin);
  A(cleanLeft, "setup: toxin-free non-tower hexes still exist after toxifying the outer ring");
  E.placeCrown(g);
  A(g.crown && !g.board[g.crown.at].toxin, "crown falls on a toxin-free hex when one is available");
}

// 2) loot the crown -> carrying; banked as fame at the START of your NEXT turn (out of circulation)
{
  const g = game(12);
  E.placeCrown(g);
  const p = g.players[0]; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false;
  placeOnBoard(g, p, g.crown.at); p.actionDice = 5; p.defensePool = 5;
  const ci = E.lootOptions(g, p).findIndex(t => t.kind === "crown");
  A(E.doLoot(g, ci), "looting the crown succeeds");
  A(p.carryingCrown && g.crown.carrier === p.idx, "player now carries the crown");
  A(!Object.keys(g.board).some(k => g.board[k].tokens.some(t => t.kind === "crown")), "crown token removed from the board while carried");
  const fame0 = p.fame.crown;
  E.beginTurn(g);                       // start of the holder's next turn -> bank it
  A(p.fame.crown === fame0 + E.CROWN_FAME && !p.carryingCrown, "holding the crown into your turn banks it as +CROWN_FAME fame");
  A(g.crown.carrier == null, "after banking, the crown is out of circulation");
  A(E.totalFame(p) >= E.CROWN_FAME, "crown fame counts toward total fame");
}

// 3) being reloaded while holding the crown hands it to the killer
{
  const g = game(13);
  const victim = g.players[0], killer = g.players[1];
  placeOnBoard(g, victim, anyHex(g));
  victim.carryingCrown = true; g.crown = { at: null, carrier: victim.idx };
  E.reloadPlayer(g, victim, killer);
  A(!victim.carryingCrown && killer.carryingCrown, "the killer steals the crown on reload");
  A(g.crown.carrier === killer.idx, "crown state points to the new holder");
}

// 4) reload with NO attacker (toxin) drops the crown on the hex
{
  const g = game(14);
  const victim = g.players[0]; const k = anyHex(g);
  placeOnBoard(g, victim, k);
  victim.carryingCrown = true; g.crown = { at: null, carrier: victim.idx };
  E.reloadPlayer(g, victim, null);
  A(!victim.carryingCrown, "victim no longer carries the crown");
  A(g.board[k].tokens.some(t => t.kind === "crown") && g.crown.at === k, "the crown drops onto the hex where they fell");
}

// 4c) Cody & Buzz's drone grabs an adjacent crown correctly (Codex P2)
{
  const g = game(16);
  E.placeCrown(g);
  const p = g.players.find(x => x.character === "codybuzz") || g.players[0];
  p.character = "codybuzz"; g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p._droneUsed = false;
  const ck = g.crown.at, cc = g.board[ck];
  const nb = E.neighbors ? null : null;   // place the drone adjacent to the crown
  // stand on a neighbour of the crown hex
  const adj = Object.keys(g.board).find(k => { const c = g.board[k]; return E.hexDistance({ q: c.q, r: c.r }, { q: cc.q, r: cc.r }) === 1; });
  placeOnBoard(g, p, adj); p.actionDice = 5; p.defensePool = 5;
  const opt = E.droneLootOptions(g, p).find(o => o.kind === "crown");
  A(!!opt, "drone loot options include the adjacent crown");
  A(E.doDroneLoot(g, opt.key, opt.tokenIdx), "drone loots the crown");
  A(p.carryingCrown && g.crown.carrier === p.idx, "drone-looting the crown sets the carrier (not lost/stale)");
  A(!Object.keys(g.board).some(k => g.board[k].tokens.some(t => t.kind === "crown")), "crown token removed from the board after drone loot");
}

// 5) earthquake: a skull on the re-roll injures; otherwise the top die just changes
{
  // force the RNG into a skull on the first roll by searching seeds where the top die becomes a skull
  let injuredSomewhere = false, changedSomewhere = false;
  for (let s = 0; s < 40 && !(injuredSomewhere && changedSomewhere); s++) {
    const g = game(200 + s);
    const p = g.players[0]; placeOnBoard(g, p, anyHex(g));
    p.combatLine = [4, 3, 2]; p.injuries = 0; p.actionDice = 5;
    const before = { line: p.combatLine.slice(), inj: p.injuries };
    E.earthquakeReroll(g);
    if (p.injuries > before.inj) injuredSomewhere = true;                 // a rolled skull became an injury
    else if (JSON.stringify(p.combatLine) !== JSON.stringify(before.line)) changedSomewhere = true;  // top die re-rolled
  }
  A(injuredSomewhere, "earthquake can turn a re-rolled skull into an injury");
  A(changedSomewhere, "earthquake otherwise just re-rolls the top combat-line die");
}

// 5b) one skull on a single-die re-roll removes exactly ONE die, not two (Codex P2)
{
  // find a seed whose first earthquake roll for player 0 is a skull
  let checked = false;
  for (let s = 0; s < 80 && !checked; s++) {
    const g = game(900 + s);
    const p = g.players[0]; placeOnBoard(g, p, anyHex(g));
    p.combatLine = [4, 3, 2]; p.injuries = 0; p.actionDice = 5;
    E.earthquakeReroll(g);
    if (p.injuries === 1) {   // exactly one skull happened on the single top-die re-roll
      A(p.combatLine.length === 2, "one earthquake skull removes exactly one combat-line die (4,3,2 -> two remain, no double-drop)");
      checked = true;
    }
  }
  A(checked, "exercised the single-skull earthquake case");
}

// 5c) on a mountain, the re-roll touches the top TWO dice — never re-rolls the same die twice
{
  // combat line [5,4,1] on a mountain (die faces are 1-5; 6 is the skull face). No-skull rolls keep
  // the bottom die (1) and the line length; the original top pair [5,4] should not always both survive.
  let ok = true, sawTwoChanged = false, sawNoSkull = false;
  for (let s = 0; s < 60; s++) {
    const g = game(1300 + s);
    const p = g.players[0];
    const mk = Object.keys(g.board).find(k => g.board[k].terrain === "mountain");
    if (!mk) { ok = false; break; }
    placeOnBoard(g, p, mk); p.combatLine = [5, 4, 1]; p.injuries = 0; p.actionDice = 5;
    E.earthquakeReroll(g);
    if (p.injuries === 0) {   // no skulls this run: still 3 dice, bottom 1 preserved
      sawNoSkull = true;
      if (p.combatLine.length !== 3 || !p.combatLine.includes(1)) ok = false;
      if (!(p.combatLine.includes(5) && p.combatLine.includes(4))) sawTwoChanged = true;   // the original 5&4 didn't both survive -> both were re-rolled
    }
  }
  A(ok && sawNoSkull, "mountain earthquake keeps the untouched bottom die and the line length (no-skull case)");
  A(sawTwoChanged, "mountain earthquake re-rolls TWO distinct top dice (original 5,4 don't always both survive)");
}

// 6) earthquake ignores players not on the board (parachute/reloaded)
{
  const g = game(15);
  const off = g.players[2]; off.pos = null; off.reloadZone = true; off.combatLine = [5, 5]; off.injuries = 0;
  E.earthquakeReroll(g);
  A(off.injuries === 0 && off.combatLine.length === 2, "a player off the map is untouched by the earthquake");
}

// 7) both events are in the deck pool and resolve without error across many all-AI games
{
  let crashed = 0, sawCrown = false, sawQuake = false;
  for (let s = 0; s < 25; s++) {
    try {
      const g = E.newGame({ numPlayers: 4, mode: "battleRoyale", seed: s + 700, allAI: true });
      let n = 0; while (!g.gameOver && n++ < 6000) AI.takeTurn(g);
      if (!g.gameOver) crashed++;
      if (g.players.some(p => p.fame.crown > 0) || g.crown) sawCrown = true;
    } catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  // resolveEvent directly to guarantee coverage of both branches
  try { const g = game(999); E.resolveEvent(g, "crown"); E.resolveEvent(g, "earthquake"); sawQuake = true; } catch (e) { console.error(e.message); }
  A(crashed === 0, "25 all-AI games with crown/earthquake in the pool complete without error");
  A(sawQuake, "resolveEvent('crown') and resolveEvent('earthquake') run cleanly");
}

console.log(fails ? `CROWN/QUAKE TEST FAILED (${fails})` : "CROWN/QUAKE TEST PASSED");
process.exitCode = fails ? 1 : 0;
