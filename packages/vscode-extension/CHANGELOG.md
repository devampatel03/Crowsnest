# Changelog

## 0.1.3

- The output channel, the activation notice and the analysis panel no longer show emoji.

## 0.1.2

- "Investigate Package Under Cursor" now shows the same call the install check gives (Hold, Watch, Clear or Not fully
  checked) with the reasons. It used to show risk 0 and "Unknown" for a package the install check blocks.

## 0.1.1

- The listing is now called "Crowsnest: Risky Package Warnings". The hover, the status bar tooltip and the report header
  use plainer wording, and the README is rewritten.
- Later versions publish from GitHub with Marketplace Trusted Publishing, so no token is stored.

## 0.1.0

First release.

- Gutter dot and wavy underline on `import` and `require` lines that point at a risky package: red for critical,
  orange for high, yellow for medium. Hover for the reasons.
- Works in JavaScript, TypeScript (and their React variants) and Python files.
- Node built-ins (`fs`, `node:path`) and the Python standard library are never sent for checking.
- Python imports are checked against PyPI, JavaScript and TypeScript imports against npm.
- Commands: scan the current file, investigate the package under the cursor, open the dashboard.
- Status bar item shows how many incidents are open, or that the backend is offline.
- Settings: `crowsnest.apiUrl`, `crowsnest.dashboardUrl`, `crowsnest.enabled`, `crowsnest.riskThreshold`.
- Changing a setting re-scans the open editors straight away.
- A backend that cannot be reached shows no flags and is retried at most every 30 seconds.
