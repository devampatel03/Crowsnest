---
title: FAQ
description: "Answers to common questions about Crowsnest: what it is, whether it needs API keys, what it costs, what it can't see and what to do when it says Hold."
slug: faq
order: 9
section: Help
updated: 2026-11-08
question: What do people ask about Crowsnest?
answer: Crowsnest is free, open source and runs on your machine. It needs no account and no API keys, and sends no usage data to its authors. It stops installs only when you use crowsnest install. Fourteen short answers follow.
facts:
  - "Licence: Apache-2.0, free to use (LICENSE file, 2026-10-07)."
  - "Install stop: risk 0.6 or above, fixed, and only for crowsnest install (install check, 2026-10-07)."
  - "VS Code warning limit: 0.5 by default, configurable as crowsnest.riskThreshold (extension manifest, 2026-10-07)."
  - "Lockfiles read: package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock, Cargo.lock and go.sum (lockfile reader, 2026-10-07)."
  - "Optional keys: Anthropic, GitHub, Socket and npm (.env.example, 2026-10-07)."
related:
  - /docs
  - /docs/troubleshooting
  - /glossary
  - /docs/configuration
---

Short answers first, then detail. The first six are the same as on the home page.

## What is Crowsnest?

Crowsnest is a free, open-source supply chain security tool that you run yourself: it checks the packages in your software project and tells you, in plain words, which ones to hold back before they cause harm. Each package gets a call: Clear, Watch or Hold.

*Detail:* see the [Introduction](/docs).

## What is slopsquatting?

Slopsquatting is when an attacker registers a package name that an AI coding assistant has invented, then waits for someone to install it. Crowsnest warns you about new, little-used packages with names like that before they land in your project.

*Detail:* AI assistants sometimes suggest a package that does not exist. If an attacker registers that name, anyone who follows the suggestion installs the attacker's code. See the [glossary](/glossary/slopsquatting) and the [blog post](/blog/what-is-slopsquatting).

## Do I need API keys?

No. Every key is optional. Without keys, Crowsnest uses cached data and still runs. Keys let it look things up live: a Socket key for threat alerts, a GitHub key for repository details, and a key for an AI model (Anthropic, OpenAI, Gemini and others, or one on your own machine) for written explanations.

*Detail:* see [Configuration](/docs/configuration).

## Does it stop npm install?

Only when you install through Crowsnest. `crowsnest install <package>` checks first and stops at risk 0.6 or above. A plain `npm install` is not checked. If Crowsnest is not running, the install falls back to a quick check against the public malware list and says so. Add `--strict` to refuse to install when a check could not be completed.

*Detail:* see [CLI usage](/docs/cli).

## Does my code leave my machine?

Your lockfile and results stay on your machine. A scan sends package names to the registries your packages come from and to the OSV malicious-package list, which also receives exact versions. Optional keys add calls to Socket, GitHub and Anthropic, and only when you set them.

*Detail:* with an Anthropic key set, scan details go to Anthropic's API: the project folder path, the kind of project, the time of the last scan, recent campaign names, your GitHub organisation name, and up to 20 matching results for each check that finds something. Crowsnest sends no usage data to its authors, and the tool on your machine has no analytics. This website counts page views with Vercel Web Analytics and sets no cookies. See [Configuration](/docs/configuration) for the full list of keys and what each sends.

## What does it cost?

Nothing. Crowsnest is free and open source under the Apache-2.0 licence. You run it yourself, so your only costs are your own machine and any optional services whose keys you choose to add.

## Which projects does it work with?

It reads `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `Cargo.lock` and `go.sum`. npm projects get the most checks. You can name the kind of project with `-e npm`, `pypi`, `cargo` or `go`, but coverage outside npm is thinner.

## Does it replace Dependabot or Snyk?

No. Those tools track known security bugs. Crowsnest looks at other signs: new packages, changed maintainers, names close to famous ones. Run it alongside them, not instead of them.

## Can it catch an attack nobody has seen yet?

Not always. If an attack has left no public trace, Crowsnest cannot see it. It does better on the next wave, when a package is republished or flagged somewhere it can read.

## Can I change the 0.6 stop limit?

No. `crowsnest install` stops at 0.6 and the limit is fixed. You can change the warning limit in VS Code (`crowsnest.riskThreshold`, default 0.5), which only affects what you see in the editor.

## What should I do when it says Hold?

Do not install the package, or remove it, until you have checked. Read the one-sentence reason, take the first step under "What to do", then scan again.

*Detail:* see [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold).

## How do I report a bug?

Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose) with the Bug report form, and remove any keys first. For a security problem, do not open a public issue. Use GitHub's private reporting instead: on the repository's [Security tab](https://github.com/devampatel03/Crowsnest/security), choose **Report a vulnerability**. Only the maintainers can see it. The project is run by volunteers, so a fixed reply time is not promised.

*Detail:* see [Contributing](/docs/contributing).

## Who is Nib?

Nib is Crowsnest's mascot, a small crow who sits at the masthead of your project. Nib is a drawing, not a chatbot. The calls come from Crowsnest's own checks, and Nib never answers questions or runs anything.

*Detail:* Nib appears on this website and in the dashboard. Nib is not in the command line tool, the Slack bot or the VS Code extension.

## Why did my scan fail?

No API keys are needed for a scan. On 2026-11-04 a scan with no keys, on the published 0.1.1 image, finished normally. If yours failed, the most common cause is a folder Docker cannot see, or a folder with no lockfile.

*Detail:* [Troubleshooting](/docs/troubleshooting) lists the messages and what to do. An older build showed "Forbidden keyword in query: REPLACE"; update with `npm install -g @crowsnest/cli@latest` and run `crowsnest start` again.

## What this does not do

- It does not answer questions about your own setup. [Troubleshooting](/docs/troubleshooting) covers the common faults.
- It does not promise Crowsnest catches every attack. Read [what it cannot do](/docs).
- It does not offer private support. There is no email address or chat room yet; use GitHub issues.
