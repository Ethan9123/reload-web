// node tests/equipment.js — full v2.0 equipment roster: deck composition, field integrity, new mechanics.
const E = require("../js/engine.js");
const D = require("../js/data.js");
require("../js/ai.js");
const AI = global.RL.ai;
let fails = 0;
const A = (c, m) => { if (!c) { console.error("  FAIL:", m); fails++; } else console.log("  ok:", m); };
const EQ = D.EQUIP_BY_ID;
const byStar = (s) => D.EQUIPMENT.filter(e => e.star === s);

// 1) roster size per tier (unique types) + unique ids
A(byStar(1).length === 13, `13 one-star types (${byStar(1).length})`);
A(byStar(2).length === 18, `18 two-star types (${byStar(2).length})`);
A(byStar(3).length === 29, `29 three-star Ex-Tech types (${byStar(3).length})`);
A(new Set(D.EQUIPMENT.map(e => e.id)).size === D.EQUIPMENT.length, "all equipment ids are unique");

// 2) built decks total the rulebook counts: 32 / 20 (3★ Ex-Tech = 29 of each type)
{
  const g = E.newGame({ numPlayers: 4, seed: 1, allAI: true });
  const oneStarTotal = g.decks.equip1.length + g.decks.discard1.length + g.players.reduce((s, p) => s + p.backpack.filter(id => EQ[id] && EQ[id].star === 1).length, 0);
  A(oneStarTotal === 32, `1★ deck totals 32 cards (deck+discard+backpacks = ${oneStarTotal})`);
  A(g.decks.equip2.length === 20, `2★ deck = 20 cards (${g.decks.equip2.length})`);
  A(g.decks.equip3.length === 29, `3★ Ex-Tech deck = 29 cards (${g.decks.equip3.length})`);
}

// 3) field integrity: ranged weapons have range+dice+bonus|rider, close weapons have a modify, armor pieces have armor
for (const e of D.EQUIPMENT) {
  if (e.combat === "ranged") A(Array.isArray(e.range) && typeof e.dice === "number" && (e.bonus || e.partial), `ranged ${e.id} has range+dice+(bonus|partial)`);
  if (e.combat === "close") A(typeof e.modify === "string", `close ${e.id} has a modify`);
  A(typeof e.name === "string" && typeof e.slot === "string" && typeof e.effect === "string", `${e.id} has name/slot/effect`);
}

// helper: equip a fresh player on the tower with a given backpack
function rig(seed) {
  const g = E.newGame({ numPlayers: 2, seed, allAI: true });
  g.activePlayer = 0; g.phase = "action"; g.needsParachute = false;
  for (const k in g.board) g.board[k].tokens = [];
  const p = g.players[0], foe = g.players[1], tk = E.towerKey(g), tc = g.board[tk];
  p.persona = null; p.pos = { q: tc.q, r: tc.r }; p.injuries = 0; p.actionDice = 5; p.defensePool = 5; p.combatLine = [];
  foe.reloadZone = false; foe.injuries = 0; foe.actionDice = 5; foe.defensePool = 5;
  return { g, p, foe, tc };
}
function clearLOSNeighbor(g, p, foe) {  // place foe on an adjacent hex with a clear shot; returns true if found
  for (const nbk of E.neighbors(g, p.pos.q, p.pos.r)) { const c = g.board[nbk]; foe.pos = { q: c.q, r: c.r };
    if (E.hasLOS(g, p.pos, foe.pos, p.idx)) return true; }
  return false;
}

// 4) Sniper Helmet (diceBonus): adds a shooting die
{
  const { g, p, foe } = rig(2); A(clearLOSNeighbor(g, p, foe), "found a clear adjacent hex");
  p.backpack = ["combat_shotgun", "sniper_helmet"]; E.autoEquip(p);  // shotgun dice 3 + helmet +1
  A(EQ["combat_shotgun"].dice === 3, "shotgun base 3 dice");
  E.doRanged(g, 1, 3);
  A(g.lastCombat && g.lastCombat.shooter.length === 4, `Sniper Helmet added a shooting die (rolled ${g.lastCombat.shooter.length})`);
}

