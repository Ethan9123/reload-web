// ============================================================
// i18n.js — translations for the game's FLAVOR CONTENT (personas, achievement
// descriptions, the 1v1 tutorial, and FR/ES of the abilities/equipment whose
// source text is English). Keyed by stable id. The UI's TC(key, fallback)
// returns LANG_CONTENT[lang][key] when present, else the source value from
// data.js — so any missing key gracefully degrades to the source language.
// Chrome strings (menus/legend/buttons) live in ui.js LANG, not here.
// ============================================================
(function (root) {
  "use strict";
  const C = {
    en: {
      // ---- personas: name (nickname) · arch (archetype label) · blurb ----
      "persona.rusher.name": "Gun-Down Bro", "persona.rusher.arch": "Rusher", "persona.rusher.blurb": "Calls 'RUSH B' from the drop, always first into the fight, addicted to point-blank duels.",
      "persona.fraghunter.name": "Frag Hunter", "persona.fraghunter.arch": "Frag Hunter", "persona.fraghunter.blurb": "Lives for K/D — hunts the wounded, farms the battlefield, will sell a teammate for a kill.",
      "persona.griefer.name": "Griefer", "persona.griefer.arch": "Griefer", "persona.griefer.blurb": "Loves to humiliate and teabag; joy comes straight from the other guy's pain.",
      "persona.igl.name": "Hardliner", "persona.igl.arch": "Shot-caller (IGL)", "persona.igl.blurb": "Memorizes spots, controls economy and vision, targets the leader, hates relying on luck.",
      "persona.edger.name": "Edge Runner", "persona.edger.arch": "Map Controller", "persona.edger.blurb": "Plays the edge and rarely shoots; when it does, it goes for the team wipe.",
      "persona.lurker.name": "Lone Wolf", "persona.lurker.arch": "Clutch Lurker", "persona.lurker.blurb": "Never travels with the pack; wins clutches 1-vs-many on cool nerves and sound cues.",
      "persona.shadow.name": "Shadow", "persona.shadow.arch": "Backpack (Support)", "persona.shadow.blurb": "Glued to a carry, endlessly helpful — the 0-kill / 10-death / 20-assist support.",
      "persona.entertainer.name": "Hype Man", "persona.entertainer.arch": "Entertainer", "persona.entertainer.blurb": "Cracks jokes and plays music on mic; win or lose, never goes quiet, never griefs the team.",
      "persona.blamer.name": "Tilter", "persona.blamer.arch": "Toxic", "persona.blamer.blurb": "If it died, it's the teammate's fault; flames and holds grudges when things go wrong.",
      "persona.vendetta.name": "Honey Badger", "persona.vendetta.arch": "Vendetta", "persona.vendetta.blurb": "Get focused and it goes berserk — it'll spend the whole game just to kill you back, even at a loss.",
      "persona.lootgoblin.name": "Loot Goblin", "persona.lootgoblin.arch": "Loot Goblin", "persona.lootgoblin.blurb": "Loots everything in sight; only feels safe with a full stash.",
      "persona.bushmaster.name": "Bush Wraith", "persona.bushmaster.arch": "Survivalist", "persona.bushmaster.blurb": "Doesn't fire a shot, camps into the final circle — maxed patience and restraint.",
      "persona.architect.name": "Builder Maniac", "persona.architect.arch": "Architect", "persona.architect.blurb": "At the first sign of trouble it builds; cancels the enemy's aim with structures and cover.",
      "persona.sightseer.name": "Sightseer", "persona.sightseer.arch": "Casual", "persona.sightseer.blurb": "Drives around sightseeing and studying the map, completely immune to winning or losing.",
      "persona.exec.name": "Corporate Shark", "persona.exec.arch": "Mastermind × Lone Wolf (INTJ)", "persona.exec.blurb": "Quiet most of the time, then out-thinks the table 1-vs-many at the key moment; hunts the leader.",
      "persona.officeworker.name": "Burned-out Clerk", "persona.officeworker.arch": "Hoarder × Bully", "persona.officeworker.blurb": "Hoards frantically while safe; the moment it grabs a dominant weapon it turns petty and vengeful.",
      "persona.warlord.name": "Reckless Warlord", "persona.warlord.arch": "Rusher × IGL", "persona.warlord.blurb": "Calls tactics while charging in headfirst — chaotic, but full of pressure.",
      "persona.rat.name": "Sewer Rat", "persona.rat.arch": "Survivalist × Frag", "persona.rat.blurb": "Holds back to the very end, then steals the last hit on whoever's already wounded.",
      "persona.guardian.name": "Guardian Angel", "persona.guardian.arch": "Backpack × Architect", "persona.guardian.blurb": "A loyal babysitter — builds walls, hands out loot, never backstabs.",
      "persona.loudmouth.name": "Loudmouth", "persona.loudmouth.arch": "Entertainer × Toxic", "persona.loudmouth.blurb": "Trash-talks nonstop; cackles on a win, doubles down on a loss, occasionally holds a grudge.",
      "persona.sniper.name": "Cold Sniper", "persona.sniper.arch": "Marksman", "persona.sniper.blurb": "Locks targets from range and picks off high-value players; few words, steady hands.",
      "persona.sneaky.name": "Sneaky Six", "persona.sneaky.arch": "Lurker × Survivalist", "persona.sneaky.blurb": "An ambush specialist — plays angles and flanks, never fights head-on.",
      "persona.dove.name": "Peace Dove", "persona.dove.arch": "Diplomat", "persona.dove.blurb": "Offers an olive branch to everyone; climbs on alliances and economy.",
      "persona.gambler.name": "Gambler", "persona.gambler.arch": "High-Variance Gambler", "persona.gambler.blurb": "Shoves it all in — instant riches or instant death, never plays defense.",
      // ---- achievement descriptions (names are already English in data.js) ----
      "ach.martial_artist.desc": "Be the next player to force an opponent to RELOAD in close combat.",
      "ach.marksman.desc": "Be the next player to force an opponent to RELOAD with a ranged attack.",
      "ach.mechanic.desc": "Be the next player to earn Trap fame.",
      "ach.double_trouble.desc": "Be the next player to earn 2 Injury fame in a single turn.",
      "ach.predator.desc": "At game end, the player with the most RELOAD fame on the reputation track.",
      "ach.treasure_hunter.desc": "At game end, the player with the most Beacon fame on the reputation track.",
      "ach.jack_of_all_trades.desc": "At game end, the player with the most fame types (colors) on the reputation track.",
      "ach.collector.desc": "At game end, the player holding the most 3★ equipment (equipped + backpack).",
      // ---- 1v1 tutorial steps ----
      "tut.0": "Welcome! You're <b>Red · Bomb Betty</b>, facing <b>Echo (AI)</b> on the <b>Imperial Dynasty</b> map (beacons all around the rim). Goal: earn the most <b>Fame</b>. Follow the prompts; click ✕ anytime to exit.",
      "tut.1": "<b>Drop in</b>: the <b>yellow dashed</b> hexes are landing spots — click one to drop (a gust may then nudge you one hex).",
      "tut.2": "<b>Move</b>: click a <b>cyan-outlined</b> adjacent hex to move, costing 1 die; <b>mountains cost 2</b>.",
      "tut.3": "<b>Grab beacons</b>: step onto a 🔆 beacon hex and <b>click your hex</b> to pick it up; carry it to the <b>central tower</b> and click it to <b>upload</b> for Fame (hoarding without uploading scores nothing).",
      "tut.4": "<b>Build (Betty's specialty)</b>: use the <b>Trap / Barrier / Hideout</b> buttons below. Betty is best at <b>laying traps</b> to corner opponents.",
      "tut.5": "<b>Check gear</b>: click <b>your character card</b> on the left to see equipment and dice. Echo turns <b>invisible</b> — point-blank <b>melee</b> beats ranged against her.",
      "tut.6": "<b>Attack</b>: when an enemy enters your range, its hex gets a <b>red frame</b> — click it to fight. <b>Melee ends your turn</b>, so plan your dice first.",
      "tut.7": "<b>Combat resolution</b>: a dice animation pops up — dice are <b>compared one by one</b>, <b>skulls are strongest</b>, and enough damage forces the target to <b>RELOAD</b> (drops gear, back to the drop zone). Hitting Echo <b>reveals</b> her.",
      "tut.8": "<b>Heal</b>: click 'Heal' to recover — <b>not allowed with an enemy on your hex</b>.",
      "tut.9": "<b>End turn</b>: click 'End turn' — unused dice become <b>defense</b>, then an <b>event card</b> is flipped.",
      "tut.10": "<b>Events / Toxin</b>: the <b>event log</b> is bottom-right. Toxin spreads inward from the rim — <b>don't end your turn standing in it</b> (unless you're under a dome or in your own hideout).",
      "tut.11": "<b>Winning</b>: when the event deck runs out the game ends, and the <b>highest Fame wins</b>. Tutorial complete — start your first game!",
    },
    fr: {},   // TODO: French flavor-content translations
    es: {},   // TODO: Spanish flavor-content translations
  };
  root.RL = Object.assign(root.RL || {}, { LANG_CONTENT: C });
  if (typeof module !== "undefined" && module.exports) module.exports = C;
})(typeof globalThis !== "undefined" ? globalThis : this);
