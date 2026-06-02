// ============================================================
// engine.js — RELOAD headless rules engine (single source of truth).
// SCOPE SO FAR: seeded RNG, hex math, game setup (board/tokens/decks/
// players/starting equipment), and basic queries.
// NEXT (tasks #4/#5): turn phases, action assignment, movement,
// combat resolution, injuries/RELOAD, fame, end-of-game.
// Works in browser (global RL.engine) and Node (module.exports).
// ============================================================
(function (root) {
  "use strict";
  const DATA = (typeof RL !== "undefined" && RL.data) ? RL.data : require("./data.js");
  const { ARCADIA, TERRAIN, HEX_DIRS, CHARACTERS, FAME, EQUIPMENT, START_ACTION_DICE, SETUP } = DATA;

  // ---- seeded RNG (mulberry32) for reproducible games/tests ----
  function makeRng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- hex math (axial) ----
  const hexKey = (q, r) => q + "," + r;
  const hexAdd = (a, b) => ({ q: a.q + b.q, r: a.r + b.r });
  function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  }
  function neighbors(state, q, r) {
    const out = [];
    for (const d of HEX_DIRS) {
      const k = hexKey(q + d.q, r + d.r);
      if (state.board[k]) out.push(k);
    }
    return out;
  }

  // ---- build equipment decks ----
  // exact 1-star quantities from rulebook p.12; 2-star from available subset.
  const STAR1_QTY = {   // 1-star deck = 32 cards (duplicates of the 13 types)
    energy_drink: 4, pain_killer: 4, ap_ammo: 2, bow_arrow: 2, collapsible_baton: 2,
    light_helmet: 3, riot_vest: 3, sickle: 2, tactical_explosive: 2, tool_kit: 2,
    explosive_trap: 2, grenade: 2, stun_grenade: 2,
  };
  function buildEquipDeck(star, rnd) {
    const deck = [];
    for (const e of EQUIPMENT) {
      if (e.star !== star) continue;
      const qty = e.qty || (star === 1 ? (STAR1_QTY[e.id] || 1) : 1);   // 2★ ≈ 20, 3★ Ex-Tech = 1 of each type
      for (let i = 0; i < qty; i++) deck.push(e.id);
    }
    return shuffle(deck, rnd);
  }
  // event deck = 2 guaranteed Supply Drops (+ 2 Announcements if achievements module) + N random
  function buildEventDeck(numPlayers, rnd, achievements) {
    const randomN = SETUP.eventRandom[numPlayers] || 16;
    const pool = [];
    for (const id in DATA.EVENTS) {
      if (DATA.EVENTS[id].achievementsOnly) continue;   // Announcements are added as guaranteed cards below, only with the module
      let n = DATA.EVENTS[id].count; if (id === "supply_drop") n -= 2;
      for (let i = 0; i < n; i++) pool.push(id);
    }
    shuffle(pool, rnd);
    const guaranteed = ["supply_drop", "supply_drop"];
    if (achievements) guaranteed.push("announcement", "announcement");
    return shuffle(pool.slice(0, randomN).concat(guaranteed), rnd);
  }

  function newPlayer(idx, character, human) {
    return {
      idx, character: character.id, name: character.name, color: character.color, human,
      team: null,                      // Team Royale: 0/1 (teammates seated diagonally, idx%2)
      persona: null,                   // AI behaviour archetype (data.PERSONAS); drives the automa's style
      policy: null,                    // AI skill policy (difficulty); read by ai.js. null = default ("medium") thresholds
      _lastAttacker: null,             // idx of the last player who damaged us (for the Vendetta persona)
      // dice: still count-based, with assignedDice preserving values spent this turn.
      actionDice: START_ACTION_DICE,   // action dice currently owned (5 minus injuries)
      defensePool: START_ACTION_DICE,  // unassigned, available this turn
      assigned: 0,                     // dice spent on actions this turn
      assignedDice: [],                // action die faces assigned this turn; numeric faces move to combatLine in End Phase
      combatLine: [],                  // numeric dice, high->low
      injuries: 0,                     // dice in injury zone; INJURY_ZONE => RELOAD
      boost: false,
      boostDice: 0,                    // Energy Drink green boost dice this turn: spendable on actions, but NOT usable in combat or as injury

      fame: { injury: 0, beacon: 0, teamSpirit: 0, reload: 0, trap: 0, achievement: 0, flag: 0 },
      carryingFlag: null,              // Capture the Flag: team whose flag this player carries, or null
      achievementsWon: [],             // ids of achievement cards this player has claimed
      fameTrackPos: 0,
      pos: null,                       // axial {q,r}; null = off-map (parachute)
      equipped: { head: null, torso: null, hand: [] },
      backpack: [],                    // equipment ids (facedown)
      carryingBeacons: 0,
      hideout: null,                   // hex key of own hideout, or null
      barriersUsed: 0, trapsUsed: 0,   // placed counts (max 6 each)
      _noMove: false,                  // set when a trap tie stops further movement this turn
      _revealed: false,                // Echo: cloak drops once she takes part in combat (reset each turn)
      _freeBuildUsed: false,           // Betty: her one free Build this turn has been used
      _droneUsed: false,               // Cody & Buzz: the drone's once-per-turn Loot has been used
      reloadZone: false,
    };
  }

  // ---- setup ----
  function newGame(opts) {
    opts = opts || {};
    const numPlayers = opts.numPlayers || 4;
    const rnd = makeRng(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0);
    const mode = opts.mode || "battleRoyale";
    const useAchievements = opts.achievements !== false;   // achievements module on by default

    // choose characters + which seat the human takes (seat order = turn order). opts.chars = explicit ids in
    // seat order (tutorial/tests, human = seat 0). opts.humanChar = the human's picked character, placed at a
    // RANDOM seat so turn order is random. Otherwise random draw: base 4 by default, full roster w/ allCharacters.
    let chars, humanSeat = 0;
    if (opts.chars && opts.chars.length) {
      chars = opts.chars.map(id => CHARACTERS.find(c => c.id === id)).filter(Boolean);
      const used = new Set(chars.map(c => c.id)), rest = shuffle(CHARACTERS.filter(c => !used.has(c.id)), rnd);
      while (chars.length < numPlayers && rest.length) chars.push(rest.pop());
      chars = chars.slice(0, numPlayers);
    } else {
      let pool = opts.allCharacters ? CHARACTERS.slice() : CHARACTERS.filter(c => !c.set || c.set === "base");
      if (pool.length < numPlayers) pool = CHARACTERS.slice();
      const hc = (opts.humanChar && !opts.allAI) ? CHARACTERS.find(c => c.id === opts.humanChar) : null;
      if (hc) {                                              // human picked a character → place it at a random seat
        const others = shuffle(pool.filter(c => c.id !== hc.id), rnd).slice(0, numPlayers - 1);
        humanSeat = Math.floor(rnd() * numPlayers);
        chars = []; let oi = 0;
        for (let i = 0; i < numPlayers; i++) chars.push(i === humanSeat ? hc : others[oi++]);
      } else {
        chars = shuffle(pool, rnd).slice(0, numPlayers);
      }
    }
    const players = chars.map((c, i) => newPlayer(i, c, opts.allAI ? false : i === humanSeat));
    // Team Royale: teammates seated diagonally so turn order (clockwise) never gives back-to-back team turns
    // Team modes: 2v2 (4p) & 3v3 (6p) use 2 teams; 2v2v2 (6p) uses 3. team = idx % numTeams keeps teammates
    // out of back-to-back turn order. All team logic below keys off p.team / sameTeam, not the exact mode.
    const TEAMS = (mode === "team" || mode === "team3v3" || mode === "captureFlag") ? 2 : mode === "team2v2v2" ? 3 : 0;
    if (TEAMS) for (const p of players) p.team = p.idx % TEAMS;
    // assign a distinct AI persona to each player (drives the automa's style); can be disabled with personas:false
    if (opts.personas !== false && DATA.PERSONAS && DATA.PERSONAS.length) {
      const pool = shuffle(DATA.PERSONAS.slice(), rnd);
      players.forEach((p, i) => { p.persona = pool[i % pool.length]; });
    }
    // difficulty: give the AI players a skill policy (human plays themselves). null/omitted => default thresholds.
    const difficulty = opts.difficulty || "medium";
    const diffPolicy = DATA.DIFFICULTY && DATA.DIFFICULTY[difficulty];
    if (opts.difficulty && diffPolicy) for (const p of players) { if (!p.human) p.policy = diffPolicy; }

    // board — pick the map (default Arcadia). opts.map selects from DATA.MAPS.
    const MAP = (opts.map && DATA.MAPS && DATA.MAPS[opts.map]) || ARCADIA;
    const board = {};
    for (const h of MAP.hexes) {
      const t = TERRAIN[h.terrain];
      board[hexKey(h.q, h.r)] = {
        q: h.q, r: h.r, terrain: h.terrain,
        tokens: [],            // e.g. {kind:'beacon'} / {kind:'supply', star:2}
        walls: {},             // edge(0-5) -> owner: 'n' (neutral) or playerIdx
        portal: false, hideouts: [], trap: null, toxin: false, hasTower: h.terrain === "tower",
      };
    }
    // tokens per rules
    for (const h of MAP.hexes) {
      const cell = board[hexKey(h.q, h.r)];
      if (TERRAIN[h.terrain].beacon) cell.tokens.push({ kind: "beacon" });
      if (TERRAIN[h.terrain].supply === "2star") cell.tokens.push({ kind: "supply", star: 2 });
    }
    for (const p of (MAP.portals || [])) { const c = board[hexKey(p.q, p.r)]; if (c) c.portal = true; }
    for (const w of (MAP.neutralWalls || [])) { const c = board[hexKey(w.q, w.r)]; if (c) c.walls[w.edge] = "n"; }

    // ---- Capture the Flag (奪旗賽): give each team a base on opposite ends; each base starts with its own flag ----
    let flags = null;
    if (mode === "captureFlag") {
      const keys = Object.keys(board).filter(k => !board[k].hasTower);   // bases aren't the central tower
      let b0 = keys[0], b1 = keys[1], far = -1;
      for (const a of keys) for (const c of keys) { const d = hexDistance(board[a], board[c]); if (d > far) { far = d; b0 = a; b1 = c; } }
      board[b0].base = 0; board[b1].base = 1;
      board[b0].tokens.push({ kind: "flag", team: 0 });
      board[b1].tokens.push({ kind: "flag", team: 1 });
      flags = [{ home: b0, at: b0, carrier: null }, { home: b1, at: b1, carrier: null }];
    }

    // decks
    const eventCount = (SETUP.eventRandom[numPlayers] || 16) + 2 + (useAchievements ? 2 : 0); // +2 supply drops (+2 announcements w/ module)
    const decks = {
      equip1: buildEquipDeck(1, rnd),
      equip2: buildEquipDeck(2, rnd),
      equip3: buildEquipDeck(3, rnd),
      event: buildEventDeck(numPlayers, rnd, useAchievements),
      discard1: [], discard2: [], discard3: [],
    };

    // achievement board: shuffle the 8 cards, deal 3 faceup, 1 fame token below each (rulebook modules)
    let achievements = null;
    if (useAchievements) {
      const deck = shuffle(DATA.ACHIEVEMENTS.map(a => a.id), rnd);
      const board3 = [];
      for (let i = 0; i < 3 && deck.length; i++) board3.push({ id: deck.pop(), fameBelow: 1 });
      achievements = { deck, board: board3, log: [] };
    }

    // starting equipment: each draws 2 one-star, keeps 1 (AI/human keep first for now)
    for (const p of players) {
      const a = decks.equip1.pop(), b = decks.equip1.pop();
      p.backpack.push(a);
      if (b) decks.discard1.push(b);
    }

    // fame supply
    const fameSupply = {};
    for (const k in FAME) fameSupply[k] = FAME[k].supply;

    // toxin storm starts at the outermost ring (Arcadia = 2; larger maps spread from further out)
    const towerHex = MAP.hexes.find(h => h.terrain === "tower") || MAP.hexes[0];
    const maxRing = Math.max(...MAP.hexes.map(h => hexDistance(h, towerHex)));

    const state = {
      mode, numPlayers, difficulty, map: MAP.name, maxRing, isTeam: TEAMS > 0, rnd, board, players,
      flags, captures: flags ? [0, 0] : null,    // Capture the Flag state
      firstPlayer: 0, activePlayer: 0, round: 1,
      decks, fameSupply,
      eventsResolved: 0, eventTotal: eventCount,
      superstarFame: superstarThreshold(mode, numPlayers),   // win threshold = fame-track length for this mode/player-count
      achievements,                                          // achievement board (null if module off)
      // diplomacy: per-pair truces, trust/reputation, an agreed "focus first" target, pending offers, chatter feed
      diplomacy: { truce: {}, rep: players.map(() => 50), focus: null, offers: [], feed: [] },
      phase: "start", needsParachute: false,
      gameOver: false, winner: null, superstar: false,
      _turnsTaken: 0, _eventsDone: false,
      log: [],
    };
    beginTurn(state);
    return state;
  }

  // ---- basic queries ----
  function hexCell(state, q, r) { return state.board[hexKey(q, r)]; }
  function playersOnHex(state, q, r) {
    return state.players.filter(p => p.pos && p.pos.q === q && p.pos.r === r);
  }
  function totalFame(p) { return p.fame.injury + p.fame.beacon + p.fame.teamSpirit + p.fame.reload + (p.fame.trap || 0) + (p.fame.achievement || 0) + (p.fame.flag || 0); }
  // ---- teams (Team Royale) ----
  function sameTeam(a, b) { return a && b && a.team != null && a.team === b.team; }
  function teammates(state, p) { return state.players.filter(x => x !== p && sameTeam(x, p)); }
  function teamMembers(state, team) { return state.players.filter(p => p.team === team); }
  function teamFame(state, team) { return teamMembers(state, team).reduce((s, p) => s + totalFame(p), 0); }
  function teamBarriers(state, team) { return teamMembers(state, team).reduce((s, p) => s + p.barriersUsed, 0); }
  // score that counts for the win: team total in Team Royale, else the player's own total
  function scoreFor(state, p) { return p.team != null ? teamFame(state, p.team) : totalFame(p); }

  // ---- diplomacy: truces, focus-target pacts, reputation/trust, betrayal ----
  function dipKey(i, j) { return i < j ? i + "," + j : j + "," + i; }
  function hasTruce(state, i, j) { const d = state.diplomacy; const u = d && d.truce[dipKey(i, j)]; return u != null && state.round < u; }
  function truceRoundsLeft(state, i, j) { const u = state.diplomacy && state.diplomacy.truce[dipKey(i, j)]; return u != null ? Math.max(0, u - state.round) : 0; }
  // players the active player should not attack: teammates always, truce partners by agreement
  function friendly(state, a, b) { return a === b || sameTeam(state.players[a], state.players[b]) || hasTruce(state, a, b); }
  // pick a generic chatter line; returns {line, ref} where ref keys the i18n table (bark.chatter.<kind>.<i>)
  function dipLine(state, kind) { const arr = (DATA.CHATTER && DATA.CHATTER[kind]) || []; if (!arr.length) return { line: "", ref: null }; const i = Math.floor(state.rnd() * arr.length); return { line: arr[i], ref: "bark.chatter." + kind + "." + i }; }
  function dipSay(state, fromIdx, kind, msg, ref) {
    const who = state.players[fromIdx] ? state.players[fromIdx].name : "?";
    let line, useRef;
    if (msg != null) { line = msg; useRef = ref || null; }     // caller supplied the line (+ optional i18n ref)
    else { const pick = dipLine(state, kind); line = pick.line; useRef = pick.ref; }
    state.diplomacy.feed.unshift({ from: fromIdx, kind, line, ref: useRef, round: state.round });
    if (state.diplomacy.feed.length > 40) state.diplomacy.feed.pop();
    log(state, `💬 ${who}：${line}`, "bark", { who, line, ref: useRef });
  }
  function setTruce(state, i, j, rounds) { state.diplomacy.truce[dipKey(i, j)] = state.round + (rounds || 3); }
  function breakTruce(state, breaker, victim) {
    const key = dipKey(breaker, victim), d = state.diplomacy;
    if (d.truce[key] == null || state.round >= d.truce[key]) return false;
    delete d.truce[key];
    d.rep[breaker] = Math.max(0, d.rep[breaker] - 30);   // betrayal tanks the breaker's trust
    dipSay(state, breaker, "betray");
    return true;
  }
  function aiAcceptTruce(state, ai, from) {
    if (sameTeam(state.players[ai], state.players[from])) return true;
    const d = state.diplomacy;
    if (d.rep[from] < 25) return false;                  // don't trust a known backstabber
    const me = totalFame(state.players[ai]), them = totalFame(state.players[from]);
    const leaderFame = Math.max(...state.players.map(totalFame));
    if (me >= leaderFame && me > them + 2) return false; // I'm out front — keep the pressure on
    const base = them >= me ? 0.75 : 0.45;               // more willing to truce a stronger rival
    const per = state.players[ai].persona, dip = (per && per.traits.diplomacy != null) ? per.traits.diplomacy : 0.4;
    return state.rnd() < base * (d.rep[from] / 60) * (0.5 + dip);   // diplomats accept readily; loners rarely
  }
  function proposeTruce(state, from, to, rounds) {
    rounds = rounds || 3;
    if (from === to || sameTeam(state.players[from], state.players[to])) return { ok: false };
    dipSay(state, from, "proposeTruce");
    if (state.players[to].human) {                       // queue for the human to answer on their turn
      state.diplomacy.offers.push({ id: (state._offerSeq = (state._offerSeq || 0) + 1), from, to, kind: "truce", rounds });
      return { ok: true, pending: true };
    }
    const accept = aiAcceptTruce(state, to, from);
    dipSay(state, to, accept ? "acceptTruce" : "declineTruce");
    if (accept) setTruce(state, from, to, rounds);
    return { ok: true, accepted: accept };
  }
  function aiAcceptFocus(state, ai, target, from) {
    if (target === ai || sameTeam(state.players[ai], state.players[target])) return false;
    if (state.diplomacy.rep[from] < 25) return false;
    const tf = totalFame(state.players[target]), leaderFame = Math.max(...state.players.map(totalFame));
    return tf >= leaderFame - 1 && state.rnd() < 0.7;    // gang up on the (near-)leader
  }
  function proposeFocus(state, from, target) {
    if (from === target) return { ok: false };
    dipSay(state, from, "proposeFocus");
    let agree = 0, voicer = -1;
    for (const p of state.players) if (!p.human && p.idx !== from && p.idx !== target && aiAcceptFocus(state, p.idx, target, from)) { agree++; if (voicer < 0) voicer = p.idx; }
    if (agree) { state.diplomacy.focus = target; dipSay(state, voicer, "acceptFocus"); }   // only an AGREED pact steers AI fire
    else dipSay(state, from, "declineFocus");                                               // nobody bit — no focus set
    return { ok: true, focus: agree ? target : null, agree };
  }
  function respondToOffer(state, offerId, accept) {
    const i = state.diplomacy.offers.findIndex(o => o.id === offerId); if (i < 0) return false;
    const o = state.diplomacy.offers.splice(i, 1)[0];
    dipSay(state, o.to, accept ? "acceptTruce" : "declineTruce");
    if (accept && o.kind === "truce") setTruce(state, o.from, o.to, o.rounds);
    return true;
  }
  // emit a persona's signature line (or a generic trash line) into the feed/log
  function dipTaunt(state, fromIdx) {
    const p = state.players[fromIdx], lines = p && p.persona && p.persona.lines;
    if (lines && lines.length) { const li = Math.floor(state.rnd() * lines.length); dipSay(state, fromIdx, "trash", lines[li], "bark.persona." + p.persona.id + "." + li); }
    else dipSay(state, fromIdx, "trash", null);
    return true;
  }
  function tickDiplomacy(state) {
    const d = state.diplomacy; if (!d) return;
    for (const k in d.truce) if (state.round >= d.truce[k]) delete d.truce[k];   // expire elapsed truces
    if (d.focus != null) { const t = state.players[d.focus]; if (!t || t.reloadZone || totalFame(t) <= 0) d.focus = null; }
  }
  function beaconHexCount(state) {
    return Object.values(state.board).filter(c => c.tokens.some(t => t.kind === "beacon")).length;
  }
  function supplyHexCount(state) {
    return Object.values(state.board).filter(c => c.tokens.some(t => t.kind === "supply")).length;
  }

  // ============================================================
  // turn / action engine (task #4)
  // ============================================================
  // Win = your Fame tokens overlap the Superstar zone at the END of your Fame Track (rulebook p.4).
  // Track length is fixed by its physical pieces, which differ by game mode:
  //   Battle Royale (Standard) = 1 Start + 2 middle + 1 End piece.
  //   Team Royale / 2-player    = 1 Start + 4 middle + 1 End piece (longer).
  // Modelling each piece's fame-token spaces as Start≈2, middle≈6, End≈2 gives:
  //   Battle Royale = 2 + 2*6 + 2 = 16 ;  Team = 2 + 4*6 + 2 = 28.
  const TRACK_PIECE_SPACES = { start: 2, middle: 6, end: 2 };
  function superstarThreshold(mode, numPlayers) {
    // Team Royale uses the longer track; the rulebook also recommends the longer 2-player Team track
    // for any 2-player game ("If playing with 2 players it is recommended ... use the 2 player Team Royale variant").
    const longTrack = mode === "team" || mode === "team3v3" || mode === "team2v2v2" || mode === "twoPlayer" || numPlayers === 2;
    const mids = longTrack ? 4 : 2;
    return TRACK_PIECE_SPACES.start + mids * TRACK_PIECE_SPACES.middle + TRACK_PIECE_SPACES.end;
  }
  const SUPERSTAR_FAME = superstarThreshold("battleRoyale");  // 16 — Battle Royale standard track (3-4 players)
  const MOUNTAIN_RUN_COST = 2;

  // log entry = { s: source(zh) string, k: i18n key, p: params }; the UI formats k/p per language, falling back to s.
  function log(state, msg, k, p) { state.log.unshift(k ? { s: msg, k, p } : msg); if (state.log.length > 120) state.log.pop(); }
  // a UI-facing feed of "an action die of value <die> was placed for <kind> at <hex>" — drives the per-action
  // dice animation for both the human and the AI (combat has its own overlay, so it isn't recorded here).
  function recordAction(state, p, kind, die) {
    (state.actionFeed || (state.actionFeed = [])).push({ by: p.idx, kind, die: die == null ? 1 : die, hex: p.pos ? hexKey(p.pos.q, p.pos.r) : null, seq: (state._actSeq = (state._actSeq || 0) + 1) });
    if (state.actionFeed.length > 60) state.actionFeed.shift();
  }
  function curP(state) { return state.players[state.activePlayer]; }
  function isHumanTurn(state) { return !state.gameOver && curP(state).human; }

  function towerKey(state) { for (const k in state.board) if (state.board[k].hasTower) return k; return null; }
  // Capture the Flag helpers
  function baseKeyOf(state, team) { if (!state.flags) return null; for (const k in state.board) if (state.board[k].base === team) return k; return null; }
  function legalParachute(state) {
    // Capture the Flag: deploy at your own team's base (HQ) and its neighbours
    if (state.flags) { const bk = baseKeyOf(state, curP(state).team); if (bk) return [bk, ...neighbors(state, state.board[bk].q, state.board[bk].r)]; }
    const tk = towerKey(state); if (!tk) return [];
    return [tk, ...neighbors(state, state.board[tk].q, state.board[tk].r)];
  }

  function gainFame(state, p, kind, n) {
    const got = Math.min(n, state.fameSupply[kind]);
    p.fame[kind] += got; state.fameSupply[kind] -= got;
    // NEXT-achievement triggers fire off the underlying fame gains (guard against achievement recursion)
    if (got > 0 && state.achievements && kind !== "achievement") {
      if (kind === "trap") awardNextAchievement(state, p, "trapFame");
      else if (kind === "injury") { p._injFameTurn = (p._injFameTurn || 0) + got; if (p._injFameTurn >= 2) awardNextAchievement(state, p, "twoInjuryFame"); }
    }
    if (scoreFor(state, p) >= (state.superstarFame || SUPERSTAR_FAME) && !state.gameOver) {
      state.gameOver = true; state.winner = p.idx; state.winnerTeam = p.team; state.superstar = true;
      log(state, `★ ${p.team != null ? `队伍 ${p.team + 1}` : p.name} 达到 Superstar，立即获胜！`, p.team != null ? "superstarTeam" : "superstar", { n: p.team + 1, name: p.name });
    }
  }

  // ---- Achievements module ----
  // metric value for a MOST achievement (end-game / announcement scoring)
  function mostMetric(state, p, metric) {
    if (metric === "reload") return p.fame.reload;
    if (metric === "beacon") return p.fame.beacon;
    if (metric === "variety") return ["injury", "beacon", "teamSpirit", "reload", "trap", "achievement"].filter(k => p.fame[k] > 0).length;
    if (metric === "threeStar") return [p.equipped.head, p.equipped.torso, ...p.equipped.hand, ...p.backpack].map(byId).filter(e => e && e.star === 3).length;
    return 0;
  }
  // NEXT achievement: the next player to fulfil the metric claims the card + its accumulated fame tokens
  function awardNextAchievement(state, p, metric) {
    const ac = state.achievements; if (!ac) return false;
    const slot = ac.board.findIndex(s => { const c = DATA.ACHIEVEMENT_BY_ID[s.id]; return c.type === "next" && c.metric === metric; });
    if (slot < 0) return false;
    const card = DATA.ACHIEVEMENT_BY_ID[ac.board[slot].id], fame = ac.board[slot].fameBelow || 0;
    p.achievementsWon.push(card.id);
    state.lastAchievement = { player: p.idx, id: card.id, name: card.cn, fame, kind: "next" };
    state._achSeq = (state._achSeq || 0) + 1;
    if (ac.deck.length) ac.board[slot] = { id: ac.deck.pop(), fameBelow: 1 };   // replace from deck (new card starts with 1 token)
    else ac.board.splice(slot, 1);
    log(state, `⚡ ${p.name} 达成成就「${card.cn}」(+${fame} 成就名望)`, "achNext", { name: p.name, achId: card.id, fame });
    gainFame(state, p, "achievement", fame);                                    // may trigger Superstar — that's legal mid-game
    return true;
  }
  // snapshot every player's value for each MOST metric currently in the display, taken BEFORE any
  // award — so awarding achievement fame for one card can't skew a later card (e.g. "variety", which
  // counts the achievement color). Returns metric -> array(playerIdx -> value).
  function snapshotMostMetrics(state, mostSlots) {
    const snap = {};
    for (const slot of mostSlots) { const m = DATA.ACHIEVEMENT_BY_ID[slot.id].metric; if (!(m in snap)) snap[m] = state.players.map(p => mostMetric(state, p, m)); }
    return snap;
  }
  // MOST achievements: scored at End of Game (no Superstar can be triggered during awarding)
  function scoreMostAchievements(state) {
    const ac = state.achievements; if (!ac) return;
    const mostSlots = ac.board.filter(s => DATA.ACHIEVEMENT_BY_ID[s.id].type === "most");
    const snap = snapshotMostMetrics(state, mostSlots);
    for (const slot of mostSlots) {
      const card = DATA.ACHIEVEMENT_BY_ID[slot.id], vals = snap[card.metric];
      const best = Math.max(...vals);
      if (best <= 0) continue;                                                  // nobody qualifies
      const fame = slot.fameBelow || 1;
      for (let i = 0; i < state.players.length; i++) if (vals[i] === best) {     // ties: all tied players earn it
        const w = state.players[i], got = Math.min(fame, state.fameSupply.achievement);
        w.fame.achievement += got; state.fameSupply.achievement -= got; w.achievementsWon.push(card.id);
        log(state, `🏆 ${w.name} 获得「${card.cn}」成就 (+${got} 成就名望)`, "achMost", { name: w.name, achId: card.id, got });
      }
    }
  }
  // Announcement event: MOST(1) award current leaders + NEXT(1) refresh, plus token top-ups
  function resolveAnnouncement(state) {
    const ac = state.achievements; if (!ac || !ac.board.length) return;
    const mostSlots = ac.board.filter(s => DATA.ACHIEVEMENT_BY_ID[s.id].type === "most");
    const snap = snapshotMostMetrics(state, mostSlots);                          // freeze leaders before any award
    for (const slot of mostSlots) {
      const card = DATA.ACHIEVEMENT_BY_ID[slot.id], vals = snap[card.metric];
      const best = Math.max(...vals);
      if (best <= 0) continue;
      for (let i = 0; i < state.players.length; i++) if (vals[i] === best) { const w = state.players[i]; log(state, `📣 战报：${w.name} 暂列「${card.cn}」领先 (+1 成就名望)`, "achLead", { name: w.name, achId: card.id }); gainFame(state, w, "achievement", 1); }
    }
    ac.board[0].fameBelow = (ac.board[0].fameBelow || 0) + 1;                   // top up leftmost card
    const nextIdx = ac.board.findIndex(s => DATA.ACHIEVEMENT_BY_ID[s.id].type === "next");
    if (nextIdx >= 0 && ac.deck.length) { ac.board[nextIdx] = { id: ac.deck.pop(), fameBelow: 1 }; log(state, `📣 战报：刷新一张「下一位」成就`, "achRefresh", {}); }
    const last = ac.board[ac.board.length - 1]; if (last) last.fameBelow = (last.fameBelow || 0) + 1; // top up rightmost
  }

  function beginTurn(state) {
    const p = curP(state);
    p.actionDice = START_ACTION_DICE - p.injuries;       // injuries reduce available dice
    p.defensePool = p.actionDice; p.assigned = 0; p.assignedDice = []; p.boost = false; p.boostDice = 0; p.combatLine = [];
    p._closeEndedTurn = false; p._noMove = false; p.hasActed = false; p._gaveThisTurn = false; p._runBonus = false; p._runBonusUsed = false;
    p._freeBuildUsed = false; p._revealed = false; p._droneUsed = false; p._wallCombo = 0;   // Betty free-build / Echo cloak / Cody drone / wall-combo reset each turn
    for (const x of state.players) x._injFameTurn = 0;   // DOUBLE TROUBLE counts injury fame within a single turn
    state.lastAchievement = null;
    autoEquip(p);                                        // MVP: auto-equip best weapon/armor (no equip UI yet)
    // Solar Array terrain: starting your turn on it grants +1 boost die (energy — non-combat, like Energy Drink).
    if (p.pos) { const _c = state.board[hexKey(p.pos.q, p.pos.r)]; if (_c && TERRAIN[_c.terrain].energy) { p.boostDice += 1; p.defensePool += 1; p.actionDice = Math.max(p.actionDice, p.defensePool); log(state, `☀ ${p.name} 在太阳能阵列充能 +1 行动骰`, "solarCharge", { name: p.name }); } }
    // NOTE: carried beacons are NOT auto-scored. Per rules they stay in temp storage
    // until the player Activates the Central Tower to upload them (see doActivate).
    state.needsParachute = (p.pos == null);
    state.phase = state.needsParachute ? "parachute" : "action";
    return p;
  }

  const faceDir = (f) => (f === "skull" ? 5 : f - 1);   // die face -> hex direction 0..5
  function parachute(state, key) {
    if (!state.needsParachute || !legalParachute(state).includes(key)) return false;
    const p = curP(state), c = state.board[key];
    p.pos = { q: c.q, r: c.r };
    // drift: roll 2 dice — land on chosen hex if same value OR opposite directions; else a
    // front pushes you 1 hex in a rolled direction (drift ignores walls). (rules 07:08)
    const f1 = rollDie(state.rnd), f2 = rollDie(state.rnd), d1 = faceDir(f1), d2 = faceDir(f2);
    if (f1 !== f2 && d2 !== (d1 + 3) % 6) {
      for (const d of [d1, d2]) {
        const nk = hexKey(p.pos.q + HEX_DIRS[d].q, p.pos.r + HEX_DIRS[d].r);
        if (state.board[nk]) { p.pos = { q: state.board[nk].q, r: state.board[nk].r }; break; }
      }
      log(state, `${p.name} 空降遇锋面，飘移一格`, "drift", { name: p.name });
    }
    p.reloadZone = false; state.needsParachute = false; state.phase = "action";
    log(state, `${p.name} 跳伞降落到 ${state.board[hexKey(p.pos.q, p.pos.r)].terrain}`, "parachute", { name: p.name, terrain: state.board[hexKey(p.pos.q, p.pos.r)].terrain });
    return true;
  }

  function dirIndex(a, b) {
    for (let i = 0; i < HEX_DIRS.length; i++)
      if (a.q + HEX_DIRS[i].q === b.q && a.r + HEX_DIRS[i].r === b.r) return i;
    return -1;
  }
  // a wall blocks unless it belongs to the mover (own/team barriers don't block self).
  // a wall is passable by the mover if it's their own or (Team Royale) a teammate's; neutral walls always block
  function wallPassable(state, owner, moverIdx) {
    if (owner === moverIdx) return true;
    if (typeof owner === "number" && state.players[owner] && state.players[moverIdx] && sameTeam(state.players[owner], state.players[moverIdx])) return true;
    return false;
  }
  function wallBetween(state, aKey, bKey, moverIdx) {
    const A = state.board[aKey], B = state.board[bKey], d = dirIndex(A, B);
    if (d < 0) return false;
    const oa = A.walls[d], ob = B.walls[(d + 3) % 6];
    if (oa != null && !wallPassable(state, oa, moverIdx)) return true;
    if (ob != null && !wallPassable(state, ob, moverIdx)) return true;
    return false;
  }
  function runCost(state, toKey, p) {
    if (p && p.character === "sora") return 1;                 // Sora — All-Terrain: no terrain movement penalty
    return TERRAIN[state.board[toKey].terrain].moveCost || 1;  // mountain & maze cost 2; everything else 1
  }

  // Blitz — Fastest There Is: a bonus follow-up step is available only after a die-paid Run this turn
  function blitzBonusStep(p) { return p.character === "blitz" && p._runBonus && !p._runBonusUsed; }
  function legalRuns(state, p) {
    if (!p.pos || state.phase !== "action" || p._noMove) return [];
    const budget = blitzBonusStep(p) ? Infinity : p.defensePool;   // the bonus step ignores the dice budget
    const ignoreWalls = p.character === "sora";                     // Sora ignores barrier movement limits
    const cur = hexKey(p.pos.q, p.pos.r), out = [];
    for (const nk of neighbors(state, p.pos.q, p.pos.r)) {
      if (!ignoreWalls && wallBetween(state, cur, nk, p.idx)) continue;
      if (runCost(state, nk, p) <= budget) out.push(nk);
    }
    if (state.board[cur].portal && (blitzBonusStep(p) || p.defensePool >= 1))
      for (const k in state.board) if (k !== cur && state.board[k].portal) out.push(k);
    return out;
  }
  const isNumericDie = (v) => typeof v === "number" && v >= 1 && v <= 5;
  function sortCombatLine(line) { return line.filter(isNumericDie).sort((a, b) => b - a); }
  // dice available for COMBAT/injury = pool minus the Energy Drink boost dice (which can't be used in combat / as injury)
  function combatDice(p) { return p.defensePool - (p.boostDice || 0); }
  function spendDice(state, p, n, face) {
    const f = face == null ? 1 : face;
    for (let i = 0; i < n; i++) {
      if (p.defensePool <= 0) break;
      const realAvail = p.defensePool - (p.boostDice || 0);   // real action dice remaining before this spend
      p.defensePool -= 1;
      if (realAvail > 0) p.assignedDice.push(f);              // a real action die -> becomes a combat-line die in End Phase
      else p.boostDice = Math.max(0, (p.boostDice || 0) - 1); // the Energy Drink boost die: spent now, never enters the combat line / injury zone
    }
    p.assigned = p.assignedDice.length;
    p.hasActed = true;                                        // locks equipment for the rest of the turn (survives injury die-pops)
    p._wallCombo = 0;                                         // spending a die on any action ends a pending free 2nd-wall
  }
  function moveAssignedDiceToCombatLine(p) {
    p.actionDice = START_ACTION_DICE - p.injuries;
    // assignedDice holds only real action dice (boost dice are dropped at spend-time in spendDice and
    // never reach here). Cap to real owned dice as a defensive safety net.
    let line = sortCombatLine([...(p.combatLine || []), ...(p.assignedDice || [])]);
    if (line.length > p.actionDice) line = line.slice(0, p.actionDice);
    p.combatLine = line;
    p.assignedDice = []; p.assigned = 0; p.boostDice = 0;
    p.defensePool = Math.max(0, p.actionDice - p.combatLine.length);
  }
  function hasFriendlyHideout(state, p) {
    if (!p.pos) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    return !!cell.dome || cell.hideouts.includes(p.idx);
  }
  function resolveHideoutBenefit(state, p) {
    if (!hasFriendlyHideout(state, p) || !p.combatLine.length) return false;
    p.combatLine = sortCombatLine(p.combatLine);
    p.combatLine.pop();
    p.defensePool = Math.min(p.actionDice, p.defensePool + 1);
    return true;
  }
  function syncDiceCounts(p) {
    p.actionDice = START_ACTION_DICE - p.injuries;
    p.defensePool = Math.max(0, Math.min(p.defensePool, p.actionDice));
    p.boostDice = Math.min(p.boostDice || 0, p.defensePool);
    p.assigned = p.assignedDice ? p.assignedDice.length : 0;
  }
  function doRun(state, toKey) {
    const p = curP(state);
    if (!legalRuns(state, p).includes(toKey)) return false;
    const cur = hexKey(p.pos.q, p.pos.r);
    const portalJump = state.board[cur].portal && state.board[toKey].portal && dirIndex(p.pos, state.board[toKey]) < 0;
    if (blitzBonusStep(p)) { p._runBonus = false; p._runBonusUsed = true; p.hasActed = true; log(state, `⚡ ${p.name} 疾速：追加一步`, "blitzStep", { name: p.name }); }  // free bonus hex
    else { spendDice(state, p, portalJump ? 1 : runCost(state, toKey, p), 1); if (p.character === "blitz" && !p._runBonusUsed) p._runBonus = true; } // a paid Run unlocks the bonus step
    const c = state.board[toKey]; p.pos = { q: c.q, r: c.r };
    recordAction(state, p, portalJump ? "portal" : "run", 1);
    log(state, `${p.name} ${portalJump ? "穿越传送门到" : "移动到"} ${c.terrain}`, portalJump ? "portal" : "move", { name: p.name, terrain: c.terrain });
    if (c.trap != null && c.trap !== p.idx) resolveTrap(state, p, c.trap, toKey); // step on enemy trap
    return true;
  }

  const isLootable = t => t.kind !== "flag";   // CTF flags are grabbed (grabFlag), never picked up by a generic Loot
  function lootOptions(state, p) {
    if (!p.pos || state.phase !== "action" || p.defensePool < 1) return [];
    return state.board[hexKey(p.pos.q, p.pos.r)].tokens.filter(isLootable);
  }
  function doLoot(state, tokenIdx) {
    const p = curP(state);
    if (p.defensePool < 1) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    const tok = cell.tokens.filter(isLootable)[tokenIdx];   // tokenIdx indexes the lootable list (matches lootOptions)
    if (!tok) return false;
    spendDice(state, p, 1, 1); recordAction(state, p, "loot", 1); cell.tokens.splice(cell.tokens.indexOf(tok), 1);
    if (tok.kind === "beacon") { p.carryingBeacons += 1; log(state, `${p.name} 拾取信标（需带到中央塔上缴）`, "lootBeacon", { name: p.name }); }
    else if (tok.kind === "supply") {
      const dk = "equip" + (tok.star || 2), xk = "discard" + (tok.star || 2);
      const draws = p.character === "korat" ? 3 : 2;        // Korat — Gift From Father: +1 card
      const got = []; for (let i = 0; i < draws; i++) { const c = state.decks[dk].pop(); if (c) got.push(c); }
      if (got.length) { p.backpack.push(got[0]); for (let i = 1; i < got.length; i++) state.decks[xk].push(got[i]); }
      log(state, `${p.name} 开 ${tok.star || 2} 星补给箱，抽${got.length}留1${draws === 3 ? "（Gift From Father）" : ""}`, draws === 3 ? "openSupplyGift" : "openSupply", { name: p.name, star: tok.star || 2, drew: got.length });
    }
    return true;
  }

  // Cody & Buzz — Drone Buzz: spend an action die to Loot a token on the current OR an adjacent hex.
  function droneLootOptions(state, p) {
    if (!p || p.character !== "codybuzz" || !p.pos || state.phase !== "action" || p.defensePool < 1 || p._droneUsed) return [];   // drone: once per turn
    const out = [], here = hexKey(p.pos.q, p.pos.r), cells = [here, ...neighbors(state, p.pos.q, p.pos.r)];
    for (const k of cells) state.board[k].tokens.forEach((tok, i) => out.push({ key: k, tokenIdx: i, kind: tok.kind, star: tok.star }));
    return out;
  }
  function doDroneLoot(state, key, tokenIdx) {
    const p = curP(state);
    if (p.character !== "codybuzz" || p.defensePool < 1 || !p.pos || p._droneUsed) return false;   // drone: once per turn
    const here = hexKey(p.pos.q, p.pos.r);
    if (key !== here && !neighbors(state, p.pos.q, p.pos.r).includes(key)) return false;   // current or adjacent only
    const cell = state.board[key]; if (!cell) return false;
    const tok = cell.tokens[tokenIdx]; if (!tok) return false;
    spendDice(state, p, 1, 1); recordAction(state, p, "loot", 1); cell.tokens.splice(tokenIdx, 1); p._droneUsed = true;
    if (tok.kind === "beacon") { p.carryingBeacons += 1; log(state, `🤖 ${p.name} 的无人机巴兹拾取信标`, "droneBeacon", { name: p.name }); }
    else if (tok.kind === "supply") {
      const dk = "equip" + (tok.star || 2), xk = "discard" + (tok.star || 2);
      const a = state.decks[dk].pop(), b = state.decks[dk].pop();
      if (a) p.backpack.push(a); if (b) state.decks[xk].push(b);
      log(state, `🤖 ${p.name} 的无人机巴兹开 ${tok.star || 2}★ 补给箱`, "droneSupply", { name: p.name, star: tok.star || 2 });
    }
    return true;
  }

  // Activate: at the Central Tower, upload all carried beacons -> beacon fame.
  // (Other hex Activate abilities are appendix content — TODO.)
  function onTower(state, p) { return p.pos && state.board[hexKey(p.pos.q, p.pos.r)].hasTower; }
  function canUpload(state, p) { return state.phase === "action" && p.defensePool >= 1 && onTower(state, p) && p.carryingBeacons > 0; }
  function doActivate(state) {
    const p = curP(state);
    if (!canUpload(state, p)) return false;
    spendDice(state, p, 1, 1); recordAction(state, p, "activate", 1);
    const n = p.carryingBeacons;
    log(state, `${p.name} 在中央塔上传 ${n} 个信标 → +${n} 名望`, "upload", { name: p.name, n });
    gainFame(state, p, "beacon", n); p.carryingBeacons = 0;
    return true;
  }

  // ---- Capture the Flag actions (奪旗賽) ----
  const FLAG_CAPTURE_FAME = 5;          // fame awarded for returning an enemy flag to your base
  function enemyTeamOf(p) { return p.team === 0 ? 1 : 0; }
  function onOwnBase(state, p) { return p.pos && state.board[hexKey(p.pos.q, p.pos.r)].base === p.team; }
  // grab the enemy flag while standing on the enemy base (it must be home there, and you're empty-handed)
  function canGrabFlag(state, p) {
    if (!state.flags || state.phase !== "action" || p.defensePool < 1 || p.carryingFlag != null || !p.pos) return false;
    const et = enemyTeamOf(p), key = hexKey(p.pos.q, p.pos.r);
    return state.board[key].base === et && state.flags[et].at === key;
  }
  function grabFlag(state) {
    const p = curP(state); if (!canGrabFlag(state, p)) return false;
    const et = enemyTeamOf(p), cell = state.board[hexKey(p.pos.q, p.pos.r)];
    const i = cell.tokens.findIndex(t => t.kind === "flag" && t.team === et); if (i < 0) return false;
    spendDice(state, p, 1, 1); recordAction(state, p, "loot", 1);
    cell.tokens.splice(i, 1); p.carryingFlag = et; state.flags[et].carrier = p.idx; state.flags[et].at = null;
    log(state, `🚩 ${p.name} 夺取了队伍${et + 1}的旗帜！`, "grabFlag", { name: p.name, team: et + 1 });
    return true;
  }
  // return a carried enemy flag home (token back on its base) — on capture or when the carrier RELOADs
  function returnFlagHome(state, team) {
    const f = state.flags[team]; const home = state.board[f.home];
    if (home && !home.tokens.some(t => t.kind === "flag" && t.team === team)) home.tokens.push({ kind: "flag", team });
    f.at = f.home; f.carrier = null;
  }
  // submit a carried enemy flag at your own base -> flag fame + capture
  function canScoreFlag(state, p) { return !!state.flags && state.phase === "action" && p.defensePool >= 1 && p.carryingFlag != null && onOwnBase(state, p); }
  function scoreFlag(state) {
    const p = curP(state); if (!canScoreFlag(state, p)) return false;
    const t = p.carryingFlag;
    spendDice(state, p, 1, 1); recordAction(state, p, "activate", 1);
    p.carryingFlag = null; returnFlagHome(state, t); state.captures[p.team] = (state.captures[p.team] || 0) + 1;
    log(state, `🏁 ${p.name} 将旗帜带回基地，夺旗成功！ +${FLAG_CAPTURE_FAME} 名望`, "scoreFlag", { name: p.name, n: FLAG_CAPTURE_FAME });
    gainFame(state, p, "flag", FLAG_CAPTURE_FAME);
    return true;
  }

  // BFS first-step toward a target hex (respects walls; ignores portals). For AI navigation.
  function bfsStep(state, p, targetKey) {
    if (!p.pos) return null;
    const start = hexKey(p.pos.q, p.pos.r);
    if (start === targetKey) return null;
    const ignoreWalls = p.character === "sora";
    const prev = { [start]: null }, q = [start];
    while (q.length) {
      const cur = q.shift(), c = state.board[cur];
      for (const nk of neighbors(state, c.q, c.r)) {
        if (nk in prev || (!ignoreWalls && wallBetween(state, cur, nk, p.idx))) continue;
        prev[nk] = cur;
        if (nk === targetKey) { let n = nk; while (prev[n] !== start) n = prev[n]; return n; }
        q.push(nk);
      }
    }
    return null;
  }

  // ---- Heal (restricted: not while an ENEMY shares your hex; a teammate sharing is fine) ----
  function enemyOnHex(state, p) { return !!(p.pos && playersOnHex(state, p.pos.q, p.pos.r).some(x => x !== p && !sameTeam(x, p))); }
  // who the active player can heal right now: self (if injured) + injured teammates on the same hex
  function healTargets(state, p) {
    if (state.phase !== "action" || p.defensePool < 1 || !p.pos || (enemyOnHex(state, p) && p.character !== "emmet")) return [];   // Emmet — Field Medic: heal even under threat
    const out = [];
    if (p.injuries > 0) out.push(p.idx);
    for (const t of playersOnHex(state, p.pos.q, p.pos.r)) if (t !== p && sameTeam(t, p) && t.injuries > 0) out.push(t.idx);
    return out;
  }
  function canHeal(state, p) { return healTargets(state, p).length > 0; }
  function doHeal(state, targetIdx) {
    const p = curP(state);
    const targets = healTargets(state, p); if (!targets.length) return false;
    let target = (targetIdx != null && targets.includes(targetIdx)) ? state.players[targetIdx] : state.players[targets[0]];
    let die = rollDie(state.rnd);
    if (p.character === "emmet" && die !== "skull") die = rollDie(state.rnd);   // Emmet — Field Medic: re-roll the heal die (skull = +1)
    const base = target === p ? 1 : 2;                                          // healing a teammate restores 2 (rules p.8)
    const heal = Math.min(target.injuries, base + (die === "skull" ? 1 : 0));   // skull +1
    spendDice(state, p, 1, die); recordAction(state, p, "heal", die);
    target.injuries -= heal; target.actionDice = START_ACTION_DICE - target.injuries; target.defensePool += heal;
    if (target !== p) { log(state, `${p.name} 治疗队友 ${target.name}：掷${die === "skull" ? "骷髅" : die}，恢复 ${heal} 点（+1 团队精神）`, "healMate", { name: p.name, mate: target.name, heal }); gainFame(state, p, "teamSpirit", 1); }
    else log(state, `${p.name} 治疗：掷${die === "skull" ? "骷髅(+2)" : die}，恢复 ${heal} 点伤`, "healSelf", { name: p.name, heal });
    state.lastRoll = { kind: "heal", by: p.idx, target: target.idx, value: die, healed: heal };
    return true;
  }
  // Equip a Teammate (free action, once per turn): give a backpack equipment or a carried beacon to a teammate
  function giveToTeammate(state, toIdx, what) {
    const p = curP(state), to = state.players[toIdx];
    if (state.phase !== "action" || !to || !sameTeam(p, to) || p === to || p._gaveThisTurn) return false;
    if (what === "beacon") { if (p.carryingBeacons < 1) return false; p.carryingBeacons--; to.carryingBeacons++; }
    else { const i = p.backpack.indexOf(what); if (i < 0) return false; p.backpack.splice(i, 1); to.backpack.push(what); }
    p._gaveThisTurn = true;
    log(state, `${p.name} 将${what === "beacon" ? "1 信标" : (byId(what) || {}).name || "装备"}交给队友 ${to.name}`, what === "beacon" ? "giveBeacon" : "giveItem", { name: p.name, to: to.name, item: (byId(what) || {}).name || "" });
    return true;
  }

  // ---- Build (restricted): barriers / hideout / trap ----
  const SETUP_WALLS = SETUP.walls, SETUP_TRAPS = SETUP.traps;
  function noEnemyHere(state, p) { return !!p.pos && !enemyOnHex(state, p); }   // teammates sharing the hex don't restrict
  function bettyFreeBuild(p) { return p.character === "betty" && !p._freeBuildUsed; }   // Betty — Demolitions: one free Build per turn
  function payBuild(state, p) {                                                          // a Build action: free for Betty's first, else 1 action die
    if (bettyFreeBuild(p)) { p._freeBuildUsed = true; p.hasActed = true; }
    else spendDice(state, p, 1, 1);
  }
  function canBuild(state, p) { return state.phase === "action" && (p.defensePool >= 1 || bettyFreeBuild(p)) && noEnemyHere(state, p); }
  function emptyEdges(state, p) {
    if (!p.pos) return [];
    const cell = state.board[hexKey(p.pos.q, p.pos.r)], out = [];
    for (let e = 0; e < 6; e++) {
      const nb = state.board[hexKey(p.pos.q + HEX_DIRS[e].q, p.pos.r + HEX_DIRS[e].r)];
      if (cell.walls[e] == null && (!nb || nb.walls[(e + 3) % 6] == null)) out.push(e);
    }
    return out;
  }
  function wallsUsed(state, p) { return p.team != null ? teamBarriers(state, p.team) : p.barriersUsed; }
  // A single Build action places UP TO 2 walls (rules 09:25). combo=true is the free 2nd wall of the same
  // action: it skips the die cost and bypasses the dice requirement, but only right after a paid 1st wall.
  function doBuildBarrier(state, edge, combo) {
    const p = curP(state);
    if (combo) { if (p._wallCombo !== 1 || state.phase !== "action" || !noEnemyHere(state, p)) return false; }
    else if (!canBuild(state, p)) return false;
    if (wallsUsed(state, p) >= SETUP_WALLS || !emptyEdges(state, p).includes(edge)) return false;  // teams share the 6-wall limit
    if (!combo) payBuild(state, p);
    state.board[hexKey(p.pos.q, p.pos.r)].walls[edge] = p.idx; p.barriersUsed++;
    p._wallCombo = combo ? 0 : 1;                  // a paid 1st wall opens a free 2nd; the 2nd closes it
    if (!combo) recordAction(state, p, "barrier", 1);
    log(state, `${p.name} 建造屏障`, "buildBarrier", { name: p.name }); return true;
  }
  function doDemolish(state, edge) {
    const p = curP(state); if (!canBuild(state, p)) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    if (cell.walls[edge] == null) return false;
    const owner = cell.walls[edge]; delete cell.walls[edge];
    if (typeof owner === "number" && state.players[owner]) state.players[owner].barriersUsed = Math.max(0, state.players[owner].barriersUsed - 1);
    payBuild(state, p); recordAction(state, p, "demolish", 1); log(state, `${p.name} 拆除屏障`, "demolishBarrier", { name: p.name }); return true;
  }
  function doBuildHideout(state) {
    const p = curP(state); if (!canBuild(state, p)) return false;
    const k = hexKey(p.pos.q, p.pos.r);
    if (state.board[k].hideouts.length) return false;
    if (p.hideout && state.board[p.hideout]) state.board[p.hideout].hideouts = state.board[p.hideout].hideouts.filter(h => h !== p.idx);
    payBuild(state, p); state.board[k].hideouts.push(p.idx); p.hideout = k;
    recordAction(state, p, "hideout", 1);
    log(state, `${p.name} 设置藏身处`, "buildHideout", { name: p.name }); return true;
  }
  function doDemolishHideout(state, ownerIdx) {
    const p = curP(state); if (!canBuild(state, p)) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    if (!cell.hideouts.length) return false;
    const idx = ownerIdx != null ? cell.hideouts.indexOf(ownerIdx) : 0;
    if (idx < 0) return false;
    const owner = cell.hideouts.splice(idx, 1)[0];
    if (state.players[owner]) state.players[owner].hideout = null;
    payBuild(state, p); recordAction(state, p, "demolish", 1); log(state, `${p.name} 拆除藏身处`, "demolishHideout", { name: p.name }); return true;
  }
  function doBuildTrap(state) {
    const p = curP(state); if (!canBuild(state, p) || p.trapsUsed >= SETUP_TRAPS) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    if (cell.trap != null) return false;
    payBuild(state, p); cell.trap = p.idx; p.trapsUsed++;
    recordAction(state, p, "trap", 1);
    log(state, `${p.name} 埋设陷阱`, "buildTrap", { name: p.name });
    // Team Spirit: building a trap in the same hex as a teammate scores +1 (rules 002 modules)
    if (playersOnHex(state, p.pos.q, p.pos.r).some(x => x !== p && sameTeam(x, p))) {
      gainFame(state, p, "teamSpirit", 1); log(state, `${p.name} 在队友身边埋雷 +1 团队精神`, "trapTeammate", { name: p.name });
    }
    return true;
  }
  function resolveTrap(state, walker, ownerIdx, key) {
    const owner = state.players[ownerIdx], cell = state.board[key];
    cell.trap = null; if (owner) owner.trapsUsed = Math.max(0, owner.trapsUsed - 1);
    const rps = (d) => d <= 2 ? 0 : d <= 4 ? 1 : 2;     // d6: rock(1-2)/paper(3-4)/scissor(5-6)
    const wins = (a, b) => (a + 2) % 3 === b;            // a beats b: rock>scissor, paper>rock, scissor>paper
    const w = rps(Math.floor(state.rnd() * 6) + 1), t = rps(Math.floor(state.rnd() * 6) + 1);
    let outcome;
    if (w === t) { outcome = "tie"; gainFame(state, owner, "trap", 1); walker._noMove = true; log(state, `陷阱：${walker.name} 与 ${owner.name} 的陷阱平手（${owner.name} +1陷阱名望，停止移动）`, "trapTie", { walker: walker.name, owner: owner.name }); }
    else if (wins(w, t)) { outcome = "dodge"; gainFame(state, walker, "trap", 1); log(state, `陷阱：${walker.name} 闪过 ${owner.name} 的陷阱（+1陷阱名望）`, "trapDodge", { walker: walker.name, owner: owner.name }); }
    else { outcome = "hit"; gainFame(state, owner, "trap", 1); const rl = takeInjuries(state, walker, 1); if (rl) reloadPlayer(state, walker, owner); else gainFame(state, owner, "injury", 1); log(state, `陷阱：${walker.name} 踩中 ${owner.name} 的陷阱受伤`, "trapHit", { walker: walker.name, owner: owner.name }); }
    // expose the RPS reveal for the UI mine close-up (w/t: 0=rock,1=paper,2=scissor)
    state.lastTrap = { walker: walker.idx, owner: ownerIdx, w, t, outcome, key };
    state._trapSeq = (state._trapSeq || 0) + 1;
  }

  // ---- Special (free-action) items: Pain Killer / Energy Drink / Tactical Explosive (rules ~03:30) ----
  function specialItems(p) { return p.backpack.map(byId).filter(e => e && e.slot === "special"); }
  function hasSpecial(p, id) { return p.backpack.includes(id); }
  function discardItem(state, p, id) {
    const i = p.backpack.indexOf(id); if (i < 0) return false;
    p.backpack.splice(i, 1);
    const e = byId(id); if (e && state.decks["discard" + e.star]) state.decks["discard" + e.star].push(id);
    return true;
  }
  // enumerate demolish targets for Tactical Explosive: own hex + adjacent (over walls); any trap/wall/hideout
  function explosiveTargets(state, p) {
    if (!p.pos) return [];
    const out = [], here = hexKey(p.pos.q, p.pos.r), cells = [here];
    for (const d of HEX_DIRS) { const k = hexKey(p.pos.q + d.q, p.pos.r + d.r); if (state.board[k]) cells.push(k); }
    for (const k of cells) {
      const c = state.board[k];
      if (c.trap != null) out.push({ key: k, kind: "trap" });
      for (let e = 0; e < 6; e++) if (c.walls[e] != null) out.push({ key: k, kind: "wall", edge: e });
      for (const h of c.hideouts) out.push({ key: k, kind: "hideout", owner: h });
    }
    return out;
  }
  // usable special items right now (for UI list). Pain Killer: anytime if injured; others: own action phase.
  function usableSpecials(state, p) {
    const onTurn = state.phase === "action" && curP(state) === p;
    return specialItems(p).filter(e => {
      if (e.id === "pain_killer") return p.injuries > 0;
      if (e.id === "energy_drink" || e.id === "adrenaline_mask") return onTurn;
      if (e.id === "tactical_explosive") return onTurn && explosiveTargets(state, p).length > 0;
      return false;
    });
  }
  function useSpecialItem(state, itemId, target) {
    const p = curP(state), e = byId(itemId);
    if (!e || !hasSpecial(p, itemId)) return false;
    if (itemId === "pain_killer") {
      if (p.injuries <= 0) return false;
      p.injuries -= 1; p.actionDice = START_ACTION_DICE - p.injuries; p.defensePool += 1;
      log(state, `💊 ${p.name} 使用止痛药，恢复 1 点伤`, "usePainkiller", { name: p.name });
    } else if (itemId === "energy_drink" || itemId === "adrenaline_mask") {
      if (state.phase !== "action") return false;
      p.defensePool += 1; p.boostDice = (p.boostDice || 0) + 1;   // boost die: spendable on actions, not combat / injury
      p.actionDice = Math.max(p.actionDice, p.defensePool);       // allow the extra die to exist beyond the injury-reduced base
      log(state, `🥤 ${p.name} 使用 ${e.name}，本回合 +1 行动骰（不可用于战斗/承伤）`, "useEnergy", { name: p.name });
    } else if (itemId === "tactical_explosive") {
      if (state.phase !== "action" || !target) return false;
      // enforce the same/adjacent range rule in the engine itself (don't trust the caller's target)
      const inRange = explosiveTargets(state, p).some(t =>
        t.key === target.key && t.kind === target.kind &&
        (t.kind !== "wall" || t.edge === target.edge) &&
        (t.kind !== "hideout" || t.owner === target.owner));
      if (!inRange) return false;
      const c = state.board[target.key]; if (!c) return false;
      if (target.kind === "trap") { if (c.trap == null) return false; const o = state.players[c.trap]; c.trap = null; if (o) o.trapsUsed = Math.max(0, o.trapsUsed - 1); }
      else if (target.kind === "wall") { if (c.walls[target.edge] == null) return false; const o = c.walls[target.edge]; delete c.walls[target.edge]; if (typeof o === "number" && state.players[o]) state.players[o].barriersUsed = Math.max(0, state.players[o].barriersUsed - 1); }
      else if (target.kind === "hideout") { const i = c.hideouts.indexOf(target.owner); if (i < 0) return false; const o = c.hideouts.splice(i, 1)[0]; if (state.players[o]) state.players[o].hideout = null; }
      else return false;
      const what = target.kind === "trap" ? "陷阱" : target.kind === "wall" ? "屏障" : "藏身处";
      log(state, `💣 ${p.name} 使用战术炸药，摧毁了${what}`, "explosive", { name: p.name, kind: target.kind });
    } else return false;
    discardItem(state, p, itemId);
    return true;
  }

  function ringFromTower(state, cell) { const tc = state.board[towerKey(state)]; return hexDistance(cell, tc); }
  function resolveEvent(state, id) {
    state.lastEvent = id;
    const ev = DATA.EVENTS[id] || { name: id };
    log(state, `⚡ 事件：${ev.name}`, "event", { id, name: ev.name });
    if (id === "contamination") {
      if (state._toxinFrontier == null) state._toxinFrontier = (state.maxRing != null ? state.maxRing : 2);   // storm starts at the outermost ring and creeps inward
      const fr = state._toxinFrontier; let n = 0;
      for (const k in state.board) { const c = state.board[k]; if (!c.toxin && !c.dome && ringFromTower(state, c) === fr) { c.toxin = true; n++; } }
      state._toxinFrontier = Math.max(0, fr - 1);
      log(state, `　毒气扩张：${n} 格被污染`, "toxinSpread", { n });
    } else if (id === "supply_drop" || id === "ex_tech") {
      const star = id === "ex_tech" ? 3 : 2; let n = 0;
      for (const k of shuffle(Object.keys(state.board), state.rnd)) {
        if (n >= 2) break; const c = state.board[k];
        if (!c.hasTower && !(id === "supply_drop" && c.tokens.some(t => t.kind === "supply"))) { c.tokens.push({ kind: "supply", star }); n++; }
      }
      log(state, `　空投：${n} 个 ${star}★ 补给箱`, "supplyDrop", { n, star });
    } else if (id === "dome") {
      state.board[towerKey(state)].dome = true; log(state, "　穹顶降临中央塔（安全区）", "domeEvent", {});
    } else if (id === "gift_fans") {
      for (const p of state.players) { const c = state.decks.equip1.pop(); if (c) p.backpack.push(c); }
      log(state, "　每位玩家抽 1 张 1★ 装备", "giftFans", {});
    } else if (id === "gift_producers") {
      let lo = state.players[0]; for (const p of state.players) if (totalFame(p) < totalFame(lo)) lo = p;
      const c = state.decks.equip2.pop(); if (c) lo.backpack.push(c); log(state, `　落后的 ${lo.name} 抽 1 张 2★ 装备`, "giftProducers", { name: lo.name });
    } else if (id === "gift_sponsors") {
      for (const p of state.players) p.carryingBeacons += 1; log(state, "　每位玩家 +1 携带信标", "giftSponsors", {});
    } else if (id === "announcement") {
      resolveAnnouncement(state);
    }
  }

  function endGame(state) {
    state.gameOver = true;
    scoreMostAchievements(state);   // award End-of-Game (MOST) achievements before final scoring
    if (state.isTeam) {    // team with the most fame; tie-break by team Achievement then RELOAD fame
      const teams = [...new Set(state.players.map(p => p.team))];
      const sum = (t, sel) => teamMembers(state, t).reduce((s, p) => s + sel(p), 0);
      const key = (t) => sum(t, totalFame) * 1e6 + sum(t, p => p.fame.achievement || 0) * 1e3 + sum(t, p => p.fame.reload);
      let winT = teams[0], best = -1; for (const t of teams) { const k = key(t); if (k > best) { best = k; winT = t; } }
      state.winnerTeam = winT; state.winner = teamMembers(state, winT)[0].idx;
      log(state, `游戏结束：队伍 ${winT + 1} 获胜（队伍名望 ${teamFame(state, winT)}）`, "gameOverTeam", { n: winT + 1, fame: teamFame(state, winT) });
      return;
    }
    // tie-break (achievements rulebook): total fame -> most Achievement fame -> most RELOAD fame
    const key = (p) => totalFame(p) * 1e6 + (p.fame.achievement || 0) * 1e3 + p.fame.reload;
    let win = 0, best = -1;
    for (const p of state.players) { const k = key(p); if (k > best) { best = k; win = p.idx; } }
    state.winner = win;
    log(state, `游戏结束：${state.players[win].name} 获胜（名望 ${totalFame(state.players[win])}）`, "gameOver", { name: state.players[win].name, fame: totalFame(state.players[win]) });
  }
  function endTurn(state) {
    if (state.gameOver) return state;
    const p = curP(state);
    moveAssignedDiceToCombatLine(p);
    resolveHideoutBenefit(state, p);
    if (p.character === "dax" && p.combatLine.length) {   // Dax — Unrivaled Agility: bottom combat-line die -> defense
      p.combatLine = sortCombatLine(p.combatLine); p.combatLine.pop();
      p.defensePool = Math.min(p.actionDice, p.defensePool + 1);
    }
    if (p.character === "kaiser" && p.injuries > 0) {      // Kaiser — Regeneration: heal 1 injury at End Phase
      p.injuries -= 1; p.actionDice = START_ACTION_DICE - p.injuries;
    }
    // End phase Auto-Heal board side: Battle Royale AND 2v2v2 use it (every OTHER player not in toxin
    // with >=2 injuries heals 1). 2v2 / 3v3 Team Royale use the non-Auto-Heal side, so skip it. (rules p.4 + 18:11)
    if (!state.isTeam || state.mode === "team2v2v2") for (const o of state.players) {
      if (o === p || o.injuries < 2 || !o.pos) continue;
      const oc = state.board[hexKey(o.pos.q, o.pos.r)];
      if (oc && (oc.toxin || oc.toxinIcon) && !hasFriendlyHideout(state, o)) continue;   // not while standing in toxin
      o.injuries -= 1; o.actionDice = START_ACTION_DICE - o.injuries;
    }
    // End phase toxin (inert until events add toxin tokens): toxin hex & not safe -> 1 injury
    if (p.pos) {
      const cell = state.board[hexKey(p.pos.q, p.pos.r)], safe = hasFriendlyHideout(state, p) || equipFlag(p, "toxinImmune");  // Healing Armor immunity
      if ((cell.toxin || cell.toxinIcon) && !safe) { log(state, `${p.name} 处于毒气区，受到 1 点伤害`, "toxinDamage", { name: p.name }); if (takeInjuries(state, p, 1)) reloadPlayer(state, p, null); }
    }
    state._turnsTaken++;
    const isLastInRound = state.activePlayer === (state.firstPlayer + state.numPlayers - 1) % state.numPlayers;
    if (state._turnsTaken >= state.numPlayers && !state._eventsDone) { // events start after first full round
      if (state.decks.event.length > 0) {
        resolveEvent(state, state.decks.event.pop()); state.eventsResolved++;
        if (state.decks.event.length === 0) state._eventsDone = true;
      } else state._eventsDone = true;
    }
    state.activePlayer = (state.activePlayer + 1) % state.numPlayers;
    if (isLastInRound) { state.round++; tickDiplomacy(state); if (state._eventsDone) endGame(state); }
    if (!state.gameOver) beginTurn(state);
    return state;
  }

  // ============================================================
  // combat (task #5)
  // MVP dice model: defender rolls all owned action dice (5 - injuries);
  // ranged attacker rolls the weapon's shooting dice. (Simplification:
  // the "assigned dice -> combat line" carryover from prior actions is
  // folded into rolling all owned dice; refine with real action-space
  // values later.) Steps follow the rulebook: roll -> skull -> combat
  // line -> small injuries -> weapon bonus -> fame/RELOAD.
  // ============================================================
  const INJURY_ZONE = 4;   // injury pool has 4 slots — the 4th injury forces a RELOAD (rulebook; 5 action dice, 4 lives)
  const byId = (id) => id && DATA.EQUIP_BY_ID[id];

  function rollDie(rnd) { const r = Math.floor(rnd() * 6) + 1; return r === 6 ? "skull" : r; }
  function rollDice(rnd, n) { const a = []; for (let i = 0; i < n; i++) a.push(rollDie(rnd)); return a; }
  function splitRoll(dice) {
    return { skulls: dice.filter(d => d === "skull").length, line: dice.filter(d => d !== "skull").sort((a, b) => b - a) };
  }
  function ownedDice(p) { return START_ACTION_DICE - p.injuries; }
  function armorOf(p) {
    let sk = 0, si = 0;
    for (const id of [p.equipped.head, p.equipped.torso, ...p.equipped.hand]) {
      const e = byId(id); if (e && e.armor) { sk += e.armor.skullReduce || 0; si += e.armor.smallInjuryReduce || 0; }
    }
    return { skullReduce: sk, smallInjuryReduce: si };
  }
  // sum / detect a passive modifier across equipped gear (Jet Pack rangeBonus, Sniper Helmet diceBonus, Tactical Helmet cancelsStealth, Arachnid Pack extraHand)
  function equipSum(p, key) { let s = 0; for (const id of [p.equipped.head, p.equipped.torso, ...p.equipped.hand]) { const e = byId(id); if (e && e[key]) s += e[key]; } return s; }
  function equipFlag(p, key) { for (const id of [p.equipped.head, p.equipped.torso, ...p.equipped.hand]) { const e = byId(id); if (e && e[key]) return true; } return false; }
  function handCap(p) { return 2 + equipSum(p, "extraHand"); }   // Arachnid Pack grants a 3rd hand slot
  function autoEquip(p) {
    const get = (pred) => p.backpack.map(byId).filter(e => e && pred(e));
    const ranged = get(e => e.combat === "ranged").sort((a, b) => (b.dice || 0) - (a.dice || 0));
    const close = get(e => e.combat === "close");
    const heads = get(e => e.slot === "head"), torsos = get(e => e.slot === "torso");
    p.equipped = { head: heads[0] ? heads[0].id : null, torso: torsos[0] ? torsos[0].id : null, hand: [] };
    // hand slots: 2 single-hand OR 1 two-hand (rules 04:08); +1 with an Arachnid Pack equipped
    const cap = handCap(p); let used = 0;
    const tryHand = (e) => { if (!e) return; const need = e.hands || 1; if (used + need <= cap) { p.equipped.hand.push(e.id); used += need; } };
    tryHand(ranged[0]); tryHand(close[0]); tryHand(ranged[1]); tryHand(close[1]);
  }
  // ---- manual equip (rules 04:00): chosen at turn start, locked once an action die is assigned ----
  function handSlotsUsed(p) { return p.equipped.hand.reduce((s, id) => s + (((byId(id) || {}).hands) || 1), 0); }
  function canEquip(state, p) {
    // equipment is fixed for the turn once the player has acted. Use a persistent hasActed flag rather than
    // the live assigned count, because taking an injury can pop a spent die and reset assigned to 0 mid-turn.
    return state.phase === "action" && !p.hasActed && (p.combatLine || []).length === 0 && !p._closeEndedTurn;
  }
  // drop excess hand gear if the hand cap shrank (e.g. swapping the torso away from an Arachnid Pack)
  function enforceHandCap(p) { while (handSlotsUsed(p) > handCap(p) && p.equipped.hand.length) p.equipped.hand.pop(); }
  function equipItem(state, p, id) {
    if (!canEquip(state, p)) return false;
    const e = byId(id); if (!e || !p.backpack.includes(id) || e.slot === "special") return false;
    if (e.slot === "head") { p.equipped.head = id; enforceHandCap(p); return true; }
    if (e.slot === "torso") { p.equipped.torso = id; enforceHandCap(p); return true; }   // a torso swap can lower the cap
    if (e.slot === "hand") {
      if (p.equipped.hand.includes(id)) return false;
      if (handSlotsUsed(p) + (e.hands || 1) > handCap(p)) return false;   // respects two-handed weapons + Arachnid Pack
      p.equipped.hand.push(id); return true;
    }
    return false;
  }
  function unequipItem(state, p, id) {
    if (!canEquip(state, p)) return false;
    if (p.equipped.head === id) { p.equipped.head = null; return true; }
    if (p.equipped.torso === id) { p.equipped.torso = null; enforceHandCap(p); return true; }   // losing Arachnid Pack drops the extra hand slot
    const i = p.equipped.hand.indexOf(id); if (i >= 0) { p.equipped.hand.splice(i, 1); return true; }
    return false;
  }
  function equippedRanged(p) { for (const id of p.equipped.hand) { const e = byId(id); if (e && e.combat === "ranged") return e; } return null; }
  function equippedClose(p) { for (const id of p.equipped.hand) { const e = byId(id); if (e && e.combat === "close") return e; } return null; }
  // apply an equipped close weapon's modify to a rolled-dice array before resolution
  function applyCloseModify(rolled, mod) {
    if (!mod) return;
    if (mod === "lowestTo3") { let i = -1, lo = 99; for (let k = 0; k < rolled.length; k++) { const v = rolled[k]; if (typeof v === "number" && v < lo) { lo = v; i = k; } } if (i >= 0 && rolled[i] < 3) rolled[i] = 3; }
    else if (mod === "twoOrThreeTo4") { const i = rolled.findIndex(v => v === 2 || v === 3); if (i >= 0) rolled[i] = 4; }
    else if (mod === "highestToSkull") { let i = -1, hi = -1; for (let k = 0; k < rolled.length; k++) { const v = rolled[k]; if (typeof v === "number" && v > hi) { hi = v; i = k; } } if (i >= 0) rolled[i] = "skull"; }
    else if (mod === "fourToFive") { const i = rolled.findIndex(v => v === 4); if (i >= 0) rolled[i] = 5; }
    else if (mod === "lowestTo4") { let i = -1, lo = 99; for (let k = 0; k < rolled.length; k++) { const v = rolled[k]; if (typeof v === "number" && v < lo) { lo = v; i = k; } } if (i >= 0 && rolled[i] < 4) rolled[i] = 4; }       // Hand Axe
    else if (mod === "twoOrThreeToSkull") { const i = rolled.findIndex(v => v === 2 || v === 3); if (i >= 0) rolled[i] = "skull"; }  // Machete
    else if (mod === "oneOrTwoTo4") { const i = rolled.findIndex(v => v === 1 || v === 2); if (i >= 0) rolled[i] = 4; }              // Tactical Tomahawk
    else if (mod === "twoOrThreeTo5") { const i = rolled.findIndex(v => v === 2 || v === 3); if (i >= 0) rolled[i] = 5; }            // Force Rod
    // "add to any one die" — boost the HIGHEST die still below 5 (the strongest single-die play), capped at 5
    else if (mod === "addTwoToOne" || mod === "addOneToOne") { const add = mod === "addTwoToOne" ? 2 : 1; let i = -1, best = -1; for (let k = 0; k < rolled.length; k++) { const v = rolled[k]; if (typeof v === "number" && v < 5 && v > best) { best = v; i = k; } } if (i >= 0) rolled[i] = Math.min(5, rolled[i] + add); }   // Power Glove / Shock Gauntlet
    else if (mod === "twoAndThreeToSkull") { for (let k = 0; k < rolled.length; k++) if (rolled[k] === 2 || rolled[k] === 3) rolled[k] = "skull"; }                                                                                            // Sonic Cleaver
    else if (mod === "highLowTo4") { let hi = -1, hiI = -1, lo = 99, loI = -1; for (let k = 0; k < rolled.length; k++) { const v = rolled[k]; if (typeof v !== "number") continue; if (v > hi) { hi = v; hiI = k; } if (v < lo) { lo = v; loI = k; } } if (hiI >= 0) rolled[hiI] = 4; if (loI >= 0) rolled[loI] = 4; }   // Warrior Chainsaw
  }
  function hasStealth(p) {
    if (p.character === "echo" && !p._revealed) return true;     // Echo — Cloak: innate stealth until she takes part in combat
    for (const id of [p.equipped.head, p.equipped.torso, ...p.equipped.hand]) { const e = byId(id); if (e && e.stealth) return true; }
    return false;
  }

  // LOS via cube line walk
  function cubeRound(x, y, z) {
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    return { q: rx, r: rz };
  }
  function hexLine(a, b) {
    const N = hexDistance(a, b), out = [];
    const ax = a.q, az = a.r, ay = -a.q - a.r, bx = b.q, bz = b.r, by = -b.q - b.r;
    for (let i = 0; i <= N; i++) { const t = N === 0 ? 0 : i / N; out.push(cubeRound(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)); }
    return out;
  }
  function hasLOS(state, a, b, moverIdx) {
    const line = hexLine(a, b);
    for (let i = 0; i < line.length - 1; i++) {
      const k1 = hexKey(line[i].q, line[i].r), k2 = hexKey(line[i + 1].q, line[i + 1].r);
      if (!state.board[k1] || !state.board[k2] || wallBetween(state, k1, k2, moverIdx)) return false;
    }
    for (let i = 1; i < line.length - 1; i++) {   // an intervening blocksLOS terrain (maze) breaks sight through it
      const c = state.board[hexKey(line[i].q, line[i].r)];
      if (c && TERRAIN[c.terrain] && TERRAIN[c.terrain].blocksLOS) return false;
    }
    return true;
  }
  function rangedTargets(state, A) {
    const w = equippedRanged(A);
    if (!w || !A.pos || combatDice(A) < 1 || state.phase !== "action") return [];   // boost die can't be used in combat
    const out = [], r = w.range || [0, 0];
    const maxR = r[1] + equipSum(A, "rangeBonus") + (A.character === "diana" ? 1 : 0);   // Jet Pack/Tactical Helmet + Diana (Huntress)
    const seesThroughStealth = equipFlag(A, "cancelsStealth");   // Tactical Helmet
    for (const t of state.players) {
      if (t === A || !t.pos || t.reloadZone || sameTeam(A, t)) continue;   // no friendly fire
      const d = hexDistance(A.pos, t.pos);
      if (d < (r[0] || 0) || d > maxR) continue;
      if (d >= 1 && hasStealth(t) && !seesThroughStealth) continue; // stealth: only targetable by ranged from same hex
      if (d >= 1 && !hasLOS(state, A.pos, t.pos, A.idx)) continue;
      out.push(t.idx);
    }
    return out;
  }
  function closeTargets(state, A) {
    if (!A.pos || combatDice(A) < 1 || state.phase !== "action") return [];   // boost die can't be used in combat
    return state.players.filter(t => t !== A && t.pos && !t.reloadZone && !sameTeam(A, t) && t.pos.q === A.pos.q && t.pos.r === A.pos.r).map(t => t.idx);
  }

  function takeInjuryDieByHierarchy(p) {
    p.combatLine = sortCombatLine(p.combatLine || []);
    if (p.combatLine.length) { p.combatLine.pop(); return "combatLine"; }
    if (combatDice(p) > 0) { p.defensePool -= 1; return "defensePool"; }   // boost dice can't be taken as injury
    if (p.assignedDice && p.assignedDice.length) { p.assignedDice.pop(); p.assigned = p.assignedDice.length; return "assigned"; }
    return "none";
  }
  function takeInjuries(state, p, n, opts) {
    if (n <= 0) return false;
    const useHierarchy = !opts || opts.hierarchy !== false;
    if (useHierarchy) for (let i = 0; i < n; i++) takeInjuryDieByHierarchy(p);
    p.injuries = Math.min(INJURY_ZONE, p.injuries + n);
    syncDiceCounts(p);
    return p.injuries >= INJURY_ZONE;
  }
  function bumpOneDie(dice, assignValue, w) {  // Duke — Sharpshooter: +1 to one numeric die (prefer making a bonus match)
    let idx = -1;
    if (w && w.bonus) idx = dice.findIndex(d => typeof d === "number" && d === assignValue - 1);
    if (idx < 0) { let lo = 6; for (let i = 0; i < dice.length; i++) { const d = dice[i]; if (typeof d === "number" && d < 5 && d < lo) { lo = d; idx = i; } } }
    if (idx >= 0) dice[idx] = Math.min(5, dice[idx] + 1);
  }
  function rerollLowestDie(state, dice) {   // re-roll the single lowest numeric die (skulls are best — keep them)
    let idx = -1, lo = 6;
    for (let i = 0; i < dice.length; i++) { const d = dice[i]; if (typeof d === "number" && d < lo) { lo = d; idx = i; } }
    if (idx >= 0) dice[idx] = rollDie(state.rnd);
  }
  function applySmallInjuries(line, n) { // mutate line; return # dice reduced below 1 (-> injuries)
    let conv = 0; const idx = line.map((v, i) => i).filter(i => line[i] != null).sort((a, b) => line[a] - line[b]);
    let k = 0;
    while (n > 0 && k < idx.length) { line[idx[k]] -= 1; if (line[idx[k]] < 1) { line[idx[k]] = null; conv++; k++; } n--; }
    return conv;
  }
  function applySmallInjuriesToPlayer(state, p, n) {
    if (n <= 0 || !p.combatLine.length) return 0;
    const conv = applySmallInjuries(p.combatLine, n);
    p.combatLine = sortCombatLine(p.combatLine);
    if (conv) takeInjuries(state, p, conv, { hierarchy: false });
    return conv;
  }
  function reloadPlayer(state, p, attacker) {
    const cell = p.pos && state.board[hexKey(p.pos.q, p.pos.r)];
    // Team Spirit: RELOADing an opponent in the same hex as a teammate (the victim's hex) scores +1
    const coopTeamSpirit = attacker && state.isTeam && p.pos &&
      state.players.some(x => x !== attacker && sameTeam(x, attacker) && x.pos && x.pos.q === p.pos.q && x.pos.r === p.pos.r);
    if (cell) for (let i = 0; i < p.carryingBeacons; i++) cell.tokens.push({ kind: "beacon" });
    p.carryingBeacons = 0;
    if (p.carryingFlag != null && state.flags) { returnFlagHome(state, p.carryingFlag); p.carryingFlag = null; }   // dropped flag resets to its base
    for (const id of [p.equipped.head, p.equipped.torso, ...p.equipped.hand, ...p.backpack]) {
      const e = byId(id); if (e && state.decks["discard" + e.star]) state.decks["discard" + e.star].push(id);
    }
    p.equipped = { head: null, torso: null, hand: [] }; p.backpack = [];
    const a = state.decks.equip2.pop(), b = state.decks.equip2.pop();
    if (a) p.backpack.push(a); if (b) state.decks.discard2.push(b);
    p.injuries = 0; p.actionDice = START_ACTION_DICE; p.defensePool = 0; p.assigned = 0; p.assignedDice = [];
    p.pos = null; p.reloadZone = true; p.combatLine = []; p._runBonus = false; p._runBonusUsed = true; p._noMove = false;
    log(state, `💥 ${p.name} 被迫 RELOAD！丢弃装备，回到跳伞区`, "reloadForced", { name: p.name });
    if (attacker) {
      gainFame(state, attacker, "reload", 1); log(state, `${attacker.name} +1 RELOAD 名望`, "reloadFame", { name: attacker.name });
      if (coopTeamSpirit) { gainFame(state, attacker, "teamSpirit", 1); log(state, `${attacker.name} 在队友身边击退对手 +1 团队精神`, "reloadTeamSpirit", { name: attacker.name }); }
    }
  }

  function doRanged(state, targetIdx, assignValue) {
    const A = curP(state), T = state.players[targetIdx];
    if (!rangedTargets(state, A).includes(targetIdx)) return false;
    if (hasTruce(state, A.idx, T.idx)) breakTruce(state, A.idx, T.idx);   // attacking a truce partner = betrayal
    T._lastAttacker = A.idx;                                              // remember the aggressor (Vendetta persona)
    const w = equippedRanged(A); assignValue = assignValue || 3;
    if (A.character === "echo") A._revealed = true;                        // firing reveals Echo
    spendDice(state, A, 1, assignValue);
    const shooterDice = rollDice(state.rnd, Math.min(4, (w.dice || 2) + equipSum(A, "diceBonus")));   // Sniper Helmet +1 die (max 4)
    if (A.character === "duke") bumpOneDie(shooterDice, assignValue, w);   // Duke — Sharpshooter
    if (A.character === "diana") rerollLowestDie(state, shooterDice);      // Diana — Huntress: re-roll one shooting die
    const defRaw = rollDice(state.rnd, ownedDice(T));
    const sh = splitRoll(shooterDice), def = splitRoll(defRaw);
    const aArm = armorOf(A), tArm = armorOf(T);
    const aSk = Math.max(0, sh.skulls - tArm.skullReduce), tSk = Math.max(0, def.skulls - aArm.skullReduce);
    let dealt = 0, reload = false;
    // skull step: excess skulls send the loser's LOWEST dice to the injury zone — they leave
    // the combat line before the row-by-row compare (rules 11:16).
    if (aSk > tSk) { const ex = aSk - tSk; def.line.splice(Math.max(0, def.line.length - ex), ex); dealt += ex; reload = takeInjuries(state, T, ex, { hierarchy: false }); }
    else if (tSk > aSk) sh.line.splice(Math.max(0, sh.line.length - (tSk - aSk)), tSk - aSk);
    if (!reload) {
      let smalls = 0;
      const n = Math.max(sh.line.length, def.line.length);
      for (let i = 0; i < n && !reload; i++) {
        const s = sh.line[i], d = def.line[i];
        if (s != null && d != null) { if (s > d) { def.line[i] = null; dealt++; reload = takeInjuries(state, T, 1, { hierarchy: false }); } }
        else if (s != null && d == null) smalls++;
      }
      if (!reload) { const conv = applySmallInjuries(def.line, Math.max(0, smalls - tArm.smallInjuryReduce)); if (conv) { dealt += conv; reload = takeInjuries(state, T, conv, { hierarchy: false }); } }
      if (!reload && w.bonus) {
        const m = shooterDice.filter(d => d === assignValue).length;
        if (m > 0) {
          if (w.bonus.type === "injury") { dealt += m * w.bonus.amount; reload = takeInjuries(state, T, m * w.bonus.amount, { hierarchy: false }); }
          else { const c = applySmallInjuries(def.line, m * w.bonus.amount); if (c) { dealt += c; reload = takeInjuries(state, T, c, { hierarchy: false }); } }
        }
      }
    }
    T.combatLine = def.line.filter(x => x != null);
    if (reload) { reloadPlayer(state, T, A); awardNextAchievement(state, A, "rangedReload"); }  // MARKSMAN
    else if (dealt > 0) { gainFame(state, A, "injury", 1); log(state, `🔫 ${A.name} 用${w.name}射击 ${T.name}，造成 ${dealt} 伤 → +1 受伤名望`, "shootHit", { a: A.name, weapon: w.name, t: T.name, dealt }); }
    else log(state, `🔫 ${A.name} 射击 ${T.name}，未造成伤害`, "shootMiss", { a: A.name, t: T.name });
    state.lastCombat = { type: "ranged", a: A.idx, t: T.idx, weapon: w.name, assignValue,
      shooter: shooterDice.slice(), defender: defRaw.slice(), aSkulls: aSk, dSkulls: tSk, dealt, reload };
    return true;
  }

  function doClose(state, targetIdx) {
    const A = curP(state), T = state.players[targetIdx];
    if (!closeTargets(state, A).includes(targetIdx)) return false;
    if (hasTruce(state, A.idx, T.idx)) breakTruce(state, A.idx, T.idx);   // attacking a truce partner = betrayal
    T._lastAttacker = A.idx; A._lastAttacker = T.idx;                     // close combat is mutual (Vendetta persona)
    spendDice(state, A, 1, 1);
    if (A.character === "echo") A._revealed = true;                       // close combat reveals Echo (attacker)
    if (T.character === "echo") T._revealed = true;                       // ...or defender
    const aRaw = rollDice(state.rnd, ownedDice(A)), tRaw = rollDice(state.rnd, ownedDice(T));
    const aCW = equippedClose(A), tCW = equippedClose(T);
    if (aCW) applyCloseModify(aRaw, aCW.modify);   // close-weapon modify (Baton lowest->3, Sickle 2/3->4, Knife highest->skull...)
    if (tCW) applyCloseModify(tRaw, tCW.modify);
    if (A.character === "butcher") rerollLowestDie(state, aRaw);          // Butcher — Brawler: re-roll lowest combat-line die
    if (T.character === "butcher") rerollLowestDie(state, tRaw);          // (his dice, whether attacking or defending)
    const aR = splitRoll(aRaw), tR = splitRoll(tRaw);
    const NOARMOR = { skullReduce: 0, smallInjuryReduce: 0 };
    const aArm = armorOf(A), tArm = armorOf(T);
    const tArmEff = (aCW && aCW.ignoreArmor) ? NOARMOR : tArm;   // A's weapon ignores T's armor
    const aArmEff = (tCW && tCW.ignoreArmor) ? NOARMOR : aArm;   // T's weapon ignores A's armor
    const aSk = Math.max(0, aR.skulls - tArmEff.skullReduce), tSk = Math.max(0, tR.skulls - aArmEff.skullReduce);
    let aDealt = 0, tDealt = 0, aReload = false, tReload = false;
    // skull step: loser's lowest dice -> injury, removed from the combat line before compare
    if (aSk > tSk) { const ex = aSk - tSk; tR.line.splice(Math.max(0, tR.line.length - ex), ex); aDealt += ex; tReload = takeInjuries(state, T, ex, { hierarchy: false }); }
    else if (tSk > aSk) { const ex = tSk - aSk; aR.line.splice(Math.max(0, aR.line.length - ex), ex); tDealt += ex; aReload = takeInjuries(state, A, ex, { hierarchy: false }); }
    let aSmall = 0, tSmall = 0;
    const n = Math.max(aR.line.length, tR.line.length);
    for (let i = 0; i < n; i++) {
      const a = aR.line[i], t = tR.line[i];
      if (a != null && t != null) {
        if (a > t) { tR.line[i] = null; aDealt++; if (takeInjuries(state, T, 1, { hierarchy: false })) tReload = true; }
        else if (t > a) { aR.line[i] = null; tDealt++; if (takeInjuries(state, A, 1, { hierarchy: false })) aReload = true; }
      } else if (a != null && t == null) tSmall++;       // unopposed: player WITHOUT a die takes small injury
      else if (t != null && a == null) aSmall++;
    }
    const tc = applySmallInjuries(tR.line, Math.max(0, tSmall - tArmEff.smallInjuryReduce)); if (tc) { aDealt += tc; if (takeInjuries(state, T, tc, { hierarchy: false })) tReload = true; }
    const ac = applySmallInjuries(aR.line, Math.max(0, aSmall - aArmEff.smallInjuryReduce)); if (ac) { tDealt += ac; if (takeInjuries(state, A, ac, { hierarchy: false })) aReload = true; }
    if (tReload) { reloadPlayer(state, T, A); awardNextAchievement(state, A, "closeReload"); } else if (aDealt > 0) { gainFame(state, A, "injury", 1); }  // MARTIAL ARTIST
    if (aReload) { reloadPlayer(state, A, T); awardNextAchievement(state, T, "closeReload"); } else if (tDealt > 0) { gainFame(state, T, "injury", 1); }
    log(state, `🗡 近战 ${A.name} vs ${T.name}：造成 ${aDealt} / 受到 ${tDealt}`, "melee", { a: A.name, t: T.name, aDealt, tDealt });
    state.lastCombat = { type: "close", a: A.idx, t: T.idx, shooter: aRaw.slice(), defender: tRaw.slice(),
      aSkulls: aSk, dSkulls: tSk, dealt: aDealt, taken: tDealt, reload: tReload, selfReload: aReload };
    A.defensePool = 0; A._closeEndedTurn = true;          // close combat ends the active player's turn
    return true;
  }

  const ENGINE = {
    makeRng, shuffle, hexKey, hexAdd, hexDistance, neighbors,
    newGame, hexCell, playersOnHex, totalFame, beaconHexCount, supplyHexCount,
    // teams (Team Royale)
    sameTeam, teammates, teamMembers, teamFame, scoreFor, healTargets, giveToTeammate,
    // diplomacy
    hasTruce, truceRoundsLeft, friendly, proposeTruce, respondToOffer, proposeFocus, breakTruce, aiAcceptTruce, dipTaunt,
    // turn/action API
    SUPERSTAR_FAME, superstarThreshold, curP, isHumanTurn, legalParachute, parachute,
    legalRuns, doRun, lootOptions, doLoot, droneLootOptions, doDroneLoot, endTurn, beginTurn, towerKey,
    canUpload, doActivate, bfsStep, resolveEvent,
    // Capture the Flag
    baseKeyOf, canGrabFlag, grabFlag, canScoreFlag, scoreFlag,
    // build/heal API
    canHeal, doHeal, canBuild, emptyEdges, doBuildBarrier, doDemolish, doBuildHideout, doDemolishHideout, doBuildTrap,
    // special-item API
    specialItems, usableSpecials, explosiveTargets, useSpecialItem, combatDice,
    // achievements API
    mostMetric, awardNextAchievement, scoreMostAchievements, resolveAnnouncement,
    // combat API
    INJURY_ZONE, ownedDice, autoEquip, canEquip, equipItem, unequipItem, handSlotsUsed, equippedRanged, equippedClose, armorOf, hasLOS, hasStealth,
    moveAssignedDiceToCombatLine, resolveHideoutBenefit, hasFriendlyHideout,
    takeInjuries, applySmallInjuries, applySmallInjuriesToPlayer,
    rangedTargets, closeTargets, doRanged, doClose, reloadPlayer,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
  root.RL = Object.assign(root.RL || {}, { engine: ENGINE });
})(typeof globalThis !== "undefined" ? globalThis : this);
