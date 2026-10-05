import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Shows backend unified diffs in VS Code's native diff editor (no blind overwrites). */
export class DiffPreview {
  async showPatch(relPath: string, absPath: string, unifiedDiff: string): Promise<void> {
    const tmp = path.join(os.tmpdir(), `codeveya-${Date.now()}-${path.basename(relPath)}`);
    let original = '';
    try {
      original = fs.readFileSync(absPath, 'utf8');
    } catch {
      original = '';
    }
    const patched = this.naiveApply(original, unifiedDiff);
    fs.writeFileSync(tmp, patched, 'utf8');
    const left = vscode.Uri.file(absPath);
    const right = vscode.Uri.file(tmp).with({ scheme: 'untitled' });
    // Simpler robust path: open side-by-side text docs
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(tmp));
    await vscode.window.showTextDocument(doc, { preview: true });
    await vscode.commands.executeCommand('vscode.diff', left, vscode.Uri.file(tmp), `CodeVeya: ${relPath}`);
    void right;
  }

  /** Minimal hunk applier for preview only (authoritative apply uses git apply). */
  naiveApply(original: string, diff: string): string {
    const lines = original.split('\n');
    const out: string[] = [];
    let cursor = 0;
    const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
    for (const line of diff.split('\n')) {
      const h = line.match(hunkHeader);
      if (h) {
        const start = Math.max(0, Number(h[1]) - 1);
        while (cursor < start) {
          out.push(lines[cursor++] ?? '');
        }
        continue;
      }
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) out.push(line.slice(1));
      else if (line.startsWith('-')) cursor += 1;
      else if (line.startsWith(' ')) {
        out.push(lines[cursor++] ?? line.slice(1));
      }
    }
    while (cursor < lines.length) out.push(lines[cursor++]);
    return out.join('\n');
  }

  additionsDeletions(diff: string): { additions: number; deletions: number } {
    let additions = 0;
    let deletions = 0;
    for (const line of diff.split('\n')) {
      if (line.startsWith('+++') || line.startsWith('---')) continue;
      if (line.startsWith('+')) additions += 1;
      else if (line.startsWith('-')) deletions += 1;
    }
    return { additions, deletions };
  }
}
