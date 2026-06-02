// node tests/teammodes.js — 3v3 and 2v2v2 team modes (built on the generic p.team engine).
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };

const teamsOf = (g) => { const m = {}; g.players.forEach(p => { (m[p.team] = m[p.team] || []).push(p.idx); }); return m; };
// turn order is by seat index; no two consecutive seats (wrapping) should share a team
const noBackToBack = (g) => g.players.every((p, i) => p.team !== g.players[(i + 1) % g.players.length].team);

// 1) 3v3 — two teams of three
{
  const g = E.newGame({ numPlayers: 6, seed: 1, allAI: true, mode: "team3v3" });
  const t = teamsOf(g);
  A(g.isTeam && g.players.length === 6, "3v3: 6-player team game");
  A(Object.keys(t).length === 2 && t[0].length === 3 && t[1].length === 3, "3v3: two teams of 3");
  A(noBackToBack(g), "3v3: no back-to-back same-team turns");
  A(g.superstarFame === 28, `3v3: uses the long fame track (28), got ${g.superstarFame}`);
}

// 2) 2v2v2 — three teams of two
{
  const g = E.newGame({ numPlayers: 6, seed: 1, allAI: true, mode: "team2v2v2" });
  const t = teamsOf(g);
  A(Object.keys(t).length === 3, "2v2v2: exactly 3 teams");
  A(t[0].length === 2 && t[1].length === 2 && t[2].length === 2, "2v2v2: three teams of 2");
  A(noBackToBack(g), "2v2v2: no back-to-back same-team turns");
}

// 3) no friendly fire — teammates can't target each other; enemies can
{
  const g = E.newGame({ numPlayers: 6, seed: 2, allAI: true, mode: "team2v2v2" });
  g.needsParachute = false; g.phase = "action"; g.activePlayer = 0;
  const p = g.players[0];
  const mate = g.players.find(x => x.idx !== 0 && E.sameTeam(x, p));
  const foe = g.players.find(x => !E.sameTeam(x, p));
  p.pos = { q: 0, r: 0 }; mate.pos = { q: 0, r: 0 }; foe.pos = { q: 0, r: 0 }; p.defensePool = 5; p.injuries = 0; p.actionDice = 5;
  const ct = E.closeTargets(g, p);
  A(!ct.includes(mate.idx), "no friendly fire: teammate sharing the hex is NOT a target");
  A(ct.includes(foe.idx), "an enemy sharing the hex IS a target");
}

// 4) shared walls — a teammate's barrier is passable to you, an enemy's is not
{
  const g = E.newGame({ numPlayers: 6, seed: 3, allAI: true, mode: "team3v3" });
  g.needsParachute = false; g.phase = "action";
  const p = g.players[0], mate = g.players[2], enemy = g.players[1];   // idx%2 => 0&2 teammates, 1 enemy
  A(E.sameTeam(p, mate) && !E.sameTeam(p, enemy), "3v3: seats 0&2 are teammates, 1 is an enemy");
  p.pos = { q: 1, r: 0 }; p.defensePool = 5;
  g.board[E.hexKey(1, 0)].walls[0] = mate.idx;
  A(E.legalRuns(g, p).includes("2,0"), "a teammate's wall does not block you");
  g.board[E.hexKey(1, 0)].walls[0] = enemy.idx;
  A(!E.legalRuns(g, p).includes("2,0"), "an enemy's wall blocks you");
}

// 5) all-AI games complete and produce a winning team that has the most team fame
{
  let crashed = 0, games = 0, teamWins = 0;
  for (const mode of ["team3v3", "team2v2v2"]) for (let s = 0; s < 6; s++) {
    try {
      let h = E.newGame({ numPlayers: 6, seed: s + 1, allAI: true, allCharacters: true, mode });
      let n = 0; while (!h.gameOver && n++ < 8000) AI.takeTurn(h); games++;
      if (!h.gameOver) { crashed++; continue; }
      if (h.winnerTeam != null) {
        teamWins++;
        const teams = [...new Set(h.players.map(p => p.team))];
        const best = Math.max(...teams.map(t => E.teamFame(h, t)));
        if (E.teamFame(h, h.winnerTeam) !== best) { console.error("    winner is not the top-fame team:", mode, "seed", s); fails++; }
      }
    } catch (e) { crashed++; console.error("    ", mode, "seed", s, e.message); }
  }
  A(crashed === 0, `all-AI 3v3 + 2v2v2 games complete (${games})`);
  A(teamWins === games, `every finished game has a winning team (${teamWins}/${games})`);
}

console.log(fails ? `TEAM MODES TEST FAILED (${fails})` : "TEAM MODES TEST PASSED");
process.exitCode = fails ? 1 : 0;
