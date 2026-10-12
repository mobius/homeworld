# 术语表 glossary

交互中出现的新技术词汇,按出现顺序留档。

## Web 基础

- **WebAssembly(wasm)**:浏览器可执行的二进制指令格式,C/C++ 等语言可编译为 wasm 在网页中近原生速度运行。本项目:整个 Homeworld 引擎编译成 3.3MB 的 `homeworld.wasm`。
- **Emscripten**:把 C/C++ 编译到 wasm 的工具链,提供 SDL/POSIX 兼容层与虚拟文件系统(`homeworld.data` 就是它打包的资源)。GardensOfKadesh 用它把原版引擎带上浏览器。
- **SharedArrayBuffer(SAB)**:可在多线程(Worker)间共享的内存缓冲区;wasm 多线程(pthread)依赖它。浏览器要求页面处于**跨源隔离**状态才允许使用。
- **COOP / COEP**:`Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp` 两个响应头,共同构成跨源隔离(crossOriginIsolated=true),是启用 SAB 的前提。本项目 `serve.py` 直接下发;GitHub Pages 不带这两个头。
- **Service Worker / coi-serviceworker**:Service Worker 是页面外的可编程代理,可拦截并改写响应。coi-serviceworker 是现成小脚本:无隔离头的环境里注册 SW 给响应补 COOP/COEP 再刷新页面;局限:在 iframe 内不生效(本项目实测踩坑)。
- **GitHub Pages**:GitHub 静态托管。**用户站** `<user>.github.io`(推送 main 自动发布)与**项目站** `<user>.github.io/<repo>`(需开一次开关,来源可选 `gh-pages` 分支)。响应默认不带 COOP/COEP,且 CDN 缓存 10 分钟(改版后可能看到旧页)。

## 游戏/模拟器

- **whip-strafe(鞭打飞掠)**:Homeworld 拦截机的攻击机动:接近→从目标上/下半平面飞掠并开火→冲过头→重新接近,循环。对应 `GenericInterceptor.c` 的 `STATE_WHIPSTRAFE1`/`STATE_REAPPROACH`。
- **lockstep 同步**:RTS 多人联机方式:只广播玩家命令,各端各自确定性模拟,定期交换校验和。Homeworld 的 CommandNetwork 即此架构,也是沙盒命令队列的原型。
- **静态重编译(recompilation)**:把老主机(PS1 MIPS 等)机器码整体翻译成 C#/C++ 等原生代码再编译,而非逐条解释。mobius 的 psx-ac2-recomp / psx-vagrantstory-recomp 用此技术。

## 工具链(工作规约指定)

- **uv**:Rust 写的极快 Python 包/环境管理器,`uv venv` + `uv pip` 秒级建本地环境,替代全局 pip。装 Python 依赖的**首选**(规约 3)。
- **conda**:跨语言科学计算环境管理器,环境相互隔离;uv 不适用时(重科学栈/非 Python 组件)的次选。
- **podman / docker**:容器化,把依赖连同系统环境打包;无守护进程的 podman 可作 docker 替代。前两者都不可行时的兜底。共同目标:不污染全局环境。

## 协作约定

- **GitHub no-reply 邮箱**:GitHub 提供的匿名提交邮箱(新式格式 `<id>+<login>@users.noreply.github.com`),git 提交用它可隐藏真实邮箱。本项目统一 `10875+mobius@users.noreply.github.com`。
