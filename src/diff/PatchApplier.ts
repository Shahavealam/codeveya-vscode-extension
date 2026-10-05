import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

/** Applies validated unified diffs atomically (git apply), with per-file fallback. */
export class PatchApplier {
  constructor(private readonly workspaceRoot: string) {}

  async applyAll(patches: Array<{ path: string; unifiedDiff: string }>): Promise<void> {
    // atomic: single `git apply` for all patches
    const combined = patches.map((p) => p.unifiedDiff).join('\n');
    await this.gitApply(combined);
  }

  async applyOne(patch: { path: string; unifiedDiff: string }): Promise<void> {
    await this.gitApply(patch.unifiedDiff);
  }

  private gitApply(diff: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = execFile('git', ['apply', '--whitespace=fix', '-'], { cwd: this.workspaceRoot }, (err, _s, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      });
      child.stdin?.write(diff);
      child.stdin?.end();
    });
  }

  readCurrent(absPath: string): string | null {
    try {
      return fs.readFileSync(absPath, 'utf8');
    } catch {
      return null;
    }
  }

  resolveAbs(relPath: string): string {
    return path.join(this.workspaceRoot, path.normalize(relPath));
  }
}
