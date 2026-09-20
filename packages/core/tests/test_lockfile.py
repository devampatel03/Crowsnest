"""
Tests for packages/core/sources/lockfile.py — direct-vs-transitive
classification logic in LockfileSource.parse_package_lock (v2/v3 and v1
package-lock.json formats).
"""

from __future__ import annotations

import json

from packages.core.sources.lockfile import LockfileSource


def _write(tmp_path, name: str, data: dict) -> str:
    p = tmp_path / name
    p.write_text(json.dumps(data), encoding="utf-8")
    return str(p)


class TestParsePackageLockV3:
    def _make_lockfile_v3(self, tmp_path):
        lockfile = {
            "lockfileVersion": 3,
            "packages": {
                "": {"name": "root-app", "version": "1.0.0"},
                "node_modules/left-pad": {"version": "1.3.0", "resolved": "https://x/left-pad", "integrity": "sha512-aaa"},
                "node_modules/lodash": {"version": "4.17.21", "resolved": "https://x/lodash", "integrity": "sha512-bbb"},
                "node_modules/left-pad/node_modules/nested-dep": {"version": "0.0.1"},
            },
        }
        package_json = {
            "dependencies": {"left-pad": "^1.3.0"},
            "devDependencies": {"lodash": "^4.17.21"},
        }
        _write(tmp_path, "package.json", package_json)
        return _write(tmp_path, "package-lock.json", lockfile)

    def test_direct_deps_from_package_json_are_classified_direct(self, tmp_path):
        source = LockfileSource()
        lockfile_path = self._make_lockfile_v3(tmp_path)
        records = source.parse_package_lock(lockfile_path)

        by_name = {r["package"]: r for r in records}
        assert by_name["left-pad"]["declared_in"] == "direct"
        assert by_name["lodash"]["declared_in"] == "direct"

    def test_deps_not_in_package_json_are_classified_transitive(self, tmp_path):
        source = LockfileSource()
        lockfile_path = self._make_lockfile_v3(tmp_path)
        records = source.parse_package_lock(lockfile_path)

        by_name = {r["package"]: r for r in records}
        assert by_name["nested-dep"]["declared_in"] == "transitive"

    def test_root_package_entry_is_skipped(self, tmp_path):
        source = LockfileSource()
        lockfile_path = self._make_lockfile_v3(tmp_path)
        records = source.parse_package_lock(lockfile_path)
        names = {r["package"] for r in records}
        assert "root-app" not in names
        assert "" not in names

    def test_nested_node_modules_name_is_stripped_correctly(self, tmp_path):
        source = LockfileSource()
        lockfile_path = self._make_lockfile_v3(tmp_path)
        records = source.parse_package_lock(lockfile_path)
        names = {r["package"] for r in records}
        assert "nested-dep" in names
        assert "left-pad/node_modules/nested-dep" not in names

    def test_ecosystem_and_metadata_fields_populated(self, tmp_path):
        source = LockfileSource()
        lockfile_path = self._make_lockfile_v3(tmp_path)
        records = source.parse_package_lock(lockfile_path)
        by_name = {r["package"]: r for r in records}
        assert by_name["lodash"]["ecosystem"] == "npm"
        assert by_name["lodash"]["version"] == "4.17.21"
        assert by_name["lodash"]["integrity_hash"] == "sha512-bbb"
        assert by_name["lodash"]["resolved_url"] == "https://x/lodash"

    def test_no_package_json_falls_back_to_structural_depth_heuristic(self, tmp_path):
        # Without an adjacent package.json, direct = not nested, transitive = nested.
        lockfile = {
            "lockfileVersion": 3,
            "packages": {
                "": {},
                "node_modules/top-level-dep": {"version": "1.0.0"},
                "node_modules/top-level-dep/node_modules/inner-dep": {"version": "2.0.0"},
            },
        }
        lockfile_path = _write(tmp_path, "package-lock.json", lockfile)
        source = LockfileSource()
        records = source.parse_package_lock(lockfile_path)
        by_name = {r["package"]: r for r in records}
        assert by_name["top-level-dep"]["declared_in"] == "direct"
        assert by_name["inner-dep"]["declared_in"] == "transitive"


class TestParsePackageLockV1:
    def test_v1_format_top_level_direct_nested_transitive(self, tmp_path):
        lockfile = {
            "lockfileVersion": 1,
            "dependencies": {
                "left-pad": {
                    "version": "1.3.0",
                    "dependencies": {
                        "nested-dep": {"version": "0.0.1"},
                    },
                },
                "lodash": {"version": "4.17.21"},
            },
        }
        lockfile_path = _write(tmp_path, "package-lock.json", lockfile)
        source = LockfileSource()
        records = source.parse_package_lock(lockfile_path)
        by_name = {r["package"]: r for r in records}
        assert by_name["left-pad"]["declared_in"] == "direct"
        assert by_name["lodash"]["declared_in"] == "direct"
        assert by_name["nested-dep"]["declared_in"] == "transitive"

    def test_v1_format_honors_package_json_override(self, tmp_path):
        lockfile = {
            "lockfileVersion": 1,
            "dependencies": {
                "left-pad": {
                    "version": "1.3.0",
                    "dependencies": {"nested-dep": {"version": "0.0.1"}},
                },
            },
        }
        package_json = {"dependencies": {"nested-dep": "^0.0.1"}}
        _write(tmp_path, "package.json", package_json)
        lockfile_path = _write(tmp_path, "package-lock.json", lockfile)
        source = LockfileSource()
        records = source.parse_package_lock(lockfile_path)
        by_name = {r["package"]: r for r in records}
        # package.json explicitly lists nested-dep as a direct dep, so it
        # overrides the structural (nested => transitive) heuristic.
        assert by_name["nested-dep"]["declared_in"] == "direct"
        # left-pad is NOT listed in package.json's dependencies, so with
        # direct_deps present it is classified transitive despite being
        # top-level in the lockfile structure.
        assert by_name["left-pad"]["declared_in"] == "transitive"


class TestDetectAndParse:
    def test_detect_and_parse_finds_package_lock_and_tags_project_path(self, tmp_path):
        lockfile = {
            "lockfileVersion": 3,
            "packages": {
                "": {},
                "node_modules/left-pad": {"version": "1.3.0"},
            },
        }
        _write(tmp_path, "package-lock.json", lockfile)
        source = LockfileSource()
        records = source.detect_and_parse(str(tmp_path))
        assert len(records) == 1
        assert records[0]["package"] == "left-pad"
        assert records[0]["project_path"] == str(tmp_path)

    def test_detect_and_parse_returns_empty_when_no_lockfile_present(self, tmp_path):
        source = LockfileSource()
        records = source.detect_and_parse(str(tmp_path))
        assert records == []
