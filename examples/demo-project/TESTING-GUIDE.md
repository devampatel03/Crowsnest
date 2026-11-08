# Crowsnest testing guide (new user, using the demo project)

You are a first-time user. You will install Crowsnest, point it at this demo project, and
try every feature once. Each step says what to run, what you should see, and a box to tick.

The demo project is **read only**. Crowsnest never installs anything from it.
**Never run `npm install` or `pip install` inside `examples/demo-project`.**

How to read the "Expect" lines: the quick check results and the CLI behaviour come from the
product docs and one run on the demo files on 2026-11-09. Verdicts for the full scan depend on
seed data and API keys, and have **not** been confirmed yet. If what you see differs, write it
in the Results log at the end. That difference is the useful part of this exercise.

---

## 0. What is in the demo project

| Package | Where | Why it is there | Expected |
|---|---|---|---|
| `react-codeshift` | npm, `src/app.ts` | Name an AI invented; in the seed list of invented names | Blocked / Critical (100%) |
| `lodash-helper-utils` | npm, `src/app.ts` | Plausible invented name that is not in the registry | Allowed with a warning (46%), not blocked |
| `@tanstack/query-core` | npm, `src/app.ts` | On the sample compromised-package list (Shai-Hulud wave 2) | Blocked / Critical (100%) |
| `expresss` | npm | One letter off `express` | Blocked on install (85%), Medium in a scan |
| `axios`, `express`, `lodash`, `follow-redirects` | npm | Normal packages (`follow-redirects` is brought in by `axios`) | Allowed (0%) |
| `flask-helper-utils`, `python-requests-helper` | `requirements.txt` | Invented names, Python side | Allowed with a warning (42% and 20%), not blocked |
| `requests`, `flask` | `requirements.txt` | Normal packages | Allowed (0%) |

Total: 8 npm versions in the lockfile, 4 lines in `requirements.txt`.

---

## 1. Before you start

Tick what you have. Part 2 tells you which install paths you can try.

- [ ] Node.js 20 or newer (`node --version`)
- [ ] Docker running (`docker version`). Needed for the full check, not for the quick check
- [ ] Git (`git --version`)
- [ ] Python 3.12 or newer (`python --version`), only for the from-source path
- [ ] VS Code 1.85 or newer, only for Part 9
- [ ] A Slack workspace where you may add apps, only for Part 10
- [ ] Optional: an AI model key (Part 11). **Not needed** for anything else

Start with **no API keys at all**. That is how most new users begin.

---

## 2. Install, three ways

You do not have to do all three. Do path A first. Do B or C if you want to test them too.

### A. Terminal command (recommended)

```bash
npm install -g @crowsnest/cli
crowsnest --version
crowsnest --help
```

- [ ] `--version` prints a version (docs say 0.1.2)
- [ ] `--help` lists these commands: `start`, `stop`, `doctor`, `scan`, `investigate`, `blast-radius`, `replay`, `watch`, `install`, `check`, `config`
- [ ] Gotcha test: the `-g` matters. Without it the command is not found in your shell. Do not skip it.

Now run the check **before** starting anything:

```bash
crowsnest doctor
```

- [ ] With Docker running and Crowsnest not started, `doctor` says the backend is not running and tells you how to start it. It should not crash.

Start the backend **from inside the demo folder**, so that folder is the one shared (read only) with it:

```bash
cd examples/demo-project
crowsnest start
```

- [ ] First run downloads the backend (about 430 MB). Allow a few minutes
- [ ] Open http://localhost:8000/health. Expect `{"status":"ok","version":"...","projects_root":"/projects"}`
- [ ] `crowsnest doctor` now reports Docker, backend and internet lookups as fine

To share a different folder: `crowsnest start --projects /path/to/folder`.

### B. Docker Compose (this gives you the dashboard)

The terminal command runs the backend only. For the dashboard, run Compose from the repo root. There is no settings
file to create and no folder to share: the example project is shared by default.

```bash
git clone https://github.com/devampatel03/Crowsnest.git && cd Crowsnest
docker compose up --build
```

- [ ] The build finishes and both containers are healthy (`docker compose ps`)
- [ ] http://localhost:8000/health answers `ok`
- [ ] http://localhost:3000 opens the dashboard (Horizon), and the status in the top right says **Live** (not Offline)
- [ ] The dashboard has its own port: nothing like the marketing site loads at `/`

