/* ============================================================================
 * Homeworld 原理沙盒 —— 物理与AI的忠实移植
 *
 * 本文件把原版引擎的关键子系统移植为等价 JavaScript:
 *   physApplyForceToObj        ← src/Game/physics.c:52
 *   physUpdateObjPosVelShip    ← src/Game/physics.c:639
 *   physUpdateBulletPosVel     ← src/Game/physics.c:184
 *   FormationCalculateOffsets  ← src/Game/formation.c:1399 (DELTA / DELTA3D)
 *   setupWhipStrafe 状态机     ← src/Ships/GenericInterceptor.c:364
 *   命令队列                   ← src/Game/CommandNetwork.c (Enqueue→ProcessCmdPktQ)
 *
 * 坐标系保持原版约定:z 轴为上下,舰船在 x/y 平面机动。
 * 数值标注 ~ 的是近似演示值;其余语义与源码一致。
 * ==========================================================================*/

"use strict";

/* ── TRANS_* 方向常量(与原版枚举一致,&1 即反方向)── */
const TRANS_UP = 0, TRANS_DOWN = 1, TRANS_RIGHT = 2, TRANS_LEFT = 3,
      TRANS_FORWARD = 4, TRANS_BACKWARD = 5;

/* ── AI 状态(对应原版 aistate / aistateattack)── */
const ST = {
  IDLE: 'IDLE', MOVE: 'MOVE', FORMATION: 'FORMATION',
  APPROACH: 'REAPPROACH', ATTACK_RUN: 'WHIPSTRAFE1', REGROUP: 'REGROUP',
  COLLECT: 'COLLECT', RETARGET: 'RETARGET'
};

/* ── 四元数最小实现(对应 rotinfo.coordsys 旋转矩阵)── */
function quatId() { return { x: 0, y: 0, z: 0, w: 1 }; }
function quatFromYawPitch(yaw, pitch) {          // z-up: yaw绕z, pitch绕横轴y
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return { x: sp * cy, y: sp * sy, z: 0, w: cp * cy + 0 };
}
function quatMul(a, b) {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}
function quatRotate(q, v) {  // 旋转向量
  const { x, y, z, w } = q;
  const tx = 2 * (y * v.z - z * v.y), ty = 2 * (z * v.x - x * v.z), tz = 2 * (x * v.y - y * v.x);
  return {
    x: v.x + w * tx + (y * tz - z * ty),
    y: v.y + w * ty + (z * tx - x * tz),
    z: v.z + w * tz + (x * ty - y * tx)
  };
}
function quatFromTo(dirFrom, dirTo) { // 最短弧旋转
  const dot = Math.max(-1, Math.min(1, dirFrom.x * dirTo.x + dirFrom.y * dirTo.y + dirFrom.z * dirTo.z));
  if (dot > 0.999999) return quatId();
  const ax = dirFrom.y * dirTo.z - dirFrom.z * dirTo.y;
  const ay = dirFrom.z * dirTo.x - dirFrom.x * dirTo.z;
  const az = dirFrom.x * dirTo.y - dirFrom.y * dirTo.x;
  const s = Math.sqrt((1 + dot) * 2);
  return { x: ax / s, y: ay / s, z: az / s, w: s / 2 };
}
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const vAdd = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const vSub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const vScale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
const vDot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const vLen = a => Math.sqrt(vDot(a, a));
const vNorm = a => { const l = vLen(a); return l > 1e-9 ? vScale(a, 1 / l) : v3(); };
const vDist = (a, b) => vLen(vSub(a, b));
function vCap(a, max) { // vecCapVectorSloppy
  const l2 = vDot(a, a);
  if (l2 > max * max) return vScale(a, max / Math.sqrt(l2));
  return a;
}

/* ── 舰船静态数据(ShipStaticInfo 的演示近似)──
 * maxVelocity 参考原版:拦截机 325m/s,轰炸机 230m/s,采集船 ~150m/s */
