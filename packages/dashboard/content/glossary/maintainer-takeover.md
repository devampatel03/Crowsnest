---
title: Maintainer takeover
term: Maintainer takeover
h1: What is a maintainer takeover?
description: "A maintainer takeover is when a package passes to a new, often unvetted account that changes it in a later release. Definition and how to stay safe."
slug: maintainer-takeover
order: 4
updated: 2026-10-07
question: What is a maintainer takeover?
definition: "A maintainer takeover is when control of a package passes to a new, often unvetted account, which then changes what the package does in a later release."
answer: A maintainer takeover is when control of a package passes to a new, often unvetted account, which then changes what the package does in a later release. Commit your lockfile and read the changes when a long-quiet package updates.
facts:
  - "A takeover changes who publishes a package, not its name (definition, 2026-10-07)."
  - "Crowsnest flags a change in who maintains a package, and ranks maintainers by risk in the Lookout page (dashboard, 2026-10-07)."
  - "Lookout shows risk from 0 (low) to 1 (high) and activity over the last 90 days (dashboard guide, 2026-10-07)."
related:
  - /glossary/supply-chain-attack
  - /glossary/lockfile
  - /blog/what-to-do-when-crowsnest-says-hold
  - /docs/dashboard
---

A maintainer takeover is when control of a package passes to a new, often unvetted account, which then changes what the package does in a later release.

## Why does it matter?

You trusted the package because of who ran it. When that changes, a package you have used for years can change quietly.

## How do I stay safe?

- Commit your lockfile so updates are visible.
- Read the changes when a package you depend on updates after a long quiet spell.
- Be careful with packages that are widely used but have not been updated for a long time.
- Scan regularly. Crowsnest flags a change in who maintains a package.

## What this does not do

This page defines the term. A new maintainer is not always an attacker. Packages change hands for good reasons, so a flag is a prompt to look, not a verdict.

## Where do I read more?

Related terms: [supply chain attack](/glossary/supply-chain-attack) and [lockfile](/glossary/lockfile). Read [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold), or see the Lookout page in [Using the dashboard](/docs/dashboard). Back to the [glossary](/glossary).
