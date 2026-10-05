import type { JsonRpcId, JsonRpcMessage } from './AgentProtocol';
import { v4 as uuidv4 } from 'uuid';

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

function isResponse(msg: JsonRpcMessage): boolean {
  return (msg as { id?: unknown }).id !== undefined && (msg as { method?: unknown }).method === undefined;
}

/** Minimal JSON-RPC 2.0 client over a message transport (WebSocket). */
export class JsonRpcClient {
  private pending = new Map<JsonRpcId, PendingEntry>();
  private notifications = new Map<string, Set<(params?: unknown) => void>>();
  private sendRaw: (text: string) => void = () => undefined;
  private idPrefix = 'req_';
  readonly defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = 60000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  attachSender(sendRaw: (text: string) => void): void {
    this.sendRaw = sendRaw;
  }

  nextId(): string {
    return `${this.idPrefix}${uuidv4()}`;
  }

  request<TParams = unknown, TResult = unknown>(
    method: string,
    params?: TParams,
    timeoutMs?: number,
  ): Promise<TResult> {
    const id = this.nextId();
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`JSON-RPC request timed out: ${method} (${id})`));
      }, timeoutMs ?? this.defaultTimeoutMs);
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
        method,
      });
      try {
        this.sendRaw(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  notify<TParams = unknown>(method: string, params?: TParams): void {
    this.sendRaw(JSON.stringify({ jsonrpc: '2.0', method, params }));
  }

  onNotification(method: string, handler: (params?: unknown) => void): () => void {
    let set = this.notifications.get(method);
    if (!set) {
      set = new Set();
      this.notifications.set(method, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Route an inbound raw message; returns true if handled. */
  handleMessage(text: string): boolean {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(text) as JsonRpcMessage;
    } catch {
      return false;
    }
    if (isResponse(msg)) {
      const raw = msg as unknown as { id: JsonRpcId; result?: unknown; error?: { code: number; message: string } };
      const entry = this.pending.get(raw.id);
      if (!entry) return false;
      this.pending.delete(raw.id);
      clearTimeout(entry.timer);
      if ('result' in raw) {
        entry.resolve(raw.result);
      } else if ('error' in raw && raw.error) {
        entry.reject(new Error(`JSON-RPC error ${raw.error.code}: ${raw.error.message}`));
      }
      return true;
    }
    const notif = msg as { method?: string; params?: unknown };
    if (notif.method) {
      const handlers = this.notifications.get(notif.method);
      if (handlers) {
        for (const h of [...handlers]) {
          try {
            h(notif.params);
          } catch {
            // ignore handler errors
          }
        }
      }
      return true;
    }
    return false;
  }

  cancelAll(reason = 'client closed'): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`${reason} (pending ${String(id)})`));
    }
    this.pending.clear();
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
