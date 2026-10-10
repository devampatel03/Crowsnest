---
title: Contributing
description: "Help improve Crowsnest. Report a bug, ask for a feature or send a change. How the issue forms, pull requests and automatic checks work, in six steps."
slug: contributing
order: 11
section: Community
updated: 2026-10-07
howTo: true
question: How do I contribute to Crowsnest?
answer: Open a GitHub issue with the Bug report or Feature request form, or send a pull request from a branch off main. Keep each change to one thing, run the checks on your machine, and say what changed, why and how you checked it.
facts:
  - "Licence: Apache-2.0 (LICENSE file, 2026-10-07)."
  - "Two issue forms: Bug report and Feature request (.github issue forms, 2026-10-07)."
  - "Automatic checks on every pull request run the Python tests and the JavaScript lint, type check, build and tests (.github/workflows/ci.yml, 2026-10-07)."
related:
  - /docs/installation
  - /docs/troubleshooting
  - /docs/faq
  - /docs
---

Crowsnest is open source under Apache-2.0, and you are welcome to help. Report a bug, suggest a feature, or send a change. The code and design notes live in the repository.

## How do I report a bug?

Open an issue on [GitHub](https://github.com/devampatel03/Crowsnest/issues/new/choose) with the **Bug report** form. Say what you expected and what happened, give steps to repeat it, and include your system: your operating system, your Python and Node versions, and whether you use Docker or run from source. Paste logs with keys removed. A lockfile snippet that reproduces the problem gets fixed faster.

## How do I ask for a feature?

Open an issue with the **Feature request** form. Describe the problem before the fix. Crowsnest's scope is checking the packages in your lockfile; ideas outside that may suit a separate tool.

## How do I send a change?

1. **Fork the repository**, or branch from `main` if you have access.
2. **Name the branch** for what it does, such as `fix/lockfile-v3-parsing`.
3. **Keep the change to one thing.**
4. **Run the checks on your machine** (below).
5. **Open a pull request.** Say what changed, why, and how you checked it. Link the issue.
6. **Wait for a review.** A maintainer will review it and may ask for changes.

## Which checks should I run?

```bash
pytest packages/core/tests
pnpm run lint
pnpm run typecheck
pnpm run test
```

The same kind of checks run automatically on every pull request, plus a build. A change needs them green before it can merge. Commit messages have no fixed format; explain why, not only what.

## Where are the technical notes?

How Crowsnest is built is documented in the repository, not on this site. Start with `README.md` and `CONTRIBUTING.md` at the repository root.

## What this does not do

- It does not give you a way to reach the maintainers privately. There is no contact address yet; use [GitHub issues](https://github.com/devampatel03/Crowsnest/issues).
- It does not promise a reply time or that every change is accepted.
- It does not replace the [Troubleshooting](/docs/troubleshooting) page. Check there first for a known fault.

New to Crowsnest? Start with the [Introduction](/docs), then the [Installation](/docs/installation) page, and read the [FAQ](/docs/faq).

**A good bug report is a contribution. So is a doc fix.**
