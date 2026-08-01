import { unavailableActivity, type ActivitySnapshot } from "../shared/contracts";

/**
 * Holds the most recent reading the Discord surface reported, and tells the
 * shell when a fresher one arrives.
 *
 * The main process is the only place both renderer surfaces can meet: the
 * Discord surface reports readings, the shell's Activity screen displays
 * them, and neither is allowed to talk to the other directly.
 *
 * A reading is deliberately not persisted. It describes the state of a live
 * Discord session; replaying yesterday's count at startup would be asserting
 * something PulseCord has not observed since.
 */
export class ActivityStore {
  #snapshot: ActivitySnapshot;
  readonly #listeners = new Set<(snapshot: ActivitySnapshot) => void>();

  constructor(now: () => number = Date.now) {
    // Until Discord's surface has reported anything, the honest answer is that
    // nothing has been observed — not that there is nothing to observe.
    this.#snapshot = unavailableActivity(now());
  }

  get(): ActivitySnapshot {
    return { ...this.#snapshot };
  }

  set(snapshot: ActivitySnapshot): void {
    // Readings arrive in order from a single surface, but a reload can restart
    // that surface mid-flight; ignoring older stamps keeps a late delivery from
    // overwriting a newer reading.
    if (snapshot.readAt < this.#snapshot.readAt) return;

    this.#snapshot = { ...snapshot };
    for (const listener of [...this.#listeners]) {
      try {
        listener(this.get());
      } catch (error) {
        console.error("[PulseCord] An activity listener failed.", error);
      }
    }
  }

  /** Marks the reading as stale, e.g. when the Discord surface goes away. */
  clear(now: () => number = Date.now): void {
    this.set(unavailableActivity(now()));
  }

  subscribe(listener: (snapshot: ActivitySnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
