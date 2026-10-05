/** Batches incremental indexing jobs with concurrency limit. */
export class IndexScheduler {
  private queue: string[] = [];
  private running = 0;
  private scheduled = false;

  constructor(
    private readonly opts: {
      concurrency?: number;
      process: (file: string) => Promise<void>;
    },
  ) {}

  enqueue(file: string): void {
    if (!this.queue.includes(file)) this.queue.push(file);
    this.kick();
  }

  enqueueMany(files: string[]): void {
    for (const f of files) if (!this.queue.includes(f)) this.queue.push(f);
    this.kick();
  }

  private kick(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    void Promise.resolve().then(() => {
      this.scheduled = false;
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    const limit = Math.max(1, this.opts.concurrency ?? 4);
    while (this.queue.length && this.running < limit) {
      const file = this.queue.shift()!;
      this.running += 1;
      void this.opts
        .process(file)
        .catch(() => undefined)
        .finally(() => {
          this.running -= 1;
          if (this.queue.length) void this.drain();
        });
    }
  }

  get queueLength(): number {
    return this.queue.length;
  }
}
