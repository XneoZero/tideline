# Whale Core 接入

使用 `examples/whale-client.mjs` 的 createInformationFeedClient({baseUrl,token})，令牌与服务端 FEED_API_TOKEN 一致。

| 方法 | 地址 | 作用 |
|---|---|---|
| GET | /api/v1/whale/feed | 查询条目，默认不含演示，最多100条 |
| POST | /api/v1/whale/ingest | `{items:[]}` 统一条目入库 |
| POST | /api/v1/whale/ack | `{ids:[]}` 标记已读 |

请求携带 `Authorization: Bearer <token>`。未配置返回503，无效令牌401。支持q/tag/kind/platform/manufacturer/retained/source筛选。客户端read({retained:true,platform:'bilibili'})仅取已分析有效条目。

Whale自身负责决定读取、分享与记忆写入；此项目不直接写机器人数据库或发送QQ消息。具体工具注册需要在Whale项目中实施，当前未提供其内部插件。

账号条目含platform/accountId/manufacturer/accountIdentity/openUrl。官方身份user_marked只是用户声明；材料不足时eligibleForAnalysis=false。不要把模型解读当作已核实事实。

远程或Docker部署需自行配置可达网络与管理端保护，不能将本机管理服务直接暴露公网。
