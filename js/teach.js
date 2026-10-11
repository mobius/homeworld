/* ============================================================================
 * TEACH —— 技术讲解层
 * 每章 = 讲解文字 + 真实源码摘录(标注 文件:行号)+ 场景联动演示 + 实时数据
 * ==========================================================================*/

"use strict";

const TEACH = {
  open: false, cur: 0,
  demo: null,          // {kind, ships:[], t, ...}
  widgetT: 0,

  chapters: [
    /* ────────────── 第0章 总览 ────────────── */
    {
      title: '① 总览:一个引擎的三次生命',
      html: () => `
<p>本页把 <b>1999 年的原版引擎</b>呈现在浏览器里,共三层:</p>
<table>
  <tr><th>层</th><th>是什么</th><th>状态</th></tr>
  <tr><td>🎮 真机游戏</td><td>HomeworldSDL(GardensOfKadesh)把原版 C 源码经 Emscripten 编译成 WebAssembly:同一个引擎、同一套 .big 资源(demo 资源 67MB)</td><td>可直接游玩</td></tr>
  <tr><td>🔬 原理沙盒</td><td>用 JS 移植 physics.c / formation.c / GenericInterceptor.c 的核心算法,把黑盒内部机制画出来</td><td>可交互讲解</td></tr>
  <tr><td>📄 源码</td><td>仓库 mobius/homeworld(2003 年 Relic 开源),摘录均标注 文件:行号</td><td>随时对照</td></tr>
</table>
<p>原版主循环是 Win32 消息泵;本页沙盒则用浏览器 rAF 驱动<b>固定物理步长</b>(30Hz)累加器。</p>`,
      code: [{ src: 'src/Win32/main.c:3434', text:
`while(TRUE)
{
    Sleep(0);                                  // 给声音线程喘息
    if(PeekMessage(&message, NULL, 0, 0, PM_NOREMOVE))
    {
        if(!GetMessage(&message, NULL, 0, 0))  // WM_QUIT → 退出
            break;
        TranslateMessage(&message);
        DispatchMessage(&message);             // 窗口/输入消息
    }
    else
    {
        utyTasksDispatch();                    // 执行任务队列(游戏逻辑帧)
    }
    ...
}` }] ,
      live: el => { el.textContent = `rAF 帧 = ${UI.fpsN}  sim 帧 = ${SIM.frame}\n物理步长 = ${SIM.dt.toFixed(4)}s  速度 ×${SIM.speed}\nsim 累加器积压 = ${UI.acc.toFixed(3)}s`; },
      demoBtn: null
    },

    /* ────────────── 第1章 物理 ────────────── */
    {
      title: '② 物理系统:a = F/m 的冲量语义',
      html: () => `
<p><span class="cite">src/Game/physics.c:52 · :670</span></p>
<p>原版物理是教科书式牛顿积分,但有一个关键细节:<b>力在每个物理帧末被清零</b>。
每帧想持续推进,就必须每帧重新施加力——力是"这一帧的冲量",不是持续状态。
AI 层正是这么做的:每帧 <span style="font-family:monospace">physApplyForceToObj(TRANS_FORWARD)</span>。</p>
<p>施力方向不是世界坐标,而是从舰船姿态矩阵(<span style="font-family:monospace">rotinfo.coordsys</span>)的<b>列向量</b>取出的本地坐标系方向(上=列1,右=列2,前=列3)。奇数枚举值(&amp;1)表示取反方向。</p>
<p><b>演示</b>:下方按钮生成一架拦截机,每 2 秒施加一次 <span style="font-family:monospace">TRANS_UP</span> 冲量,持续前推。红箭头=本帧作用力,绿=速度,金=机头方向。观察:F 清零后速度不消失(动量守恒),上冲+前进合成螺旋轨迹。</p>`,
      code: [{ src: 'src/Game/physics.c:52 physApplyForceToObj', text:
`switch (transdir)
{
    case TRANS_UP: case TRANS_DOWN:        // 列1 = 本地上方向
        matGetVectFromMatrixCol1(vectorforce, obj->rotinfo.coordsys);
        break;
    case TRANS_RIGHT: case TRANS_LEFT:     // 列2 = 本地右方向
        matGetVectFromMatrixCol2(vectorforce, obj->rotinfo.coordsys);
        break;
    case TRANS_FORWARD: case TRANS_BACKWARD:
        matGetVectFromMatrixCol3(vectorforce, obj->rotinfo.coordsys);
        break;                             // 列3 = 本地前方向
}
if (transdir & 1) force = -force;          // 奇数枚举 = 反方向
vecAddTo(obj->posinfo.force, vectorforce); // 只累加,不立即生效` },
{ src: 'src/Game/physics.c:670 physUpdateObjPosVelShip', text:
`vecScalarMultiply(a, obj->posinfo.force, staticheader->oneOverMass); // a = F/m
vecMultiplyByScalar(a, phystimeelapsed);                    // a = at
vecAddTo(obj->posinfo.velocity, a);                         // v = v + at
speedmult = tacticsGetShipsMaxVelocity((Ship *)obj);
vecCapVectorSloppy(&obj->posinfo.velocity, speedmult);      // 限最大速度
vecScalarMultiply(d, obj->posinfo.velocity, phystimeelapsed); // d = vt
vecAddTo(obj->posinfo.position, d);                         // x = x + d
...
vecZeroVector(robj->rotinfo.torque);
vecZeroVector(obj->posinfo.force);   // ← 帧末清零:冲量语义` }],
      live: el => {
        const s = TEACH.demo && TEACH.demo.ships[0];
        el.textContent = s ? `force(本帧) = ${fmtV(s.lastForce)}  |F| = ${vLen(s.lastForce).toFixed(0)}N\nvelocity = ${fmtV(s.vel)}  |v| = ${s.speed.toFixed(1)} / ${s.type.maxVelocity} m/s\nbank = ${(s.bank * 57.3).toFixed(1)}°  状态 = ${s.aiState}` : '演示未开始';
      },
      demoBtn: { label: '▶ 演示:冲量与矢量', kind: 'impulse' }
    },

    /* ────────────── 第2章 转动与倾斜 ────────────── */
    {
      title: '③ 转动:力矩/转动惯量/压坡度',
      html: () => `
<p><span class="cite">src/Game/physics.c:830</span></p>
<p>姿态更新与位置更新同构:力矩 ÷ 转动惯量 = 角加速度,积分成角速度 <span style="font-family:monospace">rotspeed</span>,再封顶到 <span style="font-family:monospace">maxrot</span>。每帧把角速度转成旋转矩阵右乘姿态矩阵。</p>
<p>HW 战机标志性的<b>转弯压坡度(banking)</b>不在这段物理里——AI 层侧向机动时给滚转力矩,视觉上机翼下压。沙盒用"侧向速度占比"等价复现:满舵盘旋时约压到 maxBank(拦截机 ~52°)。</p>
<p><b>演示</b>:拦截机绕标记点盘旋,观察绿条(倾斜角)与转向半径的关系。</p>`,
      code: [{ src: 'src/Game/physics.c:830 姿态更新', text:
`a.x = robj->rotinfo.torque.x * staticheader->oneOverMomentOfInertiaX; // α=T/J
vecAddTo(robj->rotinfo.rotspeed, a);                     // w = w + α·t
vecCapVectorSloppy(&robj->rotinfo.rotspeed, staticheader->maxrot);
if (robj->rotinfo.rotspeed.y) {
    angyrotate = robj->rotinfo.rotspeed.y * phystimeelapsed;
    matMakeRotAboutY(&rotymatrix, cos, sin);
    matMultiplyMatByMat(&coordsys, &tempmat, &rotymatrix); // 姿态 = R·姿态
}` }],
      live: el => {
        const s = TEACH.demo && TEACH.demo.ships[0];
        el.textContent = s ? `bank = ${(s.bank * 57.3).toFixed(1)}°  (maxBank = ${(s.type.maxBank * 57.3) | 0}°)\n|v| = ${s.speed.toFixed(1)} m/s  转向速率上限 = ${s.type.maxTurn.toFixed(2)} rad/s\n转圈角速度 ≈ ${(s.type.maxTurn / (s.speed / Math.max(1, s.type.maxTurn) * 400)).toFixed(3)} rad/s` : '演示未开始';
      },
      demoBtn: { label: '▶ 演示:盘旋压坡度', kind: 'orbit' }
    },

    /* ────────────── 第3章 编队 ────────────── */
    {
      title: '④ 编队:DELTA 的右左交替算法',
      html: () => `
<p><span class="cite">src/Game/formation.c:1399 FormationCalculateOffsets</span></p>
<p>Delta 编队不靠魔法:以队长为原点,第 1 架排右翼、第 2 架排左翼、第 3 架再排右翼……间距不是常数,而是<b>每架舰船自己的碰撞球半径</b> × 队形系数 × 战术系数,再乘 1.5(DELTA_FORMATION_PADDING_SCALE)。大舰自然排得开,混编也不重叠。Formation X 是同一算法加上下交替(3D 化)。</p>
<p><b>演示</b>:选中 5 架拦截机执行 Δ / X 编队,金色线框即实时计算的槽位。</p>`,
      code: [{ src: 'src/Game/formation.c:1440 DELTA_FORMATION 分支', text:
`leftsepdist = leaderstatic->staticheader.staticCollInfo.collspheresize
            * leaderstatic->formationPaddingModifier * tacticsFormationPadding;
rightsepdist = leftsepdist;
for (i=1; i<numShips; i++) {
    thissepdist = shipstatic->staticheader.staticCollInfo.collspheresize
                * shipstatic->formationPaddingModifier * tacticsFormationPadding;
    if (i & 1) {                                  // 奇数号 → 右翼
        rightsepdist += thissepdist;
        rightsepdist *= DELTA_FORMATION_PADDING_SCALE;   // ×1.5
        desiredposright.y += rightsepdist;
    } else {                                      // 偶数号 → 左翼
        leftsepdist += thissepdist;
        leftsepdist *= DELTA_FORMATION_PADDING_SCALE;
        desiredposleft.y -= leftsepdist;
    }
}` }],
      live: el => {
        const n = SIM.formationSlots ? SIM.formationSlots.length : 0;
        const s0 = SIM.ships.find(s => s.team === 1 && s.typeName === 'interceptor' && !s.dead);
        el.textContent = `编队槽位 = ${n}\n间距示例(拦截机) = collSize(${s0 ? s0.type.collSize : 7}) × 1.5 = ${(s0 ? s0.type.collSize : 7) * 1.5} m\nselection = ${SIM.selection.length} 艘`;
      },
      demoBtn: { label: '▶ 演示:Δ 编队', kind: 'delta' },
      demoBtn2: { label: '▶ 演示:X 编队', kind: 'delta3d' }
    },

    /* ────────────── 第4章 战斗AI ────────────── */
    {
      title: '⑤ 战斗 AI:Whip-Strafe 攻击掠袭',
      html: () => `
<p><span class="cite">src/Ships/GenericInterceptor.c:364 :528</span></p>
<p>拦截机不会傻追目标,而是循环执行<b>掠袭(whip-strafe)</b>:接近到射程最优距 → 选上/下半平面算一个"超越点"(目标位置 + 来向 × 超越系数)→ 全速飞过并开火 → 冲过头再重新接近。这让战机像战斗机一样拉起-俯冲,也让防守方有射击窗口。</p>
<p>状态迁移用宏完成:<span style="font-family:monospace">TransitionToSTATE_REAPPROACH</span>。</p>
<p><b>演示</b>:拦截机攻击固定靶机,左下角状态在 REAPPROACH → WHIPSTRAFE1 → REAPPROACH 间循环。</p>`,
      code: [{ src: 'src/Ships/GenericInterceptor.c:364 setupWhipStrafe', text:
`temp = target->staticinfo->staticheader.staticCollInfo.approxcollspheresize
     + shipstaticinfo->bulletRange[ship->tacticstype]
       * WHIPSTRAFE_BULLETRANGEOPTIMUM;         // 射程最优比
if (ship->posinfo.position.z > targetshipvec.z) {
    whipstrafeflags = WHIPSTRAFE_ABOVE;          // 记住从上/下哪边掠过
    targetshipvec.z += temp;
} else {
    targetshipvec.z -= temp;
}
...
vecMultiplyByScalar(tmpvec2, WHIPSTRAFE_FLYBYOVERSHOOT);  // 超越系数
vecAdd(spec->aivec, ship->posinfo.position, tmpvec2);     // 超越点
flightmanInit(ship, FLIGHTMAN_WHIP_STRAFE);               // 飞掠机动
ship->aistateattack = STATE_WHIPSTRAFE1;

#define TransitionToSTATE_REAPPROACH \\
    ship->aistateattack = STATE_REAPPROACH; ...   // 掠袭完 → 重新接近` }],
      live: el => {
        const d = TEACH.demo;
        if (!d || !d.ships[0]) { el.textContent = '演示未开始'; return; }
        const a = d.ships[0], t = d.drone;
        el.textContent = `攻击方状态 = ${a.aiState}\n与靶距离 = ${vDist(a.pos, t.pos).toFixed(0)} m (射程 ${a.type.gunRange})\n本帧开火冷却 = ${a.gunTimer.toFixed(2)}s\n全局子弹数 = ${SIM.bullets.length}  已发射 = ${SIM.stats.bulletsFired}`;
      },
      demoBtn: { label: '▶ 演示:掠袭循环', kind: 'strafe' }
    },

    /* ────────────── 第5章 指令与网络 ────────────── */
    {
      title: '⑥ 指令层与多人网络',
      html: () => `
<p><span class="cite">src/Game/CommandNetwork.c:166</span></p>
<p>玩家的每次点选不直接改世界,而是生成<b>命令对象</b>入队(<span style="font-family:monospace">Enqueue(&ProcessCmdPktQ, ...)</span>),帧首统一处理。单机时这只是一个队列;联机时同一命令变成网络包广播,所有玩家各自模拟,靠周期性 <b>sync 包</b>校验一致性(lockstep 同步)——1999 年就把"命令即数据"做进了架构。</p>
<p>沙盒照抄此结构:右键移动/攻击 = <span style="font-family:monospace">SIM.issue()</span> 入队 → 每帧开头 drain。下方实时显示队列与累计处理数。</p>`,
      code: [{ src: 'src/Game/CommandNetwork.c:166 ReceivedCmdPacketCB', text:
`void ReceivedCmdPacketCB(ubyte *packet, udword sizeofPacket)
{
    ...
    Enqueue(&ProcessCmdPktQ, packet, sizeofPacket);   // 入队待处理
}
// 帧首逐个弹出执行;联机时这些包同时来自其他玩家的 socket` }],
      live: el => { el.textContent = `命令队列长度 = ${SIM.commandQueue.length}\n已处理命令 = ${SIM.stats.commandsProcessed}\n处理速率 ≈ ${(SIM.stats.commandsProcessed / Math.max(1, SIM.time)).toFixed(1)} 条/s`; },
      demoBtn: { label: '▶ 演示:连发三条指令', kind: 'cmds' }
    },

    /* ────────────── 第6章 渲染 ────────────── */
    {
      title: '⑦ 渲染:从 rGL 固定管线到 WebGL',
      html: () => `
<p>原版图形层 <span style="font-family:monospace">src/rgl/</span>(150+ 文件)抽象了三种后端:<b>Direct3D 6</b>、<b>3dfx Glide</b>、<b>软件光栅化</b>。1999 年只有固定管线:顶点变换走硬件 T&L,光照是 Gouraud,最终画面靠大量 32 位软件混合(引擎尾焰/激光是 CPU 算的)。</p>
<p>三层对照:</p>
<table>
  <tr><th>1999 原版</th><th>🎮 真机 wasm</th><th>🔬 沙盒</th></tr>
  <tr><td>rGL → D3D6/Glide/软渲染</td><td>rGL → Emscripten SDL2 → WebGL</td><td>three.js → WebGL</td></tr>
  <tr><td>.peo 网格 + .lip 动画</td><td>同一套 .big 资源(demo 67MB)</td><td>程序化几何(代码画船)</td></tr>
  <tr><td>Win32 窗口</td><td>Canvas + SharedArrayBuffer 线程</td><td>rAF 单线程</td></tr>
</table>
<p><b>演示</b>:切换线框模式,看清沙盒舰船的三角面结构——真机的船是几万面的 .peo 模型,原理相同。</p>`,
      code: null,
      live: el => { el.textContent = `沙盒网格 = ${UI.shipMeshes.size} 艘舰 + ${UI.bulletPool ? UI.bulletPool.length : 0} 弹池\n线框 = ${UI.wireframe ? 'ON' : 'OFF'}\nSOI 半径 = ${SIM.worldRadius} m`; },
      demoBtn: { label: '▶ 演示:线框模式', kind: 'wireframe' }
    },

    /* ────────────── 第7章 操作 ────────────── */
    {
      title: '⑧ 操作手册',
      html: () => `
<h4 style="color:var(--kushan)">🎮 真机游戏(原版键位)</h4>
<table>
  <tr><td>移动/攻击</td><td>右键点目标(点敌舰=攻击)</td></tr>
  <tr><td>传感器管理器</td><td>按住右键拖动 = 环绕旋转视角</td></tr>
  <tr><td>编队</td><td>选中后按 F 系列 / 菜单</td></tr>
  <tr><td>菜单导航</td><td>鼠标点击;无头环境可用 ↑↓ + Enter</td></tr>
</table>
<h4 style="color:var(--kushan)">🔬 原理沙盒</h4>
<table>
  <tr><td>左键 / 拖框</td><td>点选 / 框选(只选己方,同原版)</td></tr>
  <tr><td>右键</td><td>移动;点到敌舰 = 攻击</td></tr>
  <tr><td>A / S</td><td>攻击最近敌人 / 停止</td></tr>
  <tr><td>D / X</td><td>Δ 编队 / X 编队</td></tr>
  <tr><td>右键拖 / 滚轮</td><td>环绕视角 / 缩放;Shift+右键拖 = 平移</td></tr>
  <tr><td>空格</td><td>暂停(物理冻结,可继续转视角)</td></tr>
</table>
<h4 style="color:var(--kushan)">📦 资源</h4>
<p>真机游戏资源来自 Homeworld 官方 demo(可自由分发),加载脚本 <span style="font-family:monospace">web/engine/download.sh</span> 可随时重新下载;拥有正版可用原版/重制版 .big 替换 demo 资源获得完整战役。</p>`,
      code: null,
      live: el => { el.textContent = `沙盒世界: 舰船 ${SIM.ships.filter(s => !s.dead).length}存活 / 子弹 ${SIM.bullets.length}\n真机引擎: homeworld.wasm 3.3MB + homeworld.data 67MB(demo)`; },
      demoBtn: null
    }
  ],

  /* ── 初始化 UI ── */
  init() {
    const chapBox = document.getElementById('teach-chapters');
    this.chapters.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'btn'; b.textContent = c.title.split(':')[0];
      b.onclick = () => this.show(i);
      chapBox.appendChild(b);
    });
    document.getElementById('btn-prev').onclick = () => this.show((this.cur + this.chapters.length - 1) % this.chapters.length);
    document.getElementById('btn-next').onclick = () => this.show((this.cur + 1) % this.chapters.length);
    document.getElementById('btn-teach-close').onclick = () => this.toggle(false);
    document.getElementById('nav-teach').onclick = () => this.toggle(!this.open);
    this.show(0);
  },

  toggle(on) {
    this.open = on;
    document.getElementById('teach-panel').classList.toggle('open', on);
    document.getElementById('nav-teach').classList.toggle('active', on);
  },

  show(i) {
    this.stopDemo();
    this.cur = i;
    const c = this.chapters[i];
    document.getElementById('chap-title').textContent = c.title;
    document.getElementById('chap-pos').textContent = `${i + 1} / ${this.chapters.length}`;
    [...document.getElementById('teach-chapters').children].forEach((b, j) => b.classList.toggle('cur', j === i));
    const body = document.getElementById('teach-body');
    body.innerHTML = c.html();
    if (c.code) for (const blk of c.code) {
      const cite = document.createElement('span');
      cite.className = 'cite'; cite.textContent = '▸ ' + blk.src;
      body.appendChild(cite);
      const pre = document.createElement('pre');
      for (const line of blk.text.split('\n')) {
        const div = document.createElement('div');
        const hasCJK = /[\u4e00-\u9fff]/.test(line);
        if (hasCJK) { div.className = 'zh'; div.textContent = line; }
        else if (/^\s*\/\//.test(line) || /^#define/.test(line) && /REAPPROACH/.test(line)) { div.className = 'cm'; div.textContent = line; }
        else if (new RegExp('^\\s*(while|if|else|for|switch|case|void|bool|real32|udword|sdword|break)\\b').test(line)) { div.className = 'kw'; div.textContent = line; }
        else div.textContent = line;
        pre.appendChild(div);
      }
      body.appendChild(pre);
    }
    if (c.demoBtn) {
      const box = document.createElement('div');
      box.className = 'demo-box';
      const h = document.createElement('h4'); h.textContent = '场景联动演示'; box.appendChild(h);
      const mk = (spec) => {
        const b = document.createElement('button');
        b.className = 'btn'; b.textContent = spec.label;
        b.onclick = () => this.startDemo(spec.kind);
        box.appendChild(b); box.appendChild(document.createTextNode(' '));
      };
      mk(c.demoBtn); if (c.demoBtn2) mk(c.demoBtn2);
      const live = document.createElement('div');
      live.className = 'live'; live.id = 'teach-live';
      box.appendChild(live);
      body.appendChild(box);
    } else {
      const live = document.createElement('div');
      live.className = 'live'; live.id = 'teach-live';
      body.appendChild(live);
    }
    body.scrollTop = 0;
  },

  /* ── 演示控制 ── */
  startDemo(kind) {
    this.stopDemo();
    // 教学演示在沙盒里进行
    if (typeof switchView === 'function') switchView('sandbox');
    const d = { kind, t: 0, ships: [], drone: null };
    this.demo = d;
    switch (kind) {
      case 'impulse': case 'orbit': {
        const s = SIM.spawn('interceptor', 1, v3(kind === 'orbit' ? 0 : -800, kind === 'orbit' ? 0 : 300, 800));
        s.displayName = '演示机'; s.order = null;
        d.ships.push(s);
        SIM.selection = [s];
        SIM.vectorsOn = (kind === 'impulse');
        break;
      }
      case 'delta': case 'delta3d': {
        const ships = SIM.ships.filter(s => s.team === 1 && s.typeName === 'interceptor' && !s.dead).slice(0, 5);
        if (ships.length < 2) { this.toast('拦截机不足'); this.demo = null; return; }
        SIM.selection = ships;
        SIM.issue('formation', { ships, kind });
        break;
      }
      case 'strafe': {
        const drone = SIM.spawn('interceptor', 2, v3(1500, -900, 300));
        drone.dontapplyforceever = true; drone.hp = drone.maxHP = 1e9;
        drone.displayName = '靶机(不动)';
        const atk = SIM.spawn('interceptor', 1, v3(600, 400, 300));
        atk.displayName = '演示攻击机';
        d.ships.push(atk); d.drone = drone;
        atk.orderAttack(drone);
        SIM.selection = [atk];
        break;
      }
      case 'cmds': {
        const [a, b] = SIM.ships.filter(s => s.team === 1 && !s.dead && s.typeName === 'interceptor');
        if (a) SIM.issue('move', { ships: [a], pos: v3(0, 800, 400) });
        if (b) SIM.issue('move', { ships: [b], pos: v3(800, 0, -400) });
        SIM.issue('formation', { ships: SIM.ships.filter(s => s.team === 1 && s.typeName === 'interceptor' && !s.dead).slice(0, 5), kind: 'delta' });
        this.toast('3 条命令已入队,观察队列清空过程');
        break;
      }
      case 'wireframe': {
        UI.wireframe = !UI.wireframe;
        for (const m of UI.shipMeshes.values())
          m.traverse(o => { if (o.material) o.material.wireframe = UI.wireframe; });
        this.toast(`线框 ${UI.wireframe ? '开' : '关'}`);
        this.demo = null;
        return;
      }
    }
    if (d.ships[0]) { UI.focus = { ...d.ships[0].pos }; UI.camDist = Math.max(400, Math.min(1400, UI.camDist)); UI.updateCamera(); }
  },

  stopDemo() {
    if (!this.demo) { SIM.vectorsOn = false; return; }
    const d = this.demo;
    // 移除演示专用单位
    for (const s of d.ships) { s.dead = true; s.exploded = true; }
    if (d.drone) { d.drone.dead = true; d.drone.exploded = true; }
    if (d.kind === 'delta' || d.kind === 'delta3d') { SIM.formationGeo = null; SIM.formationSlots = null; }
    if (d.kind === 'wireframe' && UI.wireframe) {
      for (const m of UI.shipMeshes.values())
        m.traverse(o => { if (o.material) o.material.wireframe = false; });
      UI.wireframe = false;
    }
    SIM.vectorsOn = false;
    this.demo = null;
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.style.opacity = 1;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.style.opacity = 0, 2200);
  },

  /* ── 每帧:推进演示脚本 + 刷新实时数据(5Hz)── */
  frameUpdate(dt) {
    const d = this.demo;
    if (d) {
      d.t += dt;
      const s = d.ships[0];
      if (s && !s.dead) {
        if (d.kind === 'impulse') {
          s.applyForce(s.type.thrust, TRANS_FORWARD);      // 每帧前推(冲量语义)
          if (d.t > 2) { s.applyForce(s.type.thrust * 2.5, TRANS_UP); d.t = 0; }  // 每2秒上冲
          if (vLen(s.pos) > SIM.worldRadius * 0.7) { s.pos = v3(-s.pos.x * .9, -s.pos.y * .9, -s.pos.z * .9); s.vel = v3(); }
          UI.focus = { x: s.pos.x, y: s.pos.y, z: s.pos.z }; UI.updateCamera();
        } else if (d.kind === 'orbit') {
          const ang = SIM.time * 0.7;
          const p = v3(Math.cos(ang) * 900, Math.sin(ang) * 900, 600);
          s.orderMove(p, -1);
          UI.focus = { x: s.pos.x, y: s.pos.y, z: s.pos.z }; UI.updateCamera();
        } else if (d.kind === 'strafe') {
          UI.focus = { x: (s.pos.x + d.drone.pos.x) / 2, y: (s.pos.y + d.drone.pos.y) / 2, z: (s.pos.z + d.drone.pos.z) / 2 };
          UI.updateCamera();
          if (d.drone.hp < 1e8) d.drone.hp = 1e9;           // 靶机不死,循环演示
        }
      }
    }
    // 实时数据节流刷新
    this.widgetT += dt;
    if (this.widgetT > 0.15) {
      this.widgetT = 0;
      const el = document.getElementById('teach-live');
      if (el && this.open) {
        const c = this.chapters[this.cur];
        if (c.live) c.live(el);
      }
    }
  }
};

function fmtV(v) { return `(${v.x.toFixed(0)},${v.y.toFixed(0)},${v.z.toFixed(0)})`; }
