import { describe, it, expect, vi } from 'vitest';
import { JsonRpcClient } from '../src/agent/JsonRpcClient';
import { EventStream } from '../src/agent/EventStream';
import { ReconnectManager } from '../src/agent/ReconnectManager';
import { FileWatcher } from '../src/intelligence/indexer/FileWatcher';
import { IndexScheduler } from '../src/intelligence/indexer/IndexScheduler';

describe('JSON-RPC messages', () => {
  it('resolves requests and routes notifications', async () => {
    const client = new JsonRpcClient(200);
    const sent: string[] = [];
    client.attachSender((t) => sent.push(t));
    const seen: unknown[] = [];
    client.onNotification('worker.step', (p) => seen.push(p));
    const p = client.request('task.start', { a: 1 });
    expect(sent).toHaveLength(1);
    const req = JSON.parse(sent[0]);
    expect(req.jsonrpc).toBe('2.0');
    expect(req.method).toBe('task.start');
    client.handleMessage(JSON.stringify({ jsonrpc: '2.0', id: req.id, result: { ok: true } }));
    await expect(p).resolves.toEqual({ ok: true });
    client.handleMessage(JSON.stringify({ jsonrpc: '2.0', method: 'worker.step', params: { taskId: 't' } }));
    expect(seen).toHaveLength(1);
  });

  it('times out and supports cancellation', async () => {
    const client = new JsonRpcClient(20);
    client.attachSender(() => undefined);
    await expect(client.request('x')).rejects.toThrow(/timed out/);
    const p2 = client.request('y', {}, 1000);
    client.cancelAll('test close');
    await expect(p2).rejects.toThrow(/test close/);
    expect(client.pendingCount).toBe(0);
  });
});

describe('reconnect', () => {
  it('backs off and resets', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const rm = new ReconnectManager({ baseDelayMs: 100, maxDelayMs: 1000, onReconnect: fn });
    rm.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalled();
    rm.reset();
    expect(rm.attemptCount).toBe(0);
    rm.dispose();
    vi.useRealTimers();
  });
});

describe('event stream', () => {
  it('emits with bounded buffer and replay', () => {
    const s = new EventStream(2);
    s.emit('worker.step', 't1', { a: 1 });
    const got: unknown[] = [];
    s.subscribe('worker.step', (e) => got.push(e));
    expect(got.length).toBeGreaterThanOrEqual(1);
    s.clear('t1');
  });
});

describe('file watcher', () => {
  it('debounces into one batch', () => {
    vi.useFakeTimers();
    const batches: unknown[][] = [];
    const w = new FileWatcher({ debounceMs: 100, onBatch: (b) => batches.push(b) });
    w.notify('a', 'change');
    w.notify('a', 'change');
    w.notify('b', 'create');
    expect(batches).toHaveLength(0);
    vi.advanceTimersByTime(150);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    w.dispose();
    vi.useRealTimers();
  });
});

describe('index scheduler', () => {
  it('processes queue with concurrency limit', async () => {
    const done: string[] = [];
    const s = new IndexScheduler({ concurrency: 1, process: async (f) => { done.push(f); } });
    s.enqueue('a');
    s.enqueue('b');
    await new Promise((r) => setTimeout(r, 50));
    expect(done).toEqual(['a', 'b']);
  });
});
