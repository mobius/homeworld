# Homeworld AI 系统文档

## 概述

Homeworld 的 AI 系统是一个分层架构的智能决策系统，采用战略-战术-操作三层结构，能够进行复杂的战略规划、舰队管理和战术战斗。这个 AI 系统是 1990 年代末期即时战略游戏 AI 的技术巅峰。

## AI 架构层次

```
┌─────────────────────────────────────────────────────┐
│              AIPlayer (战略层)                       │
│  - 高级决策                                          │
│  - 资源分配                                          │
│  - 科技研究                                          │
│  - 战略目标设定                                      │
└──────────────────┬──────────────────────────────────┘
                   │
      ┌────────────┴────────────┐
      │                         │
┌─────▼──────┐          ┌──────▼────────┐
│ AIFleetMan │          │ AIResourceMan │
│ (舰队管理) │          │ (资源管理)    │
└─────┬──────┘          └───────────────┘
      │
      ├──┬───────┬──────────┐
      │  │       │          │
┌─────▼──▼──┐ ┌─▼──────────┴───┐
│AIAttackMan│ │ AIDefenseMan    │
│(攻击管理) │ │ (防御管理)      │
└─────┬─────┘ └────────────────┘
      │
┌─────▼──────────────┐
│    AITeam (战术层) │
│  - 战术编队         │
│  - 移动命令         │
│  - 战术目标         │
└─────────┬──────────┘
          │
    ┌─────┴──────────┐
    │                │
┌───▼────────┐  ┌───▼──────────┐
│ AIMoves    │  │ AIOrders     │
│ (战术移动) │  │ (行为指令)   │
└────────────┘  └──────────────┘
          │
    ┌─────▼────────────┐
    │ AIShip (操作层)  │
    │  - 单船控制      │
    │  - 武器瞄准      │
    │  - 舰船指令      │
    └──────────────────┘
```

## 核心组件

### 1. AIPlayer (AI 玩家)

**文件**: `src/Game/AIPlayer.c`, `src/Game/AIPlayer.h`

AIPlayer 是 AI 系统的顶层控制器，负责整体战略决策。

#### 难度等级

```c
typedef enum {
    AI_BEG,           // 初学者
    AI_INT,           // 中级
    AI_ADV,           // 高级
    AI_NUM_LEVELS
} AIPlayerLevel;
```

#### 核心数据结构

```c
typedef struct AIPlayer {
    Player *player;                           // 关联的游戏玩家
    AIPlayerLevel aiplayerDifficultyLevel;    // AI 难度

    // 功能特性标志
    udword ResourceFeatures;      // 资源管理特性
    udword AttackFeatures;        // 攻击特性
    udword DefenseFeatures;       // 防御特性

    // 更新频率控制
    udword aiplayerUpdateRate;    // 更新频率
    udword aiplayerFrameCount;    // 帧计数器

    // 敌人信息
    udword enemyPlayerCount;
    Player *primaryEnemyPlayer;   // 主要敌人

    // 舰队管理
    struct AITeam *supportTeam[AIPLAYER_NUM_SUPPORTTEAMS];
    struct AITeam *attackTeam[AIPLAYER_NUM_ATTACKTEAMS];
    struct AITeam *guardTeams[AIPLAYER_MAX_NUM_GUARDTEAMS];

    // 造船请求队列
    LinkedList AttackManRequestShipsQ;
    LinkedList DefenseManRequestShipsQ;
    LinkedList ScriptManRequestShipsQ;

    // 超空间跳跃
    sdword aifHyperSavings;        // 为超空间跳跃保存的 RU

    // 防御状态
    SelectCommand *shipsattackingmothership;
    bool MothershipUnderAttack;
    real32 sphereofinfluence;     // 防御半径
} AIPlayer;
```

#### 团队容量配置

```c
#define AIPLAYER_NUM_SUPPORTTEAMS   12   // 支援团队数量
#define AIPLAYER_NUM_ATTACKTEAMS    24   // 攻击团队数量
#define AIPLAYER_MAX_NUM_GUARDTEAMS 12   // 守卫团队数量
#define AIPLAYER_NUM_RECONTEAMS     5    // 侦察团队数量
```

