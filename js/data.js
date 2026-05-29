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
      ability: { id: "fastest_there_is", name: "Fastest There Is", impl: false,
                 text: "Character action: assign an action die to take a Run action (figure-specific)." },
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
  };

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
    { id: "combat_shotgun", name: "Combat Shotgun", star: 2, slot: "hand",
      combat: "ranged", range: [0, 1], dice: 3,
      bonus: { type: "injury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 injury." },
    { id: "assault_rifle", name: "Assault Rifle", star: 2, slot: "hand",
      combat: "ranged", range: [0, 1], dice: 3, verify: true,
      bonus: { type: "smallInjury", amount: 1 }, effect: "Ranged same/adjacent; each match = 1 small injury." },
    { id: "sniper_rifle", name: "Sniper Rifle", star: 2, slot: "hand",
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

  const DATA = {
    DIE_FACES, DICE, START_ACTION_DICE, TERRAIN, ARCADIA, HEX_DIRS,
    CHARACTERS, FAME, SLOTS, EQUIPMENT, ACTIONS, SETUP,
    EQUIP_BY_ID: Object.fromEntries(EQUIPMENT.map(e => [e.id, e])),
  };

  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
  root.RL = Object.assign(root.RL || {}, { data: DATA });
})(typeof globalThis !== "undefined" ? globalThis : this);
