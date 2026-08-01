import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ActivityStore } from "../../src/main/activity-store";
import type { ActivitySnapshot } from "../../src/shared/contracts";

describe("ActivityStore", () => {
  test("starts as unavailable, because nothing has been observed yet", () => {
    const store = new ActivityStore(() => 1000);
    assert.equal(store.get().mentions, null);
  });

  test("keeps the latest reading and hands out copies, not its own state", () => {
    const store = new ActivityStore(() => 1000);
    store.set({ mentions: 4, readAt: 2000 });

    const first = store.get();
    first.mentions = 999;

    assert.equal(store.get().mentions, 4);
  });

  test("notifies subscribers on every accepted reading", () => {
    const store = new ActivityStore(() => 1000);
    const seen: Array<number | null> = [];
    store.subscribe((snapshot) => seen.push(snapshot.mentions));

    store.set({ mentions: 2, readAt: 2000 });
    store.set({ mentions: 0, readAt: 3000 });

    assert.deepEqual(seen, [2, 0]);
  });

  test("unsubscribing stops delivery", () => {
    const store = new ActivityStore(() => 1000);
    const seen: Array<number | null> = [];
    const unsubscribe = store.subscribe((snapshot) => seen.push(snapshot.mentions));

    store.set({ mentions: 1, readAt: 2000 });
    unsubscribe();
    store.set({ mentions: 5, readAt: 3000 });

    assert.deepEqual(seen, [1]);
  });

  test("ignores a reading older than the one it already holds", () => {
    // A reloading Discord surface can deliver a stale reading after a fresh
    // one; letting it win would show a count that is already known to be wrong.
    const store = new ActivityStore(() => 1000);
    store.set({ mentions: 7, readAt: 5000 });
    store.set({ mentions: 1, readAt: 4000 });

    assert.equal(store.get().mentions, 7);
  });

  test("clear() marks the reading unavailable rather than zero", () => {
    const store = new ActivityStore(() => 1000);
    store.set({ mentions: 6, readAt: 2000 });
    store.clear(() => 3000);

    assert.equal(store.get().mentions, null, "a departed surface reports nothing, it does not report none");
  });

  test("a throwing subscriber cannot stop the others from being notified", () => {
    const store = new ActivityStore(() => 1000);
    const seen: Array<number | null> = [];
    store.subscribe(() => {
      throw new Error("boom");
    });
    store.subscribe((snapshot: ActivitySnapshot) => seen.push(snapshot.mentions));

    assert.doesNotThrow(() => store.set({ mentions: 3, readAt: 2000 }));
    assert.deepEqual(seen, [3]);
  });
});
