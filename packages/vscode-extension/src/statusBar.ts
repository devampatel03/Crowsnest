/**
 * statusBar.ts — Crowsnest status bar item
 *
 * Shows a persistent shield icon in the VS Code status bar with the current
 * number of active incidents. Falls back to "offline" styling when the
 * Crowsnest API cannot be reached.
 */

import * as vscode from 'vscode';
import { CrowsnestClient } from './client';

// Refresh interval in milliseconds (60 seconds)
const REFRESH_INTERVAL_MS = 60_000;

export class CrowsnestStatusBar {
  private readonly item: vscode.StatusBarItem;
  private readonly client: CrowsnestClient;
  private timer: NodeJS.Timeout | undefined;

  constructor(client: CrowsnestClient, context: vscode.ExtensionContext) {
    this.client = client;

    // Create the status bar item, aligned to the left at priority 100
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'crowsnest.openDashboard';
    this.item.tooltip = 'Crowsnest Supply Chain Sentinel — click to open dashboard';

    // Register for disposal
    context.subscriptions.push(this.item);

    // Show immediately then start polling
    this.item.show();
    this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);

    // Also stop the timer when the extension is deactivated
    context.subscriptions.push({
      dispose: () => {
        if (this.timer) {
          clearInterval(this.timer);
        }
      },
    });
  }

  /** Force an immediate refresh — useful after commands that affect API state. */
  async refresh(): Promise<void> {
    const stats = await this.client.getStats();

    if (!stats) {
      // API is unreachable
      this.item.text = '$(shield) Crowsnest (offline)';
      this.item.color = new vscode.ThemeColor('descriptionForeground');
      this.item.backgroundColor = undefined;
      return;
    }

    // API is healthy
    this.item.color = undefined; // reset to default theme colour

    if (stats.activeIncidents > 0) {
      this.item.text = `$(shield) Crowsnest $(warning) ${stats.activeIncidents}`;
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.text = '$(shield) Crowsnest $(check)';
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.item.dispose();
  }
}
