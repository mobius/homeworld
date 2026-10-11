# Homeworld 游戏架构文档

## 概述

本文档详细描述 Homeworld 游戏的整体架构设计，包括主要系统、模块交互、数据流和执行流程。

## 目录

1. [系统架构](#系统架构)
2. [核心系统](#核心系统)
3. [游戏循环](#游戏循环)
4. [对象模型](#对象模型)
5. [命令系统](#命令系统)
6. [渲染系统](#渲染系统)
7. [物理系统](#物理系统)
8. [音频系统](#音频系统)
9. [UI系统](#ui系统)
10. [文件系统](#文件系统)

---

## 系统架构

### 顶层架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Win32 Platform Layer                      │
│  (Window Management, Input, File I/O, DirectX Interface)        │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┴────────────────────┐
        │                                         │
┌───────▼────────┐                     ┌──────────▼─────────┐
│  Game Systems  │                     │    RGL Graphics    │
│                │                     │      Engine        │
│ ┌────────────┐ │                     │ ┌────────────────┐ │
│ │ Universe   │ │                     │ │  kGL Core      │ │
│ │ Management │ │                     │ │  State Mgmt    │ │
│ └─────┬──────┘ │                     │ └────────┬───────┘ │
│ ┌─────┴──────┐ │                     │ ┌────────┴───────┐ │
│ │ Physics    │ │                     │ │  Renderers     │ │
│ │ Engine     │ │                     │ │  - D3D         │ │
│ └─────┬──────┘ │                     │ │  - Glide       │ │
│ ┌─────┴──────┐ │                     │ │  - Software    │ │
│ │ AI System  │ │                     │ └────────────────┘ │
│ │  - Player  │ │                     └─────────────────────┘
│ │  - Fleet   │ │
│ │  - Attack  │ │
│ └─────┬──────┘ │
│ ┌─────┴──────┐ │
│ │Networking  │ │
│ │ CommandNet │ │
│ └─────┬──────┘ │
└────────┼───────┘
         │
    ┌────┴─────┬──────────┬───────────┬────────────┐
    │          │          │           │            │
┌───▼───┐ ┌───▼───┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
│Sound  │ │Input  │ │Resource │ │Campaign │ │Research │
│System │ │System │ │ Manager │ │ System  │ │  System │
└───────┘ └───────┘ └─────────┘ └─────────┘ └─────────┘
```

---

## 核心系统

### 1. Universe (宇宙系统)

**文件**: `src/Game/universe.c`, `src/Game/universe.h`

Universe 是游戏的核心容器，管理所有游戏对象和全局状态。

#### 主要职责

```c
typedef struct {
    CommandLayer mainCommandLayer;      // 命令层
    CameraCommand mainCameraCommand;    // 摄像机命令

    LinkedList RenderList;              // 渲染列表
    LinkedList SpaceObjList;            // 空间对象列表
    LinkedList ShipList;                // 舰船列表
    LinkedList BulletList;              // 子弹列表
    LinkedList ResourceList;            // 资源列表
    LinkedList DerelictList;            # 残骸列表
    LinkedList MissileList;             # 导弹列表
    LinkedList effectList;              // 特效列表

    real32 phystimeelapsed;             // 物理时间
    real32 totaltimeelapsed;            // 总时间

    udword univUpdateCounter;           // 更新计数器
    Star3dInfo *star3dinfo;             // 星空信息
} Universe;
```

#### 核心功能

- **对象管理**: 创建、销毁和跟踪所有游戏对象
- **更新调度**: 协调所有系统的更新
- **渲染调度**: 管理渲染列表和渲染顺序
- **碰撞检测**: 管理碰撞检测系统
- **资源管理**: 管理资源分布和重生

#### 更新频率

```c
#define UNIVERSE_UPDATE_RATE 16          // 16 FPS 更新频率
#define UNIVERSE_UPDATE_PERIOD (1.0f/16.0f)  // 约 62.5ms
```

### 2. Player (玩家系统)

```c
typedef struct Player {
    Ship *PlayerMothership;             // 玩家母舰
    sdword resourceUnits;               // 资源单位 (RU)
    ShipRace race;                      // 种族 (泰坦/卡迪什)
    PlayerState playerState;            // 玩家状态
    struct AIPlayer *aiPlayer;          // AI 玩家指针
    udword autoLaunch;                  // 自动发射标志
    uword playerIndex;                  // 玩家索引
    ubyte sensorLevel;                  // 传感器等级
    ubyte bounty;                       // 赏金 (0-100)
    PlayerResearchInfo researchinfo;    // 研究信息
    uword Allies;                       // 联盟位掩码
    sdword shiptotals[TOTAL_NUM_SHIPS]; // 各类舰船总数
} Player;
```

### 3. SpaceObj (空间对象)

**文件**: `src/Game/spaceobj.*`

SpaceObj 是所有游戏对象的基类。

#### 对象类型层次

```
SpaceObj (空间对象基类)
    │
    ├─── Ship (舰船)
    │      ├─── Fighter (战斗机)
    │      ├─── Corvette (护卫舰)
    │      ├─── Frigate (护卫舰)
    │      └─── Capital (主力舰)
    │
    ├─── Resource (资源)
    │
    ├─── Derelict (残骸)
    │
    ├─── Bullet (子弹)
    │
    ├─── Missile (导弹)
    │
    └─── Effect (特效)
```

---

## 游戏循环

### 主游戏循环流程

```
┌──────────────────┐
│   Application    │
│   Entry Point    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Initialization │
│   - Load Assets  │
│   - Init Systems │
└────────┬─────────┘
         │
         ▼
    ┌────────┐
    │  Game  │◄─────────────────────┐
    │  Loop  │                      │
    └───┬────┘                      │
        │                           │
        ├─► ProcessInput()          │
        │   - Keyboard              │
        │   - Mouse                 │
        │   - Joystick              │
        │                           │
        ├─► UpdateGame()            │
        │   - Update Universe       │
        │   - Update Physics        │
        │   - Update AI             │
        │   - Update Networking     │
        │                           │
        ├─► RenderFrame()           │
        │   - Clear Buffer          │
        │   - Setup Camera          │
        │   - Render Objects        │
        │   - Draw UI               │
        │                           │
        ├─► SwapBuffers()           │
        │                           │
        └──► Frame Complete ────────┘
```

### 详细更新流程

```
Universe Update (16 FPS)
    │
    ├──► UpdatePhysics()
    │     ├─ Update Ship Positions
    │     ├─ Update Velocities
    │     ├─ Collision Detection
    │     └─ Collision Resolution
    │
    ├──► UpdateAI()
    │     ├─ Update AIPlayer
    │     ├─ Process AIFleetMan
    │     ├─ Process AIAttackMan
    │     └─ Process AIDefenseMan
    │
    ├──► UpdateCommands()
    │     ├─ Process Command Queue
    │     ├─ Execute Ship Commands
    │     └─ Update Formations
    │
    ├──► UpdateCombat()
    │     ├─ Process Weapons
    │     ├─ Calculate Damage
    │     └─ Handle Destroyed Ships
    │
    ├──► UpdateResources()
    │     ├─ Resource Collection
    │     ├─ Resource Regrowth
    │     └─ RU Processing
    │
    ├──► UpdateNetworking()
    │     ├─ Send Commands
    │     ├─ Receive Sync Packets
    │     └─ Process Network Events
    │
    └──► UpdateEffects()
          ├─ Update Particles
          ├─ Update Explosions
          └─ Update Visual Effects
```

---

## 对象模型

### SpaceObj 结构

```c
typedef struct SpaceObj {
    sdword objID;                // 对象 ID
    ubyte type;                  // 对象类型
    ubyte flags;                 // 标志位

    vector position;             // 位置
    vector velocity;             // 速度
    vector rotation;             // 旋转
    vector rotvelocity;          // 旋转速度

    real32 staticcollisionsphere;    // 静态碰撞半径
    real32 dynamiccollisionsphere;   // 动态碰撞半径

    struct Player *player;       // 所属玩家
    udword attributes;           // 属性标志
} SpaceObj;
```

### 对象生命周期

```
Creation
    │
    ├─► Allocation
    │
    ├─► Initialization
    │
    ├─► Add to Universe Lists
    │
    ├─► Active Updates
    │   ├─ Physics Update
    │   ├─ AI Update (if applicable)
    │   ├─ Combat Update (if applicable)
    │   └─ Rendering
    │
    ├─► Death/Deactivation
    │   ├─ Death Effects
    │   ├─ Resource Distribution
    │   └─ Team Updates
    │
    └─► Cleanup
          ├─ Remove from Lists
          ├─ Free Resources
          └─ Deallocation
```

---

## 命令系统

### CommandLayer (命令层)

**文件**: `src/Game/commandlayer.*`

命令层负责接收、排队和执行玩家命令。

#### 命令类型

```c
typedef enum {
    CMD_MOVE,           // 移动
    CMD_ATTACK,         // 攻击
    CMD_DOCK,           // 停靠
    CMD_LAUNCH,         // 发射
    CMD_FORMATION,      // 编队
    CMD_SPECIAL,        // 特殊能力
    CMD_HALT,           // 停止
    CMD_SCUTTLE,        // 自毁
    CMD_PROTECT,        // 保护
    CMD_COLLECT,        // 收集资源
    CMD_KAMIKAZE        // 神风攻击
} CommandType;
```

#### 命令流程

```
Player Input
    │
    ├─► Create Command
    │
    ├─► Validate Command
    │   ├─ Check Selection
    │   ├─ Check Resources
    │   └─ Check Validity
    │
    ├─► Add to Command Queue
    │
    ├─► Send to Network (Multiplayer)
    │
    └─► Execute Command
          ├─ Apply to Ships
          ├─ Update Formations
          └─ Trigger Effects
```

---

## 渲染系统

### 渲染流程

```
Render Frame
    │
    ├─► Clear Buffers
    │
    ├─► Setup Camera
    │   ├─ Position
    │   ├─ Orientation
    │   └─ Projection
    │
    ├─► Build Render List
    │   ├─ Cull Objects
    │   ├─ Sort by Depth
    │   └─ Sort by Material
    │
    ├─► Render Objects
    │   ├─ Set State
    │   ├─ Bind Textures
    │   ├─ Draw Geometry
    │   └─ Restore State
    │
    ├─► Render Effects
    │   ├─ Particles
    │   ├─ Explosions
    │   └─ Beams
    │
    ├─► Render UI
    │   ├─ HUD
    │   ├─ Menus
    │   └─ Overlays
    │
    └─► Swap/Present
```

### LOD (细节层次) 系统

```c
typedef struct {
    real32 distance;        // 距离阈值
    Mesh *mesh;             // 对应的网格模型
} LODLevel;
```

LOD 根据摄像机距离自动切换不同细节级别的模型。

---

## 物理系统

### 物理更新

```c
typedef struct {
    vector position;        // 当前位置
    vector velocity;        // 速度向量
    vector acceleration;    // 加速度
    real32 mass;            // 质量
    real32 drag;            // 阻力
} PhysicsObject;
```

### 碰撞检测

```
Broad Phase (广相)
    │
    ├─► Spatial Partitioning
    │   └─ Grid/Quadtree
    │
    └─► Pair Generation
          └─ Potential Collisions

Narrow Phase (窄相)
    │
    ├─► Sphere Test
    │
    ├─► Box Test
    │
    └─► Precise Test
          └─ Polygon Collision

Collision Resolution
    │
    ├─► Calculate Response
    │
    ├─► Apply Impulse
    │
    └─► Update Velocities
```

---

## 音频系统

### 音频架构

```
Sound System
    │
    ├─── SoundLow (Low-level Audio)
    │     ├─ DirectSound
    │     ├─ Mixer
    │     └─ Stream Management
    │
    └─── SoundEvent (High-level Events)
          ├─ Event Triggers
          ├─ 3D Positioning
          ├─ Volume/Pitch
          └─ Priority Management
```

---

## UI系统

### UI 层次

```
UI System
    │
    ├─── Front End (FE)
    │     ├─ Main Menu
    │     ├─ Options
    │     └─ Load/Save
    │
    ├─── In-Game UI
    │     ├─ HUD
    │     ├─ Resource Display
    │     ├─ Minimap (Sensors Manager)
    │     └─ Build/Research Managers
    │
    └─── NIS (Non-Interactive Sequences)
          └─ Cutscenes
```

---

## 文件系统

### Big File System

Homeworld 使用自定义的打包文件格式：

```
BigFile.big
    │
    ├─── .peo files (3D Models)
    ├─── .lif files (Textures)
    ├─── .wav files (Audio)
    └── .lvl files (Levels)
```

**优点**:
- 减少文件数量
- 加快加载速度
- 简化分发
- 基本防篡改

---

## 内存管理

### 内存分配策略

```c
typedef void* (*MemAllocFunc)(GLint len, char* name, GLuint flags);
typedef void (*MemFreeFunc)(void* pointer);
```

### 内存池

游戏使用内存池来减少分配/释放开销：

```
Memory Pool
    │
    ├─── Ship Pool
    ├─── Object Pool
    ├─── Effect Pool
    └─── Network Buffer Pool
```

---

## 脚本系统

### BTG (Binary Text Generator)

BTG 文件包含游戏脚本和关卡数据：

- 初始舰船配置
- 任务目标
- 触发器
- 对话

---

## 保存/加载系统

### 存档结构

```
Save Game (.sav)
    │
    ├─── Universe State
    │     ├─ All Objects
    │     ├─ Players
    │     └─ Resources
    │
    ├─── Game State
    │     ├─ Mission Info
    │     ├─ Research
    │     └─ Objectives
    │
    └─── Metadata
          ├─ Timestamp
          ├─ Level Name
          └─ Screenshot
```

---

## 性能优化

### 优化技术

1. **对象池**: 预分配对象减少内存分配
2. **LOD 系统**: 根据距离使用不同细节模型
3. **视锥体剔除**: 不渲染视野外对象
4. **空间分区**: 加速碰撞检测
5. **批处理渲染**: 批量渲染相同材质对象
6. **异步加载**: 后台加载资源
7. **更新频率控制**: 不同系统不同更新频率

### 性能监控

```c
typedef struct {
    udword framesPerSecond;
    udword frameTime;
    udword renderTime;
    udword physicsTime;
    udword aiTime;
    udword networkTime;
} PerformanceStats;
```

---

## 调试系统

### 调试功能

1. **控制台**: 内置命令控制台
2. **日志系统**: 详细日志记录
3. **性能分析**: 性能统计
4. **可视化调试**: 碰撞体、路径等可视化
5. **作弊命令**: 快速测试功能

---

## 平台抽象

### 平台层设计

```
Platform Abstraction
    │
    ├─── Win32 Layer
    │     ├─ Window Management
    │     ├─ Input Handling
    │     ├─ File I/O
    │     └─ Graphics API
    │
    └─── Game Layer (Platform Independent)
          ├─ Game Logic
          ├─ AI
          ├─ Physics
          └─ Rules
```

这种设计使游戏逻辑与平台代码分离，便于移植。

---

## 数据流图

### 典型帧数据流

```
Input → Command → AI → Physics → Render → Display
  │        │        │         │         │
  └────────┴────────┴─────────┴─────────┘
              State Update
```

### 多人游戏数据流

```
Player Input → Local Command → Network → Captain Server
                                                           │
                                                           ├─ Collect All Commands
                                                           ├─ Create Sync Packet
                                                           └─ Broadcast → All Players
                                                                             │
                                                                          Execute
```

---

## 错误处理

### 错误级别

```c
typedef enum {
    ERROR_INFO,      // 信息
    ERROR_WARNING,   // 警告
    ERROR_ERROR,     // 错误
    ERROR_FATAL      // 致命错误
} ErrorLevel;
```

### 错误恢复

- 验证加载文件
- 检测内存耗尽
- 网络断线恢复
- 渲染器回退

---

## 总结

Homeworld 的架构设计体现了 1990 年代末期 3D 游戏开发的最佳实践：

1. **模块化设计**: 清晰的系统分离
2. **平台抽象**: 便于移植
3. **性能优化**: 多种优化技术
4. **可扩展性**: 易于添加新功能
5. **稳定性**: 完善的错误处理

这个架构支持了复杂的 3D RTS 游戏，包括 AI、多人游戏、电影级过场等众多功能，是经典游戏架构的典范。

---

*文档生成日期: 2026-01-08*
