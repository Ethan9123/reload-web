// ============================================================
// data.js — RELOAD static game data (Arcadia map, characters,
// dice, equipment, fame, tokens). No engine logic here.
// Works in browser (global RL) and Node (module.exports).
// ============================================================
(function (root) {
  "use strict";

  // ---- Dice: values 1-5 + skull. ----
  const DIE_FACES = [1, 2, 3, 4, 5, "skull"];
  const DICE = {
    action: { count: 20, color: "black" },
    shooting: { count: 4, color: "white" },
    boost: { count: 1, color: "green" },
  };
  const START_ACTION_DICE = 5; // per player, reduced by injuries

  // ---- Terrain types (Arcadia uses these 5) ----
  // color = fallback fill until real tile art is wired in.
  const TERRAIN = {
    tower:    { name: "中央塔 Central Tower", color: "#3a6ea5", beacon: false, supply: false },
    jungle:   { name: "丛林 Jungle",          color: "#1f7a3d", beacon: true,  supply: false },
    plains:   { name: "平原 Plains",          color: "#8aa84b", beacon: true,  supply: false },
    mountain: { name: "山地 Mountain",        color: "#6b6f76", beacon: true,  supply: false },
    village:  { name: "村庄 Village",         color: "#b08948", beacon: false, supply: "2star" },
  };

  // ---- Arcadia map: 19 hexes (axial q,r) = center + ring1(6) + ring2(12) ----
  // Terrain counts match the rulebook legend: tower1 jungle6 plains5 mountain3 village4.
  // Token setup (rules): beacon on each jungle/mountain/plains (14), 2-star supply box
  // on each village (4), 3 neutral walls around the tower, 2 linked portals.
  // NOTE: arrangement is a faithful-by-counts approximation of the printed Arcadia map;
  // refine exact tile positions later against Reload_Map_Book_Core_WEB.pdf p.1.
  const ARCADIA = {
    name: "Arcadia",
    hexes: [
      { q: 0,  r: 0,  terrain: "tower" },
      // ring 1
      { q: 1,  r: 0,  terrain: "jungle" },
      { q: 1,  r: -1, terrain: "jungle" },
      { q: 0,  r: -1, terrain: "plains" },
      { q: -1, r: 0,  terrain: "mountain" },
      { q: -1, r: 1,  terrain: "village" },
      { q: 0,  r: 1,  terrain: "plains" },
      // ring 2
      { q: 2,  r: 0,  terrain: "jungle" },
      { q: 2,  r: -1, terrain: "plains" },
      { q: 2,  r: -2, terrain: "village" },
      { q: 1,  r: -2, terrain: "jungle" },
      { q: 0,  r: -2, terrain: "mountain" },
      { q: -1, r: -1, terrain: "plains" },
      { q: -2, r: 0,  terrain: "jungle" },
      { q: -2, r: 1,  terrain: "village" },
      { q: -2, r: 2,  terrain: "plains" },
      { q: -1, r: 2,  terrain: "mountain" },
      { q: 0,  r: 2,  terrain: "jungle" },
      { q: 1,  r: 1,  terrain: "village" },
    ],
    // portals link as a set: a Run from any portal hex reaches any other portal hex.
    portals: [{ q: 2, r: -2 }, { q: -2, r: 2 }],
    // neutral walls sit on 3 edges of the tower (edge = direction index 0..5).
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 2 }, { q: 0, r: 0, edge: 4 }],
    zones: 6,
  };

  // axial neighbor directions (pointy-top), index 0..5
  const HEX_DIRS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ];

  // ---- Characters (4). Battle Royale uses the Auto-Heal board side. ----
  // Only Dax's ability text is in the core rulebook (p.12); the other three are on
  // their character reference cards (not yet transcribed) — TODO fill abilities.
  // mini = figurine standee (transparent PNG, from TTS Figurine_Custom diffuse);
  // card = full character reference card. Colors match the figurine plastic.
  // Abilities transcribed from each character's reference card. impl=true ones are
  // wired into engine.js; Blitz's text is partly truncated on the card (character action).
  const CHARACTERS = [
    { id: "korat", name: "Korat", color: "#3b9ad6",
      ability: { id: "gift_from_father", name: "Gift From Father", impl: true,
                 text: "When resolving a Supply Box token, draw 1 additional card." },
      mini: "assets/characters/Korat_2.png", card: "assets/characters/Korat_card.png" },
    { id: "duke",  name: "Duke",  color: "#3aa84b",
      ability: { id: "sharpshooter", name: "Sharpshooter", impl: true,
                 text: "When taking a Ranged Combat action, increase the value of any shooting die by 1." },
      mini: "assets/characters/Duke_2.png",  card: "assets/characters/Duke_card.png" },
    { id: "dax",   name: "Dax",   color: "#c8459b",
      ability: { id: "unrivaled_agility", name: "Unrivaled Agility", impl: true,
                 text: "End Phase: place the bottom die of Dax's combat line into his defense pool." },
      mini: "assets/characters/Dax_2.png",   card: "assets/characters/Dax_card.png" },
    { id: "blitz", name: "Blitz", color: "#e0c93a",
      // Card: a character-action Run space (die value 3) — an EXTRA Run action only Blitz has.
      // Our engine has no per-action-space caps (Run is unlimited), so we model the bonus reach as:
      // Blitz's first Run each turn costs no action die (and can be taken even with 0 dice).
      ability: { id: "fastest_there_is", name: "Fastest There Is", impl: true,
                 text: "His extra Run action — Blitz's first Run each turn is free (no action die spent)." },
      mini: "assets/characters/Blitz_2.png", card: "assets/characters/Blitz_card.png" },
  ];

  // ---- Fame token types ----
  const FAME = {
    injury:     { name: "Injury",      supply: 30 },
    beacon:     { name: "Beacon",      supply: 20 },
    teamSpirit: { name: "Team Spirit", supply: 20 },
    reload:     { name: "Reload",      supply: 15 },
    // NOTE: physical game has no dedicated "trap" token; we track trap fame as a
    // separate counter (placeholder supply) since the rules call it a fame source.
    trap:       { name: "Trap",        supply: 99 },
    achievement: { name: "Achievement", supply: 30 },   // Achievements module fame (its own token color)
  };

  // ---- Achievements module (Reload modules rulebook). 8 cards: 4 "next" + 4 "most". ----
  // NEXT  = scored mid-game, the next player to fulfil the condition claims the card + its fame tokens.
  // MOST  = scored at End of Game, awarded to the player(s) with the most of the metric.
  // Card art indices map to assets/cards/Achievement_Deck/00..07.png (verified by montage).
  const ACHIEVEMENTS = [
    { id: "martial_artist",   name: "Martial Artist", cn: "格斗家",   type: "next", metric: "closeReload",
      desc: "成为下一位在近战中迫使对手 RELOAD 的玩家。", card: "assets/cards/Achievement_Deck/00.png" },
    { id: "marksman",         name: "Marksman",       cn: "神射手",   type: "next", metric: "rangedReload",
      desc: "成为下一位在远程战斗中迫使对手 RELOAD 的玩家。", card: "assets/cards/Achievement_Deck/05.png" },
    { id: "mechanic",         name: "Mechanic",       cn: "机械师",   type: "next", metric: "trapFame",
      desc: "成为下一位获得陷阱名望的玩家。", card: "assets/cards/Achievement_Deck/02.png" },
    { id: "double_trouble",   name: "Double Trouble", cn: "祸不单行", type: "next", metric: "twoInjuryFame",
      desc: "成为下一位在同一回合获得 2 个受伤名望的玩家。", card: "assets/cards/Achievement_Deck/07.png" },
    { id: "predator",         name: "Predator",       cn: "掠食者",   type: "most", metric: "reload",
      desc: "游戏结束时，声望轨上 RELOAD 名望最多的玩家。", card: "assets/cards/Achievement_Deck/03.png" },
    { id: "treasure_hunter",  name: "Treasure Hunter", cn: "寻宝者",  type: "most", metric: "beacon",
      desc: "游戏结束时，声望轨上信标名望最多的玩家。", card: "assets/cards/Achievement_Deck/06.png" },
    { id: "jack_of_all_trades", name: "Jack of All Trades", cn: "万事通", type: "most", metric: "variety",
      desc: "游戏结束时，声望轨上名望种类（颜色）最多的玩家。", card: "assets/cards/Achievement_Deck/04.png" },
    { id: "collector",        name: "Collector",      cn: "收藏家",   type: "most", metric: "threeStar",
      desc: "游戏结束时，拥有最多 3★ 装备（装备中+背包）的玩家。", card: "assets/cards/Achievement_Deck/01.png" },
  ];

  // ---- Equipment slots ----
  const SLOTS = { head: 1, torso: 1, hand: 2 }; // limits while equipped

  // ---- Equipment (MVP subset). Effect text from Reload_Equipment_Cards_2.0.pdf. ----
  // Weapon numeric stats (dice/range/bonus) confirmed from the rulebook where shown;
  // others use sensible defaults and are flagged verify:true to check vs card art.
  // bonus.effect: per shooting-die that matches an assigned action-die value.
  const EQUIPMENT = [
    // --- 1-star ---
    { id: "energy_drink", name: "Energy Drink", star: 1, slot: "special",
      effect: "Gain the green boost die this turn (not usable in combat / as injury)." },
    { id: "pain_killer", name: "Pain Killer", star: 1, slot: "special", anytime: true,
      effect: "Heal 1 die. Usable any time, cannot interrupt an action." },
    { id: "ap_ammo", name: "AP Ammo", star: 1, slot: "special",
      effect: "Ranged combat: increase one white die by 1; this attack ignores armor." },
    { id: "bow_arrow", name: "Bow & Arrow", star: 1, slot: "hand",
      combat: "ranged", range: [0, 0], dice: 2, verify: true,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged in same hex; each match = 1 small injury." },
    { id: "collapsible_baton", name: "Collapsible Baton", star: 1, slot: "hand",
      combat: "close", modify: "lowestTo3", effect: "Close combat: your lowest rolled die becomes 3." },
    { id: "light_helmet", name: "Light Helmet", star: 1, slot: "head",
      armor: { smallInjuryReduce: 1 }, effect: "Reduces small injuries dealt to you by 1." },
    { id: "riot_vest", name: "Riot Vest", star: 1, slot: "torso",
      armor: { smallInjuryReduce: 1 }, effect: "Reduces small injuries dealt to you by 1." },
    { id: "sickle", name: "Sickle", star: 1, slot: "hand",
      combat: "close", modify: "twoOrThreeTo4", effect: "Close combat: turn one rolled 2 or 3 into a 4." },
    { id: "tactical_explosive", name: "Tactical Explosive", star: 1, slot: "special",
      effect: "Same/adjacent hex, over walls: destroy a trap, wall, or hideout." },
    { id: "tool_kit", name: "Tool Kit", star: 1, slot: "special",
      effect: "When taking a Build action, increase the die value by 1." },
    // --- a few 2-star for real combat variety ---
    { id: "combat_shotgun", name: "Combat Shotgun", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 1], dice: 3,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 injury." },
    { id: "assault_rifle", name: "Assault Rifle", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 1], dice: 3, verify: true,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 small injury." },
    { id: "sniper_rifle", name: "Sniper Rifle", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 2], dice: 2, verify: true, needsLOS: true,
      bonus: { type: "injury", amount: 2 }, effect: "Ranged up to 2 hexes w/ LOS; each match = 2 injuries." },
    { id: "survival_knife", name: "Survival Knife", star: 2, slot: "hand",
      combat: "close", modify: "highestToSkull", effect: "Close combat: turn your highest rolled die into a skull." },
    { id: "military_vest", name: "Military Vest", star: 2, slot: "torso",
      armor: { skullReduce: 1 }, effect: "Reduces injuries from skulls by 1." },
    { id: "military_helmet", name: "Military Helmet", star: 2, slot: "head",
      armor: { skullReduce: 1 }, effect: "Reduces injuries from skulls by 1." },
    { id: "medkit", name: "Medkit", star: 2, slot: "hand",
      heal: { skullUpgrade: true }, effect: "Heal action: turn rolled die into skull to heal twice." },
    // --- 3-star ---
    { id: "active_camo", name: "Active Camouflage", star: 3, slot: "hand",
      combat: "close", modify: "fourToFive", stealth: true,
      effect: "Close combat: turn a rolled 4 into 5. Stealth — you can only be targeted by ranged attacks from the same hex." },
  ];

  // ---- Actions ----
  const ACTIONS = {
    run:      { name: "Run",      restricted: false, desc: "Move to an adjacent hex (or portal-to-portal)." },
    loot:     { name: "Loot",     restricted: false, desc: "Open a supply box OR pick up a fame token here." },
    activate: { name: "Activate", restricted: false, desc: "Resolve an Activate ability on this hex." },
    build:    { name: "Build",    restricted: true,  desc: "Place/move trap, hideout, or up to 2 walls; or demolish." },
    heal:     { name: "Heal",     restricted: true,  desc: "Heal self (1) or teammate (2); skull heals +1." },
    ranged:   { name: "Ranged Combat", restricted: false, combat: true },
    close:    { name: "Close Combat",  restricted: false, combat: true, endsTurn: true },
  };

  // ---- Per-player-count setup (from rulebook) ----
  const SETUP = {
    // event deck = 2 Supply Drops + N random events
    eventRandom: { 2: 14, 3: 16, 4: 18 },
    walls: 6,   // per player/team
    traps: 6,   // per player
  };

  // ---- Map token / hideout art (from the TTS mod) ----
  const TOKEN_ART = {
    beacon: "assets/tokens/Beacon_Fame.png",
    supply: "assets/tokens/2-Star_Supply.png",
    portal: "assets/hexes/Portal.png",
    toxin:  "assets/tokens/Toxin.png",
    dome:   "assets/tokens/Dome.png",
    achievement: "assets/tokens/Achievement_Fame.png",
  };
  const HIDEOUT_ART = {
    korat: "assets/tokens/Blue_Hideout.png", duke: "assets/tokens/Green_Hideout.png",
    dax:   "assets/tokens/Purple_Hideout.png", blitz: "assets/tokens/Yellow_Hideout.png",
  };
  // illustrated terrain hex tiles (cropped from the map book Arcadia legend)
  const TILE_ART = {
    tower: "assets/hexes/tile_tower.png", jungle: "assets/hexes/tile_jungle.png",
    plains: "assets/hexes/tile_plains.png", mountain: "assets/hexes/tile_mountain.png",
    village: "assets/hexes/tile_village.png",
  };

  // ---- Event cards (counts from rulebook p.12; effects are faithful interpretations) ----
  const EVENTS = {
    contamination:  { name: "Contamination 污染", count: 12, desc: "毒气向中心扩张一圈" },
    supply_drop:    { name: "Supply Drop 补给空投", count: 3,  desc: "在 2 个空格补充 2★ 补给箱" },
    dome:           { name: "The Dome 穹顶", count: 2, desc: "在中央塔降下穹顶（安全区，免疫毒气）" },
    ex_tech:        { name: "Ex-Tech Drop 高科技空投", count: 2, desc: "投放 2 个 3★ 补给箱" },
    gift_fans:      { name: "Gift from the Fans 粉丝馈赠", count: 1, desc: "每位玩家抽 1 张 1★ 装备" },
    gift_producers: { name: "Gift from the Producers 制作人馈赠", count: 1, desc: "名望最低者抽 1 张 2★ 装备" },
    gift_sponsors:  { name: "Gift from the Sponsors 赞助商馈赠", count: 1, desc: "每位玩家 +1 携带信标" },
    // Achievements module: 2 Announcement cards score MOST achievements mid-game + refresh a NEXT card.
    announcement:   { name: "Announcement 战报", count: 2, desc: "结算「最多」成就并刷新一张「下一位」成就", achievementsOnly: true },
  };

  const DATA = {
    DIE_FACES, DICE, START_ACTION_DICE, TERRAIN, ARCADIA, HEX_DIRS,
    CHARACTERS, FAME, SLOTS, EQUIPMENT, ACTIONS, SETUP, TOKEN_ART, HIDEOUT_ART, TILE_ART, EVENTS, ACHIEVEMENTS,
    EQUIP_BY_ID: Object.fromEntries(EQUIPMENT.map(e => [e.id, e])),
    ACHIEVEMENT_BY_ID: Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a])),
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  root.RL = Object.assign(root.RL || {}, { data: DATA });
})(typeof globalThis !== "undefined" ? globalThis : this);
