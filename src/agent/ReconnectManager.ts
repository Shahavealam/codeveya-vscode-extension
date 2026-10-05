/** Exponential-backoff reconnect manager with jitter. */
export class ReconnectManager {
  private attempts = 0;
  private timer: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(
    private readonly opts: {
      baseDelayMs?: number;
      maxDelayMs?: number;
      maxAttempts?: number;
      onReconnect: () => void | Promise<void>;
    },
  ) {}

  get attemptCount(): number {
    return this.attempts;
  }

  schedule(): void {
    if (this.disposed) return;
    const base = this.opts.baseDelayMs ?? 1000;
    const max = this.opts.maxDelayMs ?? 30000;
    const maxAttempts = this.opts.maxAttempts ?? Infinity;
    if (this.attempts >= maxAttempts) return;
    const delay = Math.min(max, base * 2 ** this.attempts) + Math.floor(Math.random() * 250);
    this.attempts += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void Promise.resolve()
        .then(() => this.opts.onReconnect())
        .catch(() => this.schedule());
    }, delay);
  }

  reset(): void {
    this.attempts = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
