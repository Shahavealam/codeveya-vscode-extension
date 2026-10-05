import * as vscode from 'vscode';
import { WorkspaceIndexer } from '../intelligence/indexer/WorkspaceIndexer';

export function registerIndexWorkspace(indexer: WorkspaceIndexer): vscode.Disposable {
  return vscode.commands.registerCommand('codeveya.indexWorkspace', async () => {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'CodeVeya: indexing workspace' },
      async (progress) => {
        const stats = await indexer.fullIndex((done, total) => {
          progress.report({ message: `${done}/${total} files`, increment: total ? 100 / total : undefined });
        });
        void vscode.window.showInformationMessage(
          `CodeVeya indexed ${stats.filesIndexed} files in ${stats.durationMs}ms`,
        );
      },
    );
  });
}

export function registerReviewChanges(): vscode.Disposable {
  return vscode.commands.registerCommand('codeveya.reviewChanges', async () => {
    await vscode.commands.executeCommand('git.openChange', ...( [] as unknown as [unknown] ));
    // Fallback: open SCM view
    await vscode.commands.executeCommand('workbench.view.scm').then(
      () => undefined,
      () => undefined,
    );
  });
}
