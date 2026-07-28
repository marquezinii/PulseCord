import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";

import { PluginRuntime } from "../../../src/renderer/pulsecore/runtime";
import type { PluginDefinition } from "../../../src/renderer/pulsecore/types";
import type { BuiltinPluginId } from "../../../src/shared/contracts";
import { installDom } from "../../helpers/dom-env";
import { FakeBridge } from "../../helpers/fake-bridge";

const PLUGIN_ID = "test-plugin" as BuiltinPluginId;

let cleanupDom: () => void = () => undefined;

beforeEach(() => {
  cleanupDom = installDom().restore;
});

afterEach(() => {
  cleanupDom();
  mock.restoreAll();
});

function definition(overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return {
    id: PLUGIN_ID,
    name: "Test Plugin",
    description: "A plugin used only by tests.",
    version: "0.0.0",
    capabilities: ["dom", "events", "settings", "commands"],
    start: () => undefined,
    ...overrides
  };
}

describe("PluginRuntime: capability gating", () => {
  test("a facet is undefined on the context when its capability was not declared", async () => {
    const bridge = new FakeBridge();
    let seenDom: unknown;
    let seenCommands: unknown;
    const runtime = new PluginRuntime(
      [definition({ capabilities: ["dom"], start: (context) => { seenDom = context.dom; seenCommands = context.commands; } })],
      bridge
    );
    await runtime.setEnabled(PLUGIN_ID, true);
    assert.notEqual(seenDom, undefined);
    assert.equal(seenCommands, undefined);
  });

  test("lifecycle is always present regardless of declared capabilities", async () => {
    const bridge = new FakeBridge();
    let sawLifecycle = false;
    const runtime = new PluginRuntime(
      [definition({ capabilities: [], start: (context) => { sawLifecycle = typeof context.lifecycle.cleanup.add === "function"; } })],
      bridge
    );
    await runtime.setEnabled(PLUGIN_ID, true);
    assert.equal(sawLifecycle, true);
  });
});

describe("PluginRuntime: lifecycle and cleanup", () => {
  test("resources registered via lifecycle/dom/events/commands are all unwound, in reverse order, on stop", async () => {
    const bridge = new FakeBridge();
    const order: string[] = [];
    const runtime = new PluginRuntime(
      [
        definition({
          start(context) {
            context.lifecycle.onDispose(() => order.push("dispose-1"));
            context.dom?.addBodyClass("test-class");
            context.lifecycle.onDispose(() => order.push("dispose-2"));
          }
        })
      ],
      bridge
    );

    await runtime.setEnabled(PLUGIN_ID, true);
    assert.equal(document.documentElement.classList.contains("test-class"), true);

    await runtime.setEnabled(PLUGIN_ID, false);
    assert.equal(document.documentElement.classList.contains("test-class"), false, "addBodyClass cleanup must run");
    assert.deepEqual(order, ["dispose-2", "dispose-1"], "cleanups run in reverse registration order");
  });

  test("addStyle removes its <style> element on stop", async () => {
    const bridge = new FakeBridge();
    const runtime = new PluginRuntime(
      [definition({ start: (context) => context.dom?.addStyle(".x{color:red}") })],
      bridge
    );
    await runtime.setEnabled(PLUGIN_ID, true);
    assert.equal(document.querySelectorAll(`style[data-pulsecord-plugin="${PLUGIN_ID}"]`).length, 1);

    await runtime.setEnabled(PLUGIN_ID, false);
    assert.equal(document.querySelectorAll(`style[data-pulsecord-plugin="${PLUGIN_ID}"]`).length, 0);
  });

  test("commands registered by a plugin stop working once the plugin is stopped", async () => {
    const bridge = new FakeBridge();
    const handler = mock.fn();
    const runtime = new PluginRuntime(
      [definition({ start: (context) => context.commands?.register("go", "Go", handler) })],
      bridge
    );
    await runtime.setEnabled(PLUGIN_ID, true);
    assert.equal(runtime.commands.invoke(`${PLUGIN_ID}:go`), true);

    await runtime.setEnabled(PLUGIN_ID, false);
    assert.equal(runtime.commands.invoke(`${PLUGIN_ID}:go`), false);
  });
});

