"""A stand-in for api.osv.dev, shared by the tests that need the malware feed."""

from __future__ import annotations

import json

import httpx

MAL_LITELLM = "MAL-2026-2144"


def _advisory(osv_id: str, summary: str, published: str) -> dict:
    return {"id": osv_id, "summary": summary, "details": "payload steals credentials", "published": published,
            "modified": published, "aliases": [], "affected": [{"package": {"name": "litellm"}}]}


class FakeOSV:
    """Stands in for api.osv.dev: `malicious` maps (OSV ecosystem, name, version) to advisory ids."""

    def __init__(self, malicious, extra_vulns=None):
        self.malicious = malicious
        self.extra_vulns = extra_vulns or []
        self.pages: dict = {}
        self.pages_for: dict = {}
        self.batches: list[list[dict]] = []
        self.details_fail: set[str] = set()
        self.advisories = {
            MAL_LITELLM: _advisory(MAL_LITELLM, "Malicious code in litellm (PyPI)", "2026-03-24T11:15:14Z"),
            "MAL-2026-2307": _advisory("MAL-2026-2307", "Malicious code in axios (npm)", "2026-03-31T00:30:00Z"),
        }

    def transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/v1/querybatch":
                queries = json.loads(request.content)["queries"]
                self.batches.append(queries)
                results = []
                for q in queries:
                    key = (q["package"]["ecosystem"], q["package"]["name"], q["version"])
                    if q.get("page_token"):
                        results.append({"vulns": [{"id": i} for i in self.pages[q["page_token"]]]})
                        continue
                    vulns = [{"id": i} for i in self.malicious.get(key, [])] + [{"id": i} for i in self.extra_vulns]
                    answer: dict = {"vulns": vulns} if vulns else {}
                    if key in self.pages_for:
                        answer["next_page_token"] = self.pages_for[key]
                    results.append(answer)
                return httpx.Response(200, json={"results": results})
            if request.url.path.startswith("/v1/vulns/"):
                osv_id = request.url.path.rsplit("/", 1)[1]
                if osv_id in self.details_fail or osv_id not in self.advisories:
                    return httpx.Response(500)
                return httpx.Response(200, json=self.advisories[osv_id])
            return httpx.Response(404)

        return httpx.MockTransport(handler)
