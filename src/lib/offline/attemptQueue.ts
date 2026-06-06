/**
 * Offline action queue — pure logic, storage-injected so it's unit-testable
 * without IndexedDB. When a student submits an answer / vote / completion
 * while offline, the action is queued here; a reconnect flush replays each one
 * to the server (see attemptStore.ts for the IndexedDB store + flush wiring).
 *
 * Design: best-effort + at-least-once. A queued action is removed only after
 * the server accepts it; a failed replay stays queued for the next reconnect.
 * Replaying the same action twice just records two rows server-side, which is
 * harmless (content-level idempotency isn't worth the complexity here).
 */

/** The full `lesson.attemptBlock` input (MCQ + QUIZ/AI_QUIZ decks). */
export type AttemptInput = {
  blockId: string;
  chosenIndex: number;
  subIndex?: number;
  hintsUsed?: number;
  timeMs?: number;
};

/**
 * Every offline-queueable student action, as a discriminated union. `kind`
 * routes the replay to the matching tRPC mutation and `input` is that
 * mutation's payload. These are the four self-check submits that award XP:
 * MCQ/QUIZ (`attemptBlock`), POLL (`votePoll`), DRAG_MATCH
 * (`completeDragMatch`), and BRANCHING (`completeBranching`).
 */
export type OfflineAction =
  | { kind: "attemptBlock"; input: AttemptInput }
  | { kind: "votePoll"; input: { blockId: string; chosenIndex: number } }
  | {
      kind: "completeDragMatch";
      input: {
        blockId: string;
        placements: (number | null)[];
        timeMs?: number;
      };
    }
  | {
      kind: "completeBranching";
      input: { blockId: string; terminalNodeId: string; timeMs?: number };
    };

export type QueuedAction = OfflineAction & { id: string; queuedAt: number };

/** Minimal async store the queue needs — IndexedDB (or memory in tests). */
export interface OfflineActionStore {
  all(): Promise<QueuedAction[]>;
  put(item: QueuedAction): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Queue one action for later replay. Returns the stored item. */
export async function enqueueAction(
  store: OfflineActionStore,
  action: OfflineAction
): Promise<QueuedAction> {
  const item = {
    ...action,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
  } as QueuedAction;
  await store.put(item);
  return item;
}

/**
 * Replay every queued action via `submit`. Each success is removed from the
 * queue; each failure is left in place (and counted) so the next flush retries
 * it. Never throws — a failing `submit` can't break the reconnect handler.
 */
export async function flushActions(
  store: OfflineActionStore,
  submit: (item: QueuedAction) => Promise<void>
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