### 2. AIFleetMan (舰队管理器)

**文件**: `src/Game/AIFleetMan.c`, `src/Game/AIFleetMan.h`

舰队管理器负责协调所有 AI 团队的活动和资源分配。

#### 核心功能

```c
void aifFleetCommand(void);                    // 主舰队命令
void aifInit(struct AIPlayer *aiplayer);       // 初始化
void aifClose(struct AIPlayer *aiplayer);      // 清理
bool aifShipDied(struct AIPlayer *aiplayer, ShipPtr ship);
void aifTeamDied(struct AIPlayer *aiplayer, struct AITeam *team);
```

#### 造船请求回调

```c
void aifResourceManRequestsShipsCB(ShipType shiptype, sdword number, sdword priority);
void aifAttackManRequestsShipsCB(ShipType shiptype, sdword number, sdword priority);
void aifDefenseManRequestsShipsCB(ShipType shiptype, sdword number, sdword priority);
void aifTeamRequestsShipsCB(ShipType shiptype, sdword number, struct AITeam *team, char *doneSetVar, sdword priority);
```

### 3. AIAttackMan (攻击管理器)

**文件**: `src/Game/AIAttackMan.c`, `src/Game/AIAttackMan.h`

攻击管理器负责所有攻击性军事行动的规划和执行。

#### 攻击类型

```c
typedef enum {
    ATTACK_FLEET_FAST,          // 快速舰队攻击
    ATTACK_FLEET_GUARD,         // 护卫舰队攻击
    ATTACK_FLEET_BIG,           // 大型舰队攻击
    ATTACK_FLEET_HUGE,          // 超级舰队攻击
    TAKEOUT_TARGET,             // 清除目标
    FANCY_TAKEOUT_TARGET,       // 复杂清除行动
    FIGHTER_STRIKE,             // 战机打击
    CORVETTE_STRIKE,            // 护卫舰打击
    FRIGATE_STRIKE,             // 护卫舰打击
    HARASS_SMALL,               // 小规模骚扰
    HARASS_BIG,                 // 大规模骚扰
    CAPTURE,                    // 俘获行动
    MINE,                       // 布雷行动
    CLOAKGEN,                   // 隐形发生器部署
    GRAVWELL,                   // 重力井部署
    NUM_ATTACK_TYPES
} AttackType;
```

#### 攻击概率配置

根据难度级别，不同攻击类型有不同的触发概率：

```c
extern udword AIA_ATTACK_FLEET_FAST_PROB[AI_NUM_LEVELS];
extern udword AIA_ATTACK_FLEET_GUARD_PROB[AI_NUM_LEVELS];
extern udword AIA_TAKEOUT_TARGET_PROB[AI_NUM_LEVELS];
extern udword AIA_FIGHTER_STRIKE_PROB[AI_NUM_LEVELS];
extern udword AIA_HARASS_SMALL_PROB[AI_NUM_LEVELS];
// ... 更多攻击类型
```

#### 核心功能

```c
struct AITeam *aiaSendRecon(SelectCommand *ships);    // 派遣侦察
void aiaAttackManager(void);                          // 攻击管理主循环
void aiaProcessSpecialTeams(void);                    // 处理特殊团队
void aiaInit(struct AIPlayer *aiplayer);              // 初始化
```

### 4. AIDefenseMan (防御管理器)

**文件**: `src/Game/AIDefenseMan.c`, `src/Game/AIDefenseMan.h`

防御管理器负责保护母舰和重要资产。

#### 防御半径计算

```c
real32 sphereofinfluence;  // 防御球半径（平方）
```

#### 防御配置参数

```c
extern real32 AID_MOTHERSHIP_DEFENSE_FLEET_STRENGTH;    // 母舰防御舰队强度
extern udword AID_RESCON_ASF_DEFENDABLE_MULTIPLIER;     // 资源船防御倍数
extern udword AID_SPHERE_OF_INFLUENCE_INTERVAL;         // 防御半径更新间隔
extern udword AID_ROVING_DEFENSE_LOW_COUNT_CUTOFF;      // 巡航防御最低数量
```

