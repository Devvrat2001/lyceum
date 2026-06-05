/**
 * Offline attempt queue — pure logic, storage-injected so it's unit-testable
 * without IndexedDB. When a student submits an answer while offline, the
 * attempt is queued here; a reconnect flush replays each one to the server
 * (see attemptStore.ts for the real IndexedDB store + the flush wiring).
 *
 * Design: best-effort + at-least-once. A queued attempt is removed only after
 * the server accepts it; a failed replay stays queued for the next reconnect.
 * Replaying the same attempt twice just records two Attempt rows server-side,
 * which is harmless (idempotency by content isn't worth the complexity here).
 */

export type QueuedAttempt = {
  id: string;
  blockId: string;
  chosenIndex: number;
  queuedAt: number;
};

/** Minimal async store the queue needs — implemented by IndexedDB (or memory in tests). */
export interface OfflineAttemptStore {
  all(): Promise<QueuedAttempt[]>;
  put(item: QueuedAttempt): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Queue one attempt for later replay. Returns the stored item. */
export async function enqueueAttempt(
  store: OfflineAttemptStore,
  input: { blockId: string; chosenIndex: number }
): Promise<QueuedAttempt> {
  const item: QueuedAttempt = {
    id: crypto.randomUUID(),
    blockId: input.blockId,
    chosenIndex: input.chosenIndex,
    queuedAt: Date.now(),
  };
  await store.put(item);
  return item;
}

/**
 * Replay every queued attempt via `submit`. Each success is removed from the
 * queue; each failure is left in place (and counted) so the next flush retries
 * it. Never throws — a failing `submit` can't break the reconnect handler.
 */
export async function flushAttempts(
  store: OfflineAttemptStore,
  submit: (item: QueuedAttempt) => Promise<void>
): Promise<{ flushed: number; failed: number }> {
  const items = await store.all();
  let flushed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      await submit(item);
      await store.remove(item.id);
      flushed++;
    } catch {
      failed++;
    }
  }
  return { flushed, failed };
}
