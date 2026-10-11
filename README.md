# Homeworld 网页模拟 · 技术讲解版

不重新造轮子:**真机游戏直接用现成的 WebAssembly 引擎**(HomeworldSDL 的官方后续
GardensOfKadesh,把 Relic 2003 年开源的原版 C 源码编译到浏览器),在其外围做技术讲解。

## 运行

必须走 HTTP 且带 COOP/COEP 头(引擎需要 SharedArrayBuffer;`file://` 和无头 python http.server 都不行):

```bash
cd D:/Github/homeworld
python serve.py 8931        # 自带 Cross-Origin-Opener/Embedder-Policy
# 浏览器打开 http://127.0.0.1:8931/web/
```

## 页面结构

| 视图 | 内容 |
|---|---|
| 🎮 真机游戏 | `engine/index.html`:GardensOfKadesh 1.2.2 wasm(3.3MB 引擎 + 67MB demo 资源),菜单 → TRAINING/SINGLE PLAYER 可完整游玩。无头/键盘环境用 ↑↓ + Enter 导航 |
| 🔬 原理沙盒 | `js/sim.js` 对 physics.c / formation.c / GenericInterceptor.c / CommandNetwork.c 的忠实 JS 移植;选择/移动/攻击/编队/战斗全部可玩 |
| 📖 教学手册 | `js/teach.js` 8 章讲解,每章带真实源码摘录(文件:行号)+ 场景联动演示 |

### 教学章节

1. 总览:消息泵 → rAF 固定步长
2. 物理:`physApplyForceToObj` 冲量语义(a=F/m,帧末清零),矢量可视化
3. 转动:力矩/转动惯量/maxrot,转弯压坡度
4. 编队:`FormationCalculateOffsets` DELTA 右左交替算法,实时槽位
5. 战斗 AI:whip-strafe 掠袭状态机(REAPPROACH ↔ WHIPSTRAFE1)
6. 指令与网络:命令对象入队 → 帧首处理(联机 lockstep 的基础)
7. 渲染:rGL(D3D6/Glide/软光栅)→ SDL2 → WebGL,线框演示
8. 操作手册

## 文件

```
web/
├── index.html          门户:视图切换 + 沙盒 HUD + 教学抽屉
├── engine/             wasm 游戏包(git 忽略,download.sh 重新下载)
│   └── download.sh
└── js/
    ├── three.min.js    渲染库(git 忽略)
    ├── sim.js          物理/AI/编队/命令队列移植
    ├── ui.js           three 场景、相机、输入、HUD
    └── teach.js        教学章节与演示
serve.py                 本地服务:带 COOP/COEP 头(wasm 游戏必需)
.gitignore               排除 67MB 资源包
```

## 资源替换

demo 资源可自由分发但内容有限。拥有正版(1999 原版+1.05 补丁,或 Remastered)可把
`Homeworld.big / Update.big / HW_Comp.vce / HW_Music.wxd` 放入 `engine/` 重新打包,
获得完整战役——方法见 GardensOfKadesh 上游文档。

## 远端

- 本仓库 remote:`https://github.com/mobius/homeworld`(原版源码)
- 引擎上游:`https://gitlab.com/gardens-of-kadesh/gardens-of-kadesh`(GitHub 镜像 HomeworldSDL/HomeworldSDL)