### 5. AIResourceMan (资源管理器)

**文件**: `src/Game/AIResourceMan.c`, `src/Game/AIResourceMan.h`

资源管理器负责资源收集、分配和资源船管理。

#### 资源状态

```c
typedef struct AIPlayer {
    // 资源相关
    GrowSelection airResourceReserves;        // 资源储备
    GrowSelection airResourceCollectors;      // 资源收集船
    sdword airEasilyAccesibleRUsInWorld;      // 易获取资源
    sdword airNumRCollectors;                 // 收集船数量
    sdword airNumRControllers;                // 控制船数量
    sdword airNumASF;                         // 支援护卫舰数量
    sdword airNumResearchShips;               // 研究船数量
} AIPlayer;
```

#### 资源分配优先级

```c
extern real32 ATTMAN_BUILDPRIORITY_RATIO;    // 攻击管理器造船优先级
extern real32 DEFMAN_BUILDPRIORITY_RATIO;    // 防御管理器造船优先级
extern real32 RESMAN_BUILDPRIORITY_RATIO;    // 资源管理器造船优先级
```

### 6. AITeam (AI 团队)

**文件**: `src/Game/AITeam.c`, `src/Game/AITeam.h`

AI 团队是战术执行单元，由一组舰船组成，执行特定的战术任务。

#### 团队等级

```c
typedef enum {
    TEAM_BEGINNER,
    TEAM_BEGINNER_INTERMEDIATE,
    TEAM_INTERMEDIATE,
    TEAM_INTERMEDIATE_ADVANCED,
    TEAM_ADVANCED,
    NUM_TEAMLEVEL_TYPES
} AITeamLevel;
```

#### 团队配置参数

```c
extern udword AIT_TEAM_MOVE_DELAY[NUM_TEAMLEVEL_TYPES];     // 团队移动延迟
extern TypeOfFormation AIT_DEFAULT_FORMATION;                // 默认编队
extern real32 AIT_DEFTEAM_NEEDSHELP_STRENGTH;                // 求助强度阈值
```

### 7. AIMoves (战术移动)

**文件**: `src/Game/AIMoves.c`, `src/Game/AIMoves1.c`, `src/Game/AIMoves2.c`

战术移动系统实现各种战术机动模式。

#### 移动类型

- **骚扰移动** (`AIMoves_HARASS`): 打了就跑的战术
- **包抄移动** (`AIMoves_FLANK`): 侧翼包抄
- **拦截移动** (`AIMoves_INTERCEPT`): 拦截敌人
- **停靠移动** (`AIMoves_DOCK`): 返回基地维修
- **巡逻移动** (`AIMoves_PATROL`): 区域巡逻
- **防御母舰移动** (`AIMoves_DEF_MOTHERSHIP`): 母舰防御
- **临时守卫移动** (`AIMoves_TEMP_GUARD`): 临时守卫

#### 移动参数

```c
extern real32 AIM_DIST_MOVE_END;                  // 移动结束距离
extern real32 AIM_INTERCEPT_FINISH_DISTSQ;        // 拦截完成距离平方
extern real32 AIM_INTERCEPT_RECALC_DISTSQ;        // 拦截重算距离平方
extern real32 AIM_MIN_HARASS_ATTACK_DIST_SQ;      // 最小骚扰攻击距离平方
extern real32 AIM_HARASS_STANDOFF_DIST;           // 骚扰对峙距离
extern real32 AIM_HARASS_PROTECTION_RADIUS;       // 骚扰保护半径
extern real32 AIM_FLANK_ATTACK_RADIUS;            // 包抄攻击半径
```

### 8. AIOrders (行为指令)

**文件**: `src/Game/AIOrders.c`, `src/Game/AIOrders2.c`

行为指令定义了 AI 团队的具体行为模式。

#### 指令类型

- **GUARD**: 守卫特定目标或区域
- **HARASS**: 骚扰敌人
- **PATROL**: 巡逻指定区域
- **ATTACK**: 攻击特定目标
- **DEFEND_MOTHERSHIP**: 防御母舰
- **FAST_ROVING**: 快速巡航防御
- **SLOW_ROVING**: 慢速巡航防御
- **DOCK**: 返回基地
- **KAMIKAZE**: 自杀式攻击

