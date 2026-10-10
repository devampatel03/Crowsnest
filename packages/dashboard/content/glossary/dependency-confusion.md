---
title: Dependency confusion
term: Dependency confusion
h1: What is dependency confusion?
description: "Dependency confusion is publishing a public package under the name of a private one so a build installs the wrong version. Definition and how to stay safe."
slug: dependency-confusion
order: 3
updated: 2026-10-07
question: What is dependency confusion?
definition: "Dependency confusion is publishing a public package with the same name as a company's private one, so that a build that checks the public registry installs the attacker's version instead."
answer: Dependency confusion is publishing a public package with the same name as a company's private one, so that a build that checks the public registry installs the attacker's version instead. Tell your tools to fetch private packages only from your private registry.
facts:
  - "Private package names are not reserved on public registries (definition, 2026-10-07)."
  - "A scope, such as @yourcompany/, marks a package name as belonging to one owner (npm naming, 2026-10-07)."
  - "Crowsnest reads your lockfile, which records the version of every package that was installed (lockfile reader, 2026-10-07)."
related:
  - /glossary/typosquatting
  - /glossary/lockfile
  - /blog/how-to-stay-safe-from-malicious-packages
  - /docs/faq
---

Dependency confusion is publishing a public package with the same name as a company's private one, so that a build that checks the public registry installs the attacker's version instead.

## Why does it matter?

Private names are not reserved on public registries. A build that looks in both places can pick the wrong one without anyone noticing.

## How do I stay safe?

- Tell your tools to fetch private packages only from your private registry.
- Use a scope (such as `@yourcompany/`) for private package names.
- Check where a package was installed from when a build uses an unexpected version.

## What this does not do

This page defines the term. Crowsnest does not read your registry settings, so it cannot tell you whether your build is set up to prefer the private registry.

## Where do I read more?

Related terms: [typosquatting](/glossary/typosquatting) and [lockfile](/glossary/lockfile). Read [How to stay safe from malicious packages](/blog/how-to-stay-safe-from-malicious-packages), or see the [FAQ](/docs/faq). Back to the [glossary](/glossary).