// 5) Jet Pack (rangeBonus): a same/adjacent weapon can reach 2 hexes
{
  const { g, p, foe } = rig(3);
  // find a hex at distance 2 with LOS
  let far = null;
  for (const k in g.board) { const c = g.board[k]; if (E.hexDistance(p.pos, c) === 2 && E.hasLOS(g, p.pos, c, p.idx)) { far = c; break; } }
  A(!!far, "found a distance-2 hex with LOS");
  foe.pos = { q: far.q, r: far.r };
  p.backpack = ["combat_shotgun"]; E.autoEquip(p);          // range [0,1]
  A(!E.rangedTargets(g, p).includes(1), "shotgun alone can't reach 2 hexes");
  p.backpack = ["combat_shotgun", "jet_pack"]; E.autoEquip(p);  // +1 range
  A(E.rangedTargets(g, p).includes(1), "Jet Pack extends range to reach the distance-2 target");
}

// 6) Tactical Helmet (cancelsStealth): can shoot a stealthed enemy at range
{
  const { g, p, foe } = rig(2); A(clearLOSNeighbor(g, p, foe), "clear adjacent hex (stealth test)");
  foe.backpack = ["active_camo"]; E.autoEquip(foe);          // foe has stealth
  p.backpack = ["combat_shotgun"]; E.autoEquip(p);
  A(!E.rangedTargets(g, p).includes(1), "stealth blocks the shot at range");
  p.backpack = ["combat_shotgun", "tactical_helmet"]; E.autoEquip(p);
  A(E.rangedTargets(g, p).includes(1), "Tactical Helmet cancels stealth — shot is allowed");
}

// 7) ignoreArmor (Sonic Cleaver): the skull bypasses the target's Military Vest
function closeSkullVsVest(seed, attackerWeapon) {
  const { g, p, foe } = rig(seed); foe.pos = { q: p.pos.q, r: p.pos.r };  // same hex
  p.injuries = 4; p.actionDice = 1; p.defensePool = 1;       // ownedDice = 5 - injuries = 1, so exactly one rolled die
  foe.injuries = 4; foe.actionDice = 1; foe.defensePool = 1;
  p.backpack = [attackerWeapon]; E.autoEquip(p);
  foe.backpack = ["military_vest"]; E.autoEquip(foe);        // skullReduce 1
  g.rnd = () => 0.25;   // both roll a 2; the close-weapon modify turns a 2 into a skull
  E.doClose(g, 1);
  return g.lastCombat ? g.lastCombat.aSkulls : -1;
}
A(closeSkullVsVest(5, "sonic_cleaver") === 1, "Sonic Cleaver's skull ignores the Military Vest (aSkulls=1)");
A(closeSkullVsVest(5, "machete") === 0, "Machete's skull (no ignoreArmor) is absorbed by the Military Vest (aSkulls=0)");

// 8) Arachnid Pack (extraHand): allows a 3rd hand weapon
{
  const { g, p } = rig(6);
  p.equipped = { head: null, torso: "arachnid_pack", hand: [] }; p.backpack = ["arachnid_pack", "crossbow", "semi_auto_pistol", "survival_knife"];
  A(E.equipItem(g, p, "crossbow") && E.equipItem(g, p, "semi_auto_pistol") && E.equipItem(g, p, "survival_knife"), "Arachnid Pack lets a 3rd hand weapon equip");
  A(p.equipped.hand.length === 3, "three one-hand weapons equipped (extra slot)");
  // swapping the torso away from the Arachnid Pack must drop the now-illegal 3rd hand weapon
  p.backpack.push("military_vest");
  A(E.equipItem(g, p, "military_vest"), "swap torso to Military Vest");
  A(p.equipped.hand.length === 2, "extra hand weapon dropped when the Arachnid Pack is replaced");
}

