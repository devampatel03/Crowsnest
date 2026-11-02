"""
Ecosystem names and package-name rules shared by every source and detection.

Every registry spells itself differently (PyPI, crates.io, Packagist), so one canonical name is used inside
Crowsnest and translated only at the edge: when talking to OSV, and when reading a lockfile.
"""

from __future__ import annotations

import re

NPM = "npm"
PYPI = "pypi"
CARGO = "cargo"
GO = "go"
MAVEN = "maven"
COMPOSER = "composer"
RUBYGEMS = "rubygems"

ECOSYSTEMS: tuple[str, ...] = (NPM, PYPI, CARGO, GO, MAVEN, COMPOSER, RUBYGEMS)

_ALIASES = {
    "npm": NPM,
    "pypi": PYPI,
    "pip": PYPI,
    "crates.io": CARGO,
    "crates": CARGO,
    "cargo": CARGO,
    "go": GO,
    "golang": GO,
    "maven": MAVEN,
    "packagist": COMPOSER,
    "composer": COMPOSER,
    "rubygems": RUBYGEMS,
    "gem": RUBYGEMS,
}

# How OSV.dev names each ecosystem.
_OSV_NAMES = {
    NPM: "npm",
    PYPI: "PyPI",
    CARGO: "crates.io",
    GO: "Go",
    MAVEN: "Maven",
    COMPOSER: "Packagist",
    RUBYGEMS: "RubyGems",
}

_PYPI_SEPARATORS = re.compile(r"[-_.]+")


def normalize_ecosystem(name: str | None) -> str | None:
    """Canonical ecosystem for any spelling in use (``PyPI``, ``crates.io``...), or None if unknown."""
    if not name:
        return None
    return _ALIASES.get(name.strip().lower())


def osv_ecosystem(ecosystem: str) -> str | None:
    """The name OSV.dev uses for a canonical ecosystem, or None when OSV does not cover it."""
    return _OSV_NAMES.get(ecosystem)


def normalize_package_name(ecosystem: str, name: str) -> str:
    """Name as the registry compares it, so ``Foo_Bar`` and ``foo-bar`` match on PyPI.

    PyPI treats runs of ``-``, ``_`` and ``.`` as one dash and ignores case (PEP 503). Packagist is
    case-insensitive. Other registries compare names exactly.
    """
    name = name.strip()
    if ecosystem == PYPI:
        return _PYPI_SEPARATORS.sub("-", name).lower()
    if ecosystem == COMPOSER:
        return name.lower()
    return name
