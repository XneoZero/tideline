# 参与贡献

欢迎通过 [Issues](https://github.com/XneoZero/tideline/issues) 反馈问题或提出需求，通过 Pull Request 提交修改。讨论请保持尊重，并提供可复现信息。提交贡献表示你允许按本仓库 MIT 许可证分发该贡献；不要提交没有授权的代码或内容。

## 开发

需要 Node.js 24+：`npm ci`，然后 `npm start`。打开 `http://127.0.0.1:4317`。Windows 社交连接使用 Edge；浏览器测试当前使用 Edge channel。Node 的 SQLite 为内置模块。

前端位于 `public/`，后端位于 `src/`，测试位于 `test/`，AstrBot 示例位于 `integrations/`。架构和接口见 [文档](docs/architecture.md)。

```sh
npm test
npm run test:browser
node test/models-browser.cjs
node test/operations-browser.cjs
```

涉及 AstrBot Python 客户端时，还需按 README 运行其单元测试。涉及社交账号时使用隔离测试夹具，不提交真实浏览器会话或账号内容；真实平台验收结果应注明网络、登录条件和限制。不要在自动测试里调用收费模型或向真实聊天发送消息。

## 提交检查

- 描述具体问题、修改后的行为、验证方式与已知限制。
- 采集逻辑保留来源、材料范围与失败信息，不把摘要伪装成全文。
- 模型更改保留调用预算和结构化回执校验，不把失败标记为分析完成。
- 不提交 `.env`、`data/`、浏览器档案、密钥、真实日志或版权不明的内容。
- 暂存后运行 `node scripts/check-publish.mjs`。扫描只作为辅助，提交者仍须审查 diff。

仓库提供 [CI 模板](examples/github-actions-ci.yml)。当前模板尚未安装为 GitHub Actions 工作流，仓库没有 CI 通过状态承诺；维护者可在具备 workflow 写入权限的环境下将模板放入 `.github/workflows/ci.yml`。不要为了提交普通代码扩大令牌权限。

安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告。
