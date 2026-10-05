import { execFile } from 'child_process';

export interface GitCheckpoint {
  head: string;
  status: string;
  changedFiles: string[];
  branch?: string;
}

/** Git CLI wrapper used before/after multi-file applies (checkpoint + rollback). */
export class GitService {
  constructor(private readonly cwd: string) {}

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile('git', args, { cwd: this.cwd, timeout: 10000 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });
  }

  async status(): Promise<string> {
    try {
      return await this.run(['status', '--porcelain']);
    } catch {
      return '';
    }
  }

  async head(): Promise<string> {
    try {
      return (await this.run(['rev-parse', 'HEAD'])).trim();
    } catch {
      return 'unknown';
    }
  }

  async checkpoint(): Promise<GitCheckpoint> {
    const [head, status] = await Promise.all([this.head(), this.status()]);
    const changedFiles = status
      .split('\n')
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
    return { head, status, changedFiles };
  }

  async createCheckpointBranch(name: string): Promise<string> {
    const branch = `codeveya/${name}-${Date.now()}`;
    await this.run(['checkout', '-b', branch]);
    return branch;
  }

  async diffSummary(): Promise<string> {
    try {
      const out = await this.run(['diff', '--stat']);
      return out.slice(0, 4000);
    } catch {
      return '';
    }
  }

  /** Roll back to checkpoint HEAD for listed files only (never discards unrelated changes blindly). */
  async rollback(checkpoint: GitCheckpoint, files: string[]): Promise<void> {
    if (!files.length) return;
    // restore listed files to checkpoint HEAD state
    await this.run(['checkout', checkpoint.head, '--', ...files]);
  }
}
