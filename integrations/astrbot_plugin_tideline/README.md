# astrbot_plugin_tideline

通过独立只读令牌查询潮汐已有资讯、每日简报与来源。默认仅AstrBot管理员可调用，不触发采集、收费模型或主动群发。

复制本目录至AstrBot的data/plugins目录，安装requirements.txt并重载。配置base_url及token；token与潮汐ASTRBOT_API_TOKEN一致。

命令：/潮汐资讯 [关键词]、/潮汐简报 [日期]、/潮汐来源。

完整文档：https://github.com/XneoZero/tideline/blob/main/docs/astrbot.md

客户端Mock测试和插件语法检查已覆盖；完整AstrBot加载与真实QQ对话仍待部署验收。
