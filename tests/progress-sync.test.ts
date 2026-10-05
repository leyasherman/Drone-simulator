import { describe, expect, it } from 'vitest';
import { Progress, type KeyValueStore, type ProgressData } from '../src/game/progress';
import { ProgressSync, missingOnServer, type ProgressBackend } from '../src/net/progress-sync';

function store(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

/** An in-memory server that awards flight XP + 30, like complete_lesson. */
function fakeServer(initial: ProgressData = { completed: {}, totalXp: 0 }) {
  const data = structuredClone(initial);
  const calls: [string, number][] = [];
  let up = true;
  const backend: ProgressBackend = {
    async load() {
      return up ? structuredClone(data) : null;
    },
    async complete(id, flightXp) {
      if (!up) return null;
      calls.push([id, flightXp]);
      const awarded = Math.min(flightXp, 200) + 30;
      data.completed[id] = { bestXp: Math.max(data.completed[id]?.bestXp ?? 0, awarded), completedAt: 'now' };
      data.totalXp += awarded;
      return { awarded, totalXp: data.totalXp };
    },
  };
  return { backend, data, calls, setUp: (v: boolean) => (up = v) };
}

describe('missingOnServer', () => {
  it('lists lessons done locally but not on the server', () => {
    const local = {
      completed: { a: { bestXp: 40, completedAt: '' }, b: { bestXp: 30, completedAt: '' } },
      totalXp: 70,
    };
    const remote = { completed: { a: { bestXp: 40, completedAt: '' } }, totalXp: 40 };
    expect(missingOnServer(local, remote)).toEqual(['b']);
  });
});

describe('ProgressSync', () => {
  it('takes the server state on start', async () => {
    const server = fakeServer({
      completed: { 'first-takeoff': { bestXp: 40, completedAt: 'x' } },
      totalXp: 40,
    });
    const p = new Progress(store());
    const sync = new ProgressSync(p, server.backend);
    await sync.start();
    expect(sync.online).toBe(true);
    expect(p.isDone('first-takeoff')).toBe(true);
    expect(p.totalXp).toBe(40);
  });

  it('uploads lessons finished before the backend existed, once', async () => {
    const server = fakeServer();
    const p = new Progress(store());
    p.complete('first-takeoff', 40); // 10 flight + 30 bonus
    await new ProgressSync(p, server.backend).start();
    expect(server.calls).toEqual([['first-takeoff', 10]]);
    expect(p.totalXp).toBe(40);
    // A second start finds nothing new to upload
    await new ProgressSync(p, server.backend).start();
    expect(server.calls.length).toBe(1);
  });

  it('shows XP at once, then uses the server total', async () => {
    const server = fakeServer({ completed: {}, totalXp: 100 });
    const p = new Progress(store());
    const sync = new ProgressSync(p, server.backend);
    await sync.start();
    const pending = sync.complete('going-forward', 20, 50);
    expect(p.totalXp).toBe(150); // optimistic
    await pending;
    expect(p.totalXp).toBe(150);
    expect(server.calls).toEqual([['going-forward', 20]]);
  });

  it('keeps working locally when the server is down', async () => {
    const server = fakeServer();
    server.setUp(false);
    const p = new Progress(store());
    const sync = new ProgressSync(p, server.backend);
    await sync.start();
    expect(sync.online).toBe(false);
    await sync.complete('first-takeoff', 10, 40);
    expect(p.isDone('first-takeoff')).toBe(true);
    expect(server.calls.length).toBe(0);
  });
});
