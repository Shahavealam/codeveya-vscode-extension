import * as vscode from 'vscode';
import { runAgentTask, SharedDeps } from './runAgentTask';

export function registerExplainCode(deps: SharedDeps): vscode.Disposable {
  return vscode.commands.registerCommand('codeveya.explainSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    const selection = editor?.document.getText(editor.selection);
    if (!selection) {
      void vscode.window.showWarningMessage('Select code to explain first.');
      return;
    }
    await runAgentTask(deps, 'Explain this selection', 'explain');
  });
}
