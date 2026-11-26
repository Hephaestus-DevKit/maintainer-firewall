# 试点与验收

首次安装时，将[只读工作流](../examples/workflow.audit.yml)复制到试点仓库的 `.github/workflows/` 目录。打开或编辑一个 Issue，在对应的 Actions 运行摘要中确认 `dry-run` 已开启，检查配置告警、分流结论和 finding ID。[安装指南](INSTALLATION.md)

## 记录哪些结果

选取 3 到 5 个仓库，先观察 1 到 2 周。每个仓库记录安装用时、运行次数、维护者认为有用或误报的 finding ID，以及是否愿意继续使用。需要汇总多次运行时，可使用[指标工作流](../examples/workflow.metrics.yml)保存 JSON 报告，再按[指标指南](METRICS.md)统计。

先根据误报调整规则。维护者认可报告后，可以开启评论，随后启用标签。启用会阻断工作流的严格模式前，先确认团队如何处理误报。[分阶段启用指南](ROLLOUT_PLAYBOOK.md)

## 发布与后续计划

在源码仓库运行 `npm run market:check`，按[发布清单](MAINTENANCE.md#release-checklist)核对版本标签、发布包和来源证明。首次对外推广前，优先观察是否已有三个仓库完成试点、误报是否收敛，以及是否有仓库愿意启用评论。[项目路线图](ROADMAP.md) · [Marketplace 发布准备](MARKETPLACE_READINESS.md)
