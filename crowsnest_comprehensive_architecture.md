# Crowsnest — End-to-End Technical Architecture & Code Documentation

Crowsnest is a supply chain security sentinel built to detect and mitigate malicious activity, account takeovers, dependency confusion, typosquatting, and AI-hallucinated packages before they compromise production lockfiles. 

Normally, checking for these threat signals requires hundreds of disparate API calls, cron scripts, and a massive amount of LLM context. Crowsnest solves this by introducing a **SQL federation layer** (CoralEngine powered by DuckDB) that joins lockfiles, threat intelligence, Git history, and registry event streams. An intelligent **LangGraph Agent pipeline** then plans, investigates, triages, and drafts remediation plans for security threats in under 100ms.

---
m
## 1. High-Level System Architecture

Crowsnest is composed of five principal components:

```
                  ┌──────────────────────────────────────┐
                  │          VS Code Extension           │
                  │ (AST/Regex Scanner & Inline Gutter)  │
                  └──────────┬───────────────────────────┘
                             │ HTTP (/api/veto)
                             ▼
 ┌───────────┐ HTTP ┌───────────────────────────┐  SSE  ┌──────────────┐
 │ Dashboard │◄────►│    FastAPI API Server     │──────►│  Slack Bot   │
 │ (Next.js) │      │   (REST & Event Stream)   │       │  (Bolt App)  │
 └───────────┘      └────────────┬──────────────┘       └──────────────┘
                                 │
                                 ▼
                    ┌───────────────────────────┐
                    │      LangGraph Agents     │
                    │  (Planner → Investigator  │
                    │    → Triage → Drafter)    │
                    └────────────┬──────────────┘
                                 │ SQL JOINs
                                 ▼
                    ┌───────────────────────────┐
                    │        CoralEngine        │
                    │    (crowsnest.duckdb)     │
                    └───────────────────────────┘
                                 ▲ Ingests
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
   ┌──────┴──────┐        ┌──────┴──────┐        ┌──────┴──────┐
   │  Lockfiles  │        │  Registries  │        │ Git & Intel │
   │ (npm/pypi)  │        │ (npm/PyPI)   │        │ (GH/Socket) │
   └─────────────┘        └─────────────┘        └─────────────┘
```

1. **CoralEngine (Federated Database)**: An embedded DuckDB database that materializes external metadata feeds into highly indexable relational tables. It allows security policies to be written as standard SQL `JOIN` statements.
2. **FastAPI Backend (API Gateway)**: Manages lifespan events, seeds database tables, hosts REST endpoints for scanning and deep package forensics, and publishes live Server-Sent Events (SSE) (npm publish firehose, scan progress, and alerts).
3. **LangGraph Agent Pipeline ("The Brain")**: A four-node state machine that runs scans asynchronously. It plans queries, runs database audits, triages/ranks severity, and generates PR patch files and postmortem documents.
4. **Client Applications**:
   * **Next.js Web Dashboard**: Front-end showing threat status timeline, repository dependency inventories, and Time Machine snapshot replays.
   * **Slack Bot**: Bolt application listening for slash commands and piping critical real-time alerts into security channels.
   * **VS Code Extension**: Editor plugin running AST/regex checks to highlight malicious imports inline in the editor gutter.
   * **CLI Tool**: Node terminal scanner and pre-install veto gatekeeper.

---

## 2. CoralEngine: SQL Federation & Database Schema

The core design principle of Crowsnest is that **every data source is a SQL table**. This eliminates the need for complex API polling loops, caching, and redundant data structures.

### 2.1 Database Schema (DDL)
The database structure defined in [packages/core/coral/engine.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/coral/engine.py) consists of three layers:

#### A. Code & Identity Tables
* **`gh_repos`**: Tracks GitHub organization details, archive status, and repository metadata.
* **`gh_commits`**: Stores Git commit telemetry. Fields: `sha`, `author_login`, `ts`, `files_changed` (DuckDB `TEXT[]`), `gpg_verified` (Boolean), `message`.
* **`gh_releases`**: Tracks release tags, authors, and Sigstore attestation URLs.
* **`gh_actions_runs`**: Logs GitHub Actions build metadata, conclusion states, and OIDC credentials (`oidc_audience`, `oidc_subject`).
* **`gh_workflow_files`**: Stores workflow configuration details, permissions blocks, and flags indicating unsafe patterns like pull request target triggers (`has_pwn_request_pattern`).
* **`local_lockfiles`**: Maps dependencies parsed from project lockfiles. Fields: `project_path`, `ecosystem`, `package`, `version`, `integrity_hash`, `resolved_url`, `declared_in` (`direct` or `transitive`), `parent_chain` (an array mapping the transitive dependency tree).
* **`local_source_packages_mentioned`**: Stores imports found directly inside the source code files. Includes an `ai_authored_likelihood` score.
* **`sigstore_rekor`**: Holds log indices, public keys, and predicate JSON payloads parsed from the Sigstore transparency log.

