---
title: Supply chain attack
term: Supply chain attack
h1: What is a supply chain attack?
description: "A supply chain attack harms you by tampering with something you rely on, such as a software package. Definition, why it matters and how to stay safe."
slug: supply-chain-attack
order: 6
updated: 2026-10-07
question: What is a supply chain attack?
definition: "A supply chain attack is when an attacker harms you by tampering with something you rely on, such as a software package, instead of attacking you directly."
answer: A supply chain attack is when an attacker harms you by tampering with something you rely on, such as a software package, instead of attacking you directly. Know what you install, check new packages, and review changes to your lockfile.
facts:
  - "In a supply chain attack the target is something you depend on, not you directly (definition, 2026-10-07)."
  - "Crowsnest is a free, open-source supply chain security tool under Apache-2.0 (LICENSE file, 2026-10-07)."
  - "Slopsquatting, typosquatting, dependency confusion and maintainer takeover are four kinds (glossary, 2026-10-07)."
related:
  - /glossary/slopsquatting
  - /glossary/typosquatting
  - /glossary/maintainer-takeover
  - /blog/what-is-slopsquatting
---

A supply chain attack is when an attacker harms you by tampering with something you rely on, such as a software package, instead of attacking you directly.

## Why does it matter?

Your project depends on code written by many other people. One package you did not write can run on your machine and in your builds.

## How do I stay safe?

- Know what you install, and where each package came from.
- Check new and little-used packages before you add them.
- Keep your lockfile committed and review changes to it.
- Replace keys and secrets if a harmful package ever ran where they were available.

## What this does not do

This page defines the term and does not describe any single incident. No tool, Crowsnest included, catches every supply chain attack.

## Where do I read more?

Four kinds are in this glossary: [slopsquatting](/glossary/slopsquatting), [typosquatting](/glossary/typosquatting), [dependency confusion](/glossary/dependency-confusion) and [maintainer takeover](/glossary/maintainer-takeover). Read [What is slopsquatting?](/blog/what-is-slopsquatting), or see the [FAQ](/docs/faq). Back to the [glossary](/glossary).
