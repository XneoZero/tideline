"""AstrBot command adapter. Reads existing information; never triggers paid analysis."""

from astrbot.api import AstrBotConfig
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star

from .client import FeedClientError, TidelineClient


class TidelinePlugin(Star):
    def __init__(self, context: Context, config: AstrBotConfig):
        super().__init__(context)
        self.config = config

    def client(self):
        return TidelineClient(
            self.config.get("base_url", "http://127.0.0.1:4317"),
            self.config.get("token", ""),
        )

    async def request(self, path, **params):
        client = self.client()
        try:
            return await client.get(path, **params)
        finally:
            await client.close()

    @filter.permission_type(filter.PermissionType.ADMIN)
    @filter.command("潮汐资讯")
    async def feed(self, event: AstrMessageEvent, keyword: str = ""):
        """查询已分析的真实资讯，例如 /潮汐资讯 智能体。"""
        try:
            data = await self.request("feed", q=keyword, limit=3)
            if not data["items"]:
                yield event.plain_result("暂无匹配的有效信号。")
                return
            for item in data["items"]:
                text = "\n".join(
                    [
                        item["title"],
                        item["summary"],
                        "来源：" + item["source"]["name"],
                        "材料范围：" + item["contentScope"],
                        item["url"],
                        "模型解读需返回原文核实。",
                    ]
                )
                yield event.plain_result(text[:3500])
        except FeedClientError as exc:
            yield event.plain_result("潮汐：" + str(exc))

    @filter.permission_type(filter.PermissionType.ADMIN)
    @filter.command("潮汐简报")
    async def brief(self, event: AstrMessageEvent, day: str = ""):
        """读取已生成的每日简报，可带 YYYY-MM-DD 日期。"""
        try:
            data = await self.request("brief", **({"day": day} if day else {}))
            brief = data["brief"]
            text = brief["title"] + f"\n有效信号 {brief['count']} 条。\n"
            for item in brief["items"][:5]:
                text += (
                    "\n"
                    + item["title"]
                    + "\n"
                    + item["summary"]
                    + "\n"
                    + item["url"]
                    + "\n"
                )
            yield event.plain_result(text[:3500])
        except FeedClientError as exc:
            yield event.plain_result("潮汐：" + str(exc))

    @filter.permission_type(filter.PermissionType.ADMIN)
    @filter.command("潮汐来源")
    async def sources(self, event: AstrMessageEvent):
        """查询可用来源，不返回登录档案或密钥。"""
        try:
            data = await self.request("sources")
            lines = ["潮汐来源："] + [
                s["name"] + (" · 已启用" if s["enabled"] else " · 已停用")
                for s in data["sources"][:30]
            ]
            yield event.plain_result("\n".join(lines)[:3500])
        except FeedClientError as exc:
            yield event.plain_result("潮汐：" + str(exc))
