import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { JsonRpcClient } from './JsonRpcClient';
import { EventStream } from './EventStream';
import { ReconnectManager } from './ReconnectManager';
import type { TaskContext } from './AgentProtocol';

export interface AgentClientOptions {
  url: string;
  authToken?: string;
  timeoutMs?: number;
  enableAutoReconnect?: boolean;
}

export interface StartTaskInput {
  request: string;
  workspaceId: string;
  activeFile?: string;
  selection?: string;
  context: TaskContext;
}

/** WebSocket + JSON-RPC client speaking to the CodeVeya Deep Agent backend. */
export class AgentClient {
  readonly rpc = new JsonRpcClient();
  readonly events = new EventStream();
  private socket: WebSocket | null = null;
  private reconnect: ReconnectManager | null = null;
  private disposed = false;
  private activeTasks = new Map<string, { cancelled: boolean }>();

  constructor(private readonly opts: AgentClientOptions) {
    this.rpc.attachSender((text) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(text);
      } else {
        throw new Error('WebSocket is not connected');
      }
    });
    if (opts.enableAutoReconnect !== false) {
      this.reconnect = new ReconnectManager({
        onReconnect: () => this.connect(),
      });
    }
    this.wireServerEvents();
  }

  private wireServerEvents(): void {
    const forward = (method: string, kind: Parameters<EventStream['emit']>[0]) =>
      this.rpc.onNotification(method, (params) => {
        const p = params as { taskId?: string } | undefined;
        if (p?.taskId) this.events.emit(kind, p.taskId, params);
      });
    forward('worker.started', 'worker.started');
    forward('worker.step', 'worker.step');
    forward('context.selected', 'context.selected');
    forward('patch.generated', 'patch.generated');
    forward('verification', 'verification');
    forward('approval.required', 'approval.required');
    forward('worker.completed', 'worker.completed');
    forward('worker.failed', 'worker.failed');
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new Error('AgentClient disposed');
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (this.opts.authToken) headers['Authorization'] = `Bearer ${this.opts.authToken}`;
      const ws = new WebSocket(this.opts.url, { headers });
      const onOpen = () => {
        cleanup();
        this.socket = ws;
        this.rpc.attachSender((text) => ws.send(text));
        ws.on('message', (data) => this.rpc.handleMessage(data.toString()));
        ws.on('close', () => {
          this.rpc.cancelAll('websocket closed');
          this.reconnect?.schedule();
        });
        ws.on('error', () => undefined);
        this.reconnect?.reset();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        ws.removeListener('open', onOpen);
        ws.removeListener('error', onError);
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
    });
  }

  async startTask(input: StartTaskInput): Promise<string> {
    await this.connect();
    const taskId = `task_${uuidv4()}`;
    this.activeTasks.set(taskId, { cancelled: false });
    await this.rpc.request(
      'task.start',
      {
        taskId,
        request: input.request,
        workspaceId: input.workspaceId,
        activeFile: input.activeFile,
        context: {
          selectedFiles: input.context.selectedFiles ?? [],
          selectedSymbols: input.context.selectedSymbols ?? [],
          diagnostics: input.context.diagnostics ?? [],
        },
      },
      this.opts.timeoutMs,
    );
    return taskId;
  }

  async cancelTask(taskId: string, reason = 'user cancelled'): Promise<void> {
    const t = this.activeTasks.get(taskId);
    if (t) t.cancelled = true;
    try {
      this.rpc.notify('task.cancel', { taskId, reason });
    } catch {
      // best effort
    }
    this.events.clear(taskId);
  }

  isCancelled(taskId: string): boolean {
    return this.activeTasks.get(taskId)?.cancelled === true;
  }

  dispose(): void {
    this.disposed = true;
    this.reconnect?.dispose();
    this.rpc.cancelAll('disposed');
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = null;
  }
}
