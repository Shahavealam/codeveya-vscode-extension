import * as path from 'path';
import type { PatchFile } from '../agent/AgentProtocol';

/** Validates backend-returned unified diffs before preview/apply. */
export class PatchValidator {
  constructor(private readonly workspaceRoot: string) {}

  validate(
    patch: PatchFile,
    currentHashByFile: Map<string, string>,
  ): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    const normalized = path.normalize(patch.path).replace(/^\.\//, '');
    if (path.isAbsolute(patch.path) || normalized.startsWith('..') || normalized.includes('\0')) {
      errors.push(`unsafe path: ${patch.path}`);
    }
    const abs = path.join(this.workspaceRoot, normalized);
    if (!abs.startsWith(this.workspaceRoot)) errors.push(`path escapes workspace: ${patch.path}`);
    if (!patch.unifiedDiff || !patch.unifiedDiff.includes('@@')) {
      errors.push('patch is not a unified diff (missing @@ hunks)');
    }
    if (patch.unifiedDiff.length > 200_000) errors.push('patch too large');
    const expected = patch.expectedHash;
    if (expected) {
      const current = currentHashByFile.get(normalized);
      if (current && current !== expected) {
        errors.push(`workspace changed since patch generation (expected ${expected}, have ${current})`);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  isSafePatch(patch: PatchFile): boolean {
    // comment-only / test-only patches are considered low-risk
    if (/^tests?\//.test(patch.path) || /\.test\.\w+$/.test(patch.path)) return true;
    const added = patch.unifiedDiff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    if (!added.length) return false;
    return added.every((l) => /^\+\s*(\/\/|#|\*|\/\*|<!--|$)/.test(l));
  }
}