To scan your own projects instead, create `.env` in the repo folder with `CROWSNEST_PROJECTS=C:\Users\you\code`
(a folder that *contains* projects), then `docker compose up -d`. They appear in the scan list.

Only one of A and B can run at a time, since both use port 8000. Stop one before starting the other:
`crowsnest stop` or `docker compose down`.

### C. From source (no Docker)

```bash
git clone https://github.com/devampatel03/Crowsnest.git && cd Crowsnest
cp .env.example .env
./scripts/bootstrap.sh                 # macOS/Linux/WSL/Git Bash
python -m venv .venv && .venv\Scripts\activate && pip install -e .     # Windows PowerShell instead
uvicorn packages.core.api:app --port 8000
# second terminal
cd packages/dashboard && npm install && npm run dev
```

- [ ] /health answers `ok` and the dashboard shows Live
- [ ] Scan path is the real path on your machine here (`examples/demo-project`), not `/projects/...`

---

## 3. The quick check (works with the backend OFF)

Run `crowsnest stop` first (or skip Part 2) so you test the no-backend behaviour.
Run from the **repo root**.

```bash
crowsnest check examples/demo-project --quick
```

- [ ] Prints "Quick check: the public malware list, what changed since the previous release, and release age..."
- [ ] "Checked 8 package version(s)", each with a tick, and "Nothing to block."
- [ ] Warns that, without `--base`, only the malware list was checked
- [ ] Exit code 0 (`echo $?`, PowerShell: `$LASTEXITCODE`)

**This is correct, not a miss.** The quick check cannot see invented names or look-alikes. That is the point of this test: you learn what the backend adds.

```bash
crowsnest check examples/demo-project --full
```

- [ ] With the backend stopped, it refuses and says Crowsnest must be running

```bash
crowsnest scan examples/demo-project
```

- [ ] Fails clearly: "Crowsnest is not running (nothing answered at http://localhost:8000)", suggests `crowsnest start`, exits non-zero

---

## 4. Full scan

Start the backend (Part 2), then:

```bash
crowsnest scan .            # if you started it from examples/demo-project
# or, from the repo root with Compose: use the dashboard, or crowsnest scan demo-project
# or, from source:                     crowsnest scan examples/demo-project
```

- [ ] Shows progress, waits for the scan to finish, then prints the most serious calls
- [ ] Finds `react-codeshift` and `@tanstack/query-core` together as one CRITICAL ioc_match (95%)
- [ ] Finds `expresss` as a MEDIUM typosquat (about 52%)
- [ ] Run the scan a second time: it lists the same two findings again (a repeat scan must not say the project is clean)
- [ ] `lodash-helper-utils` and the Python invented names are not scan findings; the install check warns about them instead (Part 6)
- [ ] Does **not** flag `axios`, `express`, `lodash` as Hold
- [ ] Each call has plain words saying what happened and a first step to take
- [ ] Exit code is **1** (problems found)

Then the machine-readable form:

```bash
crowsnest scan . -f json
```

- [ ] Prints JSON, and the exit code is **0** this time (documented behaviour: with `-f json` it always exits 0)

Python side:

```bash
crowsnest scan . -e pypi
```

- [ ] Reads `requirements.txt` (4 packages) and does not crash; no Python findings are expected from this file

Error paths:

```bash
crowsnest scan /does/not/exist
crowsnest scan C:\Windows         # or any folder outside the shared one
```

- [ ] Both give a readable message (folder not found, or "not shared" with how to share it), not a stack trace, and exit code 2

---

## 5. Look at one package

```bash
crowsnest investigate react-codeshift
crowsnest investigate react-codeshift --deep
crowsnest investigate axios
crowsnest investigate this-package-does-not-exist-xyz
```

- [ ] `react-codeshift`: a verdict with reasons, mentioning invented/AI-suggested names
- [ ] `--deep` adds more follow-up checks than the plain run
- [ ] `axios`: low risk, no Hold
- [ ] The nonexistent package: says it is not found (docs: unknown packages score 0.2 and are reported as not existing). No crash

---

## 6. Safe install (the veto)

This runs **real `npm install`** only if a package passes. Do it inside a throwaway folder, **not** in the demo project:

```bash
mkdir ../scratch-install && cd ../scratch-install && npm init -y
```

| Command | Expect |
|---|---|
| `crowsnest install expresss` | Blocked (about 85%): look-alike of `express`. Exit code **3**, nothing installed |
| `crowsnest install lodash-helper-utils` | Allowed with a warning (about 46%): the name matches an AI-invented pattern but is not in the registry, so npm will then report it does not exist |
| `crowsnest install react-codeshift` | Blocked (100%): invented name, no repository, 15 downloads a week, in a known campaign. Exit code **3** |
| `crowsnest install @tanstack/query-core@5.40.0` | Blocked if the sample compromised list matches |
| `crowsnest install lodash` | Passes and installs |
| `crowsnest install lodash@^4.17.0` | Range resolved to one exact version, checked, then that same version installed |
| `crowsnest install lodash --min-release-age 0` | Turns off the "younger than two days" rule |
| `crowsnest install lodash --strict` | Refuses if any lookup could not be completed |
| `crowsnest install lodash --quick` | Uses the quick check even though the backend is running |
| `crowsnest install expresss --crowsnest-acknowledge-risk` | **Override.** It would really install. Only do this in the scratch folder, and read the reasons first. Delete the folder after |

- [ ] A blocked install prints the box with the reason and the override line
- [ ] A failed lookup shows "Not checked", never a quiet clean result
- [ ] With the backend stopped, `crowsnest install lodash` installs nothing, says Crowsnest is not running and to run `crowsnest start`, then to run the command again (exit code 2)
- [ ] Start Crowsnest, run it again: it now checks and installs. Stop it, run again: blocked again (it asks every time)
- [ ] With the backend stopped, `crowsnest install lodash --quick` installs after the reduced check, and says it was a quick check

Reminder from the docs: only `crowsnest install` is checked. A plain `npm install` is not.

---

## 7. Check a pull request (`check --base`)

`--base` compares against a git ref and needs a git repository. Use a scratch copy so you do not touch your real repo:

```bash
cp -r examples/demo-project ../pr-test && cd ../pr-test
git init -b main && git add . && git commit -m "baseline"
git checkout -b bump
```

Now edit `package-lock.json` in the `bump` branch: change `node_modules/axios` `version` from `1.7.2` to `1.7.3` (in two places: the version and the `resolved` URL).

```bash
git commit -am "bump axios"
crowsnest check . --base main
```

- [ ] Reports "Checked 1 package version(s) changed since main"; shows `axios@1.7.3 (was 1.7.2)`
- [ ] Only the changed version is checked, not all 8
- [ ] Exit code 0 if it passes

Then add a bad one: add a new lockfile entry for `react-codeshift` at a different version (e.g. `1.0.1`) the same way, commit, and re-run.

- [ ] Reports it as new and (with the backend running) stops it, exit code **3**
- [ ] `crowsnest check . --base main -f json` prints JSON
- [ ] `crowsnest check . --base main --min-release-age 0` changes the age rule
- [ ] Outside a git repository (`cd /tmp && crowsnest check .`) gives a clear error

Limits worth confirming, straight from the docs:
- [ ] `check` reads **lockfiles**. `package.json` alone and an unpinned `requirements.txt` line are not checked. Every line in this demo's `requirements.txt` is pinned with `==`, so they are all read

Optional: the GitHub Action (`devampatel03/Crowsnest/.github/actions/dependency-check`) can be tried by pushing the scratch repo to a private GitHub repo with the workflow from the CLI docs. The job should fail on the bad bump.

---

## 8. The dashboard (needs Part 2B or 2C)

Open http://localhost:3000, which opens on Horizon. If you have not scanned yet, empty pages are normal.

**Scan from the page**
- [ ] Press **Scan a project** (or the key `s`). The dialog lists `demo-project`. Click it, with no typing. Then scan it again by typing `demo-project`, and once more by typing the full path as it appears on your machine
- [ ] Sees "Checking your packages…", then "Done. N packages need your attention." and **See them →**

**Horizon**
- [ ] A sentence at the top (not "All quiet" now), three numbers: Hold, Watch, Packages checked
- [ ] Up to five most serious calls; **See all in Log**; a 30-day chart
- [ ] On a call: **Show steps** / **Hide steps**; "Used in N projects" opens a list