#### B. Registry & Artifact Tables
* **`npm_packages`**: Registry-level info (latest version, weekly downloads, maintainer list, created/updated timestamps, unpacked size).
* **`npm_versions`**: Detail on every published version, including dependency objects, tarball URLs, and binary script flags (`has_install_script`, `has_postinstall`).
* **`npm_maintainers`**: Audit history of maintainer changes (adding or deleting accounts, performed by whom, and timestamps).
* **`npm_publish_events`**: History of publish events, including country of origin (`source_ip_country`) and client publishing method (`publish_via`).

#### C. Threat Intelligence & Runtime Tables
* **`osv_advisories`**: Public vulnerability advisories from OSV.dev.
* **`socket_alerts`**: Security signals from Socket.dev (`shellEscape`, `networkInInstall`, `envVarExfil`, `malware`).
* **`shai_hulud_iocs`**: Hand-seeded threat intelligence indicators (hashes, packages, and IPs) from known malicious campaigns.
* **`known_hallucination_patterns`**: List of non-existent packages frequently generated by LLMs (e.g. `react-codeshift`).
* **`runtime_imports`**: Runtime telemetry logging package imports dynamically observed in staging/production environments.

### 2.2 DuckDB Concurrency & Safety
DuckDB is in-process and enforces a single read-write connection limit on database files. Crowsnest implements a robust concurrency pattern in `CoralEngine`:
* **Asyncio Executor Pool**: DuckDB execution blocking commands are run asynchronously in the asyncio thread pool using `run_in_executor`.
* **Thread-Local Cursors**: Every read query calls `.cursor()` on the shared connection (`self._get_connection().cursor()`) inside a python context manager. This creates a thread-safe cursor instance, avoiding cross-talk or lock-outs when multiple queries run concurrently.
* **Write Serialization**: Write operations (`ingest()`, `execute()`) are protected by an `asyncio.Lock()` to serialize execution and prevent deadlocks on write transactions.
* **Read-Only SQL Validation**: Agent queries are strictly parsed using a regex-based block-list. Any query containing forbidden write operations (`INSERT`, `DROP`, `UPDATE`, etc.) is immediately rejected.
* **Named Parameter Injection**: Placed parameter values are sanitized and substituted safely by searching and replacing with escaped literals (e.g. replacing single quotes with double single quotes) inside `_replace_named_params` to prevent SQL injection.

### 2.3 Time Machine Snapshots
To support the **Incident Replay** features, `CoralEngine` exposes:
* **`snapshot(name)`**: Runs `EXPORT DATABASE '{path}' (FORMAT PARQUET, COMPRESSION ZSTD)` to dump the database schema and table data into Parquet files.
* **`restore_snapshot(name)`**: Imports a historical snapshot folder back into DuckDB via `IMPORT DATABASE '{path}'` to instantly rewind the database state to when the attack occurred.

---

## 3. SQL Query Library: Catching Modern Attacks

Crowsnest detects supply chain attacks by executing parameterized SQL queries from [packages/core/queries/templates.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/queries/templates.py) on the `CoralEngine`.

### 3.1 XZ Utils Maintainer Takeover (`XZ_PATTERN`)
This query catches slow-burn takeovers by detecting packages where a new maintainer was added in the last 180 days, the legacy maintainer's commit volume dropped by 80% or more compared to their historical baseline, and the new maintainer has started modifying sensitive build/packaging configurations:
```sql
SELECT l.package, l.version, l.ecosystem, m_old.maintainer_login, m_new.maintainer_login, c.files_changed
FROM local_lockfiles l
JOIN npm_maintainers m_new ON m_new.package = l.package AND m_new.action = 'add' AND m_new.ts > CURRENT_TIMESTAMP - INTERVAL '180 days'
JOIN npm_maintainers m_old ON m_old.package = l.package AND m_old.action = 'add' AND m_old.ts < CURRENT_TIMESTAMP - INTERVAL '730 days' AND m_old.maintainer_login != m_new.maintainer_login
JOIN gh_commits c ON c.repo = (SELECT repo_url FROM npm_packages WHERE name = l.package LIMIT 1) AND c.author_login = m_new.maintainer_login AND c.ts > m_new.ts
WHERE (
  SELECT COUNT(*) FROM gh_commits gc1 WHERE gc1.author_login = m_old.maintainer_login AND gc1.ts > CURRENT_TIMESTAMP - INTERVAL '90 days'
) < 0.2 * (
  SELECT COUNT(*) FROM gh_commits gc2 WHERE gc2.author_login = m_old.maintainer_login AND gc2.ts BETWEEN CURRENT_TIMESTAMP - INTERVAL '730 days' AND CURRENT_TIMESTAMP - INTERVAL '90 days'
) / 8.0
AND (
  list_contains(c.files_changed, '.github/workflows')
  OR list_contains(c.files_changed, 'configure')
  OR list_contains(c.files_changed, 'package.json')
)
```