const SHIP_TYPES = {
  mothership: {
    name: 'Mothership', cn: '母舰', mass: 400000, thrust: 400000 * 60,
    maxVelocity: 30, maxTurn: 0.02, maxBank: 0, hp: 48000, collSize: 130,
    gunRange: 0, gunDamage: 0, gunCooldown: 0, scale: 26, isCapital: true
  },
  interceptor: {
    name: 'Interceptor', cn: '拦截机', mass: 140, thrust: 140 * 400,
    maxVelocity: 325, maxTurn: 1.8, maxBank: 0.9, hp: 160, collSize: 7,
    gunRange: 600, gunDamage: 9, gunCooldown: 0.5, scale: 1.4
  },
  bomber: {
    name: 'Attack Bomber', cn: '攻击轰炸机', mass: 210, thrust: 210 * 300,
    maxVelocity: 230, maxTurn: 1.2, maxBank: 0.8, hp: 220, collSize: 9,
    gunRange: 550, gunDamage: 26, gunCooldown: 1.6, scale: 1.6
  },
  carrier: {
    name: 'Carrier', cn: '航空母舰', mass: 130000, thrust: 130000 * 40,
    maxVelocity: 50, maxTurn: 0.05, maxBank: 0, hp: 22000, collSize: 90,
    gunRange: 900, gunDamage: 40, gunCooldown: 2.0, scale: 14, isCapital: true
  },
  collector: {
    name: 'Resource Collector', cn: '资源采集船', mass: 1200, thrust: 1200 * 90,
    maxVelocity: 150, maxTurn: 0.6, maxBank: 0.3, hp: 1800, collSize: 16,
    gunRange: 0, gunDamage: 0, gunCooldown: 0, scale: 2.6
  }
};

