import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";

import { CommandRegistry } from "../../../src/renderer/pulsecore/command-registry";
import type { BuiltinPluginId } from "../../../src/shared/contracts";

const PLUGIN_A = "plugin-a" as BuiltinPluginId;
const PLUGIN_B = "plugin-b" as BuiltinPluginId;

describe("CommandRegistry", () => {
  test("invoking a registered command runs its handler and returns true", () => {
    const registry = new CommandRegistry();
    const handler = mock.fn();
    registry.register(PLUGIN_A, "toggle", "Toggle thing", handler);
    const invoked = registry.invoke(`${PLUGIN_A}:toggle`);
    assert.equal(invoked, true);
    assert.equal(handler.mock.calls.length, 1);
  });

  test("invoking an unknown command key returns false without throwing", () => {
    const registry = new CommandRegistry();
    assert.equal(registry.invoke("nope:nope"), false);
  });

  test("two different plugins may register the same command id without colliding", () => {
    const registry = new CommandRegistry();
    const handlerA = mock.fn();
    const handlerB = mock.fn();
    registry.register(PLUGIN_A, "toggle", "A toggle", handlerA);
    registry.register(PLUGIN_B, "toggle", "B toggle", handlerB);

    registry.invoke(`${PLUGIN_A}:toggle`);
    assert.equal(handlerA.mock.calls.length, 1);
    assert.equal(handlerB.mock.calls.length, 0);
  });

  test("registering the same id twice for the same plugin throws", () => {
    const registry = new CommandRegistry();
    registry.register(PLUGIN_A, "toggle", "A toggle", () => undefined);
    assert.throws(() => registry.register(PLUGIN_A, "toggle", "A toggle again", () => undefined));
  });

  test("the unregister function returned by register() removes only that command", () => {
    const registry = new CommandRegistry();
    const unregister = registry.register(PLUGIN_A, "toggle", "A toggle", () => undefined);
    registry.register(PLUGIN_A, "other", "A other", () => undefined);

    unregister();
    assert.equal(registry.invoke(`${PLUGIN_A}:toggle`), false);
    assert.equal(registry.invoke(`${PLUGIN_A}:other`), true);
  });

  test("removeAllForPlugin drops every command that plugin owns and none other", () => {
    const registry = new CommandRegistry();
    registry.register(PLUGIN_A, "one", "One", () => undefined);
    registry.register(PLUGIN_A, "two", "Two", () => undefined);
    registry.register(PLUGIN_B, "one", "One (B)", () => undefined);

    registry.removeAllForPlugin(PLUGIN_A);

    assert.equal(registry.invoke(`${PLUGIN_A}:one`), false);
    assert.equal(registry.invoke(`${PLUGIN_A}:two`), false);
    assert.equal(registry.invoke(`${PLUGIN_B}:one`), true);
  });

  test("list() reflects current registrations and never exposes the raw handler", () => {
    const registry = new CommandRegistry();
    registry.register(PLUGIN_A, "toggle", "Toggle thing", () => undefined);
    const [descriptor] = registry.list();
    assert.ok(descriptor);
    assert.equal(descriptor.pluginId, PLUGIN_A);
    assert.equal(descriptor.label, "Toggle thing");
    assert.equal("handler" in descriptor, false);
  });
});