describe("PluginRuntime: crash isolation", () => {
  test("a throw inside start() marks the plugin as errored and runs whatever cleanup it had registered so far", async () => {
    const bridge = new FakeBridge();
    let cleaned = false;
    const runtime = new PluginRuntime(
      [
        definition({
          start(context) {
            context.lifecycle.onDispose(() => {
              cleaned = true;
            });
            throw new Error("boom during start");
          }
        })
      ],
      bridge
    );

    await assert.rejects(() => runtime.setEnabled(PLUGIN_ID, true));
    assert.equal(cleaned, true);
    assert.equal(runtime.getState(PLUGIN_ID), "error");
    assert.equal(runtime.isEnabled(PLUGIN_ID), false);
  });

  test("a throw inside a later event listener auto-stops only that plugin and leaves others running", async () => {
    const bridge = new FakeBridge();
    const survivorId = "survivor-plugin" as BuiltinPluginId;
    let survivorTicks = 0;

    const runtime = new PluginRuntime(
      [
        definition({
          start(context) {
            context.events?.on("trigger-crash", () => {
              throw new Error("boom at runtime");
            });
          }
        }),
        definition({
          id: survivorId,
          capabilities: ["events"],
          start(context) {
            context.events?.on("trigger-crash", () => {
              survivorTicks += 1;
            });
          }
        })
      ],
      bridge
    );

    await runtime.setEnabled(PLUGIN_ID, true);
    await runtime.setEnabled(survivorId, true);

    runtime.bus.emit("trigger-crash");

    assert.equal(runtime.getState(PLUGIN_ID), "error");
    assert.equal(runtime.isEnabled(PLUGIN_ID), false);
    assert.equal(runtime.getState(survivorId), "active", "the other plugin must be unaffected");
    assert.equal(survivorTicks, 1, "the other plugin's own listener must still have run");
  });

  test("emits plugin:crashed with the failing plugin's id and the error", async () => {
    const bridge = new FakeBridge();
    const crashes: Array<{ id: unknown; error: unknown }> = [];
    const runtime = new PluginRuntime(
      [
        definition({
          start(context) {
            context.lifecycle.setTimeout(() => {
              throw new Error("timer boom");
            }, 0);
          }
        })
      ],
      bridge
    );
    runtime.bus.on("plugin:crashed", (payload) => crashes.push(payload as { id: unknown; error: unknown }));

    await runtime.setEnabled(PLUGIN_ID, true);
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(crashes.length, 1);
    assert.equal(crashes[0]?.id, PLUGIN_ID);
    assert.ok(crashes[0]?.error instanceof Error);
  });
});

describe("PluginRuntime: setEnabled and persistence", () => {
  test("persists the enabled flag through the bridge and keeps the plugin running", async () => {
    const bridge = new FakeBridge();
    const runtime = new PluginRuntime([definition()], bridge);
    await runtime.setEnabled(PLUGIN_ID, true);
    assert.equal(bridge.settings.plugins[PLUGIN_ID], true);
    assert.equal(runtime.isEnabled(PLUGIN_ID), true);
  });

  test("rolls the plugin back to stopped if the bridge rejects the persisted enable", async () => {
    const bridge = new FakeBridge();
    bridge.setPluginEnabledShouldFail = true;
    const runtime = new PluginRuntime([definition()], bridge);

    await assert.rejects(() => runtime.setEnabled(PLUGIN_ID, true));
    assert.equal(runtime.isEnabled(PLUGIN_ID), false);
  });

  test("throws for an id with no matching definition", async () => {
    const bridge = new FakeBridge();
    const runtime = new PluginRuntime([], bridge);
    await assert.rejects(() => runtime.setEnabled(PLUGIN_ID, true));
  });

  test("startConfigured only starts plugins the settings mark enabled, and survives one plugin failing", async () => {
    const bridge = new FakeBridge();
    const okId = "ok-plugin" as BuiltinPluginId;
    const brokenId = "broken-plugin" as BuiltinPluginId;
    const disabledId = "disabled-plugin" as BuiltinPluginId;

    bridge.settings.plugins = { [okId]: true, [brokenId]: true, [disabledId]: false } as never;

    let okStarted = false;
    const runtime = new PluginRuntime(
      [
        definition({ id: okId, start: () => { okStarted = true; } }),
        definition({
          id: brokenId,
          start: () => {
            throw new Error("boom");
          }
        }),
        definition({ id: disabledId, start: () => { throw new Error("must never run"); } })
      ],
      bridge
    );

    await runtime.startConfigured(bridge.settings);

    assert.equal(okStarted, true);
    assert.equal(runtime.isEnabled(okId), true);
    assert.equal(runtime.isEnabled(brokenId), false);
    assert.equal(runtime.isEnabled(disabledId), false);
  });
});

describe("PluginRuntime: settings facet", () => {
  test("get() returns the fallback until set(), and reads back what was set through the bridge", async () => {
    const bridge = new FakeBridge();
    let readBack: unknown;
    const runtime = new PluginRuntime(
      [
        definition({
          async start(context) {
            const before = await context.settings?.get("count", 0);
            await context.settings?.set("count", 5);
            readBack = { before, after: await context.settings?.get("count", 0) };
          }
        })
      ],
      bridge
    );

    await runtime.setEnabled(PLUGIN_ID, true);
    assert.deepEqual(readBack, { before: 0, after: 5 });
    const persisted = bridge.settings.pluginData as Record<string, Record<string, unknown>>;
    assert.equal(persisted[PLUGIN_ID]?.count, 5, "persisted through the bridge, not just in memory");
  });
});
