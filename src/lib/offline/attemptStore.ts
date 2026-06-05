"use client";
import {
  enqueueAttempt,
  flushAttempts,
  type OfflineAttemptStore,
  type QueuedAttempt,
} from "./attemptQueue";

/**
 * Browser wiring for the offline attempt queue: an IndexedDB-backed
 * OfflineAttemptStore + the reconnect flush that replays queued attempts to
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

const noopStore: OfflineAttemptStore = {
  all: async () => [],
  put: async () => {},
  remove: async () => {},
};

const idbStore: OfflineAttemptStore = {
  all: () => tx<QueuedAttempt[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedAttempt[]>),
  put: async (item) => {
    await tx("readwrite", (s) => s.put(item));
  },
  remove: async (id) => {
    await tx("readwrite", (s) => s.delete(id));
  },
};

/** The active store: IndexedDB in the browser, a no-op everywhere else. */
export function getAttemptStore(): OfflineAttemptStore {
  return hasIndexedDB() ? idbStore : noopStore;
}

/** Queue an attempt for later replay (no-op on the server). */
export function queueAttempt(input: {
  blockId: string;
  chosenIndex: number;
}): Promise<QueuedAttempt> {
  return enqueueAttempt(getAttemptStore(), input);
}

/**
 * Replay all queued attempts to the server. Each is POSTed to the auth'd
 * replay route, which re-runs lesson.attemptBlock as the signed-in user. A
 * non-2xx leaves the attempt queued for the next reconnect.
 */
export function flushQueuedAttempts(): Promise<{
  flushed: number;
  failed: number;
}> {
  return flushAttempts(getAttemptStore(), async (item) => {
    const res = await fetch("/api/lesson/attempt-replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blockId: item.blockId,
        chosenIndex: item.chosenIndex,
      }),
    });
    if (!res.ok) throw new Error(`replay failed: ${res.status}`);
  });
}
