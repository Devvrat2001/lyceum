"use client";
import {
  enqueueAction,
  flushActions,
  type AttemptInput,
  type OfflineActionStore,
  type QueuedAction,
} from "./attemptQueue";

/**
 * Browser wiring for the offline action queue: an IndexedDB-backed
 * OfflineActionStore + the reconnect flush that replays queued actions to
 * /api/lesson/attempt-replay. SSR/no-IndexedDB safe — falls back to a no-op
 * store so importing this never throws on the server.
 */

const DB_NAME = "lyceum-offline";
const STORE = "attempts";

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

const noopStore: OfflineActionStore = {
  all: async () => [],
  put: async () => {},
  remove: async () => {},
};

const idbStore: OfflineActionStore = {
  all: () =>
    tx<QueuedAction[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedAction[]>),
  put: async (item) => {
    await tx("readwrite", (s) => s.put(item));
  },
  remove: async (id) => {
    await tx("readwrite", (s) => s.delete(id));
  },
};

/** The active store: IndexedDB in the browser, a no-op everywhere else. */
export function getActionStore(): OfflineActionStore {
  return hasIndexedDB() ? idbStore : noopStore;
}

/** Queue an MCQ / QUIZ attempt for later replay (no-op on the server). */
export function queueAttempt(input: AttemptInput): Promise<QueuedAction> {
  return enqueueAction(getActionStore(), { kind: "attemptBlock", input });
}

/** Queue a POLL vote for later replay. */
export function queuePoll(input: {
  blockId: string;
  chosenIndex: number;
}): Promise<QueuedAction> {
  return enqueueAction(getActionStore(), { kind: "votePoll", input });
}

/** Queue a DRAG_MATCH completion for later replay. */
export function queueDragMatch(input: {
  blockId: string;
  placements: (number | null)[];
  timeMs?: number;
}): Promise<QueuedAction> {
  return enqueueAction(getActionStore(), { kind: "completeDragMatch", input });
}

/** Queue a BRANCHING terminal completion for later replay. */
export function queueBranching(input: {
  blockId: string;
  terminalNodeId: string;
  timeMs?: number;
}): Promise<QueuedAction> {
  return enqueueAction(getActionStore(), { kind: "completeBranching", input });
}

/**
 * Replay all queued actions to the server. Each is POSTed (as `{ kind, input }`)
 * to the auth'd replay route, which re-runs the matching mutation as the
 * signed-in user. A non-2xx leaves the action queued for the next reconnect.
 */
export function flushQueuedAttempts(): Promise<{
  flushed: number;
  failed: number;
}> {
  return flushActions(getActionStore(), async (item) => {
    const res = await fetch("/api/lesson/attempt-replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: item.kind, input: item.input }),
    });
    if (!res.ok) throw new Error(`replay failed: ${res.status}`);
  });
}
