// Minimal stand-in for the `vscode` API: only what the unit-tested modules touch at import/construct time.
export const config = { apiUrl: 'http://localhost:8000' };

export const workspace = {
  getConfiguration: () => ({
    get: (key: string, fallback: unknown) => (key === 'apiUrl' ? config.apiUrl : fallback),
  }),
  onDidChangeConfiguration: () => ({ dispose() {} }),
  onDidChangeTextDocument: () => ({ dispose() {} }),
  onDidOpenTextDocument: () => ({ dispose() {} }),
};

export const window = {
  createTextEditorDecorationType: () => ({ dispose() {} }),
  onDidChangeActiveTextEditor: () => ({ dispose() {} }),
  activeTextEditor: undefined,
};

export const OverviewRulerLane = { Right: 4 };
export const Uri = { parse: (s: string) => ({ toString: () => s }) };