/* ════════════════════════ SIM 主对象 ════════════════════════ */
const SIM = {
  dt: 1 / 30,                 // 固定物理步长(原版 PHYSICS_SLICE?)
  time: 0, frame: 0,
  speed: 1, paused: false,
  worldRadius: 6000,          // 任务球半径(原版 sphere of influence)
  ships: [], bullets: [], asteroids: [],
  commandQueue: [],           // 命令队列(CommandNetwork 同构)
  selection: [],
  nextId: 1,
  showSOI: true,
  vectorsOn: false,           // 教学模式矢量显示
  formationSlots: null,       // 教学模式编队槽位显示
  events: [],
  stats: { bulletsFired: 0, commandsProcessed: 0 },

  log(ev, cls) {
    this.events.unshift({ t: this.time, text: ev, cls: cls || '' });
    if (this.events.length > 40) this.events.pop();
    if (typeof UI !== 'undefined') UI.logDirty = true;
  },

  /* ── 世界初始化:复刻教学关布局 ── */
  init() {
    const K = 1, T = 2; // 队伍:1=库申(玩家) 2=泰坦(敌)
    this.spawn('mothership', K, v3(-300, -300, 0)).name = '母舰「卡拉克」';
    for (let i = 0; i < 6; i++)
      this.spawn('interceptor', K, v3(600 + i * 90, -150 - (i % 2) * 120, (i % 3) * 60));
    for (let i = 0; i < 3; i++)
      this.spawn('bomber', K, v3(500 + i * 110, 150, 60 + i * 40));
    this.spawn('collector', K, v3(200, 500, -100));

    const ec = this.spawn('carrier', T, v3(3400, -2600, 400));
    ec.name = '敌航母';
    for (let i = 0; i < 4; i++)
      this.spawn('interceptor', T, v3(3100 + i * 100, -2200 - (i % 2) * 100, 200 + i * 50));

    for (let i = 0; i < 4; i++)
      this.asteroids.push({ pos: v3(-1500 + i * 300, 1800 + (i % 2) * 400, (i % 3) * 200 - 200),
                            size: 60 + i * 25, ru: 1500 });
    this.log('世界初始化完成:2 队 15 舰 4 矿', '');
  },

  spawn(typeName, team, pos) {
    const s = new Ship(typeName, team, pos);
    this.ships.push(s);
    return s;
  },

  /* ── 命令层:所有玩家输入变成命令对象排队,模拟 CommandNetwork ── */
  issue(type, payload) {
    const cmd = { id: this.nextId++, type, payload, frame: this.frame };
    this.commandQueue.push(cmd);
    return cmd;
  },

  /* ── 固定步长更新(rAF 驱动,累加器在 UI 层)── */
  update(dt) {
    this.time += dt; this.frame++;
    // 1. 处理命令队列(原版:Enqueue 进包队列,帧首 ProcessCmdPktQ)
    while (this.commandQueue.length) {
      const cmd = this.commandQueue.shift();
      this.execCommand(cmd);
      this.stats.commandsProcessed++;
    }
    // 2. AI 决策
    for (const s of this.ships) s.updateAI(dt);
    // 3. 物理(原版逐对象 physUpdateObjPosVelShip)
    for (const s of this.ships) if (!s.dead) s.physics(dt);
    // 4. 子弹
    for (const b of this.bullets) b.update(dt);
    this.bullets = this.bullets.filter(b => !b.dead);
    // 5. 清理
    for (const s of this.ships) if (s.dead && !s.exploded) {
      s.exploded = true;
      this.log(`✦ ${s.displayName} 被摧毁`, 'kill');
    }
    const alive = this.ships.filter(s => !s.dead);
    if (alive.length !== this.ships.length) this.ships = alive;
    if (this.formationSlots) this.updateFormationSlots();
  },

  execCommand(cmd) {
    const p = cmd.payload;
    switch (cmd.type) {
      case 'move': {
        const ships = p.ships.filter(s => !s.dead);
        if (!ships.length) break;
        if (ships.length > 1) this.applyFormation(ships, 'delta', p.pos);
        ships.forEach((s, i) => s.orderMove(p.pos, ships.length > 1 ? i : -1));
        this.log(`指令#${cmd.id} 移动 → ${ships.length} 舰`, '');
        break;
      }
      case 'attack': {
        const ships = p.ships.filter(s => !s.dead && s.type.gunRange > 0);
        ships.forEach(s => s.orderAttack(p.target));
        this.log(`指令#${cmd.id} 攻击 ${p.target.displayName}`, '');
        break;
      }
      case 'stop':
        p.ships.forEach(s => { s.order = null; s.aiState = ST.IDLE; s.target = null; });
        break;
      case 'formation': {
        const ships = p.ships.filter(s => !s.dead);
        if (ships.length > 1) this.applyFormation(ships, p.kind);
        this.log(`指令#${cmd.id} ${p.kind === 'delta' ? 'Δ' : 'X'}编队 ${ships.length} 舰`, '');
        break;
      }
    }
  },

  /* ── FormationCalculateOffsets 移植(DELTA / DELTA3D 分支)──
   * 原:sep = collspheresize × formationPaddingModifier × tacticsFormationPadding
   *     右左交替累加,× DELTA_FORMATION_PADDING_SCALE(1.5)          */
  calculateFormationOffsets(ships, kind, facing) {
    const PADDING_SCALE = 1.5;               // DELTA_FORMATION_PADDING_SCALE
    const leader = ships[0];
    const fwd = facing || vNorm(leader.forward);
    const up = Math.abs(fwd.z) > 0.9 ? v3(1, 0, 0) : v3(0, 0, 1);
    const right = vNorm({ x: fwd.y * up.z - fwd.z * up.y, y: fwd.z * up.x - fwd.x * up.z, z: fwd.x * up.y - fwd.y * up.x });
    const upv = vNorm({ x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x });
    const offsets = [v3()];
    let rightSep = 0, leftSep = 0;
    for (let i = 1; i < ships.length; i++) {
      const sep = ships[i].type.collSize * PADDING_SCALE;
      const o = v3();
      if (kind === 'delta3d') {              // Formation X:上下交替
        if (i & 1) { rightSep += sep; o.x = rightSep; o.z = rightSep * 0.8; }
        else       { leftSep  += sep; o.x = -leftSep;  o.z = -leftSep * 0.8; }
      } else {                               // delta:右左交替
        if (i & 1) { rightSep += sep; o.x = rightSep; }
        else       { leftSep  += sep; o.x = -leftSep; }
        o.z = -vLen(o) * 0.5;                // 机翼向后掠
      }
      offsets.push(vAdd(vScale(right, o.x), vAdd(vScale(upv, o.z), vScale(fwd, kind === 'delta' ? -Math.abs(o.x) * 0.6 : 0))));
    }
    return { offsets, fwd, right, up: upv };
  },

  applyFormation(ships, kind) {
    const geo = this.calculateFormationOffsets(ships, kind);
    ships.forEach((s, i) => { s.formationIndex = i; s.formationOffset = geo.offsets[i]; });
    this.formationGeo = { ships: ships.slice(), kind, geo };
  },

  updateFormationSlots() {
    if (!this.formationGeo) return;
    const g = this.formationGeo;
    const alive = g.ships.filter(s => !s.dead);
    if (alive.length !== g.ships.length) { this.formationGeo = null; this.formationSlots = null; return; }
    const leader = g.ships[0];
    const center = vAdd(leader.pos, vScale(leader.forward, 200));
    this.formationSlots = g.geo.offsets.map((o, i) => ({ pos: vAdd(center, o), i }));
  }
};

