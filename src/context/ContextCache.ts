import * as crypto from 'crypto';
import type { TaskContext } from '../agent/AgentProtocol';

/** Caches snapshots by hash; avoids resending unchanged context. */
export class ContextCache {
  private lastHash: string | null = null;
  private lastCtx: TaskContext | null = null;

  hash(ctx: TaskContext): string {
    return crypto.createHash('sha256').update(JSON.stringify(ctx)).digest('hex').slice(0, 16);
  }

  /** Returns null when unchanged (caller can skip transmission). */
  dedupe(ctx: TaskContext): { hash: string; changed: boolean; context: TaskContext | null } {
    const h = this.hash(ctx);
    if (h === this.lastHash) return { hash: h, changed: false, context: null };
    this.lastHash = h;
    this.lastCtx = ctx;
    return { hash: h, changed: true, context: ctx };
  }

  invalidate(): void {
    this.lastHash = null;
    this.lastCtx = null;
  }

  invalidateFiles(files: string[]): void {
    if (!files.length) return;
    this.invalidate(); // coarse but safe; fine-grained per-file hashing is future work
  }
}
