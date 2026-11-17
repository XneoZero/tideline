"""Async, read-only client for Tideline's dedicated AstrBot API."""

from urllib.parse import urlsplit

import httpx


class FeedClientError(Exception):
    pass


class TidelineClient:
    def __init__(self, base_url: str, token: str, transport=None):
        url = urlsplit(base_url)
        if (
            url.scheme not in ("http", "https")
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise FeedClientError("请配置有效的 HTTP(S) 潮汐服务地址")
        if not token.strip():
            raise FeedClientError("请配置 AstrBot 专用接口令牌")
        self.http = httpx.AsyncClient(
            base_url=base_url.rstrip("/") + "/",
            headers={"Authorization": "Bearer " + token},
            timeout=15,
            follow_redirects=False,
            transport=transport,
        )

    async def get(self, path: str, **params):
        if path not in ("feed", "brief", "sources"):
            raise FeedClientError("只支持只读资讯接口")
        try:
            response = await self.http.get("api/v1/astrbot/" + path, params=params)
        except httpx.RequestError:
            raise FeedClientError("无法连接潮汐服务，请检查地址和服务状态") from None
        if response.status_code != 200:
            messages = {
                401: "接口令牌无效",
                404: "暂无对应日期简报",
                503: "服务尚未配置 AstrBot 专用令牌",
            }
            raise FeedClientError(
                messages.get(
                    response.status_code, "接口返回 HTTP " + str(response.status_code)
                )
            )
        try:
            result = response.json()
        except ValueError:
            raise FeedClientError("接口未返回有效 JSON") from None
        if not isinstance(result, dict) or result.get("schemaVersion") != "1.0":
            raise FeedClientError("接口版本不兼容")
        key = {"feed": "items", "brief": "brief", "sources": "sources"}[path]
        expected = dict if path == "brief" else list
        if not isinstance(result.get(key), expected):
            raise FeedClientError("接口数据结构不兼容")
        return result

    async def close(self):
        await self.http.aclose()
