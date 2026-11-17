# 架构与状态

Node.js + Express + SQLite，原生浏览器模块界面。

```text
RSS / JSON / 新闻页 / 账号主页
  → collectors（限时、来源约束、正文范围）
  → core（规范化、URL去重、事务持久化）
  → analysis-service（独立模型适配、预算、并发锁）
  → 工作台 / 每日简报 / Whale / AstrBot
```

- `src/core.mjs`：条目、来源、任务、简报、配置和调用账本。
- `src/collection-service.mjs`：界面和调度共用的采集锁与运行记录。
- `src/analysis-service.mjs`：共用分析队列、日调用限额；超时结果未知时不自动重复收费。
- `src/scheduler.mjs`：定时周期、检查点和最多3次退避重试；重启合并错过的周期。
- `src/accounts.mjs`、`platform-sessions.mjs`、`social-collectors.mjs`：账号规范化、独立登录档案和中文平台适配。
- `src/astrbot-routes.mjs`：仅输出已有有效资讯，不触发采集和模型调用。
- `public/`：工作台、信号、关注账号、简报、收藏、监控和设置。

采集时间与原文发布时间分开；简报按上海时区的原文日期归档。模型解读是推断，保留原文和材料限制；正文不足或身份/日期不可验证的内容不自动分析。

已实现的是单机早期版本。语义聚类、多用户隔离、生产公网部署、完整媒体解析尚未实现。平台站点可能改变结构或限制访问，测试夹具通过不等同于登录后的线上采集通过。
