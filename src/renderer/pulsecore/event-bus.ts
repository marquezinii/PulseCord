export type EventListenerFn = (payload: unknown) => void;

/**
 * Minimal typed publish/subscribe bus shared by the runtime and every plugin's
 * `events` facet. A listener that throws is isolated here so one bad listener
 * cannot break delivery to the others.
 */
export class EventBus {
  readonly #listeners = new Map<string, Set<EventListenerFn>>();

  on(type: string, listener: EventListenerFn): () => void {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit(type: string, payload?: unknown): void {
    const set = this.#listeners.get(type);
    if (!set || set.size === 0) return;
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[PulseCord] Event listener for "${type}" failed.`, error);
      }
    }
  }
}