/* ════════════════════════ Ship 类 ════════════════════════ */
class Ship {
  constructor(typeName, team, pos) {
    const id = SIM.nextId++;
    this.id = id;
    this.type = SHIP_TYPES[typeName];
    this.typeName = typeName;
    this.team = team;
    this.displayName = `${this.type.cn}-${id}`;
    this.pos = v3(pos.x, pos.y, pos.z);
    this.vel = v3();
    this.force = v3();                       // posinfo.force(帧末清零=冲量语义)
    this.torque = v3();                      // rotinfo.torque
    this.coordsys = quatId();                // rotinfo.coordsys
    this.rotspeed = v3();                    // rotinfo.rotspeed
    this.hp = this.type.hp; this.maxHP = this.type.hp;
    this.dead = false; this.exploded = false;
    this.aiState = ST.IDLE;
    this.target = null;
    this.order = null;                       // {kind:'move'|'attack', pos, target}
    this.gunTimer = 0;
    this.bank = 0;                           // 视觉倾斜角(源码 maxbank 行为)
    this.formLeader = null; this.formationIndex = -1; this.formationOffset = v3();
    this.strafe = null;                      // whip-strafe 子状态
    this.dontapplyforceever = false;         // 原版同名字段
  }
  get forward() { return quatRotate(this.coordsys, v3(0, 0, 1)); }   // 列3
  get right()   { return quatRotate(this.coordsys, v3(1, 0, 0)); }   // 列2
  get up()      { return quatRotate(this.coordsys, v3(0, 1, 0)); }   // 列1
  get speed() { return vLen(this.vel); }

  /* ── physApplyForceToObj 完整移植(src/Game/physics.c:52)── */
  applyForce(force, transdir) {
    if (this.dead) return;
    if (this.dontapplyforceever) return;
    // 源码此处还检查 SOF_Crazy;沙盒无疯狂状态
    let dir;
    switch (transdir) {
      case TRANS_UP: case TRANS_DOWN:    dir = this.up;      break; // 矩阵列1
      case TRANS_RIGHT: case TRANS_LEFT: dir = this.right;   break; // 列2
      default:                           dir = this.forward; break; // 列3
    }
    if (transdir & 1) force = -force;        // 奇数=反方向
    this.force = vAdd(this.force, vScale(dir, force));
  }

  /* ── 转向:力矩→角速度(physApplyRotToObj + 转动惯量)── */
  applyRot(torque, axis) { // axis: 'x'|'y'|'z'(沙盒简化为绕前向/横轴)
    if (axis === 'z') this.torque = vAdd(this.torque, v3(0, 0, torque));
    else this.torque = vAdd(this.torque, v3(torque, 0, 0));
  }