**Lookout**
- [ ] Ranked list of publishers, highest risk first; picking one shows packages, 90-day activity, affected projects
- [ ] A **Flagged** person if the sample data links one to harmful activity

**Hold** (the page, not the warning level)
- [ ] Lists every package in the scanned lockfiles, including `follow-redirects` as transitive
- [ ] Search with `/`, filter by project kind, sort by status
- [ ] Pick `react-codeshift`, then **Check this package**: shows OK or Hold with reasons

**Log**
- [ ] Newest first; filter by Hold/Watch/Note; search by name; date range; open a row for the full call
- [ ] Scan twice: Horizon groups repeats ("Also found 2 more times"), Log keeps each

**Keyboard** (press `?` to see the list)
- [ ] `/` search, `s` scan, `r` refresh, `j`/`k` rows, `g h`, `g l`, `g o`, `g g` to jump pages
- [ ] Keys do nothing while typing in a box or with a dialog open

**Resilience**
- [ ] Run `docker stop crowsnest-api` (or stop the backend): the dashboard keeps the data on screen and marks it **Stale** or Offline, rather than going blank. Start it again and it recovers

**Not offered (confirm, do not report as bugs):** login, and replay (terminal only).

---

## 9. VS Code extension

Needs the backend running.

1. Install: Extensions view, search "Crowsnest" (publisher `crowsnest`), or `code --install-extension crowsnest.crowsnest-vscode`.
2. Open the demo folder in VS Code, then open `src/app.ts`.

- [ ] After you stop typing for about a second, margin marks appear on the `react-codeshift`, `@tanstack/query-core` and `expresss` imports; `lodash-helper-utils` (46%) stays under the 0.5 default and gets none
- [ ] Hover a mark: the reasons show
- [ ] No marks on `express`, `axios`, `lodash`, and none on language built-ins (`fs`, `node:path`, `child_process`)
- [ ] Command Palette: **Crowsnest: Scan Current File**, **Investigate Package Under Cursor** (put the cursor on a package name first), **Open Dashboard**
- [ ] Settings: set `crowsnest.riskThreshold` to `0.9` and marks drop away; back to `0.5` and they return
- [ ] `crowsnest.enabled` off removes all marks
- [ ] Stop the backend: no marks appear (documented), and nothing crashes
- [ ] The extension never blocks a save

Note: the extension also covers Python files. Open a new `.py` file with `import flask_helper_utils` to confirm. The extension doesn't read `requirements.txt` for marks.

---

## 10. Slack bot (optional, about 10 minutes)

```bash
cd packages/slack-bot
npm install
npm run setup          # guided: opens Slack with the app pre-filled, checks both keys, posts a test message
npm run doctor         # checks keys, permissions and backend without changing anything
npm run dev
```

- [ ] `setup` accepts the bot key (`xoxb-`) and app key (`xapp-`), posts a test message, writes `.env`
- [ ] Missing keys: the bot stops and tells you to run `npm run setup`
- [ ] Backend stopped: the bot keeps retrying instead of exiting
- [ ] In Slack: `/crowsnest-status` shows counts
- [ ] `/crowsnest-scan demo-project` posts a result (the backend maps the name to the shared folder; outside Docker give the real path)
- [ ] `/crowsnest-scan` with **no** path scans `/tmp/project` (documented; expect nothing useful)
- [ ] `/crowsnest-investigate react-codeshift`
- [ ] `/crowsnest-blast-radius some-login` (a leading `@` is fine)
- [ ] After a scan, a Hold is posted by itself in `#security` with a button to the dashboard. Watch and Note are **not** posted

Never commit the `.env` it writes: it holds your Slack keys in plain text.

---

## 11. AI model (optional)

Everything above works with **no model**. Run this section only to see the difference. Do your Part 4 scan first and keep its output to compare.

```bash
# put a key in a file, e.g. crowsnest.env:  OPENAI_API_KEY=sk-...
crowsnest stop
crowsnest start --env-file crowsnest.env
curl http://localhost:8000/api/llm          # shows provider and model, never the key
docker exec crowsnest-api python -m packages.core.llm test      # one real test call (uses a few tokens)
```

