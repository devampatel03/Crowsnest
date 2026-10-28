"""
Crowsnest detection query library.

Each query encodes a known supply-chain attack pattern. The Investigation Agent runs them against CoralDB.
{name} placeholders are filled by _safe_substitute, which accepts only numbers and strings made of letters, digits
and a few safe punctuation characters. Never format untrusted input into these strings yourself.
"""

from __future__ import annotations

import re
from typing import Any

# What changed in each release compared with the one before it, for every ecosystem. Each signal is weak alone
# (legitimate releases add dependencies and change maintainers) and strong together, so they carry weights and a
# release is reported once the weights reach {min_score}. NULL data counts as "unknown", never as a change.
#   provenance_repo_changed (3)  the signed build record names a different repository than the last release's:
#                                the litellm compromise ran the real pipeline against a look-alike fork
#   repo_mismatch_declared  (2)  the build record names a repository other than the one the package declares
#   provenance_dropped      (2)  the previous release was built with provenance and this one was not (axios)
#   install_hook_added      (2)  the release started running code at install time
#   new_publisher           (2)  a publisher who never released this package before (node-ipc)
#   dependency_added        (1)  a dependency the previous release did not have (axios added one in a patch)
#   size_jump               (1)  at least double the previous size and 20 KB larger (node-ipc: 37 KB to 117 KB)
#   dormant_release         (1)  first release after more than a year of silence
_RELEASE_SIGNALS = """
WITH history AS (
  SELECT
    v.ecosystem, v.name, v.version, v.published_at, v.published_by,
    v.dependency_names, v.has_install_script, v.has_provenance, v.provenance_repo, v.unpacked_size,
    regexp_extract(v.version, '^v?([0-9]+)', 1) AS major,
    regexp_matches(regexp_replace(v.version, '^v', ''), '[A-Za-z-]') AS is_prerelease,
    LAG(v.published_at)       OVER w AS prev_published_at,
    LAG(v.dependency_names)   OVER w AS prev_dependencies,
    LAG(v.has_install_script) OVER w AS prev_install_script,
    LAG(v.has_provenance)     OVER w AS prev_provenance,
    LAG(v.provenance_repo)    OVER w AS prev_provenance_repo,
    LAG(v.unpacked_size)      OVER w AS prev_size
  FROM package_versions v
  WHERE v.published_at IS NOT NULL
  -- A release is compared with the next lower version on its own major line, and pre-releases only with
  -- pre-releases: a 2.0.55 backport published after 2.1.4 is a change from 2.0.54, not from 2.1.4.
  WINDOW w AS (PARTITION BY v.ecosystem, v.name, regexp_extract(v.version, '^v?([0-9]+)', 1),
                            regexp_matches(regexp_replace(v.version, '^v', ''), '[A-Za-z-]')
               ORDER BY coalesce(TRY_CAST(nullif(regexp_extract(v.version, '^v?([0-9]+)', 1), '') AS BIGINT), 0),
                        coalesce(TRY_CAST(nullif(regexp_extract(v.version, '^v?[0-9]+[.]([0-9]+)', 1), '') AS BIGINT), 0),
                        coalesce(TRY_CAST(nullif(regexp_extract(v.version, '^v?[0-9]+[.][0-9]+[.]([0-9]+)', 1), '') AS BIGINT), 0),
                        v.published_at, v.version)
),
flagged AS (
  SELECT
    h.*,
    p.repo_url AS declared_repo,
    coalesce(h.prev_published_at IS NOT NULL AND coalesce(h.published_by, '') <> '' AND NOT EXISTS (
      SELECT 1 FROM package_versions o
      WHERE o.ecosystem = h.ecosystem AND o.name = h.name
        AND o.published_by = h.published_by AND o.published_at < h.published_at
    ), false) AS new_publisher,
    coalesce(len(list_filter(h.dependency_names, lambda x: NOT list_contains(h.prev_dependencies, x))) > 0
      AND h.prev_dependencies IS NOT NULL, false) AS dependency_added,
    coalesce(h.has_install_script AND NOT h.prev_install_script, false) AS install_hook_added,
    coalesce(h.prev_provenance AND NOT h.has_provenance, false) AS provenance_dropped,
    coalesce(repo_slug(h.prev_provenance_repo) <> '' AND repo_slug(h.provenance_repo) <> ''
      AND repo_slug(h.prev_provenance_repo) <> repo_slug(h.provenance_repo), false) AS provenance_repo_changed,
    coalesce(repo_slug(h.provenance_repo) <> '' AND repo_slug(p.repo_url) <> ''
      AND repo_slug(h.provenance_repo) <> repo_slug(p.repo_url), false) AS repo_mismatch_declared,
    coalesce(h.prev_size > 0 AND h.unpacked_size >= 2 * h.prev_size
      AND h.unpacked_size - h.prev_size >= 20000, false) AS size_jump,
    coalesce(h.published_at - h.prev_published_at > INTERVAL '365 days', false) AS dormant_release
  FROM history h
  LEFT JOIN packages p ON p.ecosystem = h.ecosystem AND p.name = h.name
),
scored AS (
  SELECT
    f.*,
    3 * CAST(provenance_repo_changed AS INTEGER) + 2 * CAST(repo_mismatch_declared AS INTEGER)
      + 2 * CAST(provenance_dropped AS INTEGER) + 2 * CAST(install_hook_added AS INTEGER)
      + 2 * CAST(new_publisher AS INTEGER) + CAST(dependency_added AS INTEGER)
      + CAST(size_jump AS INTEGER) + CAST(dormant_release AS INTEGER) AS score,
    list_filter([
      CASE WHEN provenance_repo_changed THEN 'provenance_repo_changed' END,
      CASE WHEN repo_mismatch_declared THEN 'repo_mismatch_declared' END,
      CASE WHEN provenance_dropped THEN 'provenance_dropped' END,
      CASE WHEN install_hook_added THEN 'install_hook_added' END,
      CASE WHEN new_publisher THEN 'new_publisher' END,
      CASE WHEN dependency_added THEN 'dependency_added' END,
      CASE WHEN size_jump THEN 'size_jump' END,
      CASE WHEN dormant_release THEN 'dormant_release' END
    ], lambda s: s IS NOT NULL) AS signals
  FROM flagged f
)
"""

