import * as vscode from 'vscode';
import { AgentClient } from './agent/AgentClient';
import { WorkspaceIndexer } from './intelligence/indexer/WorkspaceIndexer';
import { FileWatcher } from './intelligence/indexer/FileWatcher';
import { IndexScheduler } from './intelligence/indexer/IndexScheduler';
import { ContextCache } from './context/ContextCache';
import { TelemetryClient } from './telemetry/TelemetryClient';
import { ChatWebviewProvider } from './ui/ChatWebviewProvider';
import { StatusBar } from './ui/StatusBar';
import { registerAskAgent } from './commands/askAgent';
import { registerExplainCode } from './commands/explainCode';
import { registerRefactor } from './commands/refactor';
import { registerGenerateTests } from './commands/generateTests';
import { registerIndexWorkspace, registerReviewChanges } from './commands/indexWorkspace';

let disposables: vscode.Disposable[] = [];
let agent: AgentClient | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('CodeVeya');
  const config = vscode.workspace.getConfiguration('aiCodeCompanion');
  const folders = vscode.workspace.workspaceFolders;
  const root = folders?.[0]?.uri.fsPath;
  if (!root) {
    output.appendLine('[codeveya] no workspace folder; commands remain available but indexing is disabled.');
  }

  const wsUrl = config.get<string>('websocketUrl', 'ws://localhost:8000/ws/agent');
  const maxConcurrency = config.get<number>('maxLocalIndexConcurrency', 4);
  const exclude = config.get<string[]>('excludePatterns', []);
  const telemetryEnabled = config.get<boolean>('enableTelemetry', false);

  // Auth: prefer SecretStorage, fall back to config
  let authToken: string = ((await context.secrets.get('codeveya.authToken')) ?? config.get<string>('authToken') ?? '');
  if (config.get<string>('authToken', '')) {
    // migrate plain-text setting into SecretStorage once, then blank the setting
    try {
      await context.secrets.store('codeveya.authToken', config.get<string>('authToken', ''));
      await config.update('authToken', '', vscode.ConfigurationTarget.Global);
      authToken = (await context.secrets.get('codeveya.authToken')) ?? authToken;
    } catch {
      // ignore
    }
  }

  agent = new AgentClient({ url: wsUrl, authToken, enableAutoReconnect: true });
  agent.events.subscribe('worker.step', (e) => {
    const p = (e as { payload: { summary: string; phase: string } }).payload;
    output.appendLine(`[worker] ${p.phase}: ${p.summary}`);
  });

  const indexer = new WorkspaceIndexer(root ?? '', maxConcurrency, exclude);
  const cache = new ContextCache();
  void cache;
  const telemetry = new TelemetryClient({ enabled: telemetryEnabled });
  const chatProvider = new ChatWebviewProvider(output);
  const statusBar = new StatusBar();

  const deps = { agent, indexer, chatProvider, output };

  // Lazy background indexing: do NOT block extension host
  if (root) {
    void (async () => {
      try {
        const stats = await indexer.fullIndex();
        output.appendLine(`[index] ${stats.filesIndexed} files in ${stats.durationMs}ms (v${stats.version})`);
      } catch (err) {
        output.appendLine(`[index] failed: ${(err as Error).message}`);
      }
    })();

    const scheduler = new IndexScheduler({
      concurrency: maxConcurrency,
      process: (file) => indexer.updateFile(file, (affected) => cache.invalidateFiles(affected)),
    });
    const watcher = new FileWatcher({
      debounceMs: 500,
      onBatch: (events) => {
        for (const e of events) {
          const fsPath = vscode.Uri.parse(e.uri).fsPath;
          if (e.kind === 'delete') indexer.removeFile(fsPath);
          else scheduler.enqueue(fsPath);
        }
      },
    });
    const fsWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    fsWatcher.onDidChange((u) => watcher.notify(u.toString(), 'change'));
    fsWatcher.onDidCreate((u) => watcher.notify(u.toString(), 'create'));
    fsWatcher.onDidDelete((u) => watcher.notify(u.toString(), 'delete'));
    disposables.push(fsWatcher, { dispose: () => watcher.dispose() });
  }

  disposables.push(
    vscode.window.registerWebviewViewProvider(ChatWebviewProvider.viewId, chatProvider),
    registerAskAgent(deps),
    registerExplainCode(deps),
    registerRefactor(deps),
    registerGenerateTests(deps),
    registerIndexWorkspace(indexer),
    registerReviewChanges(),
    statusBar,
    output,
  );
  context.subscriptions.push(...disposables);
  telemetry.track('extension.activated', {});
  output.appendLine('[codeveya] activated (lazy; background indexing started)');
}

export function deactivate(): void {
  for (const d of disposables) {
    try {
      d.dispose();
    } catch {
      // ignore
    }
  }
  disposables = [];
  agent?.dispose();
  agent = null;
}
