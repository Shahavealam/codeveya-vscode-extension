export interface TelemetryEvent {
  name: string;
  properties?: Record<string, string | number | boolean>;
  at?: number;
}

/** Opt-in, no-PII telemetry (never sends code or secrets). */
export class TelemetryClient {
  private queue: TelemetryEvent[] = [];
  constructor(
    private readonly opts: { enabled: boolean; endpoint?: string; flushIntervalMs?: number } = { enabled: false },
  ) {
    if (opts.enabled && opts.endpoint) {
      setInterval(() => void this.flush(), opts.flushIntervalMs ?? 60000).unref?.();
    }
  }

  track(name: string, properties?: TelemetryEvent['properties']): void {
    if (!this.opts.enabled) return;
    this.queue.push({ name, properties, at: Date.now() });
    if (this.queue.length > 100) this.queue.splice(0, this.queue.length - 100);
  }

  async flush(): Promise<void> {
    if (!this.opts.enabled || !this.opts.endpoint || !this.queue.length) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // best effort; requeue on failure (bounded)
      this.queue.unshift(...batch.slice(0, 20));
    }
  }
}
