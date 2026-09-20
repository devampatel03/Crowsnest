#!/usr/bin/env bash
# scripts/bootstrap.sh
#
# One-shot local dev environment setup for Crowsnest (macOS/Linux/WSL/Git Bash).
# Idempotent: safe to re-run.
#
#   1. Copy .env.example -> .env if .env doesn't already exist.
#   2. Create a Python venv (.venv-claude) if it doesn't exist, and activate it.
#   3. pip install -e .[dev]
#   4. pnpm install (falls back to a hint about corepack if pnpm is missing).
#
# Usage: ./scripts/bootstrap.sh  (run from anywhere; resolves the repo root itself)

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root (this script lives in <repo>/scripts/bootstrap.sh)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

info()  { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()    { printf '\033[1;32m    ok:\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

info "Crowsnest bootstrap starting in ${REPO_ROOT}"

# ---------------------------------------------------------------------------
# 1. .env
# ---------------------------------------------------------------------------
info "Checking .env"
if [ -f "${REPO_ROOT}/.env" ]; then
  ok ".env already exists, leaving it alone"
elif [ -f "${REPO_ROOT}/.env.example" ]; then
  cp "${REPO_ROOT}/.env.example" "${REPO_ROOT}/.env"
  ok "copied .env.example -> .env (fill in real keys before running a full scan)"
else
  fail ".env.example not found at repo root — cannot seed .env. Check you're running this from a Crowsnest checkout."
fi

# ---------------------------------------------------------------------------
# 2. Python venv
# ---------------------------------------------------------------------------
info "Setting up Python virtualenv (.venv-claude)"

PYTHON_BIN=""
for candidate in python3.12 python3 python; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    PYTHON_BIN="${candidate}"
    break
  fi
done

if [ -z "${PYTHON_BIN}" ]; then
  fail "No Python interpreter found (looked for python3.12, python3, python). Install Python 3.12+ and re-run this script."
fi
ok "using $(${PYTHON_BIN} --version 2>&1) (${PYTHON_BIN})"

if [ ! -d "${REPO_ROOT}/.venv-claude" ]; then
  "${PYTHON_BIN}" -m venv "${REPO_ROOT}/.venv-claude" \
    || fail "failed to create virtualenv at .venv-claude"
  ok "created .venv-claude"
else
  ok ".venv-claude already exists, reusing it"
fi

# shellcheck disable=SC1091
if [ -f "${REPO_ROOT}/.venv-claude/bin/activate" ]; then
  source "${REPO_ROOT}/.venv-claude/bin/activate"
elif [ -f "${REPO_ROOT}/.venv-claude/Scripts/activate" ]; then
  # Git Bash / MSYS on Windows lays the venv out with Scripts/ instead of bin/
  source "${REPO_ROOT}/.venv-claude/Scripts/activate"
else
  fail "could not find an activate script under .venv-claude — the venv may be corrupt; delete .venv-claude and re-run."
fi
ok "activated .venv-claude ($(command -v python))"

# ---------------------------------------------------------------------------
# 3. Python dependencies
# ---------------------------------------------------------------------------
info "Installing crowsnest-core (pip install -e .[dev])"
python -m pip install --upgrade pip >/dev/null \
  || fail "failed to upgrade pip inside .venv-claude"
pip install -e ".[dev]" \
  || fail "pip install -e .[dev] failed — check the error above (network access, or a pyproject.toml issue)."
ok "Python dependencies installed"

# ---------------------------------------------------------------------------
# 4. JS dependencies (pnpm workspace)
# ---------------------------------------------------------------------------
info "Installing JS workspace dependencies (pnpm install)"

if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found on PATH. Install Node 18+ and re-run this script."
fi
ok "using $(node --version)"

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    info "pnpm not found, enabling it via corepack"
    corepack enable || fail "corepack enable failed — install pnpm manually (npm install -g pnpm) and re-run."
  else
    fail "pnpm not found and corepack is unavailable. Install pnpm manually (npm install -g pnpm) and re-run."
  fi
fi

pnpm install || fail "pnpm install failed — check the error above."
ok "JS dependencies installed"

info "Bootstrap complete."
cat <<'EOF'

Next steps:
  1. Fill in real API keys in .env (Anthropic, GitHub, Socket.dev, Slack — all optional, see setup.md).
  2. Start the backend:
       source .venv-claude/bin/activate   # Windows: .venv-claude\Scripts\activate
       uvicorn packages.core.api:app --host 0.0.0.0 --port 8000 --reload
  3. In another shell, start any JS package:
       cd packages/dashboard && npm run dev

EOF
