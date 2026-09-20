> **Note:** This is an early planning draft. The stack described here (Gemini, SQLite, tree-sitter AI-forensics, eBPF) does not reflect what was actually built. See `CLAUDE.md` and `crowsnest_comprehensive_architecture.md` for the as-built architecture (Claude-Haiku, DuckDB/CoralEngine, LangGraph).

 .venv-claude\Scripts\Activate.ps1



Let me ground this in the current attack landscape before drafting the plan. Recent supply chain attacks have escalated dramatically, and the plan needs to reflect what's happening right now.The threat landscape just got grounded. Now I have what I need. Recent events shape the entire design:

- **Mini Shai-Hulud (April–May 2026)**: 300+ malicious packages in a 22-minute burst on AntV; TanStack, Mistral AI, UiPath, OpenSearch hit; **the first-ever malicious npm package with valid SLSA provenance attestation** (May 11, 2026) — meaning the gold-standard cryptographic verification is now defeated.
- **TeamPCP** as a persistent actor: compromised Trivy, Bitwarden CLI, AntV in succession.
- **Slopsquatting in the wild**: `react-codeshift` spread to 237 repos in January 2026 — nobody planted it, AI agents propagated it autonomously. 41% of code is now AI-generated; 20% of LLM suggestions include non-existent packages.
- **Existing tools have a structural gap**: Snyk does CVEs post-publish, Socket does behavioral but doesn't correlate with your org's runtime/identity/internal context, Dependabot is noisy. Socket itself admitted that "early supply chain compromise looks identical to a maintainer dispute" — meaning the signal is in the JOIN of multiple sources, which is exactly Coral's territory.

Here's the build spec.

go through the . understand it and once you are done with it your task is to start implementing the entire project and mentioned in the plan. 

- at places where brainstorming or thinking / reasoning is required do it
- ensure that all the logics are tight, workflows are properly coded , no broken logics , no loopholes , no blackbox

also spin up multiple specialized agents parallely while building the project.
---

# Crowsnest — Technical Implementation Plan

**Tagline:** *See the storm before it hits your ship.*

A cross-source forensics agent that uses Coral to JOIN package registries, maintainer behavior, runtime telemetry, threat intel, and your internal context — detecting supply chain attacks that single-dimension tools structurally cannot see.

---

## 1. Problem framing (use this in the pitch)

Existing supply chain security tools each look at **one slice**:

| Tool | What it sees | What it misses |
|---|---|---|
| Snyk / Dependabot | Known CVEs in your lockfile | Anything novel; maintainer/identity drift |
| Socket | Per-package code behavior | Cross-org correlation; your runtime; identity context |
| Sigstore / SLSA | Build-time attestation | The May 11 TanStack attack proved attested artifacts can be malicious |
| GitHub Security | Repo-level advisories | Registry-level events, runtime IOCs |

**Every recent attack** — XZ, Shai-Hulud, TanStack, AntV, react-codeshift — required correlating signals **across these silos** to detect early. The signal exists. The JOIN doesn't.

Crowsnest is the JOIN.

---

## 2. Product positioning

**Primary user**: Security engineer / DevSecOps lead at a 50–5000 person engineering org.

**Secondary**: Solo maintainer of a critical OSS package who wants to know if their account or one of their deps is being targeted.

**Core promise** (one sentence): *Crowsnest detects the patterns that take down ecosystems — maintainer takeovers, token-theft worms, AI-hallucinated dependencies, and SLSA-attested malware — by querying your entire supply chain as one SQL schema.*

---

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       USER-FACING LAYER                          │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐ ┌────────┐ │
│  │  Next.js     │  │ Crowsnest   │  │ VS Code      │ │ Slack/ │ │
│  │  Dashboard   │  │  CLI        │  │ Extension    │ │Discord │ │
│  └──────┬───────┘  └─────┬───────┘  └──────┬───────┘ └───┬────┘ │
└─────────┼────────────────┼─────────────────┼─────────────┼──────┘
          └────────────────┴─────────────────┴─────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────┐
