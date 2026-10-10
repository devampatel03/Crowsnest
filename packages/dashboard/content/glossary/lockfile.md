---
title: Lockfile
term: Lockfile
h1: What is a lockfile?
description: "A lockfile records the exact version of every package your project installed. What it is, why you should commit it, and how it helps you stay safe."
slug: lockfile
order: 5
updated: 2026-10-07
question: What is a lockfile?
definition: "A lockfile is a file, such as package-lock.json, that records the exact version of every package your project installed, including the packages your packages depend on."
answer: A lockfile is a file, such as package-lock.json, that records the exact version of every package your project installed, including the packages your packages depend on. Commit it, and look at changes to it in code review.
facts:
  - "Crowsnest reads package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, Cargo.lock and go.sum (lockfile reader, 2026-10-07)."
  - "A scan reads the lockfile in the folder you give it (scan, 2026-10-07)."
  - "npm projects get the most checks (README and lockfile reader, 2026-10-07)."
related:
  - /glossary/supply-chain-attack
  - /glossary/maintainer-takeover
  - /blog/how-to-stay-safe-from-malicious-packages
  - /docs/cli
---

A lockfile is a file, such as `package-lock.json`, that records the exact version of every package your project installed, including the packages your packages depend on.

## Why does it matter?

It is the list Crowsnest reads. It makes installs repeatable, and it shows you what changed between two reviews.

## How do I stay safe?

- Commit your lockfile to version control.
- Look at lockfile changes in code review, not only code changes.
- Install from the lockfile in your builds.

## What this does not do

A lockfile does not say whether a package is safe. It only records what you have. Crowsnest scans that record; it cannot check a folder with no lockfile.

## Where do I read more?

Related terms: [supply chain attack](/glossary/supply-chain-attack) and [maintainer takeover](/glossary/maintainer-takeover). Read [How to stay safe from malicious packages](/blog/how-to-stay-safe-from-malicious-packages), or learn how to scan a project in [CLI usage](/docs/cli). Back to the [glossary](/glossary).
