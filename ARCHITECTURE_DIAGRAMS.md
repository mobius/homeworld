# Homeworld 架构可视化图

本文档包含 Homeworld 游戏系统的各种架构图表，使用 Mermaid 格式编写。

---

## 1. 系统架构总览

```mermaid
graph TB
    subgraph "Platform Layer 平台层"
        Win32[Win32 Platform<br/>Windows API<br/>DirectX Input]
    end

    subgraph "Game Systems 游戏系统"
        Universe[Universe<br/>宇宙管理器]
        Physics[Physics Engine<br/>物理引擎]
        AI[AI System<br/>AI系统]
        Network[Networking<br/>网络系统]
        Command[Command Layer<br/>命令层]
    end

    subgraph "Rendering Engine 渲染引擎"
        RGL[RGL Graphics Library]
        kGL[kGL Core<br/>内核图形库]
        D3D[Direct3D Driver]
        Glide[Glide Driver]
        Soft[Software Renderer]
    end

    Win32 --> Universe
    Win32 --> RGL
    Win32 --> Network

    Universe --> Physics
    Universe --> AI
    Universe --> Command
    Universe --> Network

    RGL --> kGL
    kGL --> D3D
    kGL --> Glide
    kGL --> Soft

    Physics --> Universe
    AI --> Universe
    Command --> Universe
    Network --> Universe

    style Win32 fill:#e1f5ff
    style Universe fill:#fff4e1
    style RGL fill:#ffe1f5
    style Physics fill:#e1ffe1
    style AI fill:#ffe1e1
```

---

## 2. 游戏主循环

```mermaid
flowchart TD
    Start([应用启动]) --> Init[初始化系统<br/>加载资源]
    Init --> GameLoop{游戏循环}

    GameLoop --> Input[处理输入<br/>键盘/鼠标]
    Input --> Update[更新游戏状态<br/>Universe_Update]

    Update --> Phys[物理模拟<br/>碰撞检测]
    Phys --> AIUp[AI 更新<br/>决策制定]
    AIUp --> Combat[战斗计算<br/>伤害结算]
    Combat --> Net[网络同步<br/>命令传输]

    Net --> Render[渲染帧<br/>绘制场景]
    Render --> Swap[交换缓冲区<br/>显示画面]
    Swap --> Check{退出?}

    Check -->|否| GameLoop
    Check -->|是| Cleanup[清理资源<br/>保存状态]
    Cleanup --> End([应用退出])

    style Start fill:#90EE90
    style End fill:#FFB6C1
    style Input fill:#87CEEB
    style Update fill:#FFD700
    style Render fill:#DDA0DD
    style Swap fill:#98FB98
```

---

## 3. AI 系统层次结构

```mermaid
graph TD
    subgraph "AIPlayer 战略层"
        Player[AIPlayer<br/>AI玩家控制器]
        Res[Resource Manager<br/>资源管理器]
        Strat[Strategy<br/>战略决策]
    end

    subgraph "Fleet Management 战术层"
        Fleet[AIFleetMan<br/>舰队管理器]
        Attack[AIAttackMan<br/>攻击管理器]
        Defense[AIDefenseMan<br/>防御管理器]
    end

    subgraph "Team Execution 执行层"
        Team[AITeam<br/>AI团队]
        Orders[AIOrders<br/>行为指令]
        Moves[AIMoves<br/>战术移动]
    end

    subgraph "Unit Control 单位层"
        Ship[AIShip<br/>单舰AI<br/>武器瞄准<br/>机动决策]
    end

    Player --> Res
    Player --> Strat
    Player --> Fleet

    Fleet --> Attack
    Fleet --> Defense

    Attack --> Team
    Defense --> Team

    Team --> Orders
    Team --> Moves

    Orders --> Ship
    Moves --> Ship

    style Player fill:#FF6B6B
    style Fleet fill:#4ECDC4
    style Team fill:#45B7D1
    style Ship fill:#96CEB4
```

---

## 4. 渲染管线

