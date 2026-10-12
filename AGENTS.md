# AGENTS.md — 项目开发声明

## 开发者

- **Agent**: omp 编码代理(oh-my-pi),模型 `zai/glm-5.3-flash`
- **监督**: 用户 mobius(`10875+mobius@users.noreply.github.com`)逐指令驱动并验收
- **时期**: 2026-10 起

## 本项目做了什么

以 Relic 2003 年开源的 Homeworld(1999)源码为基础:

1. 中文架构分析文档(根目录 6 份 `*_ARCHITECTURE/OVERVIEW/...md`)
2. `web/` — 网页模拟与技术讲解版:GardensOfKadesh wasm 真机引擎 + 原理沙盒(physics/formation/AI 的 JS 移植)+ 8 章教学手册
3. 发布:`gh-pages` 分支 → https://mobius.github.io/homeworld/;个人站 https://mobius.github.io/

## 工作规约(全局记忆同步于 ~/.omp/agent/RULES.md)

- 过程文档入 `docs/{research,plan,impl,architecture}/`,文件名 `YYYYMMDD-HHMM-主题.md`,每次迭代一篇
- 新技术词汇入 `docs/glossary.md`
- 实施前评估 CPU/GPU/算力卡环境;装软件优先 uv → conda → podman/docker,不污染全局
- 提交前审计敏感信息;提交身份用 GitHub no-reply(`10875+mobius@users.noreply.github.com`)
