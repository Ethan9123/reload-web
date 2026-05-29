// node tests/diplomacy.js — diplomacy: truces, focus pacts, reputation, betrayal, human offers.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// 1) AI accepts a truce from a peer/threat with good reputation
{
  const g = E.newGame({ numPlayers: 3, seed: 1, allAI: true });
  g.rnd = () => 0.1;                                  // chatter picks + acceptance roll both pass
  const r = E.proposeTruce(g, 0, 1, 3);
  A(r.ok && r.accepted === true, "AI accepts a reasonable truce");
  A(E.hasTruce(g, 0, 1) && E.truceRoundsLeft(g, 0, 1) === 3, "truce is active for the agreed rounds");
  A(E.friendly(g, 0, 1), "truce partners count as 'do not attack' for the AI");
}

// 2) AI declines a truce from a known backstabber (low reputation)
{
  const g = E.newGame({ numPlayers: 3, seed: 2, allAI: true });
  g.rnd = () => 0.1;
  g.diplomacy.rep[0] = 10;                            // proposer has betrayed before
  const r = E.proposeTruce(g, 0, 1, 3);
  A(r.ok && r.accepted === false && !E.hasTruce(g, 0, 1), "low-reputation proposer is rejected");
}

// 3) attacking a truce partner is a betrayal: breaks the truce + tanks reputation
{
  const g = E.newGame({ numPlayers: 3, seed: 9, allAI: true });
  const a = g.players[0], t = g.players[1];
  const tk = E.towerKey(g), tc = g.board[tk];
  a.pos = { q: tc.q, r: tc.r }; t.pos = { q: tc.q, r: tc.r }; g.phase = "action"; g.activePlayer = 0;
  a.actionDice = 5; a.defensePool = 5; a.backpack = ["survival_knife"]; E.autoEquip(a);
  E.proposeTruce(g, 0, 1, 3); // (may or may not accept) — force a truce directly:
  g.diplomacy.truce[(0 < 1 ? "0,1" : "1,0")] = g.round + 3;
  const rep0 = g.diplomacy.rep[0];
  A(E.hasTruce(g, 0, 1), "precondition: truce in place");
  g.rnd = () => 0.5;
  E.doClose(g, 1);
  A(!E.hasTruce(g, 0, 1), "attacking the partner broke the truce");
  A(g.diplomacy.rep[0] === rep0 - 30, "betrayal dropped the breaker's reputation by 30");
}

// 4) truces expire
{
  const g = E.newGame({ numPlayers: 3, seed: 3, allAI: true });
  g.diplomacy.truce["0,1"] = g.round + 1;
  A(E.hasTruce(g, 0, 1), "truce active this round");
  g.round += 1;                                       // advance past the expiry round
  A(!E.hasTruce(g, 0, 1), "truce no longer active once the round passes its expiry");
}

// 5) proposals to a human are queued, then resolved by respondToOffer
{
  const g = E.newGame({ numPlayers: 3, seed: 4 });    // player 0 is human
  const human = g.players.findIndex(p => p.human);
  const ai = g.players.findIndex(p => !p.human);
  g.rnd = () => 0.1;
  const r = E.proposeTruce(g, ai, human, 3);
  A(r.ok && r.pending === true && g.diplomacy.offers.length === 1, "an AI proposal to the human is queued as an offer");
  A(E.respondToOffer(g, g.diplomacy.offers[0].id, true) && E.hasTruce(g, ai, human), "accepting the offer forms the truce");
}

// 6) focus pact only forms with AI agreement (no unilateral steering)
{
  const g = E.newGame({ numPlayers: 3, seed: 5 });     // player 0 human
  g.players[2].fame.beacon = 6;                         // player 2 is the clear leader
  g.rnd = () => 0.1;
  const human = g.players.findIndex(p => p.human);
  const r = E.proposeFocus(g, human, 2);               // focus the leader -> an AI should agree
  A(r.ok && r.agree >= 1 && g.diplomacy.focus === 2, "focus pact forms when an AI agrees (target = leader)");
  // proposing focus on a non-leader (a weak target) wins no agreement -> no focus set
  const g2 = E.newGame({ numPlayers: 3, seed: 15 });
  g2.players[2].fame.beacon = 6;                        // leader is player 2
  const weak = g2.players.findIndex(p => !p.human && p.idx !== 2);
  g2.rnd = () => 0.1;
  const r2 = E.proposeFocus(g2, g2.players.findIndex(p => p.human), weak);
  A(r2.ok && r2.agree === 0 && g2.diplomacy.focus == null, "no AI agrees to focus a non-leader -> focus is not set unilaterally");
}

// 7) chatter feed records lines
{
  const g = E.newGame({ numPlayers: 3, seed: 6, allAI: true });
  g.rnd = () => 0.1; E.proposeTruce(g, 0, 1, 3);
  A(g.diplomacy.feed.length >= 1 && typeof g.diplomacy.feed[0].line === "string", "chatter feed captures spoken lines");
}

// 8) regression — all-AI games with diplomacy active still complete
{
  let crashed = 0;
  for (let s = 0; s < 25; s++) {
    try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 900, allAI: true }); let n = 0; while (!h.gameOver && n++ < 5000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
    catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, "25 all-AI games with diplomacy complete without error");
}

console.log(fails ? `DIPLOMACY TEST FAILED (${fails})` : "DIPLOMACY TEST PASSED");
process.exitCode = fails ? 1 : 0;
