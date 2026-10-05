import * as vscode from 'vscode';

/** Lightweight status-bar worker indicator (<100ms local updates). */
export class StatusBar {
  private item: vscode.StatusBarItem;
  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.text = '$(sparkle) CodeVeya';
    this.item.command = 'codeveya.ask';
    this.item.show();
  }

  setPhase(phase: string, summary?: string): void {
    this.item.text = `$(sync~spin) CodeVeya ${phase}`;
    if (summary) this.item.tooltip = summary;
  }

  setIdle(): void {
    this.item.text = '$(sparkle) CodeVeya';
    this.item.tooltip = 'AI Code Companion — Ask (click)';
  }

  dispose(): void {
    this.item.dispose();
  }
}
