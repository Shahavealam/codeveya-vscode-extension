/** Debounced file-change coalescer (VS Code FileSystemWatcher feeds into this). */
export class FileWatcher {
  private pending = new Map<string, { kind: 'change' | 'create' | 'delete'; at: number }>();
  private timer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(
    private readonly opts: {
      debounceMs?: number;
      onBatch: (events: Array<{ uri: string; kind: 'change' | 'create' | 'delete' }>) => void;
    },
  ) {}

  notify(uri: string, kind: 'change' | 'create' | 'delete'): void {
    if (this.disposed) return;
    this.pending.set(uri, { kind, at: Date.now() });
    const ms = this.opts.debounceMs ?? 500;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), ms);
  }

  flush(): void {
    if (!this.pending.size) return;
    const batch = [...this.pending.entries()].map(([uri, v]) => ({ uri, kind: v.kind }));
    this.pending.clear();
    try {
      this.opts.onBatch(batch);
    } catch {
      // ignore
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.pending.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