// 9) "add to any one die" picks the BEST die (highest below 5), not the lowest (Power Glove +2)
{
  const { g, p, foe } = rig(7); foe.pos = { q: p.pos.q, r: p.pos.r };
  p.injuries = 3; p.actionDice = 2; p.defensePool = 2;   // ownedDice = 2
  foe.injuries = 4; foe.actionDice = 1; foe.defensePool = 1;
  p.backpack = ["power_glove"]; E.autoEquip(p); foe.backpack = []; E.autoEquip(foe);
  const seq = [0.0, 0.6]; let qi = 0; g.rnd = () => (qi < seq.length ? seq[qi++] : 0.0);  // attacker rolls [1,4]
  E.doClose(g, 1);
  A(g.lastCombat && g.lastCombat.shooter.includes(5) && g.lastCombat.shooter.includes(1),
    `Power Glove boosted the high die 4->5 (not the 1) — shooter ${g.lastCombat.shooter}`);
}

// 10) regression — all-AI games with the full equipment pool complete
{
  let crashed = 0;
  for (let s = 0; s < 25; s++) {
    try { let h = E.newGame({ numPlayers: 2 + (s % 3), seed: s + 1300, allAI: true }); let n = 0; while (!h.gameOver && n++ < 5000) AI.takeTurn(h); if (!h.gameOver) crashed++; }
    catch (e) { crashed++; console.error("  seed", s, e.message); }
  }
  A(crashed === 0, "25 all-AI games with the full equipment roster complete");
}

// auto-equip on loot: a freshly-looted weapon fills an empty hand slot (supply box + drone)
{
  const g = E.newGame({ numPlayers: 4, seed: 71, allAI: true });
  const p = g.players[0]; g.activePlayer = p.idx; E.beginTurn(g);
  const k = Object.keys(g.board).find(x => !g.board[x].hasTower);
  p.pos = { q: g.board[k].q, r: g.board[k].r }; p.reloadZone = false; g.needsParachute = false; g.phase = "action";
  p.equipped = { head: null, torso: null, hand: [] }; p.backpack = []; p.defensePool = 5;
  g.board[k].tokens.push({ kind: "supply", star: 2 });
  g.decks.equip2.push("riot_vest", "semi_auto_pistol");   // top of deck (popped first)
  A(!E.equippedRanged(p), "starts with no ranged weapon equipped");
  E.doLoot(g, E.lootOptions(g, p).findIndex(t => t.kind === "supply"));
  A(E.equippedRanged(p) && E.equippedRanged(p).id === "semi_auto_pistol", "looting a supply box auto-equips the drawn weapon into the empty hand");
  // drone path: Cody & Buzz auto-equips drone-looted gear too
  const g2 = E.newGame({ numPlayers: 4, seed: 72, allAI: true });
  const cb = g2.players[0]; cb.character = "codybuzz"; g2.activePlayer = cb.idx; E.beginTurn(g2);
  const hk = Object.keys(g2.board).find(x => !g2.board[x].hasTower);
  cb.pos = { q: g2.board[hk].q, r: g2.board[hk].r }; cb.reloadZone = false; g2.needsParachute = false; g2.phase = "action";
  cb.equipped = { head: null, torso: null, hand: [] }; cb.backpack = []; cb.defensePool = 5; cb._droneUsed = false;
  g2.board[hk].tokens.push({ kind: "supply", star: 2 });
  g2.decks.equip2.push("riot_vest", "semi_auto_pistol");
  E.doDroneLoot(g2, hk, g2.board[hk].tokens.findIndex(t => t.kind === "supply"));
  A(E.equippedRanged(cb) && E.equippedRanged(cb).id === "semi_auto_pistol", "drone-looting a supply box auto-equips the weapon too");
}

console.log(fails ? `EQUIPMENT TEST FAILED (${fails})` : "EQUIPMENT TEST PASSED");
process.exitCode = fails ? 1 : 0;
