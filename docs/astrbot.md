# AstrBot 接入

按 [AstrBot官方插件开发指南](https://docs.astrbot.app/dev/star/plugin-new.html) 与 [插件配置文档](https://docs.astrbot.app/dev/star/guides/plugin-config.html) 实现。

## 服务端接口

在潮汐 `.env` 中填写 `ASTRBOT_API_TOKEN` 并重启。该令牌独立于Whale令牌，不公开展示。接口只读取已有结果，不调用模型、不启动采集、不发送QQ消息。

| 请求 | 返回 |
|---|---|
| GET /api/v1/astrbot/feed | 已分析且保留的真实信号，默认5条，limit最大20 |
| GET /api/v1/astrbot/brief?day=YYYY-MM-DD | 已生成简报，默认上海当日，没有则404 |
| GET /api/v1/astrbot/sources | 去掉敏感配置和主页查询参数的来源概览 |

使用 `Authorization: Bearer <ASTRBOT_API_TOKEN>`。未配置503，令牌错误401，写入请求405。feed支持q/platform/manufacturer/source/limit/offset筛选，始终排除演示和无效材料。

## 安装插件

本仓库是完整信息站，不能把根目录当作AstrBot插件直接安装。

将 `integrations/astrbot_plugin_tideline` 整个子目录复制到 AstrBot 的 `data/plugins/astrbot_plugin_tideline/`，安装该目录requirements.txt中的依赖，然后在WebUI重载插件。也可把该子目录内部文件打包为ZIP后从插件页上传。插件没有自动注册到市场。

在插件配置填写：

- base_url：AstrBot能访问到的潮汐地址；同机非容器通常是http://127.0.0.1:4317。
- token：与服务端ASTRBOT_API_TOKEN一致的独立令牌。

默认命令仅AstrBot管理员可用：

- `/潮汐资讯` 或 `/潮汐资讯 智能体`
- `/潮汐简报` 或 `/潮汐简报 2026-11-17`
- `/潮汐来源`

命令由AstrBot处理，不绕过其权限规则，也不主动群发。插件读取已有模型输出，因此查询不会产生额外分析调用。

Docker中的127.0.0.1指向容器自身。潮汐默认仅监听宿主机loopback，推荐先采用同机部署或宿主机网络；跨容器/远程接入需自行配置受保护的网络通道。不要直接将含管理接口的4317端口公开到互联网。

## 验证边界

独立HTTP接口已做自动化鉴权、筛选、演示隔离、只读和来源脱敏测试。Python客户端使用httpx MockTransport验证请求、错误和协议处理。插件按官方元数据/配置/命令API编写并做语法检查；尚未在完整AstrBot/真实QQ账号中加载验收。本轮没有发送任何QQ消息。
