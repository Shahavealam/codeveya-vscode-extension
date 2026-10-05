/** Workspace metadata helpers (VS Code–agnostic core; extension.ts injects vscode APIs). */
export interface WorkspaceMetadata {
  workspaceId: string;
  rootPath: string;
  languageIds: string[];
  indexVersion: number;
}

export function stableWorkspaceId(rootPath: string): string {
  let h = 0;
  for (const c of rootPath) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `workspace_${h.toString(16)}`;
}

export class WorkspaceService {
  constructor(private readonly rootPath: string) {}

  metadata(indexVersion: number, languageIds: string[] = []): WorkspaceMetadata {
    return {
      workspaceId: stableWorkspaceId(this.rootPath),
      rootPath: this.rootPath,
      languageIds,
      indexVersion,
    };
  }
}
