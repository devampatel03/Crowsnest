---
title: How to stay safe from malicious packages
h1: How to stay safe from malicious packages.
description: "A short checklist for installing packages safely: check age and downloads, check the name, install through Crowsnest, commit your lockfile, act on a Hold."
slug: how-to-stay-safe-from-malicious-packages
order: 2
published: 2026-10-07
updated: 2026-10-07
author: Crowsnest contributors
dek: Five habits that take under a minute each.
question: How do I stay safe from malicious packages?
answer: Check how old a package is and how many people download it, check the spelling of its name, install through Crowsnest, keep your lockfile committed, and act on a Hold. None of these needs expert knowledge. Together they make a careless install much harder.
facts:
  - "Reading time: about 4 minutes (estimate at 200 words a minute)."
  - "Five habits, each under a minute (this post)."
  - "crowsnest install stops at risk 0.6 or above, and only for installs run through it (install check, 2026-10-07)."
  - "Crowsnest reads six lockfile types: package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, Cargo.lock and go.sum (lockfile reader, 2026-10-07)."
related:
  - /blog/what-is-slopsquatting
  - /blog/what-to-do-when-crowsnest-says-hold
  - /glossary/lockfile
  - /glossary/typosquatting
---

Check how old a package is and how many people download it, check the spelling of its name, install through Crowsnest, keep your lockfile committed, and act on a Hold. None of these needs expert knowledge. Together they make a careless install much harder.

## 1. How do I check the age and the downloads?

Open the package's page on npm or PyPI. Look at when it was first published and how many downloads it gets each week. A package from last week with a few downloads has no track record. That is not proof of harm, but it is a reason to look harder.

## 2. How do I check the name?

Read the name you typed, letter by letter. Compare it with the package you meant. Attackers publish names that differ by one letter, a swapped hyphen, or a different ending, hoping for a slip. This is [typosquatting](/glossary/typosquatting). Also check any name a chat assistant gave you; see [What is slopsquatting?](/blog/what-is-slopsquatting).

## 3. How do I install through Crowsnest?

```bash
crowsnest install some-package
```

This runs the check first. At risk 0.6 or above it stops. Without it, a plain `npm install` is not checked.

## 4. Why keep my lockfile committed?

Your [lockfile](/glossary/lockfile) records the exact version of every package. Commit it. That way a new install gets the versions you reviewed, and a change that sneaks in shows up as a difference in your next review. Crowsnest scans the lockfile you already have.

## 5. What do I do about a Hold?

Do not argue with a Hold on a busy day. Read the one-sentence reason and the first step under "What to do". If you were about to install the package, do not. If it is already in your project, follow the steps in [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold).

## Is there one more habit?

Be slower with brand-new packages that do something important, such as handling sign-in, payments or secrets.

## What this does not do

A checklist cannot catch everything. A trusted package can still be taken over later, which is why Crowsnest also watches for changes in who maintains the packages you use; see [maintainer takeover](/glossary/maintainer-takeover). Crowsnest also cannot check a package it has no data on: it adds only 0.2 risk and the install goes ahead. Do the first two habits by hand.

Start with the [Quickstart](/docs/quickstart) to set Crowsnest up, then [install Crowsnest](/#install) and use it for every new package.

**Five small checks beat one big cleanup.**
