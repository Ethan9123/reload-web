// ============================================================
// ui.js — RELOAD UI. SCOPE: setup, SVG board (hexes/tokens/minis),
// turn flow (parachute/Run/Loot/End), AI stepping, player panel, log.
// NEXT (task #7): character boards (dice/injury/combat line/equipment),
// combat UI + dice display (after combat engine, task #5).
// ============================================================
(function () {
  "use strict";
  const E = RL.engine, D = RL.data;
  const CHAR = Object.fromEntries(D.CHARACTERS.map(c => [c.id, c]));  // id -> character (mini/card/color)
  const EQ = D.EQUIP_BY_ID;                                          // equipment id -> data
  const ACH = D.ACHIEVEMENT_BY_ID;                                   // achievement id -> data
  let lastAchSeq = 0;                                                // tracks claimed-achievement notifications
  const $ = (id) => document.getElementById(id);
  const SVGNS = "http://www.w3.org/2000/svg";
  const HEX = 46;
  let G = null, aiRunning = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function svgImg(href, x, y, w, h, opacity, fit) {
    const im = svgEl("image", { x, y, width: w, height: h, preserveAspectRatio: fit || "xMidYMid meet", "pointer-events": "none" });
    if (opacity != null) im.setAttribute("opacity", opacity);
    im.setAttributeNS("http://www.w3.org/1999/xlink", "href", href); im.setAttribute("href", href);
    return im;
  }
  // flat-top hexes (to match the illustrated map-book tiles)
  const hexToPixel = (q, r) => ({ x: HEX * 1.5 * q, y: HEX * Math.sqrt(3) * (r + q / 2) });
  function hexCorners(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i);
      pts.push((cx + HEX * Math.cos(a)).toFixed(1) + "," + (cy + HEX * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }
  function corners(cx, cy) {
    const a = [];
    for (let i = 0; i < 6; i++) { const ang = Math.PI / 180 * (60 * i); a.push([cx + HEX * Math.cos(ang), cy + HEX * Math.sin(ang)]); }
    return a;
  }

  function highlightSet() {
    if (!E.isHumanTurn(G)) return { para: new Set(), run: new Set(), atk: new Set(), loot: false };
    const p = E.curP(G);
    const rt = E.rangedTargets(G, p), ct = E.closeTargets(G, p);
    const atk = new Set();
    for (const idx of [...rt, ...ct]) { const e = G.players[idx]; atk.add(E.hexKey(e.pos.q, e.pos.r)); }
    return {
      para: new Set(G.needsParachute ? E.legalParachute(G) : []),
      run: new Set(E.legalRuns(G, p)),
      atk,
      loot: E.lootOptions(G, p).length > 0,
    };
  }

  function renderBoard() {
    const svg = $("board"); svg.innerHTML = "";
    const hl = highlightSet();
    const cells = Object.values(G.board);
    const pix = cells.map(c => ({ c, ...hexToPixel(c.q, c.r) }));
    const xs = pix.map(p => p.x), ys = pix.map(p => p.y), pad = HEX * 1.4;
    svg.setAttribute("viewBox",
      `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`);

    const defs = svgEl("defs", {}); svg.appendChild(defs);
    const cur = E.curP(G);
    const curKey = cur.pos ? E.hexKey(cur.pos.q, cur.pos.r) : null;
    for (const { c, x, y } of pix) {
      const key = E.hexKey(c.q, c.r), t = D.TERRAIN[c.terrain], pts = hexCorners(x, y);
      svg.appendChild(svgEl("polygon", { points: pts, fill: t.color, "pointer-events": "none" })); // fallback tint
      const tile = D.TILE_ART[c.terrain];
      if (tile) {
        const clipId = "hc" + key.replace(/[^0-9-]/g, "_");
        const cp = svgEl("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" });
        cp.appendChild(svgEl("polygon", { points: pts })); defs.appendChild(cp);
        const im = svgImg(tile, x - HEX, y - HEX * 0.9, HEX * 2, HEX * 1.8, null, "xMidYMid slice");
        im.setAttribute("clip-path", `url(#${clipId})`); svg.appendChild(im);
      }
      const poly = svgEl("polygon", { points: pts, fill: "transparent", class: "hex-poly" }); // interactive + highlight
      if (hl.atk.has(key)) { poly.setAttribute("stroke", "#e3424b"); poly.setAttribute("stroke-width", "4"); }
      else if (hl.para.has(key)) { poly.setAttribute("stroke", "#f4d03f"); poly.setAttribute("stroke-width", "4"); poly.setAttribute("stroke-dasharray", "6 4"); }
      else if (hl.run.has(key)) { poly.setAttribute("stroke", "#5fd0e0"); poly.setAttribute("stroke-width", "3"); }
      else if (key === curKey) { poly.setAttribute("stroke", "#fff"); poly.setAttribute("stroke-width", "3"); }
      poly.addEventListener("click", () => onHex(key));
      bindTip(poly, () => hexTip(c));
      svg.appendChild(poly);
      // map token art (portal/toxin under, beacon/supply on top)
      if (c.toxin && D.TOKEN_ART.toxin) svg.appendChild(svgImg(D.TOKEN_ART.toxin, x - HEX * 0.7, y - HEX * 0.7, HEX * 1.4, HEX * 1.4, 0.5));
      if (c.portal) svg.appendChild(svgImg(D.TOKEN_ART.portal, x - 23, y - 23, 46, 46, 0.92));
      if (c.dome && D.TOKEN_ART.dome) svg.appendChild(svgImg(D.TOKEN_ART.dome, x - 22, y - 22, 44, 44, 0.9));
      if (c.tokens.some(k => k.kind === "beacon")) svg.appendChild(svgImg(D.TOKEN_ART.beacon, x - 13, y - 21, 26, 26));
      if (c.tokens.some(k => k.kind === "supply")) svg.appendChild(svgImg(D.TOKEN_ART.supply, x - 14, y - 23, 28, 28));
    }
    // walls/barriers (neutral gray, player-owned colored) + trap/hideout markers
    for (const { c, x, y } of pix) {
      const cs = corners(x, y);
      for (const e in c.walls) {
        const o = c.walls[e], p1 = cs[+e], p2 = cs[(+e + 1) % 6];
        // translucent light-blue glow band so it's obvious a barrier sits on this edge
        svg.appendChild(svgEl("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
          stroke: "#7fd0ff", "stroke-width": 12, "stroke-linecap": "round", opacity: 0.35, "pointer-events": "none" }));
        // solid core keeps the owner color (neutral gray / player color)
        svg.appendChild(svgEl("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
          stroke: o === "n" ? "#cfd6e0" : (G.players[o] ? G.players[o].color : "#cfd6e0"), "stroke-width": 5, "stroke-linecap": "round", "pointer-events": "none" }));
      }
      if (c.trap != null) svg.appendChild(Object.assign(svgEl("text", { x: x - 18, y: y + 20, "font-size": "14", fill: "#e3424b" }), { textContent: "⚠" }));
      c.hideouts.forEach((ownerIdx, hi) => { const op = G.players[ownerIdx], art = op && D.HIDEOUT_ART[op.character]; if (art) svg.appendChild(svgImg(art, x + 2 + hi * 5, y - 4, 22, 22)); });
    }
    // minis — character figurine standees (fall back to a colored disc if art is missing)
    for (const c of cells) {
      const here = E.playersOnHex(G, c.q, c.r);
      const { x, y } = hexToPixel(c.q, c.r);
      here.forEach((p, i) => {
        const ang = here.length > 1 ? (Math.PI * 2 * i / here.length) : 0;
        const ox = here.length > 1 ? Math.cos(ang) * 16 : 0, oy = here.length > 1 ? Math.sin(ang) * 12 : 0;
        const cx = x + ox, cy = y + oy, active = p.idx === G.activePlayer;
        if (active) svg.appendChild(svgEl("ellipse", { cx, cy: cy + 12, rx: 16, ry: 6, fill: "none", stroke: "#fff", "stroke-width": 2, "pointer-events": "none" }));
        svg.appendChild(svgEl("ellipse", { cx, cy: cy + 12, rx: 12, ry: 4.5, fill: p.color, "fill-opacity": 0.9, stroke: "#0c0e12", "stroke-width": 1.2, "pointer-events": "none" }));
        const ch = CHAR[p.character];
        if (ch && ch.mini) {
          const img = svgEl("image", { x: cx - 18, y: cy - 28, width: 36, height: 42, preserveAspectRatio: "xMidYMax meet", "pointer-events": "none" });
          img.setAttributeNS("http://www.w3.org/1999/xlink", "href", ch.mini);
          img.setAttribute("href", ch.mini);
          svg.appendChild(img);
        } else {
          svg.appendChild(svgEl("circle", { cx, cy, r: 12, fill: p.color, "pointer-events": "none" }));
          svg.appendChild(Object.assign(svgEl("text", { x: cx, y: cy + 4, "text-anchor": "middle", "font-size": "12", "font-weight": "700", fill: "#0c0e12", "pointer-events": "none" }), { textContent: p.name[0] }));
        }
      });
    }
  }

  function renderPlayers() {
    const box = $("players-area"); box.innerHTML = "";
    for (const p of G.players) {
      const d = document.createElement("div");
      d.className = "pcard"; d.style.borderLeft = `4px solid ${p.color}`;
      if (p.idx === G.activePlayer) d.style.background = "#222a38";
      const assigned = p.assignedDice && p.assignedDice.length ? ` · 已用 ${p.assignedDice.join("/")}` : "";
      const combat = p.combatLine && p.combatLine.length ? ` · 战斗列 ${p.combatLine.join("/")}` : "";
      const ch = CHAR[p.character];
      const portrait = ch && ch.mini ? `<img class="pportrait" src="${ch.mini}" alt="${p.name}" onerror="this.style.display='none'">` : "";
      d.innerHTML = `<div class="prow">${portrait}<div class="pinfo">` +
        `<div class="pname">${p.name}${p.human ? " (你)" : ""}${p.team != null ? ` <span class="team-badge team${p.team}">队${p.team + 1}</span>` : ""}${p.idx === G.activePlayer ? " ◀" : ""}</div>` +
        `<div class="pstat">名望 ${E.totalFame(p)} · 伤害 ${p.injuries} · 防御区 ${p.defensePool}/${p.actionDice}${p.boostDice ? ` <span style="color:#5fd06f">+${p.boostDice}⚡</span>` : ""}${assigned}${combat} · 背包 ${p.backpack.length}` +
        (p.carryingBeacons ? ` · 携带信标 ${p.carryingBeacons}` : "") +
        ` · ${p.pos ? "在场" : "待跳伞"}</div></div></div>`;
      d.style.cursor = "pointer";
      d.addEventListener("click", () => openCharBoard(p.idx));
      bindTip(d, () => playerTip(p));
      box.appendChild(d);
    }
  }

  function renderTop() {
    const p = E.curP(G);
    let hint = "";
    if (G.gameOver) hint = (G.mode === "team" && G.winnerTeam != null)
      ? `🏆 队伍 ${G.winnerTeam + 1} 获胜${G.superstar ? "（Superstar）" : ""}（队伍名望 ${E.teamFame(G, G.winnerTeam)}）`
      : `🏆 ${G.players[G.winner].name} 获胜${G.superstar ? "（Superstar）" : ""}`;
    else if (!p.human) hint = `${p.name}（AI）行动中…`;
    else if (G.needsParachute) hint = "跳伞：点击中央塔或相邻格";
    else { const h = highlightSet(); hint = `你的回合：点相邻格移动${h.loot ? " · 点当前格拾取" : ""}${E.canUpload(G, p) ? " · 点中央塔上缴信标" : ""}${h.atk.size ? " · 点红框敌人攻击" : ""} · 或结束回合`; }
    const le = (G.lastEvent && D.EVENTS[G.lastEvent]) ? ` · ⚡${D.EVENTS[G.lastEvent].name}` : "";
    const modeLabel = G.mode === "team" ? `团队赛 队1 ${E.teamFame(G, 0)} : ${E.teamFame(G, 1)} 队2` : "大逃杀";
    $("game-info").textContent = `Arcadia · ${G.numPlayers}人 · ${modeLabel} · 第${G.round}回合 · 事件${G.eventsResolved}/${G.eventTotal}${le} — ${hint}`;
    const human = !G.gameOver && p.human, showAct = human && !G.needsParachute;
    const setBtn = (id, ok) => { const bt = $(id); if (!bt) return; bt.disabled = !ok; bt.classList.toggle("hidden", !human); };
    setBtn("btn-end", human && !G.needsParachute);
    setBtn("btn-heal", showAct && E.canHeal(G, p));
    setBtn("btn-barrier", showAct && E.canBuild(G, p) && E.emptyEdges(G, p).length > 0 && p.barriersUsed < 6);
    setBtn("btn-hideout", showAct && E.canBuild(G, p));
    setBtn("btn-trap", showAct && E.canBuild(G, p) && p.pos && G.board[E.hexKey(p.pos.q, p.pos.r)].trap == null && p.trapsUsed < 6);
  }

  function renderLog() {
    const l = $("log"); l.innerHTML = "";
    for (const m of G.log.slice(0, 40)) { const d = document.createElement("div"); d.textContent = m; l.appendChild(d); }
  }

  // current leader name(s) for a MOST achievement metric (for the side-panel hint)
  function mostLeader(metric) {
    let best = -1, names = [];
    for (const p of G.players) { const v = E.mostMetric(G, p, metric); if (v > best) { best = v; names = [p.name]; } else if (v === best && v > 0) names.push(p.name); }
    return best > 0 ? `${names.join("/")}（${best}）` : "—";
  }
  function renderAchievements() {
    const box = $("ach-panel"); if (!box) return;
    if (!G.achievements || !G.achievements.board.length) { box.innerHTML = ""; return; }
    let cards = "";
    for (const slot of G.achievements.board) {
      const a = ACH[slot.id]; if (!a) continue;
      const isNext = a.type === "next";
      const badge = isNext ? '<span class="ach-next">⚡即时</span>' : '<span class="ach-most">🏆比拼</span>';
      cards += `<div class="ach-card" data-id="${slot.id}">
        <img class="ach-img" src="${a.card}" alt="${a.cn}" onerror="this.style.display='none'">
        <div class="ach-meta"><div class="ach-name">${a.cn} ${badge}</div>
        <div class="ach-fame">🏅×${slot.fameBelow || 0}</div></div></div>`;
    }
    box.innerHTML = `<h4>成就板</h4><div class="ach-list">${cards}</div>`;
    box.querySelectorAll(".ach-card").forEach(el => {
      const a = ACH[el.dataset.id];
      bindTip(el, () => `<h5>${a.cn} · ${a.name}</h5>${a.desc}<div class="tt-sub">${a.type === "next" ? "⚡ 即时：下一位达成者立即获得卡片及其名望" : `🏆 比拼：游戏结束结算 · 当前领先：${mostLeader(a.metric)}`}</div>`);
    });
  }

  // non-blocking ⚡ toast when a NEXT achievement is claimed
  function flashAchievement(rep) {
    if (!rep) return; const a = ACH[rep.id]; if (!a) return;
    const who = G.players[rep.player];
    let t = $("ach-toast"); if (!t) { t = document.createElement("div"); t.id = "ach-toast"; document.body.appendChild(t); }
    t.innerHTML = `<img src="${a.card}" onerror="this.style.display='none'"><div><div class="at-h">⚡ 达成成就</div><div class="at-n" style="color:${who.color}">${who.name} — ${a.cn}</div><div class="at-f">+${rep.fame} 成就名望</div></div>`;
    t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(flashAchievement._t); flashAchievement._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---- diplomacy panel: relations, propose truce / focus, answer incoming offers, chatter feed ----
  function relStatus(p, o) {
    if (E.sameTeam(p, o)) return { txt: "队友", cls: "rel-ally" };
    if (E.hasTruce(G, p.idx, o.idx)) return { txt: `休战 ${E.truceRoundsLeft(G, p.idx, o.idx)}回合`, cls: "rel-truce" };
    const rep = G.diplomacy.rep[o.idx];
    return { txt: rep < 25 ? "背信" : "中立", cls: rep < 25 ? "rel-foe" : "rel-neutral" };
  }
  function renderDiplomacy() {
    const box = $("dip-panel"); if (!box) return;
    if (!G.diplomacy || G.players.length < 2) { box.innerHTML = ""; return; }
    const me = G.players.find(x => x.human) || G.players[G.activePlayer];
    const myTurn = E.isHumanTurn(G) && !G.needsParachute && me === E.curP(G);
    const focus = G.diplomacy.focus;
    let rows = "";
    for (const o of G.players) {
      if (o === me) continue;
      const r = relStatus(me, o);
      const isFocus = focus === o.idx;
      const canTalk = myTurn && !E.sameTeam(me, o);
      const truced = E.hasTruce(G, me.idx, o.idx);
      rows += `<div class="dip-row">
        <span class="dip-name" style="color:${o.color}">${o.name}${o.team != null ? ` 队${o.team + 1}` : ""}</span>
        <span class="rel ${r.cls}">${r.txt}</span>${isFocus ? '<span class="rel rel-focus">🎯目标</span>' : ""}
        ${canTalk ? `<span class="dip-btns">
          ${truced ? "" : `<button class="dip-b" data-act="truce" data-to="${o.idx}" title="提议休战">休战</button>`}
          <button class="dip-b" data-act="focus" data-to="${o.idx}" title="提议先集火他">先打他</button></span>` : ""}
      </div>`;
    }
    // pending offers addressed to the human
    const offers = (G.diplomacy.offers || []).filter(of => of.to === me.idx);
    let offerHtml = "";
    for (const of of offers) {
      offerHtml += `<div class="dip-offer">📨 ${G.players[of.from].name} 提议休战（${of.rounds}回合）
        <button class="dip-b ok" data-offer="${of.id}" data-ok="1">接受</button>
        <button class="dip-b no" data-offer="${of.id}" data-ok="0">拒绝</button></div>`;
    }
    const feed = (G.diplomacy.feed || []).slice(0, 4)
      .map(f => `<div class="dip-line"><b style="color:${G.players[f.from] ? G.players[f.from].color : "#ccc"}">${G.players[f.from] ? G.players[f.from].name : "?"}</b>：${f.line}</div>`).join("");
    box.innerHTML = `<h4>外交 / 喊话</h4>${offerHtml}<div class="dip-list">${rows}</div>${feed ? `<div class="dip-feed">${feed}</div>` : ""}`;
    box.querySelectorAll(".dip-b[data-act]").forEach(b => b.addEventListener("click", () => {
      if (!E.isHumanTurn(G)) return;
      const to = +b.dataset.to;
      if (b.dataset.act === "truce") { const r = E.proposeTruce(G, me.idx, to, 3); }
      else E.proposeFocus(G, me.idx, to);
      render();
    }));
    box.querySelectorAll(".dip-b[data-offer]").forEach(b => b.addEventListener("click", () => {
      E.respondToOffer(G, +b.dataset.offer, b.dataset.ok === "1"); render();
    }));
  }

  function render() {
    renderBoard(); renderPlayers(); renderTop(); renderLog(); renderAchievements(); renderDiplomacy();
    if (G && (G._achSeq || 0) > lastAchSeq) { lastAchSeq = G._achSeq; if (G.lastAchievement) flashAchievement(G.lastAchievement); }
  }

  async function onHex(key) {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    const p = E.curP(G);
    if (G.needsParachute) { if (E.parachute(G, key)) render(); return; }
    const c = G.board[key];
    const occupants = E.playersOnHex(G, c.q, c.r).filter(x => x.idx !== p.idx).map(x => x.idx);
    if (occupants.length) {
      // pick an actually-attackable enemy on this hex (skip teammates / out-of-reach occupants)
      const ct = E.closeTargets(G, p), rt = E.rangedTargets(G, p);
      const closeTgt = occupants.find(idx => ct.includes(idx));
      if (closeTgt != null) { E.doClose(G, closeTgt); render(); await animateCombat(G.lastCombat); await endTurn(); return; } // close ends turn
      const rangedTgt = occupants.find(idx => rt.includes(idx));
      if (rangedTgt != null) {
        const aKey = E.hexKey(p.pos.q, p.pos.r), tKey = key;     // capture hexes before resolution (target may RELOAD)
        E.doRanged(G, rangedTgt, 3); render(); await vfxGunshot(aKey, tKey); await animateCombat(G.lastCombat); return;
      }
    }
    const curKey = E.hexKey(p.pos.q, p.pos.r);
    if (key === curKey && E.canUpload(G, p)) { E.doActivate(G); render(); placeDieAnim(curKey); return; } // upload beacons at tower
    if (key === curKey && E.lootOptions(G, p).length) { E.doLoot(G, 0); render(); placeDieAnim(curKey); return; }
    if (E.legalRuns(G, p).includes(key)) {
      const seq = G._trapSeq || 0;
      E.doRun(G, key); render(); placeDieAnim(key);
      if ((G._trapSeq || 0) > seq && G.lastTrap && (G.players[G.lastTrap.walker].human || G.players[G.lastTrap.owner].human)) await animateTrap(G.lastTrap);
      return;
    }
  }

  async function runAI() {
    if (aiRunning) return;
    aiRunning = true;
    while (!G.gameOver && !E.curP(G).human) {
      if (G.needsParachute || E.curP(G).pos == null) { /* let AI handle in takeTurn */ }
      const seq = G._trapSeq || 0;
      RL.ai.takeTurn(G);
      render();
      if ((G._trapSeq || 0) > seq && G.lastTrap && G.players[G.lastTrap.owner].human) await animateTrap(G.lastTrap); // your mine triggered
      await sleep(450);
    }
    aiRunning = false;
    render();
  }

  async function endTurn() {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    E.endTurn(G); render();
    if (!G.gameOver && !E.curP(G).human) await runAI();
  }

  async function startGame() {
    const modeSel = $("mode-select"), mode = modeSel ? modeSel.value : "battleRoyale";
    let n = parseInt($("player-count").value, 10);
    if (mode === "team") n = 4;   // Team Royale is a 2v2 — always 4 characters (no one-player-controls-two)
    G = E.newGame({ numPlayers: n, mode, allAI: $("all-ai").checked });
    window.G = G; lastAchSeq = 0;
    $("setup-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    render();
    if (!E.isHumanTurn(G)) await runAI();
  }

  function act(fn) {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    const p = E.curP(G), here = p.pos && E.hexKey(p.pos.q, p.pos.r);
    if (fn(p)) { render(); if (here) placeDieAnim(here); }
  }
  function barrierEdgeTowardEnemy(p) {
    const empties = E.emptyEdges(G, p); if (!empties.length) return null;
    const enemies = G.players.filter(x => x.idx !== p.idx && x.pos);
    if (!enemies.length) return empties[0];
    let best = empties[0], bd = Infinity;
    for (const e of empties) {
      const n = { q: p.pos.q + D.HEX_DIRS[e].q, r: p.pos.r + D.HEX_DIRS[e].r };
      for (const en of enemies) { const d = E.hexDistance(n, en.pos); if (d < bd) { bd = d; best = e; } }
    }
    return best;
  }
  // ---- character board overlay (real character card + dice + equipment cards) ----
  const STAR_COLOR = { 1: "#3aa84b", 2: "#3b82c4", 3: "#b06bd6" };
  const SLOT_CN = { head: "头部", torso: "躯干", hand: "手持", special: "道具" };
  function equipCardHTML(e, action) {
    if (!e) return "";
    const sc = STAR_COLOR[e.star] || "#888";
    let stats = "";
    if (e.combat === "ranged") stats = `远程 · 射程${e.range[0]}-${e.range[1]} · ${e.dice}白骰` + (e.hands === 2 ? " · 双手" : "") + (e.bonus ? ` · 命中bonus:${e.bonus.amount}${e.bonus.type === "injury" ? "伤" : "轻伤"}` : "");
    else if (e.combat === "close") stats = "近战" + (e.hands === 2 ? " · 双手" : "");
    else if (e.armor) stats = "护甲" + (e.armor.skullReduce ? ` 骷髅-${e.armor.skullReduce}` : "") + (e.armor.smallInjuryReduce ? ` 轻伤-${e.armor.smallInjuryReduce}` : "");
    const clk = action ? ` ecard-clk" data-eq="${e.id}" data-act="${action}` : "";
    const tag = action === "equip" ? `<span class="ecard-act eq">＋装备</span>` : action === "unequip" ? `<span class="ecard-act un">－卸下</span>` : "";
    return `<div class="ecard${clk}" style="border-top-color:${sc}">
      <div class="ecard-h"><span class="ecard-name">${e.name}</span><span class="ecard-star" style="color:${sc}">${"★".repeat(e.star)}</span></div>
      <div class="ecard-meta">${SLOT_CN[e.slot] || e.slot}${stats ? " · " + stats : ""}</div>
      <div class="ecard-eff">${e.effect || ""}</div>${tag}</div>`;
  }
  function dieSpan(v, cls) { return `<span class="die ${cls}">${v == null ? "" : v}</span>`; }
  function diceRowsHTML(p) {
    const boost = p.boostDice || 0, real = Math.max(0, p.defensePool - boost);
    // black/white action dice + (Energy Drink) GREEN boost dice the player may freely allocate to non-combat actions
    const def = Array.from({ length: real }, () => dieSpan("", "def")).join("") +
                Array.from({ length: boost }, () => dieSpan("⚡", "boost")).join("");
    const line = (p.combatLine || []).map(v => dieSpan(v, "line")).join("");
    const inj = Array.from({ length: p.injuries }, () => dieSpan("✕", "inj")).join("");
    const row = (label, html) => `<div class="cb-dice"><span class="cb-dl">${label}</span>${html || '<i class="muted">—</i>'}</div>`;
    const defLabel = boost ? `防御区(${real}+${boost}⚡)` : `防御区(${p.defensePool})`;
    return row(defLabel, def) + row(`战斗列`, line) + row(`伤害区(${p.injuries}/${E.INJURY_ZONE})`, inj);
  }
  const SP_ICON = { pain_killer: "💊", energy_drink: "🥤", tactical_explosive: "💣" };
  // Free-action special items usable right now (only on the active human's own board, to match engine's curP).
  function specialUseHTML(p) {
    if (!p.human || G.gameOver || G.needsParachute || E.curP(G) !== p) return "";
    const usable = E.usableSpecials(G, p);
    if (!usable.length) return "";
    const kindCN = (k) => k === "trap" ? "陷阱" : k === "wall" ? "屏障" : "藏身处";
    let rows = "";
    for (const e of usable) {
      const icon = SP_ICON[e.id] || "✦";
      if (e.id === "tactical_explosive") {
        E.explosiveTargets(G, p).forEach((t, i) => {
          rows += `<button class="cb-use small" data-item="${e.id}" data-ti="${i}">${icon} ${e.name}：拆除${kindCN(t.kind)}</button>`;
        });
      } else {
        rows += `<button class="cb-use small" data-item="${e.id}">${icon} 使用 ${e.name}</button>`;
      }
    }
    return `<div class="cb-sec"><h3>可用道具（自由行动 · 用后弃置）</h3><div class="cb-uses">${rows}</div></div>`;
  }
  function openCharBoard(idx) {
    const p = G.players[idx], ch = CHAR[p.character];
    let ov = $("char-overlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "char-overlay"; ov.addEventListener("click", (e) => { if (e.target === ov) closeCharBoard(); }); document.body.appendChild(ov); }
    const editable = p.human && E.curP(G) === p && !G.gameOver && E.canEquip(G, p);   // adjust equipment before assigning any die
    const equippedIds = [p.equipped.head, p.equipped.torso, ...(p.equipped.hand || [])].filter(Boolean);
    const eqHTML = equippedIds.map(id => equipCardHTML(EQ[id], editable ? "unequip" : null)).join("") || '<span class="muted">无</span>';
    const packLeft = (p.backpack || []).slice();                 // backpack minus currently-equipped instances
    for (const id of equippedIds) { const i = packLeft.indexOf(id); if (i >= 0) packLeft.splice(i, 1); }
    const packHTML = packLeft.map(id => equipCardHTML(EQ[id], (editable && EQ[id] && EQ[id].slot !== "special") ? "equip" : null)).join("") || '<span class="muted">空</span>';
    const f = p.fame;
    ov.innerHTML = `<div class="cb-panel" style="border-color:${p.color}">
      <button class="cb-close" title="关闭">✕</button>
      <div class="cb-top">
        <img class="cb-card" src="${ch.card}" alt="${p.name}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cb-cardfallback',textContent:'${p.name}'}))">
        <div class="cb-info">
          <h2 style="color:${p.color}">${p.name}${p.human ? " (你)" : ""}</h2>
          ${ch.ability ? `<div class="cb-ability"><b>${ch.ability.name}</b><div>${ch.ability.text}</div></div>` : '<div class="muted">（角色能力见左侧卡牌）</div>'}
          <div class="cb-fame">名望 <b>${E.totalFame(p)}</b> ＝ 信标${f.beacon}·受伤${f.injury}·重整${f.reload}·陷阱${f.trap || 0}·成就${f.achievement || 0}${p.carryingBeacons ? `　｜　携带信标 ${p.carryingBeacons}（需到中央塔上缴）` : ""}</div>
          ${p.achievementsWon && p.achievementsWon.length ? `<div class="cb-fame">🏅 成就：${p.achievementsWon.map(id => (ACH[id] ? ACH[id].cn : id)).join("、")}</div>` : ""}
          ${diceRowsHTML(p)}
        </div>
      </div>
      <div class="cb-sec"><h3>已装备（${SLOT_CN.head}1 / ${SLOT_CN.torso}1 / ${SLOT_CN.hand}2）${editable ? '<span class="cb-equiphint">分配骰子前可点击调整</span>' : ""}</h3><div class="ecards">${eqHTML}</div></div>
      ${specialUseHTML(p)}
      <div class="cb-sec"><h3>背包（${p.backpack.length}）</h3><div class="ecards">${packHTML}</div></div>
    </div>`;
    ov.querySelector(".cb-close").addEventListener("click", closeCharBoard);
    ov.querySelectorAll("[data-eq]").forEach(el => el.addEventListener("click", () => {
      if (aiRunning || G.gameOver || !E.isHumanTurn(G) || E.curP(G) !== p) return;
      const id = el.dataset.eq, ok = el.dataset.act === "equip" ? E.equipItem(G, p, id) : E.unequipItem(G, p, id);
      if (ok) { render(); openCharBoard(idx); }   // refresh weapons/armor + panel
    }));
    ov.querySelectorAll(".cb-use").forEach(btn => btn.addEventListener("click", async () => {
      if (aiRunning || G.gameOver || !E.isHumanTurn(G) || E.curP(G) !== p) return;
      const itemId = btn.dataset.item;
      let target = null;
      if (itemId === "tactical_explosive") target = E.explosiveTargets(G, p)[+btn.dataset.ti];
      if (!E.useSpecialItem(G, itemId, target)) return;
      if (itemId === "tactical_explosive" && target) {                 // show the blast on the board
        closeCharBoard(); render(); await vfxExplosion(target.key); openCharBoard(idx);
      } else { render(); openCharBoard(idx); }                          // pain killer / energy drink: refresh panel in place
    }));
    ov.style.display = "flex";
  }
  function closeCharBoard() { const ov = $("char-overlay"); if (ov) ov.style.display = "none"; }

  // ---- dice animations: combat/heal rolls (tumble→settle) + action-die placement ----
  const DFACE = (v) => v === "skull" ? "💀" : v;
  const rollFace = () => { const r = Math.floor(Math.random() * 6) + 1; return r === 6 ? "💀" : r; };
  function ensureDiceOverlay() {
    let ov = $("dice-overlay");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "dice-overlay";
      ov.innerHTML = '<div class="dz-panel"><div class="dz-title"></div><div class="dz-body"></div><div class="dz-result"></div></div>';
      document.body.appendChild(ov);
    }
    return ov;
  }
  async function animateRoll(title, groups, resultText, resultClass) {
    const ov = ensureDiceOverlay();
    ov.querySelector(".dz-title").textContent = title;
    const rEl = ov.querySelector(".dz-result"); rEl.textContent = ""; rEl.className = "dz-result";
    const body = ov.querySelector(".dz-body");
    body.innerHTML = groups.map((g, gi) =>
      `<div class="dz-side"><div class="dz-who" style="color:${g.color || "#e6e8ec"}">${g.label}</div>` +
      `<div class="dz-dice" data-g="${gi}">${g.values.map(() => '<span class="adie rolling">?</span>').join("") || '<i class="muted">无骰</i>'}</div></div>`
    ).join('<div class="dz-vs">VS</div>');
    ov.style.display = "flex";
    const all = [];
    groups.forEach((g, gi) => [...body.querySelectorAll(`[data-g="${gi}"] .adie`)].forEach((el, i) => all.push({ el, v: g.values[i] })));
    const t0 = Date.now();
    await new Promise(res => { const iv = setInterval(() => { all.forEach(d => { if (!d.el.classList.contains("settled")) d.el.textContent = rollFace(); }); if (Date.now() - t0 > 620) { clearInterval(iv); res(); } }, 70); });
    for (const d of all) { d.el.textContent = DFACE(d.v); d.el.classList.remove("rolling"); d.el.classList.add("settled"); if (d.v === "skull") d.el.classList.add("skull"); await sleep(55); }
    rEl.textContent = resultText || ""; if (resultClass) rEl.classList.add(resultClass);
    await sleep(850); ov.style.display = "none";
  }
  // multi-phase combat: roll -> skull compare -> combat-line row-by-row -> result
  async function animateCombat(rep) {
    if (!rep) return;
    const A = G.players[rep.a], T = G.players[rep.t];
    const ov = ensureDiceOverlay();
    ov.querySelector(".dz-title").textContent = `${A.name} ${rep.type === "ranged" ? "🔫 远程" : "🗡 近战"} ${T.name}`;
    const rEl = ov.querySelector(".dz-result"); rEl.textContent = ""; rEl.className = "dz-result";
    const body = ov.querySelector(".dz-body");
    body.innerHTML =
      `<div class="dz-side"><div class="dz-who" style="color:${A.color}">${A.name}（攻）</div><div class="dz-dice" id="dzA"></div></div>` +
      `<div class="dz-vs" id="dzMid">掷骰…</div>` +
      `<div class="dz-side"><div class="dz-who" style="color:${T.color}">${T.name}（守）</div><div class="dz-dice" id="dzD"></div></div>`;
    ov.style.display = "flex";
    const aWrap = ov.querySelector("#dzA"), dWrap = ov.querySelector("#dzD"), mid = ov.querySelector("#dzMid");
    const aArr = rep.shooter || [], dArr = rep.defender || [];
    const fill = (wrap, arr) => { wrap.innerHTML = arr.map(() => '<span class="adie rolling">?</span>').join("") || '<i class="muted">无骰</i>'; return [...wrap.querySelectorAll(".adie")]; };
    const all = [];
    fill(aWrap, aArr).forEach((el, i) => all.push({ el, v: aArr[i] }));
    fill(dWrap, dArr).forEach((el, i) => all.push({ el, v: dArr[i] }));
    // PHASE 1 — roll (tumble -> settle), skulls marked
    const t0 = Date.now();
    await new Promise(res => { const iv = setInterval(() => { all.forEach(d => { if (!d.el.classList.contains("settled")) d.el.textContent = rollFace(); }); if (Date.now() - t0 > 600) { clearInterval(iv); res(); } }, 70); });
    for (const d of all) { d.el.textContent = DFACE(d.v); d.el.classList.remove("rolling"); d.el.classList.add("settled"); if (d.v === "skull") d.el.classList.add("skull"); }
    await sleep(450);
    // PHASE 2 — skull step
    const aS = rep.aSkulls || 0, dS = rep.dSkulls || 0;
    const skTxt = aS > dS ? `攻方多 ${aS - dS}` : dS > aS ? `守方多 ${dS - aS}` : "持平";
    mid.innerHTML = `💀 ${aS} : ${dS}<br><span class="dz-cap">${skTxt}</span>`;
    await sleep(950);
    // PHASE 3 — combat line, row by row (numeric, high->low)
    const aNum = aArr.filter(v => v !== "skull").sort((x, y) => y - x), dNum = dArr.filter(v => v !== "skull").sort((x, y) => y - x);
    // mirror engine skull step: the skull-loser's lowest dice leave the combat line before the
    // row-by-row compare, so drop them here too (engine trims them in doRanged/doClose).
    if (dS > aS) aNum.splice(Math.max(0, aNum.length - (dS - aS)), dS - aS);
    else if (aS > dS) dNum.splice(Math.max(0, dNum.length - (aS - dS)), aS - dS);
    mid.innerHTML = `逐列比对 ▶`;
    aWrap.innerHTML = aNum.map(v => `<span class="adie settled">${v}</span>`).join("") || '<i class="muted">—</i>';
    dWrap.innerHTML = dNum.map(v => `<span class="adie settled">${v}</span>`).join("") || '<i class="muted">—</i>';
    const aN = [...aWrap.querySelectorAll(".adie")], dN = [...dWrap.querySelectorAll(".adie")];
    for (let i = 0; i < Math.max(aN.length, dN.length); i++) {
      const av = aNum[i], dv = dNum[i];
      if (aN[i]) aN[i].classList.add("cmp"); if (dN[i]) dN[i].classList.add("cmp");
      if (av != null && dv != null) { if (av > dv) { aN[i].classList.add("win"); dN[i].classList.add("lose"); } else if (dv > av) { dN[i].classList.add("win"); aN[i].classList.add("lose"); } }
      else if (av != null) aN[i].classList.add("win"); else if (dv != null) dN[i].classList.add("win");
      await sleep(420);
    }
    // PHASE 4 — result
    rEl.className = "dz-result " + (rep.reload ? "big" : (rep.dealt > 0 ? "hit" : ""));
    rEl.textContent = rep.reload ? `💥 ${T.name} 被迫 RELOAD！` : (rep.dealt > 0 ? `命中！造成 ${rep.dealt} 点伤` : "未造成伤害");
    await sleep(1100);
    ov.style.display = "none";
  }
  // small styled chooser for the heal target (self vs teammate) — returns the chosen idx, or null if cancelled
  function pickHealTarget(p, targets) {
    return new Promise(resolve => {
      let ov = $("choice-overlay");
      if (!ov) { ov = document.createElement("div"); ov.id = "choice-overlay"; document.body.appendChild(ov); }
      const btns = targets.map(idx => { const t = G.players[idx]; return `<button class="ch-btn" data-i="${idx}">${idx === p.idx ? "治疗自己（恢复 1）" : `治疗队友 ${t.name}（恢复 2 · +团队精神）`}</button>`; }).join("");
      ov.innerHTML = `<div class="ch-panel"><div class="ch-title">选择治疗目标</div><div class="ch-btns">${btns}<button class="ch-btn cancel" data-i="">取消</button></div></div>`;
      ov.style.display = "flex";
      ov.querySelectorAll(".ch-btn").forEach(b => b.addEventListener("click", () => { ov.style.display = "none"; const v = b.dataset.i; resolve(v === "" ? null : +v); }));
    });
  }
  function animateHeal(roll) {
    if (!roll) return Promise.resolve();
    const p = G.players[roll.by];
    return animateRoll(`${p.name} 治疗`, [{ label: "治疗骰", color: "#5fd0e0", values: [roll.value] }],
      roll.value === "skull" ? `骷髅！恢复 ${roll.healed} 点` : `恢复 ${roll.healed} 点`, "hit");
  }
  // an action die "drops" onto the target hex (placed, not rolled)
  function placeDieAnim(key) {
    const svg = $("board"), c = key && G.board[key]; if (!svg || !c) return;
    const { x, y } = hexToPixel(c.q, c.r);
    const g = svgEl("g", { "pointer-events": "none" });
    g.appendChild(svgEl("rect", { x: x - 11, y: y - 11, width: 22, height: 22, rx: 5, fill: "#e8eef6", stroke: "#11141a", "stroke-width": 1.5 }));
    svg.appendChild(g);
    const t0 = performance.now(), dur = 470;
    (function step(t) {
      const k = Math.min(1, (t - t0) / dur);
      g.setAttribute("transform", `translate(0,${(-26 * (1 - k) * (1 - k)).toFixed(1)})`);
      g.setAttribute("opacity", (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35).toFixed(2));
      if (k < 1) requestAnimationFrame(step); else g.remove();
    })(performance.now());
  }

  // ---- board VFX: gunshot tracer/sparks + explosions (procedural — no sprite art) ----
  // VFX append transient SVG nodes to #board; the next render() clears them, and they only run
  // during awaited animation gaps, so they never collide with a redraw.
  function pxOf(key) { const c = key && G.board[key]; return c ? hexToPixel(c.q, c.r) : null; }
  function vfxGroup() { const svg = $("board"); if (!svg) return null; const g = svgEl("g", { "pointer-events": "none" }); svg.appendChild(g); return g; }
  function animateRAF(dur, step) {
    return new Promise(res => { const t0 = performance.now();
      (function loop(t) { const k = Math.min(1, (t - t0) / dur); step(k); if (k < 1) requestAnimationFrame(loop); else res(); })(performance.now());
    });
  }
  function vfxGunshot(fromKey, toKey) {
    const a = pxOf(fromKey), b = pxOf(toKey), g = vfxGroup(); if (!a || !b || !g) return Promise.resolve();
    const tracer = svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: "#ffd86b", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.95 });
    const flash = svgEl("circle", { cx: a.x, cy: a.y, r: 7, fill: "#fff3b0" });
    g.appendChild(tracer); g.appendChild(flash);
    const sparks = []; const N = 10;
    for (let i = 0; i < N; i++) { const ang = Math.PI * 2 * i / N + Math.random() * 0.6, len = 11 + Math.random() * 15;
      const s = svgEl("line", { x1: b.x, y1: b.y, x2: b.x, y2: b.y, stroke: i % 2 ? "#ff8a3c" : "#ffe08a", "stroke-width": 2.5, "stroke-linecap": "round" });
      g.appendChild(s); sparks.push({ s, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len });
    }
    return animateRAF(440, k => {
      tracer.setAttribute("opacity", (k < 0.25 ? 0.95 : Math.max(0, 0.95 - (k - 0.25) / 0.4)).toFixed(2));
      flash.setAttribute("r", (7 + k * 5).toFixed(1)); flash.setAttribute("opacity", (1 - k).toFixed(2));
      sparks.forEach(o => { o.s.setAttribute("x1", (b.x + o.dx * k * 0.55).toFixed(1)); o.s.setAttribute("y1", (b.y + o.dy * k * 0.55).toFixed(1));
        o.s.setAttribute("x2", (b.x + o.dx * k).toFixed(1)); o.s.setAttribute("y2", (b.y + o.dy * k).toFixed(1)); o.s.setAttribute("opacity", (1 - k).toFixed(2)); });
    }).then(() => g.remove());
  }
  function vfxExplosion(key) {
    const c = pxOf(key), g = vfxGroup(); if (!c || !g) return Promise.resolve();
    const ring = svgEl("circle", { cx: c.x, cy: c.y, r: 4, fill: "none", stroke: "#ff7a2c", "stroke-width": 4 });
    const core = svgEl("circle", { cx: c.x, cy: c.y, r: 6, fill: "#ffe07a" });
    g.appendChild(ring); g.appendChild(core);
    const deb = []; const N = 13;
    for (let i = 0; i < N; i++) { const ang = Math.PI * 2 * i / N + Math.random() * 0.5, len = 24 + Math.random() * 18;
      const d = svgEl("circle", { cx: c.x, cy: c.y, r: 2.5 + Math.random() * 2, fill: i % 3 ? "#ff7a2c" : "#ffd05a" });
      g.appendChild(d); deb.push({ d, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len });
    }
    return animateRAF(680, k => {
      ring.setAttribute("r", (4 + k * 46).toFixed(1)); ring.setAttribute("opacity", (1 - k).toFixed(2)); ring.setAttribute("stroke-width", (4 * (1 - k) + 1).toFixed(1));
      core.setAttribute("r", (6 + (k < 0.3 ? k * 30 : (1 - k) * 12)).toFixed(1)); core.setAttribute("opacity", (1 - k).toFixed(2));
      const e = 1 - (1 - k) * (1 - k);
      deb.forEach(o => { o.d.setAttribute("cx", (c.x + o.dx * e).toFixed(1)); o.d.setAttribute("cy", (c.y + o.dy * e + k * k * 10).toFixed(1)); o.d.setAttribute("opacity", (1 - k).toFixed(2)); });
    }).then(() => g.remove());
  }

  // ---- mine/trap reveal close-up: the enemy mine flips ?→symbol, the walker's RPS choice shows, then the verdict ----
  const RPS_SYM = ["✊", "✋", "✌"], RPS_CN = ["石头", "布", "剪刀"];   // 0 rock / 1 paper / 2 scissor
  async function animateTrap(rep) {
    if (!rep) return;
    const walker = G.players[rep.walker], owner = G.players[rep.owner];
    let ov = $("trap-overlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "trap-overlay"; document.body.appendChild(ov); }
    ov.innerHTML = `<div class="tz-panel">
      <div class="tz-title">💣 ${walker.name} 踩上了 ${owner.name} 的地雷…</div>
      <div class="tz-body">
        <div class="tz-side"><div class="tz-who" style="color:${owner.color}">${owner.name} 的地雷</div><div class="tz-sym" id="tzMine">？</div></div>
        <div class="tz-vs">VS</div>
        <div class="tz-side"><div class="tz-who" style="color:${walker.color}">${walker.name} 的应对</div><div class="tz-sym" id="tzWalk">？</div></div>
      </div>
      <div class="tz-result" id="tzRes"></div></div>`;
    ov.style.display = "flex";
    const mine = ov.querySelector("#tzMine"), walk = ov.querySelector("#tzWalk"), res = ov.querySelector("#tzRes");
    mine.classList.add("shake");                                   // tension: the unknown mine rattles
    await sleep(750);
    walk.textContent = RPS_SYM[rep.w]; walk.classList.add("pop");  // walker reveals their choice
    await sleep(560);
    mine.classList.remove("shake"); mine.classList.add("flip");    // the mine flips from ? to its symbol
    await sleep(170); mine.textContent = RPS_SYM[rep.t]; mine.classList.add("pop");
    await sleep(680);
    res.className = "tz-result " + (rep.outcome === "hit" ? "bad" : rep.outcome === "dodge" ? "good" : "");
    res.textContent = rep.outcome === "tie" ? `平手！${owner.name} +1 陷阱名望，${walker.name} 停止移动`
      : rep.outcome === "dodge" ? `${walker.name} 闪过地雷！+1 陷阱名望`
      : `💥 ${walker.name} 踩中地雷！受到 1 点伤`;
    await sleep(rep.outcome === "hit" ? 420 : 950);
    ov.style.display = "none";
    if (rep.outcome === "hit") await vfxExplosion(rep.key);        // detonate on the board
  }

  // ---- hover tooltips (semi-transparent floating help) ----
  function ensureTip() { let t = $("tooltip"); if (!t) { t = document.createElement("div"); t.id = "tooltip"; document.body.appendChild(t); } return t; }
  function positionTip(x, y) {
    const t = $("tooltip"); if (!t) return; const r = t.getBoundingClientRect(), pad = 14;
    let nx = x + pad, ny = y + pad;
    if (nx + r.width > innerWidth - 8) nx = x - r.width - pad;
    if (ny + r.height > innerHeight - 8) ny = y - r.height - pad;
    t.style.left = Math.max(4, nx) + "px"; t.style.top = Math.max(4, ny) + "px";
  }
  function showTip(html, x, y) { if (!html) return; const t = ensureTip(); t.innerHTML = html; t.style.display = "block"; positionTip(x, y); }
  function hideTip() { const t = $("tooltip"); if (t) t.style.display = "none"; }
  function bindTip(el, content) {
    el.addEventListener("mouseenter", e => showTip(typeof content === "function" ? content() : content, e.clientX, e.clientY));
    el.addEventListener("mousemove", e => positionTip(e.clientX, e.clientY));
    el.addEventListener("mouseleave", hideTip);
  }
  const ttSub = (s) => `<div class="tt-sub">${s}</div>`;
  function hexTip(c) {
    const t = D.TERRAIN[c.terrain];
    let h = `<h5>${t.name}</h5>`; const lines = [];
    if (c.terrain === "tower") lines.push("在此 <b>Activate</b> 上缴携带的信标 → 换名望");
    if (c.terrain === "mountain") lines.push("进入需要 <b>2</b> 个移动骰");
    if (c.tokens.some(k => k.kind === "beacon")) lines.push("🔆 信标：<b>Loot</b> 拾取，带到中央塔上缴 +1 名望");
    if (c.tokens.some(k => k.kind === "supply")) lines.push("📦 2★补给箱：<b>Loot</b> 开箱，抽 2 张装备留 1");
    if (c.portal) lines.push("🌀 传送门：花 1 移动骰在任意两传送门间穿梭");
    if (c.toxin) lines.push("☣ 毒气：回合末停留且无藏身处/穹顶 → 受 1 伤");
    if (c.trap != null) lines.push("⚠ 陷阱（隐藏）：踩入需与陷阱猜拳");
    for (const oi of (c.hideouts || [])) { const op = G.players[oi]; if (op) lines.push(`⌂ ${op.name} 藏身处：回合在此结束→最低战斗列骰回防御、免疫毒气`); }
    const wn = Object.values(c.walls).filter(o => o === "n").length, wp = Object.keys(c.walls).length - wn;
    if (wn || wp) lines.push(`🧱 墙 ${wn ? "中立×" + wn : ""}${wp ? " 玩家×" + wp : ""}：阻挡移动/视线`);
    if (lines.length) h += ttSub(lines.join("<br>"));
    const here = E.playersOnHex(G, c.q, c.r);
    if (here.length) h += ttSub("👤 " + here.map(p => `<b style="color:${p.color}">${p.name}</b>(伤${p.injuries})`).join("、"));
    return h;
  }
  function playerTip(p) {
    const ch = CHAR[p.character];
    let h = `<h5 style="color:${p.color}">${p.name}${p.human ? "（你）" : "（AI）"} · ${ch ? ch.name : p.character}</h5>`;
    if (ch && ch.ability) h += `<div><b>${ch.ability.name}</b>：${ch.ability.text}</div>`;
    h += ttSub(`名望 <b>${E.totalFame(p)}</b>（信标${p.fame.beacon}/受伤${p.fame.injury}/重整${p.fame.reload}/陷阱${p.fame.trap || 0}）<br>` +
      `伤害 ${p.injuries}/${E.INJURY_ZONE} · 行动骰 ${p.defensePool}/${p.actionDice}${p.carryingBeacons ? ` · 携带信标 ${p.carryingBeacons}` : ""}<br>` +
      `装备 ${[p.equipped.head, p.equipped.torso, ...(p.equipped.hand || [])].filter(Boolean).length} · 背包 ${p.backpack.length} · ${p.pos ? "在场" : (p.reloadZone ? "待重新跳伞" : "待跳伞")}`);
    return h + `<div class="tt-hint">点击查看完整角色板</div>`;
  }
  const BTN_TIP = {
    "btn-heal": "治疗：消耗 1 行动骰掷骰，恢复 1 点伤（骷髅+1）。同格有敌人时不可用。",
    "btn-barrier": "屏障：消耗 1 行动骰，在当前格空边放置自己的屏障（挡移动/视线，自己可穿）。同格有敌人时不可用。",
    "btn-hideout": "藏身处：消耗 1 行动骰，在当前格放藏身处（回合在此结束有好处、免疫毒气）。",
    "btn-trap": "陷阱：消耗 1 行动骰，在当前格埋隐藏陷阱，敌人踩入需猜拳。",
    "btn-end": "结束回合：已用骰子进战斗列，进入结束阶段并轮到下一位。",
    "btn-restart": "重新开始游戏。",
  };

  function init() {
    if (typeof window !== "undefined") window.__render = render;   // dev/test hook for forced re-render
    $("btn-start").addEventListener("click", startGame);
    $("btn-restart").addEventListener("click", () => location.reload());
    const modeSel = $("mode-select"), pcSel = $("player-count");
    if (modeSel && pcSel) modeSel.addEventListener("change", () => {   // Team Royale is always 2v2 (4 players)
      if (modeSel.value === "team") { pcSel.value = "4"; pcSel.disabled = true; } else pcSel.disabled = false;
    });
    $("btn-end").addEventListener("click", endTurn);
    $("btn-heal").addEventListener("click", async () => {
      if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
      const p = E.curP(G), targets = E.healTargets(G, p);
      if (!targets.length) return;
      let targetIdx = targets[0];
      if (targets.length > 1) { targetIdx = await pickHealTarget(p, targets); if (targetIdx == null) return; } // let the player choose self vs teammate
      if (E.doHeal(G, targetIdx)) { render(); await animateHeal(G.lastRoll); }
    });
    $("btn-barrier").addEventListener("click", () => act(p => { const e = barrierEdgeTowardEnemy(p); return e != null && E.doBuildBarrier(G, e); }));
    $("btn-hideout").addEventListener("click", () => act(p => E.canBuild(G, p) && E.doBuildHideout(G)));
    $("btn-trap").addEventListener("click", () => act(() => E.doBuildTrap(G)));
    Object.keys(BTN_TIP).forEach(id => { const b = $(id); if (b) bindTip(b, BTN_TIP[id]); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