#### 指令参数

```c
extern udword AIO_GUARD_SHIPS_NUM_CAPITAL;        // 守卫主力舰数量
extern udword AIO_GUARD_SHIPS_NUM_NONCAPITAL;     // 守卫非主力舰数量
extern udword AIO_HARASS_FUEL_LOW;                // 骚扰燃料低阈值
extern udword AIO_FIGHTER_KAMIKAZE_HEALTH;        // 战机自杀攻击血量
extern udword AIO_CORVETTE_KAMIKAZE_HEALTH;       // 护卫舰自杀攻击血量
```

### 9. AIShip (AI 舰船)

**文件**: `src/Game/AIShip.c`, `src/Game/AIShip.h`

单舰 AI 负责单个舰船的行为决策。

### 10. AIHandler (AI 处理器)

**文件**: `src/Game/AIHandler.c`, `src/Game/AIHandler.h`

AI 处理器处理战斗中的各种事件和情况。

#### 战术情况处理

```c
extern real32 AIH_GENERIC_GETTINGROCKED_STRENGTH;        // 被攻击强度阈值
extern TypeOfFormation AIH_GENERIC_GETTINGROCKED_FORMATION;  // 被攻击编队
extern real32 AIH_PATROL_ENEMYNEARBY_STRENGTH;           // 巡逻敌人距离强度
extern real32 AIH_FASTDEF_NUMLOW_STANDOFF_DIST;          // 快速防御低数量对峙距离
```

## AI 决策流程

### 1. 主更新循环

```
aiplayerPlay()
    │
    ├──► 检查更新频率
    │
    ├──► AIResourceMan 更新
    │     ├─ 评估资源状态
    │     ├─ 请求造资源船
    │     └─ 分配资源
    │
    ├──► AIDefenseMan 更新
    │     ├─ 检测威胁
    │     ├─ 部署防御团队
    │     └─ 管理守卫团队
    │
    ├──► AIAttackMan 更新
    │     ├─ 评估攻击机会
    │     ├─ 选择攻击类型
    │     ├─ 组装攻击团队
    │     └─ 发动攻击
    │
    └──► AIFleetMan 更新
          ├─ 处理造船请求
          ├─ 管理所有团队
          └─ 协调各子系统
```

### 2. 造船决策流程

```
造船请求
    │
    ├─► ResourceManager 请求
    │     ├─ 资源收集船
    │     ├─ 资源控制器
    │     └─ 支援护卫舰
    │
    ├─► AttackManager 请求
    │     ├─ 战斗机
    │     ├─ 护卫舰
    │     └─ 护卫舰
    │
    └─► DefenseManager 请求
          ├─ 防御舰船
          └─ 传感器船
```

### 3. 战斗决策流程

```
检测敌人
    │
    ├─► 评估敌人威胁
    │     ├─ 舰队规模
    │     ├─ 舰船类型
    │     └─ 距离位置
    │
    ├─► 选择应对策略
    │     ├─ 骚扰 (敌人较弱)
    │     ├─ 攻击 (机会有利)
    │     ├─ 防御 (受威胁)
    │     └─ 侦察 (信息不足)
    │
    └─► 执行战术
          ├─ 组建团队
          ├─ 选择编队
          ├─ 执行移动
          └─ 交战
```

## AI 特性系统

### 难度特性

每个 AI 难度级别有独特的特性配置：

#### 初学者 (AI_BEG)

- 较低的攻击概率
- 较慢的更新频率
- 保守的资源管理
- 较少的侦察活动

#### 中级 (AI_INT)

- 平衡的攻击概率
- 正常的更新频率
- 均衡的资源管理
- 适度的侦察活动

#### 高级 (AI_ADV)

- 高攻击概率
- 快速的更新频率
- 积极的资源管理
- 密集的侦察活动
- 复杂的战术组合

### 攻击特性

```c
typedef struct AIPlayer {
    udword AttackFeatures;  // 控制攻击行为的特性标志
} AIPlayer;
```

