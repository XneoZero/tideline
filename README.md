# 潮汐 Tideline

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) [![Node.js 24+](https://img.shields.io/badge/Node.js-24%2B-43853d.svg)](package.json)

[使用文档](docs/model-management.md) · [贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [安全说明](SECURITY.md)

本地优先的 AI 信息采集、分析和阅读工作台。支持新闻订阅、厂商账号管理、每日简报，以及 Whale Core / AstrBot 接入。

**模型分析不是免费服务。** 默认示例使用 DeepSeek 官方 API，按输入/输出 tokens 计费；免费网页聊天不等于免费 API。新安装默认关闭定时任务，启用前请设置每日调用上限。[模型与费用](docs/models-and-cost.md)

## 快速启动

需要 Node.js 24+。Windows 社交平台连接使用已安装的 Microsoft Edge；其他系统需有 Chrome。

```sh
git clone https://github.com/XneoZero/tideline.git
cd tideline
npm ci
cp .env.example .env
# 编辑 .env，按需要填写模型配置和独立接口令牌
npm start
```

Windows 可用 `Copy-Item .env.example .env`。打开 [本机工作台](http://127.0.0.1:4317)。Windows 后台运行：`powershell -ExecutionPolicy Bypass -File scripts/start.ps1`；停止：同目录 `scripts/stop.ps1`。未安装开机自启。

## 功能

- RSS / Atom / JSON / 公开 Feed；内置 OpenAI、Anthropic、量子位，以及八个 B 站和小红书账号。
- Bilibili、小红书、X统一“关注账号”：主页录入、平台连接、厂商标签、身份声明、启停、单账号采集与内容筛选。
- 可视化多厂商模型管理：自定义 API 地址、获取模型列表、加密保存密钥、即时切换；支持 OpenAI 兼容与 Anthropic 协议、本地模型。
- 原文与中文模型解读分开，保留来源、时间、材料范围和过滤原因；URL去重、搜索、已读与收藏。
- 持久定时队列、失败退避、重启恢复、每日调用限额、Markdown简报导出。
- Whale Core接口，以及独立鉴权、只读的AstrBot接口和Python插件示例。

![关注账号页面，截图为隔离测试夹具](docs/accounts-demo.png)

![模型管理，截图为隔离测试夹具](docs/models-demo.png)

## 使用顺序

1. 在“系统设置 → 内置信息来源”一键添加新闻与社交账号。社交账号默认停用，可在“关注账号”连接平台并启用。
2. 在“关注账号”填写真实主页，按需手动连接平台。新账号默认停用，确认后再启用。
3. 在“系统设置 → 模型分析服务”配置模型和每日调用额度。采集后可点击“逐条分析”处理下一条，或在条目上选择“分析此条”。“并行分析”从所有来源选取最多 20 条待分析内容，合并为一次模型 API 请求并分别保存结果。超过 20 条的内容留待下一批。原有“采集并分析”入口每轮最多分析三条。
4. 在“自动运行”设置周期、条数与日上限，主动启用调度。服务运行时才执行。
5. 在“信号简报”按日期生成、读取和导出；历史文章按原文发布日期归档。

## 当前范围

这是可运行的早期版本。新闻HTTP采集与模型链路已有实测；社交平台适配器和登录入口已接入，但受账号登录、页面结构、网络和平台访问限制影响，不保证全部账号可采集。B站公开接口可能返回412；小红书与X需要逐账号登录验收。不会绕过登录或安全验证。

B站目前读取动态与视频文案，小红书读取可见笔记文字，X读取可见主帖文字。没有视频转写、图片OCR、完整评论或thread解析。“官方身份”是用户核对标记，不是系统自动认证。

默认仅监听127.0.0.1，控制台为本机单用户设计，没有公网多用户鉴权；不要直接暴露管理端口。数据库、登录档案、密钥和运行记录均不进入源码仓库。

## 测试

```sh
npm test
npm run test:browser
# 插件客户端测试（不需要完整AstrBot）
python -m pip install -r integrations/astrbot_plugin_tideline/requirements.txt
python -m unittest discover -s test -p "test_astrbot_client.py"
```

Node测试使用独立内存库或临时库；浏览器流程主要使用隔离夹具和模拟模型。测试不会发送QQ消息或调用收费模型。

## 接入与开发

[架构](docs/architecture.md) · [账号采集](docs/accounts.md) · [AstrBot](docs/astrbot.md) · [Whale Core](docs/whale-integration.md) · [模型管理](docs/model-management.md) · [模型费用](docs/models-and-cost.md)

AstrBot插件目录：`integrations/astrbot_plugin_tideline/`。整个仓库不是可直接从AstrBot“仓库安装”的插件根目录，请按接入文档复制该子目录或安装插件ZIP。

## 开源与反馈

代码采用 [MIT License](LICENSE)，第三方依赖和内容归属见 [NOTICE](NOTICE.md)。功能参考不代表与各平台或厂商存在合作关系。

欢迎提交 [Issue](https://github.com/XneoZero/tideline/issues) 或 Pull Request；先阅读 [贡献指南](CONTRIBUTING.md)。漏洞请使用 [私密报告](https://github.com/XneoZero/tideline/security/advisories/new)。当前无托管服务和在线演示，截图使用隔离测试数据。

CI 配置目前以 [模板](examples/github-actions-ci.yml) 提供，尚未启用自动工作流；README 不展示未运行的构建通过徽章。

## English

Tideline is a local-first AI news and account-feed workbench with provider management, structured Chinese analysis, daily briefs, and Whale Core / AstrBot integrations. Requires Node.js 24+. Run `npm ci && npm start`, then visit `http://127.0.0.1:4317`. Configure providers in Settings; API calls may incur charges. The management UI is single-user and localhost-only. Social adapters require account-by-account validation. See [contribution guidelines](CONTRIBUTING.md) and [MIT license](LICENSE).
