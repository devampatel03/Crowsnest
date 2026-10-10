---
title: Typosquatting
term: Typosquatting
h1: What is typosquatting?
description: "Typosquatting is publishing a package with a name almost the same as a popular one, hoping for a typing slip. Definition, why it matters, and how to stay safe."
slug: typosquatting
order: 2
updated: 2026-10-07
question: What is typosquatting?
definition: "Typosquatting is publishing a package whose name is almost the same as a popular one, such as a missing letter or a moved hyphen, hoping someone mistypes an install command."
answer: Typosquatting is publishing a package whose name is almost the same as a popular one, such as a missing letter or a moved hyphen, hoping someone mistypes an install command. Read each name letter by letter and compare weekly downloads with the package you meant.
facts:
  - "Typosquatting depends on a typing slip; slopsquatting depends on an assistant's invented name (definitions, 2026-10-07)."
  - "crowsnest install adds 0.35 risk when a name is close to a package with over 1,000,000 weekly downloads (install check, 2026-10-07)."
  - "crowsnest install stops at risk 0.6 or above; the limit is fixed (install check, 2026-10-07)."
  - "A plain npm install is not checked (CLI source, 2026-10-07)."
related:
  - /glossary/slopsquatting
  - /glossary/dependency-confusion
  - /blog/how-to-stay-safe-from-malicious-packages
  - /docs/faq
---

Typosquatting is publishing a package whose name is almost the same as a popular one, such as a missing letter or a moved hyphen, hoping someone mistypes an install command.

## Why does it matter?

One slip at the keyboard installs the attacker's code. The real package and the copy can look alike in a list.

## How do I stay safe?

- Read the name letter by letter before you press Enter.
- Copy names from the project's own page, not from memory.
- Compare weekly downloads with the package you meant.
- Install through `crowsnest install`.

## What this does not do

This page defines the term. A name that is close to a popular one is a warning sign, not proof. Crowsnest only checks installs run as `crowsnest install`.

## Where do I read more?

Related terms: [slopsquatting](/glossary/slopsquatting) and [dependency confusion](/glossary/dependency-confusion). Read [How to stay safe from malicious packages](/blog/how-to-stay-safe-from-malicious-packages), or see the [FAQ](/docs/faq). Back to the [glossary](/glossary).
