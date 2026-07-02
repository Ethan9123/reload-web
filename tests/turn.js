// node tests/turn.js — play a full all-AI game headlessly; verify it terminates & stays sane.
const E = require("../js/engine.js");
require("../js/ai.js");
const AI = global.RL.ai;

let g = E.newGame({ numPlayers: 4, seed: 7, allAI: true });
let safety = 0;
while (!g.gameOver && safety++ < 3000) AI.takeTurn(g);

console.log("gameOver:", g.gameOver, "round:", g.round, "turns:", g._turnsTaken,
  "events:", g.eventsResolved + "/" + g.eventTotal, "superstar:", !!g.superstar);
console.log("fame:", g.players.map(p => `${p.name}:${E.totalFame(p)}`).join(" "));
console.log("winner:", g.players[g.winner].name);

let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
A(g.gameOver, "game terminated");
A(safety < 3000, "no runaway loop");
A(g.players.every(p => p.pos || p.reloadZone), "all players are on the map or waiting to parachute after RELOAD");
A(g.players.every(p => p.defensePool >= 0), "no negative dice pools");
A(g.superstar || g.eventsResolved === g.eventTotal, "ended via superstar or event-deck exhaustion");
A(g.players.some(p => E.totalFame(p) > 0), "someone earned fame (beacons looted)");
// run several seeds for stability
let crashed = 0;
for (let s = 0; s < 20; s++) {
  try { let h = E.newGame({ numPlayers: 1 + (s % 4 || 2), seed: s, allAI: true }); let n = 0; while (!h.gameOver && n++ < 3000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
  catch (e) { crashed++; console.error("  seed", s, e.message); }
}
A(crashed === 0, "20 mixed-size games all completed without error");

// upload-at-center: beacons are NOT auto-scored; only Activate at the Central Tower uploads them
const u = E.newGame({ numPlayers: 2, seed: 3, allAI: true });
const pp = u.players[u.activePlayer];
pp.carryingBeacons = 3; pp.pos = null;
E.beginTurn(u);
A(pp.fame.beacon === 0, "carried beacons are NOT auto-scored at turn start");
const tk = E.towerKey(u), tc = u.board[tk];
pp.pos = { q: tc.q, r: tc.r }; u.needsParachute = false; u.phase = "action"; pp.defensePool = 5;
A(E.canUpload(u, pp), "canUpload true when on tower carrying beacons");
const okU = E.doActivate(u);
A(okU && pp.fame.beacon === 3 && pp.carryingBeacons === 0, "Activate at Central Tower uploads 3 beacons -> +3 fame");
// not on tower -> cannot upload
const v = E.newGame({ numPlayers: 2, seed: 4, allAI: true });
const vp = v.players[v.activePlayer]; vp.carryingBeacons = 2; vp.pos = { q: 1, r: 0 }; v.needsParachute = false; v.phase = "action"; vp.defensePool = 5;
A(!E.canUpload(v, vp), "cannot upload when not on the Central Tower");

// first event resolves after the first full round, before the first player starts turn 2
const ev = E.newGame({ numPlayers: 2, seed: 22, allAI: true });
let ep = E.curP(ev); ep.pos = { q: 0, r: 0 }; ev.needsParachute = false; ev.phase = "action";
E.endTurn(ev);
A(ev.eventsResolved === 0, "no event before every player has completed their first turn");
ep = E.curP(ev); ep.pos = { q: 0, r: 0 }; ev.needsParachute = false; ev.phase = "action";
E.endTurn(ev);
A(ev.eventsResolved === 1, "first event resolves after the last player completes turn 1");

// assigned numeric dice move to the combat line during End Phase (TRUE model: the dice you PLACED
// on action spaces — with the spaces' set values — become your standing defense; skulls drop)
const dl = E.newGame({ numPlayers: 2, seed: 31, allAI: true });
let dp = E.curP(dl);
dp.pos = { q: 1, r: 0 }; dl.needsParachute = false; dl.phase = "action";
dp.assignedDice = [4, 2, "skull"]; dp.defensePool = 2;   // 3 of 5 dice assigned (e.g. Run 4, Loot 2, Close skull)
E.endTurn(dl);
A(JSON.stringify(dp.combatLine) === JSON.stringify([4, 2]), "End Phase moves numeric assigned dice to combat line, sorted high to low");
A(dp.defensePool === 3 && dp.assigned === 0 && dp.assignedDice.length === 0, "End Phase returns non-combat-line dice to defense pool");

// friendly hideout returns the lowest combat-line die to defense pool
const ho = E.newGame({ numPlayers: 2, seed: 32, allAI: true });
let hp = E.curP(ho);
hp.pos = { q: 1, r: 0 }; hp.hideout = E.hexKey(1, 0); ho.board[hp.hideout].hideouts.push(hp.idx);
ho.needsParachute = false; ho.phase = "action";
hp.assignedDice = [5, 3, 1]; hp.defensePool = 2;   // assigned dice -> combat line, then the hideout returns the lowest
E.endTurn(ho);
A(JSON.stringify(hp.combatLine) === JSON.stringify([5, 3]), "hideout returns the lowest combat-line die");
A(hp.defensePool === 3, "hideout benefit increases defense pool by 1");

// toxin safety only comes from your own hideout or the dome in Battle Royale
const tx = E.newGame({ numPlayers: 2, seed: 33, allAI: true });
let tp = E.curP(tx);
tp.pos = { q: 1, r: 0 }; tx.board[E.hexKey(1, 0)].toxin = true;
tx.board[E.hexKey(1, 0)].hideouts.push(1); tx.players[1].hideout = E.hexKey(1, 0);
tx.needsParachute = false; tx.phase = "action";
E.endTurn(tx);
A(tp.injuries === 1, "enemy hideout does not protect from toxin");

const ot = E.newGame({ numPlayers: 2, seed: 34, allAI: true });
let op = E.curP(ot);
op.pos = { q: 1, r: 0 }; op.hideout = E.hexKey(1, 0); ot.board[op.hideout].toxin = true; ot.board[op.hideout].hideouts.push(op.idx);
ot.needsParachute = false; ot.phase = "action";
E.endTurn(ot);
A(op.injuries === 0, "own hideout protects from toxin");

// injury hierarchy: combat line first, then defense pool, then assigned dice
const ih = E.newGame({ numPlayers: 2, seed: 35, allAI: true });
let ip = E.curP(ih);
ip.injuries = 0; ip.actionDice = 5; ip.combatLine = [5, 2]; ip.dice = [3, 3, 3]; ip.defensePool = 3; ip.assignedDice = [];   // 3 un-placed rolled dice back the defense pool
E.takeInjuries(ih, ip, 1);
A(JSON.stringify(ip.combatLine) === JSON.stringify([5]) && ip.injuries === 1 && ip.defensePool === 3, "injury hierarchy takes the lowest combat-line die first");
ip.combatLine = [];
E.takeInjuries(ih, ip, 1);
A(ip.defensePool === 2 && ip.injuries === 2, "injury hierarchy takes from defense pool after combat line");
ip.dice = []; ip.defensePool = 0; ip.assignedDice = [4, 1]; ip.assigned = 2;
E.takeInjuries(ih, ip, 1);
A(JSON.stringify(ip.assignedDice) === JSON.stringify([4]) && ip.assigned === 1 && ip.injuries === 3, "injury hierarchy falls back to assigned dice");

// small injuries reduce combat-line dice and only convert to real injuries when a die drops below 1
const si = E.newGame({ numPlayers: 2, seed: 36, allAI: true });
let sp = E.curP(si);
sp.combatLine = [4, 2]; sp.defensePool = 3; sp.injuries = 0; sp.actionDice = 5;
let converted = E.applySmallInjuriesToPlayer(si, sp, 1);
A(converted === 0 && JSON.stringify(sp.combatLine) === JSON.stringify([4, 1]) && sp.injuries === 0, "small injury reduces the lowest combat-line die");
converted = E.applySmallInjuriesToPlayer(si, sp, 1);
A(converted === 1 && JSON.stringify(sp.combatLine) === JSON.stringify([4]) && sp.injuries === 1, "small injury on a 1 converts that die to an injury");
sp.combatLine = [];
const noSmall = E.applySmallInjuriesToPlayer(si, sp, 10);
A(noSmall === 0 && sp.injuries === 1, "small injuries do nothing when there is no combat-line die");

console.log(fails ? `TURN TEST FAILED (${fails})` : "TURN TEST PASSED");
process.exitCode = fails ? 1 : 0;