可能的特性：
- 激进攻击
- 骚扰战术
- 舰队集结
- 特殊单位使用

### 防御特性

```c
typedef struct AIPlayer {
    udword DefenseFeatures;  // 控制防御行为的特性标志
} AIPlayer;
```

可能的特性：
- 主动防御
- 巡航防御
- 传感器网络
- 快速反应

## AI 变量系统

### AI 变量

**文件**: `src/Game/AIVar.h`, `src/Game/AIVar.c`

AI 变量系统允许动态调整 AI 行为：

```c
#define AIVAR_LABEL_MAX_LENGTH 32

typedef struct RequestShips {
    Node node;
    ShipType shiptype;
    sdword num_ships;
    sdword priority;
    ShipPtr creator;
} RequestShips;
```

### 条件变量

脚本可以使用变量来控制 AI 行为：

```c
typedef struct TeamWaitingForTheseShips {
    Node node;
    ShipType shiptype;
    sdword num_ships;
    struct AITeam *team;
    char doneSetVarStr[AIVAR_LABEL_MAX_LENGTH+1];  // 完成时设置的变量
} TeamWaitingForTheseShips;
```

## 编队系统

### 编队类型

Homeworld 支持多种编队类型：

- **Delta**: 三角编队
- **Broad**: 宽编队
- **Claw**: 爪形编队
- **Wall**: 墙式编队
- **Sphere**: 球形编队

### 编队参数

```c
extern TypeOfFormation AIO_HARASS_INITIAL_MOVE_FORMATION;
extern TypeOfFormation AIM_HARASS_MOVE_FORMATION;
extern TypeOfFormation AIM_HARASS_SINGLETARGET_FORMATION;
extern TypeOfFormation AIM_FLANK_MOVE_FORMATION;
extern TypeOfFormation AIM_PATROL_FIRST_FORMATION;
```

## 战术系统

### 骚扰战术

**特点**: 打了就跑，避免正面交战

**参数**:
```c
extern real32 AIM_MIN_HARASS_ATTACK_DIST_SQ;     // 最小攻击距离
extern real32 AIM_HARASS_STANDOFF_DIST;          // 对峙距离
extern TypeOfFormation AIM_HARASS_MOVE_FORMATION; // 移动编队
```

### 包抄战术

**特点**: 从侧翼攻击敌人

**参数**:
```c
extern real32 AIM_FLANK_ATTACK_RADIUS;           // 攻击半径
extern TypeOfFormation AIM_FLANK_MOVE_FORMATION; // 移动编队
extern TypeOfFormation AIM_FLANK_ATTACK_FORMATION; // 攻击编队
```

### 防御战术

**快速巡航防御**: 快速响应威胁
**慢速巡航防御**: 大范围防御
**定点防御**: 守卫特定位置

## 侦察系统

### 侦察团队

```c
struct AITeam *reconTeam[AIPLAYER_NUM_RECONTEAMS];
udword numReconTeams;
```

### 侦察参数

```c
extern udword AIA_ENEMYBLOBS_PER_RECON;  // 每次侦察的敌人群组数量
```

## 超空间系统

### 超空间储蓄

```c
sdword aifHyperSavings;         // 为超空间跳跃保存的 RU
real32 aifHyperSkimming;        // 从新 RU 中抽取的比例
sdword aifLastRUCount;          // 上一帧的 RU 数量
```

AI 可以储蓄资源用于超空间跳跃，通过从收入中抽取一定比例来积累。

## 事件系统

### AI 事件

**文件**: `src/Game/AIEvents.c`, `src/Game/AIEvents.h`

处理游戏中的各种事件：

```c
void aiplayerShipDied(ShipPtr ship);              // 舰船被毁
void aiplayerResourceDied(Resource *resource);    // 资源被毁
void aiplayerPlayerDied(Player *player);          // 玩家被消灭
void aiplayerShipLaunchedCallback(Ship *ship);    // 舰船建造完成
```

## 多人游戏 AI

### 多人游戏配置

