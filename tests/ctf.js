// node tests/ctf.js — Capture the Flag (奪旗賽): bases, flags, grab, score, reset on capture/RELOAD.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

// 1) setup: 2 teams, 2 bases on opposite ends, each base holds its own flag
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 1, allAI: true });
  A(g.isTeam && g.flags && g.flags.length === 2, "CTF is a 2-team mode with a flags state");
  const b0 = E.baseKeyOf(g, 0), b1 = E.baseKeyOf(g, 1);
  A(b0 && b1 && b0 !== b1, "two distinct team bases assigned");
  A(g.flags[0].home === b0 && g.flags[0].at === b0 && g.flags[1].home === b1, "each flag starts at its own base");
  A(g.board[b0].tokens.some(t => t.kind === "flag" && t.team === 0), "team-0 flag token sits on base 0");
  A(g.players.every(p => p.team === 0 || p.team === 1), "players split into 2 teams");
  // parachute deploys at your own base
  const p0 = g.players[0]; A(E.legalParachute(g).includes(E.baseKeyOf(g, p0.team)), "parachute options include your own base");
}

// 2) grab the ENEMY flag at the enemy base
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 2, allAI: true });
  const p = g.players[0]; const et = p.team === 0 ? 1 : 0;
  const eb = E.baseKeyOf(g, et);
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false;
  p.pos = { q: g.board[eb].q, r: g.board[eb].r }; p.actionDice = 5; p.defensePool = 5; p.carryingFlag = null;
  A(E.canGrabFlag(g, p), "can grab the enemy flag while on the enemy base");
  A(E.grabFlag(g) && p.carryingFlag === et, "grabFlag picks up the enemy flag");
  A(g.flags[et].carrier === p.idx && g.flags[et].at == null, "flag now carried (not on a hex)");
  A(!g.board[eb].tokens.some(t => t.kind === "flag" && t.team === et), "flag token removed from the enemy base");
  // can't grab a second flag while already carrying
  A(!E.canGrabFlag(g, p), "cannot grab another flag while already carrying one");
}

// 3) cannot grab your OWN flag
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 3, allAI: true });
  const p = g.players[0]; const ownBase = E.baseKeyOf(g, p.team);
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false;
  p.pos = { q: g.board[ownBase].q, r: g.board[ownBase].r }; p.actionDice = 5; p.defensePool = 5;
  A(!E.canGrabFlag(g, p), "standing on your own base does not let you grab your own flag");
}

// 4) score: carry the enemy flag to your own base -> flag fame + capture + flag resets home
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 4, allAI: true });
  const p = g.players[0]; const et = p.team === 0 ? 1 : 0;
  const ownBase = E.baseKeyOf(g, p.team), enemyBase = E.baseKeyOf(g, et);
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false;
  p.pos = { q: g.board[ownBase].q, r: g.board[ownBase].r }; p.actionDice = 5; p.defensePool = 5;
  p.carryingFlag = et; g.flags[et].carrier = p.idx; g.flags[et].at = null;
  const fame0 = p.fame.flag, cap0 = g.captures[p.team];
  A(E.canScoreFlag(g, p), "can score while carrying the enemy flag on your own base");
  A(E.scoreFlag(g), "scoreFlag succeeds");
  A(p.fame.flag === fame0 + 5 && p.carryingFlag == null, "scoring grants flag fame and drops the carry");
  A(g.captures[p.team] === cap0 + 1, "capture counter increments");
  A(g.flags[et].at === enemyBase && g.board[enemyBase].tokens.some(t => t.kind === "flag" && t.team === et), "captured flag resets to its home base");
}

// 5) RELOAD drops a carried flag back home
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 5, allAI: true });
  const p = g.players[0], a = g.players.find(x => x.team !== p.team); const et = p.team === 0 ? 1 : 0;
  const tk = E.towerKey(g) || E.baseKeyOf(g, p.team);
  p.pos = { q: g.board[tk].q, r: g.board[tk].r }; p.carryingFlag = et; g.flags[et].carrier = p.idx; g.flags[et].at = null;
  E.reloadPlayer(g, p, a);
  A(p.carryingFlag == null && g.flags[et].at === g.flags[et].home, "RELOAD returns the carried flag to its base");
}