│                  AGENT ORCHESTRATION (LangGraph)                 │
│                                                                  │
│   ┌────────────┐   ┌───────────────┐   ┌──────────────────┐    │
│   │  Detection │──▶│ Investigation │──▶│  Triage &        │    │
│   │  Planner   │   │    Agent      │   │  Remediation     │    │
│   └────────────┘   └───────┬───────┘   └──────────────────┘    │
│                            │                                     │
│                  Generates SQL plan                              │
└────────────────────────────┼─────────────────────────────────────┘
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                       CORAL  (the brain)                         │
│   Schema cache · Cross-source JOINs · All credentials local      │
└──────────────┬──────────────────┬──────────────────┬─────────────┘
               │                  │                  │
   ┌───────────▼──────┐ ┌─────────▼────────┐ ┌──────▼────────────┐
   │ CODE / IDENTITY  │ │   REGISTRY /     │ │  THREAT INTEL /   │
   │                  │ │   ARTIFACT       │ │  INTERNAL         │
   │ • GitHub         │ │ • npm registry   │ │ • OSV.dev         │
   │ • Local repos    │ │ • PyPI JSON      │ │ • GHSA            │
   │ • Lockfiles      │ │ • crates.io      │ │ • Socket API      │
   │ • Sigstore Rekor │ │ • Docker Hub     │ │ • ossf/malicious  │
   │ • CI/CD logs     │ │ • deps.dev       │ │ • Slack / Linear  │
   └──────────────────┘ └──────────────────┘ └───────────────────┘
