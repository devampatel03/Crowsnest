---
title: What is slopsquatting?
h1: What is slopsquatting?
description: "Slopsquatting is when attackers register package names that AI assistants invent. What it is, why it works, and how to stay safe when you install packages."
slug: what-is-slopsquatting
order: 1
published: 2026-10-07
updated: 2026-10-07
author: Crowsnest contributors
dek: An AI assistant can suggest a package that does not exist. An attacker can make it exist.
question: What is slopsquatting?
answer: Slopsquatting is when an attacker registers a package name that an AI coding assistant has invented, then waits for someone to install it. The package is real only because the attacker made it. Crowsnest warns you about new, little-used packages before they land in your project.
facts:
  - "Reading time: about 4 minutes (estimate at 200 words a minute)."
  - "crowsnest install stops at risk 0.6 or above; the limit is fixed (install check, 2026-10-07)."
  - "A package Crowsnest has no data on adds 0.2 risk and still installs (install check, 2026-10-07)."
  - "The install check weighs: registered under 30 days ago, under 1,000 weekly downloads, no repository link, and a name close to a package with over 1,000,000 weekly downloads (install check, 2026-10-07)."
related:
  - /blog/how-to-stay-safe-from-malicious-packages
  - /blog/what-to-do-when-crowsnest-says-hold
  - /glossary/slopsquatting
  - /docs/cli
---

Slopsquatting is when an attacker registers a package name that an AI coding assistant has invented, then waits for someone to install it. The package is real only because the attacker made it. Crowsnest warns you about new, little-used packages before they land in your project.

## How does it start?

AI coding assistants write code that imports packages. Usually the packages are real. Sometimes the assistant names one that does not exist. It sounds right, it fits the code, and it is made up.

On its own, that is a small annoyance. You run the install, the registry says "not found", and you move on.

## What does the attacker do?

An attacker who sees, or guesses, a name that assistants tend to invent can register it on the public registry and put harmful code inside. The next person who follows the suggestion does not get an error. They get the attacker's package.

The name is the whole trick. Nobody had to be fooled by a spelling mistake. The assistant supplied the name and you trusted it. A related attack, [typosquatting](/glossary/typosquatting), relies on a typing slip instead.

## Why is it hard to spot?

- The name looks plausible, because a program chose it to look plausible.
- The package is brand new, so no one has reported it yet.
- It may do something harmless at first and change later.

## What gives it away?

Three things tend to be true together. The package is very new. Almost nobody downloads it. It has no link back to a code repository, or it has a name close to a well-known one. None of these proves anything alone. Together they are a reason to stop and look.

## How do I stay safe?

1. Before you install a package an assistant suggested, search for it yourself. Check that it exists, who publishes it, and when it was created.
2. Look at its weekly downloads. A package with a handful of downloads is not widely trusted.
3. Look for a link to a code repository that matches the name.
4. Install through `crowsnest install <package>` so the check runs before the install.
5. If you are not sure, ask the assistant for the well-known package that does the job instead.

## What does Crowsnest do about it?

When you run `crowsnest install`, Crowsnest looks at how new the package is, how many people download it, whether it links to its source code, and whether its name is close to a very popular one. It also checks a built-in list of names AI assistants are known to invent. At risk 0.6 or above, it stops the install and shows you the reasons.

The reasons appear in plain lines. Here is a real result from the 0.1.0 code, for a name Crowsnest had no data on:

```text
✔ Approved: left-pad
[crowsnest]   ℹ  Package not found in Crowsnest database (may be new)
[crowsnest]   Risk score: 20%
```

That is the limit in one screen. A name Crowsnest has never seen scores 20 percent, which is under the 60 percent stop, so it installs.

## What this does not do

- If nobody has registered an invented name yet, there is no package to check, and the install simply fails.
- Crowsnest cannot judge a package it has no data on. It adds a small amount of risk (0.2) for that and carries on, as the output above shows.
- The built-in list of invented names is not included in the Docker image as of 2026-10-07, so that one check does nothing in the Docker setup.
- A plain `npm install` is not checked at all.

Read the other posts in this series: [How to stay safe from malicious packages](/blog/how-to-stay-safe-from-malicious-packages) and [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold). The [glossary entry](/glossary/slopsquatting) has the short definition, and [CLI usage](/docs/cli) covers the install command. [Install Crowsnest](/#install) to try it.

**An invented name is only dangerous once someone owns it. Check before you install.**
