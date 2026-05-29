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
  const STAR1_QTY = {
    energy_drink: 4, pain_killer: 4, ap_ammo: 2, bow_arrow: 2, collapsible_baton: 2,
    light_helmet: 2, riot_vest: 2, sickle: 2, tactical_explosive: 2, tool_kit: 2,
  };
  function buildEquipDeck(star, rnd) {
    const deck = [];
    for (const e of EQUIPMENT) {
      if (e.star !== star) continue;
      const qty = star === 1 ? (STAR1_QTY[e.id] || 1) : 2;
      for (let i = 0; i < qty; i++) deck.push(e.id);
    }
    return shuffle(deck, rnd);
  }
  // event deck = 2 guaranteed Supply Drops + N random (from the event pool), per rulebook
  function buildEventDeck(numPlayers, rnd) {
    const randomN = SETUP.eventRandom[numPlayers] || 16;
    const pool = [];
    for (const id in DATA.EVENTS) { let n = DATA.EVENTS[id].count; if (id === "supply_drop") n -= 2; for (let i = 0; i < n; i++) pool.push(id); }
    shuffle(pool, rnd);
    return shuffle(pool.slice(0, randomN).concat(["supply_drop", "supply_drop"]), rnd);
  }

  function newPlayer(idx, character, human) {
    return {
      idx, character: character.id, name: character.name, color: character.color, human,
      // dice: still count-based, with assignedDice preserving values spent this turn.
      actionDice: START_ACTION_DICE,   // action dice currently owned (5 minus injuries)
      defensePool: START_ACTION_DICE,  // unassigned, available this turn
      assigned: 0,                     // dice spent on actions this turn
      assignedDice: [],                // action die faces assigned this turn; numeric faces move to combatLine in End Phase
      combatLine: [],                  // numeric dice, high->low
      injuries: 0,                     // dice in injury zone; INJURY_ZONE => RELOAD
      boost: false,
      fame: { injury: 0, beacon: 0, teamSpirit: 0, reload: 0, trap: 0 },
      fameTrackPos: 0,
      pos: null,                       // axial {q,r}; null = off-map (parachute)
      equipped: { head: null, torso: null, hand: [] },
      backpack: [],                    // equipment ids (facedown)
      carryingBeacons: 0,
      hideout: null,                   // hex key of own hideout, or null
      barriersUsed: 0, trapsUsed: 0,   // placed counts (max 6 each)
      _noMove: false,                  // set when a trap tie stops further movement this turn
      reloadZone: false,
    };
  }

  // ---- setup ----
  function newGame(opts) {
    opts = opts || {};
    const numPlayers = opts.numPlayers || 4;
    const rnd = makeRng(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0);
    const mode = opts.mode || "battleRoyale";

    // choose characters (first = human unless allAI)
    const chars = shuffle(CHARACTERS.slice(), rnd).slice(0, numPlayers);
    const players = chars.map((c, i) => newPlayer(i, c, opts.allAI ? false : i === 0));

    // board
    const board = {};
    for (const h of ARCADIA.hexes) {
      const t = TERRAIN[h.terrain];
      board[hexKey(h.q, h.r)] = {
        q: h.q, r: h.r, terrain: h.terrain,
        tokens: [],            // e.g. {kind:'beacon'} / {kind:'supply', star:2}
        walls: {},             // edge(0-5) -> owner: 'n' (neutral) or playerIdx
        portal: false, hideouts: [], trap: null, toxin: false, hasTower: h.terrain === "tower",
      };
    }
    // tokens per rules
    for (const h of ARCADIA.hexes) {
      const cell = board[hexKey(h.q, h.r)];
      if (TERRAIN[h.terrain].beacon) cell.tokens.push({ kind: "beacon" });
      if (TERRAIN[h.terrain].supply === "2star") cell.tokens.push({ kind: "supply", star: 2 });
    }
    for (const p of ARCADIA.portals) board[hexKey(p.q, p.r)].portal = true;
    for (const w of ARCADIA.neutralWalls) board[hexKey(w.q, w.r)].walls[w.edge] = "n";

    // decks
    const eventCount = (SETUP.eventRandom[numPlayers] || 16) + 2; // +2 supply drops
    const decks = {
      equip1: buildEquipDeck(1, rnd),
      equip2: buildEquipDeck(2, rnd),
      equip3: buildEquipDeck(3, rnd),
      event: buildEventDeck(numPlayers, rnd),
      discard1: [], discard2: [], discard3: [],
    };

    // starting equipment: each draws 2 one-star, keeps 1 (AI/human keep first for now)
    for (const p of players) {
      const a = decks.equip1.pop(), b = decks.equip1.pop();
      p.backpack.push(a);
      if (b) decks.discard1.push(b);
    }

    // fame supply
    const fameSupply = {};
    for (const k in FAME) fameSupply[k] = FAME[k].supply;

    const state = {
      mode, numPlayers, rnd, board, players,
      firstPlayer: 0, activePlayer: 0, round: 1,
      decks, fameSupply,
      eventsResolved: 0, eventTotal: eventCount,
      superstarFame: superstarThreshold(mode),   // win threshold = fame-track length for this mode
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
  function totalFame(p) { return p.fame.injury + p.fame.beacon + p.fame.teamSpirit + p.fame.reload + (p.fame.trap || 0); }
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
  function superstarThreshold(mode) {
    const mids = (mode === "team" || mode === "team2v2v2" || mode === "twoPlayer") ? 4 : 2;
    return TRACK_PIECE_SPACES.start + mids * TRACK_PIECE_SPACES.middle + TRACK_PIECE_SPACES.end;
  }
  const SUPERSTAR_FAME = superstarThreshold("battleRoyale");  // 16 — Battle Royale standard track
  const MOUNTAIN_RUN_COST = 2;

  function log(state, msg) { state.log.unshift(msg); if (state.log.length > 120) state.log.pop(); }
  function curP(state) { return state.players[state.activePlayer]; }
  function isHumanTurn(state) { return !state.gameOver && curP(state).human; }

  function towerKey(state) { for (const k in state.board) if (state.board[k].hasTower) return k; return null; }
  function legalParachute(state) {
    const tk = towerKey(state); if (!tk) return [];
    return [tk, ...neighbors(state, state.board[tk].q, state.board[tk].r)];
  }

  function gainFame(state, p, kind, n) {
    const got = Math.min(n, state.fameSupply[kind]);
    p.fame[kind] += got; state.fameSupply[kind] -= got;
    if (totalFame(p) >= (state.superstarFame || SUPERSTAR_FAME) && !state.gameOver) {
      state.gameOver = true; state.winner = p.idx; state.superstar = true;
      log(state, `★ ${p.name} 达到 Superstar，立即获胜！`);
    }
  }

  function beginTurn(state) {
    const p = curP(state);
    p.actionDice = START_ACTION_DICE - p.injuries;       // injuries reduce available dice
    p.defensePool = p.actionDice; p.assigned = 0; p.assignedDice = []; p.boost = false; p.combatLine = [];
    p._closeEndedTurn = false; p._noMove = false;
    autoEquip(p);                                        // MVP: auto-equip best weapon/armor (no equip UI yet)
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
      log(state, `${p.name} 空降遇锋面，飘移一格`);
    }
    p.reloadZone = false; state.needsParachute = false; state.phase = "action";
    log(state, `${p.name} 跳伞降落到 ${state.board[hexKey(p.pos.q, p.pos.r)].terrain}`);
    return true;
  }

  function dirIndex(a, b) {
    for (let i = 0; i < HEX_DIRS.length; i++)
      if (a.q + HEX_DIRS[i].q === b.q && a.r + HEX_DIRS[i].r === b.r) return i;
    return -1;
  }
  // a wall blocks unless it belongs to the mover (own/team barriers don't block self).
  function wallBetween(state, aKey, bKey, moverIdx) {
    const A = state.board[aKey], B = state.board[bKey], d = dirIndex(A, B);
    if (d < 0) return false;
    const oa = A.walls[d], ob = B.walls[(d + 3) % 6];
    if (oa != null && oa !== moverIdx) return true;
    if (ob != null && ob !== moverIdx) return true;
    return false;
  }
  function runCost(state, toKey) { return state.board[toKey].terrain === "mountain" ? MOUNTAIN_RUN_COST : 1; }

  function legalRuns(state, p) {
    if (!p.pos || state.phase !== "action" || p._noMove) return [];
    const cur = hexKey(p.pos.q, p.pos.r), out = [];
    for (const nk of neighbors(state, p.pos.q, p.pos.r)) {
      if (wallBetween(state, cur, nk, p.idx)) continue;
      if (runCost(state, nk) <= p.defensePool) out.push(nk);
    }
    if (state.board[cur].portal && p.defensePool >= 1)
      for (const k in state.board) if (k !== cur && state.board[k].portal) out.push(k);
    return out;
  }
  const isNumericDie = (v) => typeof v === "number" && v >= 1 && v <= 5;
  function sortCombatLine(line) { return line.filter(isNumericDie).sort((a, b) => b - a); }
  function spendDice(state, p, n, face) {
    p.defensePool -= n; p.assigned += n;
    const f = face == null ? 1 : face;
    for (let i = 0; i < n; i++) p.assignedDice.push(f);
  }
  function moveAssignedDiceToCombatLine(p) {
    p.combatLine = sortCombatLine([...(p.combatLine || []), ...(p.assignedDice || [])]);
    p.assignedDice = []; p.assigned = 0;
    p.actionDice = START_ACTION_DICE - p.injuries;
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
    p.assigned = p.assignedDice ? p.assignedDice.length : 0;
  }
  function doRun(state, toKey) {
    const p = curP(state);
    if (!legalRuns(state, p).includes(toKey)) return false;
    const cur = hexKey(p.pos.q, p.pos.r);
    const portalJump = state.board[cur].portal && state.board[toKey].portal && dirIndex(p.pos, state.board[toKey]) < 0;
    spendDice(state, p, portalJump ? 1 : runCost(state, toKey), 1);
    const c = state.board[toKey]; p.pos = { q: c.q, r: c.r };
    log(state, `${p.name} ${portalJump ? "穿越传送门到" : "移动到"} ${c.terrain}`);
    if (c.trap != null && c.trap !== p.idx) resolveTrap(state, p, c.trap, toKey); // step on enemy trap
    return true;
  }

  function lootOptions(state, p) {
    if (!p.pos || state.phase !== "action" || p.defensePool < 1) return [];
    return state.board[hexKey(p.pos.q, p.pos.r)].tokens.slice();
  }
  function doLoot(state, tokenIdx) {
    const p = curP(state);
    if (p.defensePool < 1) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)], tok = cell.tokens[tokenIdx];
    if (!tok) return false;
    spendDice(state, p, 1, 1); cell.tokens.splice(tokenIdx, 1);
    if (tok.kind === "beacon") { p.carryingBeacons += 1; log(state, `${p.name} 拾取信标（需带到中央塔上缴）`); }
    else if (tok.kind === "supply") {
      const dk = "equip" + (tok.star || 2), xk = "discard" + (tok.star || 2);
      const draws = p.character === "korat" ? 3 : 2;        // Korat — Gift From Father: +1 card
      const got = []; for (let i = 0; i < draws; i++) { const c = state.decks[dk].pop(); if (c) got.push(c); }
      if (got.length) { p.backpack.push(got[0]); for (let i = 1; i < got.length; i++) state.decks[xk].push(got[i]); }
      log(state, `${p.name} 开 ${tok.star || 2} 星补给箱，抽${got.length}留1${draws === 3 ? "（Gift From Father）" : ""}`);
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
    spendDice(state, p, 1, 1);
    const n = p.carryingBeacons;
    log(state, `${p.name} 在中央塔上传 ${n} 个信标 → +${n} 名望`);
    gainFame(state, p, "beacon", n); p.carryingBeacons = 0;
    return true;
  }

  // BFS first-step toward a target hex (respects walls; ignores portals). For AI navigation.
  function bfsStep(state, p, targetKey) {
    if (!p.pos) return null;
    const start = hexKey(p.pos.q, p.pos.r);
    if (start === targetKey) return null;
    const prev = { [start]: null }, q = [start];
    while (q.length) {
      const cur = q.shift(), c = state.board[cur];
      for (const nk of neighbors(state, c.q, c.r)) {
        if (nk in prev || wallBetween(state, cur, nk, p.idx)) continue;
        prev[nk] = cur;
        if (nk === targetKey) { let n = nk; while (prev[n] !== start) n = prev[n]; return n; }
        q.push(nk);
      }
    }
    return null;
  }

  // ---- Heal (restricted: not while an enemy shares your hex) ----
  function canHeal(state, p) {
    if (state.phase !== "action" || p.defensePool < 1 || p.injuries < 1 || !p.pos) return false;
    return playersOnHex(state, p.pos.q, p.pos.r).every(x => x === p);
  }
  function doHeal(state) {
    const p = curP(state); if (!canHeal(state, p)) return false;
    const die = rollDie(state.rnd), heal = Math.min(p.injuries, die === "skull" ? 2 : 1);
    spendDice(state, p, 1, die);
    p.injuries -= heal; p.actionDice = START_ACTION_DICE - p.injuries; p.defensePool += heal; // recovered dice usable this turn
    log(state, `${p.name} 治疗：掷${die === "skull" ? "骷髅(+2)" : die}，恢复 ${heal} 点伤`);
    state.lastRoll = { kind: "heal", by: p.idx, value: die, healed: heal };
    return true;
  }

  // ---- Build (restricted): barriers / hideout / trap ----
  const SETUP_WALLS = SETUP.walls, SETUP_TRAPS = SETUP.traps;
  function noEnemyHere(state, p) { return p.pos && playersOnHex(state, p.pos.q, p.pos.r).every(x => x === p); }
  function canBuild(state, p) { return state.phase === "action" && p.defensePool >= 1 && noEnemyHere(state, p); }
  function emptyEdges(state, p) {
    if (!p.pos) return [];
    const cell = state.board[hexKey(p.pos.q, p.pos.r)], out = [];
    for (let e = 0; e < 6; e++) {
      const nb = state.board[hexKey(p.pos.q + HEX_DIRS[e].q, p.pos.r + HEX_DIRS[e].r)];
      if (cell.walls[e] == null && (!nb || nb.walls[(e + 3) % 6] == null)) out.push(e);
    }
    return out;
  }
  function doBuildBarrier(state, edge) {
    const p = curP(state);
    if (!canBuild(state, p) || p.barriersUsed >= SETUP_WALLS || !emptyEdges(state, p).includes(edge)) return false;
    spendDice(state, p, 1, 1);
    state.board[hexKey(p.pos.q, p.pos.r)].walls[edge] = p.idx; p.barriersUsed++;
    log(state, `${p.name} 建造屏障`); return true;
  }
  function doDemolish(state, edge) {
    const p = curP(state); if (!canBuild(state, p)) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    if (cell.walls[edge] == null) return false;
    const owner = cell.walls[edge]; delete cell.walls[edge];
    if (typeof owner === "number" && state.players[owner]) state.players[owner].barriersUsed = Math.max(0, state.players[owner].barriersUsed - 1);
    spendDice(state, p, 1, 1); log(state, `${p.name} 拆除屏障`); return true;
  }
  function doBuildHideout(state) {
    const p = curP(state); if (!canBuild(state, p)) return false;
    const k = hexKey(p.pos.q, p.pos.r);
    if (state.board[k].hideouts.length) return false;
    if (p.hideout && state.board[p.hideout]) state.board[p.hideout].hideouts = state.board[p.hideout].hideouts.filter(h => h !== p.idx);
    spendDice(state, p, 1, 1); state.board[k].hideouts.push(p.idx); p.hideout = k;
    log(state, `${p.name} 设置藏身处`); return true;
  }
  function doDemolishHideout(state, ownerIdx) {
    const p = curP(state); if (!canBuild(state, p)) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    if (!cell.hideouts.length) return false;
    const idx = ownerIdx != null ? cell.hideouts.indexOf(ownerIdx) : 0;
    if (idx < 0) return false;
    const owner = cell.hideouts.splice(idx, 1)[0];
    if (state.players[owner]) state.players[owner].hideout = null;
    spendDice(state, p, 1, 1); log(state, `${p.name} 拆除藏身处`); return true;
  }
  function doBuildTrap(state) {
    const p = curP(state); if (!canBuild(state, p) || p.trapsUsed >= SETUP_TRAPS) return false;
    const cell = state.board[hexKey(p.pos.q, p.pos.r)];
    if (cell.trap != null) return false;
    spendDice(state, p, 1, 1); cell.trap = p.idx; p.trapsUsed++;
    log(state, `${p.name} 埋设陷阱`); return true;
  }
  function resolveTrap(state, walker, ownerIdx, key) {
    const owner = state.players[ownerIdx], cell = state.board[key];
    cell.trap = null; if (owner) owner.trapsUsed = Math.max(0, owner.trapsUsed - 1);
    const rps = (d) => d <= 2 ? 0 : d <= 4 ? 1 : 2;     // d6: rock(1-2)/paper(3-4)/scissor(5-6)
    const wins = (a, b) => (a + 2) % 3 === b;            // a beats b: rock>scissor, paper>rock, scissor>paper
    const w = rps(Math.floor(state.rnd() * 6) + 1), t = rps(Math.floor(state.rnd() * 6) + 1);
    if (w === t) { gainFame(state, owner, "trap", 1); walker._noMove = true; log(state, `陷阱：${walker.name} 与 ${owner.name} 的陷阱平手（${owner.name} +1陷阱名望，停止移动）`); }
    else if (wins(w, t)) { gainFame(state, walker, "trap", 1); log(state, `陷阱：${walker.name} 闪过 ${owner.name} 的陷阱（+1陷阱名望）`); }
    else { gainFame(state, owner, "trap", 1); const rl = takeInjuries(state, walker, 1); if (rl) reloadPlayer(state, walker, owner); else gainFame(state, owner, "injury", 1); log(state, `陷阱：${walker.name} 踩中 ${owner.name} 的陷阱受伤`); }
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
      if (e.id === "energy_drink") return onTurn;
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
      log(state, `💊 ${p.name} 使用止痛药，恢复 1 点伤`);
    } else if (itemId === "energy_drink") {
      if (state.phase !== "action") return false;
      p.defensePool += 1; p._energyBoost = true;
      log(state, `🥤 ${p.name} 喝下能量饮料，本回合 +1 行动骰`);
    } else if (itemId === "tactical_explosive") {
      if (state.phase !== "action" || !target) return false;
      const c = state.board[target.key]; if (!c) return false;
      if (target.kind === "trap") { if (c.trap == null) return false; const o = state.players[c.trap]; c.trap = null; if (o) o.trapsUsed = Math.max(0, o.trapsUsed - 1); }
      else if (target.kind === "wall") { if (c.walls[target.edge] == null) return false; const o = c.walls[target.edge]; delete c.walls[target.edge]; if (typeof o === "number" && state.players[o]) state.players[o].barriersUsed = Math.max(0, state.players[o].barriersUsed - 1); }
      else if (target.kind === "hideout") { const i = c.hideouts.indexOf(target.owner); if (i < 0) return false; const o = c.hideouts.splice(i, 1)[0]; if (state.players[o]) state.players[o].hideout = null; }
      else return false;
      const what = target.kind === "trap" ? "陷阱" : target.kind === "wall" ? "屏障" : "藏身处";
      log(state, `💣 ${p.name} 使用战术炸药，摧毁了${what}`);
    } else return false;
    discardItem(state, p, itemId);
    return true;
  }

  function ringFromTower(state, cell) { const tc = state.board[towerKey(state)]; return hexDistance(cell, tc); }
  function resolveEvent(state, id) {
    state.lastEvent = id;
    const ev = DATA.EVENTS[id] || { name: id };
    log(state, `⚡ 事件：${ev.name}`);
    if (id === "contamination") {
      if (state._toxinFrontier == null) state._toxinFrontier = 2;   // spread outermost ring inward (battle-royale storm)
      const fr = state._toxinFrontier; let n = 0;
      for (const k in state.board) { const c = state.board[k]; if (!c.toxin && !c.dome && ringFromTower(state, c) === fr) { c.toxin = true; n++; } }
      state._toxinFrontier = Math.max(0, fr - 1);
      log(state, `　毒气扩张：${n} 格被污染`);
    } else if (id === "supply_drop" || id === "ex_tech") {
      const star = id === "ex_tech" ? 3 : 2; let n = 0;
      for (const k of shuffle(Object.keys(state.board), state.rnd)) {
        if (n >= 2) break; const c = state.board[k];
        if (!c.hasTower && !(id === "supply_drop" && c.tokens.some(t => t.kind === "supply"))) { c.tokens.push({ kind: "supply", star }); n++; }
      }
      log(state, `　空投：${n} 个 ${star}★ 补给箱`);
    } else if (id === "dome") {
      state.board[towerKey(state)].dome = true; log(state, "　穹顶降临中央塔（安全区）");
    } else if (id === "gift_fans") {
      for (const p of state.players) { const c = state.decks.equip1.pop(); if (c) p.backpack.push(c); }
      log(state, "　每位玩家抽 1 张 1★ 装备");
    } else if (id === "gift_producers") {
      let lo = state.players[0]; for (const p of state.players) if (totalFame(p) < totalFame(lo)) lo = p;
      const c = state.decks.equip2.pop(); if (c) lo.backpack.push(c); log(state, `　落后的 ${lo.name} 抽 1 张 2★ 装备`);
    } else if (id === "gift_sponsors") {
      for (const p of state.players) p.carryingBeacons += 1; log(state, "　每位玩家 +1 携带信标");
    }
  }

  function endGame(state) {
    state.gameOver = true;
    // tie-break: total fame, then RELOAD fame count (most prestigious source)
    const key = (p) => totalFame(p) * 1000 + p.fame.reload;
    let win = 0, best = -1;
    for (const p of state.players) { const k = key(p); if (k > best) { best = k; win = p.idx; } }
    state.winner = win;
    log(state, `游戏结束：${state.players[win].name} 获胜（名望 ${totalFame(state.players[win])}）`);
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
    // End phase (Auto-Heal board side, Battle Royale): every OTHER player with >=2
    // injuries heals 1. (TODO: skip those standing in a toxin hex once toxin exists.)
    for (const o of state.players) { if (o !== p && o.injuries >= 2) o.injuries -= 1; }
    // End phase toxin (inert until events add toxin tokens): toxin hex & not safe -> 1 injury
    if (p.pos) {
      const cell = state.board[hexKey(p.pos.q, p.pos.r)], safe = hasFriendlyHideout(state, p);
      if ((cell.toxin || cell.toxinIcon) && !safe) { log(state, `${p.name} 处于毒气区，受到 1 点伤害`); if (takeInjuries(state, p, 1)) reloadPlayer(state, p, null); }
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
    if (isLastInRound) { state.round++; if (state._eventsDone) endGame(state); }
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
  const INJURY_ZONE = 5;
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
  function autoEquip(p) {
    const get = (pred) => p.backpack.map(byId).filter(e => e && pred(e));
    const ranged = get(e => e.combat === "ranged").sort((a, b) => (b.dice || 0) - (a.dice || 0));
    const close = get(e => e.combat === "close");
    const heads = get(e => e.slot === "head"), torsos = get(e => e.slot === "torso");
    p.equipped = { head: heads[0] ? heads[0].id : null, torso: torsos[0] ? torsos[0].id : null, hand: [] };
    // hand slots: 2 single-hand OR 1 two-hand (rules 04:08)
    let used = 0;
    const tryHand = (e) => { if (!e) return; const need = e.hands || 1; if (used + need <= 2) { p.equipped.hand.push(e.id); used += need; } };
    tryHand(ranged[0]); tryHand(close[0]);
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
  }
  function hasStealth(p) {
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
    return true;
  }
  function rangedTargets(state, A) {
    const w = equippedRanged(A);
    if (!w || !A.pos || A.defensePool < 1 || state.phase !== "action") return [];
    const out = [];
    for (const t of state.players) {
      if (t === A || !t.pos || t.reloadZone) continue;
      const d = hexDistance(A.pos, t.pos), r = w.range || [0, 0];
      if (d < (r[0] || 0) || d > r[1]) continue;
      if (d >= 1 && hasStealth(t)) continue; // stealth: only targetable by ranged from same hex
      if (d >= 1 && !hasLOS(state, A.pos, t.pos, A.idx)) continue;
      out.push(t.idx);
    }
    return out;
  }
  function closeTargets(state, A) {
    if (!A.pos || A.defensePool < 1 || state.phase !== "action") return [];
    return state.players.filter(t => t !== A && t.pos && !t.reloadZone && t.pos.q === A.pos.q && t.pos.r === A.pos.r).map(t => t.idx);
  }

  function takeInjuryDieByHierarchy(p) {
    p.combatLine = sortCombatLine(p.combatLine || []);
    if (p.combatLine.length) { p.combatLine.pop(); return "combatLine"; }
    if (p.defensePool > 0) { p.defensePool -= 1; return "defensePool"; }
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
    if (cell) for (let i = 0; i < p.carryingBeacons; i++) cell.tokens.push({ kind: "beacon" });
    p.carryingBeacons = 0;
    for (const id of [p.equipped.head, p.equipped.torso, ...p.equipped.hand, ...p.backpack]) {
      const e = byId(id); if (e && state.decks["discard" + e.star]) state.decks["discard" + e.star].push(id);
    }
    p.equipped = { head: null, torso: null, hand: [] }; p.backpack = [];
    const a = state.decks.equip2.pop(), b = state.decks.equip2.pop();
    if (a) p.backpack.push(a); if (b) state.decks.discard2.push(b);
    p.injuries = 0; p.actionDice = START_ACTION_DICE; p.defensePool = 0; p.assigned = 0; p.assignedDice = [];
    p.pos = null; p.reloadZone = true; p.combatLine = [];
    log(state, `💥 ${p.name} 被迫 RELOAD！丢弃装备，回到跳伞区`);
    if (attacker) { gainFame(state, attacker, "reload", 1); log(state, `${attacker.name} +1 RELOAD 名望`); }
  }

  function doRanged(state, targetIdx, assignValue) {
    const A = curP(state), T = state.players[targetIdx];
    if (!rangedTargets(state, A).includes(targetIdx)) return false;
    const w = equippedRanged(A); assignValue = assignValue || 3;
    spendDice(state, A, 1, assignValue);
    const shooterDice = rollDice(state.rnd, w.dice || 2);
    if (A.character === "duke") bumpOneDie(shooterDice, assignValue, w);   // Duke — Sharpshooter
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
    if (reload) reloadPlayer(state, T, A);
    else if (dealt > 0) { gainFame(state, A, "injury", 1); log(state, `🔫 ${A.name} 用${w.name}射击 ${T.name}，造成 ${dealt} 伤 → +1 受伤名望`); }
    else log(state, `🔫 ${A.name} 射击 ${T.name}，未造成伤害`);
    state.lastCombat = { type: "ranged", a: A.idx, t: T.idx, weapon: w.name, assignValue,
      shooter: shooterDice.slice(), defender: defRaw.slice(), aSkulls: aSk, dSkulls: tSk, dealt, reload };
    return true;
  }

  function doClose(state, targetIdx) {
    const A = curP(state), T = state.players[targetIdx];
    if (!closeTargets(state, A).includes(targetIdx)) return false;
    spendDice(state, A, 1, 1);
    const aRaw = rollDice(state.rnd, ownedDice(A)), tRaw = rollDice(state.rnd, ownedDice(T));
    const aCW = equippedClose(A), tCW = equippedClose(T);
    if (aCW) applyCloseModify(aRaw, aCW.modify);   // close-weapon modify (Baton lowest->3, Sickle 2/3->4, Knife highest->skull...)
    if (tCW) applyCloseModify(tRaw, tCW.modify);
    const aR = splitRoll(aRaw), tR = splitRoll(tRaw);
    const aArm = armorOf(A), tArm = armorOf(T);
    const aSk = Math.max(0, aR.skulls - tArm.skullReduce), tSk = Math.max(0, tR.skulls - aArm.skullReduce);
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
    const tc = applySmallInjuries(tR.line, Math.max(0, tSmall - tArm.smallInjuryReduce)); if (tc) { aDealt += tc; if (takeInjuries(state, T, tc, { hierarchy: false })) tReload = true; }
    const ac = applySmallInjuries(aR.line, Math.max(0, aSmall - aArm.smallInjuryReduce)); if (ac) { tDealt += ac; if (takeInjuries(state, A, ac, { hierarchy: false })) aReload = true; }
    if (tReload) reloadPlayer(state, T, A); else if (aDealt > 0) { gainFame(state, A, "injury", 1); }
    if (aReload) reloadPlayer(state, A, T); else if (tDealt > 0) { gainFame(state, T, "injury", 1); }
    log(state, `🗡 近战 ${A.name} vs ${T.name}：造成 ${aDealt} / 受到 ${tDealt}`);
    state.lastCombat = { type: "close", a: A.idx, t: T.idx, shooter: aRaw.slice(), defender: tRaw.slice(),
      aSkulls: aSk, dSkulls: tSk, dealt: aDealt, taken: tDealt, reload: tReload, selfReload: aReload };
    A.defensePool = 0; A._closeEndedTurn = true;          // close combat ends the active player's turn
    return true;
  }

  const ENGINE = {
    makeRng, shuffle, hexKey, hexAdd, hexDistance, neighbors,
    newGame, hexCell, playersOnHex, totalFame, beaconHexCount, supplyHexCount,
    // turn/action API
    SUPERSTAR_FAME, superstarThreshold, curP, isHumanTurn, legalParachute, parachute,
    legalRuns, doRun, lootOptions, doLoot, endTurn, beginTurn, towerKey,
    canUpload, doActivate, bfsStep, resolveEvent,
    // build/heal API
    canHeal, doHeal, canBuild, emptyEdges, doBuildBarrier, doDemolish, doBuildHideout, doDemolishHideout, doBuildTrap,
    // special-item API
    specialItems, usableSpecials, explosiveTargets, useSpecialItem,
    // combat API
    INJURY_ZONE, ownedDice, autoEquip, equippedRanged, equippedClose, armorOf, hasLOS, hasStealth,
    moveAssignedDiceToCombatLine, resolveHideoutBenefit, hasFriendlyHideout,
    takeInjuries, applySmallInjuries, applySmallInjuriesToPlayer,
    rangedTargets, closeTargets, doRanged, doClose, reloadPlayer,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = ENGINE;
  root.RL = Object.assign(root.RL || {}, { engine: ENGINE });
})(typeof globalThis !== "undefined" ? globalThis : this);
