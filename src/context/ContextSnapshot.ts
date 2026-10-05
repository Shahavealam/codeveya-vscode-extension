import type { TaskContext, FileSkeleton, SymbolRecord, DiagnosticSummary } from '../agent/AgentProtocol';
import { SecretRedactor } from './SecretRedactor';

export interface SnapshotInput {
  activeFile?: string;
  selection?: string;
  userSelectedFiles?: string[];
  skeletons: FileSkeleton[];
  symbols: SymbolRecord[];
  diagnostics: DiagnosticSummary[];
  gitStatus?: string;
  gitDiffSummary?: string;
  indexVersion?: number;
  capabilities?: string[];
  workspaceId?: string;
}

/** Builds the minimal context snapshot sent to the backend (never full repo). */
export class ContextSnapshotBuilder {
  private redactor = new SecretRedactor();

  build(input: SnapshotInput): TaskContext {
    const redactedSelection = input.selection
      ? this.redactor.redact(input.selection.slice(0, 8000)).text
      : undefined;
    void redactedSelection;
    const diagnostics = input.diagnostics.slice(0, 30).map((d) => ({
      ...d,
      message: this.redactor.redact(d.message).text,
    }));
    return {
      selectedFiles: (input.userSelectedFiles ?? []).slice(0, 20),
      selectedSymbols: input.symbols.slice(0, 100).map((s) => s.name),
      diagnostics,
      skeletons: input.skeletons.slice(0, 40),
      symbols: input.symbols.slice(0, 100).map((s) => ({
        ...s,
        signature: s.signature?.slice(0, 300),
      })),
      gitStatus: input.gitStatus?.slice(0, 2000),
      gitDiffSummary: input.gitDiffSummary?.slice(0, 2000),
      indexVersion: input.indexVersion,
      capabilities: input.capabilities ?? ['patch.apply', 'command.execute'],
    };
  }

  estimateTokens(ctx: TaskContext): number {
    const json = JSON.stringify(ctx);
    return Math.ceil(json.length / 4);
  }
}
