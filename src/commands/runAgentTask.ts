import * as vscode from 'vscode';
import { AgentClient } from '../agent/AgentClient';
import { WorkspaceIndexer } from '../intelligence/indexer/WorkspaceIndexer';
import { ContextSnapshotBuilder } from '../context/ContextSnapshot';
import { DiagnosticsService } from '../workspace/DiagnosticsService';
import { GitService } from '../workspace/GitService';
import { stableWorkspaceId } from '../workspace/WorkspaceService';
import { DiffPreview } from '../diff/DiffPreview';
import { PatchApplier } from '../diff/PatchApplier';
import { PatchValidator } from '../diff/PatchValidator';
import { FileService } from '../workspace/FileService';
import type { PatchFile } from '../agent/AgentProtocol';

export interface SharedDeps {
  agent: AgentClient;
  indexer: WorkspaceIndexer;
  chatProvider: { postEvent: (type: string, data: unknown) => void };
  output: vscode.OutputChannel;
}

function activeSelection(): { file?: string; text?: string } {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return {};
  const doc = editor.document;
  const sel = editor.selection;
  const text = sel && !sel.isEmpty ? doc.getText(sel) : undefined;
  const file = vscode.workspace.asRelativePath(doc.uri, false);
  return { file, text };
}

function collectDiagnostics(): Array<{ file: string; severity: string; message: string; line: number }> {
  const out: Array<{ file: string; severity: string; message: string; line: number }> = [];
  for (const [uri, diags] of vscode.languages.getDiagnostics()) {
    const file = vscode.workspace.asRelativePath(uri, false);
    for (const d of diags.slice(0, 10)) {
      out.push({ file, severity: String(d.severity), message: d.message, line: d.range.start.line });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

export async function runAgentTask(
  deps: SharedDeps,
  request: string,
  kind: 'ask' | 'explain' | 'refactor' | 'tests',
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    void vscode.window.showWarningMessage('Open a workspace folder first.');
    return;
  }
  const root = folders[0].uri.fsPath;
  const git = new GitService(root);
  const { file, text } = activeSelection();
  const diagService = new DiagnosticsService();
  const snapshot = new ContextSnapshotBuilder();

  // Local-first: relevant skeletons from symbol search on request keywords
  const keywords = request.split(/[^A-Za-z0-9_]+/).filter((w) => w.length > 2).slice(0, 8);
  const symbolHits = keywords.flatMap((k) => deps.indexer.symbols.search(k, 5)).slice(0, 30);
  const filesOfInterest = [...new Set(symbolHits.map((s) => s.file))].slice(0, 15);
  const skeletons = filesOfInterest
    .map((f) => deps.indexer.getSkeleton(f))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const ctx = snapshot.build({
    activeFile: file,
    selection: kind === 'explain' ? text : text,
    skeletons,
    symbols: symbolHits,
    diagnostics: diagService.summarize(collectDiagnostics()),
    gitStatus: (await git.status()).slice(0, 2000),
    gitDiffSummary: await git.diffSummary(),
    indexVersion: deps.indexer.version,
  });

  const tokens = snapshot.estimateTokens(ctx);
  deps.chatProvider.postEvent('context.used', { tokens, files: filesOfInterest.length });
  deps.output.appendLine(`[codeveya] ${kind} task: "${request.slice(0, 120)}" (~${tokens} ctx tokens)`);

  const input = promptText(kind, request, text);
  let taskId: string;
  try {
    taskId = await deps.agent.startTask({
      request: input,
      workspaceId: stableWorkspaceId(root),
      activeFile: file,
      selection: text?.slice(0, 8000),
      context: ctx,
    });
  } catch (err) {
    void vscode.window.showErrorMessage(`CodeVeya backend unreachable: ${(err as Error).message}`);
    return;
  }

  deps.chatProvider.postEvent('worker.status', { taskId, phase: 'PLAN', summary: 'Task started' });

  // Wire one-shot event handlers for this task
  const subs = [
    deps.agent.events.subscribe('worker.step', (e: { payload: unknown }) => {
      const p = e.payload as { taskId: string; phase: string; summary: string };
      if (p.taskId !== taskId) return;
      deps.chatProvider.postEvent('worker.status', p);
    }),
    deps.agent.events.subscribe('patch.generated', (e: { payload: unknown }) => {
      const p = e.payload as { taskId: string; patches: PatchFile[] };
      if (p.taskId !== taskId) return;
      void handlePatches(deps, root, taskId, p.patches);
    }),
    deps.agent.events.subscribe('approval.required', (e: { payload: unknown }) => {
      const p = e.payload as { taskId: string; patches: PatchFile[]; reason: string };
      if (p.taskId !== taskId) return;
      void handlePatches(deps, root, taskId, p.patches, p.reason);
    }),
    deps.agent.events.subscribe('worker.completed', (e: { payload: unknown }) => {
      const p = e.payload as { taskId: string; summary: string };
      if (p.taskId !== taskId) return;
      deps.chatProvider.postEvent('worker.status', { taskId, phase: 'DONE', summary: p.summary });
      for (const u of subs) u();
    }),
    deps.agent.events.subscribe('worker.failed', (e: { payload: unknown }) => {
      const p = e.payload as { taskId: string; error: string };
      if (p.taskId !== taskId) return;
      void vscode.window.showErrorMessage(`CodeVeya task failed: ${p.error}`);
      for (const u of subs) u();
    }),
  ];
}

function promptText(kind: string, request: string, selection?: string): string {
  switch (kind) {
    case 'explain':
      return `Explain the following code concisely:\n\n${selection ?? request}`;
    case 'refactor':
      return `Refactor (minimal unified diff, preserve behavior): ${request}${selection ? `\n\nCode:\n${selection}` : ''}`;
    case 'tests':
      return `Generate focused unit tests (unified diff only, no full rewrites): ${request}${selection ? `\n\nCode:\n${selection}` : ''}`;
    default:
      return request;
  }
}

async function handlePatches(
  deps: SharedDeps,
  root: string,
  taskId: string,
  patches: PatchFile[],
  reason?: string,
): Promise<void> {
  const files = new FileService();
  const validator = new PatchValidator(root);
  const preview = new DiffPreview();
  const applier = new PatchApplier(root);
  const git = new GitService(root);
  const autoApprove = vscode.workspace.getConfiguration('aiCodeCompanion').get<boolean>('autoApproveSafePatches', false);

  const hashMap = new Map<string, string>();
  for (const p of patches) {
    const h = files.hashFile(applier.resolveAbs(p.path));
    if (h) hashMap.set(p.path, h);
  }

  const results = patches.map((p) => ({ patch: p, ...validator.validate(p, hashMap) }));
  const invalid = results.filter((r) => !r.ok);
  if (invalid.length) {
    void vscode.window.showWarningMessage(
      `CodeVeya: ${invalid.length} patch(es) failed validation: ${invalid[0].errors.join('; ')}`,
    );
  }
  const valid = results.filter((r) => r.ok).map((r) => r.patch);
  if (!valid.length) return;

  // Show native diff for first file; list rest in chat
  const first = valid[0];
  await preview.showPatch(first.path, applier.resolveAbs(first.path), first.unifiedDiff);
  const { additions, deletions } = preview.additionsDeletions(first.unifiedDiff);
  deps.chatProvider.postEvent('diff.ready', {
    taskId,
    files: valid.map((p) => p.path),
    additions,
    deletions,
    reason,
  });

  const needsApproval = !autoApprove || !valid.every((p) => validator.isSafePatch(p));
  let approved = !needsApproval;
  if (needsApproval) {
    const pick = await vscode.window.showInformationMessage(
      `Apply ${valid.length} file(s) from CodeVeya?${reason ? ` (${reason})` : ''}`,
      { modal: true },
      'Apply',
      'Reject',
    );
    approved = pick === 'Apply';
  }
  if (!approved) {
    deps.chatProvider.postEvent('worker.status', { taskId, phase: 'APPLY', summary: 'Rejected by user' });
    return;
  }

  const checkpoint = await git.checkpoint();
  try {
    await applier.applyAll(valid);
    deps.chatProvider.postEvent('worker.status', { taskId, phase: 'APPLY', summary: `Applied ${valid.length} file(s)` });
    deps.output.appendLine(`[codeveya] applied ${valid.length} file(s), HEAD was ${checkpoint.head}`);
    const rollback = await vscode.window.showInformationMessage('Changes applied. Roll back?', 'Rollback', 'Keep');
    if (rollback === 'Rollback') {
      await git.rollback(checkpoint, valid.map((p) => p.path));
      void vscode.window.showInformationMessage('Rolled back to pre-apply checkpoint.');
    }
  } catch (err) {
    void vscode.window.showErrorMessage(`Apply failed: ${(err as Error).message}. Rolling back.`);
    try {
      await git.rollback(checkpoint, valid.map((p) => p.path));
    } catch {
      // ignore
    }
  }
}
