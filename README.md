# RELOAD — Web Edition (fan project)

> 🌐 **Languages:** [English](README.md) · [中文](README.zh-CN.md) · [Français](README.fr.md) · [Español](README.es.md)

An open-source, fan-made **web port of *RELOAD*** — a battle-royale tactical dice board game. Written in plain vanilla JavaScript (no framework, no build step), so it runs anywhere a browser does.

## ▶️ Play online
**https://ethan9123.github.io/reload-web/** — open in a browser and play against the AI. (Click 🔊 to mute sound.)

## 💜 Why this exists
I'm a fan of the YouTube channel **下课桌游 (After-Class Board Games)** and their RELOAD video: <https://www.youtube.com/watch?v=Hcq1IFnXOLQ>. I love this game, and I built this project to truly understand its rules by re-implementing it from scratch. Big thanks to 下课桌游 for the inspiration. 🙏

## ⚠️ Disclaimer
This is an **unofficial, non-commercial fan project**, **not affiliated with or endorsed by** the game's publisher. *RELOAD*, its characters, names, artwork and rules are the property of their respective owners. The **code** in this repository is open-source (see [LICENSE](LICENSE)); it does **not** grant any rights to the game's intellectual property. Rights holders: open an issue and anything you ask will be removed.

## ✨ Features
- **12 characters** (base + expansions) with their special abilities
- **6 maps** + special terrains (maze, solar array)
- **2–6 players**; modes: Battle Royale, 2v2, 3v3, 2v2v2
- **AI difficulty:** Easy / Medium / Hard / **Expert** (Monte-Carlo rollout look-ahead)
- **Procedural sound effects + screen-shake** (synthesized in code, zero audio files)
- **Interactive 1v1 tutorial** for new players
- A headless, deterministic rules engine with a full automated test suite

## 🕹️ Run locally
```bash
git clone https://github.com/Ethan9123/reload-web
cd reload-web
python devserver.py        # then open http://localhost:8765
```
(Or simply open `index.html` in a browser.)

## ✅ Tests
Pure Node.js, no dependencies:
```bash
for f in tests/*.js; do node "$f"; done
```

## 📄 License
Source code: [MIT](LICENSE). Game IP belongs to its owners (see Disclaimer).
