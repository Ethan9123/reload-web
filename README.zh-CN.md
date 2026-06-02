# RELOAD —— 网页版（粉丝项目）

[![tests](https://github.com/Ethan9123/reload-web/actions/workflows/ci.yml/badge.svg)](https://github.com/Ethan9123/reload-web/actions/workflows/ci.yml)

> 🌐 **语言：** [English](README.md) · [中文](README.zh-CN.md) · [Français](README.fr.md) · [Español](README.es.md)

一个开源的、粉丝制作的 **《RELOAD》网页移植版** —— 一款大逃杀战术骰子桌游。使用纯原生 JavaScript 编写（无框架、无构建步骤），任何浏览器都能直接运行。

## ▶️ 在线游玩
**https://ethan9123.github.io/reload-web/** —— 用浏览器打开，即可与 AI 对战。（点 🔊 可静音；可在开始界面切换语言。）

## 💜 为什么做这个
我是 YouTube 频道 **下课桌游** 的粉丝，看了他们的 RELOAD 视频：<https://www.youtube.com/watch?v=Hcq1IFnXOLQ>。我很喜欢这个游戏，为了把它的规则彻底搞明白，于是从零把它重新实现了一遍。特别感谢「下课桌游」带来的启发。🙏

## ⚠️ 免责声明
这是一个 **非官方、非商业的粉丝项目**，与游戏发行商 **无任何关联，也未获其授权**。《RELOAD》及其角色、名称、美术与规则均归各自权利人所有。本仓库的**代码**是开源的（见 [LICENSE](LICENSE)），但**不**授予该游戏知识产权的任何权利。如您是权利人并希望下架任何内容，请提交 issue，我会立即移除。

## ✨ 特性
- **12 个角色**（基础版 + 扩展）及其专属能力
- **6 张地图** + 特殊地形（迷宫、太阳能阵列）
- **2–6 人**；模式：大逃杀、2v2、3v3、2v2v2
- **AI 难度：** 简单 / 普通 / 困难 / **专家**（蒙特卡洛 rollout 前瞻搜索）
- **程序化音效 + 屏幕震动**（代码合成，零音频文件）
- 面向新手的 **1v1 互动教学**
- **完整多语言** —— 中文 / English / Français / Español，可在开始界面实时切换
- 无头、确定性的规则引擎，配备完整自动化测试

## 🕹️ 本地运行
```bash
git clone https://github.com/Ethan9123/reload-web
cd reload-web
python devserver.py        # 然后打开 http://localhost:8765
```
（或直接用浏览器打开 `index.html`。）

## ✅ 测试
纯 Node.js，无依赖：
```bash
npm test     # 通过 tools/run_tests.js 运行全部测试（每次 push 也会在 CI 中运行）
```

## 📄 许可证
源代码：[MIT](LICENSE)。游戏知识产权归其权利人所有（见免责声明）。
