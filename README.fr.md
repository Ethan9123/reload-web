# RELOAD — Édition Web (projet de fan)

> 🌐 **Langues :** [English](README.md) · [中文](README.zh-CN.md) · [Français](README.fr.md) · [Español](README.es.md)

Un portage web **open-source, réalisé par un fan, du jeu de société *RELOAD*** — un jeu de dés tactique de type battle royale. Écrit en JavaScript pur (sans framework ni étape de build), il fonctionne partout où il y a un navigateur.

## ▶️ Jouer en ligne
**https://ethan9123.github.io/reload-web/** — ouvrez-le dans un navigateur et jouez contre l'IA. (Cliquez sur 🔊 pour couper le son ; choisissez votre langue depuis l'écran d'accueil.)

## 💜 Pourquoi ce projet
Je suis fan de la chaîne YouTube **下课桌游** et de leur vidéo sur RELOAD : <https://www.youtube.com/watch?v=Hcq1IFnXOLQ>. J'adore ce jeu, et j'ai créé ce projet pour en comprendre vraiment les règles en le ré-implémentant de zéro. Un grand merci à 下课桌游 pour l'inspiration. 🙏

## ⚠️ Avertissement
Ceci est un **projet de fan non officiel et non commercial**, **sans aucun lien avec l'éditeur du jeu ni son approbation**. *RELOAD*, ses personnages, noms, illustrations et règles appartiennent à leurs propriétaires respectifs. Le **code** de ce dépôt est open-source (voir [LICENSE](LICENSE) ) ; il n'accorde **aucun** droit sur la propriété intellectuelle du jeu. Ayants droit : ouvrez une issue et tout contenu signalé sera retiré.

## ✨ Fonctionnalités
- **12 personnages** (base + extensions) avec leurs capacités
- **6 cartes** + terrains spéciaux (labyrinthe, panneaux solaires)
- **2 à 6 joueurs** ; modes : Battle Royale, 2c2, 3c3, 2c2c2
- **Difficulté de l'IA :** Facile / Normal / Difficile / **Expert** (recherche par simulations Monte-Carlo)
- **Effets sonores procéduraux + tremblement d'écran** (synthétisés dans le code, aucun fichier audio)
- **Tutoriel interactif 1c1** pour les nouveaux joueurs
- **Entièrement localisé** — jouable en 中文 / English / Français / Español, changeable en direct depuis l'écran d'accueil
- Un moteur de règles sans interface, déterministe, avec une suite de tests automatisés complète

## 🕹️ Exécuter en local
```bash
git clone https://github.com/Ethan9123/reload-web
cd reload-web
python devserver.py        # puis ouvrez http://localhost:8765
```
(Ou ouvrez simplement `index.html` dans un navigateur.)

## ✅ Tests
Node.js pur, sans dépendances :
```bash
npm test     # lance toutes les suites via tools/run_tests.js (et tourne en CI à chaque push)
```

## 📄 Licence
Code source : [MIT](LICENSE). La PI du jeu appartient à ses propriétaires (voir l'Avertissement).
