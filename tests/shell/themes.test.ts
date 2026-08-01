import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { renderThemeLibrary, type ThemeLibraryActions } from "../../src/shell/themes";
import { MAX_THEMES, type ThemeSettings } from "../../src/shared/contracts";
import { installDom } from "../helpers/dom-env";

let restoreDom: () => void = () => undefined;
let host: HTMLElement;

beforeEach(() => {
  restoreDom = installDom().restore;
  document.body.innerHTML = '<main id="pulsecord-content"></main>';
  host = document.getElementById("pulsecord-content") as HTMLElement;
});

afterEach(() => restoreDom());

/** Records what the screen asked the main process to do, and what it answers. */
function fakeActions(initial: ThemeSettings) {
  const calls: string[] = [];
  let library: ThemeSettings = structuredClone(initial);

  const actions: ThemeLibraryActions = {
    create(name, css) {
      calls.push(`create:${name}`);
      library.themes.push({ id: `id-${library.themes.length}`, name, css });
      return Promise.resolve(structuredClone(library));
    },
    update(id, name, css) {
      calls.push(`update:${id}:${name}`);
      const theme = library.themes.find((candidate) => candidate.id === id);
      if (theme) Object.assign(theme, { name, css });
      return Promise.resolve(structuredClone(library));
    },
    remove(id) {
      calls.push(`remove:${id}`);
      library.themes = library.themes.filter((theme) => theme.id !== id);
      if (library.activeThemeId === id) library.activeThemeId = null;
      return Promise.resolve(structuredClone(library));
    },
    activate(id) {
      calls.push(`activate:${id ?? "none"}`);
      library.activeThemeId = id;
      return Promise.resolve(structuredClone(library));
    }
  };

  return { actions, calls, current: () => library };
}

const EMPTY: ThemeSettings = { themes: [], activeThemeId: null };

function withThemes(count: number, activeThemeId: string | null = null): ThemeSettings {
  return {
    themes: Array.from({ length: count }, (_unused, index) => ({
      id: `id-${index}`,
      name: `Tema ${index}`,
      css: `.t${index}{color:red}`
    })),
    activeThemeId
  };
}

