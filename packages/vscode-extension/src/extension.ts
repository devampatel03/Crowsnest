/**
 * extension.ts — Main entry point for the Crowsnest VS Code extension
 *
 * Lifecycle:
 *  activate()   — called by VS Code when the extension first becomes active
 *  deactivate() — called when VS Code shuts down or the extension is disabled
 *
 * Responsibilities:
 *  1. Instantiate the API client
 *  2. Register the three commands
 *  3. Start the import decorator provider
 *  4. Start the status bar item
 *  5. Wire configuration-change events
 */

import * as vscode from 'vscode';
import { CrowsnestClient } from './client';
import { ImportDecoratorProvider } from './decorator';
import { CrowsnestStatusBar } from './statusBar';
import {
  scanFileCommand,
  investigatePackageCommand,
  openDashboardCommand,
  disposeOutputChannel,
} from './commands';

// ─────────────────────────────────────────────
// Module-level references (kept for deactivate)
// ─────────────────────────────────────────────

let decoratorProvider: ImportDecoratorProvider | undefined;
let statusBar: CrowsnestStatusBar | undefined;

// ─────────────────────────────────────────────
// activate
// ─────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Crowsnest] Extension activating…');

  // ── 1. API client ─────────────────────────────
  const client = new CrowsnestClient();

  // ── 2. Import decorator ───────────────────────
  decoratorProvider = new ImportDecoratorProvider(client, context);

  // ── 3. Status bar ─────────────────────────────
  statusBar = new CrowsnestStatusBar(client, context);

  // ── 4. Commands ───────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('crowsnest.scanFile', () => {
      return scanFileCommand(client, vscode.window.activeTextEditor);
    }),

    vscode.commands.registerCommand('crowsnest.investigatePackage', () => {
      return investigatePackageCommand(client, vscode.window.activeTextEditor);
    }),

    vscode.commands.registerCommand('crowsnest.openDashboard', () => {
      return openDashboardCommand();
    })
  );

  // ── 5. React to configuration changes ─────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('crowsnest')) {
        // Clear cached veto results so the new threshold / URL takes effect
        decoratorProvider?.clearCache();

        // Force a re-scan of the active editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          // Trigger a tiny edit-document event by scheduling a re-decoration.
          // We do this by emitting a "fake" change notification via the private
          // scheduleUpdate path — the cleanest public surface is to just call
          // the command indirectly. Instead, we rely on the fact that
          // onDidChangeConfiguration fires after the new config is readable, so
          // the decorator will pick up the new threshold on its next run.
          // The simplest safe approach: clear then re-decorate via a no-op edit.
          void vscode.commands.executeCommand('editor.action.triggerSuggest').then(
            () => { /* ignore */ },
            () => { /* ignore */ }
          );
        }

        // Refresh status bar to pick up new API URL
        statusBar?.refresh();
      }
    })
  );

  // ── 6. Welcome message on first install ───────
  const hasShownWelcome = context.globalState.get<boolean>('crowsnest.welcomeShown');
  if (!hasShownWelcome) {
    void context.globalState.update('crowsnest.welcomeShown', true);
    vscode.window
      .showInformationMessage(
        '⛵ Crowsnest is active. Supply chain risk warnings will appear on import lines.',
        'Open Dashboard',
        'Learn More'
      )
      .then((choice) => {
        if (choice === 'Open Dashboard') {
          void vscode.commands.executeCommand('crowsnest.openDashboard');
        }
      });
  }

  console.log('[Crowsnest] Extension activated successfully.');
}

// ─────────────────────────────────────────────
// deactivate
// ─────────────────────────────────────────────

export function deactivate(): void {
  console.log('[Crowsnest] Extension deactivating…');

  decoratorProvider?.dispose();
  decoratorProvider = undefined;

  statusBar?.dispose();
  statusBar = undefined;

  disposeOutputChannel();

  console.log('[Crowsnest] Extension deactivated.');
}