```mermaid
flowchart LR
    Input[顶点数据<br/>Vertex Data] --> Trans[顶点变换<br/>ModelView Matrix]

    Trans --> Light[光照计算<br/>Lighting]
    Light --> Proj[投影变换<br/>Projection Matrix]

    Proj --> Clip[裁剪<br/>Clipping]
    Clip --> Persp[透视除法<br/>Perspective Divide]

    Persp --> View[视口变换<br/>Viewport Transform]

    View --> Rast[光栅化<br/>Rasterization]

    Rast --> Pixel[像素处理<br/>Pixel Operations]
    Pixel --> Depth[深度测试<br/>Depth Test]
    Depth --> Alpha[Alpha混合<br/>Blending]
    Alpha --> Frame[写入帧缓冲<br/>FrameBuffer]

    style Input fill:#E8F5E9
    style Trans fill:#C8E6C9
    style Light fill:#A5D6A7
    style Rast fill:#81C784
    style Frame fill:#66BB6A
```

---

## 5. 网络同步架构

```mermaid
sequenceDiagram
    participant P1 as 玩家1
    participant P2 as 玩家2
    participant P3 as 玩家3
    participant Captain as 船长服务器

    P1->>Captain: 发送命令包<br/>Command Packet
    P2->>Captain: 发送命令包<br/>Command Packet
    P3->>Captain: 发送命令包<br/>Command Packet

    Note over Captain: 收集所有玩家命令<br/>验证有效性<br/>添加校验和

    Captain->>P1: 广播同步包<br/>Sync Packet
    Captain->>P2: 广播同步包<br/>Sync Packet
    Captain->>P3: 广播同步包<br/>Sync Packet

    Note over P1,P3: 所有玩家执行相同命令<br/>保持游戏状态同步
```

---

## 6. 对象生命周期

```mermaid
stateDiagram-v2
    [*] --> Created: 创建对象
    Created --> Initializing: 初始化
    Initializing --> Active: 添加到宇宙

    Active --> Updating: 每帧更新
    Updating --> Active: 继续活动

    Active --> Dying: 受到致命伤害
    Dying --> Dead: 死亡特效
    Dead --> Cleanup: 清理资源

    Cleanup --> Deleted: 从列表移除
    Deleted --> [*]: 销毁完成

    Updating --> Updating: 物理更新
    Updating --> Updating: AI更新
    Updating --> Updating: 渲染
```

---

## 7. 命令处理流程

```mermaid
flowchart TD
    PlayerInput[玩家输入] --> Validate{验证命令}

    Validate -->|无效| Reject[拒绝命令]
    Validate -->|有效| Queue[加入命令队列]

    Queue --> NetCheck{多人游戏?}

    NetCheck -->|是| SendNet[发送到网络]
    SendNet --> Captain[船长服务器]
    Captain --> Sync[同步包广播]

    NetCheck -->|否| Local[本地执行]

    Sync --> Exec
    Local --> Exec[执行命令]

    Exec --> Apply[应用到舰船]
    Apply --> Effect[触发效果]
    Effect --> Complete([命令完成])

    style PlayerInput fill:#FFE4B5
    style Validate fill:#FFA07A
    style Exec fill:#98FB98
    style Complete fill:#DDA0DD
```

---

## 8. 碰撞检测流程

```mermaid
flowchart TD
    Start[碰撞检测开始] --> Broad[广相阶段<br/>Broad Phase]

    Broad --> Spatial[空间分区<br/>Spatial Partition]
    Spatial --> Pairs[生成可能碰撞对<br/>Pair Generation]

    Pairs --> Narrow[窄相阶段<br/>Narrow Phase]

    Narrow --> Sphere[球体测试<br/>Sphere Test]
    Sphere --> Box[包围盒测试<br/>Box Test]
    Box --> Precise[精确测试<br/>Polygon Test]

    Precise --> Collide{碰撞?}

    Collide -->|否| End[结束]
    Collide -->|是| Response[碰撞响应]

    Response --> Impulse[计算冲量<br/>Calculate Impulse]
    Impulse --> Damage[应用伤害<br/>Apply Damage]
    Damage --> Velocity[更新速度<br/>Update Velocity]
    Velocity --> End

    style Broad fill:#FFB6C1
    style Narrow fill:#87CEFA
    style Response fill:#90EE90
```

---

## 9. 资源管理系统