```c
typedef enum {
    Multi_RandomTarget,               // 随机目标
    Multi_RandomTarget_NoOverlap,     // 随机目标（无重叠）
    Multi_PlayerTarget,               // 玩家目标
    Multi_NoTarget                    // 无目标
} aiMultiplayer_Config;
```

## 调试和日志

### AI 日志

```c
extern bool aiplayerLogEnable;

void aiplayerDebugLog(uword playerIndex, char *format, ...);
```

### 日志宏

```c
#ifndef HW_Release
    #define aiplayerLog(x)    aiplayerDebugLog##x
#else
    #define aiplayerLog(x)    {;}
#endif
```

## 性能优化

### 更新频率控制

```c
udword aiplayerUpdateRate;
udword aiplayerFrameCount;
```

AI 不是每帧都更新，而是根据难度级别使用不同的更新频率。

### 信息管理

```c
GrowSelection enemyShipsIAmAwareOf[TOTAL_NUM_SHIPS];
GrowSelection primaryEnemyShipsIAmAwareOf[TOTAL_NUM_SHIPS];
```

AI 维护一个已知的敌人舰船列表，避免重复计算。

## AI 配置参数汇总

### 攻击管理器参数

| 参数 | 用途 |
|------|------|
| `AIA_ATTACK_FLEET_FAST_PROB` | 快速舰队攻击概率 |
| `AIA_TAKEOUT_TARGET_PROB` | 清除目标概率 |
| `AIA_FIGHTER_STRIKE_PROB` | 战机打击概率 |
| `AIA_HARASS_SMALL_PROB` | 小规模骚扰概率 |
| `AIA_KAMIKAZE_PROB` | 自杀攻击概率 |
| `AIA_NUM_ARMADA_TEAMS` | 舰队编队数量 |

### 防御管理器参数

| 参数 | 用途 |
|------|------|
| `AID_MOTHERSHIP_DEFENSE_FLEET_STRENGTH` | 母舰防御舰队强度 |
| `AID_SPHERE_OF_INFLUENCE_INTERVAL` | 防御半径更新间隔 |
| `AID_ROVING_DEFENSE_LOW_COUNT_CUTOFF` | 巡航防御最低数量 |

### 团队参数

| 参数 | 用途 |
|------|------|
| `AIT_TEAM_MOVE_DELAY` | 团队移动延迟 |
| `AIT_DEFAULT_FORMATION` | 默认编队类型 |
| `AIT_DEFTEAM_NEEDSHELP_STRENGTH` | 求助强度阈值 |

### 移动参数

| 参数 | 用途 |
|------|------|
| `AIM_DIST_MOVE_END` | 移动结束距离 |
| `AIM_MIN_HARASS_ATTACK_DIST_SQ` | 最小骚扰攻击距离 |
| `AIM_HARASS_STANDOFF_DIST` | 骚扰对峙距离 |
| `AIM_FLANK_ATTACK_RADIUS` | 包抄攻击半径 |
| `AIM_DOCK_REPAIRHEALTH_TRIGGER` | 停靠维修血量触发 |

### 处理器参数

| 参数 | 用途 |
|------|------|
| `AIH_GENERIC_GETTINGROCKED_STRENGTH` | 被攻击强度阈值 |
| `AIH_PATROL_ENEMYNEARBY_STRENGTH` | 巡逻敌人距离强度 |
| `AIH_FASTDEF_NUMLOW_STANDOFF_DIST` | 快速防御对峙距离 |

---

## 总结

Homeworld 的 AI 系统是一个复杂且高度模块化的分层架构：

1. **战略层** (AIPlayer): 高级决策和资源分配
2. **战术层** (AIFleetMan, AIAttackMan, AIDefenseMan): 战役规划和执行
3. **操作层** (AITeam, AIMoves, AIOrders): 具体战术实施
4. **单位层** (AIShip): 单个舰船控制

这种分层设计使得 AI 能够进行复杂的多层次决策，从战略资源管理到战术舰队编组，再到具体的舰船机动和战斗行为。系统的高度可配置性允许通过调整大量参数来创建不同难度和风格的 AI 对手。

---

*文档生成日期: 2026-01-08*