```

---

## 4. Data sources & Coral table design

Coral exposes each source as one or more SQL tables. Below is the full schema we'll need. Tables prefixed `gh_*`, `npm_*`, `pypi_*`, `osv_*`, etc.

### 4.1 Code & identity sources

**`gh_repos`** — repos in your org, with metadata
```
org, repo_name, default_branch, visibility, created_at, archived
```

**`gh_commits`** — commit-level data per repo
```
repo, sha, author_email, author_login, committer_login, ts, files_changed[],
gpg_verified, signed_by, is_merge, parent_count
```

**`gh_releases`** — tagged releases per repo
```
repo, tag, release_ts, author_login, attestation_url, asset_urls[]
```

**`gh_actions_runs`** — every CI run + OIDC token issuances
```
repo, workflow, run_id, started_at, finished_at, conclusion, 
runner_label, triggered_by, oidc_audience, oidc_subject
```

**`gh_workflow_files`** — current and historical `.github/workflows/*.yml`
```
repo, path, ref, content_hash, declared_actions[], permissions, has_pwn_request_pattern
```

**`gh_repo_perms_audit`** — every permission/collaborator change
```
repo, ts, actor, change_type, target_user, before_role, after_role
```

**`local_lockfiles`** — your machine's package-lock.json, pnpm-lock.yaml, poetry.lock, Cargo.lock, go.sum
```
project_path, ecosystem, package, version, integrity_hash, resolved_url, 
declared_in (direct/transitive), parent_chain[]
```

**`local_source_packages_mentioned`** — every `import`/`require`/`use` in your source tree
```
file_path, ecosystem, package, ref_type, line_no, first_seen_commit, 
ai_authored_likelihood (0..1)
```

The last column is the **slopsquatting tripwire** — see §6.3.

**`sigstore_rekor`** — Sigstore transparency log entries
```
log_index, integrated_time, subject, public_key, x509_chain, 
build_config_uri, build_invocation_id, attested_predicate (jsonb)
```

### 4.2 Registry / artifact sources

**`npm_packages`** — current state per package name
```
name, latest_version, total_versions, weekly_downloads, repo_url, 
license, maintainers[], created_at, updated_at, has_install_script,
unpacked_size, dist_tags (jsonb)
```

**`npm_versions`** — every version ever published
```
name, version, published_at, published_by, tarball_url, shasum, 
integrity, dependencies (jsonb), dev_dependencies (jsonb),
has_install_script, has_postinstall, has_prepare,
attestation_subject_uri, attestation_predicate_type
```

**`npm_maintainers`** — maintainer changes over time (audit log)
```
package, maintainer_login, action (add/remove), ts, performed_by
```

**`npm_publish_events`** — recent publishes across the registry (firehose)
```
package, version, published_at, published_by, npm_org, 
publish_via (web/cli/oidc), source_ip_country (where available)
```

**`pypi_packages`**, **`pypi_versions`**, **`pypi_maintainers`** — analogous

**`crates_*`**, **`gem_*`**, **`maven_*`**, **`docker_images`** — analogous

**`deps_dev`** — Google's deps.dev API gives you transitive graphs, license, security advisories joined to npm/PyPI/Maven/Go/cargo
```
ecosystem, package, version, license, depends_on[], 
advisory_ids[], scorecard_score, openssf_scorecard (jsonb)
```

### 4.3 Threat intel sources

**`osv_advisories`** — every advisory in OSV.dev
```
osv_id, summary, details, severity, published, modified, 
affected_packages (jsonb), aliases[]
```

**`ghsa`** — GitHub Security Advisories
```
ghsa_id, severity, cvss_score, affected_versions, fixed_in, published, cwe_ids[]
```

**`socket_alerts`** — Socket.dev's per-package risk events (free tier API)
```
package, ecosystem, version, alert_type, severity, description, first_seen
```

**`ossf_malicious_packages`** — the public ossf/malicious-packages repo
```
ecosystem, package, version, classification, ioc_hashes[], 
first_reported, sources[]
```

**`shai_hulud_iocs`** — curated TeamPCP/Shai-Hulud IOCs from Unit42, Snyk, StepSecurity blog posts (we'll seed this)
```
campaign_name, ioc_type (domain/hash/c2/repo_name), value, first_seen, 
attribution, attack_wave
```

### 4.4 Internal / runtime sources

**`slack_messages`** — your security and incident channels (read-only)
```
channel, ts, user, text, package_mentions[], cve_mentions[], thread_root
```

**`linear_issues`** or **`jira_tickets`** — for existing security work
```
key, title, status, assignee, created, labels[], package_refs[]
```

**`runtime_imports`** (optional, opt-in) — eBPF or Node `--require` hook that logs every package actually loaded at runtime, dramatically narrowing remediation scope
```
host, process, ecosystem, package, version, first_loaded_at, last_loaded_at
```

---

## 5. The detection queries — Coral's crown jewels

This is where Crowsnest wins. Each query encodes a real attack pattern. The agent picks which to run based on context.

### 5.1 The XZ Utils pattern — maintainer takeover

```sql
-- Detect deps where a "new" maintainer is making structural changes
-- after a long-time maintainer's activity has collapsed.
SELECT 
  l.package, l.version, l.ecosystem,
  m_old.maintainer_login AS legacy_maintainer,
  m_new.maintainer_login AS new_maintainer,
  m_new.ts AS new_maintainer_added,
  c.files_changed
FROM local_lockfiles l
JOIN npm_maintainers m_new 
  ON m_new.package = l.package 
  AND m_new.action = 'add' 
  AND m_new.ts > NOW() - INTERVAL '180 days'
JOIN npm_maintainers m_old 
  ON m_old.package = l.package 
  AND m_old.action = 'add'
  AND m_old.ts < NOW() - INTERVAL '2 years'
JOIN gh_commits c
  ON c.repo = (SELECT repo_url FROM npm_packages WHERE name = l.package)
  AND c.author_login = m_new.maintainer_login
  AND c.ts > m_new.ts
WHERE 
  -- Legacy maintainer's commit cadence dropped 80%+
  (SELECT COUNT(*) FROM gh_commits 
   WHERE author_login = m_old.maintainer_login 
   AND ts > NOW() - INTERVAL '90 days') 
  < 0.2 * (SELECT COUNT(*) FROM gh_commits 
           WHERE author_login = m_old.maintainer_login 
           AND ts BETWEEN NOW() - INTERVAL '2 years' 
                      AND NOW() - INTERVAL '90 days') / 8
  -- And new maintainer is touching CI/CD or release config
  AND (
    '.github/workflows' = ANY(c.files_changed)
    OR 'configure' = ANY(c.files_changed)
    OR 'package.json' = ANY(c.files_changed)
  );
```

### 5.2 The Shai-Hulud pattern — token-theft worm

```sql
-- Detect publish events that look like worm-driven mass publication
SELECT 
  p.published_by,
  COUNT(DISTINCT p.package) AS packages_published,
  MIN(p.published_at) AS burst_start,
  MAX(p.published_at) AS burst_end,
  EXTRACT(EPOCH FROM (MAX(p.published_at) - MIN(p.published_at))) AS burst_seconds
FROM npm_publish_events p
WHERE p.published_at > NOW() - INTERVAL '7 days'
GROUP BY p.published_by
HAVING 
  COUNT(DISTINCT p.package) > 10
  AND EXTRACT(EPOCH FROM (MAX(p.published_at) - MIN(p.published_at))) < 1800
  -- 10+ packages in under 30 min = automation, not human
ORDER BY packages_published DESC;
```

JOIN that with `local_lockfiles` and you get **your specific exposure** to the latest worm wave in one query — something no current tool produces in under an hour.

### 5.3 Slopsquatting detection

```sql
-- Find packages in your codebase that were likely AI-suggested
-- and were created suspiciously recently
SELECT 
  s.file_path, s.package, s.ecosystem,
  n.created_at AS registered_at,
  n.weekly_downloads,
  s.first_seen_commit,
  g.author_login AS who_added_it,
  g.ts AS added_at,
  EXTRACT(DAY FROM (g.ts - n.created_at)) AS days_old_when_added
FROM local_source_packages_mentioned s
JOIN npm_packages n ON n.name = s.package AND s.ecosystem = 'npm'
JOIN gh_commits g ON g.sha = s.first_seen_commit
WHERE 
  s.ai_authored_likelihood > 0.7
  AND n.created_at > NOW() - INTERVAL '120 days'
  AND n.weekly_downloads < 5000
  -- Triangulate: name "smells" hallucinated (mash-up patterns)
  AND (
    s.package LIKE '%-helper-%' 
    OR s.package LIKE '%-utils-%'
    OR s.package ~ '^(react|vue|angular)-[a-z]+-(sdk|cli|lib|tool)$'
    OR s.package IN (SELECT package FROM known_hallucination_patterns)
  );
```

### 5.4 SLSA-attested malware detection (the May 11 pattern)

```sql
-- Detect packages where the SLSA provenance attests to a build
-- but the build's GitHub Actions log shows pwn-request or cache-poisoning IOCs
SELECT 
  l.package, l.version,
  v.attestation_subject_uri,
  r.build_invocation_id,
  w.has_pwn_request_pattern,
  a.run_id,
  a.triggered_by
FROM local_lockfiles l
JOIN npm_versions v ON v.name = l.package AND v.version = l.version
JOIN sigstore_rekor r ON r.subject = v.tarball_url
JOIN gh_actions_runs a ON a.run_id::text = r.build_invocation_id
JOIN gh_workflow_files w ON w.repo = a.repo AND w.path = a.workflow
WHERE 
  -- The artifact has valid provenance...
  v.attestation_subject_uri IS NOT NULL
  -- ...but the build pipeline has known-exploitable patterns
  AND (
    w.has_pwn_request_pattern = true
    OR a.triggered_by = 'pull_request_target'
    OR EXISTS (
      SELECT 1 FROM gh_actions_runs a2
      WHERE a2.repo = a.repo 
        AND a2.run_id = a.run_id
        AND a2.oidc_audience IS NOT NULL
        AND a2.oidc_subject NOT LIKE '%/main' 
        AND a2.oidc_subject NOT LIKE '%/master'
    )
  );
```

This single query would have caught TanStack/Mistral/UiPath on May 11.

### 5.5 Blast radius assessment

```sql
-- If maintainer X is compromised, what's our exposure?
WITH compromised_packages AS (
  SELECT package FROM npm_packages 
  WHERE :compromised_maintainer = ANY(maintainers)
)
SELECT 
  cp.package AS compromised_root,
  l.project_path AS our_project,
  l.package AS affected_dep,
  l.declared_in,
  l.parent_chain,
  COALESCE(r.host, 'not_observed_at_runtime') AS runtime_status
FROM compromised_packages cp
JOIN local_lockfiles l ON 
  cp.package = l.package 
  OR cp.package = ANY(l.parent_chain)
LEFT JOIN runtime_imports r ON 
  r.package = l.package AND r.ecosystem = l.ecosystem
ORDER BY 
  (CASE WHEN l.declared_in = 'direct' THEN 0 ELSE 1 END),
  array_length(l.parent_chain, 1);
```

### 5.6 Sleeper dependency detection

```sql
-- Multi-stage payloads: dep is silent on install but activates
-- under specific runtime conditions. Detect deps with: 
-- (a) recently added install/postinstall scripts, 
-- (b) network calls to non-typical domains in their install scripts,
-- (c) no behavioral changes detected by Socket in 6+ months, then a sudden one
SELECT 
  v.name, v.version, v.published_at,
  v.has_postinstall, v.has_prepare,
  s.alert_type, s.first_seen AS socket_first_alert,
  prev.version AS previous_quiet_version
FROM npm_versions v
JOIN socket_alerts s ON 
  s.package = v.name AND s.version = v.version
  AND s.alert_type IN ('shellEscape', 'networkInInstall', 'envVarExfil')
LEFT JOIN LATERAL (
  SELECT version FROM npm_versions v2 
  WHERE v2.name = v.name 
    AND v2.published_at < v.published_at
    AND NOT EXISTS (
      SELECT 1 FROM socket_alerts s2 
      WHERE s2.package = v2.name AND s2.version = v2.version
    )
  ORDER BY v2.published_at DESC LIMIT 1
) prev ON true
WHERE 
  v.name IN (SELECT package FROM local_lockfiles)
  AND v.published_at > NOW() - INTERVAL '30 days'
  AND prev.version IS NOT NULL;  -- previously quiet, now alerting
```

### 5.7 Author identity drift

```sql
-- Detect when a maintainer's commit "style fingerprint" suddenly changes
-- (timezone, commit message verbosity, file-touching patterns)
-- which often precedes account compromise
SELECT 
  c.author_login,
  c.repo,
  c.ts,
  AVG(EXTRACT(HOUR FROM c.ts)) OVER w_historical AS historical_hour_mean,
  EXTRACT(HOUR FROM c.ts) AS current_hour,
  AVG(LENGTH(c.message)) OVER w_historical AS historical_msg_len_mean,
  LENGTH(c.message) AS current_msg_len
FROM gh_commits c
WHERE c.author_login IN (
  SELECT unnest(maintainers) FROM npm_packages 
  WHERE name IN (SELECT package FROM local_lockfiles)
)
WINDOW w_historical AS (
  PARTITION BY c.author_login 
  ORDER BY c.ts 
  ROWS BETWEEN 200 PRECEDING AND 30 PRECEDING
);
```

There are another ~8 queries we'll write for: typosquat distance scoring, OIDC token misuse, CI cache poisoning, dependency confusion (private name registered publicly), abandoned-but-popular packages, package-with-no-source-repo, Sigstore Rekor diff anomalies, and Slack-chatter early-warning.

---

## 6. Wedge features (the moat against other hackathon submissions)

These exist because of Coral, and no one else will think of them in the time available.

### 6.1 Time Machine

Coral keeps a snapshot of registry state daily. The agent can answer **"Was I exposed to Shai-Hulud Wave 4 between May 11 12:00 UTC and May 11 14:30 UTC?"** as a SQL query against the historical snapshot. Existing scanners only know your *current* state. Crowsnest knows your *every previous* state. This is impossible without persistent SQL.

### 6.2 Counterfactual Blast Radius

Before a maintainer is compromised, run §5.5 *prospectively* against the top 50 maintainers in your transitive graph. The output is a **risk-weighted bill of dependencies**: "if Sindre Sorhus's npm account is compromised, you lose access to 14% of your transitive graph; if @colors/colors's maintainer is compromised, 0.3%." Use this to prioritize vendoring, pinning, or replacing.

### 6.3 AI Coder Forensics

A static analyzer that scores every dependency `import`/`require` in your repo by `ai_authored_likelihood` based on:
- Was it added in a single commit with no PR review?
- Was it added with no test file changes in the same commit?
- Did the commit message match LLM patterns ("Add support for X")?
- Was it added by a developer who has a Claude Code / Copilot identity in their commits?

JOIN with §5.3. If your team is shipping AI-generated code (and they are: 41% industry-wide), this is your single best slopsquatting defense.

### 6.4 Pre-install Veto Hook

A 50-line shim that wraps `npm install` / `pip install` / `cargo add`. Before resolving, it queries Crowsnest:
```bash
$ npm install left-pad-helper
[crowsnest] BLOCKED: left-pad-helper registered 11 days ago, 
            weekly downloads 23, no GitHub repo. 
            Slopsquatting probability: 0.94.
            Override with: npm install --crowsnest-acknowledge-risk
```
This is the demo's stopping moment.

### 6.5 Provenance Attestation Audit

Run §5.4 across your full lockfile nightly. Output is a list of packages where the cryptographic provenance is valid *but the build pipeline that produced it has high-risk patterns*. Post-May-11, this is the single most important supply chain check in existence, and no tool currently does it.

### 6.6 Incident Replay (the "were-we-affected" button)

When a new IOC drops (e.g., the May 11 TanStack list), one click runs every relevant historical query against the Time Machine snapshot and produces an incident scope report:
- Which dev laptops installed an affected version?
- Which CI runs may have leaked secrets?
- Which downstream services consumed the affected build artifact?
All as one SQL execution against pre-joined sources.



### 6.8 Maintainer Reputation Graph

Score every maintainer in your transitive graph (often thousands) on cross-source signals:
- Time on platform
- Cross-project co-maintainership network (graph centrality)
- Commit signature consistency
- 2FA enabled on registry
- Repo OpenSSF Scorecard
- Has-survived-a-takeover-attempt (signal from `npm_maintainers` change patterns)

Render as a sortable table. The bottom 50 maintainers in your graph are where the next attack will land.

### 6.9 Sigstore Rekor Diff

Coral mirrors the Sigstore Rekor transparency log. For every package in your lockfile that has an attestation, we verify the attestation's build invocation actually matches what GitHub Actions has on record. Discrepancies = compromise. This is a 30-line SQL query in Coral and a 6-month engineering project anywhere else.

### 6.10 The "Bilge Report"

A weekly digest tailored per engineer: "Your `~/projects/frontend` repo's dependency tree contains 3 packages whose maintainer activity dropped 90%+ this week, 1 package whose CI workflow added a `pull_request_target` trigger, and 2 packages that match active Shai-Hulud IOCs." One Coral query produces it.

---

## 7. Agent orchestration

We use **LangGraph** (Python) or the Gemini SDK directly with a state-machine pattern.

### Agent roles

1. **Detection Planner** — reads the user's context (current repo, recent IOC feeds, time-since-last-scan) and emits a prioritized list of detection queries to run. Uses a small library of pre-written SQL templates (the §5 queries) plus the ability to compose new ones.

2. **Investigation Agent** — given a hit from the planner, runs follow-up Coral queries to gather forensic detail (who, when, what blast radius). Outputs a structured incident object.

3. **Triage Agent** — assigns severity using a fixed rubric (probability of compromise × your exposure × runtime confirmation). Deduplicates against open Linear/Jira tickets.

4. **Remediation Drafter** — generates the PR (pinning, swap, vendoring), the Slack message to security, the Jira ticket body, and the postmortem skeleton.

### Why the agent stays small

Because Coral resolves data *before* the agent sees it, the agent's prompt context stays under 10k tokens even when scanning a 4000-package lockfile. Without Coral, the same scan would require 200+ tool calls dumping ~2M tokens of JSON. **This token-efficiency story is the demo punchline.**

### System prompt sketch for the Investigation Agent

```
You are Crowsnest's Investigation Agent. You have one tool: `coral_query(sql: str)`.

Your job: given an alert object, run the minimum number of SQL queries 
needed to produce a complete incident object with:
- attack_pattern (one of: maintainer_takeover, worm, slopsquat, slsa_poisoning, 
  sleeper, identity_drift, typosquat, dep_confusion)
- confidence (0..1)
- blast_radius (list of affected internal projects and services)
- runtime_confirmation (did we observe the package being loaded?)
- remediation_options (ordered by reversibility)

Never speculate beyond what SQL returns. If a query returns zero rows, 
the signal is absent. Don't infer.
```

---

## 8. UI / UX layer

### 8.1 Dashboard (Next.js)

Four top-level views:

- **Horizon** — live map of active threats hitting *your* dep graph right now. Big visceral graphic. Updates via SSE.
- **Lookout** — the prospective view: maintainer reputation graph, blast radius rankings, slopsquatting watchlist.
- **Hold** (the ship's hold) — your lockfile inventory with every annotation Crowsnest can attach.
- **Log** — incident history, replay buttons, post-mortems.

### 8.2 Crowsnest CLI

```
$ crowsnest scan
$ crowsnest investigate <package>@<version>
$ crowsnest blast-radius --maintainer @sindresorhus
$ crowsnest replay --ioc shai-hulud-wave-4
$ crowsnest watch  # daemon mode, posts to Slack on hits
$ crowsnest install <pkg>  # safe-install wrapper with pre-install veto
```

### 8.3 VS Code Extension (wedge demo)

Inline gutter warnings on `import`/`require` lines: red dot if `ai_authored_likelihood × slopsquat_probability > 0.5`. Hover for explanation. Click to file a ticket.


---

## 9. Demo script (90 seconds)

The script that wins:

> **0:00** — Live npm publish firehose on screen (real, via Coral). "These are the npm packages being published right now."
>
> **0:10** — Open VS Code with a vibe-coded project. Type `npm install react-codeshift`. CLI blocks: *"slopsquat probability 0.94, registered 11 days ago, no source repo."*
>
> **0:25** — Switch to dashboard. "I am now showing you our exposure to every active supply chain attack wave, joined live across npm, PyPI, GitHub, Sigstore Rekor, OSV, and Socket — with our own lockfiles and runtime telemetry."
>
> **0:40** — Click "Replay May 11 TanStack incident." Dashboard re-runs queries against historical snapshot. Shows: "You had `@tanstack/react-query@5.61.4` installed on 2 dev laptops during the malicious window. Here are the secrets that may have been exfiltrated."
>
> **1:00** — "But here's the part no other tool can do." Type a question: *"Show me every dependency where the maintainer just changed AND a CI workflow file was modified in the last 14 days AND the package has valid SLSA attestation."* Agent emits one SQL query. Three rows return. "These are the next XZ Utils. Existing tools don't see them. We see them because we JOIN."
>
> **1:25** — Show token usage: 3,200 tokens for the entire investigation. "A naive agent would have used 1.4 million tokens for this. The data resolved in Coral, not in the agent's head."
>
> **1:30** — Mic drop.

---

## 10. Tech stack & repo structure

```
crowsnest/
├── packages/
│   ├── core/              # Python; agent orchestration (LangGraph)
│   │   ├── agents/
│   │   ├── queries/       # The §5 SQL templates
│   │   ├── coral/         # Coral client wrapper
│   │   └── prompts/
│   ├── cli/               # TypeScript; the `crowsnest` CLI
│   ├── dashboard/         # Next.js 14 app router
│   │   ├── app/
│   │   └── components/
│   ├── vscode-extension/  # TypeScript; VS Code API
│   ├── slack-bot/         # TypeScript
│   └── shared/            # Types, schemas
├── coral-config/
│   ├── sources/           # YAML configs for each Coral source
│   └── seed-data/         # shai_hulud_iocs, known_hallucination_patterns
├── infra/
│   └── docker-compose.yml # Local Coral + Postgres for caching
└── docs/
```

**Stack choices:**
- Python 3.12 + LangGraph for agent runtime
- Gemini 3.5 Flash via API (cheap, fast, fits the hackathon)
- TypeScript everywhere else
- Next.js 14 + Tailwind + shadcn for dashboard
- SQLite for local persistence (Coral's local-first ethos)
- `tree-sitter` for the AI-coder static analysis
- `eBPF`/`bpftrace` for the runtime layer (optional but flashy)

---

## 11. Build plan (assume 4-person team, hackathon duration)

**Phase 1 — foundations (day 1)**
- Agent - 1: Coral source configs for npm registry, GitHub, OSV
- Agent - 2: schema + seed data (Shai-Hulud IOCs scraped from the Unit42/Snyk/StepSecurity posts)
- Agent - 3: agent runtime skeleton + one query (§5.1) end-to-end
- Agent - 4: dashboard skeleton, one panel showing one query result

**Phase 2 — the killer queries (day 2)**
- Implement all 10 queries in §5
- Write the SQL templates as parameterizable functions
- Add Sigstore Rekor source (this is the differentiator)
- Build the Time Machine: nightly snapshots into SQLite

**Phase 3 — wedge features (day 3)**
- AI Coder Forensics (tree-sitter pass over codebase)
- Pre-install Veto Hook (the dramatic demo moment)
- VS Code extension gutter warnings
- Blast Radius UI

**Phase 4 — polish & demo (day 4)**
- Full dashboard polish
- Demo script rehearsal
- Pre-load a compelling demo dataset (use a real public OSS project's lockfile and salt with known IOCs)
- Record the 90-second video as fallback

---

## 12. Risks & mitigation

- **Coral source coverage gaps** → if a source isn't a Coral first-party connector, write a thin adapter that ingests into Coral's local SQLite. Coral supports custom sources by design.
- **Live registry firehose latency** → batch with a 5-minute polling window for the demo; mention real-time as roadmap.
- **Demo data realism** → use real public lockfiles (Vercel, Supabase) and verified historical IOCs. No mocking.
- **Slopsquatting false positives** → ship with a confirmation step; track precision/recall on the demo dataset.
- **Judges asking "why not just MCP?"** → answer ready: MCP makes each source a tool call; Coral makes them all one schema. Token cost difference at lockfile scale is 100×.

---

## 13. What locks in the win

Three things, in priority:

1. **The May 11 SLSA-poisoned attestation demo.** No other team will know this attack exists, and even if they do, no other architecture can detect it. Lead with this.
2. **The slopsquatting + AI Coder Forensics combination.** This addresses the *future* of supply chain risk, not just the past. Judges (especially Kunal) will see the foresight.
3. **The token efficiency story.** The hackathon is *about* Coral. Showing 3,200 tokens vs. 1.4M is the literal embodiment of the sponsor's value proposition. The judges remember the number.

---

Want me to draft any specific piece in more detail next — the exact Coral source YAML configs, the LangGraph state machine, the SQL templates as actual parameterized functions, the AI Coder Forensics tree-sitter rules, or the demo project's compromised-lockfile seed dataset?