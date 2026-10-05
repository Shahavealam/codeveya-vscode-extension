import { describe, it, expect } from 'vitest';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentClient } from '../src/agent/AgentClient';
import { PatchValidator } from '../src/diff/PatchValidator';
import type { AddressInfo } from 'net';

const DIFF = `--- a/src/auth/service.ts
+++ b/src/auth/service.ts
@@ -1,1 +1,2 @@
 const a = 1;
+export const b = 2;
`;

/**
 * Ask -> backend -> events -> diff -> approval -> apply (protocol-level).
 * Fake backend speaks JSON-RPC over WS: responds to task.start, then emits
 * worker.step / patch.generated / worker.completed notifications.
 */
describe('agent integration', () => {
  it('completes full task flow', async () => {
    const wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((r) => wss.on('listening', () => r()));
    const port = (wss.address() as AddressInfo).port;

    wss.on('connection', (socket: WebSocket) => {
      socket.on('message', (raw: Buffer) => {
        const msg = JSON.parse(raw.toString());
        if (msg.method === 'task.start') {
          socket.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { accepted: true } }));
          const taskId = msg.params.taskId;
          const notify = (method: string, params: unknown) =>
            socket.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
          setTimeout(() => notify('worker.started', { taskId }), 5);
          setTimeout(() => notify('worker.step', { taskId, phase: 'PLAN', summary: 'identified AuthService' }), 10);
          setTimeout(
            () => notify('patch.generated', { taskId, patches: [{ path: 'src/auth/service.ts', unifiedDiff: DIFF }] }),
            20,
          );
          setTimeout(() => notify('worker.completed', { taskId, summary: 'done' }), 30);
        }
      });
    });

    const client = new AgentClient({ url: `ws://127.0.0.1:${port}`, enableAutoReconnect: false });
    const steps: string[] = [];
    let patches: Array<{ path: string; unifiedDiff: string }> = [];
    let completed = '';
    client.events.subscribe('worker.step', (e: { payload: { summary: string } }) => steps.push(e.payload.summary));
    client.events.subscribe('patch.generated', (e: { payload: { patches: typeof patches } }) => {
      patches = e.payload.patches;
    });
    const done = new Promise<void>((resolve) => {
      client.events.subscribe('worker.completed', (e: { payload: { summary: string } }) => {
        completed = e.payload.summary;
        resolve();
      });
    });

    const taskId = await client.startTask({
      request: 'Add refresh token authentication',
      workspaceId: 'workspace_123',
      activeFile: 'src/auth/service.ts',
      context: { selectedFiles: [], selectedSymbols: [], diagnostics: [], skeletons: [], symbols: [] },
    });
    expect(taskId).toMatch(/^task_/);
    await done;

    // diff -> approval decision (protocol level)
    expect(steps).toContain('identified AuthService');
    expect(patches).toHaveLength(1);
    const validator = new PatchValidator('/repo');
    const v = validator.validate(patches[0], new Map());
    expect(v.ok).toBe(true);
    const approved = true; // simulated user approval
    expect(approved && completed === 'done').toBe(true);

    client.dispose();
    wss.close();
  }, 10000);
});
