import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";

import { EventBus } from "../../../src/renderer/pulsecore/event-bus";

describe("EventBus", () => {
  afterEach(() => mock.restoreAll());

  test("delivers a payload to every listener registered for that event type", () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.on("ping", (payload) => received.push(payload));
    bus.on("ping", (payload) => received.push(payload));
    bus.emit("ping", { count: 1 });
    assert.deepEqual(received, [{ count: 1 }, { count: 1 }]);
  });

  test("does not deliver to listeners of a different event type", () => {
    const bus = new EventBus();
    const pong = mock.fn();
    bus.on("pong", pong);
    bus.emit("ping", {});
    assert.equal(pong.mock.calls.length, 0);
  });

  test("on() returns an unsubscribe function that stops future delivery", () => {
    const bus = new EventBus();
    const listener = mock.fn();
    const unsubscribe = bus.on("ping", listener);
    bus.emit("ping");
    unsubscribe();
    bus.emit("ping");
    assert.equal(listener.mock.calls.length, 1);
  });

  test("emit on a type with no listeners is a silent no-op", () => {
    const bus = new EventBus();
    assert.doesNotThrow(() => bus.emit("nothing-registered", { x: 1 }));
  });

  test("a listener that throws does not stop delivery to the other listeners", () => {
    const bus = new EventBus();
    const error = mock.method(console, "error", () => undefined);
    const survivor = mock.fn();
    bus.on("ping", () => {
      throw new Error("boom");
    });
    bus.on("ping", survivor);
    assert.doesNotThrow(() => bus.emit("ping"));
    assert.equal(survivor.mock.calls.length, 1);
    assert.ok(error.mock.calls.length >= 1, "the failure should still be logged somewhere");
  });

  test("a listener that unsubscribes itself mid-emit does not corrupt the current dispatch", () => {
    const bus = new EventBus();
    const secondCallCount = { value: 0 };
    let unsubscribeFirst: () => void = () => undefined;
    unsubscribeFirst = bus.on("ping", () => unsubscribeFirst());
    bus.on("ping", () => {
      secondCallCount.value += 1;
    });
    assert.doesNotThrow(() => bus.emit("ping"));
    assert.equal(secondCallCount.value, 1);
  });
});
