/**
 * Main entry point for the Crowsnest VS Code extension
 *
 * Creates the API client, the import decorator and the status bar item, registers the three commands, and re-scans
 * when a Crowsnest setting changes.
 */

import * as vscode from 'vscode';
import { CrowsnestClient } from './client';
import { ImportDecoratorProvider, AppliedFlag } from './decorator';
import { CrowsnestStatusBar } from './statusBar';
import {
  scanFileCommand,
  investigatePackageCommand,
  openDashboardCommand,
  disposeOutputChannel,
} from './commands';

let decoratorProvider: ImportDecoratorProvider | undefined;
let statusBar: CrowsnestStatusBar | undefined;

const REPO_URL = 'https://github.com/devampatel03/Crowsnest';

export interface CrowsnestExtensionApi {
  getAppliedFlags(uri: string): readonly AppliedFlag[];
}

export function activate(context: vscode.ExtensionContext): CrowsnestExtensionApi {
  console.log('[Crowsnest] Extension activating…');

  const client = new CrowsnestClient();

  decoratorProvider = new ImportDecoratorProvider(client, context);

  statusBar = new CrowsnestStatusBar(client, context);

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

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('crowsnest')) {
        // Clear cached veto results so the new threshold / URL takes effect, then re-scan what is on screen
        decoratorProvider?.clearCache();
        decoratorProvider?.refresh();

        // Refresh status bar to pick up new API URL
        statusBar?.refresh();
      }
    })
  );

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
        } else if (choice === 'Learn More') {
          void vscode.env.openExternal(vscode.Uri.parse(REPO_URL));
        }
      });
  }

  console.log('[Crowsnest] Extension activated successfully.');

  // Read-only view for the integration tests: what is flagged in a document right now.
  return {
    getAppliedFlags: (uri: string) => decoratorProvider?.getAppliedFlags(uri) ?? [],
  };
}

export function deactivate(): void {
  console.log('[Crowsnest] Extension deactivating…');

  decoratorProvider?.dispose();
  decoratorProvider = undefined;

  statusBar?.dispose();
  statusBar = undefined;

  disposeOutputChannel();

  console.log('[Crowsnest] Extension deactivated.');
}