// 5b) a generic Loot action can NEVER pick up a flag token (Codex P1 regression)
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 7, allAI: true });
  const p = g.players[0]; const own = E.baseKeyOf(g, p.team);
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false;
  p.pos = { q: g.board[own].q, r: g.board[own].r }; p.actionDice = 5; p.defensePool = 5; p.carryingFlag = null;
  g.board[own].tokens = g.board[own].tokens.filter(t => t.kind === "flag");   // isolate: base holds only its flag
  A(E.lootOptions(g, p).every(t => t.kind !== "flag"), "lootOptions never offers a flag token");
  A(E.doLoot(g, 0) === false, "Loot on a base holding only a flag does nothing (flag stays)");
  A(g.board[own].tokens.some(t => t.kind === "flag" && t.team === p.team) && g.flags[p.team].at === own, "the flag is still home and grabbable after a failed loot");
  // with a beacon ALSO present, loot takes the beacon and leaves the flag
  g.board[own].tokens.push({ kind: "beacon" }); const before = p.carryingBeacons || 0;
  A(E.doLoot(g, 0), "Loot succeeds when a beacon is present");
  A((p.carryingBeacons || 0) === before + 1, "loot grabbed the beacon, not the flag");
  A(g.board[own].tokens.some(t => t.kind === "flag"), "the flag token is untouched by looting the beacon");
}

// 5c) Cody & Buzz's drone must not loot a flag token either (Codex P1 #2)
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 8, allAI: true });
  const p = g.players.find(x => x.character === "codybuzz") || g.players[0];
  p.character = "codybuzz"; const own = E.baseKeyOf(g, p.team);
  g.activePlayer = p.idx; g.phase = "action"; g.needsParachute = false; p._droneUsed = false;
  p.pos = { q: g.board[own].q, r: g.board[own].r }; p.actionDice = 5; p.defensePool = 5;
  g.board[own].tokens = g.board[own].tokens.filter(t => t.kind === "flag");   // base holds only its flag
  A(E.droneLootOptions(g, p).every(o => o.kind !== "flag"), "drone loot options never include a flag");
  const flagIdx = g.board[own].tokens.findIndex(t => t.kind === "flag");
  A(E.doDroneLoot(g, own, flagIdx) === false, "doDroneLoot refuses a flag token");
  A(g.board[own].tokens.some(t => t.kind === "flag"), "the flag survives a drone-loot attempt");
}

// 5d) CTF uses the longer team Superstar track, not the short Battle-Royale one (Codex P2)
{
  const ctf = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 9, allAI: true });
  const team = E.newGame({ numPlayers: 4, mode: "team", seed: 9, allAI: true });
  const br = E.newGame({ numPlayers: 4, mode: "battleRoyale", seed: 9, allAI: true });
  A(ctf.superstarFame === team.superstarFame, "CTF Superstar threshold matches the 2v2 team track");
  A(ctf.superstarFame > br.superstarFame, "CTF Superstar threshold is longer than Battle Royale");
}

// 5e) Jack-of-All-Trades variety metric counts flag fame (Codex P2)
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 10, allAI: true });
  const p = g.players[0];
  p.fame = { injury: 1, beacon: 1, teamSpirit: 0, reload: 0, trap: 0, achievement: 0, flag: 0 };
  const before = E.mostMetric(g, p, "variety");
  p.fame.flag = 5;
  A(E.mostMetric(g, p, "variety") === before + 1, "variety metric counts flag as a distinct fame source");
}

// 6) flag fame counts toward total fame
{
  const g = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: 6, allAI: true });
  const p = g.players[0]; const tot0 = E.totalFame(p); p.fame.flag += 5;
  A(E.totalFame(p) === tot0 + 5, "flag fame counts toward total fame");
}

// 7) regression — all-AI CTF games complete (and someone tends to capture)
{
  let crashed = 0, capSeen = false;
  for (let s = 0; s < 15; s++) {
    try { let h = E.newGame({ numPlayers: 4, mode: "captureFlag", seed: s + 1900, allAI: true }); let n = 0; while (!h.gameOver && n++ < 6000) AI.takeTurn(h); if (!h.gameOver) crashed++; if (h.captures && (h.captures[0] + h.captures[1]) > 0) capSeen = true; }
    catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, "15 all-AI CTF games complete without error");
  A(capSeen, "the AI manages to capture flags");
}

console.log(fails ? `CTF TEST FAILED (${fails})` : "CTF TEST PASSED");
process.exitCode = fails ? 1 : 0;
