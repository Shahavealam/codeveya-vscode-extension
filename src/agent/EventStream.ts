export type AgentEventKind =
  | 'worker.started'
  | 'worker.step'
  | 'context.selected'
  | 'patch.generated'
  | 'verification'
  | 'approval.required'
  | 'worker.completed'
  | 'worker.failed';

export interface AgentEvent<T = unknown> {
  kind: AgentEventKind;
  taskId: string;
  payload: T;
  receivedAt: number;
}

type Handler<T = unknown> = (event: AgentEvent<T>) => void;

/** Typed in-memory event bus with backpressure (bounded buffer, drop-oldest). */
export class EventStream {
  private handlers = new Map<AgentEventKind, Set<Handler<unknown>>>();
  private buffer: Array<AgentEvent<unknown>> = [];
  constructor(private readonly maxBuffer = 500) {}

  subscribe<T>(kind: AgentEventKind, handler: Handler<T>): () => void {
    let set = this.handlers.get(kind) as Set<Handler<T>> | undefined;
    if (!set) {
      set = new Set();
      this.handlers.set(kind, set as Set<Handler<unknown>>);
    }
    set.add(handler as Handler<unknown>);
    // replay buffered events of this kind
    for (const e of this.buffer) {
      if (e.kind === kind) {
        try {
          (handler as Handler<unknown>)(e);
        } catch {
          // ignore
        }
      }
    }
    return () => {
      set!.delete(handler as Handler<unknown>);
    };
  }

  emit<T>(kind: AgentEventKind, taskId: string, payload: T): void {
    const event: AgentEvent<T> = { kind, taskId, payload, receivedAt: Date.now() };
    this.buffer.push(event as AgentEvent<unknown>);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.splice(0, this.buffer.length - this.maxBuffer);
    }
    const set = this.handlers.get(kind);
    if (set) {
      for (const h of [...set]) {
        try {
          h(event as AgentEvent<unknown>);
        } catch {
          // ignore
        }
      }
    }
  }

  clear(taskId?: string): void {
    if (!taskId) this.buffer = [];
    else this.buffer = this.buffer.filter((e) => e.taskId !== taskId);
  }
}
