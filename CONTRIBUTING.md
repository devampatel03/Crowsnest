# Contributing to Crowsnest

Thanks for your interest in improving Crowsnest. This document covers how to
report issues, request features, and get a change merged.

## Reporting bugs

Open a [GitHub issue](../../issues/new/choose) using the **Bug report**
template. Include:

- What you expected to happen vs. what actually happened.
- Steps to reproduce (lockfile snippet, command run, package name, etc.).
- Relevant logs or error output — redact secrets and API keys first.
- Your environment (OS, Python/Node version, whether you're running the
  Docker images or a local venv/pnpm setup).

## Requesting features

Open a GitHub issue using the **Feature request** template. Describe the
problem you're trying to solve before proposing a solution — this helps us
figure out if it fits Crowsnest's scope (supply-chain detection across
lockfiles, registries, and threat intel) or belongs in a downstream
integration instead.

## Branch and PR workflow

1. Fork the repo (or create a branch if you have write access) off `main`.
2. Name branches descriptively, e.g. `fix/lockfile-v3-parsing` or
   `feat/slack-veto-command`.
3. Keep PRs focused — one logical change per PR. Large, multi-part changes
   should be split up or discussed in an issue first.
4. Make sure the relevant checks pass locally before opening the PR (see
   README.md and the CI workflow in `.github/workflows/ci.yml` for what's
   run automatically: Python import/tests, and JS lint/typecheck/build). Pull requests use the
   template in `.github/PULL_REQUEST_TEMPLATE.md`.
5. Write a clear PR description: what changed, why, and how you verified it.
6. Link the PR to the issue it addresses, if any.
7. A maintainer will review and may ask for changes before merging.

## Development quickstart

Full setup (env vars, backend, dashboard, Slack bot, VS Code extension) is
in the [README](README.md#quickstart). This
section is about the day-to-day dev loop once you're set up.

### Running each package

- **Backend (Python/FastAPI + CoralEngine)** — from the repo root:
  ```bash
  python -m venv .venv
  source .venv/bin/activate          # Windows: .venv\Scripts\activate
  pip install -e ".[dev]"
  uvicorn packages.core.api:app --port 8000 --reload
  ```
- **Dashboard, Slack bot, VS Code extension, CLI** — each has its own
  `dev`/`build`/`lint`/`typecheck`/`test` scripts (not all packages define
  every script; run `pnpm run` with no args in a package to see what's
  available):
  ```bash
  pnpm install                       # once, from the repo root
  cd packages/<name>
  pnpm run dev
  ```
  See each package's own `README.md` (`packages/cli`, `packages/dashboard`,
  `packages/slack-bot`, `packages/vscode-extension`) for package-specific
  env vars and run instructions.
- From the repo root, `pnpm run dev|build|lint|typecheck` runs
  `--parallel` across the JS workspaces (cli, dashboard, slack-bot,
  vscode-extension). These do not touch `packages/core`.

### Running tests

- **Python**: `pytest packages/core/tests` (or just `pytest -q` from the
  repo root once `pip install -e .[dev]` has been run).
- **JavaScript**: `pnpm run test` from the repo root runs `--parallel
  --if-present` across the JS workspaces, or `pnpm run test` inside an
  individual package.

### What CI checks

Every push to `main` and every PR runs `.github/workflows/ci.yml`. Nothing is
soft: there is no fallback to npm and no skipped step. The single required
check is **`ci-ok`**, which passes only if all of these jobs pass:

- **Python lint and types**: `ruff check .` and `mypy`.
- **Python tests**: `python -m pytest -q --cov` (coverage floor in
  `pyproject.toml`) on Linux (3.12, 3.13) and Windows (3.12).
- **JS lint, typecheck, build**: `pnpm install --frozen-lockfile`, then
  `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`.
- **JS tests**: `pnpm run test` on Linux (Node 20, 22) and Windows.
- **Backend smoke**: `node scripts/smoke.mjs`.

Separate workflows run CodeQL, dependency review, audits, gitleaks, Docker
build and scan, and Scorecard. Every job, its local command and the branch
protection settings are listed in [.github/CI.md](.github/CI.md).

### Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/) style
prefixes, for example `fix(dashboard): read docs with CRLF line endings` or
`feat(cli): add replay command`. Common prefixes are `feat`, `fix`, `docs`,
`test`, `refactor` and `chore`. Explain *why*, not just *what*. Nothing
enforces this yet, but it keeps the history readable and the changelog easy
to write.

### Changelog and versions

Add a line to `CHANGELOG.md` under **Unreleased** for any change a user would
notice. Versions follow [Semantic Versioning](https://semver.org/). While we
are on 0.x, minor versions may include breaking changes.

### Pre-commit checks

`.pre-commit-config.yaml` runs a secret scan before each commit. Install it
once with `pip install pre-commit && pre-commit install`.

## Security and conduct

- Found a vulnerability? Do not open a public issue. Follow
  [SECURITY.md](SECURITY.md).
- By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
- Looking for a first task? Look for issues labelled `good first issue`.
  Docs fixes and new test cases are always welcome.
