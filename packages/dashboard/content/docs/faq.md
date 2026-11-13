---
title: FAQ
description: "Answers to common questions about Crowsnest: what it is, whether it needs API keys, what it costs, what it can't see and what to do when it says Hold."
slug: faq
order: 9
section: Help
updated: 2026-11-13
question: What do people ask about Crowsnest?
answer: Crowsnest is free, open source and runs on your machine. It needs no account and no API keys, and sends no usage data to its authors. It stops installs only when you use crowsnest install. Fifteen short answers follow.
facts:
  - "Licence: Apache-2.0, free to use (LICENSE file, 2026-11-09)."
  - "Install stop: risk 0.6 or above, fixed, and only for crowsnest install (install check, 2026-11-09)."
  - "VS Code warning limit: 0.5 by default, configurable as crowsnest.riskThreshold (extension manifest, 2026-11-09)."
  - "Dashboard: http://localhost:3000, opening on Horizon (infra/docker-compose.yml, 2026-11-09)."
  - "Optional keys: Anthropic, GitHub, Socket and npm (.env.example, 2026-11-09)."
related:
  - /docs
  - /docs/troubleshooting
  - /glossary
  - /docs/configuration
---

The first six answers match the home page. The rest follow in the order you are likely to need them.

## What is Crowsnest?

Crowsnest is a free, open-source supply chain security tool that you run yourself: it checks the packages in your software project and tells you, in plain words, which ones to hold back before they cause harm. Each package gets a call: Clear, Watch or Hold. The [Introduction](/docs) has the full picture.

## What is slopsquatting?

Slopsquatting is when an attacker registers a package name that an AI coding assistant has invented, then waits for someone to install it. Crowsnest warns you about new, little-used packages with names like that before they land in your project. The [glossary](/glossary/slopsquatting) and the [blog post](/blog/what-is-slopsquatting) explain how it works.

## Do I need API keys?

No. Every key is optional. Without keys, Crowsnest uses cached data and still runs. Keys let it look things up live: Socket for threat alerts, GitHub for repository details, and an AI model (Anthropic, OpenAI, Gemini and others, or one on your own machine) for written explanations. [Configuration](/docs/configuration) lists each key.

## Does it stop npm install?

Only when you install through Crowsnest. `crowsnest install <package>` checks first and stops at risk 0.6 or above. A plain `npm install` is not checked.

If Crowsnest is not running, the install stops, installs nothing, and tells you to run `crowsnest start`. It asks every time, so a Crowsnest you stopped is noticed. Add `--quick` to install with only the public malware list and release age checked. See [CLI usage](/docs/cli).

## Does my code leave my machine?

Your lockfile and results stay on your machine. A scan sends package names to the registries your packages come from and to the OSV malicious-package list, which also receives exact versions. Optional keys add calls to Socket, GitHub and Anthropic, and only when you set them.

With an Anthropic key set, scan details go to Anthropic's API: the project folder path, the kind of project, the time of the last scan, recent campaign names, your GitHub organisation name and up to 20 matching results for each check that finds something. Crowsnest sends no usage data to its authors, and the tool on your machine has no analytics. This website counts page views with Vercel Web Analytics and sets no cookies. [Configuration](/docs/configuration) lists what each key sends.

## What does it cost?

Nothing. Crowsnest is free and open source under the Apache-2.0 licence. You run it yourself, so your only costs are your own machine and any optional services whose keys you choose to add.

## Which projects does it work with?

It reads these lockfiles. npm projects get the most checks; coverage elsewhere is thinner.

| Lockfile | Kind of project |
|---|---|
| `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | npm |
| `poetry.lock`, `uv.lock`, `Pipfile.lock`, `requirements.txt` (exact versions) | PyPI |
| `composer.lock` | Composer (PHP) |
| `Gemfile.lock` | Bundler (Ruby) |
| `Cargo.lock` | Cargo (Rust) |
| `go.sum` | Go |

## Does it replace Dependabot or Snyk?

No. Those tools track known security bugs. Crowsnest looks at other signs: new packages, changed maintainers, names close to famous ones. Run it alongside them, not instead of them.

## Can it catch an attack nobody has seen yet?

Not always. If an attack has left no public trace, Crowsnest cannot see it. It does better on the next wave, when a package is republished or flagged somewhere it can read.

## Can I change the 0.6 stop limit?

No. `crowsnest install` stops at 0.6 and the limit is fixed. You can change the warning limit in VS Code (`crowsnest.riskThreshold`, default 0.5), which only affects what you see in the editor.

## What should I do when it says Hold?

Do not install the package, or remove it, until you have checked. Read the one-sentence reason, take the first step under "What to do", then scan again. [What to do when Crowsnest says Hold](/blog/what-to-do-when-crowsnest-says-hold) walks through it.

## Where do I open the dashboard?

At http://localhost:3000, once Crowsnest and the dashboard are running. It opens on Horizon, and the other pages are one click away in the left rail. This website is a separate app and never serves the dashboard. See [Using the dashboard](/docs/dashboard).

## Why did my scan fail?

No API keys are needed for a scan. The most common causes are a folder Docker cannot see and a folder with no lockfile. [Troubleshooting](/docs/troubleshooting) lists the messages and what to do.

## How do I report a bug?

Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose) with the Bug report form, and remove any keys first. The project is run by volunteers, so a fixed reply time is not promised.

For a security problem, do not open a public issue. Use GitHub's private reporting instead: on the repository's [Security tab](https://github.com/devampatel03/Crowsnest/security), choose **Report a vulnerability**. Only the maintainers can see it. See [Contributing](/docs/contributing).

## Who is Nib?

Nib is Crowsnest's mascot, a small crow who sits at the masthead of your project. Nib is a drawing, not a chatbot. The calls come from Crowsnest's own checks, and Nib never answers questions or runs anything. Nib appears on this website and in the dashboard, not in the command line tool, the Slack bot or the VS Code extension.

## Limits

- It does not answer questions about your own setup. [Troubleshooting](/docs/troubleshooting) covers the common faults.
- It does not promise Crowsnest catches every attack. Read [what it cannot do](/docs).
- It does not offer private support. There is no email address or chat room yet; use GitHub issues.
