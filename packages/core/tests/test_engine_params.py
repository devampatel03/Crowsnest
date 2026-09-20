"""
Tests for pure-logic helpers in packages/core/coral/engine.py:

- `_replace_named_params`: substitutes :name placeholders with escaped
  literal values (used by CoralEngine._sync_query / _sync_execute).
- `_contains_unquoted_char`: quote-aware character scanner used by
  CoralEngine._validate_sql's multi-statement (semicolon) guard.

NOTE: `_validate_sql`'s injection-bypass fix itself is covered by Agent C's
`test_engine_security.py`. This file sticks to the smaller,
independently-testable string helpers `_replace_named_params` and
`_contains_unquoted_char`. It was re-synced against `_replace_named_params`
after Agent C landed its type-safety hardening concurrently (bool ->
TRUE/FALSE, datetime -> quoted isoformat, and a TypeError for any
unsupported param type instead of a bare `str(val)` fallback).
"""

from __future__ import annotations

from datetime import datetime

import pytest

from packages.core.coral.engine import _contains_unquoted_char, _replace_named_params


class TestReplaceNamedParams:
    def test_string_param_is_quoted_and_escaped(self):
        sql = _replace_named_params("SELECT * WHERE x = :name", {"name": "lodash"})
        assert sql == "SELECT * WHERE x = 'lodash'"

    def test_string_param_with_single_quote_is_escaped(self):
        sql = _replace_named_params(
            "SELECT * WHERE x = :name", {"name": "O'Brien"}
        )
        assert sql == "SELECT * WHERE x = 'O''Brien'"

    def test_string_param_attempting_injection_is_kept_as_literal_string(self):
        # The whole malicious payload is escaped and wrapped as a single
        # string literal — it can never break out into new SQL tokens.
        payload = "x'; DROP TABLE users; --"
        sql = _replace_named_params("SELECT * WHERE x = :v", {"v": payload})
        assert sql == "SELECT * WHERE x = 'x''; DROP TABLE users; --'"
        # No unquoted semicolon should exist in the resulting SQL.
        assert not _contains_unquoted_char(sql, ";")

    def test_none_param_becomes_null(self):
        sql = _replace_named_params("WHERE x = :v", {"v": None})
        assert sql == "WHERE x = NULL"

    def test_int_and_float_params_are_stringified_unquoted(self):
        sql = _replace_named_params("LIMIT :n OFFSET :o", {"n": 50, "o": 1.5})
        assert sql == "LIMIT 50 OFFSET 1.5"

    def test_bool_param_becomes_sql_true_false(self):
        sql = _replace_named_params(
            "WHERE a = :flag_on AND b = :flag_off",
            {"flag_on": True, "flag_off": False},
        )
        assert sql == "WHERE a = TRUE AND b = FALSE"

    def test_datetime_param_is_quoted_isoformat(self):
        dt = datetime(2026, 1, 1, 12, 0, 0)
        sql = _replace_named_params("WHERE ts = :t", {"t": dt})
        assert sql == f"WHERE ts = '{dt.isoformat()}'"

    def test_unsupported_param_type_raises_type_error(self):
        with pytest.raises(TypeError):
            _replace_named_params("WHERE x = :v", {"v": ["not", "a", "scalar"]})

    def test_longer_keys_replaced_before_shorter_prefix_keys(self):
        # :pkg_10 must not be corrupted by a naive replace of :pkg_1 first.
        sql = _replace_named_params(
            "WHERE a = :pkg_1 AND b = :pkg_10",
            {"pkg_1": "one", "pkg_10": "ten"},
        )
        assert sql == "WHERE a = 'one' AND b = 'ten'"

    def test_placeholder_not_present_is_a_no_op(self):
        sql = _replace_named_params("SELECT 1", {"unused": "value"})
        assert sql == "SELECT 1"


class TestContainsUnquotedChar:
    def test_detects_bare_semicolon(self):
        assert _contains_unquoted_char("SELECT 1; DROP TABLE x", ";") is True

    def test_semicolon_inside_string_literal_is_not_detected(self):
        assert _contains_unquoted_char("SELECT 'a;b'", ";") is False

    def test_no_semicolon_at_all(self):
        assert _contains_unquoted_char("SELECT 1", ";") is False

    def test_doubled_single_quote_is_treated_as_escaped_quote_in_string(self):
        # 'it''s a test;' — the ; is still inside the string because '' is
        # an escaped quote, not a string terminator.
        assert _contains_unquoted_char("SELECT 'it''s a test;'", ";") is False

    def test_semicolon_after_closed_string_is_detected(self):
        assert _contains_unquoted_char("SELECT 'value';", ";") is True
