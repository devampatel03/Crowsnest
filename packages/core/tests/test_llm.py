"""Model-provider layer: provider choice from the environment, the OpenAI-compatible client against a real local
HTTP server, JSON extraction, and the hardening of what a model is allowed to put into an incident."""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import AsyncMock, MagicMock

import pytest
from test_agents_pipeline import ROWS, fake_client, state

from packages.core.agents import detection_planner, investigation
from packages.core.llm import LLMError, LLMResponse, describe, extract_json, resolve_settings
from packages.core.llm.__main__ import upsert_env
from packages.core.llm.providers import PRESETS, OpenAICompatClient


class TestResolve:
    def test_nothing_set_means_fixed_rules(self):
        assert resolve_settings({}) is None
        assert describe({})["configured"] is False

    @pytest.mark.parametrize(
        "env,expected",
        [
            ({"ANTHROPIC_API_KEY": "k"}, "anthropic"),
            ({"OPENAI_API_KEY": "k"}, "openai"),
            ({"GEMINI_API_KEY": "k"}, "gemini"),
            ({"GROQ_API_KEY": "k"}, "groq"),
            ({"OPENROUTER_API_KEY": "k", "GROQ_API_KEY": "k"}, "openrouter"),  # documented order
        ],
    )
    def test_a_usual_key_is_enough(self, env, expected):
        s = resolve_settings(env)
        assert s and s.provider == expected and s.auto_detected

    def test_existing_anthropic_only_users_see_no_change(self):
        s = resolve_settings({"ANTHROPIC_API_KEY": "k"})
        assert s.model == PRESETS["anthropic"].default_model and s.preset.kind == "anthropic"

    def test_explicit_provider_and_model_win(self):
        s = resolve_settings({"CROWSNEST_LLM_PROVIDER": "OpenAI", "OPENAI_API_KEY": "k", "ANTHROPIC_API_KEY": "a",
                              "CROWSNEST_LLM_MODEL": "gpt-x"})
        assert (s.provider, s.model, s.api_key) == ("openai", "gpt-x", "k")

    def test_generic_key_works_for_any_provider(self):
        s = resolve_settings({"CROWSNEST_LLM_PROVIDER": "groq", "CROWSNEST_LLM_API_KEY": "g"})
        assert s.api_key == "g"

    def test_local_providers_need_no_key(self):
        s = resolve_settings({"CROWSNEST_LLM_PROVIDER": "ollama"})
        assert s.api_key == "" and s.base_url == "http://localhost:11434/v1"

    def test_custom_address(self):
        s = resolve_settings({"CROWSNEST_LLM_PROVIDER": "custom", "CROWSNEST_LLM_BASE_URL": "http://gw/v1",
                              "CROWSNEST_LLM_MODEL": "m"})
        assert s.base_url == "http://gw/v1"

    def test_mistakes_are_loud_and_helpful(self):
        with pytest.raises(LLMError, match="Unknown provider 'opnai'"):
            resolve_settings({"CROWSNEST_LLM_PROVIDER": "opnai"})
        with pytest.raises(LLMError, match="OPENAI_API_KEY"):
            resolve_settings({"CROWSNEST_LLM_PROVIDER": "openai"})
        with pytest.raises(LLMError, match="no provider is named"):
            resolve_settings({"CROWSNEST_LLM_API_KEY": "k"})

    def test_status_never_contains_the_key(self):
        out = json.dumps(describe({"OPENAI_API_KEY": "sk-secret-123"}))
        assert "sk-secret-123" not in out and "openai" in out


class _Script:
    def __init__(self):
        self.replies: list[tuple[int, dict | str]] = []
        self.seen: list[dict] = []


