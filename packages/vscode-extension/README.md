# crowsnest-vscode

Inline gutter warnings on `import`/`require` lines (JS/TS/JSX/TSX/Python)
flagging risky packages — hover for the reasoning, plus commands to scan the
current file, investigate the package under the cursor, or open the
Crowsnest dashboard.

## Running standalone

```bash
cd packages/vscode-extension
npm install

npm run dev          # tsc -watch -p ./ (alias of `watch`)
npm run watch         # tsc -watch -p ./
npm run build          # npm run compile (tsc -p ./)
npm run compile         # tsc -p ./
npm run typecheck        # tsc --noEmit -p ./
```

To try it out: open this folder in its own VS Code window, run
`npm install` and `npm run compile`, then press **F5** to launch an
Extension Development Host window. Open a JS/TS/Python file with a
suspicious import to see the gutter decoration and hover text.

## Configuration

This extension has no `process.env` variables — it's configured entirely
through VS Code settings (`contributes.configuration` in `package.json`,
read via `vscode.workspace.getConfiguration('crowsnest')` in `src/client.ts`
and `src/commands.ts`):

- `crowsnest.apiUrl` — Crowsnest API base URL (default
  `http://localhost:8000`)
- `crowsnest.enabled` — enable/disable inline risk warnings (default `true`)
- `crowsnest.riskThreshold` — risk score threshold (0–1) for showing a
  warning (default `0.5`)

The extension needs the Crowsnest FastAPI backend reachable at
`crowsnest.apiUrl` for scans and investigations to return results.