/** Lets the screen's pending promise chain settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function typeInto(selector: string, value: string): void {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  assert.ok(field, `missing field ${selector}`);
  field.value = value;
  field.dispatchEvent(new Event("input"));
}

describe("renderThemeLibrary", () => {
  test("lists saved themes and shows how many of the cap are used", () => {
    const { actions } = fakeActions(withThemes(2));
    renderThemeLibrary(document, host, withThemes(2), actions);

    assert.equal(host.querySelectorAll(".theme-item").length, 2);
    assert.match(host.querySelector(".theme-list-heading")?.textContent ?? "", new RegExp(`2 de ${MAX_THEMES}`));
  });

  test("says so when the library is empty", () => {
    const { actions } = fakeActions(EMPTY);
    renderThemeLibrary(document, host, EMPTY, actions);

    assert.ok(host.querySelector(".theme-empty"));
  });

  test("refuses to save a theme with no name", () => {
    const { actions, calls } = fakeActions(EMPTY);
    renderThemeLibrary(document, host, EMPTY, actions);

    typeInto('textarea[name="css"]', ".x{color:red}");
    host.querySelector("form")?.dispatchEvent(new Event("submit"));

    assert.deepEqual(calls, [], "nothing should reach the main process");
    assert.match(host.querySelector(".theme-status")?.textContent ?? "", /nome/i);
  });

  test("refuses to save CSS that reaches out to the network", () => {
    const { actions, calls } = fakeActions(EMPTY);
    renderThemeLibrary(document, host, EMPTY, actions);

    typeInto('input[name="name"]', "Remoto");
    typeInto('textarea[name="css"]', '@import "https://evil.example/x.css";');
    host.querySelector("form")?.dispatchEvent(new Event("submit"));

    assert.deepEqual(calls, [], "the screen must not even ask");
    assert.match(host.querySelector(".theme-status")?.textContent ?? "", /import|externos/i);
  });

  test("creates a theme, then edits that same theme instead of creating a second one", async () => {
    const { actions, calls } = fakeActions(EMPTY);
    renderThemeLibrary(document, host, EMPTY, actions);

    typeInto('input[name="name"]', "Roxo");
    typeInto('textarea[name="css"]', ".x{color:red}");
    host.querySelector("form")?.dispatchEvent(new Event("submit"));
    await settle();

    typeInto('textarea[name="css"]', ".x{color:blue}");
    host.querySelector("form")?.dispatchEvent(new Event("submit"));
    await settle();

    assert.deepEqual(calls, ["create:Roxo", "update:id-0:Roxo"]);
  });

  test("applying a theme asks for it, and applying the applied one clears it", async () => {
    const { actions, calls } = fakeActions(withThemes(1));
    renderThemeLibrary(document, host, withThemes(1), actions);

    host.querySelector<HTMLButtonElement>(".theme-toggle")?.click();
    await settle();
    assert.deepEqual(calls, ["activate:id-0"]);

    host.querySelector<HTMLButtonElement>(".theme-toggle")?.click();
    await settle();
    assert.deepEqual(calls, ["activate:id-0", "activate:none"]);
  });

  test("marks the applied theme in the list", () => {
    const { actions } = fakeActions(withThemes(2, "id-1"));
    renderThemeLibrary(document, host, withThemes(2, "id-1"), actions);

    const toggles = [...host.querySelectorAll<HTMLButtonElement>(".theme-toggle")];
    assert.equal(toggles[0]?.classList.contains("on"), false);
    assert.equal(toggles[1]?.classList.contains("on"), true);
    assert.equal(toggles[1]?.textContent, "Aplicado");
  });

  test("removing a theme asks for it and drops it from the list", async () => {
    const { actions, calls } = fakeActions(withThemes(2));
    renderThemeLibrary(document, host, withThemes(2), actions);

    host.querySelector<HTMLButtonElement>(".theme-remove")?.click();
    await settle();

    assert.deepEqual(calls, ["remove:id-0"]);
    assert.equal(host.querySelectorAll(".theme-item").length, 1);
  });

  test("blocks a new theme once the library is full", () => {
    const full = withThemes(MAX_THEMES);
    const { actions, calls } = fakeActions(full);
    renderThemeLibrary(document, host, full, actions);

    assert.equal(host.querySelector<HTMLButtonElement>(".theme-new")?.disabled, true);

    typeInto('input[name="name"]', "Mais um");
    typeInto('textarea[name="css"]', ".x{color:red}");
    host.querySelector("form")?.dispatchEvent(new Event("submit"));

    assert.deepEqual(calls, []);
    assert.match(host.querySelector(".theme-status")?.textContent ?? "", new RegExp(String(MAX_THEMES)));
  });

  test("reports a failed save instead of pretending it worked", async () => {
    const { actions } = fakeActions(EMPTY);
    actions.create = () => Promise.reject(new Error("nope"));
    renderThemeLibrary(document, host, EMPTY, actions);

    typeInto('input[name="name"]', "Roxo");
    typeInto('textarea[name="css"]', ".x{color:red}");
    host.querySelector("form")?.dispatchEvent(new Event("submit"));
    await settle();

    const status = host.querySelector<HTMLElement>(".theme-status");
    assert.equal(status?.dataset.kind, "error");
    assert.equal(host.querySelectorAll(".theme-item").length, 0, "a failed create must not appear as saved");
  });

  test("clicking a saved theme loads it into the editor", () => {
    const { actions } = fakeActions(withThemes(2));
    renderThemeLibrary(document, host, withThemes(2), actions);

    [...host.querySelectorAll<HTMLButtonElement>(".theme-open")][1]?.click();

    assert.equal(host.querySelector<HTMLInputElement>('input[name="name"]')?.value, "Tema 1");
    assert.equal(host.querySelector<HTMLTextAreaElement>('textarea[name="css"]')?.value, ".t1{color:red}");
  });

  test("theme names are rendered as text, never as markup", () => {
    const library: ThemeSettings = {
      themes: [{ id: "x", name: "<img src=x onerror=alert(1)>", css: ".x{}" }],
      activeThemeId: null
    };
    const { actions } = fakeActions(library);
    renderThemeLibrary(document, host, library, actions);

    assert.equal(host.querySelectorAll("img").length, 0);
    assert.equal(host.querySelector(".theme-open")?.textContent, "<img src=x onerror=alert(1)>");
  });
});
