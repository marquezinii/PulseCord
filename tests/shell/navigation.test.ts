import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { SHELL_DESTINATIONS, mountShellNavigation, type NavigationOptions } from "../../src/shell/navigation";
import type { RuntimeEnvironment, ShellDestinationId } from "../../src/shared/contracts";
import { installDom } from "../helpers/dom-env";

const ENVIRONMENT: RuntimeEnvironment = { appVersion: "9.9.9-test", platform: "win32", safeMode: false };

let restoreDom: () => void = () => undefined;

beforeEach(() => {
  restoreDom = installDom().restore;
  document.body.innerHTML = '<aside id="pulsecord-nav"></aside>';
});

afterEach(() => restoreDom());

function options(overrides: Partial<NavigationOptions> = {}): NavigationOptions {
  return { initial: "discord", onSelect: () => undefined, ...overrides };
}

describe("mountShellNavigation", () => {
  test("renders one button per declared destination", () => {
    mountShellNavigation(document, ENVIRONMENT, options());
    assert.equal(document.querySelectorAll("button.destination").length, SHELL_DESTINATIONS.length);
  });

  test("marks unbuilt destinations disabled so the rail never offers a screen that does not exist", () => {
    mountShellNavigation(document, ENVIRONMENT, options());

    for (const destination of SHELL_DESTINATIONS) {
      const button = document.querySelector<HTMLButtonElement>(`[data-destination="${destination.id}"]`);
      assert.ok(button, `missing button for ${destination.id}`);
      assert.equal(button.disabled, !destination.available, `wrong enabled state for ${destination.id}`);
    }
  });

  test("Discord and Activity are the destinations built so far", () => {
    const available = SHELL_DESTINATIONS.filter((destination) => destination.available);
    assert.deepEqual(
      available.map((destination) => destination.id),
      ["discord", "activity"]
    );
  });

  test("marks the initial destination as the current one", () => {
    mountShellNavigation(document, ENVIRONMENT, options({ initial: "activity" }));
    assert.equal(document.querySelector('[data-destination="activity"]')?.getAttribute("aria-current"), "page");
    assert.equal(document.querySelector('[data-destination="discord"]')?.getAttribute("aria-current"), null);
  });

  test("clicking an available destination reports it once", () => {
    const selected: ShellDestinationId[] = [];
    mountShellNavigation(document, ENVIRONMENT, options({ onSelect: (id) => selected.push(id) }));

    document.querySelector<HTMLButtonElement>('[data-destination="activity"]')?.click();
    assert.deepEqual(selected, ["activity"]);
  });

  test("a disabled destination reports nothing when clicked", () => {
    const selected: ShellDestinationId[] = [];
    mountShellNavigation(document, ENVIRONMENT, options({ onSelect: (id) => selected.push(id) }));

    document.querySelector<HTMLButtonElement>('[data-destination="themes"]')?.click();
    assert.deepEqual(selected, []);
  });

  test("setActive moves the current marker without reporting a selection", () => {
    const selected: ShellDestinationId[] = [];
    const navigation = mountShellNavigation(document, ENVIRONMENT, options({ onSelect: (id) => selected.push(id) }));

    navigation.setActive("activity");

    assert.equal(document.querySelector('[data-destination="activity"]')?.getAttribute("aria-current"), "page");
    assert.equal(document.querySelector('[data-destination="discord"]')?.getAttribute("aria-current"), null);
    assert.deepEqual(selected, [], "moving the marker is not a user selection");
  });

  test("every destination button carries an accessible label", () => {
    mountShellNavigation(document, ENVIRONMENT, options());
    for (const button of document.querySelectorAll("button.destination")) {
      assert.ok((button.getAttribute("aria-label") ?? "").length > 0);
    }
  });

  test("shows a safe-mode badge only while running in safe mode", () => {
    mountShellNavigation(document, ENVIRONMENT, options());
    assert.equal(document.querySelector(".safe-badge"), null);

    mountShellNavigation(document, { ...ENVIRONMENT, safeMode: true }, options());
    assert.ok(document.querySelector(".safe-badge"));
  });

  test("remounting replaces the previous rail instead of appending a second copy", () => {
    mountShellNavigation(document, ENVIRONMENT, options());
    mountShellNavigation(document, ENVIRONMENT, options());
    assert.equal(document.querySelectorAll("button.destination").length, SHELL_DESTINATIONS.length);
  });

  test("still renders when the runtime environment could not be read", () => {
    mountShellNavigation(document, undefined, options());
    assert.equal(document.querySelectorAll("button.destination").length, SHELL_DESTINATIONS.length);
    assert.equal(document.querySelector(".safe-badge"), null);
  });

  test("throws if the document has no rail to mount into, rather than failing silently", () => {
    document.body.innerHTML = "";
    assert.throws(() => mountShellNavigation(document, ENVIRONMENT, options()));
  });
});
