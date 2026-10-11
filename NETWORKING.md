# Homeworld 网络系统文档

## 概述

Homeworld 的网络系统是一个基于**确定性状态同步**的多人游戏架构，支持最多 8 人同时对战。系统采用客户端-服务器模式，其中一个玩家被指定为"船长"（Captain），负责收集和广播所有玩家命令。

## 网络架构

### 拓扑结构

```
                    ┌─────────────────┐
                    │   Captain      │
                    │  (船长服务器)   │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────▼──────┐  ┌─────▼──────┐  ┌─────▼──────┐
     │   Player 1  │  │  Player 2  │  │  Player 3  │
     │  (客户端)   │  │  (客户端)  │  │  (客户端)  │
     └─────────────┘  └────────────┘  └─────────────┘
```

### 核心组件

| 组件 | 文件 | 描述 |
|------|------|------|
| **CommandNetwork** | `CommandNetwork.c/h` | 命令网络层 |
| **MultiplayerGame** | `MultiplayerGame.c` | 多人游戏管理 |
| **MultiplayerLANGame** | `MultiplayerLANGame.c` | LAN 游戏 |
| **TitanNet** | `titannet.c` | 网络接口层 |

---

## 数据包格式

### 数据包头

所有数据包共享一个通用头部结构：

```c
typedef struct {
    uword type;              // 数据包类型
    uword from;              // 发送者玩家索引
    udword frame;            // 帧号
#if SYNC_CHECK
    NetSyncChecksums checksums;  // 同步校验和
#endif
    uword numberOfCommands;  // 命令数量
} HWPacketHeader;
```

### 数据包类型

| 类型标识 | 十六进制 | 用途 |
|----------|----------|------|
| `PACKETTYPE_COMMAND` | 0xcccc | 命令数据包 |
| `PACKETTYPE_SYNC` | 0x5555 | 同步数据包 |
| `PACKETTYPE_REQUESTEDSYNC` | 0xe555 | 请求的同步包 |
| `PACKETTYPE_NONCAPTAINREADY` | 0xaaaa | 非船长就绪 |
| `PACKETTYPE_HORSERACE` | 0x0911 | 赛马模式通信 |
| `PACKETTYPE_CHAT` | 0xb1ab | 聊天消息 |
| `PACKETTYPE_TRANSFERCAPTAINCY` | 0xca00 | 船长权转移 |
| `PACKETTYPE_DROPPINGOUTOFLOAD` | 0x10ad | 加载中掉线 |
| `PACKETTYPE_REQUESTSYNCPKTS` | 0xe155 | 请求同步包 |
| `PACKETTYPE_IAMALIVE` | 0xa1a1 | 心跳包 |
| `PACKETTYPE_ALIVESTATUS` | 0xa155 | 存活状态 |
| `PACKETTYPE_FILE` | 0xf11e | 文件传输 |
| `PACKETTYPE_INGAMEQUITING` | 0x15ed | 游戏中退出 |
| `PACKETTYPE_LAGCHECK` | 0x1A5C | 延迟检测 |
| `PACKETTYPE_CHEATDETECT` | 0xcea1 | 作弊检测 |

---

## 命令系统

### 命令类型

```c
#define COMMANDTYPE_MOVE                1   // 移动
#define COMMANDTYPE_ATTACK              2   // 攻击
#define COMMANDTYPE_FORMATION           3   // 编队
#define COMMANDTYPE_DOCK                4   // 停靠
#define COMMANDTYPE_CREATESHIP          5   // 创建舰船
#define COMMANDTYPE_COLLECTRESOURCE     6   // 收集资源
#define COMMANDTYPE_PROTECT             7   // 保护
#define COMMANDTYPE_BUILDSHIP           8   // 建造舰船
#define COMMANDTYPE_SPECIAL             9   // 特殊能力
#define COMMANDTYPE_MISC                10  // 杂项命令
#define COMMANDTYPE_AUTOLAUNCH          11  // 自动发射
#define COMMANDTYPE_LAUNCHMULTIPLE      12  // 发射多艘
#define COMMANDTYPE_ALLIANCEINFO        13  // 联盟信息
#define COMMANDTYPE_RUTRANSFER          14  // 资源转移
#define COMMANDTYPE_MP_HYPERSPACE       15  // 多人超空间
#define COMMANDTYPE_PLAYERDROPPED       17  // 玩家掉线
#define COMMANDTYPE_DETERMINISTICBUILD  18  // 确定性建造
#define COMMANDTYPE_RESEARCHINFO        19  // 研究信息
```

### 命令格式

#### 1. 移动命令 (MOVE)

```c
typedef struct {
    vector from;            // 起始位置
    vector to;              // 目标位置
    NetSelection selection; // 选择的舰船
} NetMoveCommand;
```

#### 2. 攻击命令 (ATTACK)

