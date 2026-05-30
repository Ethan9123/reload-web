# RELOAD — Edición Web (proyecto de fans)

> 🌐 **Idiomas:** [English](README.md) · [中文](README.zh-CN.md) · [Français](README.fr.md) · [Español](README.es.md)

Una adaptación web **de código abierto, hecha por un fan, del juego de mesa *RELOAD*** — un juego de dados táctico tipo battle royale. Escrito en JavaScript puro (sin framework ni paso de compilación), funciona en cualquier navegador.

## ▶️ Jugar en línea
**https://ethan9123.github.io/reload-web/** — ábrelo en un navegador y juega contra la IA. (Pulsa 🔊 para silenciar; elige tu idioma en la pantalla de inicio.)

## 💜 Por qué existe
Soy fan del canal de YouTube **下课桌游** y de su vídeo sobre RELOAD: <https://www.youtube.com/watch?v=Hcq1IFnXOLQ>. Me encanta este juego y creé este proyecto para entender de verdad sus reglas reimplementándolo desde cero. ¡Muchas gracias a 下课桌游 por la inspiración! 🙏

## ⚠️ Aviso legal
Este es un **proyecto de fans no oficial y sin fines comerciales**, **sin afiliación ni respaldo** del editor del juego. *RELOAD*, sus personajes, nombres, ilustraciones y reglas son propiedad de sus respectivos dueños. El **código** de este repositorio es de código abierto (ver [LICENSE](LICENSE)); **no** otorga ningún derecho sobre la propiedad intelectual del juego. Titulares de derechos: abran una issue y se retirará cualquier contenido que indiquen.

## ✨ Características
- **12 personajes** (base + expansiones) con sus habilidades
- **6 mapas** + terrenos especiales (laberinto, panel solar)
- **2–6 jugadores**; modos: Battle Royale, 2c2, 3c3, 2c2c2
- **Dificultad de la IA:** Fácil / Normal / Difícil / **Experto** (búsqueda por simulaciones Monte-Carlo)
- **Efectos de sonido procedurales + sacudida de pantalla** (sintetizados por código, sin archivos de audio)
- **Tutorial interactivo 1c1** para jugadores nuevos
- **Totalmente localizado** — jugable en 中文 / English / Français / Español, cambiable al instante desde la pantalla de inicio
- Un motor de reglas sin interfaz, determinista, con una suite de pruebas automatizadas completa

## 🕹️ Ejecutar en local
```bash
git clone https://github.com/Ethan9123/reload-web
cd reload-web
python devserver.py        # luego abre http://localhost:8765
```
(O simplemente abre `index.html` en un navegador.)

## ✅ Pruebas
Node.js puro, sin dependencias:
```bash
for f in tests/*.js; do node "$f"; done
```

## 📄 Licencia
Código fuente: [MIT](LICENSE). La PI del juego pertenece a sus dueños (ver Aviso legal).
