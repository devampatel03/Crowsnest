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
   run automatically: Python import/tests, and JS lint/typecheck/build).
5. Write a clear PR description: what changed, why, and how you verified it.
6. Link the PR to the issue it addresses, if any.
7. A maintainer will review and may ask for changes before merging.

## Development quickstart

Full setup (env vars, backend, dashboard, Slack bot, VS Code extension) is
in the root [README.md](README.md#setup) and [setup.md](setup.md). This
section is about the day-to-day dev loop once you're set up.

### Running each package

- **Backend (Python/FastAPI + CoralEngine)** — from the repo root:
  ```bash
  source .venv-claude/bin/activate   # Windows: .venv-claude\Scripts\activate
  uvicorn packages.core.api:app --host 0.0.0.0 --port 8000 --reload
  ```
- **Dashboard, Slack bot, VS Code extension, CLI** — each has its own
  `dev`/`build`/`lint`/`typecheck`/`test` scripts (not all packages define
  every script; run `npm run` with no args in a package to see what's
  available):
  ```bash
  cd packages/<name>
  npm install
  npm run dev
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
  --if-present` across the JS workspaces, or `npm run test` inside an
  individual package.

### What CI checks

`.github/workflows/ci.yml` runs two jobs on every push to `main` and every
PR:

- **`python`** — sets up Python 3.12, runs `pip install -e .[dev]`, does an
  import smoke-test (`python -c "import packages.core.api"`), then runs
  `pytest` if `packages/core/tests` exists.
- **`javascript`** — sets up Node 20 with corepack, installs with
  `pnpm install --frozen-lockfile` (falling back to `npm install` if that
  fails), then runs `pnpm run lint`, `pnpm run typecheck`, `pnpm run build`,
  and `pnpm --parallel --if-present run test` across the JS workspaces.

A PR needs both jobs green before it's merge-ready. Run the equivalent
commands locally before opening a PR to catch failures early — see
"Running each package" and "Running tests" above.

### Commit conventions

There's no enforced commit message format yet — write clear, descriptive
commit messages that explain *why*, not just *what*. See "Branch and PR
workflow" above for branch naming and PR expectations.