```c
typedef struct {
    NetAttackSelection attack;  // 攻击目标
    NetSelection selection;     // 我方舰船
} NetAttackCommand;
```

#### 3. 编队命令 (FORMATION)

```c
typedef struct {
    uword typeOfFormation;  // 编队类型
    NetSelection selection; // 选择的舰船
} NetFormationCommand;
```

#### 4. 停靠命令 (DOCK)

```c
typedef struct {
    ShipID dockwithID;      // 停靠目标 ID
    uword dockType;         // 停靠类型
    NetSelection selection; // 选择的舰船
} NetDockCommand;
```

#### 5. 创建/建造舰船 (CREATESHIP/BUILDSHIP)

```c
typedef struct {
    uword shipType;     // 舰船类型
    uword shipRace;     // 种族
    uword playerIndex;  // 玩家索引
    ShipID creatorID;   // 建造者 ID
} NetCreateShipCommand;
```

#### 6. 收集资源 (COLLECTRESOURCE)

```c
typedef struct {
    ResourceID resourceID;    // 资源 ID
    NetSelection selection;   // 选择的舰船
} NetCollectResourceCommand;
```

#### 7. 特殊能力 (SPECIAL)

```c
typedef struct {
    NetTargetsSelection targets;  // 目标选择
    NetSelection selection;       // 我方舰船
} NetSpecialCommand;
```

#### 8. 杂项命令 (MISC)

杂项命令包括：
- `MISCCOMMAND_HALT` (0): 停止
- `MISCCOMMAND_SCUTTLE` (1): 自毁
- `MISCCOMMAND_TACTICS` (2): 战术切换
- `MISCCOMMAND_KAMIKAZE` (3): 神风攻击
- `MISCCOMMAND_PARADE` (4): 阅兵

```c
typedef struct {
    udword miscData;      // 杂项数据
    uword miscCommand;    // 杂项命令
    NetSelection selection; // 选择的舰船
} NetMiscCommand;
```

#### 9. 资源转移 (RUTRANSFER)

```c
typedef struct {
    ubyte to;                 // 接收者
    ubyte from;               // 发送者
    ubyte flags;              // 标志
    sdword resourceUnits;     // 资源数量
} NetRUTransferferCommand;
```

#### 10. 联盟信息 (ALLIANCEINFO)

```c
typedef struct {
    udword AllianceMsgType;  // 联盟消息类型
    uword CurAlliance;       // 当前联盟
    uword NewAlliance;       // 新联盟
} NetAllianceCommand;
```

#### 11. 研究信息 (RESEARCHINFO)

```c
typedef struct {
    ubyte ResearchMsgType;  // 研究消息类型 (开始/停止)
    ubyte playerindex;      // 玩家索引
    ubyte labnum;           // 实验室编号
    ubyte tech;             // 科技编号
} NetResearchCommand;
```

---

## 选择和目标结构

### NetSelection

用于传输舰船选择列表：

```c
typedef struct {
    uword numShips;        // 舰船数量
    ShipID ShipID[1];      // 可变长度舰船 ID 数组
} NetSelection;
```

**大小计算宏**:
```c
#define sizeofNetSelection(n) (sizeof(NetSelection) + sizeof(ShipID)*((n)-1))
```

### NetAttackSelection

用于传输攻击目标列表：

```c
typedef struct {
    uword numTargets;      // 目标数量
    TargetID TargetID[1];  // 可变长度目标 ID 数组
} NetAttackSelection;
```

**大小计算宏**:
```c
#define sizeofNetAttackSelection(n) (sizeof(NetAttackSelection) + sizeof(TargetID)*((n)-1))
```

---

## 网络同步机制

### 同步校验和

```c
typedef struct {
    uword packetnum;    // 数据包编号
    uword randcheck;    // 随机检查值
    real32 univcheck;   // 宇宙校验和
    udword blobcheck;   // 实体校验和
} NetSyncChecksums;
```

### 命令流程

```
玩家输入
    │
    ├─► 生成本地命令
    │
    ├─► 打包成命令数据包
    │
    ├─► 发送给船长
    │
    ▼
┌─────────────┐
│   Captain   │  收集所有玩家命令
└──────┬──────┘
       │
       ├─► 合并所有命令
       │
       ├─► 生成同步数据包
       │
       ├─► 添加校验和
       │
       └─► 广播给所有玩家
              │
              ├─► 每个玩家接收
              │
              ├─► 验证校验和
              │
              └─► 执行命令
```

### 船长服务器

```c
#define CAPTAINSERVER_PERIOD 1.0f/8.0f  // 船长更新频率 (8 FPS)
```

船长服务器的任务：
1. 收集所有玩家的命令
2. 验证命令有效性
3. 合并命令到同步数据包
4. 添加校验和
5. 广播同步数据包
6. 管理游戏状态

---

