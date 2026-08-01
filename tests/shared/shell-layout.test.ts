import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SHELL_NAV_WIDTH, computeServiceViewBounds } from "../../src/shared/shell-layout";

describe("computeServiceViewBounds", () => {
  test("fills the content area to the right of the navigation rail", () => {
    assert.deepEqual(computeServiceViewBounds({ width: 1280, height: 820 }), {
      x: SHELL_NAV_WIDTH,
      y: 0,
      width: 1280 - SHELL_NAV_WIDTH,
      height: 820
    });
  });

  test("collapses to zero width instead of going negative when the window is narrower than the rail", () => {
    const bounds = computeServiceViewBounds({ width: 10, height: 400 });
    assert.equal(bounds.width, 0);
    assert.equal(bounds.height, 400);
  });

  test("handles the zero-sized content area Electron reports while minimizing", () => {
    assert.deepEqual(computeServiceViewBounds({ width: 0, height: 0 }), {
      x: SHELL_NAV_WIDTH,
      y: 0,
      width: 0,
      height: 0
    });
  });

  test("floors fractional sizes so Electron never receives sub-pixel bounds", () => {
    const bounds = computeServiceViewBounds({ width: 1000.9, height: 700.4 });
    assert.equal(bounds.width, 1000 - SHELL_NAV_WIDTH);
    assert.equal(bounds.height, 700);
  });
});
