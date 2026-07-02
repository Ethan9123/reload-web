// node tests/invariants.js — dice-conservation ledger for the TRUE dice model.
// Every die a player owns is in exactly one place: standing combat line, injury zone, or defense
// pool (boost dice are extra and excluded). The adversarial review of the model rebuild found three
// paths that created/lost dice (End-Phase toxin, Kaiser/Auto-Heal, ranged bonus-injury) — this
// suite fuzzes full AI games and asserts the ledger for every off-turn player after every turn.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;

let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// 1) full-game fuzz: ledger holds for every settled (off-turn, on-map) player
{
  let bad = 0, checks = 0;
  for (let s = 1; s <= 20; s++) {
    const g = E.newGame({ numPlayers: 2 + (s % 3), seed: s * 31, allAI: true });
    let n = 0;
    while (!g.gameOver && n++ < 4000) {
      AI.takeTurn(g);
      for (const p of g.players) {
        if (!p.pos && p.reloadZone) continue;                    // off-map: dice reset by RELOAD
        if (g.players[g.activePlayer] === p) continue;           // mid-own-turn: assigned dice split the ledger
        checks++;
        const total = (p.combatLine || []).length + p.injuries + Math.max(0, p.defensePool - (p.boostDice || 0));
        if (total !== 5 && bad++ < 5) console.error(`    seed ${s} ${p.name}: line ${(p.combatLine || []).length} + inj ${p.injuries} + pool ${p.defensePool} = ${total}`);
      }
    }
  }
  A(bad === 0, `dice ledger (line + injuries + pool = 5) holds for every settled player (${checks} checks)`);
}

// 2) End-Phase toxin takes a REAL die via the injury hierarchy (was: phantom 6th defense die)
{
  const g = E.newGame({ numPlayers: 2, seed: 7, allAI: true });
  const p = E.curP(g);
  p.pos = { q: 1, r: 0 }; g.board[E.hexKey(1, 0)].toxin = true;
  g.needsParachute = false; g.phase = "action";
  p.assignedDice = [4, 3]; p.defensePool = 3; p.injuries = 0;
  E.endTurn(g);
  const total = p.combatLine.length + p.injuries + p.defensePool;
  A(p.injuries === 1 && total === 5, `toxin injury takes a die off the line/pool (line ${p.combatLine.length} + inj 1 + pool ${p.defensePool} = 5)`);
}

// 3) ranged bonus-injuries cannot push line + injuries past the dice a player owns
{
  const g = E.newGame({ numPlayers: 2, seed: 12, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  const A0 = g.players[0], T = g.players[1];
  const tk = E.towerKey(g); A0.pos = { q: g.board[tk].q, r: g.board[tk].r }; A0.reloadZone = false;
  const nb = E.neighbors(g, A0.pos.q, A0.pos.r)[0]; T.pos = { q: g.board[nb].q, r: g.board[nb].r }; T.reloadZone = false;
  A0.backpack = ["combat_shotgun"]; E.autoEquip(A0);
  A0.spacesUsed = {}; A0.cardSpacesUsed = {}; A0.defensePool = 5; A0.injuries = 0;
  T.combatLine = [5, 5, 5, 5, 5]; T.defensePool = 0; T.injuries = 0;      // full standing line, empty pool
  E.doRanged(g, 1);
  const total = T.combatLine.length + T.injuries + T.defensePool;
  A(T.reloadZone || total === 5, `bonus injuries conserve dice (line ${T.combatLine.length} + inj ${T.injuries} + pool ${T.defensePool} = ${total})`);
}

// 4) End-Phase heals (Auto-Heal side) return the healed die to the pool
{
  const g = E.newGame({ numPlayers: 3, seed: 9, allAI: true });
  const p = E.curP(g);
  const o = g.players[(g.activePlayer + 2) % 3];                 // NOT the next player (whose beginTurn would reset the pool)
  p.pos = { q: 0, r: 0 }; g.needsParachute = false; g.phase = "action";
  o.pos = { q: 1, r: 0 }; o.injuries = 2; o.combatLine = [4, 3]; o.defensePool = 1;   // 2+2+1 = 5 ✓
  E.endTurn(g);
  const total = o.combatLine.length + o.injuries + o.defensePool;
  A(o.injuries === 1 && o.defensePool === 2 && total === 5, "auto-heal moves the healed die from the injury zone to the pool");
}

console.log(fails ? `INVARIANTS TEST FAILED (${fails})` : "INVARIANTS TEST PASSED");
process.exitCode = fails ? 1 : 0;