  /* ── physUpdateObjPosVelShip 移植(src/Game/physics.c:639)── */
  physics(dt) {
    const staticheader = this.type;
    // a = F/m → a = at → v = v + at
    const a = vScale(this.force, 1 / staticheader.mass * dt);
    this.vel = vAdd(this.vel, a);
    if (vDot(this.vel, this.vel) > 1e-12) {
      // cap velocity( tacticsGetShipsMaxVelocity → vecCapVectorSloppy )
      this.vel = vCap(this.vel, staticheader.maxVelocity);
      // d = vt → x = x + d
      this.pos = vAdd(this.pos, vScale(this.vel, dt));
    }
    // 机动出任务球:夹回(原版 sphere limit 行为)
    const r = vLen(this.pos);
    if (r > SIM.worldRadius) this.pos = vScale(this.pos, SIM.worldRadius / r);
    // 力矩→角速度→坐标系旋转
    if (this.torque.x || this.torque.z) {
      const maxrot = staticheader.maxTurn;
      this.rotspeed = vCap(vAdd(this.rotspeed, vScale(this.torque, dt / (staticheader.mass * 0.02))), maxrot);
      const ang = vLen(this.rotspeed) * dt;
      if (ang > 1e-9) {
        const axis = vNorm(this.rotspeed);
        // 绕任意轴的小角度旋转(等价 matMakeRotAboutX/Y/Z 级联)
        const half = ang / 2, s = Math.sin(half);
        const dq = { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) };
        this.coordsys = quatMul(dq, this.coordsys);
      }
    }
    // 视觉倾斜:侧向机动时压坡度(maxbank 行为)
    const lat = vDot(this.vel, this.right);
    const targetBank = Math.max(-this.type.maxBank, Math.min(this.type.maxBank, -lat / Math.max(1, this.type.maxVelocity) * this.type.maxBank * 2));
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 5);
    // 源码末尾:vecZeroVector(force); vecZeroVector(torque); ← 冲量语义!
    this.force = v3(); this.torque = v3();
  }

  /* ── 朝向目标以 maxTurn 限速转动 ── */
  turnToward(desiredDir, dt) {
    const cur = this.forward;
    const ang = Math.acos(Math.max(-1, Math.min(1, vDot(vNorm(cur), vNorm(desiredDir)))));
    const maxStep = this.type.maxTurn * dt;
    if (ang > 1e-5) {
      const step = Math.min(ang, maxStep);
      const axis = vNorm({ x: cur.y * desiredDir.z - cur.z * desiredDir.y,
                           y: cur.z * desiredDir.x - cur.x * desiredDir.z,
                           z: cur.x * desiredDir.y - cur.y * desiredDir.x });
      const half = step / 2, s = Math.sin(half);
      const dq = { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) };
      this.coordsys = quatMul(dq, this.coordsys);
    }
    return ang; // 剩余角误差
  }

  orderMove(pos, formationIndex) {
    this.order = { kind: 'move', pos, formationIndex: formationIndex ?? -1 };
    this.aiState = ST.MOVE; this.target = null; this.strafe = null;
  }
  orderAttack(target) {
    this.order = { kind: 'attack', target };
    this.aiState = ST.APPROACH; this.target = target;
  }

  /* ── AI:每帧决策(简化的 ship AI + whip-strafe 状态机)── */
  updateAI(dt) {
    if (this.dead) return;
    this.gunTimer -= dt;
    const o = this.order;
    if (o && o.kind === 'attack' && o.target && o.target.dead) { o = this.order = null; this.aiState = ST.IDLE; }

    // 被动反击:IDLE/MOVE 且被敌近身
    if ((!o || o.kind === 'move') && this.type.gunRange > 0) {
      const foe = this.findEnemyIn(this.type.gunRange * 3);
      if (foe && this.aiState === ST.IDLE) { this.orderAttack(foe); }
    }

    if (o && o.kind === 'move') {
      this.aiState = ST.MOVE;
      let goal = o.pos;
      if (o.formationIndex >= 0 && SIM.formationGeo) {
        const leader = SIM.formationGeo.ships[0];
        if (leader && leader !== this) goal = vAdd(vAdd(leader.pos, leader.forward), this.formationOffset);
      }
      this.seek(goal, dt, 0.15);
    } else if (o && o.kind === 'attack') {
      this.attackAI(dt, o.target);
    } else {
      this.aiState = ST.IDLE;
      // 缓慢减速(原版无惯性阻尼,沙盒加轻微稳定)
      if (this.speed > 1) this.applyForce(this.type.thrust * 0.001, TRANS_BACKWARD);
    }
  }

  findEnemyIn(range) {
    let best = null, bd = range;
    for (const s of SIM.ships) {
      if (s.dead || s.team === this.team) continue;
      const d = vDist(s.pos, this.pos);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /* ── whip-strafe 状态机移植(GenericInterceptor.c:528 起)── */
  attackAI(dt, target) {
    const dist = vDist(this.pos, target.pos);
    const optimum = this.type.gunRange * 0.6;        // WHIPSTRAFE_BULLETRANGEOPTIMUM
    if (this.aiState === ST.APPROACH) {
      this.seek(target.pos, dt, 0.05);
      if (dist < optimum) {
        // setupWhipStrafe:计算飞掠超越点(WHIPSTRAFE_FLYBYOVERSHOOT)
        const dir = vNorm(vSub(this.pos, target.pos));
        this.strafe = { overshoot: vAdd(target.pos, vScale(dir, optimum * 1.8)) };
        this.aiState = ST.ATTACK_RUN;
      }
    } else if (this.aiState === ST.ATTACK_RUN) {
      this.seek(this.strafe.overshoot, dt, 0.0);
      this.tryFire(target);
      if (vDist(this.pos, this.strafe.overshoot) < 150) this.aiState = ST.RETARGET;
    } else if (this.aiState === ST.RETARGET) {
      // TransitionToSTATE_REAPPROACH
      this.aiState = ST.APPROACH;
    } else this.aiState = ST.APPROACH;

    // 防撞:与目标过近时拉起
    if (dist < this.type.collSize + target.type.collSize) {
      this.applyForce(this.type.thrust, TRANS_UP);
    }
  }

  seek(goal, dt, arrive) {
    const toGoal = vSub(goal, this.pos);
    const dist = vLen(toGoal);
    const desired = vNorm(toGoal);
    const angErr = this.turnToward(desired, dt);
    const fwdDot = vDot(this.forward, desired);
    if (fwdDot > 0.2) {
      // 接近目标减速(arrive 半径内线性降速)
      const spdFrac = arrive > 0 ? Math.min(1, dist / (SIM.worldRadius * arrive)) : 1;
      this.applyForce(this.type.thrust * Math.max(0.12, spdFrac), TRANS_FORWARD);
    }
    return angErr;
  }

  tryFire(target) {
    if (this.type.gunRange <= 0 || this.gunTimer > 0) return;
    const toT = vSub(target.pos, this.pos);
    const dist = vLen(toT);
    if (dist > this.type.gunRange) return;
    const aim = vScale(toT, 1 / dist);
    if (vDot(this.forward, aim) < 0.9) return;    // triggerHappy 近似
    this.gunTimer = this.type.gunCooldown;
    SIM.bullets.push(new Bullet(this, target));
    SIM.stats.bulletsFired++;
  }

  takeDamage(dmg, attacker) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.hp <= 0) { this.dead = true; return; }
    // 被打时如果没事做就还手(被动攻击)
    if (this.type.gunRange > 0 && (!this.order || this.order.kind !== 'attack') && attacker && !attacker.dead)
      this.orderAttack(attacker);
  }
}

/* ── physUpdateBulletPosVel 移植(src/Game/physics.c:184)── */
class Bullet {
  constructor(shooter, target) {
    const muzzle = vAdd(shooter.pos, vScale(shooter.forward, shooter.type.collSize));
    this.pos = muzzle;
    this.vel = vScale(shooter.forward, 2500);          // 弹速
    this.damage = shooter.type.gunDamage;
    this.team = shooter.team;
    this.target = target;
    this.life = 2; this.dead = false;
  }
  update(dt) {
    this.pos = vAdd(this.pos, vScale(this.vel, dt));
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    for (const s of SIM.ships) {
      if (s.dead || s.team === this.team) continue;
      if (vDist(s.pos, this.pos) < s.type.collSize) {
        s.takeDamage(this.damage, null);
        this.dead = true;
        return;
      }
    }
  }
}
