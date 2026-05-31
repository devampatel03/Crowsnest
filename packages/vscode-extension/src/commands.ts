/**
 * commands.ts — VS Code command handlers for Crowsnest
 *
 * Three commands:
 *  1. crowsnest.scanFile           — scans all imports in the active editor
 *  2. crowsnest.investigatePackage — deep investigation of the package under the cursor
 *  3. crowsnest.openDashboard      — opens the web dashboard in the system browser
 */

import * as vscode from 'vscode';
import { CrowsnestClient } from './client';
import { showInvestigationWebview } from './webview';
import { extractPackageName } from './decorator';

// ─────────────────────────────────────────────
// Output channel (shared across calls)
// ─────────────────────────────────────────────

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('Crowsnest');
  }
  return outputChannel;
}

// ─────────────────────────────────────────────
// 1. Scan File Command
// ─────────────────────────────────────────────

/**
 * Scans every import/require/from statement in the current file and prints
 * the risk assessment for each package to the Crowsnest output channel.
 */
export async function scanFileCommand(
  client: CrowsnestClient,
  editor: vscode.TextEditor | undefined
): Promise<void> {
  if (!editor) {
    vscode.window.showWarningMessage('Crowsnest: No active editor to scan.');
    return;
  }

  const channel = getOutputChannel();
  channel.show(true); // preserveViewColumn=true so it doesn't steal focus

  const languageId = editor.document.languageId;
  const text = editor.document.getText();
  const lines = text.split('\n');
  const packages = new Set<string>();

  channel.appendLine('');
  channel.appendLine(`═══════════════════════════════════════════════════════`);
  channel.appendLine(`  Crowsnest — Scan: ${editor.document.fileName}`);
  channel.appendLine(`  Language: ${languageId}  |  ${new Date().toLocaleTimeString()}`);
  channel.appendLine(`═══════════════════════════════════════════════════════`);

  // Collect unique package names from every line
  for (const line of lines) {
    const pkg = extractPackageName(line, languageId);
    if (pkg) {
      packages.add(pkg);
    }
  }

  if (packages.size === 0) {
    channel.appendLine('  No external package imports found.');
    channel.appendLine('');
    return;
  }

  channel.appendLine(`  Found ${packages.size} unique package(s). Checking…`);
  channel.appendLine('');

  const threshold = vscode.workspace
    .getConfiguration('crowsnest')
    .get<number>('riskThreshold', 0.5);

  let atRiskCount = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Crowsnest: scanning ${packages.size} packages…`,
      cancellable: false,
    },
    async (progress) => {
      let done = 0;
      for (const pkg of packages) {
        const result = await client.vetoCheck(pkg);
        done++;
        progress.report({
          message: `${done}/${packages.size} — ${pkg}`,
          increment: (1 / packages.size) * 100,
        });

        if (!result) {
          channel.appendLine(`  ⚪  ${pkg}  (API unreachable)`);
          continue;
        }

        const pct = Math.round(result.probability * 100);
        const icon =
          result.probability > 0.8
            ? '🔴'
            : result.probability > 0.6
            ? '🟠'
            : result.probability > threshold
            ? '🟡'
            : '🟢';

        channel.appendLine(`  ${icon}  ${pkg}  —  risk ${pct}%`);

        if (result.probability > threshold) {
          atRiskCount++;
          for (const signal of result.signals) {
            channel.appendLine(`       • ${signal}`);
          }
        }
      }
    }
  );

  channel.appendLine('');
  channel.appendLine(`  Summary: ${atRiskCount} package(s) exceed threshold (${Math.round(threshold * 100)}%)`);
  channel.appendLine('');

  if (atRiskCount > 0) {
    vscode.window
      .showWarningMessage(
        `Crowsnest: ${atRiskCount} risky package(s) found. See Output panel for details.`,
        'Show Output'
      )
      .then((choice) => {
        if (choice === 'Show Output') {
          channel.show();
        }
      });
  } else {
    vscode.window.showInformationMessage('Crowsnest: All packages look clean! ✅');
  }
}

// ─────────────────────────────────────────────
// 2. Investigate Package Command
// ─────────────────────────────────────────────

/**
 * Reads the word under the cursor (or asks the user), calls the investigation
 * API, and displays the results in a rich WebviewPanel.
 */
export async function investigatePackageCommand(
  client: CrowsnestClient,
  editor: vscode.TextEditor | undefined
): Promise<void> {
  // Step 1 — Determine the package name ─────────
  let packageName: string | undefined;

  if (editor) {
    // Try to extract from the line under the cursor first
    const line = editor.document.lineAt(editor.selection.active.line).text;
    const linePackage = extractPackageName(line, editor.document.languageId);

    if (linePackage) {
      packageName = linePackage;
    } else {
      // Fall back to the word at the cursor position
      const wordRange = editor.document.getWordRangeAtPosition(
        editor.selection.active,
        /[@\w/.-]+/
      );
      if (wordRange) {
        packageName = editor.document.getText(wordRange);
      }
    }
  }

  // If we still don't have a name, ask the user
  if (!packageName) {
    packageName = await vscode.window.showInputBox({
      prompt: 'Crowsnest: Enter package name to investigate',
      placeHolder: 'e.g. lodash or @org/pkg',
      validateInput: (v) => (v.trim() ? null : 'Package name cannot be empty'),
    });
  }

  if (!packageName) {
    return; // user cancelled
  }

  // Step 2 — Call API ───────────────────────────
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Crowsnest: investigating ${packageName}…`,
      cancellable: false,
    },
    async () => {
      const result = await client.investigatePackage(packageName!);

      if (!result) {
        vscode.window.showErrorMessage(
          'Crowsnest: Could not reach the API. Is the backend running?'
        );
        return;
      }

      showInvestigationWebview(result, packageName!);
    }
  );
}

// ─────────────────────────────────────────────
// 3. Open Dashboard Command
// ─────────────────────────────────────────────

/**
 * Opens the Crowsnest web dashboard in the system's default browser.
 */
export async function openDashboardCommand(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('crowsnest');
  const apiUrl = cfg.get<string>('apiUrl', 'http://localhost:8000');

  // Derive the frontend URL — conventionally on port 3000
  let dashboardUrl: string;
  try {
    const url = new URL(apiUrl);
    url.port = '3000';
    url.pathname = '/';
    dashboardUrl = url.toString();
  } catch {
    dashboardUrl = 'http://localhost:3000';
  }

  await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
}

/** Dispose the output channel — called on extension deactivate. */
export function disposeOutputChannel(): void {
  outputChannel?.dispose();
  outputChannel = undefined;
}