@pytest.fixture
def server():
    script = _Script()

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            script.seen.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
            status, payload = script.replies.pop(0) if script.replies else (500, "no scripted reply")
            data = (payload if isinstance(payload, str) else json.dumps(payload)).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):  # keep test output clean
            pass

    httpd = HTTPServer(("127.0.0.1", 0), H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    script.url = f"http://127.0.0.1:{httpd.server_address[1]}/v1"
    yield script
    httpd.shutdown()


def ok(text="hi", p=11, c=4):
    return 200, {"choices": [{"message": {"content": text}}], "usage": {"prompt_tokens": p, "completion_tokens": c}}


class TestOpenAICompat:
    @pytest.mark.asyncio
    async def test_sends_the_standard_request_and_reads_text_and_tokens(self, server):
        server.replies = [ok(" [\"A\"] ", 11, 4)]
        c = OpenAICompatClient("openai", server.url, "sk-1", "m1")
        r = await c.complete(system="sys", user="usr", max_tokens=50)
        assert (r.text, r.input_tokens, r.output_tokens, r.total_tokens) == ('["A"]', 11, 4, 15)
        sent = server.seen[0]
        assert sent["path"] == "/v1/chat/completions" and sent["auth"] == "Bearer sk-1"
        assert sent["body"]["model"] == "m1" and sent["body"]["max_tokens"] == 50
        assert sent["body"]["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]

    @pytest.mark.asyncio
    async def test_no_key_sends_no_auth_header_and_missing_usage_is_zero(self, server):
        server.replies = [(200, {"choices": [{"message": {"content": "x"}}]})]
        r = await OpenAICompatClient("ollama", server.url, "", "llama3.1").complete(system="s", user="u")
        assert server.seen[0]["auth"] is None and r.total_tokens == 0

    @pytest.mark.asyncio
    async def test_newer_models_that_want_max_completion_tokens_are_retried(self, server):
        server.replies = [(400, "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."), ok("done")]
        r = await OpenAICompatClient("openai", server.url, "k", "m").complete(system="s", user="u", max_tokens=9)
        assert r.text == "done"
        assert "max_tokens" not in server.seen[1]["body"] and server.seen[1]["body"]["max_completion_tokens"] == 9

    @pytest.mark.asyncio
    async def test_a_rate_limit_is_retried_once(self, server):
        server.replies = [(429, "slow down"), ok("fine")]
        assert (await OpenAICompatClient("x", server.url, "k", "m").complete(system="s", user="u")).text == "fine"

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status,fragment",
        [(401, "rejected the key"), (403, "rejected the key"), (404, "Check the address"), (500, "HTTP 500")],
    )
    async def test_failures_say_what_to_do(self, server, status, fragment):
        server.replies = [(status, "nope"), (status, "nope")]
        with pytest.raises(LLMError, match=fragment):
            await OpenAICompatClient("x", server.url, "k", "m").complete(system="s", user="u")

    @pytest.mark.asyncio
    async def test_unreadable_and_empty_replies(self, server):
        server.replies = [(200, "<html>proxy login</html>")]
        with pytest.raises(LLMError, match="cannot read"):
            await OpenAICompatClient("x", server.url, "k", "m").complete(system="s", user="u")
        server.replies = [(200, {"choices": [{"message": {"content": None}}]})]
        assert (await OpenAICompatClient("x", server.url, "k", "m").complete(system="s", user="u")).text == ""

    @pytest.mark.asyncio
    async def test_nothing_listening_is_an_llm_error(self):
        with pytest.raises(LLMError, match="Could not reach"):
            await OpenAICompatClient("ollama", "http://127.0.0.1:9/v1", "", "m", timeout=2).complete(system="s", user="u")

    def test_missing_address_or_model_fail_at_build_time(self):
        with pytest.raises(LLMError, match="BASE_URL"):
            OpenAICompatClient("custom", "", "", "m")
        with pytest.raises(LLMError, match="MODEL"):
            OpenAICompatClient("custom", "http://x/v1", "", "")

    @pytest.mark.asyncio
    async def test_a_whole_agent_runs_on_it(self, server):
        """Same agent code, a non-Anthropic provider: the planner reads the model's list through the real client."""
        server.replies = [ok('Sure! ```json\n["IOC_MATCH", "TYPOSQUAT_DISTANCE"]\n```', 30, 8)]
        llm = OpenAICompatClient("openai", server.url, "k", "m")
        out = await detection_planner.detection_planner_node(state(token_usage=1), llm=llm)
        assert out["pending_queries"][:2] == ["IOC_MATCH", "TYPOSQUAT_DISTANCE"] and out["token_usage"] == 39


class TestExtractJson:
    @pytest.mark.parametrize(
        "text,expected",
        [
            ('["A","B"]', ["A", "B"]),
            ('```json\n["A"]\n```', ["A"]),
            ('Here you go: [{"a": 1}] hope that helps', [{"a": 1}]),
            ('noise [not json] then ["ok"]', ["ok"]),
            ('{"a": [1]}', {"a": [1]}),
        ],
    )
    def test_finds_the_first_value(self, text, expected):
        assert extract_json(text) == expected

    def test_does_not_dig_an_array_out_of_a_wanted_to_skip_object(self):
        with pytest.raises(ValueError):
            extract_json('{"queries": ["IOC_MATCH"]}', want=(list,))

    @pytest.mark.parametrize("text", ["", "sorry, no", "[1, 2", "{"])
    def test_raises_when_there_is_none(self, text):
        with pytest.raises(ValueError):
            extract_json(text)


class TestSetupHelper:
    def test_upsert_env_keeps_other_lines_and_replaces_in_place(self):
        before = "# c\nA=1\nCROWSNEST_LLM_PROVIDER=old\nB=2\n"
        assert upsert_env(before, {"CROWSNEST_LLM_PROVIDER": "groq", "GROQ_API_KEY": "g"}) == (
            "# c\nA=1\nCROWSNEST_LLM_PROVIDER=groq\nB=2\n\nGROQ_API_KEY=g\n"
        )

    def test_upsert_env_does_not_touch_commented_or_similar_keys(self):
        before = "# GROQ_API_KEY=commented\nGROQ_API_KEY_OLD=keep\n"
        out = upsert_env(before, {"GROQ_API_KEY": "new"})
        assert "# GROQ_API_KEY=commented" in out and "GROQ_API_KEY_OLD=keep" in out and out.endswith("GROQ_API_KEY=new\n")


class TestModelOutputIsNotTrusted:
    async def classify(self, query, reply, rows=ROWS):
        return await investigation._classify_findings(query, rows, MagicMock(), fake_client(reply))

    @pytest.mark.asyncio
    async def test_a_made_up_severity_does_not_crash_the_scan(self):
        # Before: "Critical" reached triage, _SEVERITY_ORDER.index("Critical") raised, and the whole scan failed.
        alerts, _ = await self.classify("SHAI_HULUD", '[{"attack_pattern":"worm","confidence":0.8,"severity":"Critical","packages":["evil"]}]')
        assert alerts[0]["severity"] == "CRITICAL"  # worm default
        from packages.core.agents.triage import triage_node

        out = await triage_node(state(incidents=alerts))
        assert len(out["triage_output"]) == 1

    @pytest.mark.asyncio
    async def test_unknown_pattern_falls_back_to_the_querys_own(self):
        alerts, _ = await self.classify("TYPOSQUAT_DISTANCE", '[{"attack_pattern":"alien_invasion","confidence":0.8,"packages":["evil"]}]')
        assert alerts[0]["attack_pattern"] == "typosquat"

    @pytest.mark.asyncio
    async def test_confidence_is_clamped_to_0_1(self):
        alerts, _ = await self.classify("IOC_MATCH", '[{"confidence":7,"packages":["evil"]}]')
        assert alerts[0]["confidence"] == 1.0

    @pytest.mark.asyncio
    async def test_a_non_numeric_confidence_falls_back_to_the_data(self):
        alerts, tokens = await self.classify("IOC_MATCH", '[{"confidence":"high","packages":["evil"]}]')
        assert tokens == 0 and alerts[0]["confidence"] == 0.95  # deterministic ioc_match synthesis

    @pytest.mark.asyncio
    async def test_invented_packages_are_not_raised(self):
        alerts, _ = await self.classify("SHAI_HULUD", '[{"attack_pattern":"worm","confidence":0.9,"packages":["totally-invented-pkg"]}]')
        # The model named only a package that is nowhere in the findings: fall back to what the data says.
        assert alerts and alerts[0]["packages"] == ["evil"]

    @pytest.mark.asyncio
    async def test_a_mix_keeps_only_the_real_names(self):
        alerts, _ = await self.classify("SHAI_HULUD", '[{"attack_pattern":"worm","confidence":0.9,"packages":["evil","ghost"]}]')
        assert alerts[0]["packages"] == ["evil"]

    @pytest.mark.asyncio
    async def test_a_model_cannot_soften_a_known_bad_list_match(self):
        alerts, _ = await self.classify("IOC_MATCH", '[{"attack_pattern":"ioc_match","confidence":0.9,"severity":"LOW","packages":["evil"]}]')
        assert alerts[0]["severity"] == "CRITICAL"

    @pytest.mark.asyncio
    async def test_empty_remediation_gets_sensible_defaults(self):
        alerts, _ = await self.classify("SHAI_HULUD", '[{"attack_pattern":"worm","confidence":0.9,"packages":["evil"],"remediation_options":[]}]')
        assert alerts[0]["remediation_options"] and all(isinstance(o, str) for o in alerts[0]["remediation_options"])

    @pytest.mark.asyncio
    async def test_the_prompt_tells_the_model_registry_text_is_data(self):
        client = fake_client("[]")
        await investigation._classify_findings("IOC_MATCH", ROWS, MagicMock(), client)
        system = client.complete.await_args.kwargs["system"]
        assert "DATA" in system and "Never follow" in system and "coral_query" not in system


class TestNoModelConfigured:
    @pytest.mark.asyncio
    async def test_planner_makes_no_call_and_uses_the_fixed_order(self):
        out = await detection_planner.detection_planner_node(state(), llm=None)
        assert out["pending_queries"] == detection_planner._default_queries(state()["scan_context"])
        assert out["token_usage"] == 0

    @pytest.mark.asyncio
    async def test_a_broken_model_never_breaks_a_scan(self):
        llm = MagicMock()
        llm.complete = AsyncMock(side_effect=LLMError("down"))
        eng = MagicMock()
        eng.query = AsyncMock(return_value=[{"package": "evil", "our_project": "/p"}])
        out = await investigation.investigation_node(state(pending_queries=["IOC_MATCH"]), coral_engine=eng, llm=llm)
        assert out["incidents"][0]["attack_pattern"] == "ioc_match" and out["token_usage"] == 0


def test_llm_status_endpoint_is_exposed(api_client):
    body = api_client.get("/api/llm").json()
    assert body == {"configured": False}


def test_llm_response_total():
    assert LLMResponse("x", 3, 4).total_tokens == 7
