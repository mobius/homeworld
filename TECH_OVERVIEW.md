# Homeworld 技术概览

## 项目简介

**Homeworld** 是 Relic Entertainment 于 1999 年发布的一款革命性的 3D 即时战略（RTS）游戏。这是该游戏的完整源代码，展示了 1990 年代末期游戏开发的技术成就。

### 游戏特色

- 全 3D 太空战斗环境
- 两种可玩种族（泰坦族和卡迪什族）
- 单人战役模式和多人对战模式
- 先进的 AI 系统（战斗和资源管理）
- 自定义 3D 图形引擎，支持多种渲染 API

---

## 技术栈

### 编程语言与工具

| 项目 | 技术 |
|------|------|
| **主要语言** | C 语言（约 90%） |
| **次要语言** | C++（约 10%，主要用于图形驱动） |
| **编译器** | Microsoft Visual C++ 6.0 / Intel C++ Compiler |
| **链接器** | Microsoft Linker |
| **目标平台** | Windows 95/98/NT (32位) |
| **指令集优化** | Intel Pentium Pro (G6) |

### 图形 API

- **Direct3D 6** - 主要 Windows 渲染器
- **3dfx Glide** - Voodoo 显卡硬件加速
- **软件光栅化** - 兼容性回退方案

### 核心库

| 库 | 用途 |
|----|------|
| **DirectX 6** | DirectDraw, Direct3D, DirectInput, DirectSound |
| **Win32 API** | Windows 系统调用 |
| **Winsock 2** | TCP/IP 网络通信 |
| **Bink Video** | 视频播放 |
| **Smacker** | 传统视频格式支持 |

---

## 项目结构

```
homeworld/
├── src/                    # 源代码目录
│   ├── Game/              # 核心游戏逻辑（700+ C 文件）
│   ├── rgl/               # Relic 图形库（150+ 文件）
│   ├── Win32/             # Windows 平台特定代码
│   ├── Ships/             # 飞船类别特定代码
│   ├── SinglePlayer/      # 单人战役系统
│   ├── Tutorials/         # 教程系统
│   └── Multiplayer/       # 多人游戏系统
├── include/               # 公共头文件
├── tools/                 # 构建工具和资产工具
├── docs/                  # 技术文档
└── BigFiles/             # 打包的游戏资产
```

---

## 架构设计模式

### 1. 实体-组件-系统 (ECS)

游戏对象（飞船、小行星等）使用组合而非继承：

```c
// SpaceObj 是所有游戏对象的基础
typedef struct {
    sdword objID;
    ubyte type;
    vector position;
    vector velocity;
    // ... 更多组件
} SpaceObj;
```

### 2. 状态机模式

AI 系统使用有限状态机管理行为：

```c
// AI 状态示例
enum AIState {
    AI_STATE_IDLE,
    AI_STATE_ATTACKING,
    AI_STATE_DEFENDING,
    AI_STATE_RETREATING
};
```

### 3. 发布-订阅模式

事件系统用于 AI 和游戏事件通信：

```c
// 事件发布
evtSendEvent(shipID, EVENT_SHIP_DESTROYED);

// 事件订阅
evtRegisterHandler(EVENT_SHIP_DESTROYED, shipDestroyedHandler);
```

### 4. 插件架构

渲染系统支持多个后端：

- `rgl.dll` - OpenGL 抽象层
- `rgld3d.dll` - Direct3D 实现
- `rglsw.dll` - 软件渲染器

---

## 核心系统

### 1. 宇宙系统 (Universe)

**文件**: `src/Game/universe.c`

全局游戏状态管理器，负责：
- 游戏世界�化和清理
- 游戏循环调度
- 所有游戏对象的容器
- 物理模拟协调

### 2. 选择系统 (Selection)

**文件**: `src/Game/select.c`

处理玩家单位选择和编组：
- 单个/框选单位
- 编组管理（数字键 0-9）
- 选择过滤器（同类单位选择）

### 3. AI 系统

**核心文件**:
- `src/Game/AIPlayer.c` - 高级 AI 策略
- `src/Game/AIFleetMan.c` - 舰队管理
- `src/Game/AIAttackMan.c` - 战斗 AI
- `src/Game/AIMoves.c` - 战术移动

AI 层次结构：
```
AIPlayer (战略层)
    ├─ AIFleetMan (舰队管理)
    │   └─ AIAttackMan (战斗管理)
    │       └─ 战术移动和开火决策
```

### 4. 战斗系统

**文件**: `src/Game/battle.c`

战斗结算逻辑：
- 武器伤害计算
- 护盾和装甲处理
- 船舶摧毁判定

### 5. 网络系统

**核心文件**:
- `src/Game/CommandNetwork.c` - 多人游戏命令网络
- `src/Game/MultiplayerGame.c` - 游戏会话管理
- `src/Game/titannet.c` - Relic 在线服务集成（已废弃）

