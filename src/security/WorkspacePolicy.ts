import * as path from 'path';

/** Rejects paths outside the workspace; blocks secrets/keys. */
export class WorkspacePolicy {
  constructor(private readonly root: string) {}

  isPathAllowed(relOrAbs: string): boolean {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(this.root, relOrAbs);
    const norm = path.normalize(abs);
    if (!norm.startsWith(path.normalize(this.root))) return false;
    if (/(^|\/)\.env(\..*)?$|\.pem$|\.key$|credentials/i.test(norm)) return false;
    return true;
  }

  assertAllowed(p: string): void {
    if (!this.isPathAllowed(p)) throw new Error(`WorkspacePolicy: path not allowed: ${p}`);
  }
}