## 船长权转移

### 转移子类型

```c
#define XFERCAP_GIVEUP_CAPTAINCY_NOTICE      0   // 放弃船长权通知
#define XFERCAP_CAPTAIN_PROPOSAL             1   // 船长提议
#define XFERCAP_PAUSE_TRANSFERRING_CAPTAIN   2   // 暂停转移
#define XFERCAP_PAUSE_ACK                    3   // 暂停确认
#define XFERCAP_PAUSE_YOU_BE_CAPTAIN         4   // 你成为船长
#define XFERCAP_I_AM_NEW_CAPTAIN             5   // 我是新船长
```

### 转移流程

```
当前船长掉线
    │
    ├─► 检测超时
    │
    ├─► 发送 XFERCAP_CAPTAIN_PROPOSAL
    │
    ├─► 候选船长响应
    │
    ├─► 发送 XFERCAP_I_AM_NEW_CAPTAIN
    │
    └─► 新船长接管
```

---

## 心跳和掉线检测

### 存活状态

```c
#define ALIVESTATUS_ALIVE                   0   // 存活
#define ALIVESTATUS_QUERYINGDROPOUT         1   // 查询掉线
#define ALIVESTATUS_WAITQUERYDROPOUTLATER   2   // 等待查询
#define ALIVESTATUS_DROPPEDOUT              3   // 已掉线
```

### 心跳机制

```c
TTimer SendIAmAliveTimer;           // 我还活着计时器
TTimer SendAliveStatusTimer;        // 存活状态计时器
TTimer AliveTimeoutTimers[MAX_MULTIPLAYER_PLAYERS];  // 超时计时器
ubyte AliveStatuses[MAX_MULTIPLAYER_PLAYERS];        // 存活状态
```

### 心跳流程

```
定期发送
    │
    ├─► PACKETTYPE_IAMALIVE (我还活着)
    │
    ▼
接收心跳
    │
    ├─► 更新该玩家超时计时器
    │
    └─► 如果超时 → 标记为查询掉线
           │
           ├─► 发送查询
           │
           ├─► 等待响应
           │
           └─► 无响应 → 标记为已掉线
```

---

## 延迟检测

### LagPacket

```c
typedef struct {
    HWPacketHeader packetheader;
    real32 timestamp;  // 时间戳
} LagPacket;
```

延迟检测通过发送带时间戳的数据包并测量往返时间来计算网络延迟。

---

## 作弊检测

```c
#define PACKETTYPE_CHEATDETECT 0xcea1
```

系统会检测异常的游戏状态和不一致的数据包。

---

## 聊天系统

### ChatPacket

```c
typedef struct {
    HWPacketHeader packetheader;
    uword bounced;           // 是否弹回
    uword messageType;       // 消息类型
    uword users;             // 用户掩码
    udword data;             // 数据
    char message[MAX_CHAT_MESSAGE_LENGTH*sizeof(wchar_t)];  // 消息文本
} ChatPacket;
```

---

## 文件传输

### FilePacket

```c
typedef struct {
    HWPacketHeader packetheader;  // frame = filesize, numberOfCommands = filename size
    uword totalNumFiles;          // 文件总数
    char filename[1];             // 可变长度文件名
    // char filecontents[1];      // 可变长度文件内容
} FilePacket;
```

用于下载自定义地图等文件。

---

## 函数接口

### 发送命令

```c
void clSendMove(CommandLayer *comlayer, SelectCommand *selectcom, vector from, vector to);
void clSendAttack(CommandLayer *comlayer, SelectCommand *selectcom, AttackCommand *attackcom);
void clSendFormation(CommandLayer *comlayer, SelectCommand *selectcom, TypeOfFormation formation);
void clSendDock(CommandLayer *comlayer, SelectCommand *selectcom, DockType dockType, ShipPtr dockwith);
void clSendCreateShip(CommandLayer *comlayer, ShipType shipType, ShipRace shipRace, uword playerIndex, ShipPtr creator);
void clSendBuildShip(CommandLayer *comlayer, ShipType shipType, ShipRace shipRace, uword playerIndex, ShipPtr creator);
void clSendCollectResource(CommandLayer *comlayer, SelectCommand *selectcom, ResourcePtr resource);
void clSendProtect(CommandLayer *comlayer, SelectCommand *selectcom, ProtectCommand *protectcom);
void clSendSpecial(CommandLayer *comlayer, SelectCommand *selectcom, SpecialCommand *targetcom);
void clSendMisc(CommandLayer *comlayer, SelectCommand *selectcom, uword miscCommand, udword miscData);
void clSendAutoLaunch(udword OnOff, udword playerIndex);
void clSendSetAlliance(udword AllianceType, uword curalliance, uword newalliance);
void clSendLaunchMultipleShips(CommandLayer *comlayer, SelectCommand *selectcom, ShipPtr launchFrom);
void clSendRuTransfer(CommandLayer *comlayer, sdword fromIndex, sdword toIndex, sdword resourceUnits, ubyte flags);
void clSendMpHyperspace(CommandLayer *comlayer, SelectCommand *selectcom, vector from, vector to);
void clSendResearch(udword type, udword playernum, udword labnum, udword tech);
```