### 3.2 Token-Theft Worm Publish Burst (`SHAI_HULUD`)
This query detects worm campaigns (like the Shai-Hulud worm) where a compromised publisher account publishes more than 10 packages in less than 30 minutes, and checks if any of these packages have infected our project dependencies:
```sql
WITH burst AS (
  SELECT published_by, COUNT(DISTINCT package) AS packages_published, list(DISTINCT package) AS package_list
  FROM npm_publish_events
  WHERE published_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY published_by
  HAVING COUNT(DISTINCT package) > 10
     AND EXTRACT(EPOCH FROM (MAX(published_at) - MIN(published_at))) < 1800
)
SELECT b.*, COUNT(DISTINCT l.project_path) AS our_projects_exposed
FROM burst b
LEFT JOIN local_lockfiles l ON list_contains(b.package_list, l.package)
GROUP BY b.published_by, b.packages_published, b.package_list
```

### 3.3 AI-Hallucinated Slopsquatting (`SLOPSQUATTING`)
Detects packages imported in the source code where the AI authorship probability is high, the package is very new (created < 120 days ago), and downloads are extremely low:
```sql
SELECT s.file_path, s.package, s.ai_authored_likelihood, n.created_at, n.weekly_downloads
FROM local_source_packages_mentioned s
JOIN npm_packages n ON n.name = s.package
WHERE s.ai_authored_likelihood > 0.7
  AND n.created_at > CURRENT_TIMESTAMP - INTERVAL '120 days'
  AND n.weekly_downloads < 5000
```

### 3.4 SLSA-Attested Malware (`SLSA_POISONING`)
Identifies packages with valid cryptographic SLSA attestations but whose builds were triggered by unsafe GitHub workflows, such as `pull_request_target` triggers or workflows with open write permissions containing dynamic PR variables:
```sql
SELECT l.package, l.version, v.attestation_subject_uri, r.build_invocation_id, w.has_pwn_request_pattern
FROM local_lockfiles l
JOIN npm_versions v ON v.name = l.package AND v.version = l.version
JOIN sigstore_rekor r ON r.subject = v.tarball_url
JOIN gh_actions_runs a ON a.run_id = r.build_invocation_id
JOIN gh_workflow_files w ON w.repo = a.repo AND w.path = a.workflow
WHERE v.attestation_subject_uri IS NOT NULL
  AND (w.has_pwn_request_pattern = true OR a.triggered_by = 'pull_request_target')
```

---

## 4. The LangGraph Agent Pipeline ("The Brain")

When a scan starts, Crowsnest executes an asynchronous 4-node state machine orchestrated by LangGraph in [packages/core/agents/graph.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/agents/graph.py).

```
 ┌─────────────────────┐
 │  1. Scan Triggered  │  (Asynchronous REST Post or CLI invoke)
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │ 2. Detection Planner│  ← uses Claude-Haiku to prioritize SQL templates
 └──────────┬──────────┘
            │ state.pending_queries
            ▼
 ┌─────────────────────┐
 │  3. Investigation   │  ← runs SQL on DuckDB; uses Claude-Haiku to classify
 └──────────┬──────────┘
            │ state.incidents
            ▼
 ┌─────────────────────┐
 │     4. Triage       │  ← rescores severity, dedups & sorts alerts
 └──────────┬──────────┘
            │ state.triage_output
            ▼
 ┌─────────────────────┐
 │   5. Remediation    │  ← drafts Git patches, Slack blocks & Jira tickets
 └─────────────────────┘
```

### 4.1 Node 1: Detection Planner
* **File**: [packages/core/agents/detection_planner.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/agents/detection_planner.py)
* **Behavior**: Evaluates the scan context (lockfile types, last scan timestamp, active threat intelligence feeds) and calls Claude-Haiku to output a prioritized JSON array of query names to execute.
* **Deterministic Fallback**: If the Anthropic API is down or times out, the node falls back to `_default_queries`, prioritizing `IOC_MATCH`, `SLOPSQUATTING`, `SHAI_HULUD`, and `MAINTAINER_REPUTATION`.

