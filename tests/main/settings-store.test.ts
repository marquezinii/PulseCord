import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { SettingsStore } from "../../src/main/settings-store";
import { MAX_THEMES, type Theme } from "../../src/shared/contracts";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "pulsecord-settings-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("SettingsStore: fresh state", () => {
  test("returns defaults when no settings file exists yet", async () => {
    const store = new SettingsStore(dir);
    const settings = await store.get();
    assert.equal(settings.schemaVersion, 5);
    assert.deepEqual(settings.shortcuts.bindings, []);
    assert.deepEqual(settings.theme, { themes: [], activeThemeId: null });
  });

  test("get() returns a deep copy, not a live reference to internal state", async () => {
    const store = new SettingsStore(dir);
    const first = await store.get();
    first.theme.activeThemeId = "mutated";
    const second = await store.get();
    assert.equal(second.theme.activeThemeId, null);
  });
});

describe("SettingsStore: shortcuts", () => {
  test("creates, updates, and removes a shortcut binding, persisting each step", async () => {
    const store = new SettingsStore(dir);
    await store.createShortcut({ id: "s1", action: "toggle-panel", accelerator: "Control+K" });

    const reloaded = new SettingsStore(dir);
    let settings = await reloaded.get();
    assert.deepEqual(settings.shortcuts.bindings, [{ id: "s1", action: "toggle-panel", accelerator: "Control+K" }]);

    await reloaded.updateShortcut("s1", "toggle-mute", "Control+M");
    settings = await reloaded.get();
    assert.deepEqual(settings.shortcuts.bindings, [{ id: "s1", action: "toggle-mute", accelerator: "Control+M" }]);

    await reloaded.removeShortcut("s1");
    settings = await reloaded.get();
    assert.deepEqual(settings.shortcuts.bindings, []);
  });

  test("rejects a duplicate id, action, or accelerator", async () => {
    const store = new SettingsStore(dir);
    await store.createShortcut({ id: "s1", action: "toggle-panel", accelerator: "Control+K" });

    await assert.rejects(() => store.createShortcut({ id: "s1", action: "toggle-mute", accelerator: "Control+M" }));
    await assert.rejects(() => store.createShortcut({ id: "s2", action: "toggle-panel", accelerator: "Control+M" }));
    await assert.rejects(() => store.createShortcut({ id: "s2", action: "toggle-mute", accelerator: "Control+K" }));
  });

  test("rejects a create once every currently-defined ShortcutAction already has a binding", async () => {
    // sanitizeSettings deduplicates bindings by action (see contracts.test.ts),
    // so with only 11 ShortcutActions shipped today the practical ceiling on
    // real distinct bindings is 11, not MAX_SHORTCUT_BINDINGS (64) — this
    // documents that current, lower ceiling via the public API.
    const store = new SettingsStore(dir);
    const settings = await store.get();
    const actions = Object.freeze([
      "toggle-panel",
      "toggle-mute",
      "toggle-deafen",
      "open-quick-switcher",
      "search-channel",
      "search-global",
      "toggle-inbox",
      "toggle-members",
      "mark-channel-read",
      "mark-server-read",
      "upload-file"
    ] as const);
    settings.shortcuts.bindings = actions.map((action, index) => ({
      id: `seed-${index}`,
      action,
      accelerator: `Control+F${index}`
    }));
    await writeFile(path.join(dir, "pulsecord-settings.json"), JSON.stringify(settings), "utf8");

    const reloaded = new SettingsStore(dir);
    const loaded = await reloaded.get();
    assert.equal(loaded.shortcuts.bindings.length, actions.length, "sanitizer must accept all 11 distinct actions");

    await assert.rejects(
      () => reloaded.createShortcut({ id: "one-too-many", action: "toggle-panel", accelerator: "Control+Z" }),
      /already has a shortcut/
    );
  });

  test("updateShortcut and removeShortcut reject an unknown id", async () => {
    const store = new SettingsStore(dir);
    await assert.rejects(() => store.updateShortcut("missing", "toggle-panel", "Control+K"));
    await assert.rejects(() => store.removeShortcut("missing"));
  });
});

