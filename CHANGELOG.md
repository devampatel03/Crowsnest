# Changelog

All notable changes to Crowsnest are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Dashboard with four pages: Horizon, Lookout, Hold and Log, updated live.
- Command line tool: `scan`, `investigate`, `blast-radius`, `replay`, `watch`, `install` and
  `config`. `crowsnest install` stops installs at a risk of 0.6 or above.
- Slack bot that posts serious findings and answers four slash commands.
- VS Code extension that warns on risky imports.
- Lockfile readers for npm, pnpm, Yarn, Poetry, Cargo and Go.
- Docker Compose setup. Every API key is optional.
- Security policy, code of conduct and contribution guide.

- Choose any AI model: Claude, OpenAI, Gemini, Groq, Mistral, DeepSeek, Together, xAI, OpenRouter, Ollama, LM Studio
  or any OpenAI-compatible address. `python -m packages.core.llm setup` picks one and tests it; setting a provider's
  usual key is enough. Crowsnest still runs with no model.
- Slack bot setup in one command (`npm run setup` in `packages/slack-bot`), a ready-made app manifest, and
  `npm run doctor` to check it.
- VS Code extension: Marketplace-ready package with an icon, and an end-to-end test that runs in a real VS Code.
- The command line tool is ready to publish to npm (`packages/cli/PUBLISHING.md`).

### Changed

- The dashboard console (Horizon, Lookout, Hold, Log) opens only on the machine running Crowsnest. On a public
  website those pages answer 404. Set `CROWSNEST_CONSOLE=on` to override.
- Slack bot no longer needs a signing secret, and stops with a clear message when a key is missing.
- Documentation links in the README point to the public site, https://crowsnest.co.in/docs.

### Fixed

- A model that returned an unexpected severity (for example "Critical") could stop a whole scan. Anything a model
  writes is now checked: unknown values are replaced, confidence is limited to 0 to 1, and package names must appear in
  the findings.
- A model can no longer lower the severity of a package on a known-bad list.
- With no model configured, the detection planner no longer makes a network call that was certain to fail.
- VS Code extension: Node built-ins and Python's standard library are no longer sent for checking, Python imports
  are checked against PyPI, a backend that is down is retried at most every 30 seconds, and changing a setting now
  re-scans straight away.

- Docs and blog content now read correctly when files use Windows line endings.

Version 0.1.0 has not been tagged yet. When it is, this section becomes `[0.1.0]` with its date.