```mermaid
graph TD
    subgraph "资源生成"
        Vol[Resource Volume<br/>资源体积]
        Dist[Distribution<br/>分布概率]
    end

    subgraph "资源收集"
        Coll[Collector Ships<br/>收集船]
        Cont[Resource Controller<br/>资源控制器]
        Dock[Docking with MS<br/>停靠母舰]
    end

    subgraph "资源使用"
        Build[Build Ships<br/>建造舰船]
        Res[Research<br/>科技研究]
    end

    subgraph "玩家资源"
        RU[Resource Units<br/>资源单位RU]
    end

    Vol --> Coll
    Dist --> Coll
    Coll --> Cont
    Cont --> Dock
    Dock --> RU

    RU --> Build
    RU --> Res

    Build --> RU
    Res --> RU

    style RU fill:#FFD700
    style Coll fill:#87CEEB
    style Build fill:#90EE90
```

---

## 10. 依赖关系图

```mermaid
graph TD
    subgraph "核心模块"
        Univ[universe.c<br/>宇宙管理]
        Phys[physics.c<br/>物理引擎]
        Cmd[commandlayer.c<br/>命令层]
    end

    subgraph "AI模块"
        AIP[AIPlayer.c<br/>AI玩家]
        AIF[AIFleetMan.c<br/>舰队管理]
        AIA[AIAttackMan.c<br/>攻击管理]
        AID[AIDefenseMan.c<br/>防御管理]
    end

    subgraph "游戏逻辑"
        Battle[battle.c<br/>战斗系统]
        Gun[gun.c<br/>武器系统]
        Form[formation.c<br/>编队系统]
    end

    subgraph "渲染模块"
        RGL[rgl/*.c<br/>图形库]
        KGL[kgl.c<br/>内核图形]
    end

    Univ --> Phys
    Univ --> Cmd
    Univ --> AIP

    Phys --> Battle
    Cmd --> AIF

    AIP --> AIF
    AIF --> AIA
    AIF --> AID

    Battle --> Gun
    AIA --> Form

    RGL --> KGL
    Battle --> RGL

    style Univ fill:#FF6B6B
    style Phys fill:#4ECDC4
    style AIP fill:#45B7D1
    style Battle fill:#96CEB4
    style RGL fill:#DDA0DD
```

---

## 11. 文件系统架构

```mermaid
graph TD
    subgraph "Big File 打包文件"
        Big[.big 文件<br/>资源包]
    end

    subgraph "资源类型"
        Model[.peo<br/>3D模型]
        Tex[.lif<br/>纹理]
        Audio[.wav<br/>音频]
        Level[.lvl<br/>关卡数据]
        Script[.btg<br/>脚本]
    end

    subgraph "运行时"
        Mem[内存缓存<br/>Memory Pool]
        GPU[显存<br/>GPU Memory]
    end

    Big --> Model
    Big --> Tex
    Big --> Audio
    Big --> Level
    Big --> Script

    Model --> Mem
    Tex --> GPU
    Audio --> Mem
    Level --> Mem
    Script --> Mem

    style Big fill:#FFB6C1
    style Mem fill:#87CEEB
    style GPU fill:#90EE90
```

---

## 12. 多人游戏状态机

```mermaid
stateDiagram-v2
    [*] --> Lobby: 进入游戏大厅
    Lobby --> Waiting: 等待玩家
    Waiting --> Loading: 所有玩家就绪
    Loading --> InGame: 加载完成
    InGame --> Playing: 游戏进行中

    Playing --> Paused: 暂停游戏
    Paused --> Playing: 恢复游戏

    Playing --> CheckSync: 检查同步
    CheckSync --> Playing: 同步正常
    CheckSync --> Resync: 需要重新同步
    Resync --> Playing: 同步恢复

    Playing --> Victory: 胜利条件
    Playing --> Defeat: 失败条件
    Playing --> Disconnect: 玩家掉线

    Disconnect --> AIControl: AI接管
    Victory --> EndGame: 游戏结束
    Defeat --> EndGame
    EndGame --> [*]

    style Lobby fill:#FFE4B5
    style Playing fill:#90EE90
    style Victory fill:#FFD700
    style Defeat fill:#FF6B6B
```

---

## 图例说明

- **方框** 表示系统/模块
- **圆角框** 表示开始/结束状态
- **菱形** 表示决策点
- **箭头** 表示数据流或控制流
- **不同颜色** 表示不同类型的系统或状态

---

*注：这些图表使用 Mermaid 格式编写，可在支持 Mermaid 的 Markdown 查看器中渲染。*

*文档生成日期: 2026-01-08*
