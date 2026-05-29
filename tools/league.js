// node tools/league.js — persona league: run many all-AI games and report how each persona plays.
// All seats use the same skill policy (hard) so differences reflect PERSONA STYLE, not luck/skill. Personas
// and characters are assigned randomly by newGame, so over many games every persona plays many characters
// against many opponents. Reports per-persona win-rate / avg fame / dominant fame source, and a character board.
//   GAMES=600 NP=4 node tools/league.js
const E = require("../js/engine.js");
require("../js/ai.js");
const D = require("../js/data.js");
const AI = global.RL.ai;

const GAMES = +process.env.GAMES || 600;
const NP = +process.env.NP || 4;
const persona = {}, character = {};
const blank = () => ({ games: 0, wins: 0, fame: 0, combat: 0, objective: 0, other: 0 });
const rec = (m, k) => (m[k] || (m[k] = blank()));

for (let s = 0; s < GAMES; s++) {
  const g = E.newGame({ numPlayers: NP, seed: s + 1, allAI: true, allCharacters: true, difficulty: "hard" });
  let n = 0; while (!g.gameOver && n++ < 6000) AI.takeTurn(g);
  for (const p of g.players) {
    const won = g.winner === p.idx ? 1 : 0, f = p.fame, tot = E.totalFame(p);
    const combat = (f.reload || 0) + (f.injury || 0) + (f.trap || 0);   // fighting fame
    const objective = (f.beacon || 0);                                  // map/objective fame
    const other = tot - combat - objective;                            // team spirit / achievements
    for (const [m, k] of [[persona, p.persona ? p.persona.id : "none"], [character, p.character]]) {
      const r = rec(m, k); r.games++; r.wins += won; r.fame += tot; r.combat += combat; r.objective += objective; r.other += other;
    }
  }
}

const pct = (x) => (x * 100).toFixed(0) + "%";
function styleOf(r) {
  const t = (r.combat + r.objective + r.other) || 1;
  const parts = [["打架", r.combat / t], ["抢点", r.objective / t], ["其他", r.other / t]].sort((a, b) => b[1] - a[1]);
  return `${parts[0][0]}${pct(parts[0][1])}`;
}
function rows(map, nameOf) {
  return Object.entries(map).map(([k, r]) => ({ name: nameOf(k), wr: r.wins / r.games, af: r.fame / r.games, g: r.games, style: styleOf(r) }))
    .sort((a, b) => b.wr - a.wr);
}
const pName = (id) => { const p = D.PERSONAS.find(x => x.id === id); return p ? `${p.name}(${p.archetype})` : id; };
const cName = (id) => { const c = D.CHARACTERS.find(x => x.id === id); return c ? (c.cn ? c.cn : c.name) : id; };

const base = (1 / NP * 100).toFixed(0);
console.log(`\n=== PERSONA LEAGUE — ${GAMES} games, ${NP} players (baseline win-rate ${base}%, all on 'hard' skill) ===`);
console.log("rank persona                                       winRate  avgFame  playstyle");
rows(persona, pName).forEach((r, i) => console.log(
  `${String(i + 1).padStart(2)}  ${r.name.padEnd(44)} ${pct(r.wr).padStart(5)}   ${r.af.toFixed(1).padStart(5)}   ${r.style}`));

console.log(`\n=== CHARACTER LEADERBOARD ===`);
console.log("rank character          winRate  avgFame");
rows(character, cName).forEach((r, i) => console.log(
  `${String(i + 1).padStart(2)}  ${r.name.padEnd(18)} ${pct(r.wr).padStart(5)}   ${r.af.toFixed(1).padStart(5)}`));