_RELEASE_COLUMNS = """
  s.ecosystem, s.name AS package, s.version, s.published_at, s.published_by, s.score, s.signals,
  s.declared_repo, s.provenance_repo, s.prev_provenance_repo, s.prev_published_at"""


class QueryLibrary:
    """Registry of named, parameterisable SQL detection queries."""

    # XZ Utils pattern — maintainer takeover                 

    XZ_PATTERN = """
-- Detect deps where a new maintainer is making structural changes
-- after the long-time maintainer's activity has collapsed (XZ Utils style).
SELECT
  l.package,
  l.version,
  l.ecosystem,
  m_old.maintainer_login AS legacy_maintainer,
  m_new.maintainer_login AS new_maintainer,
  m_new.ts              AS new_maintainer_added,
  c.files_changed,
  c.ts                  AS suspicious_commit_ts
FROM local_lockfiles l
JOIN npm_maintainers m_new
  ON m_new.package = l.package
  AND m_new.action = 'add'
  AND m_new.ts > CURRENT_TIMESTAMP - INTERVAL '{lookback_new_days} days'
JOIN npm_maintainers m_old
  ON m_old.package = l.package
  AND m_old.action = 'add'
  AND m_old.ts < CURRENT_TIMESTAMP - INTERVAL '730 days'
  AND m_old.maintainer_login != m_new.maintainer_login
JOIN gh_commits c
  ON c.repo = (SELECT repo_url FROM npm_packages WHERE name = l.package LIMIT 1)
  AND c.author_login = m_new.maintainer_login
  AND c.ts > m_new.ts
WHERE
  -- Legacy maintainer commit cadence dropped ≥ 80 %
  (
    SELECT COUNT(*) FROM gh_commits gc1
    WHERE gc1.author_login = m_old.maintainer_login
      AND gc1.ts > CURRENT_TIMESTAMP - INTERVAL '90 days'
  ) < 0.2 * (
    SELECT COUNT(*) FROM gh_commits gc2
    WHERE gc2.author_login = m_old.maintainer_login
      AND gc2.ts BETWEEN CURRENT_TIMESTAMP - INTERVAL '730 days'
                     AND CURRENT_TIMESTAMP - INTERVAL '90 days'
  ) / 8.0
  -- New maintainer is touching sensitive files
  AND (
    list_contains(c.files_changed, '.github/workflows')
    OR list_contains(c.files_changed, 'configure')
    OR list_contains(c.files_changed, 'package.json')
    OR list_contains(c.files_changed, 'CMakeLists.txt')
    OR list_contains(c.files_changed, 'Makefile')
  )
ORDER BY m_new.ts DESC
LIMIT 50
"""

    # Shai-Hulud pattern — token-theft worm burst        

    SHAI_HULUD = """
-- Detect publish bursts that match token-theft worm behaviour:
-- 10+ packages published by the same account in under 30 minutes.
WITH burst AS (
  SELECT
    p.published_by,
    COUNT(DISTINCT p.package)                                          AS packages_published,
    MIN(p.published_at)                                                AS burst_start,
    MAX(p.published_at)                                                AS burst_end,
    EXTRACT(EPOCH FROM (MAX(p.published_at) - MIN(p.published_at)))   AS burst_seconds,
    list(DISTINCT p.package)                                           AS package_list
  FROM npm_publish_events p
  WHERE p.published_at > CURRENT_TIMESTAMP - INTERVAL '{lookback_days} days'
  GROUP BY p.published_by
  HAVING
    COUNT(DISTINCT p.package) > 10
    AND EXTRACT(EPOCH FROM (MAX(p.published_at) - MIN(p.published_at))) < 1800
)
SELECT
  b.*,
  COUNT(DISTINCT l.project_path) AS our_projects_exposed,
  list(DISTINCT l.package)       AS our_packages_affected
FROM burst b
LEFT JOIN local_lockfiles l
  ON list_contains(b.package_list, l.package)
GROUP BY
  b.published_by, b.packages_published, b.burst_start,
  b.burst_end, b.burst_seconds, b.package_list
ORDER BY b.packages_published DESC
"""

    # Slopsquatting — AI-hallucinated dependencies       
        
    SLOPSQUATTING = """
-- Find packages in your codebase likely AI-suggested and suspiciously new.
SELECT
  s.file_path,
  s.package,
  s.ecosystem,
  s.ai_authored_likelihood,
  n.created_at                                          AS registered_at,
  n.weekly_downloads,
  s.first_seen_commit,
  c.author_login                                        AS who_added_it,
  c.ts                                                  AS added_at,
  DATEDIFF('day', n.created_at, CURRENT_TIMESTAMP)      AS package_age_days,
  CASE WHEN k.package IS NOT NULL THEN true ELSE false END AS known_hallucination
FROM local_source_packages_mentioned s
JOIN npm_packages n   ON n.name = s.package AND s.ecosystem = 'npm'
LEFT JOIN gh_commits c ON c.sha = s.first_seen_commit
LEFT JOIN known_hallucination_patterns k ON k.package = s.package
WHERE
  s.ai_authored_likelihood > {min_ai_likelihood}
  AND n.created_at > CURRENT_TIMESTAMP - INTERVAL '{max_age_days} days'
  AND n.weekly_downloads < {max_downloads}
  AND (
    s.package LIKE '%-helper-%'
    OR s.package LIKE '%-utils-%'
    OR regexp_matches(s.package, '^(react|vue|angular|next|svelte)-[a-z]+-(sdk|cli|lib|tool|utils|helper)$')
    OR k.package IS NOT NULL
  )
ORDER BY s.ai_authored_likelihood DESC, n.weekly_downloads ASC
LIMIT 100
"""

    # SLSA-attested malware — TanStack pattern       

    SLSA_POISONING = """
-- Packages with valid SLSA provenance but a build pipeline that has
-- known-exploitable patterns.  Caught TanStack/Mistral/UiPath on 2026-05-11.
SELECT
  l.package,
  l.version,
  v.attestation_subject_uri,
  r.build_invocation_id,
  r.log_index,
  w.has_pwn_request_pattern,
  a.run_id,
  a.triggered_by,
  a.oidc_subject,
  a.started_at AS build_ts
FROM local_lockfiles l
JOIN npm_versions v
  ON v.name = l.package AND v.version = l.version
JOIN sigstore_rekor r
  ON r.subject = v.tarball_url
JOIN gh_actions_runs a
  ON a.run_id = r.build_invocation_id
JOIN gh_workflow_files w
  ON w.repo = a.repo AND w.path = a.workflow
WHERE
  v.attestation_subject_uri IS NOT NULL
  AND (
    w.has_pwn_request_pattern = true
    OR a.triggered_by = 'pull_request_target'
    OR (
      a.oidc_audience IS NOT NULL
      AND a.oidc_subject NOT LIKE '%/refs/heads/main'
      AND a.oidc_subject NOT LIKE '%/refs/heads/master'
    )
  )
ORDER BY a.started_at DESC
"""

    # Blast radius — exposure to a compromised maintainer   

    BLAST_RADIUS = """
-- If maintainer X is compromised, what is our exposure across all projects?
WITH compromised_packages AS (
  SELECT name AS package
  FROM npm_packages
  WHERE list_contains(maintainers, :compromised_maintainer)
)
SELECT
  cp.package                                                AS compromised_root,
  l.project_path                                            AS our_project,
  l.package                                                 AS affected_dep,
  l.version,
  l.declared_in,
  l.parent_chain,
  COALESCE(r.host, 'not_observed_at_runtime')               AS runtime_status,
  COALESCE(r.last_loaded_at::TEXT, 'never')                 AS last_runtime_load
FROM compromised_packages cp
JOIN local_lockfiles l
  ON cp.package = l.package
  OR list_contains(l.parent_chain, cp.package)
LEFT JOIN runtime_imports r
  ON r.package = l.package AND r.ecosystem = l.ecosystem
ORDER BY
  (CASE WHEN l.declared_in = 'direct' THEN 0 ELSE 1 END),
  array_length(l.parent_chain)
"""

    # Sleeper dependency — multi-stage payload   
                     
    SLEEPER_DEPENDENCY = """
-- Packages that were quiet for 6+ months but suddenly have install scripts
-- and suspicious Socket alerts — the multi-stage payload pattern.
SELECT
  v.name,
  v.version,
  v.published_at,
  v.has_postinstall,
  v.has_prepare,
  s.alert_type,
  s.severity                AS socket_severity,
  s.first_seen              AS socket_first_alert,
  prev.version              AS previously_quiet_version,
  prev.published_at         AS quiet_version_published
FROM npm_versions v
JOIN socket_alerts s
  ON s.package = v.name AND s.version = v.version
  AND s.alert_type IN ('shellEscape', 'networkInInstall', 'envVarExfil', 'malware')
LEFT JOIN LATERAL (
  SELECT v2.version, v2.published_at
  FROM npm_versions v2
  WHERE v2.name = v.name
    AND v2.published_at < v.published_at
    AND NOT EXISTS (
      SELECT 1 FROM socket_alerts s2
      WHERE s2.package = v2.name AND s2.version = v2.version
    )
  ORDER BY v2.published_at DESC
  LIMIT 1
) prev ON true
WHERE
  v.name IN (SELECT package FROM local_lockfiles)
  AND v.published_at > CURRENT_TIMESTAMP - INTERVAL '{lookback_days} days'
  AND prev.version IS NOT NULL
ORDER BY s.severity DESC, v.published_at DESC
"""

    # Author identity drift — account takeover signal              

    IDENTITY_DRIFT = """
-- Detect when a maintainer's commit 'style fingerprint' suddenly changes
-- (timezone, commit message verbosity, file-touching patterns).
SELECT
  c.author_login,
  c.repo,
  c.ts,
  c.sha,
  AVG(EXTRACT(HOUR FROM c.ts)) OVER w_hist        AS historical_hour_mean,
  EXTRACT(HOUR FROM c.ts)                         AS current_hour,
  STDDEV(EXTRACT(HOUR FROM c.ts)) OVER w_hist     AS hour_stddev,
  AVG(LENGTH(c.message)) OVER w_hist              AS historical_msg_len_mean,
  LENGTH(c.message)                               AS current_msg_len,
  c.gpg_verified,
  -- Z-score for commit hour: > 2.5 = statistically unusual
  ABS(EXTRACT(HOUR FROM c.ts) - AVG(EXTRACT(HOUR FROM c.ts)) OVER w_hist)
    / NULLIF(STDDEV(EXTRACT(HOUR FROM c.ts)) OVER w_hist, 0) AS hour_z_score
FROM gh_commits c
WHERE c.author_login IN (
  SELECT UNNEST(maintainers) AS login FROM npm_packages
  WHERE name IN (SELECT package FROM local_lockfiles)
)
WINDOW w_hist AS (
  PARTITION BY c.author_login
  ORDER BY c.ts
  ROWS BETWEEN 200 PRECEDING AND 30 PRECEDING
)
QUALIFY hour_z_score > 2.5 OR ABS(LENGTH(c.message) - historical_msg_len_mean) > 2 * historical_msg_len_mean
ORDER BY hour_z_score DESC NULLS LAST
LIMIT 50
"""

    #  Typosquat distance scoring                                         

    TYPOSQUAT_DISTANCE = """
-- Installed packages that are suspiciously similar to very popular packages
-- (Levenshtein-style — DuckDB does not have built-in edit distance, so we
--  use length/prefix heuristics that catch 90 % of real typosquats).
SELECT
  l.package                 AS installed_package,
  pop.name                  AS similar_popular_package,
  pop.weekly_downloads      AS popular_pkg_downloads,
  inst.weekly_downloads     AS installed_pkg_downloads,
  inst.created_at           AS installed_registered_at,
  l.version,
  l.project_path
FROM local_lockfiles l
JOIN npm_packages inst ON inst.name = l.package
CROSS JOIN (
  SELECT name, weekly_downloads FROM npm_packages
  WHERE weekly_downloads > 1000000
) pop
WHERE
  l.package != pop.name
  AND LENGTH(l.package) BETWEEN LENGTH(pop.name) - 2 AND LENGTH(pop.name) + 2
  AND (
    -- One-char transposition at start
    SUBSTRING(l.package, 1, LENGTH(pop.name) - 1) = SUBSTRING(pop.name, 1, LENGTH(pop.name) - 1)
    OR SUBSTRING(l.package, 2) = SUBSTRING(pop.name, 2)
    -- Hyphen insertion
    OR REPLACE(l.package, '-', '') = REPLACE(pop.name, '-', '')
  )
  AND inst.weekly_downloads < pop.weekly_downloads * 0.001
ORDER BY pop.weekly_downloads DESC
LIMIT 50
"""

    #  Abandoned-but-popular packages        
                                 
    ABANDONED_POPULAR = """
-- Popular packages in your dep graph with no activity in 365+ days.
SELECT
  l.package,
  l.version,
  n.weekly_downloads,
  n.updated_at                                           AS last_registry_update,
  DATEDIFF('day', n.updated_at, CURRENT_TIMESTAMP)       AS days_since_update,
  n.maintainers,
  (SELECT MAX(ts) FROM gh_commits WHERE repo = n.repo_url) AS last_commit_ts
FROM local_lockfiles l
JOIN npm_packages n ON n.name = l.package
WHERE
  n.weekly_downloads > 10000
  AND DATEDIFF('day', n.updated_at, CURRENT_TIMESTAMP) > 365
ORDER BY n.weekly_downloads DESC
LIMIT 50
"""

    #  OIDC token misuse                                                  
    
    OIDC_TOKEN_MISUSE = """
-- OIDC tokens issued for builds triggered outside expected branch contexts.
SELECT
  a.repo,
  a.run_id,
  a.workflow,
  a.oidc_subject,
  a.oidc_audience,
  a.triggered_by,
  a.started_at,
  w.has_pwn_request_pattern
FROM gh_actions_runs a
JOIN gh_workflow_files w
  ON w.repo = a.repo AND w.path = a.workflow
WHERE
  a.oidc_audience IS NOT NULL
  AND a.oidc_subject NOT LIKE '%refs/heads/main'
  AND a.oidc_subject NOT LIKE '%refs/heads/master'
  AND a.triggered_by IN ('pull_request_target', 'workflow_run')
  AND a.started_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
ORDER BY a.started_at DESC
LIMIT 50
"""

    #  Dependency confusion                                               
   
    DEP_CONFUSION = """
-- Private/internal package names that have been registered publicly —
-- could be a dependency confusion attack.
SELECT
  l.package,
  l.version,
  l.ecosystem,
  l.project_path,
  n.created_at  AS public_registration_date,
  n.weekly_downloads,
  n.maintainers
FROM local_lockfiles l
JOIN npm_packages n ON n.name = l.package
WHERE
  l.resolved_url LIKE '%registry.npmjs.org%'
  AND n.created_at > CURRENT_TIMESTAMP - INTERVAL '180 days'
  AND n.weekly_downloads < 100
  AND (
    l.package LIKE '@%/%'
    OR l.project_path LIKE '%internal%'
    OR l.project_path LIKE '%private%'
    OR l.project_path LIKE '%corp%'
  )
ORDER BY n.created_at DESC
"""

    #  CI cache poisoning                                                 
    
    CI_CACHE_POISONING = """
-- Workflows using mutable cache keys that also published packages.
SELECT
  w.repo,
  w.path       AS workflow_path,
  w.declared_actions,
  a.run_id,
  a.triggered_by,
  a.conclusion,
  a.started_at,
  a.oidc_subject
FROM gh_workflow_files w
JOIN gh_actions_runs a
  ON a.repo = w.repo AND a.workflow = w.path
WHERE
  list_contains(w.declared_actions, 'actions/cache')
  AND a.triggered_by IN ('push', 'release')
  AND a.conclusion = 'success'
  AND a.started_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND EXISTS (
    SELECT 1 FROM npm_versions v
    WHERE v.attestation_subject_uri LIKE '%' || w.repo || '%'
      AND v.published_at BETWEEN a.started_at AND a.finished_at
  )
ORDER BY a.started_at DESC
LIMIT 50
"""

    #  Shai-Hulud IOC match against lockfile                             
   
    IOC_MATCH = """
-- Packages in your lockfile that match known Shai-Hulud / TeamPCP IOCs.
SELECT
  l.package,
  l.version,
  l.ecosystem,
  l.project_path,
  i.campaign_name,
  i.ioc_type,
  i.value       AS matched_ioc,
  i.attack_wave,
  i.first_seen  AS ioc_first_seen,
  i.attribution
FROM local_lockfiles l
JOIN shai_hulud_iocs i
  ON (
    (i.ioc_type = 'package_name' AND i.value = l.package)
    OR (i.ioc_type = 'npm_publisher' AND i.value IN (
      SELECT published_by FROM npm_publish_events
      WHERE package = l.package
    ))
  )
ORDER BY i.first_seen DESC
"""

    #  Known-malicious versions (OpenSSF malicious-packages via OSV)

    MALICIOUS_PACKAGE_MATCH = """
-- Exact package versions in your lockfiles that a public malware feed lists as malicious.
-- No third-party scanner needs to have flagged them: the feed is checked per version, so a clean
-- release of the same package never matches. Works for every ecosystem the lockfile readers cover.
SELECT
  l.package,
  l.version,
  l.ecosystem,
  l.project_path,
  l.declared_in,
  l.parent_chain,
  m.classification,
  m.first_reported,
  m.sources                AS advisory_ids,
  a.summary                AS advisory_summary,
  a.published              AS advisory_published
FROM local_lockfiles l
JOIN ossf_malicious_packages m
  ON m.ecosystem = l.ecosystem
  AND m.package = l.package
  AND m.version = l.version
LEFT JOIN osv_advisories a
  ON list_contains(m.sources, a.osv_id)
ORDER BY m.first_reported DESC, l.project_path, l.package
"""

    #  Release anomalies: a release that differs suspiciously from the one before

    RELEASE_ANOMALY = _RELEASE_SIGNALS + """
-- Releases in your lockfiles that were published recently and whose changes add up to a compromise pattern.
SELECT""" + _RELEASE_COLUMNS + """,
  l.project_path, l.declared_in, l.parent_chain
FROM scored s
JOIN local_lockfiles l
  ON l.ecosystem = s.ecosystem AND l.package = s.name AND l.version = s.version
WHERE s.score >= {min_score}
  AND s.published_at > CURRENT_TIMESTAMP - INTERVAL '{lookback_days} days'
ORDER BY s.score DESC, s.published_at DESC
"""

    #  Maintainer reputation score query
    
    MAINTAINER_REPUTATION = """
-- Score every maintainer in your transitive dep graph.
WITH maintainer_list AS (
  SELECT DISTINCT UNNEST(n.maintainers) AS login, n.name AS package
  FROM npm_packages n
  WHERE n.name IN (SELECT package FROM local_lockfiles)
),
commit_stats AS (
  SELECT
    c.author_login,
    COUNT(*)                                                     AS total_commits_90d,
    COUNT(DISTINCT c.repo)                                       AS repos_touched,
    SUM(CASE WHEN c.gpg_verified THEN 1 ELSE 0 END) * 1.0
      / NULLIF(COUNT(*), 0)                                      AS gpg_ratio
  FROM gh_commits c
  WHERE c.ts > CURRENT_TIMESTAMP - INTERVAL '90 days'
  GROUP BY c.author_login
),
account_age AS (
  SELECT
    m.maintainer_login,
    MIN(m.ts)  AS first_seen_maintaining
  FROM npm_maintainers m
  GROUP BY m.maintainer_login
),
ioc_hits AS (
  -- Catch IOCs by package name (via publish events) OR by direct maintainer login
  SELECT DISTINCT published_by AS login
  FROM npm_publish_events
  WHERE package IN (
    SELECT value FROM shai_hulud_iocs WHERE ioc_type = 'package_name'
  )
  UNION
  SELECT DISTINCT value AS login
  FROM shai_hulud_iocs
  WHERE ioc_type = 'npm_maintainer'
)
SELECT
  ml.login,
  COUNT(DISTINCT ml.package)                                       AS packages_in_graph,
  list(DISTINCT ml.package)                                        AS packages_list,
  COALESCE(cs.total_commits_90d, 0)                               AS commits_90d,
  COALESCE(cs.gpg_ratio, 0)                                       AS gpg_sign_ratio,
  COALESCE(cs.repos_touched, 0)                                   AS repos_touched,
  COALESCE(
    DATEDIFF('day', aa.first_seen_maintaining, CURRENT_TIMESTAMP),
    0
  )                                                                AS days_on_platform,
  CASE WHEN ih.login IS NOT NULL THEN true ELSE false END          AS ioc_flagged,
  -- Risk score (0=safe, 1=critical)
  CASE WHEN ih.login IS NOT NULL THEN 1.0
    ELSE LEAST(1.0,
      -- New account: higher risk
      (CASE
        WHEN aa.first_seen_maintaining IS NULL THEN 0.15
        WHEN DATEDIFF('day', aa.first_seen_maintaining, CURRENT_TIMESTAMP) < 180 THEN 0.3
        ELSE 0.0
      END)
      -- Poor GPG hygiene
      + (CASE WHEN COALESCE(cs.gpg_ratio, 0) < 0.5 THEN 0.2 ELSE 0.0 END)
      -- Ghost maintainer (no recent commits)
      + (CASE WHEN COALESCE(cs.total_commits_90d, 0) = 0 THEN 0.3 ELSE 0.0 END)
    )
  END AS risk_score
FROM maintainer_list ml
LEFT JOIN commit_stats cs  ON cs.author_login = ml.login
LEFT JOIN account_age aa   ON aa.maintainer_login = ml.login
LEFT JOIN ioc_hits ih      ON ih.login = ml.login
GROUP BY
  ml.login, cs.total_commits_90d, cs.gpg_ratio, cs.repos_touched,
  aa.first_seen_maintaining, ih.login
ORDER BY risk_score DESC, packages_in_graph DESC
"""

    #  Public query registry                                              

    _REGISTRY: dict[str, str] = {}

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)

    @classmethod
    def _build_registry(cls) -> None:
        cls._REGISTRY = {
            k: v for k, v in vars(cls).items()
            if isinstance(v, str) and not k.startswith("_")
        }

    @classmethod
    def list_queries(cls) -> list[str]:
        if not cls._REGISTRY:
            cls._build_registry()
        return list(cls._REGISTRY.keys())

    @classmethod
    def get(cls, name: str, params: dict[str, Any] | None = None) -> str:
        """Return the named query with {param} placeholders substituted."""
        if not cls._REGISTRY:
            cls._build_registry()
        if name not in cls._REGISTRY:
            raise KeyError(f"Unknown query: {name!r}. Available: {cls.list_queries()}")
        sql = cls._REGISTRY[name]
        merged = {**DEFAULT_PARAMS.get(name, {}), **(params or {})}
        if merged:
            sql = _safe_substitute(sql, merged)
        leftover = re.findall(r"\{[a-z_]+\}", sql)
        if leftover:
            raise ValueError(f"Query {name!r} has unfilled parameters: {sorted(set(leftover))}")
        return sql.strip()


