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
  let G = null, aiRunning = false, _overSfx = false;
  // ---- i18n: play-guidance strings (legend / banner / speed / combat / hints / meta). {name} etc. are filled by T(). ----
  const LANG = {
    zh: {
      "legend.move": "移动/可达", "legend.atk": "可攻击", "legend.you": "你的位置", "legend.loot": "✋ 当前格可拾取",
      "legend.dice": "🎲 行动骰", "legend.cost": "移动/建造/治疗各 1 骰 · 上山 2 骰", "legend.para": "跳伞：点黄色虚线格降落", "legend.nodice": "（无骰）",
      "banner.acting": "{name}（AI）行动中…", "banner.endTurn": "{name} 结束回合",
      "speed.slow": "🐢 慢速", "speed.med": "🐇 中速", "speed.fast": "⚡ 快速",
      "cb.atk": "攻", "cb.def": "守", "cb.roll": "掷骰…", "cb.compare": "逐列比对 ▶",
      "cb.skullA": "攻方多 {n}", "cb.skullD": "守方多 {n}", "cb.skullTie": "持平",
      "cb.hit": "命中！造成 {n} 点伤", "cb.nohit": "未造成伤害", "cb.reload": "💥 {name} 被迫 RELOAD！",
      "toast.hit": "命中 {n}", "toast.nohit": "未命中", "toast.reload": "💥 RELOAD！",
      "hint.win": "🏆 {name} 获胜", "hint.winTeam": "🏆 队伍 {n} 获胜（队伍名望 {fame}）", "hint.acting": "{name}（AI）行动中…",
      "hint.para": "跳伞：点击中央塔或相邻格", "hint.your": "你的回合：点相邻格移动{loot}{upload}{atk} · 或结束回合",
      "hint.loot": " · 点当前格拾取", "hint.upload": " · 点中央塔上缴信标", "hint.atk": " · 点红框敌人攻击",
      "meta.players": "人", "meta.round": "回合", "meta.events": "事件", "mode.br": "大逃杀", "mode.team": "团队赛",
      "diff.easy": "简单", "diff.medium": "普通", "diff.hard": "困难", "diff.expert": "专家",
      "setup.subtitle": "大逃杀战术骰子桌游 · 网页版", "setup.players": "玩家数量：", "setup.mode": "模式：", "setup.map": "地图：", "setup.difficulty": "难度：", "setup.lang": "语言：", "setup.allai": "全部 AI（观战）", "setup.start": "开始游戏", "setup.tutorial": "📖 新手教学（1v1）",
      "opt.br": "大逃杀（各自为战）", "opt.team2": "团队赛（2v2）", "opt.team3": "团队赛（3v3）", "opt.team2v2v2": "乱斗（2v2v2）", "opt.diffExpert": "专家（前瞻搜索·较慢）",
      "opt.p2": "2 人", "opt.p3": "3 人", "opt.p4": "4 人", "opt.p5": "5 人", "opt.p6": "6 人",
      "btn.heal": "治疗", "btn.barrier": "屏障", "btn.hideout": "藏身处", "btn.trap": "陷阱", "btn.end": "结束回合", "btn.restart": "重开",
      "pc.fame": "名望", "pc.dmg": "伤害", "pc.def": "防御区", "pc.pack": "背包", "pc.carry": "携带信标", "pc.used": "已用", "pc.line": "战斗列", "pc.onmap": "在场", "pc.waitdrop": "待跳伞", "pc.you": "(你)", "pc.team": "队{n}",
      "panel.log": "事件日志", "panel.dip": "外交 / 喊话", "panel.ach": "成就板",
      "map.arcadia": "Arcadia 阿卡迪亚 (3-4)", "map.imperial": "帝国皇朝 (2-3)", "map.transit": "转运站 · 4传送门 (4-6)", "map.ring": "环形争霸战 (4-6)", "map.metropolis": "大都会 · 迷宫 (3-4)", "map.reactor": "反应炉 · 太阳能 (4-6)",
      "cb.zlabel": "傷害區 / RELOAD", "cb.dmgzone": "伤害区", "cb.you": "你", "cb.loadout": "装备槽位", "cb.equiphint": "分配骰子前可点击更换", "cb.close": "关闭", "cb.slotEmpty": "— 空 —", "cb.slotBlocked": "双手武器占用", "cb.items": "可用道具（自由行动 · 用后弃置）", "cb.use": "使用", "cb.dismantle": "拆除",
      "act.move": "移动", "act.loot": "掠夺", "act.activate": "启动", "act.build": "建造", "act.heal": "治疗", "act.ranged": "远程", "act.melee": "近战",
      "fb.beacon": "信标", "fb.injury": "受伤", "fb.reload": "重整", "fb.trap": "陷阱", "fb.ach": "成就",
      "slot.head": "头盔", "slot.armor": "护甲", "slot.hand1": "手 1", "slot.hand2": "手 2",
      "tip.heal": "治疗：消耗 1 行动骰掷骰，恢复 1 点伤（骷髅+1）。同格有敌人时不可用。", "tip.barrier": "屏障：消耗 1 行动骰，在当前格空边放置自己的屏障（挡移动/视线，自己可穿）。同格有敌人时不可用。", "tip.hideout": "藏身处：消耗 1 行动骰，在当前格放藏身处（回合在此结束有好处、免疫毒气）。", "tip.trap": "陷阱：消耗 1 行动骰，在当前格埋隐藏陷阱，敌人踩入需猜拳。", "tip.end": "结束回合：已用骰子进战斗列，进入结束阶段并轮到下一位。", "tip.restart": "重新开始游戏。",
      "tut.title": "📖 新手教学", "tut.prev": "上一步", "tut.next": "下一步 ▶", "tut.done": "完成 ✓", "tut.exit": "结束教学",
      "ach.next": "⚡即时", "ach.most": "🏆比拼", "ach.instantTip": "⚡ 即时：下一位达成者立即获得卡片及其名望", "ach.contestTip": "🏆 比拼：游戏结束结算 · 当前领先：{leader}", "ach.unlocked": "⚡ 达成成就", "ach.famefx": "成就名望",
      "eq.ranged": "远程", "eq.range": "射程", "eq.dice": "白骰", "eq.twohand": "双手", "eq.hitbonus": "命中bonus", "eq.injury": "伤", "eq.light": "轻伤", "eq.close": "近战", "eq.armor": "护甲", "eq.skull": "骷髅", "eq.equip": "＋装备", "eq.unequip": "－卸下",
      "slotcn.head": "头部", "slotcn.torso": "躯干", "slotcn.hand": "手持", "slotcn.special": "道具",
      "terr.tower": "中央塔", "terr.jungle": "丛林", "terr.plains": "平原", "terr.mountain": "山地", "terr.village": "村庄", "terr.maze": "迷宫", "terr.solar": "太阳能阵列",
      "cs.title": "选择你的角色", "cs.subtitle": "挑一个你喜欢的角色参战 · 出场顺位随机", "cs.back": "返回", "cs.start": "开始游戏",
      "over.superstar": "（超级巨星）", "over.playAgain": "再来一局", "over.close": "查看棋盘",
    },
    en: {
      "legend.move": "Move/Reach", "legend.atk": "Attackable", "legend.you": "You", "legend.loot": "✋ Loot here",
      "legend.dice": "🎲 Action dice", "legend.cost": "Move/Build/Heal: 1 die · Mountain: 2", "legend.para": "Drop: click a yellow dashed hex", "legend.nodice": "(no dice)",
      "banner.acting": "{name} (AI) is thinking…", "banner.endTurn": "{name} ends turn",
      "speed.slow": "🐢 Slow", "speed.med": "🐇 Normal", "speed.fast": "⚡ Fast",
      "cb.atk": "ATK", "cb.def": "DEF", "cb.roll": "rolling…", "cb.compare": "compare ▶",
      "cb.skullA": "ATK +{n}", "cb.skullD": "DEF +{n}", "cb.skullTie": "tie",
      "cb.hit": "Hit! {n} damage", "cb.nohit": "No damage", "cb.reload": "💥 {name} forced to RELOAD!",
      "toast.hit": "Hit {n}", "toast.nohit": "Missed", "toast.reload": "💥 RELOAD!",
      "hint.win": "🏆 {name} wins", "hint.winTeam": "🏆 Team {n} wins (team fame {fame})", "hint.acting": "{name} (AI) is thinking…",
      "hint.para": "Drop: click the central tower or an adjacent hex", "hint.your": "Your turn: click an adjacent hex to move{loot}{upload}{atk} · or end turn",
      "hint.loot": " · click your hex to loot", "hint.upload": " · click the tower to turn in beacons", "hint.atk": " · click a red-framed enemy to attack",
      "meta.players": "p", "meta.round": "Round", "meta.events": "Events", "mode.br": "Battle Royale", "mode.team": "Team",
      "diff.easy": "Easy", "diff.medium": "Normal", "diff.hard": "Hard", "diff.expert": "Expert",
      "setup.subtitle": "Battle-royale tactical dice game · web port", "setup.players": "Players:", "setup.mode": "Mode:", "setup.map": "Map:", "setup.difficulty": "Difficulty:", "setup.lang": "Language:", "setup.allai": "All AI (spectate)", "setup.start": "Start game", "setup.tutorial": "📖 Tutorial (1v1)",
      "opt.br": "Battle Royale (free-for-all)", "opt.team2": "Team (2v2)", "opt.team3": "Team (3v3)", "opt.team2v2v2": "Rumble (2v2v2)", "opt.diffExpert": "Expert (look-ahead · slower)",
      "opt.p2": "2 players", "opt.p3": "3 players", "opt.p4": "4 players", "opt.p5": "5 players", "opt.p6": "6 players",
      "btn.heal": "Heal", "btn.barrier": "Barrier", "btn.hideout": "Hideout", "btn.trap": "Trap", "btn.end": "End turn", "btn.restart": "Restart",
      "pc.fame": "Fame", "pc.dmg": "Dmg", "pc.def": "Defense", "pc.pack": "Pack", "pc.carry": "Beacons", "pc.used": "used", "pc.line": "Combat", "pc.onmap": "on map", "pc.waitdrop": "to drop", "pc.you": "(you)", "pc.team": "T{n}",
      "panel.log": "Event log", "panel.dip": "Diplomacy / Taunts", "panel.ach": "Achievements",
      "map.arcadia": "Arcadia (3-4)", "map.imperial": "Imperial Dynasty (2-3)", "map.transit": "Transit Hub · 4 portals (4-6)", "map.ring": "Ring Arena (4-6)", "map.metropolis": "Metropolis · Maze (3-4)", "map.reactor": "Reactor · Solar (4-6)",
      "cb.zlabel": "Damage / RELOAD", "cb.dmgzone": "Damage", "cb.you": "you", "cb.loadout": "Loadout", "cb.equiphint": "click to swap before assigning dice", "cb.close": "Close", "cb.slotEmpty": "— empty —", "cb.slotBlocked": "two-handed weapon", "cb.items": "Items (free action · discard after use)", "cb.use": "Use", "cb.dismantle": "Dismantle",
      "act.move": "Move", "act.loot": "Loot", "act.activate": "Activate", "act.build": "Build", "act.heal": "Heal", "act.ranged": "Ranged", "act.melee": "Melee",
      "fb.beacon": "beacon", "fb.injury": "injury", "fb.reload": "reload", "fb.trap": "trap", "fb.ach": "ach",
      "slot.head": "Helmet", "slot.armor": "Armor", "slot.hand1": "Hand 1", "slot.hand2": "Hand 2",
      "tip.heal": "Heal: spend 1 action die to roll and recover 1 damage (skull +1). Unavailable with an enemy on your hex.", "tip.barrier": "Barrier: spend 1 action die to place your barrier on an empty edge (blocks move/LOS, you may pass). Not with an enemy here.", "tip.hideout": "Hideout: spend 1 action die to place a hideout on your hex (ending your turn here has perks; immune to toxin).", "tip.trap": "Trap: spend 1 action die to bury a hidden trap; an enemy stepping in plays rock-paper-scissors.", "tip.end": "End turn: unused dice join your combat line, then the End Phase resolves and play passes on.", "tip.restart": "Restart the game.",
      "tut.title": "📖 Tutorial", "tut.prev": "Back", "tut.next": "Next ▶", "tut.done": "Done ✓", "tut.exit": "Exit tutorial",
      "ach.next": "⚡ Instant", "ach.most": "🏆 Contest", "ach.instantTip": "⚡ Instant: the next player to unlock it immediately gains the card and its fame", "ach.contestTip": "🏆 Contest: scored at game end · leader: {leader}", "ach.unlocked": "⚡ Achievement unlocked", "ach.famefx": "achievement fame",
      "eq.ranged": "Ranged", "eq.range": "Rng ", "eq.dice": " white", "eq.twohand": "2-handed", "eq.hitbonus": "hit bonus", "eq.injury": "injury", "eq.light": "light", "eq.close": "Melee", "eq.armor": "Armor", "eq.skull": "skull", "eq.equip": "＋Equip", "eq.unequip": "－Unequip",
      "slotcn.head": "Head", "slotcn.torso": "Torso", "slotcn.hand": "Hand", "slotcn.special": "Item",
      "terr.tower": "Tower", "terr.jungle": "Jungle", "terr.plains": "Plains", "terr.mountain": "Mountain", "terr.village": "Village", "terr.maze": "Maze", "terr.solar": "Solar Array",
      "cs.title": "Choose your character", "cs.subtitle": "Pick a character you like — turn order is random", "cs.back": "Back", "cs.start": "Start game",
      "over.superstar": "(Superstar)", "over.playAgain": "Play again", "over.close": "View board",
    },
    fr: {
      "legend.move": "Déplacer/Portée", "legend.atk": "Attaquable", "legend.you": "Vous", "legend.loot": "✋ Ramasser ici",
      "legend.dice": "🎲 Dés d'action", "legend.cost": "Déplacer/Construire/Soigner : 1 dé · Montagne : 2", "legend.para": "Saut : cliquez une case en pointillés jaunes", "legend.nodice": "(aucun dé)",
      "banner.acting": "{name} (IA) réfléchit…", "banner.endTurn": "{name} termine son tour",
      "speed.slow": "🐢 Lent", "speed.med": "🐇 Normal", "speed.fast": "⚡ Rapide",
      "cb.atk": "ATT", "cb.def": "DÉF", "cb.roll": "lancer…", "cb.compare": "comparer ▶",
      "cb.skullA": "ATT +{n}", "cb.skullD": "DÉF +{n}", "cb.skullTie": "égalité",
      "cb.hit": "Touché ! {n} dégâts", "cb.nohit": "Aucun dégât", "cb.reload": "💥 {name} forcé de RELOAD !",
      "toast.hit": "Touché {n}", "toast.nohit": "Manqué", "toast.reload": "💥 RELOAD !",
      "hint.win": "🏆 {name} gagne", "hint.winTeam": "🏆 Équipe {n} gagne (renommée {fame})", "hint.acting": "{name} (IA) réfléchit…",
      "hint.para": "Saut : cliquez la tour centrale ou une case adjacente", "hint.your": "Votre tour : cliquez une case adjacente pour vous déplacer{loot}{upload}{atk} · ou terminez",
      "hint.loot": " · cliquez votre case pour ramasser", "hint.upload": " · cliquez la tour pour rendre les balises", "hint.atk": " · cliquez un ennemi encadré en rouge",
      "meta.players": "j", "meta.round": "Tour", "meta.events": "Événements", "mode.br": "Battle Royale", "mode.team": "Équipe",
      "diff.easy": "Facile", "diff.medium": "Normal", "diff.hard": "Difficile", "diff.expert": "Expert",
      "setup.subtitle": "Jeu de dés tactique battle-royale · portage web", "setup.players": "Joueurs :", "setup.mode": "Mode :", "setup.map": "Carte :", "setup.difficulty": "Difficulté :", "setup.lang": "Langue :", "setup.allai": "Tout IA (spectateur)", "setup.start": "Démarrer", "setup.tutorial": "📖 Tutoriel (1c1)",
      "opt.br": "Battle Royale (chacun pour soi)", "opt.team2": "Équipe (2c2)", "opt.team3": "Équipe (3c3)", "opt.team2v2v2": "Mêlée (2c2c2)", "opt.diffExpert": "Expert (recherche · plus lent)",
      "opt.p2": "2 joueurs", "opt.p3": "3 joueurs", "opt.p4": "4 joueurs", "opt.p5": "5 joueurs", "opt.p6": "6 joueurs",
      "btn.heal": "Soigner", "btn.barrier": "Barrière", "btn.hideout": "Cachette", "btn.trap": "Piège", "btn.end": "Fin du tour", "btn.restart": "Recommencer",
      "pc.fame": "Renommée", "pc.dmg": "Dégâts", "pc.def": "Défense", "pc.pack": "Sac", "pc.carry": "Balises", "pc.used": "utilisé", "pc.line": "Combat", "pc.onmap": "en jeu", "pc.waitdrop": "à larguer", "pc.you": "(vous)", "pc.team": "É{n}",
      "panel.log": "Journal", "panel.dip": "Diplomatie / Provoc.", "panel.ach": "Succès",
      "map.arcadia": "Arcadia (3-4)", "map.imperial": "Dynastie impériale (2-3)", "map.transit": "Hub de transit · 4 portails (4-6)", "map.ring": "Arène circulaire (4-6)", "map.metropolis": "Métropole · Labyrinthe (3-4)", "map.reactor": "Réacteur · Solaire (4-6)",
      "cb.zlabel": "Dégâts / RELOAD", "cb.dmgzone": "Dégâts", "cb.you": "vous", "cb.loadout": "Équipement", "cb.equiphint": "cliquez pour changer avant d'assigner les dés", "cb.close": "Fermer", "cb.slotEmpty": "— vide —", "cb.slotBlocked": "arme à 2 mains", "cb.items": "Objets (action gratuite · jeté après usage)", "cb.use": "Utiliser", "cb.dismantle": "Démanteler",
      "act.move": "Déplacer", "act.loot": "Piller", "act.activate": "Activer", "act.build": "Construire", "act.heal": "Soigner", "act.ranged": "Distance", "act.melee": "Mêlée",
      "fb.beacon": "balise", "fb.injury": "blessure", "fb.reload": "reload", "fb.trap": "piège", "fb.ach": "succès",
      "slot.head": "Casque", "slot.armor": "Armure", "slot.hand1": "Main 1", "slot.hand2": "Main 2",
      "tip.heal": "Soigner : dépensez 1 dé d'action pour lancer et récupérer 1 dégât (crâne +1). Indisponible si un ennemi est sur votre case.", "tip.barrier": "Barrière : dépensez 1 dé d'action pour poser votre barrière sur un bord vide (bloque déplacement/vue, vous passez). Pas si un ennemi est là.", "tip.hideout": "Cachette : dépensez 1 dé d'action pour poser une cachette sur votre case (avantages en y finissant ; immunisé au gaz).", "tip.trap": "Piège : dépensez 1 dé d'action pour enterrer un piège ; un ennemi qui marche dessus joue à pierre-feuille-ciseaux.", "tip.end": "Fin du tour : les dés inutilisés rejoignent la ligne de combat, puis la phase de fin se résout.", "tip.restart": "Recommencer la partie.",
      "tut.title": "📖 Tutoriel", "tut.prev": "Précédent", "tut.next": "Suivant ▶", "tut.done": "Terminé ✓", "tut.exit": "Quitter",
      "ach.next": "⚡ Immédiat", "ach.most": "🏆 Concours", "ach.instantTip": "⚡ Immédiat : le prochain joueur qui le réussit gagne aussitôt la carte et sa renommée", "ach.contestTip": "🏆 Concours : décompté en fin de partie · en tête : {leader}", "ach.unlocked": "⚡ Succès débloqué", "ach.famefx": "renommée de succès",
      "eq.ranged": "Distance", "eq.range": "Port. ", "eq.dice": " dés", "eq.twohand": "2 mains", "eq.hitbonus": "bonus", "eq.injury": "blessure", "eq.light": "légère", "eq.close": "Mêlée", "eq.armor": "Armure", "eq.skull": "crâne", "eq.equip": "＋Équiper", "eq.unequip": "－Retirer",
      "slotcn.head": "Tête", "slotcn.torso": "Torse", "slotcn.hand": "Main", "slotcn.special": "Objet",
      "terr.tower": "Tour", "terr.jungle": "Jungle", "terr.plains": "Plaine", "terr.mountain": "Montagne", "terr.village": "Village", "terr.maze": "Labyrinthe", "terr.solar": "Panneaux solaires",
      "cs.title": "Choisissez votre personnage", "cs.subtitle": "Choisissez un personnage qui vous plaît — l'ordre de jeu est aléatoire", "cs.back": "Retour", "cs.start": "Démarrer",
      "over.superstar": "(Superstar)", "over.playAgain": "Rejouer", "over.close": "Voir le plateau",
    },
    es: {
      "legend.move": "Mover/Alcance", "legend.atk": "Atacable", "legend.you": "Tú", "legend.loot": "✋ Saquear aquí",
      "legend.dice": "🎲 Dados de acción", "legend.cost": "Mover/Construir/Curar: 1 dado · Montaña: 2", "legend.para": "Salto: clic en casilla amarilla punteada", "legend.nodice": "(sin dados)",
      "banner.acting": "{name} (IA) está pensando…", "banner.endTurn": "{name} termina el turno",
      "speed.slow": "🐢 Lento", "speed.med": "🐇 Normal", "speed.fast": "⚡ Rápido",
      "cb.atk": "ATQ", "cb.def": "DEF", "cb.roll": "tirando…", "cb.compare": "comparar ▶",
      "cb.skullA": "ATQ +{n}", "cb.skullD": "DEF +{n}", "cb.skullTie": "empate",
      "cb.hit": "¡Impacto! {n} de daño", "cb.nohit": "Sin daño", "cb.reload": "💥 ¡{name} forzado a RELOAD!",
      "toast.hit": "Impacto {n}", "toast.nohit": "Fallo", "toast.reload": "💥 ¡RELOAD!",
      "hint.win": "🏆 {name} gana", "hint.winTeam": "🏆 Equipo {n} gana (fama {fame})", "hint.acting": "{name} (IA) está pensando…",
      "hint.para": "Salto: clic en la torre central o una casilla adyacente", "hint.your": "Tu turno: clic en una casilla adyacente para mover{loot}{upload}{atk} · o termina",
      "hint.loot": " · clic en tu casilla para saquear", "hint.upload": " · clic en la torre para entregar balizas", "hint.atk": " · clic en un enemigo con marco rojo",
      "meta.players": "j", "meta.round": "Ronda", "meta.events": "Eventos", "mode.br": "Battle Royale", "mode.team": "Equipo",
      "diff.easy": "Fácil", "diff.medium": "Normal", "diff.hard": "Difícil", "diff.expert": "Experto",
      "setup.subtitle": "Juego de dados táctico battle-royale · versión web", "setup.players": "Jugadores:", "setup.mode": "Modo:", "setup.map": "Mapa:", "setup.difficulty": "Dificultad:", "setup.lang": "Idioma:", "setup.allai": "Todo IA (espectar)", "setup.start": "Empezar", "setup.tutorial": "📖 Tutorial (1c1)",
      "opt.br": "Battle Royale (todos contra todos)", "opt.team2": "Equipo (2c2)", "opt.team3": "Equipo (3c3)", "opt.team2v2v2": "Refriega (2c2c2)", "opt.diffExpert": "Experto (búsqueda · más lento)",
      "opt.p2": "2 jugadores", "opt.p3": "3 jugadores", "opt.p4": "4 jugadores", "opt.p5": "5 jugadores", "opt.p6": "6 jugadores",
      "btn.heal": "Curar", "btn.barrier": "Barrera", "btn.hideout": "Refugio", "btn.trap": "Trampa", "btn.end": "Terminar turno", "btn.restart": "Reiniciar",
      "pc.fame": "Fama", "pc.dmg": "Daño", "pc.def": "Defensa", "pc.pack": "Mochila", "pc.carry": "Balizas", "pc.used": "usado", "pc.line": "Combate", "pc.onmap": "en juego", "pc.waitdrop": "por saltar", "pc.you": "(tú)", "pc.team": "E{n}",
      "panel.log": "Registro", "panel.dip": "Diplomacia / Provoc.", "panel.ach": "Logros",
      "map.arcadia": "Arcadia (3-4)", "map.imperial": "Dinastía imperial (2-3)", "map.transit": "Centro de tránsito · 4 portales (4-6)", "map.ring": "Arena circular (4-6)", "map.metropolis": "Metrópolis · Laberinto (3-4)", "map.reactor": "Reactor · Solar (4-6)",
      "cb.zlabel": "Daño / RELOAD", "cb.dmgzone": "Daño", "cb.you": "tú", "cb.loadout": "Equipo", "cb.equiphint": "clic para cambiar antes de asignar dados", "cb.close": "Cerrar", "cb.slotEmpty": "— vacío —", "cb.slotBlocked": "arma a 2 manos", "cb.items": "Objetos (acción libre · se descarta tras usar)", "cb.use": "Usar", "cb.dismantle": "Desmantelar",
      "act.move": "Mover", "act.loot": "Saquear", "act.activate": "Activar", "act.build": "Construir", "act.heal": "Curar", "act.ranged": "Distancia", "act.melee": "Cuerpo a cuerpo",
      "fb.beacon": "baliza", "fb.injury": "herida", "fb.reload": "reload", "fb.trap": "trampa", "fb.ach": "logro",
      "slot.head": "Casco", "slot.armor": "Armadura", "slot.hand1": "Mano 1", "slot.hand2": "Mano 2",
      "tip.heal": "Curar: gasta 1 dado de acción para tirar y recuperar 1 de daño (calavera +1). No disponible con un enemigo en tu casilla.", "tip.barrier": "Barrera: gasta 1 dado de acción para colocar tu barrera en un borde vacío (bloquea movimiento/visión, tú pasas). No con un enemigo aquí.", "tip.hideout": "Refugio: gasta 1 dado de acción para colocar un refugio en tu casilla (ventajas al terminar aquí; inmune al gas).", "tip.trap": "Trampa: gasta 1 dado de acción para enterrar una trampa oculta; un enemigo que entre juega piedra-papel-tijera.", "tip.end": "Terminar turno: los dados sin usar se unen a tu línea de combate y se resuelve la fase final.", "tip.restart": "Reiniciar el juego.",
      "tut.title": "📖 Tutorial", "tut.prev": "Atrás", "tut.next": "Siguiente ▶", "tut.done": "Listo ✓", "tut.exit": "Salir",
      "ach.next": "⚡ Instantáneo", "ach.most": "🏆 Concurso", "ach.instantTip": "⚡ Instantáneo: el próximo jugador que lo logre obtiene al instante la carta y su fama", "ach.contestTip": "🏆 Concurso: se calcula al final · líder: {leader}", "ach.unlocked": "⚡ Logro desbloqueado", "ach.famefx": "fama de logro",
      "eq.ranged": "Distancia", "eq.range": "Alc. ", "eq.dice": " dados", "eq.twohand": "2 manos", "eq.hitbonus": "bono", "eq.injury": "daño", "eq.light": "leve", "eq.close": "Cuerpo", "eq.armor": "Armadura", "eq.skull": "calavera", "eq.equip": "＋Equipar", "eq.unequip": "－Quitar",
      "slotcn.head": "Cabeza", "slotcn.torso": "Torso", "slotcn.hand": "Mano", "slotcn.special": "Objeto",
      "terr.tower": "Torre", "terr.jungle": "Jungla", "terr.plains": "Llanura", "terr.mountain": "Montaña", "terr.village": "Pueblo", "terr.maze": "Laberinto", "terr.solar": "Panel solar",
      "cs.title": "Elige tu personaje", "cs.subtitle": "Elige un personaje que te guste — el orden de turno es aleatorio", "cs.back": "Atrás", "cs.start": "Empezar",
      "over.superstar": "(Superstar)", "over.playAgain": "Jugar de nuevo", "over.close": "Ver el tablero",
    },
  };
  let lang = (typeof localStorage !== "undefined" && localStorage.getItem("rl-lang")) || "zh";
  function T(key, vars) {
    const d = LANG[lang] || LANG.zh;
    let s = d[key] != null ? d[key] : (LANG.zh[key] != null ? LANG.zh[key] : key);
    if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
    return s;
  }
  // content translation (personas / achievements / tutorial / FR-ES of abilities+equipment, from js/i18n.js).
  // Returns the translation for the current language if present, else the source value (fallback).
  function TC(key, fallback) {
    const C = RL.LANG_CONTENT && RL.LANG_CONTENT[lang];
    return (C && C[key] != null) ? C[key] : fallback;
  }
  // achievement display name: Chinese uses cn (cn·name in tooltips); other languages use the English name
  function achName(a, full) { return lang === "zh" ? (full ? `${a.cn} · ${a.name}` : a.cn) : a.name; }
  // format one structured engine-log entry per language. Plain strings (barks) pass through; objects
  // {s,k,p} resolve via RL.LOG_FMT[lang][k] with {param} interpolation, falling back to the source string s.
  // a persona/chatter bark, localized via RL.BARK[lang][ref] (falls back to the source line)
  function barkTr(ref, src) { const b = RL.BARK && RL.BARK[lang]; return (b && ref && b[ref]) || src; }
  function logLine(e) {
    if (typeof e === "string") return e;
    if (!e || !e.k) return (e && e.s) || "";
    if (e.k === "bark") return `💬 ${e.p.who}：${barkTr(e.p.ref, e.p.line)}`;
    const fmt = RL.LOG_FMT && RL.LOG_FMT[lang] && RL.LOG_FMT[lang][e.k];
    if (!fmt) return e.s;                                   // no template for this language → source (zh)
    const p = Object.assign({}, e.p);
    if (p.terrain != null) p.terrain = T("terr." + p.terrain);
    if (e.k === "event" && p.id != null) p.name = TC("event." + p.id, p.name);
    if (p.achId != null) p.ach = ACH[p.achId] ? achName(ACH[p.achId]) : p.achId;
    if (p.kind != null) p.kind = p.kind === "trap" ? T("btn.trap") : p.kind === "wall" ? T("btn.barrier") : T("btn.hideout");
    let s = fmt; for (const k in p) s = s.split("{" + k + "}").join(p[k]);
    return s;
  }
  const SFX = (n) => { try { if (RL.sfx && RL.sfx[n]) RL.sfx[n](); } catch (e) { } };   // play a procedural sound (no-op if muted / unavailable)
  function shake(px) {   // brief screen-shake on the board (impact feedback)
    const el = $("board-wrap"); if (!el) return;
    const t0 = performance.now(), dur = 280;
    (function step(t) { const k = (t - t0) / dur; if (k >= 1) { el.style.transform = ""; return; } const a = px * (1 - k); el.style.transform = `translate(${(Math.random() * 2 - 1) * a}px,${(Math.random() * 2 - 1) * a}px)`; requestAnimationFrame(step); })(performance.now());
  }
  function flashHit(color) {   // a quick full-screen tint that fades out
    let f = $("hit-flash"); if (!f) { f = document.createElement("div"); f.id = "hit-flash"; document.body.appendChild(f); }
    f.style.background = color || "rgba(255,90,60,.28)"; f.style.transition = "none"; f.style.opacity = "0.85"; void f.offsetWidth; f.style.transition = "opacity .4s"; f.style.opacity = "0";
  }

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

  const TERRAIN_GLYPH = { tower: "🗼", jungle: "🌲", plains: "🌾", mountain: "⛰", village: "🏠", maze: "▦", solar: "☀" };
  function svgText(x, y, s, size, fill, opacity) {
    const t = svgEl("text", { x, y, "text-anchor": "middle", "font-size": size, fill: fill || "#fff", "pointer-events": "none" });
    if (opacity != null) t.setAttribute("opacity", opacity);
    t.textContent = s; return t;
  }
  // Crisp procedural vector terrain art (no image files) — drawn as the bottom layer of each hex.
  function terrainDecal(svg, terrain, x, y) {
    const g = svgEl("g", { opacity: 0.62, "pointer-events": "none" });
    const add = (tag, a) => g.appendChild(svgEl(tag, a));
    switch (terrain) {
      case "tower": { // control-tower mast + cabin + beacon light
        add("polygon", { points: `${x - 8},${y + 22} ${x - 3.5},${y - 13} ${x + 3.5},${y - 13} ${x + 8},${y + 22}`, fill: "#cfdcec" });
        add("line", { x1: x - 6, y1: y + 11, x2: x + 6, y2: y + 1, stroke: "#9db0c8", "stroke-width": 1.4 });
        add("line", { x1: x + 6, y1: y + 11, x2: x - 6, y2: y + 1, stroke: "#9db0c8", "stroke-width": 1.4 });
        add("rect", { x: x - 12, y: y - 23, width: 24, height: 11, rx: 2, fill: "#aebfd4", stroke: "#7e92ad", "stroke-width": 1 });
        add("circle", { cx: x, cy: y - 27, r: 3.4, fill: "#f4d03f", stroke: "#9a7a10", "stroke-width": 0.8 });
        break;
      }
      case "jungle": { // three stacked-triangle pines
        const pine = (cx, cy, s) => {
          add("rect", { x: cx - s * 0.12, y: cy + s * 0.5, width: s * 0.24, height: s * 0.55, fill: "#5e3a1e" });
          add("polygon", { points: `${cx},${cy - s} ${cx - s * 0.78},${cy + s * 0.55} ${cx + s * 0.78},${cy + s * 0.55}`, fill: "#14532a" });
          add("polygon", { points: `${cx},${cy - s * 0.5} ${cx - s * 0.64},${cy + s * 0.72} ${cx + s * 0.64},${cy + s * 0.72}`, fill: "#2f9e54" });
        };
        pine(x - 14, y - 1, 11); pine(x + 13, y + 3, 13); pine(x - 1, y - 12, 9);
        break;
      }
      case "plains": { // wheat stalks fanning up with seed heads
        for (const dx of [-14, -5, 4, 13]) {
          add("path", { d: `M ${x + dx},${y + 16} Q ${x + dx + 2},${y + 2} ${x + dx + 5},${y - 12}`, fill: "none", stroke: "#7e9a3a", "stroke-width": 1.8, "stroke-linecap": "round" });
          add("ellipse", { cx: x + dx + 5, cy: y - 13, rx: 2.4, ry: 4.4, fill: "#e6cf52", transform: `rotate(18 ${x + dx + 5} ${y - 13})` });
        }
        break;
      }
      case "mountain": { // two peaks with snow caps
        add("polygon", { points: `${x - 22},${y + 18} ${x - 5},${y - 14} ${x + 12},${y + 18}`, fill: "#565a61" });
        add("polygon", { points: `${x - 5},${y - 14} ${x - 11},${y - 3} ${x + 1},${y - 3}`, fill: "#eef3f8" });
        add("polygon", { points: `${x - 2},${y + 18} ${x + 12},${y - 7} ${x + 23},${y + 18}`, fill: "#6f747c" });
        add("polygon", { points: `${x + 12},${y - 7} ${x + 7},${y + 1} ${x + 17},${y + 1}`, fill: "#eef3f8" });
        break;
      }
      case "village": { // a small house with roof + door
        add("rect", { x: x - 13, y: y - 4, width: 26, height: 22, fill: "#e6d2a8", stroke: "#8a6a3a", "stroke-width": 1 });
        add("polygon", { points: `${x - 16},${y - 3} ${x},${y - 18} ${x + 16},${y - 3}`, fill: "#8a4a28", stroke: "#5e3118", "stroke-width": 1 });
        add("rect", { x: x - 4, y: y + 7, width: 8, height: 11, fill: "#6e4a26" });
        add("rect", { x: x + 5, y: y + 2, width: 6, height: 6, fill: "#9ec6e0", stroke: "#6e4a26", "stroke-width": 0.8 });
        break;
      }
      case "maze": { // concentric labyrinth lines with a gap
        add("rect", { x: x - 19, y: y - 17, width: 38, height: 34, fill: "none", stroke: "#cbb4e6", "stroke-width": 2 });
        add("rect", { x: x - 12, y: y - 10, width: 24, height: 20, fill: "none", stroke: "#cbb4e6", "stroke-width": 2 });
        add("rect", { x: x - 5, y: y - 3, width: 10, height: 6, fill: "none", stroke: "#cbb4e6", "stroke-width": 2 });
        add("line", { x1: x, y1: y - 17, x2: x, y2: y - 10, stroke: "#6a4f8a", "stroke-width": 2.6 }); // entrance gap
        break;
      }
      case "solar": { // sun disc with radiating rays
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 4 * i, r0 = 11, r1 = 19;
          add("line", { x1: x + Math.cos(a) * r0, y1: y + Math.sin(a) * r0, x2: x + Math.cos(a) * r1, y2: y + Math.sin(a) * r1, stroke: "#caa017", "stroke-width": 2, "stroke-linecap": "round" });
        }
        add("circle", { cx: x, cy: y, r: 9, fill: "#fff1b0", stroke: "#caa017", "stroke-width": 1.5 });
        break;
      }
      default: return;
    }
    svg.appendChild(g);
  }

  // dark or light "ink" for an icon drawn on top of a given fill color
  function inkFor(hex) {
    const c = (hex || "#888").replace("#", "");
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? "#0c0e12" : "#f6f8fc";
  }
  // Original, thematic per-character emblem (no copyrighted art) — coords are fractions of `s` around (cx,cy).
  function drawEmblem(add, id, cx, cy, s, ink) {
    const SW = Math.max(1.1, s * 0.16);
    const X = f => cx + f * s, Y = f => cy + f * s;
    const line = (x1, y1, x2, y2, w) => add("line", { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), stroke: ink, "stroke-width": w || SW, "stroke-linecap": "round" });
    const circ = (x, y, r, filled) => add("circle", { cx: X(x), cy: Y(y), r: r * s, fill: filled ? ink : "none", stroke: ink, "stroke-width": SW });
    const dot = (x, y, r) => add("circle", { cx: X(x), cy: Y(y), r: r * s, fill: ink });
    const poly = (pts, filled) => add("polygon", { points: pts.map(p => X(p[0]) + "," + Y(p[1])).join(" "), fill: filled ? ink : "none", stroke: ink, "stroke-width": SW, "stroke-linejoin": "round", "stroke-linecap": "round" });
    const rrect = (x, y, w, h, filled) => add("rect", { x: X(x), y: Y(y), width: w * s, height: h * s, rx: s * 0.1, fill: filled ? ink : "none", stroke: ink, "stroke-width": SW });
    switch (id) {
      case "betty": circ(0, 0.18, 0.45, true); line(0.30, -0.14, 0.50, -0.50); dot(0.55, -0.56, 0.12); break;            // bomb
      case "blitz": poly([[0.10, -0.60], [-0.32, 0.06], [-0.04, 0.06], [-0.18, 0.60], [0.34, -0.12], [0.04, -0.12]], true); break; // lightning
      case "butcher": poly([[-0.50, -0.45], [0.15, -0.50], [0.18, 0.05], [-0.50, 0.18]], true); line(0.18, -0.22, 0.55, -0.30, SW * 1.7); break; // cleaver
      case "duke": poly([[-0.55, 0.30], [0.42, -0.34], [0.52, -0.18], [-0.45, 0.46]], true); poly([[-0.55, 0.30], [-0.45, 0.46], [-0.66, 0.52], [-0.72, 0.36]], true); break; // rifle
      case "sora": poly([[-0.45, 0.14], [0, -0.28], [0.45, 0.14]], false); poly([[-0.45, 0.50], [0, 0.08], [0.45, 0.50]], false); break; // speed chevrons
      case "dax": poly([[0, -0.55], [0.45, -0.34], [0.45, 0.06], [0, 0.56], [-0.45, 0.06], [-0.45, -0.34]], false); line(-0.20, 0.02, -0.04, 0.22); line(-0.04, 0.22, 0.26, -0.24); break; // shield + check
      case "korat": rrect(-0.45, -0.12, 0.90, 0.58, false); rrect(-0.52, -0.30, 1.04, 0.20, false); line(0, -0.30, 0, 0.46); circ(-0.13, -0.40, 0.10, false); circ(0.13, -0.40, 0.10, false); break; // gift box
      case "emmet": rrect(-0.28, -0.52, 0.58, 0.22, true); line(0.02, -0.30, -0.14, 0.55, SW * 1.5); break; // hammer
      case "echo": add("path", { d: `M ${X(-0.55)} ${Y(0)} Q ${X(0)} ${Y(-0.42)} ${X(0.55)} ${Y(0)} Q ${X(0)} ${Y(0.42)} ${X(-0.55)} ${Y(0)} Z`, fill: "none", stroke: ink, "stroke-width": SW, "stroke-linejoin": "round" }); dot(0, 0, 0.17); break; // eye
      case "diana": circ(0, 0, 0.44, false); line(0, -0.62, 0, -0.26); line(0, 0.26, 0, 0.62); line(-0.62, 0, -0.26, 0); line(0.26, 0, 0.62, 0); dot(0, 0, 0.08); break; // crosshair
      case "kaiser": poly([[-0.50, 0.30], [-0.50, -0.28], [-0.20, 0.04], [0, -0.42], [0.20, 0.04], [0.50, -0.28], [0.50, 0.30]], true); rrect(-0.50, 0.28, 1.0, 0.16, true); break; // crown
      case "codybuzz": dot(0, 0, 0.18); line(-0.40, -0.40, 0.40, 0.40); line(0.40, -0.40, -0.40, 0.40); circ(-0.45, -0.45, 0.15, false); circ(0.45, -0.45, 0.15, false); circ(-0.45, 0.45, 0.15, false); circ(0.45, 0.45, 0.15, false); break; // drone
      default: { // generic: a target ring (covers any future character)
        circ(0, 0, 0.40, false); dot(0, 0, 0.12);
      }
    }
  }
  // a colored game-piece standee (board) with the character emblem
  function drawMini(svg, p, ch, cx, cy, active) {
    const g = svgEl("g", { "pointer-events": "none" });
    const add = (tag, a) => { const e = svgEl(tag, a); g.appendChild(e); return e; };
    const hw = 10.5, top = cy - 16, mid = cy - 8, bot = cy + 12;
    const body = `M ${cx - hw} ${bot} L ${cx - hw} ${mid} Q ${cx - hw} ${top} ${cx} ${top} Q ${cx + hw} ${top} ${cx + hw} ${mid} L ${cx + hw} ${bot} Z`;
    add("ellipse", { cx, cy: cy + 13, rx: 11, ry: 3.4, fill: "#000", "fill-opacity": 0.32 });           // ground shadow
    if (active) add("path", { d: body, fill: "none", stroke: "#fff", "stroke-width": 5, "stroke-linejoin": "round" }); // active halo
    add("path", { d: body, fill: p.color, stroke: "#0c0e12", "stroke-width": 1.6, "stroke-linejoin": "round" });       // standee
    drawEmblem(add, p.character, cx, cy - 3, 7, inkFor(p.color));                                        // emblem
    svg.appendChild(g);
  }
  // framed emblem badge for HTML panels (returns an <svg> markup string)
  function emblemSVG(p, ch, px) {
    const root = svgEl("svg", { viewBox: "0 0 100 100", width: px, height: px, class: "emblem" });
    const add = (tag, a) => { const e = svgEl(tag, a); root.appendChild(e); return e; };
    add("rect", { x: 5, y: 5, width: 90, height: 90, rx: 16, fill: p.color, "fill-opacity": 0.16, stroke: p.color, "stroke-width": 2.5 });
    add("circle", { cx: 50, cy: 54, r: 30, fill: p.color, stroke: "#0c0e12", "stroke-width": 1.5 });
    drawEmblem(add, p.character, 50, 52, 24, inkFor(p.color));
    return root.outerHTML;
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
      terrainDecal(svg, c.terrain, x, y);   // crisp procedural terrain motif (no art files)
      const poly = svgEl("polygon", { points: pts, fill: "transparent", class: "hex-poly" }); // interactive + highlight
      if (hl.atk.has(key)) { poly.setAttribute("stroke", "#e3424b"); poly.setAttribute("stroke-width", "4"); }
      else if (hl.para.has(key)) { poly.setAttribute("stroke", "#f4d03f"); poly.setAttribute("stroke-width", "4"); poly.setAttribute("stroke-dasharray", "6 4"); }
      else if (hl.run.has(key)) { poly.setAttribute("stroke", "#5fd0e0"); poly.setAttribute("stroke-width", "3"); }
      else if (key === curKey) { poly.setAttribute("stroke", "#fff"); poly.setAttribute("stroke-width", "3"); }
      poly.addEventListener("click", () => onHex(key));
      bindTip(poly, () => hexTip(c));
      svg.appendChild(poly);
      // map tokens — drawn procedurally (no image assets): toxin tint, portal rings, dome, beacon, supply box
      if (c.toxin) { svg.appendChild(svgEl("polygon", { points: pts, fill: "#6a4f8a", opacity: 0.30, "pointer-events": "none" })); svg.appendChild(svgText(x + HEX * 0.5, y - HEX * 0.42, "☣", 15, "#caa6ff", 0.95)); }
      if (c.portal) for (let r = 8; r <= 20; r += 6) svg.appendChild(svgEl("circle", { cx: x, cy: y, r, fill: "none", stroke: "#5fd0e0", "stroke-width": 2.5, opacity: 0.85, "pointer-events": "none" }));
      if (c.dome) svg.appendChild(svgEl("path", { d: `M ${x - 26} ${y + 6} A 26 26 0 0 1 ${x + 26} ${y + 6} Z`, fill: "#7fd0ff", "fill-opacity": 0.16, stroke: "#7fd0ff", "stroke-width": 1.5, "pointer-events": "none" }));
      if (c.tokens.some(k => k.kind === "beacon")) { svg.appendChild(svgEl("polygon", { points: `${x},${y - 21} ${x + 8},${y - 12} ${x},${y - 3} ${x - 8},${y - 12}`, fill: "#f4d03f", stroke: "#7a5c00", "stroke-width": 1.5, "pointer-events": "none" })); svg.appendChild(svgEl("circle", { cx: x, cy: y - 12, r: 2.4, fill: "#fff7cf", "pointer-events": "none" })); }
      if (c.tokens.some(k => k.kind === "supply")) { svg.appendChild(svgEl("rect", { x: x - 12, y: y + 5, width: 24, height: 17, rx: 3, fill: "#b08948", stroke: "#5e4422", "stroke-width": 1.5, "pointer-events": "none" })); svg.appendChild(svgEl("line", { x1: x - 12, y1: y + 13.5, x2: x + 12, y2: y + 13.5, stroke: "#5e4422", "stroke-width": 1.5, "pointer-events": "none" })); svg.appendChild(svgEl("line", { x1: x, y1: y + 5, x2: x, y2: y + 22, stroke: "#5e4422", "stroke-width": 1.5, "pointer-events": "none" })); }
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
      c.hideouts.forEach((ownerIdx, hi) => { const op = G.players[ownerIdx]; if (!op) return; const hx = x + 13 + hi * 7, hy = y - 14; svg.appendChild(svgEl("polygon", { points: `${hx - 6},${hy + 3} ${hx},${hy - 5} ${hx + 6},${hy + 3}`, fill: op.color, stroke: "#0c0e12", "stroke-width": 1, "pointer-events": "none" })); svg.appendChild(svgEl("rect", { x: hx - 5, y: hy + 3, width: 10, height: 7, fill: op.color, stroke: "#0c0e12", "stroke-width": 1, "pointer-events": "none" })); });
    }
    // minis — original colored game-piece standees with per-character emblem (no art files)
    for (const c of cells) {
      const here = E.playersOnHex(G, c.q, c.r);
      const { x, y } = hexToPixel(c.q, c.r);
      here.forEach((p, i) => {
        const ang = here.length > 1 ? (Math.PI * 2 * i / here.length) : 0;
        const ox = here.length > 1 ? Math.cos(ang) * 14 : 0, oy = here.length > 1 ? Math.sin(ang) * 10 : 0;
        drawMini(svg, p, CHAR[p.character], x + ox, y + oy, p.idx === G.activePlayer);
      });
    }
  }

  function renderPlayers() {
    const box = $("players-area"); box.innerHTML = "";
    for (const p of G.players) {
      const d = document.createElement("div");
      d.className = "pcard"; d.style.borderLeft = `4px solid ${p.color}`;
      if (p.idx === G.activePlayer) d.style.background = "#222a38";
      const assigned = p.assignedDice && p.assignedDice.length ? ` · ${T("pc.used")} ${p.assignedDice.join("/")}` : "";
      const combat = p.combatLine && p.combatLine.length ? ` · ${T("pc.line")} ${p.combatLine.join("/")}` : "";
      const ch = CHAR[p.character];
      const portrait = ch ? `<span class="pportrait">${emblemSVG(p, ch, 40)}</span>` : "";
      const pr = p.persona;
      const persona = pr ? `<div class="ppersona">「${TC("persona." + pr.id + ".name", pr.name)}」${TC("persona." + pr.id + ".arch", pr.archetype)}</div>` : "";
      d.innerHTML = `<div class="prow">${portrait}<div class="pinfo">` +
        `<div class="pname">${p.name}${p.human ? " " + T("pc.you") : ""}${p.team != null ? ` <span class="team-badge team${p.team}">${T("pc.team", { n: p.team + 1 })}</span>` : ""}${p.idx === G.activePlayer ? " ◀" : ""}</div>` +
        persona +
        `<div class="pstat">${T("pc.fame")} ${E.totalFame(p)} · ${T("pc.dmg")} ${p.injuries} · ${T("pc.def")} ${p.defensePool}/${p.actionDice}${p.boostDice ? ` <span style="color:#5fd06f">+${p.boostDice}⚡</span>` : ""}${assigned}${combat} · ${T("pc.pack")} ${p.backpack.length}` +
        (p.carryingBeacons ? ` · ${T("pc.carry")} ${p.carryingBeacons}` : "") +
        ` · ${p.pos ? T("pc.onmap") : T("pc.waitdrop")}</div></div></div>`;
      d.style.cursor = "pointer";
      d.addEventListener("click", () => openCharBoard(p.idx));
      bindTip(d, () => playerTip(p));
      box.appendChild(d);
    }
  }

  function renderTop() {
    const p = E.curP(G);
    let hint = "";
    const sstar = G.superstar ? "（Superstar）" : "";
    if (G.gameOver) hint = (G.isTeam && G.winnerTeam != null)
      ? T("hint.winTeam", { n: G.winnerTeam + 1, fame: E.teamFame(G, G.winnerTeam) }) + sstar
      : T("hint.win", { name: G.players[G.winner].name }) + sstar;
    else if (!p.human) hint = T("hint.acting", { name: p.name });
    else if (G.needsParachute) hint = T("hint.para");
    else { const h = highlightSet(); hint = T("hint.your", { loot: h.loot ? T("hint.loot") : "", upload: E.canUpload(G, p) ? T("hint.upload") : "", atk: h.atk.size ? T("hint.atk") : "" }); }
    const le = (G.lastEvent && D.EVENTS[G.lastEvent]) ? ` · ⚡${D.EVENTS[G.lastEvent].name}` : "";
    const diffCN = T("diff." + (G.difficulty || "medium"));
    let modeLabel = T("mode.br");
    if (G.isTeam) { const ts = [...new Set(G.players.map(p => p.team))].sort((a, b) => a - b); modeLabel = T("mode.team") + " " + ts.map(t => `${t + 1}:${E.teamFame(G, t)}`).join(" / "); }
    modeLabel += ` · ${diffCN}`;
    $("game-info").textContent = `${G.map} · ${G.numPlayers}${T("meta.players")} · ${modeLabel} · ${T("meta.round")} ${G.round} · ${T("meta.events")} ${G.eventsResolved}/${G.eventTotal}${le} — ${hint}`;
    const human = !G.gameOver && p.human, showAct = human && !G.needsParachute;
    const setBtn = (id, ok) => { const bt = $(id); if (!bt) return; bt.disabled = !ok; bt.classList.toggle("hidden", !human); };
    setBtn("btn-end", human && !G.needsParachute);
    setBtn("btn-heal", showAct && E.canHeal(G, p));
    setBtn("btn-barrier", showAct && E.canBuild(G, p) && E.emptyEdges(G, p).length > 0 && p.barriersUsed < 6);
    setBtn("btn-hideout", showAct && E.canBuild(G, p));
    setBtn("btn-trap", showAct && E.canBuild(G, p) && p.pos && G.board[E.hexKey(p.pos.q, p.pos.r)].trap == null && p.trapsUsed < 6);
    renderLegend(p, human);
  }
  // a persistent, always-visible key for the board's highlight colors + your remaining action dice
  function ensureLegend() {
    let el = $("hex-legend");
    if (!el) { el = document.createElement("div"); el.id = "hex-legend"; ($("board-wrap") || document.body).appendChild(el); }
    return el;
  }
  function renderLegend(p, human) {
    const leg = ensureLegend();
    if (G.gameOver || !human) { leg.classList.remove("show"); return; }
    if (G.needsParachute) {
      leg.innerHTML = `<span class="lg-item"><i class="lg-sw para"></i>${T("legend.para")}</span>`;
    } else {
      const h = highlightSet();
      const dice = Math.max(0, p.defensePool), boost = p.boostDice || 0, real = Math.max(0, dice - boost);
      const pips = ("●".repeat(real) + (boost ? "⚡".repeat(boost) : "")) || T("legend.nodice");
      leg.innerHTML =
        `<span class="lg-item"><i class="lg-sw move"></i>${T("legend.move")}</span>` +
        (h.atk.size ? `<span class="lg-item"><i class="lg-sw atk"></i>${T("legend.atk")}</span>` : "") +
        `<span class="lg-item"><i class="lg-sw cur"></i>${T("legend.you")}</span>` +
        (h.loot ? `<span class="lg-item">${T("legend.loot")}</span>` : "") +
        `<span class="lg-sep"></span>` +
        `<span class="lg-item lg-dice">${T("legend.dice")} <b>${pips}</b></span>` +
        `<span class="lg-item lg-dim">${T("legend.cost")}</span>`;
    }
    leg.classList.add("show");
  }

  function renderLog() {
    const l = $("log"); l.innerHTML = "";
    for (const m of G.log.slice(0, 40)) { const d = document.createElement("div"); d.textContent = logLine(m); l.appendChild(d); }
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
      const badge = isNext ? `<span class="ach-next">${T("ach.next")}</span>` : `<span class="ach-most">${T("ach.most")}</span>`;
      cards += `<div class="ach-card" data-id="${slot.id}">
        <img class="ach-img" src="${a.card}" alt="${a.name}" onerror="this.style.display='none'">
        <div class="ach-meta"><div class="ach-name">${achName(a)} ${badge}</div>
        <div class="ach-fame">🏅×${slot.fameBelow || 0}</div></div></div>`;
    }
    box.innerHTML = `<h4>${T("panel.ach")}</h4><div class="ach-list">${cards}</div>`;
    box.querySelectorAll(".ach-card").forEach(el => {
      const a = ACH[el.dataset.id];
      bindTip(el, () => `<h5>${achName(a, true)}</h5>${TC("ach." + a.id + ".desc", a.desc)}<div class="tt-sub">${a.type === "next" ? T("ach.instantTip") : T("ach.contestTip", { leader: mostLeader(a.metric) })}</div>`);
    });
  }

  // non-blocking ⚡ toast when a NEXT achievement is claimed
  function flashAchievement(rep) {
    if (!rep) return; const a = ACH[rep.id]; if (!a) return;
    const who = G.players[rep.player];
    let t = $("ach-toast"); if (!t) { t = document.createElement("div"); t.id = "ach-toast"; document.body.appendChild(t); }
    t.innerHTML = `<img src="${a.card}" onerror="this.style.display='none'"><div><div class="at-h">${T("ach.unlocked")}</div><div class="at-n" style="color:${who.color}">${who.name} — ${achName(a)}</div><div class="at-f">+${rep.fame} ${T("ach.famefx")}</div></div>`;
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
        <span class="dip-name" style="color:${o.color}">${o.name}${o.team != null ? ` ${T("pc.team", { n: o.team + 1 })}` : ""}</span>
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
      .map(f => `<div class="dip-line"><b style="color:${G.players[f.from] ? G.players[f.from].color : "#ccc"}">${G.players[f.from] ? G.players[f.from].name : "?"}</b>：${barkTr(f.ref, f.line)}</div>`).join("");
    box.innerHTML = `<h4>${T("panel.dip")}</h4>${offerHtml}<div class="dip-list">${rows}</div>${feed ? `<div class="dip-feed">${feed}</div>` : ""}`;
    box.querySelectorAll(".dip-b[data-act]").forEach(b => b.addEventListener("click", () => {
      if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;   // only on your own turn, not during AI autoplay
      const to = +b.dataset.to;
      if (b.dataset.act === "truce") E.proposeTruce(G, me.idx, to, 3);
      else E.proposeFocus(G, me.idx, to);
      render();
    }));
    box.querySelectorAll(".dip-b[data-offer]").forEach(b => b.addEventListener("click", () => {
      if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;   // answer offers only on your turn
      E.respondToOffer(G, +b.dataset.offer, b.dataset.ok === "1"); render();
    }));
  }

  // ---- game-over results screen: final standings + play again ----
  let _overShown = false;
  function closeOver() { const ov = $("over-overlay"); if (ov) ov.style.display = "none"; }
  function renderGameOver() {
    const ov0 = $("over-overlay");
    if (!G || !G.gameOver) { _overShown = false; if (ov0) ov0.style.display = "none"; return; }
    if (_overShown) return;                                  // built once; don't rebuild on every render tick
    _overShown = true;
    let ov = ov0; if (!ov) { ov = document.createElement("div"); ov.id = "over-overlay"; document.body.appendChild(ov); }
    const sstar = G.superstar ? " " + T("over.superstar") : "";
    const title = (G.isTeam && G.winnerTeam != null)
      ? T("hint.winTeam", { n: G.winnerTeam + 1, fame: E.teamFame(G, G.winnerTeam) })
      : T("hint.win", { name: G.players[G.winner].name });
    const fb = p => `🔆${p.fame.beacon} 🩸${p.fame.injury} 💥${p.fame.reload} ⚠${p.fame.trap || 0}` +
      (p.fame.teamSpirit ? ` 🤝${p.fame.teamSpirit}` : "") + (p.fame.achievement ? ` 🏅${p.fame.achievement}` : "");
    const ranked = G.players.slice().sort((a, b) => E.totalFame(b) - E.totalFame(a));
    const rows = ranked.map((p, i) => {
      const ch = CHAR[p.character], cn = lang === "zh" ? (ch && (ch.cn || ch.name)) : (ch && ch.name);
      return `<div class="ov-row${p.idx === G.winner ? " win" : ""}">` +
        `<span class="ov-rank">${i + 1}</span><span class="ov-emb">${emblemSVG(p, ch, 30)}</span>` +
        `<span class="ov-name"><b style="color:${p.color}">${p.name}</b>${p.human ? " " + T("pc.you") : ""}` +
        `${p.team != null ? ` <span class="team-badge team${p.team}">${T("pc.team", { n: p.team + 1 })}</span>` : ""}<small>${cn}</small></span>` +
        `<span class="ov-fame">${E.totalFame(p)}</span><span class="ov-fb">${fb(p)}</span></div>`;
    }).join("");
    ov.innerHTML = `<div class="ov-panel"><div class="ov-title">${title}${sstar}</div>` +
      `<div class="ov-list">${rows}</div>` +
      `<div class="ov-bar"><button class="small" id="ov-close">${T("over.close")}</button><button id="ov-again">${T("over.playAgain")}</button></div></div>`;
    ov.style.display = "flex";
    ov.querySelector("#ov-close").addEventListener("click", closeOver);
    ov.querySelector("#ov-again").addEventListener("click", () => { closeOver(); $("game-screen").classList.add("hidden"); $("setup-screen").classList.remove("hidden"); });
  }

  function render() {
    renderBoard(); renderPlayers(); renderTop(); renderLog(); renderAchievements(); renderDiplomacy();
    if (G && (G._achSeq || 0) > lastAchSeq) { lastAchSeq = G._achSeq; if (G.lastAchievement) flashAchievement(G.lastAchievement); }
    if (G && G.gameOver && !_overSfx) { _overSfx = true; SFX("win"); } else if (G && !G.gameOver) _overSfx = false;
    renderGameOver();
  }

  async function onHex(key) {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    const p = E.curP(G);
    if (G.needsParachute) { if (E.parachute(G, key)) { SFX("parachute"); render(); } return; }
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
    if (key === curKey && E.canUpload(G, p)) { E.doActivate(G); SFX("upload"); render(); placeDieAnim(curKey); return; } // upload beacons at tower
    if (key === curKey && E.lootOptions(G, p).length) { E.doLoot(G, 0); SFX("loot"); render(); placeDieAnim(curKey); return; }
    if (E.legalRuns(G, p).includes(key)) {
      const seq = G._trapSeq || 0;
      E.doRun(G, key); SFX("move"); render(); placeDieAnim(key);
      if ((G._trapSeq || 0) > seq && G.lastTrap && (G.players[G.lastTrap.walker].human || G.players[G.lastTrap.owner].human)) await animateTrap(G.lastTrap);
      return;
    }
  }

  // ---- AI turn visualization: telegraph who's acting, animate the move, surface combat ----
  let aiDelay = 650;                                   // ms pause between AI turns (cycled by #btn-speed)
  let aiSpeedIdx = 1;
  const AI_SPEEDS = [{ ms: 1100, key: "speed.slow" }, { ms: 650, key: "speed.med" }, { ms: 240, key: "speed.fast" }];
  function applySpeed() { aiDelay = AI_SPEEDS[aiSpeedIdx].ms; const sb = $("btn-speed"); if (sb) sb.textContent = T(AI_SPEEDS[aiSpeedIdx].key); }
  // fill all static-chrome strings (setup screen, toolbar, options) for the current language
  function applyStaticI18n() { document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = T(el.getAttribute("data-i18n")); }); }
  function ensureAiBanner() {
    let b = $("ai-banner");
    if (!b) { b = document.createElement("div"); b.id = "ai-banner"; ($("board-wrap") || document.body).appendChild(b); }
    return b;
  }
  function aiBanner(text, color) {
    const b = ensureAiBanner();
    b.innerHTML = `<span class="ab-dot" style="background:${color || "#888"}"></span>${text}`;
    b.classList.add("show");
  }
  function clearAiBanner() { const b = $("ai-banner"); if (b) b.classList.remove("show"); }
  function pulseActing(p) {                             // bright pulsing ring on the acting AI's hex (cleared by next render)
    if (!p.pos) return; const svg = $("board"); if (!svg) return;
    const { x, y } = hexToPixel(p.pos.q, p.pos.r);
    const ring = svgEl("circle", { cx: x, cy: y, r: 16, fill: "none", stroke: "#fff", "stroke-width": 3, opacity: 0.9, "pointer-events": "none" });
    ring.innerHTML = '<animate attributeName="r" values="15;27;15" dur="0.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.95;0.25;0.95" dur="0.9s" repeatCount="indefinite"/>';
    svg.appendChild(ring);
  }
  function animateAIMove(from, to, color) {             // a glowing dot streaks from old hex to new hex, leaving a trail
    const a = pxOf(E.hexKey(from.q, from.r)), b = pxOf(E.hexKey(to.q, to.r)), g = vfxGroup();
    if (!a || !b || !g) return Promise.resolve();
    const trail = svgEl("line", { x1: a.x, y1: a.y, x2: a.x, y2: a.y, stroke: color, "stroke-width": 4, "stroke-linecap": "round", opacity: 0.5, "stroke-dasharray": "2 6" });
    const dot = svgEl("circle", { cx: a.x, cy: a.y, r: 7, fill: color, stroke: "#fff", "stroke-width": 2 });
    g.appendChild(trail); g.appendChild(dot);
    return animateRAF(380, k => {
      const e = 1 - (1 - k) * (1 - k);
      dot.setAttribute("cx", (a.x + (b.x - a.x) * e).toFixed(1)); dot.setAttribute("cy", (a.y + (b.y - a.y) * e).toFixed(1));
      trail.setAttribute("x2", (a.x + (b.x - a.x) * e).toFixed(1)); trail.setAttribute("y2", (a.y + (b.y - a.y) * e).toFixed(1));
      dot.setAttribute("opacity", (1 - k * 0.5).toFixed(2));
    }).then(() => g.remove());
  }
  function combatToast(rep) {                           // compact AI-vs-AI combat readout (no full modal)
    const A = G.players[rep.a], Tp = G.players[rep.t];
    const icon = rep.type === "ranged" ? "🔫" : "🗡";
    const res = rep.reload ? T("toast.reload") : (rep.dealt > 0 ? T("toast.hit", { n: rep.dealt }) : T("toast.nohit"));
    aiBanner(`${icon} <b style="color:${A.color}">${A.name}</b> → <b style="color:${Tp.color}">${Tp.name}</b> · ${res}`, A.color);
    if (rep.reload) { SFX("reload"); shake(9); } else if (rep.dealt > 0) { SFX(rep.type === "close" ? "melee" : "shoot"); shake(4); }
    return sleep(Math.max(420, aiDelay));
  }
  function summarizeTurn(p, newLines) {                 // build a one-line "what the AI did" from the new log
    const mine = newLines.map(logLine).filter(l => l.includes(p.name)).reverse();   // chronological
    const txt = mine.slice(0, 2).join(" · ") || T("banner.endTurn", { name: p.name });
    return txt.length > 64 ? txt.slice(0, 63) + "…" : txt;
  }

  async function runAI() {
    if (aiRunning) return;
    aiRunning = true;
    while (!G.gameOver && !E.curP(G).human) {
      const p = E.curP(G);
      const beforePos = p.pos ? { q: p.pos.q, r: p.pos.r } : null;
      const beforeCombat = G.lastCombat, beforeLen = G.log.length, seq = G._trapSeq || 0;
      aiBanner(T("banner.acting", { name: p.name }), p.color); pulseActing(p);
      await sleep(Math.min(360, aiDelay));

      RL.ai.takeTurn(G);
      render();

      const afterPos = p.pos ? { q: p.pos.q, r: p.pos.r } : null;
      if (beforePos && afterPos && (beforePos.q !== afterPos.q || beforePos.r !== afterPos.r))
        await animateAIMove(beforePos, afterPos, p.color);                    // show the move

      if (G.lastCombat && G.lastCombat !== beforeCombat) {                    // a fight happened this turn
        const rep = G.lastCombat, human = G.players[rep.a].human || G.players[rep.t].human;
        if (human) {                                                         // player involved → full dice overlay
          if (rep.type === "ranged" && p.pos) await vfxGunshot(E.hexKey(p.pos.q, p.pos.r), G.players[rep.t].pos ? E.hexKey(G.players[rep.t].pos.q, G.players[rep.t].pos.r) : null);
          await animateCombat(rep);
        } else await combatToast(rep);                                        // AI vs AI → compact toast
      } else aiBanner(summarizeTurn(p, G.log.slice(0, Math.max(0, G.log.length - beforeLen))), p.color);

      if ((G._trapSeq || 0) > seq && G.lastTrap && G.players[G.lastTrap.owner].human) await animateTrap(G.lastTrap); // your mine triggered
      await sleep(aiDelay);
    }
    aiRunning = false;
    clearAiBanner(); render();
  }

  async function endTurn() {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    E.endTurn(G); render();
    if (!G.gameOver && !E.curP(G).human) await runAI();
  }

  // ---- character select: human picks one character; turn order is randomized in the engine ----
  let chosenChar = null;
  function showCharSelect() {
    chosenChar = null;
    const grid = $("char-grid");
    if (grid) {
      grid.innerHTML = D.CHARACTERS.map(ch => {
        const name = (lang === "zh" && ch.cn) ? ch.cn : ch.name;
        const ab = ch.ability ? `<div class="cs-ab"><b>${TC("ability." + ch.ability.id + ".name", ch.ability.name)}</b><span>${TC("ability." + ch.ability.id + ".text", ch.ability.text)}</span></div>` : "";
        return `<button class="cs-card" data-id="${ch.id}" style="--accent:${ch.color}">` +
          `<span class="cs-emb">${emblemSVG({ color: ch.color, character: ch.id }, ch, 56)}</span>` +
          `<div class="cs-name">${name}</div>${ab}</button>`;
      }).join("");
      grid.querySelectorAll(".cs-card").forEach(b => b.addEventListener("click", () => {
        grid.querySelectorAll(".cs-card.sel").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel"); chosenChar = b.dataset.id;
        const sb = $("btn-cs-start"); if (sb) sb.disabled = false;
      }));
    }
    const sb = $("btn-cs-start"); if (sb) sb.disabled = true;
    $("setup-screen").classList.add("hidden");
    $("char-select").classList.remove("hidden");
  }

  async function startGame() {
    const modeSel = $("mode-select"), mode = modeSel ? modeSel.value : "battleRoyale";
    let n = parseInt($("player-count").value, 10);
    if (mode === "team") n = 4;                                  // 2v2
    else if (mode === "team3v3" || mode === "team2v2v2") n = 6;  // 3v3 / 2v2v2 are 6-player team modes
    const difficulty = ($("difficulty-select") || {}).value || "medium";
    const map = ($("map-select") || {}).value || "arcadia";
    const allAI = $("all-ai").checked;
    G = E.newGame({ numPlayers: n, mode, allAI, allCharacters: true, difficulty, map, humanChar: allAI ? null : chosenChar });
    window.G = G; lastAchSeq = 0;
    $("setup-screen").classList.add("hidden");
    $("char-select").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    render();
    if (!E.isHumanTurn(G)) await runAI();
  }

  function act(fn, snd) {
    if (aiRunning || G.gameOver || !E.isHumanTurn(G)) return;
    const p = E.curP(G), here = p.pos && E.hexKey(p.pos.q, p.pos.r);
    if (fn(p)) { if (snd) SFX(snd); render(); if (here) placeDieAnim(here); }
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
  function equipCardHTML(e, action) {
    if (!e) return "";
    const sc = STAR_COLOR[e.star] || "#888";
    let stats = "";
    if (e.combat === "ranged") stats = `${T("eq.ranged")} · ${T("eq.range")}${e.range[0]}-${e.range[1]} · ${e.dice}${T("eq.dice")}` + (e.hands === 2 ? ` · ${T("eq.twohand")}` : "") + (e.bonus ? ` · ${T("eq.hitbonus")}:${e.bonus.amount}${e.bonus.type === "injury" ? T("eq.injury") : T("eq.light")}` : "");
    else if (e.combat === "close") stats = T("eq.close") + (e.hands === 2 ? ` · ${T("eq.twohand")}` : "");
    else if (e.armor) stats = T("eq.armor") + (e.armor.skullReduce ? ` ${T("eq.skull")}-${e.armor.skullReduce}` : "") + (e.armor.smallInjuryReduce ? ` ${T("eq.light")}-${e.armor.smallInjuryReduce}` : "");
    const clk = action ? ` ecard-clk" data-eq="${e.id}" data-act="${action}` : "";
    const tag = action === "equip" ? `<span class="ecard-act eq">${T("eq.equip")}</span>` : action === "unequip" ? `<span class="ecard-act un">${T("eq.unequip")}</span>` : "";
    return `<div class="ecard${clk}" style="border-top-color:${sc}">
      <div class="ecard-h"><span class="ecard-name">${TC("equip." + e.id + ".name", e.name)}</span><span class="ecard-star" style="color:${sc}">${"★".repeat(e.star)}</span></div>
      <div class="ecard-meta">${T("slotcn." + e.slot)}${stats ? " · " + stats : ""}</div>
      <div class="ecard-eff">${TC("equip." + e.id + ".effect", e.effect || "")}</div>${tag}</div>`;
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
    const defLabel = boost ? `${T("pc.def")}(${real}+${boost}⚡)` : `${T("pc.def")}(${p.defensePool})`;
    return row(defLabel, def) + row(T("pc.line"), line) + row(`${T("cb.dmgzone")}(${p.injuries}/${E.INJURY_ZONE})`, inj);
  }
  const SP_ICON = { pain_killer: "💊", energy_drink: "🥤", tactical_explosive: "💣" };
  // Free-action special items usable right now (only on the active human's own board, to match engine's curP).
  function specialUseHTML(p) {
    if (!p.human || G.gameOver || G.needsParachute || E.curP(G) !== p) return "";
    const usable = E.usableSpecials(G, p);
    if (!usable.length) return "";
    const kindCN = (k) => k === "trap" ? T("btn.trap") : k === "wall" ? T("btn.barrier") : T("btn.hideout");
    let rows = "";
    for (const e of usable) {
      const icon = SP_ICON[e.id] || "✦";
      if (e.id === "tactical_explosive") {
        E.explosiveTargets(G, p).forEach((t, i) => {
          rows += `<button class="cb-use small" data-item="${e.id}" data-ti="${i}">${icon} ${e.name}：${T("cb.dismantle")}${kindCN(t.kind)}</button>`;
        });
      } else {
        rows += `<button class="cb-use small" data-item="${e.id}">${icon} ${T("cb.use")} ${e.name}</button>`;
      }
    }
    return `<div class="cb-sec"><h3>${T("cb.items")}</h3><div class="cb-uses">${rows}</div></div>`;
  }
  // fixed-slot loadout (head / torso / hand1 / hand2), HUD-style
  function slotChip(label, id, editable, blocked) {
    const inner = blocked ? `<div class="cb-slot-x muted">${T("cb.slotBlocked")}</div>`
      : id ? equipCardHTML(EQ[id], editable ? "unequip" : null)
        : `<div class="cb-slot-x muted">${T("cb.slotEmpty")}</div>`;
    return `<div class="cb-slot"><div class="cb-slot-l">${label}</div>${inner}</div>`;
  }
  function loadoutHTML(p, editable) {
    const hand = p.equipped.hand || [], h0 = hand[0], two = h0 && EQ[h0] && EQ[h0].hands === 2;
    return `<div class="cb-slots">${slotChip(T("slot.head"), p.equipped.head, editable)}${slotChip(T("slot.armor"), p.equipped.torso, editable)}${slotChip(T("slot.hand1"), h0, editable)}${two ? slotChip(T("slot.hand2"), null, false, true) : slotChip(T("slot.hand2"), hand[1], editable)}</div>`;
  }
  function openCharBoard(idx) {
    const p = G.players[idx], ch = CHAR[p.character];
    let ov = $("char-overlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "char-overlay"; ov.addEventListener("click", (e) => { if (e.target === ov) closeCharBoard(); }); document.body.appendChild(ov); }
    const editable = p.human && E.curP(G) === p && !G.gameOver && E.canEquip(G, p);   // adjust equipment before assigning any die
    const equippedIds = [p.equipped.head, p.equipped.torso, ...(p.equipped.hand || [])].filter(Boolean);
    const packLeft = (p.backpack || []).slice();                 // backpack minus currently-equipped instances
    for (const id of equippedIds) { const i = packLeft.indexOf(id); if (i >= 0) packLeft.splice(i, 1); }
    const packHTML = packLeft.map(id => equipCardHTML(EQ[id], (editable && EQ[id] && EQ[id].slot !== "special") ? "equip" : null)).join("") || `<span class="muted">${T("cb.slotEmpty")}</span>`;
    const f = p.fame;
    ov.innerHTML = `<div class="cb-board" style="--accent:${p.color}">
      <button class="cb-close" title="${T("cb.close")}">✕</button>
      <div class="cb-boardtop">
        <div class="cb-injury">
          <div class="cb-zlabel">${T("cb.zlabel")}</div>
          <div class="cb-skulls">${Array.from({ length: E.INJURY_ZONE }, (_, i) => `<span class="cb-skull${i < p.injuries ? " on" : ""}">${i < p.injuries ? "☠" : ""}</span>`).join("")}</div>
        </div>
        <div class="cb-namewrap">
          <div class="cb-name2">${lang === "zh" ? (ch.cn || ch.name) : ch.name}${p.human ? ` <span class="cb-you">${T("cb.you")}</span>` : ""}</div>
          <div class="cb-en">${ch.name}${p.team != null ? ` · ${T("pc.team", { n: p.team + 1 })}` : ""}</div>
        </div>
        <div class="cb-dial" style="--p:${Math.round(p.injuries / E.INJURY_ZONE * 100)}">
          <div class="cb-dial-in"><div class="cb-dial-t">RELOAD</div><div class="cb-dial-p">${Math.round(p.injuries / E.INJURY_ZONE * 100)}%</div></div>
        </div>
      </div>
      <div class="cb-boardmain">
        <div class="cb-actions">${[["➤", "act.move"], ["✋", "act.loot"], ["⚙", "act.activate"], ["🔨", "act.build"], ["✚", "act.heal"], ["🔫", "act.ranged"], ["🗡", "act.melee"]].map(a => `<div class="cb-act"><span class="cb-act-i">${a[0]}</span>${T(a[1])}</div>`).join("")}</div>
        <div class="cb-art">${emblemSVG(p, ch, 200)}</div>
        <div class="cb-side">
          ${ch.ability ? `<div class="cb-ability"><b>${TC("ability." + ch.ability.id + ".name", ch.ability.name)}</b><div>${TC("ability." + ch.ability.id + ".text", ch.ability.text)}</div></div>` : ""}
          ${p.persona ? `<div class="cb-persona">「${TC("persona." + p.persona.id + ".name", p.persona.name)}」${TC("persona." + p.persona.id + ".arch", p.persona.archetype)}<div>${TC("persona." + p.persona.id + ".blurb", p.persona.blurb)}</div></div>` : ""}
          <div class="cb-fame">${T("pc.fame")} <b>${E.totalFame(p)}</b>　${T("fb.beacon")}${f.beacon}·${T("fb.injury")}${f.injury}·${T("fb.reload")}${f.reload}·${T("fb.trap")}${f.trap || 0}·${T("fb.ach")}${f.achievement || 0}${p.carryingBeacons ? `　｜ ${T("pc.carry")} ${p.carryingBeacons}` : ""}</div>
          ${p.achievementsWon && p.achievementsWon.length ? `<div class="cb-fame">🏅 ${p.achievementsWon.map(id => (ACH[id] ? achName(ACH[id]) : id)).join("、")}</div>` : ""}
          ${diceRowsHTML(p)}
        </div>
      </div>
      <div class="cb-sec"><h3>${T("cb.loadout")} ${editable ? `<span class="cb-equiphint">${T("cb.equiphint")}</span>` : ""}</h3>${loadoutHTML(p, editable)}</div>
      ${specialUseHTML(p)}
      <div class="cb-sec"><h3>${T("pc.pack")}（${p.backpack.length}）</h3><div class="ecards">${packHTML}</div></div>
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
        closeCharBoard(); render(); SFX("throwItem"); await vfxExplosion(target.key); openCharBoard(idx);
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
    for (const d of all) { d.el.textContent = DFACE(d.v); d.el.classList.remove("rolling"); d.el.classList.add("settled"); if (d.v === "skull") d.el.classList.add("skull"); SFX("dice"); await sleep(55); }
    rEl.textContent = resultText || ""; if (resultClass) rEl.classList.add(resultClass);
    await sleep(850); ov.style.display = "none";
  }
  // a big damage number that punches up over the dice overlay and fades
  function dmgPopup(ov, text, color) {
    const panel = ov.querySelector(".dz-panel") || ov;
    const el = document.createElement("div"); el.className = "dz-pop"; el.textContent = text; el.style.color = color;
    panel.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
  // flash the target's hex on the board (impact lands on the actual piece)
  function flashMini(idx, color) {
    const t = G.players[idx]; if (!t || !t.pos) return;
    const svg = $("board"), g = vfxGroup(); if (!svg || !g) return;
    const { x, y } = hexToPixel(t.pos.q, t.pos.r);
    const ring = svgEl("circle", { cx: x, cy: y, r: 13, fill: color, "fill-opacity": 0.5, stroke: color, "stroke-width": 3, "pointer-events": "none" });
    g.appendChild(ring);
    animateRAF(520, k => { ring.setAttribute("r", (13 + k * 22).toFixed(1)); ring.setAttribute("opacity", (1 - k).toFixed(2)); }).then(() => g.remove());
  }
  // multi-phase combat: roll -> skull compare -> combat-line row-by-row -> result
  async function animateCombat(rep) {
    if (!rep) return;
    const A = G.players[rep.a], Tp = G.players[rep.t];
    const ov = ensureDiceOverlay();
    ov.querySelector(".dz-title").textContent = rep.type === "ranged"
      ? `${A.name} 🔫 ${rep.weapon || ""} → ${Tp.name}`
      : `${A.name} 🗡 → ${Tp.name}`;
    const rEl = ov.querySelector(".dz-result"); rEl.textContent = ""; rEl.className = "dz-result";
    const body = ov.querySelector(".dz-body");
    body.innerHTML =
      `<div class="dz-side"><div class="dz-who" style="color:${A.color}">${A.name}（${T("cb.atk")}）</div><div class="dz-dice" id="dzA"></div></div>` +
      `<div class="dz-vs" id="dzMid">${T("cb.roll")}</div>` +
      `<div class="dz-side"><div class="dz-who" style="color:${Tp.color}">${Tp.name}（${T("cb.def")}）</div><div class="dz-dice" id="dzD"></div></div>`;
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
    for (const d of all) { d.el.textContent = DFACE(d.v); d.el.classList.remove("rolling"); d.el.classList.add("settled"); if (d.v === "skull") d.el.classList.add("skull"); SFX("dice"); }
    await sleep(450);
    // PHASE 2 — skull step
    const aS = rep.aSkulls || 0, dS = rep.dSkulls || 0;
    const skTxt = aS > dS ? T("cb.skullA", { n: aS - dS }) : dS > aS ? T("cb.skullD", { n: dS - aS }) : T("cb.skullTie");
    mid.innerHTML = `💀 ${aS} : ${dS}<br><span class="dz-cap">${skTxt}</span>`;
    await sleep(950);
    // PHASE 3 — combat line, row by row (numeric, high->low)
    const aNum = aArr.filter(v => v !== "skull").sort((x, y) => y - x), dNum = dArr.filter(v => v !== "skull").sort((x, y) => y - x);
    // mirror engine skull step: the skull-loser's lowest dice leave the combat line before the
    // row-by-row compare, so drop them here too (engine trims them in doRanged/doClose).
    if (dS > aS) aNum.splice(Math.max(0, aNum.length - (dS - aS)), dS - aS);
    else if (aS > dS) dNum.splice(Math.max(0, dNum.length - (aS - dS)), aS - dS);
    mid.innerHTML = T("cb.compare");
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
    // PHASE 4 — result (impact feedback scales with the damage dealt)
    rEl.className = "dz-result " + (rep.reload ? "big" : (rep.dealt > 0 ? "hit" : ""));
    rEl.textContent = rep.reload ? T("cb.reload", { name: Tp.name }) : (rep.dealt > 0 ? T("cb.hit", { n: rep.dealt }) : T("cb.nohit"));
    if (rep.reload) { SFX("reload"); shake(16); flashHit("rgba(227,66,75,.34)"); dmgPopup(ov, "💥 RELOAD", "#ff5a4b"); flashMini(rep.t, "#e3424b"); }
    else if (rep.dealt > 0) { if (rep.type === "close") SFX("melee"); shake(6 + rep.dealt * 4); flashHit("rgba(255,200,90,.18)"); dmgPopup(ov, "-" + rep.dealt, "#ffd24a"); flashMini(rep.t, "#ffb020"); }
    await sleep(rep.dealt > 0 || rep.reload ? 1150 : 850);
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
    SFX("heal");
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
    SFX("shoot");
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
    SFX("explosion"); shake(9);
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
    mine.classList.add("shake"); SFX("mine");                      // tension: the unknown mine rattles
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
    if (c.terrain === "maze") lines.push("🌀 迷宫：进入需 <b>2</b> 移动骰，并<b>阻挡</b>穿过它的视线（无法隔着它射击）");
    if (c.terrain === "solar") lines.push("☀ 太阳能阵列：回合开始在此 <b>+1 行动骰</b>（能量，不可用于战斗/承伤）");
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
    if (p.persona) h += `<div><b>「${p.persona.name}」</b>${p.persona.archetype}<div class="tt-sub">${p.persona.blurb}</div></div>`;
    if (ch && ch.ability) h += `<div><b>${ch.ability.name}</b>：${ch.ability.text}</div>`;
    h += ttSub(`名望 <b>${E.totalFame(p)}</b>（信标${p.fame.beacon}/受伤${p.fame.injury}/重整${p.fame.reload}/陷阱${p.fame.trap || 0}）<br>` +
      `伤害 ${p.injuries}/${E.INJURY_ZONE} · 行动骰 ${p.defensePool}/${p.actionDice}${p.carryingBeacons ? ` · 携带信标 ${p.carryingBeacons}` : ""}<br>` +
      `装备 ${[p.equipped.head, p.equipped.torso, ...(p.equipped.hand || [])].filter(Boolean).length} · 背包 ${p.backpack.length} · ${p.pos ? "在场" : (p.reloadZone ? "待重新跳伞" : "待跳伞")}`);
    return h + `<div class="tt-hint">点击查看完整角色板</div>`;
  }
  const BTN_TIP = {
    "btn-heal": "tip.heal", "btn-barrier": "tip.barrier", "btn-hideout": "tip.hideout",
    "btn-trap": "tip.trap", "btn-end": "tip.end", "btn-restart": "tip.restart",
  };

  // ---- interactive 1v1 tutorial: Betty (you) vs Echo (AI) on Imperial Dynasty, step-by-step coach marks ----
  const TUT_STEPS = [
    { text: "欢迎！你是<b>红方·炸弹贝蒂</b>，对手是<b>艾可（AI）</b>，地图<b>帝国皇朝</b>（外圈全是信标）。目标：赚最多<b>名望</b>。跟着提示走，随时可点 ✕ 退出教学。" },
    { text: "<b>跳伞</b>：棋盘上<b>黄色虚线</b>的格子是可降落点——点其中一个降落（之后会自动判定是否被气流吹偏一格）。" },
    { text: "<b>移动</b>：点<b>青色描边</b>的相邻格移动，花 1 颗骰；<b>上山要 2 颗</b>。" },
    { text: "<b>撿信标</b>：走到有 🔆 信标的格子，<b>点当前格</b>把信标捡起携带；带到<b>中央塔</b>再点它『上传』换名望（光囤不上传不得分）。" },
    { text: "<b>建造（贝蒂招牌）</b>：用底部的<b>陷阱/屏障/藏身处</b>按钮放建造物。贝蒂最适合<b>埋陷阱</b>围杀对手。", sel: "#btn-trap" },
    { text: "<b>查看装备</b>：点左侧<b>你的角色卡</b>看装备和骰子。对手艾可会<b>隐形</b>——贴脸<b>近战</b>比远程更靠谱。", sel: "#players-area" },
    { text: "<b>攻击</b>：当敌人进入你的射程，它的格子会出现<b>红框</b>——点红框发动战斗。<b>近战会结束你的回合</b>，先想好骰子怎么分配。" },
    { text: "<b>战斗结算</b>：弹出掷骰动画——骰子<b>逐颗比大小</b>、<b>骷髅最强</b>、伤害够了对方就 <b>RELOAD</b>（噴装、回跳伞区）。打中艾可会让她<b>现身</b>。" },
    { text: "<b>治疗</b>：点『治疗』按钮回血——<b>同格有敌人时不能治</b>。", sel: "#btn-heal" },
    { text: "<b>结束回合</b>：点『结束回合』——没用完的骰子会变成<b>防御</b>，然后翻一张<b>事件卡</b>。", sel: "#btn-end" },
    { text: "<b>事件 / 毒区</b>：右下是<b>事件日志</b>。毒区会从外圈向内扩散，<b>回合末别站在毒里</b>（除非你在穹顶或自己的藏身处）。", sel: "#log-panel" },
    { text: "<b>取胜</b>：事件牌抽完 = 终局，<b>名望最高者获胜</b>。教学结束，开始你的第一局吧！" },
  ];
  let tutI = -1;
  function tutClearHL() { document.querySelectorAll(".tut-hl").forEach(e => e.classList.remove("tut-hl")); }
  function tutEnd() { tutClearHL(); const ov = $("tut-overlay"); if (ov) ov.style.display = "none"; tutI = -1; }
  function tutShow() {
    let ov = $("tut-overlay");
    if (!ov) { ov = document.createElement("div"); ov.id = "tut-overlay"; document.body.appendChild(ov); }
    const s = TUT_STEPS[tutI]; tutClearHL();
    if (s.sel) { const t = document.querySelector(s.sel); if (t) t.classList.add("tut-hl"); }
    ov.innerHTML = `<div class="tut-card">
      <div class="tut-head">${T("tut.title")} <span class="tut-step">${tutI + 1}/${TUT_STEPS.length}</span><button class="tut-x" title="${T("tut.exit")}">✕</button></div>
      <div class="tut-body">${TC("tut." + tutI, s.text)}</div>
      <div class="tut-nav"><button class="tut-prev"${tutI === 0 ? " disabled" : ""}>${T("tut.prev")}</button><button class="tut-next">${tutI === TUT_STEPS.length - 1 ? T("tut.done") : T("tut.next")}</button></div>
    </div>`;
    ov.style.display = "block";
    ov.querySelector(".tut-x").addEventListener("click", tutEnd);
    ov.querySelector(".tut-prev").addEventListener("click", () => { if (tutI > 0) { tutI--; tutShow(); } });
    ov.querySelector(".tut-next").addEventListener("click", () => { if (tutI < TUT_STEPS.length - 1) { tutI++; tutShow(); } else tutEnd(); });
  }
  async function startTutorial() {
    G = E.newGame({ numPlayers: 2, mode: "battleRoyale", map: "imperial", difficulty: "easy", seed: 73, chars: ["betty", "echo"] });
    window.G = G; lastAchSeq = 0;
    $("setup-screen").classList.add("hidden");
    $("game-screen").classList.remove("hidden");
    render();
    tutI = 0; tutShow();
    if (!E.isHumanTurn(G)) await runAI();
  }

  function init() {
    if (typeof window !== "undefined") { window.__render = render; window.__combat = animateCombat; }   // dev/test hooks (forced re-render / play a combat overlay)
    $("btn-start").addEventListener("click", () => { if ($("all-ai").checked) startGame(); else showCharSelect(); });
    { const cs = $("btn-cs-start"); if (cs) cs.addEventListener("click", startGame); }
    { const cb = $("btn-cs-back"); if (cb) cb.addEventListener("click", () => { $("char-select").classList.add("hidden"); $("setup-screen").classList.remove("hidden"); }); }
    { const tb = $("btn-tutorial"); if (tb) tb.addEventListener("click", startTutorial); }
    { const mb = $("btn-mute"); if (mb) mb.addEventListener("click", () => { const m = RL.sfx ? RL.sfx.toggle() : true; mb.textContent = m ? "🔇" : "🔊"; }); }
    { const sb = $("btn-speed"); if (sb) { applySpeed(); sb.addEventListener("click", () => { aiSpeedIdx = (aiSpeedIdx + 1) % AI_SPEEDS.length; applySpeed(); }); } }
    { const ls = $("lang-select"); if (ls) { ls.value = lang; ls.addEventListener("change", () => { lang = ls.value; try { localStorage.setItem("rl-lang", lang); } catch (e) { } applyStaticI18n(); applySpeed(); if (G) render(); }); } }
    applyStaticI18n();   // render static chrome in the saved language on load
    $("btn-restart").addEventListener("click", () => location.reload());
    const modeSel = $("mode-select"), pcSel = $("player-count");
    if (modeSel && pcSel) modeSel.addEventListener("change", () => {   // team modes fix the player count
      const v = modeSel.value;
      if (v === "team") { pcSel.value = "4"; pcSel.disabled = true; }
      else if (v === "team3v3" || v === "team2v2v2") { pcSel.value = "6"; pcSel.disabled = true; }
      else pcSel.disabled = false;
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
    $("btn-barrier").addEventListener("click", () => act(p => { const e = barrierEdgeTowardEnemy(p); return e != null && E.doBuildBarrier(G, e); }, "build"));
    $("btn-hideout").addEventListener("click", () => act(p => E.canBuild(G, p) && E.doBuildHideout(G), "build"));
    $("btn-trap").addEventListener("click", () => act(() => E.doBuildTrap(G), "mine"));
    Object.keys(BTN_TIP).forEach(id => { const b = $(id); if (b) bindTip(b, () => T(BTN_TIP[id])); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
