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
  const hexToPixel = (q, r) => ({ x: HEX * Math.sqrt(3) * (q + r / 2), y: HEX * 1.5 * r });
  function hexCorners(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 180 * (60 * i - 90);
      pts.push((cx + HEX * Math.cos(a)).toFixed(1) + "," + (cy + HEX * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }
  function corners(cx, cy) {
    const a = [];
    for (let i = 0; i < 6; i++) { const ang = Math.PI / 180 * (60 * i - 90); a.push([cx + HEX * Math.cos(ang), cy + HEX * Math.sin(ang)]); }
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

    const cur = E.curP(G);
    const curKey = cur.pos ? E.hexKey(cur.pos.q, cur.pos.r) : null;
    for (const { c, x, y } of pix) {
      const key = E.hexKey(c.q, c.r), t = D.TERRAIN[c.terrain];
      const poly = svgEl("polygon", { points: hexCorners(x, y), fill: t.color, class: "hex-poly" });
      if (hl.atk.has(key)) { poly.setAttribute("stroke", "#e3424b"); poly.setAttribute("stroke-width", "4"); }
      else if (hl.para.has(key)) { poly.setAttribute("stroke", "#f4d03f"); poly.setAttribute("stroke-width", "4"); poly.setAttribute("stroke-dasharray", "6 4"); }
      else if (hl.run.has(key)) { poly.setAttribute("stroke", "#5fd0e0"); poly.setAttribute("stroke-width", "3"); }
      else if (key === curKey) { poly.setAttribute("stroke", "#fff"); poly.setAttribute("stroke-width", "3"); }
      poly.addEventListener("click", () => onHex(key));
      svg.appendChild(poly);
      svg.appendChild(Object.assign(svgEl("text", { x, y: y + 30, class: "hex-label" }), { textContent: c.terrain === "tower" ? "TOWER" : c.terrain.toUpperCase().slice(0, 4) }));
      if (c.tokens.some(k => k.kind === "beacon")) svg.appendChild(svgEl("circle", { cx: x, cy: y - 8, r: 9, class: "tok-beacon" }));
      if (c.tokens.some(k => k.kind === "supply")) svg.appendChild(svgEl("rect", { x: x - 9, y: y - 17, width: 18, height: 18, rx: 3, class: "tok-supply" }));
      if (c.portal) svg.appendChild(svgEl("circle", { cx: x, cy: y, r: HEX * 0.55, class: "tok-portal" }));
    }
    // walls/barriers (neutral gray, player-owned colored) + trap/hideout markers
    for (const { c, x, y } of pix) {
      const cs = corners(x, y);
      for (const e in c.walls) {
        const o = c.walls[e], p1 = cs[+e], p2 = cs[(+e + 1) % 6];
        svg.appendChild(svgEl("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1],
          stroke: o === "n" ? "#9aa0ac" : (G.players[o] ? G.players[o].color : "#9aa0ac"), "stroke-width": 5, "stroke-linecap": "round" }));
      }
      if (c.trap != null) svg.appendChild(Object.assign(svgEl("text", { x: x - 18, y: y + 20, "font-size": "14", fill: "#e3424b" }), { textContent: "⚠" }));
      if (c.hideouts.length) svg.appendChild(Object.assign(svgEl("text", { x: x + 8, y: y + 20, "font-size": "14", fill: "#fff" }), { textContent: "⌂" }));
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
        `<div class="pname">${p.name}${p.human ? " (你)" : ""}${p.idx === G.activePlayer ? " ◀" : ""}</div>` +
        `<div class="pstat">名望 ${E.totalFame(p)} · 伤害 ${p.injuries} · 防御区 ${p.defensePool}/${p.actionDice}${assigned}${combat} · 背包 ${p.backpack.length}` +
        (p.carryingBeacons ? ` · 携带信标 ${p.carryingBeacons}` : "") +
        ` · ${p.pos ? "在场" : "待跳伞"}</div></div></div>`;
      d.style.cursor = "pointer"; d.title = "点击查看角色板";
      d.addEventListener("click", () => openCharBoard(p.idx));
      box.appendChild(d);
    }
  }

  function renderTop() {
    const p = E.curP(G);
    let hint = "";
    if (G.gameOver) hint = `🏆 ${G.players[G.winner].name} 获胜${G.superstar ? "（Superstar）" : ""}`;
    else if (!p.human) hint = `${p.name}（AI）行动中…`;
    else if (G.needsParachute) hint = "跳伞：点击中央塔或相邻格";
    else { const h = highlightSet(); hint = `你的回合：点相邻格移动${h.loot ? " · 点当前格拾取" : ""}${E.canUpload(G, p) ? " · 点中央塔上缴信标" : ""}${h.atk.size ? " · 点红框敌人攻击" : ""} · 或结束回合`; }
    $("game-info").textContent = `Arcadia · ${G.numPlayers}人 · 第${G.round}回合 · 事件${G.eventsResolved}/${G.eventTotal} — ${hint}`;
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

  function render() { renderBoard(); renderPlayers(); renderTop(); renderLog(); }

  async function onHex(key) {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    const p = E.curP(G);
    if (G.needsParachute) { if (E.parachute(G, key)) render(); return; }
    const c = G.board[key];
    const enemies = E.playersOnHex(G, c.q, c.r).filter(x => x.idx !== p.idx);
    if (enemies.length) {
      const tgt = enemies[0].idx;
      if (E.closeTargets(G, p).includes(tgt)) { E.doClose(G, tgt); render(); await animateCombat(G.lastCombat); await endTurn(); return; } // close ends turn
      if (E.rangedTargets(G, p).includes(tgt)) { E.doRanged(G, tgt, 3); render(); await animateCombat(G.lastCombat); return; }
    }
    const curKey = E.hexKey(p.pos.q, p.pos.r);
    if (key === curKey && E.canUpload(G, p)) { E.doActivate(G); render(); placeDieAnim(curKey); return; } // upload beacons at tower
    if (key === curKey && E.lootOptions(G, p).length) { E.doLoot(G, 0); render(); placeDieAnim(curKey); return; }
    if (E.legalRuns(G, p).includes(key)) { E.doRun(G, key); render(); placeDieAnim(key); return; }
  }

  async function runAI() {
    if (aiRunning) return;
    aiRunning = true;
    while (!G.gameOver && !E.curP(G).human) {
      if (G.needsParachute || E.curP(G).pos == null) { /* let AI handle in takeTurn */ }
      RL.ai.takeTurn(G);
      render();
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
    G = E.newGame({ numPlayers: parseInt($("player-count").value, 10), allAI: $("all-ai").checked });
    window.G = G;
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
  function equipCardHTML(e) {
    if (!e) return "";
    const sc = STAR_COLOR[e.star] || "#888";
    let stats = "";
    if (e.combat === "ranged") stats = `远程 · 射程${e.range[0]}-${e.range[1]} · ${e.dice}白骰` + (e.bonus ? ` · 命中bonus:${e.bonus.amount}${e.bonus.type === "injury" ? "伤" : "轻伤"}` : "");
    else if (e.combat === "close") stats = "近战";
    else if (e.armor) stats = "护甲" + (e.armor.skullReduce ? ` 骷髅-${e.armor.skullReduce}` : "") + (e.armor.smallInjuryReduce ? ` 轻伤-${e.armor.smallInjuryReduce}` : "");
    return `<div class="ecard" style="border-top-color:${sc}">
      <div class="ecard-h"><span class="ecard-name">${e.name}</span><span class="ecard-star" style="color:${sc}">${"★".repeat(e.star)}</span></div>
      <div class="ecard-meta">${SLOT_CN[e.slot] || e.slot}${stats ? " · " + stats : ""}</div>
      <div class="ecard-eff">${e.effect || ""}</div></div>`;
  }
  function dieSpan(v, cls) { return `<span class="die ${cls}">${v == null ? "" : v}</span>`; }
  function diceRowsHTML(p) {
    const def = Array.from({ length: p.defensePool }, () => dieSpan("", "def")).join("");
    const line = (p.combatLine || []).map(v => dieSpan(v, "line")).join("");
    const inj = Array.from({ length: p.injuries }, () => dieSpan("✕", "inj")).join("");
    const row = (label, html) => `<div class="cb-dice"><span class="cb-dl">${label}</span>${html || '<i class="muted">—</i>'}</div>`;
    return row(`防御区(${p.defensePool})`, def) + row(`战斗列`, line) + row(`伤害区(${p.injuries}/${E.INJURY_ZONE})`, inj);
  }
  function openCharBoard(idx) {
    const p = G.players[idx], ch = CHAR[p.character];
    let ov = $("char-overlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "char-overlay"; ov.addEventListener("click", (e) => { if (e.target === ov) closeCharBoard(); }); document.body.appendChild(ov); }
    const equippedIds = [p.equipped.head, p.equipped.torso, ...(p.equipped.hand || [])].filter(Boolean);
    const eqHTML = equippedIds.map(id => equipCardHTML(EQ[id])).join("") || '<span class="muted">无</span>';
    const packLeft = (p.backpack || []).slice();                 // backpack minus currently-equipped instances
    for (const id of equippedIds) { const i = packLeft.indexOf(id); if (i >= 0) packLeft.splice(i, 1); }
    const packHTML = packLeft.map(id => equipCardHTML(EQ[id])).join("") || '<span class="muted">空</span>';
    const f = p.fame;
    ov.innerHTML = `<div class="cb-panel" style="border-color:${p.color}">
      <button class="cb-close" title="关闭">✕</button>
      <div class="cb-top">
        <img class="cb-card" src="${ch.card}" alt="${p.name}" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cb-cardfallback',textContent:'${p.name}'}))">
        <div class="cb-info">
          <h2 style="color:${p.color}">${p.name}${p.human ? " (你)" : ""}</h2>
          ${ch.ability ? `<div class="cb-ability"><b>${ch.ability.name}</b><div>${ch.ability.text}</div></div>` : '<div class="muted">（角色能力见左侧卡牌）</div>'}
          <div class="cb-fame">名望 <b>${E.totalFame(p)}</b> ＝ 信标${f.beacon}·受伤${f.injury}·重整${f.reload}·陷阱${f.trap || 0}${p.carryingBeacons ? `　｜　携带信标 ${p.carryingBeacons}（需到中央塔上缴）` : ""}</div>
          ${diceRowsHTML(p)}
        </div>
      </div>
      <div class="cb-sec"><h3>已装备（${SLOT_CN.head}1 / ${SLOT_CN.torso}1 / ${SLOT_CN.hand}2）</h3><div class="ecards">${eqHTML}</div></div>
      <div class="cb-sec"><h3>背包（${p.backpack.length}）</h3><div class="ecards">${packHTML}</div></div>
    </div>`;
    ov.querySelector(".cb-close").addEventListener("click", closeCharBoard);
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
  function animateCombat(rep) {
    if (!rep) return Promise.resolve();
    const A = G.players[rep.a], T = G.players[rep.t];
    const groups = [
      { label: `${A.name}（攻）`, color: A.color, values: rep.shooter || [] },
      { label: `${T.name}（守）`, color: T.color, values: rep.defender || [] },
    ];
    const res = rep.reload ? `💥 ${T.name} 被迫 RELOAD！` : (rep.dealt > 0 ? `命中！造成 ${rep.dealt} 点伤` : "未造成伤害");
    return animateRoll(`${A.name} ${rep.type === "ranged" ? "🔫 远程" : "🗡 近战"} ${T.name}`, groups, res, rep.reload ? "big" : (rep.dealt > 0 ? "hit" : ""));
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

  function init() {
    $("btn-start").addEventListener("click", startGame);
    $("btn-restart").addEventListener("click", () => location.reload());
    $("btn-end").addEventListener("click", endTurn);
    $("btn-heal").addEventListener("click", async () => {
      if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
      const p = E.curP(G);
      if (E.canHeal(G, p) && E.doHeal(G)) { render(); await animateHeal(G.lastRoll); }
    });
    $("btn-barrier").addEventListener("click", () => act(p => { const e = barrierEdgeTowardEnemy(p); return e != null && E.doBuildBarrier(G, e); }));
    $("btn-hideout").addEventListener("click", () => act(p => E.canBuild(G, p) && E.doBuildHideout(G)));
    $("btn-trap").addEventListener("click", () => act(() => E.doBuildTrap(G)));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
