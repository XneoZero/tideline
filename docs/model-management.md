# 模型连接管理

进入“系统设置 → 模型分析服务 → 添加模型”。选择厂商后填写 API Key；自定义服务还需填写 Base URL。输入模型 ID，或点击“获取模型列表”后在输入框选择。保存后可立即设为当前分析模型，无需重启。

预设包括 DeepSeek、OpenAI、阿里云百炼、硅基流动、智谱、MiniMax、Anthropic、Gemini 兼容接口与 Ollama。预设只是地址及协议模板，不保证每个模型或地区都有权限；请按厂商控制台提供的地址修改。模型 ID 不固定，避免过期别名。没有模型列表接口的服务可以手动填写。

- OpenAI 兼容协议请求 `BASE_URL/chat/completions`，获取列表请求 `BASE_URL/models`。Base URL 应包含厂商要求的版本路径。
- Anthropic 协议请求 `BASE_URL/messages`，使用 `x-api-key` 与可编辑的 `anthropic-version`。不包含 AWS Bedrock 或 Vertex 的专用鉴权。
- Gemini 预设使用其 OpenAI 兼容接口，不是原生 `generateContent` 协议。
- Ollama 等本地服务可以取消“此服务需要 API Key”。本地也必须先安装并启动模型服务。
- 模型不支持 JSON 模式时，取消高级选项中的“请求 JSON 模式”。模型仍须按分析契约返回有效 JSON，否则记录失败。

“获取模型列表”仅进行列表请求，不生成内容；列表可达不保证能生成。“测试生成（可能计费）”会真实请求一段简短 JSON，计入每日模型调用上限，失败也计数。测试结果不是完整分析质量评估。

切换当前连接对下一批分析生效，已开始的一批使用启动时的配置。选择“关闭模型分析”保留采集与阅读。删除当前连接前需先切换。

编辑时密钥不回显，留空保留原密钥；更换 API 域名需要重新输入密钥。环境变量连接只读，原有 `.env` 配置仍可使用；点击“导入环境变量配置”可以创建可编辑副本。不会读取 DSH 的密钥。

## 存储与迁移

配置存于本机 SQLite，API Key 使用 AES-256-GCM 加密；本机解密主密钥位于 `data/model-vault.key`。`data/` 整体被 Git 忽略。备份/迁移须同时保留数据库和主密钥；主密钥丢失时需重新输入连接密钥。同一用户可读取数据库和主密钥时仍可解密，此机制不替代操作系统访问控制。

管理页面面向本机单用户，没有公网鉴权。仅向你信任的厂商或中转地址填写密钥；生成时会向该地址发送待分析文本。详见 [安全说明](../SECURITY.md) 和 [费用](models-and-cost.md)。

## HTTP 接口

所有路径以 `/api/v1/model-providers` 为前缀，仅供本机管理端调用：

| 方法 / 路径 | 用途 |
| --- | --- |
| GET `/` | 已脱敏的连接、预设和当前选择 |
| POST `/` | 添加连接 |
| PUT `/:id` | 编辑连接，空白 API Key 保留原值 |
| DELETE `/:id` | 删除非当前连接 |
| PATCH `/active` | `{ "id": "连接ID、env或none" }` |
| POST `/discover` | 用草稿或已有 id 获取模型列表 |
| POST `/test` | 显式进行可能计费的生成测试 |
| POST `/import-environment` | 将环境配置复制为可编辑连接 |

草稿字段：`vendor`、`name`、`baseUrl`、`model`、`apiKey`、`protocol`（`openai`/`anthropic`）、`requiresKey`、`jsonMode`、`apiVersion`。编辑及测试可传已有 `id`。所有响应隐藏密钥；草稿及编辑中的密钥只通过请求发送至本机后端。

协议参考：[DeepSeek 模型列表](https://api-docs.deepseek.com/api/list-models/)、[Anthropic API 版本](https://platform.claude.com/docs/en/api/versioning)、[Gemini OpenAI 兼容](https://ai.google.dev/gemini-api/docs/openai)。
