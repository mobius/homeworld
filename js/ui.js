/* ============================================================================
 * UI 层 —— three.js 渲染 / 相机 / 输入 / HUD
 * 原版对应:rGL 渲染 + ratInput 鼠标层 + select.c 框选 + CommandLayer 指令
 * ==========================================================================*/

"use strict";

const UI = {
  scene: null, camera: null, renderer: null,
  shipMeshes: new Map(),      // ship.id → THREE.Group
  selRings: new Map(),        // ship.id → ring mesh
  markers: [],                // 一次性标记(移动点/爆炸)
  vectorArrows: [],           // 教学矢量箭头
  slotMarkers: new Map(),     // 编队槽位
  focus: { x: 0, y: 0, z: 0 },// 相机注视点(传感器管理器式环绕)
  camDist: 1800, camYaw: -0.7, camPitch: 0.55,
  logDirty: true,
  lastT: 0, acc: 0, fpsT: 0, fpsN: 0,
  boxSel: null,

  init() {
    const W = () => window.innerWidth, H = () => window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(W(), H());
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.getElementById('scene').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020409);
    // 原版坐标系 z-up:让 three 跟随
    this.camera = new THREE.PerspectiveCamera(55, W() / H(), 1, 60000);
    this.camera.up.set(0, 0, 1);
    this.updateCamera();

    // 光照(原版 rGL 固定管线灯光的等价物)
    this.scene.add(new THREE.AmbientLight(0x404860, 1.1));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(3000, -2000, 2500);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x6688cc, 0.5);
    fill.position.set(-2500, 1500, -1000);
    this.scene.add(fill);

    this.makeStars();
    this.makeSOI();
    this.bindInput();
    window.addEventListener('resize', () => {
      this.camera.aspect = W() / H(); this.camera.updateProjectionMatrix();
      this.renderer.setSize(W(), H());
    });
    document.getElementById('fps').textContent = '';
  },

  makeStars() {
    const n = 2600, pos = new Float32Array(n * 3), R = 45000;
    for (let i = 0; i < n; i++) {
      // 均匀球面
      const z = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      pos[i * 3] = R * r * Math.cos(th); pos[i * 3 + 1] = R * r * Math.sin(th); pos[i * 3 + 2] = R * z;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd2ee, size: 60, sizeAttenuation: true })));
  },

  makeSOI() {
    const g = new THREE.SphereGeometry(SIM.worldRadius, 36, 18);
    this.soi = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x2a4a78, wireframe: true, transparent: true, opacity: 0.12
    }));
    this.scene.add(this.soi);
  },

  /* ── 舰船程序化模型(无外部资产;原版为 .peo 网格)── */
  buildShipMesh(ship) {
    const grp = new THREE.Group();
    const col = ship.team === 1 ? 0x8fb2d8 : 0xd89088;
    const dark = ship.team === 1 ? 0x39536e : 0x6e3a34;
    const S = ship.type.scale;
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    switch (ship.typeName) {
      case 'mothership': {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(30, 130, 500), mat(dark));
        hull.castShadow = false;
        const spine = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 180, 8), mat(col));
        spine.rotation.x = Math.PI / 2; spine.position.z = 120;
        const pod1 = new THREE.Mesh(new THREE.BoxGeometry(70, 70, 160), mat(col));
        pod1.position.set(0, 0, -190);
        grp.add(hull, spine, pod1);
        break;
      }
      case 'carrier': {
        const hull = new THREE.Mesh(new THREE.BoxGeometry(26, 70, 240), mat(dark));
        const deck = new THREE.Mesh(new THREE.BoxGeometry(60, 90, 60), mat(col));
        deck.position.z = 20;
        grp.add(hull, deck);
        break;
      }
      case 'interceptor':
      case 'bomber': {
        const L = ship.typeName === 'bomber' ? 1.35 : 1.0;
        const body = new THREE.Mesh(new THREE.ConeGeometry(2.2 * L, 14 * L, 6), mat(col));
        body.rotation.x = Math.PI / 2;   // 锥尖朝 +z(前向)
        const wing = new THREE.Mesh(new THREE.BoxGeometry(16 * L, 0.6, 5 * L), mat(dark));
        wing.position.z = -2 * L;
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6 * L, 4 * L), mat(dark));
        fin.position.z = -3 * L;
        grp.add(body, wing, fin);
        break;
      }
      case 'collector': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 14), mat(col));
        const jaw = new THREE.Mesh(new THREE.ConeGeometry(4, 8, 4), mat(dark));
        jaw.rotation.x = -Math.PI / 2; jaw.position.z = 9;
        grp.add(body, jaw);
        break;
      }
      default: grp.add(new THREE.Mesh(new THREE.SphereGeometry(5, 8, 8), mat(col)));
    }
    // 模型容器:倾斜(bank)只作用于模型,不污染物理 coordsys
    const inner = new THREE.Group();
    while (grp.children.length) inner.add(grp.children[0]);
    const outer = new THREE.Group();
    outer.add(inner);
    outer.userData.inner = inner;
    return outer;
  },

  /* ── 主循环:rAF + 固定步长累加器 ── */
  animate: function () {
    requestAnimationFrame(() => UI.animate());
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - UI.lastT) / 1000);
    UI.lastT = now;
    if (!SIM.paused) {
      UI.acc += frameDt * SIM.speed;
      let steps = 0;
      while (UI.acc >= SIM.dt && steps < 8) { SIM.update(SIM.dt); UI.acc -= SIM.dt; steps++; }
    } else if (SIM.singleStep) { SIM.update(SIM.dt); SIM.singleStep = false; }
    UI.syncScene();
    if (typeof TEACH !== 'undefined') TEACH.frameUpdate(frameDt);
    UI.renderer.render(UI.scene, UI.camera);
    UI.updateHUD();
    UI.fpsN++;
    if (now - UI.fpsT > 800) {
      document.getElementById('fps').textContent =
        `${Math.round(UI.fpsN * 1000 / (now - UI.fpsT))} fps · sim ×${SIM.speed}${SIM.paused ? ' · 已暂停' : ''}`;
      UI.fpsT = now; UI.fpsN = 0;
    }
  },

  syncScene() {
    for (const s of SIM.ships) {
      if (s.dead) { this.removeShipMesh(s); continue; }
      let m = this.shipMeshes.get(s.id);
      if (!m) {
        m = this.buildShipMesh(s);
        this.shipMeshes.set(s.id, m);
        this.scene.add(m);
      }
      m.position.set(s.pos.x, s.pos.y, s.pos.z);
      m.quaternion.set(s.coordsys.x, s.coordsys.y, s.coordsys.z, s.coordsys.w);
      m.userData.inner.rotation.z = s.bank;   // 视觉压坡度
      // 选中环
      let ring = this.selRings.get(s.id);
      const selected = SIM.selection.includes(s);
      if (selected && !ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(s.type.collSize * 1.6, s.type.collSize * 1.9, 32),
          new THREE.MeshBasicMaterial({ color: s.team === 1 ? 0x4da6ff : 0xff5544, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
        this.selRings.set(s.id, ring); this.scene.add(ring);
      } else if (!selected && ring) { this.scene.remove(ring); this.selRings.delete(s.id); }
      if (ring) { ring.position.set(s.pos.x, s.pos.y, s.pos.z); ring.lookAt(this.camera.position); }
    }
    // 子弹
    if (!this.bulletPool) this.bulletPool = [];
    while (this.bulletPool.length < SIM.bullets.length) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(8, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffdd88 }));
      this.bulletPool.push(b); this.scene.add(b);
    }
    this.bulletPool.forEach((mesh, i) => {
      const b = SIM.bullets[i];
      mesh.visible = !!b;
      if (b) mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    });
    // 编队槽位
    const slots = SIM.formationSlots || [];
    while (this.slotMarkers.size < slots.length) {
      const mk = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 2),
        new THREE.MeshBasicMaterial({ color: 0xffcc66, wireframe: true }));
      this.slotMarkers.set(this.slotMarkers.size, mk); this.scene.add(mk);
    }
    this.slotMarkers.forEach((mk, i) => {
      const sl = slots[i];
      mk.visible = !!sl;
      if (sl) mk.position.set(sl.pos.x, sl.pos.y, sl.pos.z);
    });
  },

  removeShipMesh(s) {
    const m = this.shipMeshes.get(s.id);
    if (m) { this.scene.remove(m); this.shipMeshes.delete(s.id); }
    const r = this.selRings.get(s.id);
    if (r) { this.scene.remove(r); this.selRings.delete(s.id); }
    if (!SIM.ships.some(x => x.dead)) { /* 全部清理完后回收爆炸标记 */ }
  },

  /* ── 相机:传感器管理器式环绕(右键拖动旋转/滚轮缩放/Shift 平移)── */
  updateCamera() {
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    this.camera.position.set(
      this.focus.x + this.camDist * cp * Math.cos(this.camYaw),
      this.focus.y + this.camDist * cp * Math.sin(this.camYaw),
      this.focus.z + this.camDist * sp);
    this.camera.lookAt(this.focus.x, this.focus.y, this.focus.z);
  },

  bindInput() {
    const el = this.renderer.domElement;
    let btn = -1, lx = 0, ly = 0, downX = 0, downY = 0, dragging = false;
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('mousedown', e => {
      btn = e.button; lx = downX = e.clientX; ly = downY = e.clientY; dragging = false;
    });
    window.addEventListener('mousemove', e => {
      if (btn < 0) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 6) dragging = true;
      if (btn === 2 && !e.shiftKey) {          // 右键拖 = 环绕(原版传感器管理器)
        this.camYaw -= dx * 0.005;
        this.camPitch = Math.max(-1.45, Math.min(1.45, this.camPitch + dy * 0.005));
      } else if (btn === 2 && e.shiftKey || btn === 1) {  // 平移
        const s = this.camDist * 0.0016;
        const fx = -Math.sin(this.camYaw), fy = Math.cos(this.camYaw);
        this.focus.x += (-dx * fy) * s + (dy * Math.cos(this.camPitch) * fx) * s;
        this.focus.y += (dx * fx) * s + (dy * Math.cos(this.camPitch) * fy) * s;
        this.focus.z += dy * Math.sin(this.camPitch) * s * -1;
      }
      lx = e.clientX; ly = e.clientY;
      this.updateCamera();
    });
    window.addEventListener('mouseup', e => {
      if (btn === 0 && !dragging) this.pick(e);                    // 左键点选
      else if (btn === 0 && dragging) this.boxPick(downX, downY, e.clientX, e.clientY);
      else if (btn === 2 && !dragging) this.order(e);              // 右键 = 命令
      btn = -1;
      this.clearBox();
    });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      this.camDist = Math.max(150, Math.min(20000, this.camDist * (e.deltaY > 0 ? 1.12 : 0.89)));
      this.updateCamera();
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
      else if (e.key === 'a' || e.key === 'A') this.issueAttackNearest();
      else if (e.key === 's' || e.key === 'S') SIM.issue('stop', { ships: SIM.selection.slice() });
      else if (e.key === 'd' || e.key === 'D') SIM.issue('formation', { ships: SIM.selection.slice(), kind: 'delta' });
      else if (e.key === 'x' || e.key === 'X') SIM.issue('formation', { ships: SIM.selection.slice(), kind: 'delta3d' });
    });
    // 顶栏按钮
    document.getElementById('btn-pause').onclick = () => this.togglePause();
    document.getElementById('btn-speed').onclick = () => {
      SIM.speed = SIM.speed >= 4 ? 0.5 : SIM.speed * 2;
      document.getElementById('btn-speed').textContent = `速度 ×${SIM.speed}`;
    };
    document.getElementById('btn-soi').onclick = e => {
      SIM.showSOI = !SIM.showSOI; this.soi.visible = SIM.showSOI;
      e.currentTarget.classList.toggle('active', SIM.showSOI);
    };
    document.getElementById('btn-delta').onclick = () => SIM.issue('formation', { ships: SIM.selection.slice(), kind: 'delta' });
    document.getElementById('btn-x').onclick = () => SIM.issue('formation', { ships: SIM.selection.slice(), kind: 'delta3d' });
    document.getElementById('btn-cam').onclick = () => {
      this.focus = { x: 0, y: 0, z: 0 }; this.camDist = 1800; this.updateCamera();
    };
    document.getElementById('btn-soi').classList.add('active');
  },

  togglePause() {
    SIM.paused = !SIM.paused;
    document.getElementById('btn-pause').textContent = SIM.paused ? '▶ 继续' : '⏸ 暂停';
    document.getElementById('btn-pause').classList.toggle('active', SIM.paused);
  },

  /* ── 拾取(select.c 的 raycast 等价物)── */
  raycast(x, y) {
    const ndc = new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    let best = null, bd = Infinity;
    for (const s of SIM.ships) {
      if (s.dead) continue;
      const hit = rc.ray.intersectSphere
        ? (() => { const sph = new THREE.Sphere(new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), s.type.collSize * 1.8); const out = new THREE.Vector3(); return rc.ray.intersectSphere(sph, out) ? rc.ray.origin.distanceTo(out) : null; })()
        : null;
      if (hit !== null && hit < bd) { bd = hit; best = s; }
    }
    return best;
  },

  pick(e) {
    const s = this.raycast(e.clientX, e.clientY);
    SIM.selection = s ? [s] : [];
  },

  boxPick(x0, y0, x1, y1) {
    const lo = { x: Math.min(x0, x1), y: Math.min(y0, y1) };
    const hi = { x: Math.max(x0, x1), y: Math.max(y0, y1) };
    const v = new THREE.Vector3();
    SIM.selection = SIM.ships.filter(s => {
      if (s.dead || s.team !== 1) return false;      // 框选只选己方(原版行为)
      v.set(s.pos.x, s.pos.y, s.pos.z).project(this.camera);
      const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      return sx >= lo.x && sx <= hi.x && sy >= lo.y && sy <= hi.y;
    });
  },

  clearBox() { /* 框选视觉略:拖拽轨迹已由系统光标提示 */ },

  /* ── 右键命令:点到敌舰=攻击,否则移动 ── */
  order(e) {
    if (!SIM.selection.length) return;
    const hit = this.raycast(e.clientX, e.clientY);
    const sel = SIM.selection.filter(s => !s.dead);
    if (hit && hit.team !== SIM.selection[0].team && sel[0].type.gunRange > 0)
      SIM.issue('attack', { ships: sel, target: hit });
    else {
      // 射线与 z=hitZ 平面求交,得 3D 移动点
      const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.focus.z);
      const out = new THREE.Vector3();
      if (rc.ray.intersectPlane(plane, out)) {
        SIM.issue('move', { ships: sel, pos: { x: out.x, y: out.y, z: out.z } });
        this.spawnMarker(out, 0x4da6ff);
      }
    }
  },

  issueAttackNearest() {
    const sel = SIM.selection.filter(s => !s.dead && s.type.gunRange > 0);
    if (!sel.length) return;
    let best = null, bd = Infinity;
    for (const s of SIM.ships) {
      if (s.dead || s.team === sel[0].team) continue;
      const d = vDist(s.pos, sel[0].pos);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { SIM.issue('attack', { ships: sel, target: best }); this.spawnMarker(best.pos, 0xff5544); }
  },

  spawnMarker(pos, color) {
    const mk = new THREE.Mesh(new THREE.RingGeometry(30, 40, 24),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    mk.position.set(pos.x, pos.y, pos.z);
    this.scene.add(mk);
    const t0 = performance.now();
    const fade = () => {
      const k = (performance.now() - t0) / 900;
      if (k >= 1) { this.scene.remove(mk); return; }
      mk.scale.setScalar(1 + k * 2); mk.material.opacity = 0.9 * (1 - k);
      requestAnimationFrame(fade);
    };
    fade();
  },

  /* ── 教学矢量箭头(ch1 用)── */
  setVectors(ship) {
    this.vectorArrows.forEach(a => this.scene.remove(a));
    this.vectorArrows = [];
    if (!ship || ship.dead || !SIM.vectorsOn) return;
    const mk = (dir, len, color) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(dir.x, dir.y, dir.z).normalize(),
        new THREE.Vector3(ship.pos.x, ship.pos.y, ship.pos.z), len, color, len * 0.18, len * 0.1);
      this.scene.add(a); this.vectorArrows.push(a);
    };
    const f = ship.applyForce ? ship : null;
    const fv = ship.lastForce || v3();
    if (vLen(fv) > 1) mk(fv, 120 + Math.min(400, vLen(fv) / ship.type.mass), 0xff5544);   // 力(红)
    if (ship.speed > 1) mk(ship.vel, 100 + ship.speed * 0.8, 0x55cc66);                   // 速度(绿)
    mk(ship.forward, 200, 0xffcc66);                                                      // 前向(金)
  },

  /* ── HUD 刷新 ── */
  updateHUD() {
    // 选中面板
    const list = document.getElementById('sel-list');
    if (SIM.selection.length) {
      let html = '';
      for (const s of SIM.selection.slice(0, 14)) {
        const pct = Math.max(0, s.hp / s.maxHP);
        const cls = pct < 0.25 ? 'crit' : pct < 0.6 ? 'low' : '';
        html += `<div class="sel-ship"><span class="nm">${s.displayName}</span>` +
          `<span class="st">${s.aiState}</span>` +
          `<div class="hpbar ${cls}"><div style="width:${(pct * 100) | 0}%"></div></div></div>`;
      }
      if (SIM.selection.length > 14) html += `<div style="color:var(--muted)">… 其余 ${SIM.selection.length - 14} 艘</div>`;
      list.innerHTML = html;
    } else list.innerHTML = '<div style="color:var(--muted)">未选中任何单位</div>';
    // 日志
    if (this.logDirty) {
      this.logDirty = false;
      document.getElementById('log-list').innerHTML = SIM.events.slice(0, 12)
        .map(e => `<div class="ev ${e.cls}"><b>[${e.t.toFixed(1)}s]</b> ${e.text}</div>`).join('');
    }
    // 教学矢量跟随
    if (SIM.vectorsOn && SIM.selection.length === 1) {
      const s = SIM.selection[0];
      if (this.vectorArrows.length) {
        // 就地更新位置
        const base = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
        this.vectorArrows[0].position.copy(base);
        this.vectorArrows[1] && this.vectorArrows[1].position.copy(base);
        this.vectorArrows[2] && this.vectorArrows[2].position.copy(base);
        if (this.vectorArrows[0]) this.vectorArrows[0].setDirection(new THREE.Vector3((s.lastForce||v3()).x, (s.lastForce||v3()).y, (s.lastForce||v3()).z).normalize());
        if (this.vectorArrows[1]) this.vectorArrows[1].setDirection(new THREE.Vector3(s.vel.x, s.vel.y, s.vel.z).normalize());
      } else this.setVectors(s);
    } else if (this.vectorArrows.length) { this.setVectors(null); }
  }
};

/* 力矢量采样钩子:源码帧末 vecZeroVector(force) 清零,必须在物理帧前采样 */
const _shipPhysics = Ship.prototype.physics;
Ship.prototype.physics = function (dt) {
  this.lastForce = v3(this.force.x, this.force.y, this.force.z);
  _shipPhysics.call(this, dt);
};