- [ ] `/api/llm` shows the provider you expect and no key
- [ ] Scan again: the same packages are still found (a model can reword, but cannot remove or invent packages)
- [ ] Write-ups read differently, but `@tanstack/query-core` is still the most serious level (a known-bad match cannot be downgraded)
- [ ] Put in a wrong key: the scan still finishes (falls back to fixed rules), it does not fail
- [ ] Local option: install Ollama, `CROWSNEST_LLM_PROVIDER=ollama`, `CROWSNEST_LLM_BASE_URL=http://host.docker.internal:11434/v1`

---

## 12. Settings

```bash
crowsnest config get
crowsnest config set apiUrl http://localhost:8000
crowsnest config set anthropicApiKey test-not-a-real-key
crowsnest config get
```

- [ ] Secrets show as `***set***` or `(not set)`, never the value
- [ ] Set `apiUrl` to a wrong port, then run `crowsnest scan .`: "not running" message pointing at `crowsnest config set apiUrl`. Reset it afterwards
- [ ] A saved value beats the matching environment variable
- [ ] Remove the fake key afterwards (set it to an empty value, or delete the saved settings file)

---

## 13. Other commands

```bash
crowsnest blast-radius --maintainer some-login
crowsnest blast-radius --all
crowsnest replay --date 2026-05-11
crowsnest replay --ioc shai-hulud-wave-2 -f json
crowsnest watch                       # leave it running, then start a scan in another terminal
```

- [ ] `blast-radius --maintainer`: lists your scanned projects that use that publisher's packages (will be empty for a random name)
- [ ] `blast-radius --all`: ranks the top 50 publishers
- [ ] `replay`: runs against a saved snapshot; a date with no snapshot may return nothing (documented)
- [ ] `watch`: streams live events while you scan elsewhere; Ctrl+C to stop

---

## 14. Break it on purpose (failure modes)

- [ ] Start something on port 8000 first, then `crowsnest start`: a readable error, not a hang
- [ ] Docker not running: `crowsnest start` and `crowsnest doctor` say so and how to fix it
- [ ] Windows only: if you see "being used by another process", follow the netstat/taskkill steps from Troubleshooting
- [ ] Unplug the internet and run `crowsnest check examples/demo-project --quick`: lookups show "Not checked", never a clean pass. Add `--strict` on `install` to turn that into a refusal
- [ ] Rename `package-lock.json` to `.bak`, scan: reports no lockfile rather than a clean result. Put it back
- [ ] Corrupt the JSON in `package-lock.json` (copy first): readable error, not a stack trace

---

## 15. Stop and clean up

```bash
crowsnest stop                        # data kept
crowsnest stop --delete-data          # removes stored data too
docker compose down -v     # Compose route, -v deletes data
npm uninstall -g @crowsnest/cli
```

- [ ] After `stop`, port 8000 is free and the dashboard shows Offline/Stale
- [ ] After `--delete-data` and a fresh start, the dashboard is empty again until you scan
- [ ] Delete `../scratch-install` and `../pr-test`

---

## Results log

Copy this table and fill it in as you go. Note anything that confuses you, even if it "works".

| Part | Worked? | What I saw / what confused me |
|---|---|---|
| 2A terminal install | | |
| 2B Compose + dashboard | | |
| 2C from source | | |
| 3 quick check | | |
| 4 full scan | | |
| 5 investigate | | |
| 6 safe install | | |
| 7 PR check | | |
| 8 dashboard | | |
| 9 VS Code | | |
| 10 Slack | | |
| 11 AI model | | |
| 12 settings | | |
| 13 other commands | | |
| 14 failure modes | | |
| 15 clean up | | |

**Verdict table.** The "Expected" column was observed on 2026-11-09 with no API keys and the seed data in this repository. Confirm each on your machine:

| Package | Expected | Actual |
|---|---|---|
| react-codeshift | Blocked 100%; scan: CRITICAL | |
| lodash-helper-utils | Allowed 46% with a warning | |
| @tanstack/query-core | Blocked 100%; scan: CRITICAL | |
| expresss | Blocked 85%; scan: MEDIUM | |
| flask-helper-utils | Allowed 42% with a warning | |
| python-requests-helper | Allowed 20% | |
| axios / express / lodash | Allowed 0% | |
| requests / flask | Allowed 0% | |