### 数据包处理

```c
void clProcessSyncPacket(CommandLayer *comlayer, ubyte *packet, udword sizeofPacket);
WaitPacketStatus clWaitSyncPacket(CommandLayer *comlayer);
void ReceivedPacketCB(ubyte *packet, udword sizeofPacket);
void netCheck(void);
```

### 船长功能

```c
void captainServerTask(void);  // 船长服务器主任务
void SendCaptainInfoPacket(void);  // 发送船长信息
```

### 玩家管理

```c
void PlayerDroppedOut(udword player, bool timedOut);
void PlayerInGameQuited(udword player);
void CaptaincyChangedNotify(void);
```

---

## 网络统计

```c
extern udword sentPacketNumber;        // 发送数据包数
extern udword receivedPacketNumber;    // 接收数据包数
extern udword syncpkts;                // 同步包数
extern udword cmdpkts;                 // 命令包数
extern udword syncoverruns;            // 同步溢出
extern udword cmdoverruns;             // 命令溢出
```

---

## 确定性同步

### 为什么需要确定性同步

在多人游戏中，所有客户端必须保持完全相同的游戏状态。Homeworld 通过以下机制实现：

1. **命令而非状态**: 只传输玩家命令，不传输游戏状态
2. **确定性模拟**: 相同输入 + 相同初始状态 = 相同输出
3. **帧同步**: 所有客户端在同一帧执行相同命令
4. **校验和验证**: 定期验证游戏状态一致性

### 同步检查

```c
#if SYNC_CHECK
    NetSyncChecksums checksums;
#endif
```

当启用同步检查时，每个数据包包含校验和，用于验证所有客户端的游戏状态是否一致。

### God Mode 同步检查

```c
#ifdef GOD_LIKE_SYNC_CHECKING
typedef struct {
    udword univframe;   // 宇宙更新帧
    uword randcheck;    // 随机检查
    uword pad;
    real32 univcheck;   // 宇宙校验和
    udword blobcheck;   // 实体校验和
    udword shipcheck;   // 舰船校验和
} GodSyncCheckSums;
#endif
```

这是开发用的高级同步检查功能。

---

## 多人游戏支持

### 玩家数量

```c
#define MAX_MULTIPLAYER_PLAYERS 8
```

### 玩家索引

玩家索引从 0 到 7，用于标识不同玩家。

---

## 错误处理

### 掉线处理

```c
udword numPlayerDropped;
udword playersDropped[MAX_MULTIPLAYER_PLAYERS];
```

当玩家掉线时：
1. 检测超时
2. 标记玩家为已掉线
3. 通知其他玩家
4. 将掉线玩家的舰船交由 AI 控制

### 数据包丢失

系统使用同步包的重传机制来处理数据包丢失：

```c
void SendRequestSyncPkts(udword frompacketnum, udword topacketnum);
```

---

## 性能考虑

### 带宽优化

1. **命令压缩**: 只发送必要的命令数据
2. **可变长度数组**: 使用可变长度结构避免浪费
3. **批量处理**: 累积多个命令后批量发送
4. **差分编码**: 只传输变化的数据

### 延迟最小化

1. **命令预测**: 本地立即执行命令
2. **快速转发**: 船长尽快转发命令
3. **优先级队列**: 重要命令优先发送

---

## 安全性

### 防作弊措施

1. **命令验证**: 船长验证所有命令
2. **状态同步**: 检测不一致状态
3. **校验和**: 定期验证游戏状态
4. **速率限制**: 限制命令发送频率

---

## 调试功能

### 网络统计

```c
extern bool aiplayerLogEnable;
```

### 数据包记录

```c
void InitLastSyncPktsQ(void);   // 初始化同步包队列
bool GetSyncPktFromLastSyncPktsQ(udword frame, HWPacketHeader **packet, udword *size);
```

---

## 总结

Homeworld 的网络系统是一个精心设计的确定性同步架构：

1. **客户端-服务器模式**: 船长服务器集中管理
2. **命令传输**: 只传输玩家命令，不传输状态
3. **确定性同步**: 保证所有客户端状态一致
4. **心跳检测**: 及时检测掉线玩家
5. **船长权转移**: 支持船长切换
6. **延迟检测**: 监控网络质量
7. **作弊检测**: 维护游戏公平性

这个系统在 1999 年的网络条件下实现了流畅的 8 人对战体验，是早期 RTS 游戏网络编程的典范。

---

*文档生成日期: 2026-01-08*
