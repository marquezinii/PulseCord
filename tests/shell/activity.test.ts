import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { renderActivityScreen } from "../../src/shell/activity";
import { DEFAULT_SETTINGS, type AppSettings, type RuntimeEnvironment } from "../../src/shared/contracts";
import { installDom } from "../helpers/dom-env";

const ENVIRONMENT: RuntimeEnvironment = { appVersion: "9.9.9-test", platform: "win32", safeMode: false };

let restoreDom: () => void = () => undefined;
let host: HTMLElement;

beforeEach(() => {
  restoreDom = installDom().restore;
  document.body.innerHTML = '<main id="pulsecord-content"></main>';
  host = document.getElementById("pulsecord-content") as HTMLElement;
});

afterEach(() => restoreDom());

function render(settings: AppSettings | undefined = structuredClone(DEFAULT_SETTINGS), onOpenDiscord = () => undefined) {
  return renderActivityScreen(document, host, { environment: ENVIRONMENT, settings, onOpenDiscord });
}

describe("renderActivityScreen", () => {
  test("shows an observed count as a number", () => {
    const view = render();
    view.update({ mentions: 5, readAt: 1000 });

    assert.equal(host.querySelector(".metric")?.textContent, "5");
  });

  test("shows an observed zero as zero, not as unavailable", () => {
    const view = render();
    view.update({ mentions: 0, readAt: 1000 });

    const metric = host.querySelector(".metric");
    assert.equal(metric?.textContent, "0");
    assert.equal(metric?.classList.contains("muted"), false);
  });

  test("never renders a number when nothing could be read", () => {
    // The failure this guards against is showing a confident "0" for a state
    // PulseCord never observed.
    const view = render();
    view.update({ mentions: null, readAt: 1000 });

    const metric = host.querySelector(".metric");
    assert.equal(metric?.textContent, "—");
    assert.equal(metric?.classList.contains("muted"), true);
    assert.match(host.querySelector(".caption")?.textContent ?? "", /não foi possível/i);
  });

  test("explains that no Discord credential or API is used when the reading fails", () => {
    const view = render();
    view.update({ mentions: null, readAt: 1000 });

    const caption = host.querySelector(".caption")?.textContent ?? "";
    assert.match(caption, /credenciais/i);
  });

  test("recovers from unavailable back to a real count", () => {
    const view = render();
    view.update({ mentions: null, readAt: 1000 });
    view.update({ mentions: 2, readAt: 2000 });

    const metric = host.querySelector(".metric");
    assert.equal(metric?.textContent, "2");
    assert.equal(metric?.classList.contains("muted"), false);
  });

  test("uses singular wording for exactly one mention", () => {
    const view = render();
    view.update({ mentions: 1, readAt: 1000 });

    const caption = host.querySelector(".caption")?.textContent ?? "";
    assert.match(caption, /^menção não lida/);
  });

  test("the open-Discord button reports the intent to navigate", () => {
    let opened = 0;
    const view = render(structuredClone(DEFAULT_SETTINGS), () => {
      opened += 1;
    });
    view.update({ mentions: 0, readAt: 1000 });

    host.querySelector<HTMLButtonElement>("button.primary")?.click();
    assert.equal(opened, 1);
  });

  test("reports PulseCord's own state from settings", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.theme.themes = [{ id: "alpha", name: "Meu roxo", css: ".x{color:red}" }];
    settings.theme.activeThemeId = "alpha";
    settings.shortcuts.bindings = [{ id: "a", action: "toggle-panel", accelerator: "Control+K" }];

    render(settings);

    const facts = host.querySelector(".facts")?.textContent ?? "";
    assert.match(facts, /9\.9\.9-test/);
    assert.match(facts, /1 configurado/);
    assert.match(facts, /Meu roxo/, "the applied theme is named, not just flagged on");
  });

  test("says no theme is applied when none is", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.theme.themes = [{ id: "alpha", name: "Meu roxo", css: ".x{color:red}" }];

    render(settings);
    assert.match(host.querySelector(".facts")?.textContent ?? "", /Nenhum/);
  });

  test("still renders when settings could not be read", () => {
    const view = render(undefined);
    view.update({ mentions: 3, readAt: 1000 });

    assert.equal(host.querySelector(".metric")?.textContent, "3");
    assert.ok(host.querySelector(".facts"), "the self card still lists what it does know");
  });

  test("re-rendering replaces the screen instead of stacking a second copy", () => {
    render();
    render();
    assert.equal(host.querySelectorAll(".screen").length, 1);
  });
});
