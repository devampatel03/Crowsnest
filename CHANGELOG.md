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

### Fixed

- Docs and blog content now read correctly when files use Windows line endings.

Version 0.1.0 has not been tagged yet. When it is, this section becomes `[0.1.0]` with its date.
