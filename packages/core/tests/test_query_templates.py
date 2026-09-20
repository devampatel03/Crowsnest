"""
Tests for packages/core/queries/templates.py — the `_safe_substitute`
allowlist validator used by QueryLibrary.get() to interpolate {param}
placeholders into SQL templates.
"""

from __future__ import annotations

import pytest

from packages.core.queries.templates import QueryLibrary, _safe_substitute


class TestSafeSubstituteValidInputs:
    def test_plain_alphanumeric_string_passes(self):
        result = _safe_substitute("SELECT * WHERE x = {name}", {"name": "lodash"})
        assert result == "SELECT * WHERE x = lodash"

    def test_string_with_allowed_special_chars_passes(self):
        # underscores, hyphens, dots, @ and / are all allowed
        result = _safe_substitute(
            "WHERE pkg = {name}", {"name": "@scope/pkg-name_v1.2"}
        )
        assert result == "WHERE pkg = @scope/pkg-name_v1.2"

    def test_int_param_passes(self):
        result = _safe_substitute("LIMIT {n}", {"n": 50})
        assert result == "LIMIT 50"

    def test_float_param_passes(self):
        result = _safe_substitute("WHERE score > {threshold}", {"threshold": 0.7})
        assert result == "WHERE score > 0.7"

    def test_missing_placeholder_in_template_is_ignored(self):
        # If the key isn't present as a {placeholder}, it's silently skipped.
        result = _safe_substitute("SELECT 1", {"unused": "anything at all;"})
        assert result == "SELECT 1"

    def test_multiple_params_all_substituted(self):
        result = _safe_substitute(
            "{a} AND {b} AND {c}", {"a": "x", "b": 1, "c": 2.5}
        )
        assert result == "x AND 1 AND 2.5"


class TestSafeSubstituteDangerousInputs:
    @pytest.mark.parametrize(
        "dangerous_value",
        [
            "'; DROP TABLE users; --",
            "x' OR '1'='1",
            "value; DELETE FROM t",
            "a\" OR \"1\"=\"1",
            "value)) UNION SELECT * FROM secrets --",
            "has space",
            "semi;colon",
            "quote'here",
            "pipe|here",
            "back`tick",
        ],
    )
    def test_sql_metacharacters_raise_value_error(self, dangerous_value):
        with pytest.raises(ValueError):
            _safe_substitute("SELECT * WHERE x = {v}", {"v": dangerous_value})

    @pytest.mark.parametrize(
        "bad_type_value",
        [
            ["a", "list"],
            {"a": "dict"},
            None,
            object(),
            b"bytes-value",
        ],
    )
    def test_non_string_non_numeric_types_raise_type_error(self, bad_type_value):
        with pytest.raises(TypeError):
            _safe_substitute("SELECT * WHERE x = {v}", {"v": bad_type_value})

    def test_bool_is_accepted_because_it_is_an_int_subclass(self):
        # bool is a subclass of int in Python, so isinstance(val, int) is True.
        # This documents current behavior rather than asserting it's ideal.
        result = _safe_substitute("WHERE flag = {v}", {"v": True})
        assert result == "WHERE flag = True"


class TestQueryLibraryGetIntegration:
    def test_get_with_safe_params_returns_populated_sql(self):
        sql = QueryLibrary.get("SHAI_HULUD", {"lookback_days": 7})
        assert "{lookback_days}" not in sql
        assert "7" in sql

    def test_get_with_unsafe_params_raises_value_error(self):
        with pytest.raises(ValueError):
            QueryLibrary.get("XZ_PATTERN", {"lookback_new_days": "180; DROP TABLE x"})

    def test_get_unknown_query_raises_key_error(self):
        with pytest.raises(KeyError):
            QueryLibrary.get("NOT_A_REAL_QUERY")

    def test_list_queries_contains_known_templates(self):
        names = QueryLibrary.list_queries()
        for expected in ("XZ_PATTERN", "SHAI_HULUD", "SLOPSQUATTING", "SLSA_POISONING"):
            assert expected in names
