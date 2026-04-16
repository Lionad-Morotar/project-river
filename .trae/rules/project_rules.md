---
alwaysApply: false
---

# GSD Assets

GSD 上下文开发框架。指令对应 `~/.gsdc/{name}.md`。

| 指令                 | 用途                         |
| -------------------- | ---------------------------- |
| `/gsd-new-project`   | 初始化新项目                 |
| `/gsd-plan-phase`    | 创建阶段计划                 |
| `/gsd-execute-phase` | 执行阶段计划                 |
| `/gsd-verify-work`   | 验证阶段完成情况             |
| `/gsd-discuss-phase` | 在规划前收集实现决策         |
| `/gsd-map-codebase`  | 分析现有代码库               |
| `/gsd-quick`         | 以 GSD 保障执行临时任务      |
| `/gsd-fast`          | 内联处理琐碎任务，跳过规划   |
| `/gsd-ship`          | 从已验证的工作创建 PR        |
| `/gsd-debug`         | 系统化调试                   |
| `/gsd-progress`      | 检查项目进度                 |
| `/gsd-next`          | 自动检测并执行下一步         |
| `/gsd-ui-phase`      | 为前端阶段生成 UI 设计合约   |
| `/gsd-ui-review`     | 对已实现前端代码进行视觉审计 |

全部指令：

- 核心: new-project new-milestone discuss-phase plan-phase execute-phase verify-work ship fast next audit-milestone complete-milestone milestone-summary forensics
- 快速: quick do note explore autonomous
- 阶段: add-phase insert-phase remove-phase list-phase-assumptions plan-milestone-gaps research-phase reapply-patches
- 质量: review code-review code-review-fix pr-branch audit-uat add-tests validate-phase secure-phase
- UI: ui-phase ui-review
- 工作流: workstreams add-backlog
- 工作区: new-workspace list-workspaces remove-workspace
- 会话: pause-work resume-work session-report health stats
- 任务: plant-seed add-todo check-todos
- 配置: settings set-profile profile-user update help
- 其他: map-codebase import inbox intel manager scan thread undo graphify extract_learnings docs-update eval-review ai-integration-phase analyze-dependencies audit-fix cleanup from-gsd2 join-discord

参考: [Agent](./gsd-agents.md) [References](./gsd-references.md)
