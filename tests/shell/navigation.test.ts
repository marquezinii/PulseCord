import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { SHELL_DESTINATIONS, mountShellNavigation } from "../../src/shell/navigation";
import type { RuntimeEnvironment } from "../../src/shared/contracts";
import { installDom } from "../helpers/dom-env";

const ENVIRONMENT: RuntimeEnvironment = { appVersion: "9.9.9-test", platform: "win32", safeMode: false };

let restoreDom: () => void = () => undefined;

beforeEach(() => {
  restoreDom = installDom().restore;
  document.body.innerHTML = '<aside id="pulsecord-nav"></aside>';
});

afterEach(() => restoreDom());

describe("mountShellNavigation", () => {
  test("renders one button per declared destination", () => {
    mountShellNavigation(document, ENVIRONMENT);
    assert.equal(document.querySelectorAll("button.destination").length, SHELL_DESTINATIONS.length);
  });

  test("marks unbuilt destinations disabled so the rail never offers a screen that does not exist", () => {
    mountShellNavigation(document, ENVIRONMENT);

    for (const destination of SHELL_DESTINATIONS) {
      const button = document.querySelector<HTMLButtonElement>(`[data-destination="${destination.id}"]`);
      assert.ok(button, `missing button for ${destination.id}`);
      assert.equal(button.disabled, !destination.available, `wrong enabled state for ${destination.id}`);
    }
  });

  test("Discord is the only destination available in this milestone, and is the current one", () => {
    mountShellNavigation(document, ENVIRONMENT);

    const available = SHELL_DESTINATIONS.filter((destination) => destination.available);
    assert.deepEqual(
      available.map((destination) => destination.id),
      ["discord"]
    );

    const discord = document.querySelector('[data-destination="discord"]');
    assert.equal(discord?.getAttribute("aria-current"), "page");
  });

  test("every destination button carries an accessible label", () => {
    mountShellNavigation(document, ENVIRONMENT);
    for (const button of document.querySelectorAll("button.destination")) {
      assert.ok((button.getAttribute("aria-label") ?? "").length > 0);
    }
  });

  test("shows a safe-mode badge only while running in safe mode", () => {
    mountShellNavigation(document, ENVIRONMENT);
    assert.equal(document.querySelector(".safe-badge"), null);

    mountShellNavigation(document, { ...ENVIRONMENT, safeMode: true });
    assert.ok(document.querySelector(".safe-badge"));
  });

  test("remounting replaces the previous rail instead of appending a second copy", () => {
    mountShellNavigation(document, ENVIRONMENT);
    mountShellNavigation(document, ENVIRONMENT);
    assert.equal(document.querySelectorAll("button.destination").length, SHELL_DESTINATIONS.length);
  });

  test("still renders when the runtime environment could not be read", () => {
    mountShellNavigation(document, undefined);
    assert.equal(document.querySelectorAll("button.destination").length, SHELL_DESTINATIONS.length);
    assert.equal(document.querySelector(".safe-badge"), null);
  });

  test("throws if the document has no rail to mount into, rather than failing silently", () => {
    document.body.innerHTML = "";
    assert.throws(() => mountShellNavigation(document, ENVIRONMENT));
  });
});
