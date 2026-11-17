import importlib.util
import unittest
from pathlib import Path

import httpx

spec = importlib.util.spec_from_file_location(
    "tideline_client",
    Path(__file__).parents[1] / "integrations/astrbot_plugin_tideline/client.py",
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_is_authenticated_read_only(self):
        def handler(request):
            self.assertEqual(request.headers["authorization"], "Bearer fixture")
            self.assertEqual(request.method, "GET")
            self.assertEqual(request.url.path, "/api/v1/astrbot/feed")
            return httpx.Response(200, json={"schemaVersion": "1.0", "items": []})

        client = module.TidelineClient(
            "http://localhost:4317", "fixture", transport=httpx.MockTransport(handler)
        )
        try:
            self.assertEqual((await client.get("feed", q="AI"))["items"], [])
            with self.assertRaises(module.FeedClientError):
                await client.get("collect")
        finally:
            await client.close()

    async def test_auth_error_does_not_leak_body_or_token(self):
        client = module.TidelineClient(
            "http://localhost:4317",
            "fixture",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(401, text="private server details")
            ),
        )
        try:
            with self.assertRaises(module.FeedClientError) as caught:
                await client.get("feed")
            self.assertNotIn("private", str(caught.exception))
        finally:
            await client.close()

    async def test_invalid_envelope(self):
        client = module.TidelineClient(
            "http://localhost:4317",
            "fixture",
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[])),
        )
        try:
            with self.assertRaises(module.FeedClientError):
                await client.get("feed")
        finally:
            await client.close()

    def test_configuration(self):
        for url, token in [
            ("file:///etc/passwd", "x"),
            ("http://user:pass@localhost", "x"),
            ("http://localhost", ""),
        ]:
            with self.assertRaises(module.FeedClientError):
                module.TidelineClient(url, token)


if __name__ == "__main__":
    unittest.main()
