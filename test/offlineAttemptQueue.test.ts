/**
 * Offline attempt queue logic. Storage is injected, so the enqueue/flush
 * behavior is testable with a plain in-memory Map — no IndexedDB, no DB. This
 * is the data-integrity core behind "an airplane-mode lesson syncs its
 * attempts on reconnect".
 */
import { describe, expect, it } from "vitest";
import {
  enqueueAttempt,
  flushAttempts,
  type OfflineAttemptStore,
  type QueuedAttempt,
} from "@/lib/offline/attemptQueue";

function memStore(): OfflineAttemptStore & { size: () => number } {
  const items = new Map<string, QueuedAttempt>();
  return {
    size: () => items.size,
    all: async () => [...items.values()],
    put: async (item) => {
      items.set(item.id, item);
    },
    remove: async (id) => {
      items.delete(id);
    },
  };
}

describe("enqueueAttempt", () => {
  it("stores an attempt with an id and timestamp", async () => {
    const store = memStore();
    const item = await enqueueAttempt(store, { blockId: "b1", chosenIndex: 2 });
    expect(item.id).toBeTruthy();
    expect(item.blockId).toBe("b1");
    expect(item.chosenIndex).toBe(2);
    expect(item.queuedAt).toBeGreaterThan(0);
    expect(store.size()).toBe(1);
  });

  it("carries the full attemptBlock input (subIndex / hints) for quiz decks", async () => {
    const store = memStore();
    const item = await enqueueAttempt(store, {
      blockId: "deck",
      chosenIndex: 1,
      subIndex: 3,
      hintsUsed: 1,
    });
    expect(item.subIndex).toBe(3);
    expect(item.hintsUsed).toBe(1);
  });
});

describe("flushAttempts", () => {
  it("replays and removes every attempt on success", async () => {
    const store = memStore();
    await enqueueAttempt(store, { blockId: "b1", chosenIndex: 0 });
    await enqueueAttempt(store, { blockId: "b2", chosenIndex: 1 });

    const submitted: string[] = [];
    const res = await flushAttempts(store, async (item) => {
      submitted.push(item.blockId);
    });

    expect(res).toEqual({ flushed: 2, failed: 0 });
    expect(submitted.sort()).toEqual(["b1", "b2"]);
    expect(store.size()).toBe(0);
  });

  it("keeps failed attempts queued for the next flush", async () => {
    const store = memStore();
    await enqueueAttempt(store, { blockId: "b1", chosenIndex: 0 });

    const res = await flushAttempts(store, async () => {
      throw new Error("offline / 500");
    });

    expect(res).toEqual({ flushed: 0, failed: 1 });
    expect(store.size()).toBe(1); // still there to retry
  });

  it("removes only the successes in a mixed batch", async () => {
    const store = memStore();
    await enqueueAttempt(store, { blockId: "ok", chosenIndex: 0 });
    await enqueueAttempt(store, { blockId: "fail", chosenIndex: 0 });

    const res = await flushAttempts(store, async (item) => {
      if (item.blockId === "fail") throw new Error("boom");
    });

    expect(res).toEqual({ flushed: 1, failed: 1 });
    const remaining = await store.all();
    expect(remaining.map((r) => r.blockId)).toEqual(["fail"]);
  });

  it("is a no-op on an empty queue", async () => {
    const store = memStore();
    const res = await flushAttempts(store, async () => {
      throw new Error("should not be called");
    });
    expect(res).toEqual({ flushed: 0, failed: 0 });
  });
});
