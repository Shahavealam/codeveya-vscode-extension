import * as vscode from 'vscode';
import { runAgentTask, SharedDeps } from './runAgentTask';

export function registerAskAgent(deps: SharedDeps): vscode.Disposable {
  return vscode.commands.registerCommand('codeveya.ask', async () => {
    const request = await vscode.window.showInputBox({
      prompt: 'Ask CodeVeya (local context is attached automatically)',
      placeHolder: 'e.g. Add refresh-token rotation to AuthService',
    });
    if (!request) return;
    await runAgentTask(deps, request, 'ask');
  });
}
