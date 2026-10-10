# Continuous integration

All workflows live in `.github/workflows/`. Top-level permissions are `contents: read`; jobs widen only where noted.

## Jobs and local equivalents

| Workflow / job | Checks | Run locally |
|---|---|---|
| ci / Python lint and types | ruff (E,F,I,B,UP,S), mypy | `ruff check .` and `mypy` |
| ci / Python tests | pytest, coverage floor (`fail_under` in pyproject), Linux 3.12 and 3.13, Windows 3.12 | `python -m pytest -q --cov` |
| ci / JS lint, typecheck, build | eslint, tsc, next build, package builds | `pnpm install --frozen-lockfile && pnpm run lint && pnpm run typecheck && NEXT_PUBLIC_SITE_URL=https://crowsnest.example pnpm run build` |
| ci / JS tests | vitest in every workspace, Node 20 and 22 on Linux, Node 22 on Windows | `pnpm run test` |
| ci / Backend smoke | 16 API checks against a started backend (temp DB, no keys) | `node scripts/smoke.mjs` |
| ci / ci-ok | aggregate of the five above | n/a |
| codeql | Python, JS/TS, Actions | GitHub only |
| dependency-review (PR) | fails on high severity, denies GPL/AGPL/SSPL/BUSL | GitHub only |
| audit (daily, and on lockfile changes) | `pip-audit --strict`, `node scripts/audit-js.mjs` | `pip-audit --skip-editable`, `node scripts/audit-js.mjs` |
| gitleaks | full-history secret scan (same tool as the pre-commit hook) | `pre-commit run --all-files` |
| docker | hadolint, build without push, Trivy (CRITICAL/HIGH, fixed only) | `docker build -f infra/Dockerfile.api .` |
| scorecard | OpenSSF Scorecard, SARIF upload | GitHub only |
| release (tag `vX.Y.Z`) | tag equals all manifest versions and has a CHANGELOG section, builds, SBOM, provenance attestation, GitHub release | `node scripts/release-check.mjs vX.Y.Z` |

### JS audit exceptions

`scripts/audit-js.mjs` fails on any production advisory except `braces` (GHSA-vfj7-8cjw-p6xm) and `sprintf-js` (GHSA-hp3w-g68c-fv3c). Neither has a patched version and both are build-time only. Delete the entry when a fix ships.

### Smoke test scope

CI runs the backend half only. The dashboard half (`SMOKE_DASH`) needs a started Next server, which was not verified to be reliable on a runner. Run it locally with `SMOKE_DASH=http://localhost:3000 node scripts/smoke.mjs`.

## Required status checks (branch protection on `main`)

Mark only this as required: **`ci-ok`**.

Also recommended as required: `Analyze (python)`, `Analyze (javascript-typescript)`, `review` (dependency review), `gitleaks`. Do not require path-filtered workflows (docker, audit) because they do not run on every PR.

## Recommended branch protection

- Require a pull request with at least 1 approving review, dismiss stale approvals, require review from code owners.
- Require branches to be up to date; require linear history; require conversation resolution.
- Block force pushes and deletion; include administrators.
- Signed commits are optional.

## Owner actions (repository settings)

1. Enable branch protection as above.
2. Settings, Security: enable private vulnerability reporting (SECURITY.md links to it), Dependabot alerts, Dependabot security updates, secret scanning and push protection.
3. Gitleaks: personal repos need nothing. Organisation repos need a `GITLEAKS_LICENSE` secret.
4. Scorecard `publish_results` needs a public repo.
5. Actions are pinned by SHA with a version comment; Dependabot updates them weekly.
