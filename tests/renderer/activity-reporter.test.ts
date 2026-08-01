import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";

import { mountActivityReporter } from "../../src/renderer/activity-reporter";
import type { ActivitySnapshot } from "../../src/shared/contracts";
import { installDom } from "../helpers/dom-env";

let restoreDom: () => void = () => undefined;

beforeEach(() => {
  restoreDom = installDom().restore;
});

afterEach(() => restoreDom());

/** Waits past the reporter's debounce window. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 400));
}

describe("mountActivityReporter", () => {
  test("reports the title's count as soon as it mounts", () => {
    document.title = "(4) Discord";
    const reports: ActivitySnapshot[] = [];

    const reporter = mountActivityReporter((snapshot) => reports.push(snapshot), () => 1000);
    reporter.destroy();

    assert.deepEqual(reports, [{ mentions: 4, readAt: 1000 }]);
  });

  test("reports an unreadable title as unavailable, never as zero", () => {
    document.title = "Carregando…";
    const reports: ActivitySnapshot[] = [];

    const reporter = mountActivityReporter((snapshot) => reports.push(snapshot), () => 1000);
    reporter.destroy();

    assert.equal(reports[0]?.mentions, null);
  });

  test("does not re-report an unchanged reading", () => {
    document.title = "(2) Discord";
    const reports: ActivitySnapshot[] = [];

    const reporter = mountActivityReporter((snapshot) => reports.push(snapshot), () => 1000);
    reporter.refresh();
    reporter.refresh();
    reporter.destroy();

    assert.equal(reports.length, 1);
  });

  test("reports again once the count actually changes", () => {
    document.title = "(1) Discord";
    const reports: ActivitySnapshot[] = [];

    const reporter = mountActivityReporter((snapshot) => reports.push(snapshot), () => 1000);
    document.title = "(6) Discord";
    reporter.refresh();
    reporter.destroy();

    assert.deepEqual(
      reports.map((snapshot) => snapshot.mentions),
      [1, 6]
    );
  });

  test("picks up a title Discord rewrites after mount", async () => {
    document.title = "Discord";
    const reports: ActivitySnapshot[] = [];

    const reporter = mountActivityReporter((snapshot) => reports.push(snapshot), () => 1000);
    document.title = "(9) Discord";
    await settle();
    reporter.destroy();

    assert.deepEqual(
      reports.map((snapshot) => snapshot.mentions),
      [0, 9]
    );
  });

  test("stops reporting once destroyed", async () => {
    document.title = "Discord";
    const reports: ActivitySnapshot[] = [];

    const reporter = mountActivityReporter((snapshot) => reports.push(snapshot), () => 1000);
    reporter.destroy();

    document.title = "(3) Discord";
    await settle();

    assert.deepEqual(
      reports.map((snapshot) => snapshot.mentions),
      [0]
    );
  });
});
