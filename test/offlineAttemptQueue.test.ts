/**
 * Offline action queue logic. Storage is injected, so the enqueue/flush
 * behavior is testable with a plain in-memory Map — no IndexedDB, no DB. This
 * is the data-integrity core behind "an airplane-mode lesson syncs its
 * answers/votes/completions on reconnect" — now generalized beyond MCQ to
 * POLL / DRAG_MATCH / BRANCHING via the `kind` discriminator.
 */
import { describe, expect, it } from "vitest";
import {
  enqueueAction,
  flushActions,
  type OfflineActionStore,
  type QueuedAction,
} from "@/lib/offline/attemptQueue";

function memStore(): OfflineActionStore & { size: () => number } {
  const items = new Map<string, QueuedAction>();
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

describe("enqueueAction", () => {
  it("stores an attemptBlock action with an id and timestamp", async () => {
    const store = memStore();
    const item = await enqueueAction(store, {
      kind: "attemptBlock",
      input: { blockId: "b1", chosenIndex: 2 },
    });
    expect(item.id).toBeTruthy();
    expect(item.kind).toBe("attemptBlock");
    expect(item.queuedAt).toBeGreaterThan(0);
    if (item.kind === "attemptBlock") {
      expect(item.input.blockId).toBe("b1");
      expect(item.input.chosenIndex).toBe(2);
    }
    expect(store.size()).toBe(1);
  });

  it("carries the full attemptBlock input (subIndex / hints) for quiz decks", async () => {
    const store = memStore();
    const item = await enqueueAction(store, {
      kind: "attemptBlock",
      input: { blockId: "deck", chosenIndex: 1, subIndex: 3, hintsUsed: 1 },
    });
    if (item.kind === "attemptBlock") {
      expect(item.input.subIndex).toBe(3);
      expect(item.input.hintsUsed).toBe(1);
    }
  });

  it("queues poll / drag-match / branching actions by kind", async () => {
    const store = memStore();
    await enqueueAction(store, {
      kind: "votePoll",
      input: { blockId: "p", chosenIndex: 0 },
    });
    await enqueueAction(store, {
      kind: "completeDragMatch",
      input: { blockId: "d", placements: [1, 0] },
    });
    await enqueueAction(store, {
      kind: "completeBranching",
      input: { blockId: "br", terminalNodeId: "n3" },
    });
    const kinds = (await store.all()).map((a) => a.kind).sort();
    expect(kinds).toEqual([
      "completeBranching",
      "completeDragMatch",
      "votePoll",
    ]);
    expect(store.size()).toBe(3);
  });
});

describe("flushActions", () => {
  it("replays and removes every action on success", async () => {
    const store = memStore();
    await enqueueAction(store, {
      kind: "attemptBlock",
      input: { blockId: "b1", chosenIndex: 0 },
    });
    await enqueueAction(store, {
      kind: "votePoll",
      input: { blockId: "p1", chosenIndex: 1 },
    });

    const submitted: string[] = [];
    const res = await flushActions(store, async (item) => {
      submitted.push(item.kind);
    });

    expect(res).toEqual({ flushed: 2, failed: 0 });
    expect(submitted.sort()).toEqual(["attemptBlock", "votePoll"]);
    expect(store.size()).toBe(0);
  });

  it("keeps failed actions queued for the next flush", async () => {
    const store = memStore();
    await enqueueAction(store, {
      kind: "attemptBlock",
      input: { blockId: "b1", chosenIndex: 0 },
    });

    const res = await flushActions(store, async () => {
      throw new Error("offline / 500");
    });

    expect(res).toEqual({ flushed: 0, failed: 1 });
    expect(store.size()).toBe(1); // still there to retry
  });

  it("removes only the successes in a mixed batch", async () => {
    const store = memStore();
    await enqueueAction(store, {
      kind: "completeBranching",
      input: { blockId: "ok", terminalNodeId: "n1" },
    });
    await enqueueAction(store, {
      kind: "votePoll",
      input: { blockId: "fail", chosenIndex: 0 },
    });

    const res = await flushActions(store, async (item) => {
      if (item.input.blockId === "fail") throw new Error("boom");
    });

    expect(res).toEqual({ flushed: 1, failed: 1 });
    const remaining = await store.all();
    expect(remaining.map((r) => r.input.blockId)).toEqual(["fail"]);
  });

  it("is a no-op on an empty queue", async () => {
    const store = memStore();
    const res = await flushActions(store, async () => {
      throw new Error("should not be called");
    });
    expect(res).toEqual({ flushed: 0, failed: 0 });
  });
});
