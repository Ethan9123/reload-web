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

  // ---- Action-space columns (rulebook p.6: "Dice are NOT rolled, they are assigned to action
  // spaces with the die value set to match the value of the space"). Values pip-counted off the
  // actual character-board art (all four boards verified individually). Each entry = one space;
  // a column exhausts when every space holds a die (per-turn action caps: 3 Runs, 2 Activates,
  // 3 Loots, 2 Builds, 1 Heal, 1 Close). "roll" = the Heal space (p.7: the placed die IS rolled);
  // "skull" = the Close Combat space (p.10: the die is set to a skull and rolled in combat).
  const ACTION_SPACES = {
    run: [4, 3, 2], activate: [3, 1], loot: [2, 2, 1], build: [3, 2],
    heal: ["roll"], close: ["skull"],
  };
  // Per-character board differences. Blitz — Fastest There Is: his Run column is printed 4/4/2 and a
  // separate character-action Run space (value 2) sits by his name = the designer's "4/4/2/2"
  // (BGG thread 2854288, François Rouzé). The other base abilities are printed passives (no space).
  const CHAR_SPACES = {
    blitz: { run: [4, 4, 2], charRun: [2] },
  };

  // ---- Terrain types (Arcadia uses these 5) ----
  // color = fallback fill until real tile art is wired in.
  const TERRAIN = {
    tower:    { name: "中央塔 Central Tower", color: "#3a6ea5", beacon: false, supply: false },
    jungle:   { name: "丛林 Jungle",          color: "#1f7a3d", beacon: true,  supply: false },
    plains:   { name: "平原 Plains",          color: "#8aa84b", beacon: true,  supply: false },
    mountain: { name: "山地 Mountain",        color: "#6b6f76", beacon: true,  supply: false, moveCost: 2 },
    village:  { name: "村庄 Village",         color: "#b08948", beacon: false, supply: "2star" },
    // ---- special terrains from the map book (new mechanics; interpreted faithfully) ----
    // maze: a labyrinth — slow to cross AND blocks line of sight through it (no shooting across it).
    maze:     { name: "迷宫 Maze",            color: "#6a4f8a", beacon: false, supply: false, moveCost: 2, blocksLOS: true },
    // solar: an energy array — start your turn here and you draw +1 boost die (spendable on actions, not combat).
    solar:    { name: "太阳能阵列 Solar Array", color: "#d9b310", beacon: false, supply: false, energy: true },
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

  // ---- Additional maps, reconstructed from the map-book photos (照片/30-54). Like Arcadia, these are
  // FAITHFUL-BY-COUNTS interpretations: terrain mix, player count and signature feature match the photo,
  // but exact hex positions are hand-laid as a valid contiguous island (the diagrams aren't pixel-readable).
  // tests/maps.js validates contiguity / single tower / portals / token terrains for each. ----

  // Imperial Dynasty — a compact 2-3 player map (13 hexes: Arcadia's footprint with the 6 corners trimmed).
  const IMPERIAL = {
    name: "Imperial Dynasty 帝国皇朝", players: "2-3",
    hexes: [
      { q: 0, r: 0, terrain: "tower" },
      { q: 1, r: 0, terrain: "village" }, { q: 1, r: -1, terrain: "jungle" }, { q: 0, r: -1, terrain: "plains" },
      { q: -1, r: 0, terrain: "mountain" }, { q: -1, r: 1, terrain: "village" }, { q: 0, r: 1, terrain: "plains" },
      { q: 2, r: -1, terrain: "jungle" }, { q: 1, r: 1, terrain: "village" }, { q: -1, r: 2, terrain: "mountain" },
      { q: -2, r: 1, terrain: "village" }, { q: -1, r: -1, terrain: "jungle" }, { q: 1, r: -2, terrain: "plains" },
    ],
    portals: [{ q: 1, r: -2 }, { q: -1, r: 2 }],
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 2 }, { q: 0, r: 0, edge: 4 }],
  };

  // Transit Hub — full 19-hex island whose signature is a FOUR-portal network (any portal reaches any other).
  const TRANSIT = {
    name: "Transit Hub 转运站", players: "4-6",
    hexes: [
      { q: 0, r: 0, terrain: "tower" },
      { q: 1, r: 0, terrain: "village" }, { q: 1, r: -1, terrain: "jungle" }, { q: 0, r: -1, terrain: "plains" },
      { q: -1, r: 0, terrain: "mountain" }, { q: -1, r: 1, terrain: "jungle" }, { q: 0, r: 1, terrain: "plains" },
      { q: 2, r: 0, terrain: "jungle" }, { q: 2, r: -1, terrain: "plains" }, { q: 2, r: -2, terrain: "village" },
      { q: 1, r: -2, terrain: "jungle" }, { q: 0, r: -2, terrain: "mountain" }, { q: -1, r: -1, terrain: "plains" },
      { q: -2, r: 0, terrain: "village" }, { q: -2, r: 1, terrain: "jungle" }, { q: -2, r: 2, terrain: "village" },
      { q: -1, r: 2, terrain: "mountain" }, { q: 0, r: 2, terrain: "plains" }, { q: 1, r: 1, terrain: "village" },
    ],
    portals: [{ q: 2, r: 0 }, { q: -2, r: 0 }, { q: 0, r: -2 }, { q: 0, r: 2 }],
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 3 }],
  };

  // Ring Arena — a larger radius-3 map (25 hexes): plains-heavy arena core + 6 mountain "outpost" spokes.
  // Radius 3 means the toxin storm starts further out (engine reads the map's max ring).
  const RING = {
    name: "Ring Arena 环形争霸战", players: "4-6",
    hexes: [
      { q: 0, r: 0, terrain: "tower" },
      { q: 1, r: 0, terrain: "plains" }, { q: 1, r: -1, terrain: "plains" }, { q: 0, r: -1, terrain: "jungle" },
      { q: -1, r: 0, terrain: "plains" }, { q: -1, r: 1, terrain: "jungle" }, { q: 0, r: 1, terrain: "plains" },
      { q: 2, r: 0, terrain: "village" }, { q: 2, r: -1, terrain: "plains" }, { q: 2, r: -2, terrain: "jungle" },
      { q: 1, r: -2, terrain: "plains" }, { q: 0, r: -2, terrain: "village" }, { q: -1, r: -1, terrain: "plains" },
      { q: -2, r: 0, terrain: "village" }, { q: -2, r: 1, terrain: "plains" }, { q: -2, r: 2, terrain: "jungle" },
      { q: -1, r: 2, terrain: "plains" }, { q: 0, r: 2, terrain: "village" }, { q: 1, r: 1, terrain: "plains" },
      { q: 3, r: 0, terrain: "mountain" }, { q: 3, r: -3, terrain: "mountain" }, { q: 0, r: -3, terrain: "mountain" },
      { q: -3, r: 0, terrain: "mountain" }, { q: -3, r: 3, terrain: "mountain" }, { q: 0, r: 3, terrain: "mountain" },
    ],
    portals: [{ q: 3, r: -3 }, { q: -3, r: 3 }],
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 2 }, { q: 0, r: 0, edge: 4 }],
  };

  // Metropolis — dense urban map whose signature is MAZE blocks (slow + block line of sight =街区死角).
  const METROPOLIS = {
    name: "Metropolis 大都会", players: "3-4",
    hexes: [
      { q: 0, r: 0, terrain: "tower" },
      { q: 1, r: 0, terrain: "maze" }, { q: 1, r: -1, terrain: "village" }, { q: 0, r: -1, terrain: "plains" },
      { q: -1, r: 0, terrain: "maze" }, { q: -1, r: 1, terrain: "village" }, { q: 0, r: 1, terrain: "plains" },
      { q: 2, r: 0, terrain: "jungle" }, { q: 2, r: -1, terrain: "village" }, { q: 2, r: -2, terrain: "plains" },
      { q: 1, r: -2, terrain: "jungle" }, { q: 0, r: -2, terrain: "maze" }, { q: -1, r: -1, terrain: "village" },
      { q: -2, r: 0, terrain: "jungle" }, { q: -2, r: 1, terrain: "mountain" }, { q: -2, r: 2, terrain: "village" },
      { q: -1, r: 2, terrain: "mountain" }, { q: 0, r: 2, terrain: "plains" }, { q: 1, r: 1, terrain: "mountain" },
    ],
    portals: [{ q: 2, r: -2 }, { q: -2, r: 2 }],
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 2 }, { q: 0, r: 0, edge: 4 }],
  };

  // Reactor — energy facility: a ring of SOLAR arrays around the reactor core (the tower) gives free dice.
  const REACTOR = {
    name: "Reactor 反应炉", players: "4-6",
    hexes: [
      { q: 0, r: 0, terrain: "tower" },
      { q: 1, r: 0, terrain: "solar" }, { q: 1, r: -1, terrain: "jungle" }, { q: 0, r: -1, terrain: "plains" },
      { q: -1, r: 0, terrain: "solar" }, { q: -1, r: 1, terrain: "jungle" }, { q: 0, r: 1, terrain: "plains" },
      { q: 2, r: 0, terrain: "village" }, { q: 2, r: -1, terrain: "plains" }, { q: 2, r: -2, terrain: "solar" },
      { q: 1, r: -2, terrain: "jungle" }, { q: 0, r: -2, terrain: "mountain" }, { q: -1, r: -1, terrain: "plains" },
      { q: -2, r: 0, terrain: "village" }, { q: -2, r: 1, terrain: "jungle" }, { q: -2, r: 2, terrain: "solar" },
      { q: -1, r: 2, terrain: "mountain" }, { q: 0, r: 2, terrain: "village" }, { q: 1, r: 1, terrain: "village" },
    ],
    portals: [{ q: 1, r: -2 }, { q: -1, r: 2 }],
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 3 }],
  };

  // Crossfire — an original arena: maze chokes + solar arrays flank the tower (the only map to mix both).
  // The inner ring alternates maze (slow, blocks LOS) and solar (free dice), making the centre tense.
  const CROSSFIRE = {
    name: "Crossfire 十字火力", players: "4-6",
    hexes: [
      { q: 0, r: 0, terrain: "tower" },
      { q: 1, r: 0, terrain: "maze" }, { q: 1, r: -1, terrain: "solar" }, { q: 0, r: -1, terrain: "plains" },
      { q: -1, r: 0, terrain: "maze" }, { q: -1, r: 1, terrain: "solar" }, { q: 0, r: 1, terrain: "plains" },
      { q: 2, r: 0, terrain: "village" }, { q: 2, r: -1, terrain: "jungle" }, { q: 2, r: -2, terrain: "mountain" },
      { q: 1, r: -2, terrain: "plains" }, { q: 0, r: -2, terrain: "village" }, { q: -1, r: -1, terrain: "jungle" },
      { q: -2, r: 0, terrain: "village" }, { q: -2, r: 1, terrain: "jungle" }, { q: -2, r: 2, terrain: "mountain" },
      { q: -1, r: 2, terrain: "plains" }, { q: 0, r: 2, terrain: "village" }, { q: 1, r: 1, terrain: "jungle" },
    ],
    portals: [{ q: 2, r: -2 }, { q: -2, r: 2 }],
    neutralWalls: [{ q: 0, r: 0, edge: 0 }, { q: 0, r: 0, edge: 2 }, { q: 0, r: 0, edge: 4 }],
  };

  const MAPS = { arcadia: ARCADIA, imperial: IMPERIAL, transit: TRANSIT, ring: RING, metropolis: METROPOLIS, reactor: REACTOR, crossfire: CROSSFIRE };

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
      // Our engine has no per-action-space caps, so we model the extra Run as bonus REACH (not a free
      // die): Blitz's first die-paid Run each turn unlocks one extra follow-up hex (a free bonus step).
      // The Run still costs an action die and can't be taken from 0 dice — it just goes one hex further.
      ability: { id: "fastest_there_is", name: "Fastest There Is", impl: true,
                 text: "His extra Run action — after a Run, Blitz may move one more hex (once per turn)." },
      mini: "assets/characters/Blitz_2.png", card: "assets/characters/Blitz_card.png" },
    // ---- Expansion characters (轟隆鳴動 Rumble + 奪旗賽 Capture the Flag). Abilities transcribed from
    // the official Chinese edition. Only drawn into a game when newGame is called with allCharacters:true.
    // Figurine/card art not wired yet (UI falls back to a colored disc + name initial).
    { id: "sora", name: "Sora", cn: "索拉", color: "#1fb6c9", set: "rumble",
      ability: { id: "all_terrain", name: "All-Terrain", impl: true,
                 text: "Moving or running ignores terrain and barrier movement restrictions." } },
    { id: "betty", name: "Betty", cn: "炸彈貝蒂", color: "#e85aa0", set: "rumble",
      ability: { id: "demolitions", name: "Demolitions", impl: true,
                 text: "Once per turn, take a Build action for free (no action die)." } },
    { id: "butcher", name: "Butcher", cn: "布彻", color: "#7a3fb0", set: "rumble",
      ability: { id: "brawler", name: "Brawler", impl: true,
                 text: "Close Combat: before comparing skulls, re-roll the lowest die in your combat line." } },
    { id: "emmet", name: "Emmet", cn: "埃米特", color: "#e8632a", set: "rumble",
      ability: { id: "field_medic", name: "Field Medic", impl: true,
                 text: "Heal is unrestricted; you may re-roll the die assigned to a Heal action." } },
    { id: "echo", name: "Echo", cn: "艾可", color: "#3fcaa0", set: "ctf",
      ability: { id: "cloak", name: "Cloak", impl: true,
                 text: "Stealth: only targetable by ranged attacks from your hex, until you take part in combat." } },
    { id: "diana", name: "Diana", cn: "戴安娜", color: "#9aa7b3", set: "ctf",
      ability: { id: "huntress", name: "Huntress", impl: true,
                 text: "Ranged Combat: range +1, and you may re-roll one shooting die." } },
    { id: "kaiser", name: "Kaiser", cn: "凱薩", color: "#e0a82e", set: "ctf",
      ability: { id: "regeneration", name: "Regeneration", impl: true,
                 text: "End Phase: heal 1 injury." } },
    { id: "codybuzz", name: "Cody & Buzz", cn: "柯蒂與巴茲", color: "#f4b400", set: "ctf",
      ability: { id: "drone_buzz", name: "Drone Buzz", impl: true,
                 text: "Once per turn, assign an action die to the drone Buzz to Loot a token on your hex or an adjacent hex." } },
  ];

  // ---- Fame token types ----
  // `value` = the fame-track length of one token of this type, from the official rulebook's
  // end-of-game scoring legend (p.11): RELOAD 7, Beacon 4, Event/Crown 4, Injury 3,
  // Achievement 3, Team Spirit 2, Trap 2. p.fame[kind] stores the COUNT of tokens; the
  // track position / winner is Σ count × value (a RELOAD is worth far more than a trap).
  const FAME = {
    injury:     { name: "Injury",      supply: 30, value: 3 },
    beacon:     { name: "Beacon",      supply: 20, value: 4 },
    teamSpirit: { name: "Team Spirit", supply: 20, value: 2 },
    reload:     { name: "Reload",      supply: 15, value: 7 },
    // NOTE: physical game has no dedicated "trap" token; we track trap fame as a
    // separate counter (placeholder supply) since the rules call it a fame source.
    trap:       { name: "Trap",        supply: 99, value: 2 },
    achievement: { name: "Achievement", supply: 30, value: 3 },   // Achievements module fame (its own token color)
    flag:       { name: "Flag",        supply: 30, value: 5 },     // Capture the Flag captures (奪旗賽) — expansion, value estimated
    crown:      { name: "Crown",       supply: 10, value: 4 },     // Hunter's Crown = the "Event" fame token (worth 4)
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

  // ---- Equipment — FULL set transcribed from Reload_Equipment_Cards_2.0.pdf (32×1★ / 20×2★ / Ex-Tech 3★). ----
  // range: [min,max] hexes; needsLOS for 2-hex weapons; dice = white shooting dice (verify:true = inferred from
  // weapon type, not read off the card art). bonus = per shooting-die matching the assigned value.
  // modify = close-combat die tweak (engine applyCloseModify). ignoreArmor = this attack bypasses the target's armor.
  // partial:true = the exotic rider (stun/teleport/push/AoE/discard/extra movement/draw) is shown in text but not yet
  // mechanically enforced; the weapon still resolves its normal combat-row damage.
  const EQUIPMENT = [
    // ============ 1-star ============
    { id: "energy_drink", name: "Energy Drink", star: 1, slot: "special",
      effect: "Gain the green boost die this turn (not usable in combat / as injury)." },
    { id: "pain_killer", name: "Pain Killer", star: 1, slot: "special", anytime: true,
      effect: "Heal 1 die. Usable any time, cannot interrupt an action." },
    { id: "ap_ammo", name: "AP Ammo", star: 1, slot: "special", partial: true,
      effect: "Ranged combat: increase one white die by 1; this attack ignores armor." },
    { id: "bow_arrow", name: "Bow & Arrow", star: 1, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 0], dice: 2,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged in the same hex; each match = 1 small injury." },
    { id: "collapsible_baton", name: "Collapsible Baton", star: 1, slot: "hand",
      combat: "close", modify: "lowestTo3", effect: "Close combat: your lowest rolled die becomes a 3." },
    { id: "explosive_trap", name: "Explosive Trap", star: 1, slot: "special", anytime: true, partial: true,
      effect: "When a trap is triggered, the target takes 1 extra injury. Usable any time, cannot interrupt an action." },
    { id: "grenade", name: "Grenade", star: 1, slot: "special", partial: true,
      effect: "Throw into an adjacent hex (over walls). All players there re-roll their 3 highest dice; any skulls = injury." },
    { id: "light_helmet", name: "Light Helmet", star: 1, slot: "head",
      armor: { smallInjuryReduce: 1 }, effect: "Reduces small injuries dealt to you by 1." },
    { id: "riot_vest", name: "Riot Vest", star: 1, slot: "torso",
      armor: { smallInjuryReduce: 1 }, effect: "Reduces small injuries dealt to you by 1." },
    { id: "sickle", name: "Sickle", star: 1, slot: "hand",
      combat: "close", modify: "twoOrThreeTo4", effect: "Close combat: turn one rolled 2 or 3 into a 4." },
    { id: "stun_grenade", name: "Stun Grenade", star: 1, slot: "special", partial: true,
      effect: "Throw into an adjacent hex (over walls). All players there re-roll their highest die and gain a stun token." },
    { id: "tactical_explosive", name: "Tactical Explosive", star: 1, slot: "special",
      effect: "Same/adjacent hex, over walls: destroy a trap, wall, or hideout." },
    { id: "tool_kit", name: "Tool Kit", star: 1, slot: "special", partial: true,
      effect: "When taking a Build action, increase the die value by 1." },

    // ============ 2-star ============
    { id: "assault_rifle", name: "Assault Rifle", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 1], dice: 2,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 small injury." },
    { id: "combat_shotgun", name: "Combat Shotgun", star: 2, slot: "hand", hands: 2, qty: 2,
      combat: "ranged", range: [0, 1], dice: 3,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 injury." },
    { id: "crossbow", name: "Crossbow", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 0], dice: 3,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged in the same hex; each match = 1 injury." },
    { id: "hand_axe", name: "Hand Axe", star: 2, slot: "hand",
      combat: "close", modify: "lowestTo4", effect: "Close combat: turn your lowest rolled die into a 4." },
    { id: "hand_cannon", name: "Hand Cannon", star: 2, slot: "hand",
      combat: "ranged", range: [0, 0], dice: 2,
      bonus: { type: "smallInjury", amount: 2 }, effect: "Ranged in the same hex; each match = 2 small injuries." },
    { id: "machete", name: "Machete", star: 2, slot: "hand",
      combat: "close", modify: "twoOrThreeToSkull", effect: "Close combat: turn one rolled 2 or 3 into a skull." },
    { id: "machine_gun", name: "Machine Gun", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 1], dice: 2,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 small injury." },
    { id: "medkit", name: "Medkit", star: 2, slot: "hand",
      heal: { skullUpgrade: true }, effect: "Heal action: turn the rolled die into a skull to heal twice." },
    { id: "military_helmet", name: "Military Helmet", star: 2, slot: "head",
      armor: { skullReduce: 1 }, effect: "Reduces injuries from skulls by 1." },
    { id: "military_vest", name: "Military Vest", star: 2, slot: "torso",
      armor: { skullReduce: 1 }, effect: "Reduces injuries from skulls by 1." },
    { id: "precision_rifle", name: "Precision Rifle", star: 2, slot: "hand", hands: 2, qty: 2,
      combat: "ranged", range: [0, 1], dice: 2,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 injury." },
    { id: "pump_shotgun", name: "Pump Shotgun", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 0], dice: 2,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged in the same hex; each match = 1 injury." },
    { id: "rocket_launcher", name: "Rocket Launcher", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 2], dice: 4, needsLOS: true,
      bonus: { type: "smallInjury", amount: 2 }, effect: "Ranged up to 2 hexes w/ LOS; each match = 2 small injuries." },
    { id: "semi_auto_pistol", name: "Semi-Auto Pistol", star: 2, slot: "hand",
      combat: "ranged", range: [0, 0], dice: 2,
      bonus: { type: "smallInjury", amount: 2 }, effect: "Ranged in the same hex; each match = 2 small injuries." },
    { id: "sniper_rifle", name: "Sniper Rifle", star: 2, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 2], dice: 2, needsLOS: true,
      bonus: { type: "injury", amount: 2 }, effect: "Ranged up to 2 hexes w/ LOS; each match = 2 injuries." },
    { id: "sub_machine_gun", name: "Sub Machine Gun", star: 2, slot: "hand",
      combat: "ranged", range: [0, 0], dice: 2,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged in the same hex; each match = 1 small injury." },
    { id: "survival_knife", name: "Survival Knife", star: 2, slot: "hand",
      combat: "close", modify: "highestToSkull", effect: "Close combat: turn your highest rolled die into a skull." },
    { id: "tactical_tomahawk", name: "Tactical Tomahawk", star: 2, slot: "hand",
      combat: "close", modify: "oneOrTwoTo4", effect: "Close combat: turn one rolled 1 or 2 into a 4." },

    // ============ 3-star (Ex-Tech) ============
    { id: "active_camo", name: "Active Camouflage", star: 3, slot: "hand",
      combat: "close", modify: "fourToFive", stealth: true,
      effect: "Close combat: turn a rolled 4 into a 5. Stealth — only targetable by ranged attacks from the same hex." },
    { id: "adrenaline_mask", name: "Adrenaline Mask", star: 3, slot: "special",
      effect: "Gain the green boost die this turn (not usable in combat / as injury)." },
    { id: "arachnid_pack", name: "Arachnid Pack", star: 3, slot: "torso", extraHand: 1,
      effect: "You gain one additional hand slot for weapons." },
    { id: "cornucopia", name: "Cornucopia", star: 3, slot: "special", partial: true,
      effect: "Draw 5 stars' worth of cards; equip them or place them in your backpack." },
    { id: "ex01_sniper_rifle", name: "EX-01 Sniper Rifle", star: 3, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 2], dice: 3, needsLOS: true,
      bonus: { type: "injury", amount: 2 }, effect: "Ranged up to 2 hexes w/ LOS; each match = 2 injuries." },
    { id: "ex02_neutralizer", name: "EX-02 Neutralizer", star: 3, slot: "hand", hands: 2, partial: true,
      combat: "ranged", range: [0, 2], dice: 3, needsLOS: true,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged up to 2 hexes w/ LOS; each match = 1 injury + a stun token." },
    { id: "ex103_repulsor", name: "EX-103 Repulsor", star: 3, slot: "hand", partial: true,
      combat: "ranged", range: [0, 1], dice: 2,
      effect: "Ranged same/adjacent; each match pushes the target through hexes (walls/edges stop it & deal 1 injury)." },
    { id: "ex04_translocator", name: "EX-04 Translocator", star: 3, slot: "hand", partial: true,
      combat: "ranged", range: [0, 0], dice: 3,
      effect: "Ranged in the same hex; each match teleports the target to any hex on the map." },
    { id: "ex05_plasma_thrower", name: "EX-05 Plasma Thrower", star: 3, slot: "hand", hands: 2, partial: true,
      combat: "ranged", range: [0, 2], dice: 2, verify: true,
      effect: "Ranged up to 2 hexes, over walls; each match = AoE: all in the hex re-roll 2 highest dice, skulls = injury." },
    { id: "exosuit", name: "Exosuit", star: 3, slot: "torso", partial: true,
      effect: "You have one extra movement this turn. Roll one die and place it on the card." },
    { id: "force_rod", name: "Force Rod", star: 3, slot: "hand",
      combat: "close", modify: "twoOrThreeTo5", effect: "Close combat: turn any one rolled 2 or 3 into a 5." },
    { id: "healing_armor", name: "Healing Armor", star: 3, slot: "torso",
      heal: { skullUpgrade: true }, toxinImmune: true,
      effect: "Immune to toxin. Heal action: turn the rolled die into a skull to heal twice." },
    { id: "jet_pack", name: "Jet Pack", star: 3, slot: "torso", rangeBonus: 1,
      effect: "When making a ranged attack, increase the weapon's range by 1 hex." },
    { id: "jonhys_bullhorn", name: "Jonhy's Bullhorn", star: 3, slot: "hand", partial: true,
      combat: "ranged", range: [0, 0], dice: 2,
      effect: "Ranged in the same hex; each match = all targets re-roll 2 highest dice, skulls = injury." },
    { id: "personal_portal", name: "Personal Portal", star: 3, slot: "special", partial: true,
      effect: "You may move to any hex on the map." },
    { id: "plasma_gun", name: "Plasma Gun", star: 3, slot: "hand",
      combat: "ranged", range: [0, 1], dice: 3,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 injury." },
    { id: "power_glove", name: "Power Glove", star: 3, slot: "hand",
      combat: "close", modify: "addTwoToOne", effect: "Close combat: add 2 to any one rolled die." },
    { id: "quadri_launcher", name: "Quadri-Launcher", star: 3, slot: "hand", hands: 2, partial: true,
      combat: "ranged", range: [0, 1], dice: 4,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 injury. Heavy (places a heavy token)." },
    { id: "repulse_visor", name: "Repulse Visor", star: 3, slot: "hand", partial: true,
      combat: "ranged", range: [0, 1], dice: 2, verify: true,
      effect: "Ranged same/adjacent; each match pushes the target through hexes (walls/edges stop it & deal 1 injury)." },
    { id: "seismic_grenade", name: "Seismic Grenade", star: 3, slot: "special", partial: true,
      effect: "Throw adjacent (over walls): all there re-roll 3 highest dice (skulls = injury); demolish up to 5 traps/walls/hideouts." },
    { id: "shock_gauntlet", name: "Shock Gauntlet", star: 3, slot: "hand",
      combat: "close", modify: "addOneToOne", ignoreArmor: true, effect: "Close combat: add 1 to any single rolled die. Ignores armor." },
    { id: "sniper_disintegrator", name: "Sniper Disintegrator", star: 3, slot: "hand", hands: 2, partial: true,
      combat: "ranged", range: [0, 2], dice: 3, needsLOS: true,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged up to 2 hexes w/ LOS; each match = 1 injury + target discards a beacon or item." },
    { id: "sniper_helmet", name: "Sniper Helmet", star: 3, slot: "head", diceBonus: 1,
      effect: "Add 1 to a single ranged combat die (extra shooting die)." },
    { id: "sonic_cleaver", name: "Sonic Cleaver", star: 3, slot: "hand",
      combat: "close", modify: "twoAndThreeToSkull", ignoreArmor: true, effect: "Close combat: turn a rolled 2 and/or 3 into a skull. Ignores armor." },
    { id: "tactical_helmet", name: "Tactical Helmet", star: 3, slot: "head", rangeBonus: 1, cancelsStealth: true,
      effect: "Cancels enemy stealth. When making a ranged attack, increase the weapon's range by 1 hex." },
    { id: "toms_hat", name: "Tom's Hat", star: 3, slot: "special", anytime: true, partial: true,
      effect: "Re-roll a die on your board that was placed as a 1 (incl. on your combat line). Usable any time." },
    { id: "v_cannon", name: "V Cannon", star: 3, slot: "hand", hands: 2,
      combat: "ranged", range: [0, 1], dice: 2,
      bonus: { type: "smallInjury", amount: 2 }, effect: "Ranged same/adjacent; each match = 2 small injuries." },
    { id: "vaporizer", name: "Vaporizer", star: 3, slot: "hand", hands: 2, partial: true,
      combat: "ranged", range: [0, 1], dice: 3, verify: true,
      bonus: { type: "smallInjury", amount: 2 }, effect: "Ranged same/adjacent; each match = 2 small injuries + target discards a beacon or item." },
    { id: "warrior_chainsaw", name: "Warrior Chainsaw", star: 3, slot: "hand",
      combat: "close", modify: "highLowTo4", ignoreArmor: true, effect: "Close combat: turn your highest and lowest rolled dice into 4s. Ignores armor." },
  ];

  // ---- Actions ----
  // ---- Ranged-weapon card action spaces (die values, computationally pip-counted from the real
  // card faces + visually spot-checked; combat_shotgun [2] matches the rulebook p.8/9 example
  // exactly). The card limits shots per turn — rulebook p.8: a Ranged Combat action needs a weapon
  // "equipped with an available action space". Melee weapons have NO card spaces (Close Combat
  // uses the character board's skull space). Single-shot heavies leave a LOW die on your combat
  // line (sniping costs defense); spray guns give two mid spaces (two shots/turn).
  const WEAPON_SPACES = {
    bow_arrow: [2],
    assault_rifle: [3, 2, 2], crossbow: [3], semi_auto_pistol: [3, 2], precision_rifle: [2, 1],
    sniper_rifle: [1], hand_cannon: [3, 3], rocket_launcher: [1], combat_shotgun: [2],
    pump_shotgun: [2, 2], machine_gun: [3, 2, 1], sub_machine_gun: [3, 2, 1],
    ex103_repulsor: [3, 2], ex02_neutralizer: [3], plasma_gun: [3, 2], quadri_launcher: [2],
    ex04_translocator: [3, 2], jonhys_bullhorn: [4], sniper_disintegrator: [2], v_cannon: [3, 2, 2],
    ex01_sniper_rifle: [2],
    // fan-v2.0 guns with no official card art — two-space default pending a real source (verify)
    ex05_plasma_thrower: [3, 2], repulse_visor: [3, 2], vaporizer: [3, 2],
  };
  // Heavy weapons block the LAST space of the Run column while equipped ("place a heavy token on
  // the right most run action space"). Sourced: rocket_launcher = designer, BGG 2854288 ("Rocket
  // Launcher blocks the LAST run slot" — which hurts Blitz less: he keeps his char space);
  // quadri_launcher = its own card text + the 2.0 compendium. No other card carries the heavy text.
  const HEAVY_WEAPONS = ["rocket_launcher", "quadri_launcher", "v_cannon"];   // all three carry the weight-icon Heavy attribute on their card art (v3.4 p.4 uses V Cannon as the example)

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
    eventRandom: { 2: 14, 3: 16, 4: 18, 5: 20, 6: 22 },   // 5-6 player decks (Rumble): longer storms for bigger games
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
    // Hunter's Crown: a king-of-the-hill fame token drops in the outer ring. Loot it; you score it at the
    // start of your turn (or game end) — but if you're reloaded while holding it, the killer steals it.
    crown:          { name: "Hunter's Crown 狩猎之冠", count: 2, desc: "外圈降下王冠：可拾取，回合开始或终局时计入名望；被击退则被夺走" },
    // Earthquake/Shockwave: everyone on the map re-rolls their top combat-line die; a rolled skull is an injury.
    earthquake:     { name: "Earthquake 地震", count: 2, desc: "在场玩家重掷战斗线最高骰（山地重掷最高两颗），骰出骷髅即受伤" },
    // Achievements module: 2 Announcement cards score MOST achievements mid-game + refresh a NEXT card.
    announcement:   { name: "Announcement 战报", count: 2, desc: "结算「最多」成就并刷新一张「下一位」成就", achievementsOnly: true },
  };

  // ---- Diplomacy chatter (flavoured after FPS in-game discourse: tactical comms + trash talk) ----
  // Lines surface in the log / diplomacy feed when proposals, deals, and betrayals happen.
  const CHATTER = {
    proposeTruce: [
      "停火？先各自发育，别互相送头。(Truce? Let's farm up, no feeding.)",
      "Hold your fire — 井水不犯河水，先苟一会儿。",
      "结个临时同盟？我保证不背刺……大概。",
    ],
    acceptTruce: [
      "Copy that，先和平发展。",
      "成交。NPNP，互不开火。",
      "行，但你敢背刺就送你回老家。",
    ],
    declineTruce: [
      "拒绝。点一下左键就能杀人，我为什么要停火？",
      "No deal — 你的段位配不上我的子弹。",
      "免谈，我专治各种苟。",
    ],
    proposeFocus: [
      "先集火那个领头的，诺亚方舟也带不动他。(Focus the leader.)",
      "他名望最高，rush 他，别让他上分。",
      "把那个飘的先处理掉，转点包夹。",
    ],
    acceptFocus: ["收到，集火他。", "Roger，先 gank 他。", "好，谁让他飘。"],
    declineFocus: ["我先发育，你们上。", "No，我盯着别人呢。"],
    betray: [
      "Sorry not sorry — 背刺时间到。(Deal's off.)",
      "停火协议？我撕了。Mouse one。",
      "抱歉，我的鼠标没选'讲信用'这个天赋。",
    ],
    trash: [
      "你的地图意识跟哥伦布一样（完全走错方向）。",
      "摘掉你那个一元店耳机吧，你已经没了。",
      "留着子弹娶媳妇呢？别急。",
      "诺亚方舟也装不下你们这队。",
    ],
  };

  // ---- AI personas (player-behaviour archetypes from FPS motivation research) ----
  // traits are 0..1 weights the automa reads to play differently (omitted keys fall back to engine defaults):
  //   aggression(主动交火) frag(刷人头) objective(抢资源/上分) caution(自保/治疗早)
  //   loot(舔包) build(架设防御) diplomacy(结盟) betray(背刺) vendetta(记仇) leaderHunt(针对头名) trash(垃圾话)
  const PERSONAS = [
    // 操作与对抗轴
    { id: "rusher", name: "钢枪猛男", archetype: "疯狗流 Rusher", dim: "操作", blurb: "开局就喊 RUSH B，永远冲在最前，迷恋近距离对枪。",
      traits: { aggression: 1, frag: .6, objective: .3, caution: .1, leaderHunt: .3, trash: .6, diplomacy: .2 }, lines: ["RUSH B！别墨迹！", "钢枪，怕的不算男人。"] },
    { id: "fraghunter", name: "人头猎人", archetype: "刷屏狂魔 Frag Hunter", dim: "操作", blurb: "只看 K/D，专抓残血、收割战场，能卖队友抢人头。",
      traits: { aggression: .8, frag: 1, objective: .2, caution: .3, trash: .5, diplomacy: .2 }, lines: ["这个人头我的。", "残血都归我。"] },
    { id: "griefer", name: "破坏狂", archetype: "虐菜鞭尸 Griefer", dim: "操作", blurb: "喜欢羞辱对手、鞭尸嘲讽，快乐来自对方痛苦。",
      traits: { aggression: .9, frag: .6, caution: .2, betray: .7, vendetta: .4, trash: 1, diplomacy: .2 }, lines: ["蹲下，给你表演个 T-bag。", "送你回新手村。"] },
    // 战术与认知轴
    { id: "igl", name: "铁血教条", archetype: "战术大师 IGL", dim: "战术", blurb: "背点位、控经济与视野，针对头名，厌恶运气成分。",
      traits: { aggression: .5, objective: .7, caution: .5, build: .4, diplomacy: .7, leaderHunt: 1, trash: .2 }, lines: ["集火领头的，按我说的转点。", "纪律，纪律。"] },
    { id: "edger", name: "圈边运营狗", archetype: "地理决定论 Map Controller", dim: "战术", blurb: "卡边运营，不轻易开枪，开枪就要灭队。",
      traits: { aggression: .2, objective: .8, caution: .9, loot: .6, build: .5, diplomacy: .5, trash: .2 }, lines: ["稳住，发育。", "让他们自己走进死路。"] },
    { id: "lurker", name: "独狼残局", archetype: "Clutch King / Lurker", dim: "战术", blurb: "从不与大队同行，残局靠冷静与听声辩位 1v多翻盘。",
      traits: { aggression: .5, caution: .7, objective: .5, leaderHunt: .4, diplomacy: .1, trash: .2 }, lines: ["你们先上，我断后。", "残局交给我。"] },
    // 社交与情感轴
    { id: "shadow", name: "影形人", archetype: "连体巨婴 Backpack", dim: "社交", blurb: "绑定大腿、有求必应，0杀10死20助攻的绿叶。",
      traits: { aggression: .3, objective: .4, caution: .6, diplomacy: 1, betray: 0, loot: .5, trash: .3 }, lines: ["大哥带我！", "枪都给你，我空手就行。"] },
    { id: "entertainer", name: "气氛组", archetype: "相声演员 Entertainer", dim: "社交", blurb: "开麦讲段子放歌，胜负随缘，绝不冷场不内讧。",
      traits: { aggression: .4, objective: .4, caution: .4, diplomacy: .8, trash: 1, betray: .2 }, lines: ["666 这波太秀了！", "来，整段活儿。"] },
    { id: "blamer", name: "压力怪", archetype: "情绪垃圾桶 Toxic", dim: "社交", blurb: "死了一定是队友的错，打不顺就开骂、记仇。",
      traits: { aggression: .6, caution: .3, vendetta: .7, betray: .6, trash: 1, diplomacy: .3 }, lines: ["你不拉线怪我咯？", "全是内鬼！" ] },
    { id: "vendetta", name: "平头哥", archetype: "尊严复仇者 Vendetta", dim: "社交", blurb: "被针对就进狂暴模式，哪怕输也要杀他一次。",
      traits: { aggression: .7, vendetta: 1, leaderHunt: .2, caution: .3, trash: .6, diplomacy: .3 }, lines: ["你完了，我记住你了。", "今天必须收了你。"] },
    // 生存与防卫轴
    { id: "lootgoblin", name: "拾荒恶鬼", archetype: "佛系仓鼠 Loot Goblin", dim: "生存", blurb: "毕生搜刮舔包，囤满物资才安心。",
      traits: { aggression: .2, objective: .6, caution: .8, loot: 1, build: .2, diplomacy: .4, trash: .2 }, lines: ["这个盒子我先舔。", "再搜一个我就走。"] },
    { id: "bushmaster", name: "伏地魔", archetype: "极限苟活 Survivalist", dim: "生存", blurb: "一枪不发苟到决赛圈，钝感力与克制力拉满。",
      traits: { aggression: .15, caution: 1, objective: .5, build: .4, diplomacy: .3, trash: .1 }, lines: ["趴好，别动。", "苟到最后就是赢。"] },
    { id: "architect", name: "基建狂魔", archetype: "自闭建造 Architect", dim: "生存", blurb: "风吹草动先盖楼，用结构与掩体抵消对手枪法。",
      traits: { aggression: .3, caution: .8, build: 1, objective: .4, diplomacy: .3, trash: .2 }, lines: ["先盖个九层妖塔。", "墙比人靠谱。"] },
    { id: "sightseer", name: "散步党", archetype: "纯粹观光客 Casual", dim: "生存", blurb: "开车看风景、研究地图，对胜负完全免疫。",
      traits: { aggression: .2, objective: .3, caution: .5, loot: .5, diplomacy: .5, trash: .3 }, lines: ["这地图风景真不错。", "赢不赢的，开心就好。"] },
    // 复合 / 缝合怪
    { id: "exec", name: "商业精英", archetype: "战术大师×独狼 (INTJ)", dim: "复合", blurb: "平时不说话，关键时刻靠智商一打多，专收头名。",
      traits: { aggression: .5, objective: .7, caution: .6, leaderHunt: .9, diplomacy: .5, betray: .4, trash: .1 }, lines: ["数据不会骗人。", "降维打击。"] },
    { id: "officeworker", name: "压抑职场白", archetype: "拾荒×虐菜 反复横跳", dim: "复合", blurb: "安全时疯狂囤货，一拿到压制性武器就报复羞辱。",
      traits: { aggression: .5, frag: .8, caution: .7, loot: .8, betray: .7, vendetta: .6, trash: .7 }, lines: ["平时忍着，现在该爽了。", "轮到我翻身了。"] },
    { id: "warlord", name: "莽夫指挥", archetype: "Rusher×IGL", dim: "复合", blurb: "一边喊战术一边带头冲，混乱但有压迫力。",
      traits: { aggression: .9, leaderHunt: .6, diplomacy: .6, build: .3, caution: .2, trash: .6 }, lines: ["跟我冲，别想太多！", "我说的就是战术。"] },
    { id: "rat", name: "苟命人头狗", archetype: "Survivalist×Frag", dim: "复合", blurb: "苟到最后再出手，专收别人打残的尾刀。",
      traits: { aggression: .4, frag: .8, caution: .8, objective: .4, diplomacy: .3, trash: .3 }, lines: ["你们先打，我捡漏。", "尾刀艺术家。"] },
    { id: "guardian", name: "慈父辅助", archetype: "影形人×基建", dim: "复合", blurb: "高忠诚的保姆，搭墙、送物资、绝不背刺。",
      traits: { aggression: .2, caution: .8, build: .7, diplomacy: .9, betray: 0, loot: .5, trash: .2 }, lines: ["墙我来盖，你只管输出。", "我罩着你。"] },
    { id: "loudmouth", name: "嘴硬王", archetype: "Entertainer×Toxic", dim: "复合", blurb: "全程嘴炮，赢了狂笑输了嘴硬，偶尔记仇。",
      traits: { aggression: .5, trash: 1, diplomacy: .6, vendetta: .5, betray: .3 }, lines: ["就这？", "菜是原罪，别怪我嘴臭。"] },
    { id: "sniper", name: "冷面狙击手", archetype: "Marksman / 神射手", dim: "复合", blurb: "远距离锁人，专点高价值目标，话少手稳。",
      traits: { aggression: .5, leaderHunt: .7, objective: .5, caution: .6, trash: .2, diplomacy: .3 }, lines: ["一枪一个。", "进镜，闭嘴。"] },
    { id: "sneaky", name: "老六", archetype: "Lurker×伏地魔", dim: "复合", blurb: "阴人专家，卡视野绕后，从不正面硬刚。",
      traits: { aggression: .4, caution: .9, leaderHunt: .3, diplomacy: .1, betray: .5, trash: .4 }, lines: ["惊不惊喜，意不意外。", "正面打不过？那就绕后。"] },
    { id: "dove", name: "和平鸽", archetype: "外交家 Diplomat", dim: "复合", blurb: "见谁都先递橄榄枝，靠结盟与运营上分。",
      traits: { aggression: .2, objective: .6, caution: .6, diplomacy: 1, betray: 0, leaderHunt: .3, trash: .2 }, lines: ["别打了，结个盟？", "以和为贵。"] },
    { id: "gambler", name: "赌徒", archetype: "高方差莽夫 Gambler", dim: "复合", blurb: "全压一把，要么暴富要么暴毙，从不防守。",
      traits: { aggression: 1, frag: .7, caution: 0, betray: .5, trash: .7, diplomacy: .2 }, lines: ["梭哈！", "富贵险中求。"] },
  ];

  // ---- AI difficulty: skill policies read by ai.js (separate from persona STYLE). ----
  // medium = {} (all hand-tuned defaults). easy = blunders often + worse survival. hard = self-play-tuned
  // (tools/train_ai.js writes the numbers here). Personas still layer their own style on top of any tier.
  // Tuned via self-play (tools/train_ai.js): the optimizer consistently favored MORE proactive ranged play
  // (low rangedAggro) with no blunders, so "hard" encodes that. Difficulty is scaled mainly by `blunder`
  // — the proven lever (self-play win-share vs medium was ~easy 0.18 / medium 0.50 / hard 0.51+).
  // tools/eval_ladder.js validates the ordering; tests/difficulty.js guards it.
  const DIFFICULTY = {
    easy:   { blunder: 0.45, healBase: 3, healMin: 3, rangedAggro: 0.60, closeAggro: 0.85, rushAggro: 0.98, buildTrap: 0.95 },
    medium: { blunder: 0.12 },
    hard:   { blunder: 0, rangedAggro: 0.15, closeAggro: 0.45, rushAggro: 0.60 },
    // expert = hard heuristic AS the rollout policy + Monte-Carlo look-ahead (ai.js). rollouts = strength/think-time.
    expert: { blunder: 0, rangedAggro: 0.15, closeAggro: 0.45, rushAggro: 0.60, rollouts: 32, rolloutDepth: 0 },   // rollouts PER candidate (1-ply look-ahead); 32 measured > 16 in self-play (tools/ab_expert.js). more = stronger + slower
  };

  const DATA = {
    DIE_FACES, DICE, START_ACTION_DICE, ACTION_SPACES, CHAR_SPACES, WEAPON_SPACES, HEAVY_WEAPONS, TERRAIN, ARCADIA, MAPS, HEX_DIRS,
    CHARACTERS, FAME, SLOTS, EQUIPMENT, ACTIONS, SETUP, TOKEN_ART, HIDEOUT_ART, TILE_ART, EVENTS, ACHIEVEMENTS, CHATTER, PERSONAS, DIFFICULTY,
    EQUIP_BY_ID: Object.fromEntries(EQUIPMENT.map(e => [e.id, e])),
    ACHIEVEMENT_BY_ID: Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a])),
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  root.RL = Object.assign(root.RL || {}, { data: DATA });
})(typeof globalThis !== "undefined" ? globalThis : this);