### 4.2 Node 2: Investigation Agent
* **File**: [packages/core/agents/investigation.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/agents/investigation.py)
* **Behavior**: Iterates over the planned queries, runs them on the `CoralEngine`, and filters out queries with zero hits. For queries with hits, it prompts Claude-Haiku with the raw rows to classify them into structured `AlertObject` JSON schema incidents.
* **Deterministic Fallback**: If the LLM call fails, the node runs `_synthesize_incidents()`, mapping the DuckDB query hits directly to attack patterns, estimating confidence scores, and pulling default remediation plans. It then runs `_enrich_blast_radius` to map affected packages to files in `local_lockfiles`.

### 4.3 Node 3: Triage Agent
* **File**: [packages/core/agents/triage.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/agents/triage.py)
* **Behavior**: Computes incident severity from first principles. It promotes the severity level if confidence is high (>0.85) and the package was actively loaded at runtime, or if the blast radius is large (>10 projects). It demotes the severity if the confidence score is low (<0.4).
* **Deduplication**: Creates a SHA-256 hash of the `(attack_pattern, sorted_packages)`. It keeps only the highest-confidence incident for each key within a 7-day window.

### 4.4 Node 4: Remediation Agent
* **File**: [packages/core/agents/remediation.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/agents/remediation.py)
* **Behavior**: Automatically drafts mitigation content for each incident:
  * **`pr_diff`**: A unified git diff patch file targeting `package.json` to pin the compromised dependencies to safe versions.
  * **`slack_message`**: A formatted block with severity badges, package lists, confidence scores, and action items.
  * **`ticket_body`**: A markdown description outlining the exposure scope and check boxes for mitigation steps.
  * **`postmortem_skeleton`**: A postmortem timeline template listing the files changed, blast radius, and root cause fields.

---

## 5. Local Parsing & Scanners

Crowsnest includes local parser and scanner services that run on the client or backend before querying threat databases.