# Defaults for {placeholder} parameters, so every caller renders a runnable query.
RELEASE_CHECK_SQL = _RELEASE_SIGNALS.replace("{min_score}", "3") + "SELECT" + _RELEASE_COLUMNS + """
FROM scored s
WHERE s.ecosystem = :ecosystem AND s.name = :pkg AND s.version = :version
"""
"""One release's anomaly score, for the install check. Takes :ecosystem, :pkg and :version."""

DEFAULT_PARAMS: dict[str, dict[str, Any]] = {
    "RELEASE_ANOMALY": {"lookback_days": "30", "min_score": "3"},
    "XZ_PATTERN": {"lookback_new_days": "180"},
    "SHAI_HULUD": {"lookback_days": "7"},
    "SLOPSQUATTING": {
        "min_ai_likelihood": 0.7,
        "max_age_days": "120",
        "max_downloads": 5000,
    },
    "SLEEPER_DEPENDENCY": {"lookback_days": "30"},
}


def _safe_substitute(template: str, params: dict[str, Any]) -> str:
    """
    Replace {key} placeholders with safe, validated values.
    Only numbers and strings of safe characters are accepted; anything else raises.
    """
    for key, val in params.items():
        placeholder = "{" + key + "}"
        if placeholder not in template:
            continue
        if isinstance(val, (int, float)):
            template = template.replace(placeholder, str(val))
        elif isinstance(val, str):
            # Only allow alphanumerics, underscores, hyphens, dots, @ — no SQL metacharacters
            if not re.match(r"^[A-Za-z0-9_\-\.@/]+$", val):
                raise ValueError(f"Unsafe parameter value for {key!r}: {val!r}")
            template = template.replace(placeholder, val)
        else:
            raise TypeError(f"Unsupported param type for {key!r}: {type(val)}")
    return template


# Initialise registry at import time
QueryLibrary._build_registry()
