import * as vscode from 'vscode';
import { runAgentTask, SharedDeps } from './runAgentTask';

export function registerRefactor(deps: SharedDeps): vscode.Disposable {
  return vscode.commands.registerCommand('codeveya.refactor', async () => {
    const goal = await vscode.window.showInputBox({
      prompt: 'Refactor goal (selection is attached automatically)',
      placeHolder: 'e.g. Extract method, reduce duplication',
    });
    if (!goal) return;
    await runAgentTask(deps, goal, 'refactor');
  });
}