网络特性：
- 确定性游戏状态同步
- 命令队列系统
- 延迟补偿
- 最多支持 8 人对战

### 6. 图形引擎 (RGL)

**目录**: `src/rgl/`

Relic 图形库是一个自定义的 3D 引擎：

**核心组件**:
- `kgl.c` - 内核图形库
- `d3driver.cpp` - Direct3D 驱动
- `draw.cpp` - 渲染管线
- `mesh.c` - 3D 模型加载和渲染
- `camera.c` - 摄像机系统

**渲染管线**:
```
场景图遍历 → 视锥体剔除 → LOD 选择 → 排序 → 渲染
```

---

## 构建系统

### 构建工具

| 工具 | 用途 |
|------|------|
| **Biggie** | 将资产打包成 Big 文件 |
| **BigTree** | 资产管理工具 |
| **Builder** | 关卡/战役编辑器 |
| **FEMan** | 字体编辑器 |
| **BTG** | 二进制文本生成器 |

### 构建流程

1. **资产打包**: 使用 Biggie 将资源打包到 `.big` 文件
2. **源码编译**: C/C++ 源码编译为目标文件
3. **链接**: 生成 DLL（rgl, rgld3d, rglsw）和主可执行文件
4. **调试符号**: Debug 版本包含调试信息

### 编译器标志

```
# 优化设置
/O2         # 最大速度优化
/G6         # Pentium Pro 优化
/Ob2        # 内联扩展

# 调试设置
/Zi         # 调试信息
/Od         # 禁用优化（Debug）
```

---

## 性能优化技术

### 1. 层次细节 (LOD)

根据距离使用不同质量的模型：

```c
if (distance < 1000) useLOD(0);       // 高细节
else if (distance < 5000) useLOD(1);  // 中细节
else useLOD(2);                       // 低细节
```

### 2. 视锥体剔除

只渲染视野内的对象：

```c
if (!frustumContains(object)) continue;
```

### 3. 空间分区

使用空间哈希加速碰撞检测和渲染查询。

### 4. 批处理渲染

批量渲染相同材质的对象以减少状态切换。

---

## 入口点

### 主应用入口

**文件**: `src/Win32/main.c`

```c
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
                   LPSTR lpCmdLine, int nCmdShow)
{
    // 1. Windows 应用程序初始化
    win32Initialize();

    // 2. 渲染器初始化（D3D/Glide/SW）
    rendererInitialize();

    // 3. 宇宙/世界初始化
    universeInitialize();

    // 4. 主游戏循环
    while (gameRunning) {
        processInput();
        updateGame();
        renderFrame();
        networkUpdate();
    }

    return 0;
}
```

---

## 依赖关系图

```
┌─────────────────────────────────────────┐
│          Win32 Platform Layer           │
│  (Window Management, Input, File I/O)   │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼──────────┐    ┌────────▼────────┐
│   Game Logic │    │  RGL Graphics   │
│   (C Files)  │◄───┤     Engine      │
│              │    │   (C/C++)       │
└───┬──────────┘    └────────┬────────┘
    │                        │
    │                ┌───────┴────────┐
    │                │                │
┌───▼──────┐  ┌─────▼─────┐  ┌──────▼──────┐
│ Universe │  │ Direct3D  │  │   Glide     │
│ AI       │  │  Driver   │  │   Driver    │
│ Physics  │  └───────────┘  └─────────────┘
└──────────┘
```

---

## 关键技术成就

### 1. 自定义 3D 引擎

在 DirectX 3D 加速尚未普及的时代，Homeworld 实现了：
- 完整的软件渲染器
- 多 API 硬件加速
- 动态光照和阴影
- 粒子系统效果

### 2. 高级 AI 系统

- 分层 AI 架构（战略、战术、操作）
- 动态舰队编成
- 自适应战斗策略
- 资源管理 AI

### 3. 网络同步

- 确定性游戏状态
- 低延迟命令传播
- 防作弊机制

### 4. 模块化设计

清晰的关注点分离：
- 平台代码隔离
- 渲染器可插拔
- 游戏逻辑与渲染解耦

---

## 开发资源

### 进一步阅读

- [游戏架构文档](GAME_ARCHITECTURE.md) - 详细架构说明
- [图形引擎文档](GRAPHICS_ENGINE.md) - RGL 引擎深度解析
- [AI 系统文档](AI_SYSTEM.md) - AI 系统完整分析
- [网络系统文档](NETWORKING.md) - 多人游戏技术

### 代码位置

- **核心游戏逻辑**: `src/Game/`
- **图形引擎**: `src/rgl/`
- **平台层**: `src/Win32/`

---

*文档生成日期: 2026-01-08*