### 5.1 Lockfile Parser
* **File**: [packages/core/sources/lockfile.py](file:///c:/DEVAM/MY_PROJECTS/claude-code/Crowsnest/packages/core/sources/lockfile.py)
* **Direct vs. Transitive Identification**:
  * For `package-lock.json` v2/v3, Crowsnest matches packages against adjacent `package.json` dependencies. Packages not found in `package.json` but present under `node_modules/` or with a nested path segment in the keys are flagged as transitive.
  * For npm `package-lock.json` v1, packages listed with an empty `parent_chain` are flagged as direct, while nested keys are flagged as transitive.
  * This metadata is critical for the `Hold` page and help developers distinguish direct exposures from nested dependencies.

### 5.2 AI-Authored Code Scanners
* **Heuristics**:
  * **Import Density**: Flags files with more than 20 import statements (often a sign of AI code generation).
  * **Name Signatures**: Matches package names against common hallucination regex patterns (e.g. `express-helper`, `axios-utils`).
  * **Orphan Files**: Bumps the risk score if a code file does not have a corresponding `.test` or `.spec` file.
  * **Git Blame Parsing**: Uses `GitPython` to extract the commit message that introduced each import. If the message matches AI signatures (e.g. "generated by Claude", "🤖", "Co-authored-by: copilot"), it increases the AI likelihood score.

---

## 6. Client Implementations

### 6.1 Next.js Web Dashboard
* **Framework**: Next.js App Router (React) styled with Vanilla CSS and TailwindCSS.
* **Tabs**:
  * **Horizon**: Displays the active threat summary and threat timeline. It uses Server-Sent Events (SSE) to subscribe to `/api/events` and show real-time npm publishes and scan progress states.
  * **Lookout**: Displays a cached list of transitive maintainers ranked by risk score (derived from GPG sign ratios, platform age, and commits).
  * **Hold**: Lists all parsed packages and flags them as direct/transitive.
  * **Log**: Displays the historical incident timeline and provides a "Replay" button to reload DuckDB snapshots.

### 6.2 VS Code Extension
* **Framework**: TypeScript-based VS Code Extension compiling to `out/extension.js`.
* **Key Features**:
  * **Ast/Regex Parser**: Scans open JavaScript, TypeScript, and Python files for `import`/`require` statements.
  * **Debounced API Veto Check**: Debounces checks by 1000ms while typing to avoid spamming the backend, caching results for 5 minutes.
  * **Inline Gutters**: Applies colored icons (🔴 for critical, 🟠 for high, 🟡 for medium) and wavy underlines to imports based on veto risk scores.
  * **Forensic Webview**: Renders a dark-themed CSS-styled HTML view displaying the package risk breakdown.

### 6.3 Slack Bot
* **Framework**: `@slack/bolt` in Socket Mode (runs over WebSockets, eliminating the need for public webhooks).
* **SSE Alert Stream**: Connects to the backend `/api/events` endpoint. It parses incoming `incident_detected` events and posts them directly to `#security` with formatting for remediation options and a dashboard link.
* **Commands**: Registers Bolt slash handlers:
  * `/crowsnest-scan`: Asynchronously triggers a scan and posts results back to the channel.
  * `/crowsnest-status`: Displays total graph size and incident counts.

### 6.4 CLI Tool
* **Framework**: Node command-line app using `commander` and `chalk`.
* **Safe Installer**: Intercepts npm install commands. It calls `/api/veto` and blocks installation if the risk score exceeds 0.6, requiring the user to run with `--crowsnest-acknowledge-risk` to bypass the block.

---

## 7. Codebase Directory Layout

```
Crowsnest/
├── package.json                    # Root npm workspace manager
├── crowsnest.duckdb                 # SQLite-like DuckDB database file
├── packages/
│   ├── core/                        # FastAPI Backend & CoralEngine
│   │   ├── api.py                   # FastAPI server endpoints & event loops
│   │   ├── config.py                # Environment configuration settings
│   │   ├── agents/                  # LangGraph workflow orchestration
│   │   │   ├── graph.py             # LangGraph StateGraph builder
│   │   │   ├── state.py             # Shared TypedDict State models
│   │   │   ├── detection_planner.py # Claude-Haiku query planning node
│   │   │   ├── investigation.py     # SQL query runner & LLM classifier node
│   │   │   ├── triage.py            # Mathematical severity scoring & dedup node
│   │   │   └── remediation.py       # PR diff & notification drafting node
│   │   ├── coral/
│   │   │   └── engine.py            # DuckDB CoralEngine wrapper & schema DDL
│   │   ├── queries/
│   │   │   └── templates.py         # 12+ parameterized SQL detection templates
│   │   ├── db/
│   │   │   └── seed.py              # Seeding script for IOCs and commits
│   │   └── sources/                 # Third-party data adapters
│   │       ├── lockfile.py          # Lockfile parsing & AI likelihood heuristics
│   │       ├── npm.py               # npm Registry integration & SSE stream
│   │       ├── github.py            # GitHub API (commits, workflows, OIDC)
│   │       ├── osv.py               # OSV vulnerability data fetcher
│   │       └── socket.py            # Socket.dev threat intel alerts
│   │
│   ├── dashboard/                   # Next.js Web Dashboard
│   │   ├── app/
│   │   │   ├── layout.tsx           # Global sidebar navigation
│   │   │   └── (dashboard)/         # Tab routes (horizon, lookout, hold, log)
│   │   └── components/              # UI widgets and Recharts visual metrics
│   │
│   ├── slack-bot/                   # Bolt Slack Bot
│   │   └── src/
│   │       ├── index.ts             # Socket Mode entrypoint
│   │       ├── alert-stream.ts      # SSE event subscriber & channel poster
│   │       └── formatters.ts        # Slack Block Kit layouts
│   │
│   ├── vscode-extension/            # VS Code Extension
│   │   └── src/
│   │       ├── extension.ts         # Main activation logic
│   │       ├── decorator.ts         # Editor import scanner & inline gutter decorator
│   │       └── webview.ts           # Forensics dashboard webview panel
│   │
│   └── cli/                         # Command Line Interface
│       └── src/
│           ├── index.ts             # CLI command definition
│           └── commands/            # CLI actions (scan, install, replay, watch)
```

---

## 8. Operational & Troubleshooting Guide

### 8.1 Zombie Process Port Lock (`:8000`)
On Windows, uvicorn reload subprocesses can orphan and hold the `crowsnest.duckdb` file handle. To list and kill these python processes:
```powershell
# Identify processes on port 8000
Get-Process python* | Where-Object { (netstat -ano | Select-String ":8000") -match $_.Id } | Stop-Process -Force
```

### 8.2 DuckDB Lockouts
If uvicorn shows `IO Error: Cannot open file ... being used by another process`, a zombie process is holding the database file. Execute the following command to free it:
```powershell
Stop-Process -Id (netstat -ano | Select-String ':8000' | ForEach-Object { ($_ -split '\s+')[-1] } | Select-Object -First 1) -Force
```

### 8.3 Rate Limits & Offline Mode
Crowsnest fetches mock or cached data for package requests when network issues arise or API keys are missing. Scans will run using local database seeds for demonstration purposes even if external services (like GitHub or npm) are offline.