describe("SettingsStore: theme library", () => {
  const theme = (id: string, name = id): Theme => ({ id, name, css: `.${id}{color:red}` });

  test("persists a created theme across store instances", async () => {
    const store = new SettingsStore(dir);
    await store.createTheme(theme("alpha"));

    const reloaded = new SettingsStore(dir);
    const settings = await reloaded.get();
    assert.deepEqual(settings.theme.themes, [theme("alpha")]);
    assert.equal(settings.theme.activeThemeId, null, "creating a theme does not apply it");
  });

  test("activating a theme records it, and activating null clears it", async () => {
    const store = new SettingsStore(dir);
    await store.createTheme(theme("alpha"));

    let settings = await store.activateTheme("alpha");
    assert.equal(settings.theme.activeThemeId, "alpha");

    settings = await store.activateTheme(null);
    assert.equal(settings.theme.activeThemeId, null);
  });

  test("updating a theme keeps its ID and its applied state", async () => {
    const store = new SettingsStore(dir);
    await store.createTheme(theme("alpha"));
    await store.activateTheme("alpha");

    const settings = await store.updateTheme("alpha", "Renomeado", ".x{color:blue}");
    assert.deepEqual(settings.theme.themes, [{ id: "alpha", name: "Renomeado", css: ".x{color:blue}" }]);
    assert.equal(settings.theme.activeThemeId, "alpha");
  });

  test("removing the applied theme leaves nothing applied", async () => {
    const store = new SettingsStore(dir);
    await store.createTheme(theme("alpha"));
    await store.activateTheme("alpha");

    const settings = await store.removeTheme("alpha");
    assert.deepEqual(settings.theme.themes, []);
    assert.equal(settings.theme.activeThemeId, null, "a deleted theme must not stay applied");
  });

  test("removing a theme leaves a different applied theme alone", async () => {
    const store = new SettingsStore(dir);
    await store.createTheme(theme("alpha"));
    await store.createTheme(theme("beta"));
    await store.activateTheme("beta");

    const settings = await store.removeTheme("alpha");
    assert.equal(settings.theme.activeThemeId, "beta");
  });

  test("rejects a duplicate ID, an unknown ID, and going past the theme limit", async () => {
    const store = new SettingsStore(dir);
    await store.createTheme(theme("alpha"));

    await assert.rejects(() => store.createTheme(theme("alpha")), /already exists/);
    await assert.rejects(() => store.updateTheme("missing", "x", ".x{}"), /not found/);
    await assert.rejects(() => store.removeTheme("missing"), /not found/);
    await assert.rejects(() => store.activateTheme("missing"), /not found/);

    for (let index = 1; index < MAX_THEMES; index += 1) await store.createTheme(theme(`t${index}`));
    await assert.rejects(() => store.createTheme(theme("overflow")), /limit/);
  });

  test("getPluginData returns {} for a plugin with no stored data", async () => {
    const store = new SettingsStore(dir);
    const data = await store.getPluginData("does-not-exist" as never);
    assert.deepEqual(data, {});
  });
});

describe("SettingsStore: corruption recovery", () => {
  test("quarantines an unparsable settings file and falls back to defaults instead of throwing", async () => {
    const settingsPath = path.join(dir, "pulsecord-settings.json");
    await writeFile(settingsPath, "{ this is not valid JSON", "utf8");

    const store = new SettingsStore(dir);
    const settings = await store.get();
    assert.equal(settings.schemaVersion, 5);
    assert.deepEqual(settings.shortcuts.bindings, []);

    const entries = await readdir(dir);
    const quarantined = entries.filter((name) => name.startsWith("pulsecord-settings.json.corrupt-"));
    assert.equal(quarantined.length, 1);

    const preserved = await readFile(path.join(dir, quarantined[0] ?? ""), "utf8");
    assert.equal(preserved, "{ this is not valid JSON");
  });

  test("keeps only the 3 most recent quarantine files", async () => {
    const settingsPath = path.join(dir, "pulsecord-settings.json");

    for (let index = 0; index < 5; index += 1) {
      await writeFile(settingsPath, `not json #${index}`, "utf8");
      const store = new SettingsStore(dir);
      await store.get();
      // Ensure each quarantine file gets a distinct millisecond timestamp.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }

    const entries = (await readdir(dir)).filter((name) => name.startsWith("pulsecord-settings.json.corrupt-"));
    assert.equal(entries.length, 3, "old quarantine files beyond the 3 most recent must be pruned");
  });

  test("propagates a real filesystem error instead of silently defaulting", async () => {
    // A directory where the settings file should be is not a corrupt-JSON
    // case; SettingsStore should surface it rather than eat it as if the
    // file simply did not exist yet.
    await mkdir(path.join(dir, "pulsecord-settings.json"));

    const store = new SettingsStore(dir);
    await assert.rejects(() => store.get());
  });
});
