import * as vscode from 'vscode';
import { runAgentTask, SharedDeps } from './runAgentTask';

export function registerGenerateTests(deps: SharedDeps): vscode.Disposable {
  return vscode.commands.registerCommand('codeveya.generateTests', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Open a file to generate tests for.');
      return;
    }
    await runAgentTask(deps, `Generate tests for ${editor.document.fileName}`, 'tests');
  });
}
