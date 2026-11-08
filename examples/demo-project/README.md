# Crowsnest demo project

A small project with risky dependencies on purpose. **Do not run `npm install` or `pip install` here.**
It exists so you can watch Crowsnest catch things. Crowsnest only reads the files.

Docker shares this folder with Crowsnest by default, so the dashboard's scan list shows it as `demo-project`.

| Package | Why it is here | Install check | A scan reports |
|---|---|---|---|
| `react-codeshift` | A name an AI invented, in a known attack campaign | Blocked (100%) | Critical (with `@tanstack/query-core`) |
| `@tanstack/query-core` | On the sample compromised-package list | Blocked (100%) | Critical |
| `expresss` | One letter off `express` | Blocked (85%) | Medium, look-alike name |
| `lodash-helper-utils` | Plausible AI-invented name, not in the registry | Allowed with a warning (46%) | nothing |
| `flask-helper-utils`, `python-requests-helper` | Invented names, Python side | Allowed with a warning (42%, 20%) | nothing |
| `axios`, `express`, `lodash`, `follow-redirects`, `requests`, `flask` | Normal, popular packages | Allowed (0%) | nothing |

Observed on 2026-11-09 with no API keys. A name that is not in the registry scores under the 0.6 stop limit, because npm
and PyPI will refuse it anyway. Scan it twice: the second scan reports the same findings again.

## Try it

```bash
docker compose up --build        # from the repository root; then open http://localhost:3000
```

Press **Scan a project** and pick `demo-project`.

From the terminal, with Crowsnest running (`crowsnest start`, run from this folder or its parent):

```bash
crowsnest scan .                          # full scan; results also appear in the dashboard
crowsnest check .                         # vets every version in package-lock.json
crowsnest investigate react-codeshift     # why one package was flagged
crowsnest install expresss                # stopped before npm runs (exit code 3)
crowsnest install lodash                  # allowed, then installed
crowsnest replay --ioc shai-hulud-wave-2  # replay a past incident
```

`crowsnest install` needs Crowsnest running. If it is not, it installs nothing and tells you to run `crowsnest start`.
`crowsnest check` still works without it as a quick check against the public malware list, so it will say
"Nothing to block" for this project; invented names and look-alikes are only caught by the full check.

Also try opening `src/app.ts` in VS Code with the Crowsnest extension, or run `/crowsnest-scan demo-project` in Slack if
the bot is set up.

Exact verdicts depend on your seed data and which API keys are set. See [TESTING-GUIDE.md](TESTING-GUIDE.md) for a
step-by-step walkthrough of every feature.
