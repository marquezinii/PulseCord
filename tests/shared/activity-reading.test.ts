import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readMentionsFromTitle } from "../../src/shared/activity-reading";
import { MAX_OBSERVED_MENTIONS } from "../../src/shared/contracts";

describe("readMentionsFromTitle", () => {
  test("reads the count Discord puts in front of its title", () => {
    assert.equal(readMentionsFromTitle("(3) Discord"), 3);
    assert.equal(readMentionsFromTitle("(1) #geral | FiveMCleaner | Discord"), 1);
  });

  test("reads a title with no prefix as an observed zero", () => {
    assert.equal(readMentionsFromTitle("Discord"), 0);
    assert.equal(readMentionsFromTitle("#geral | FiveMCleaner | Discord"), 0);
  });

  test("returns null — not zero — for a title it does not recognise", () => {
    // The distinction is the whole point: a zero claims Discord reported no
    // mentions, while null admits PulseCord could not tell either way.
    assert.equal(readMentionsFromTitle(""), null);
    assert.equal(readMentionsFromTitle("Carregando…"), null);
    assert.equal(readMentionsFromTitle("Sem conexão"), null);
  });

  test("handles Discord's overflow and grouped-thousands formatting", () => {
    assert.equal(readMentionsFromTitle("(99+) Discord"), 99);
    assert.equal(readMentionsFromTitle("(1,234) Discord"), 1234);
    assert.equal(readMentionsFromTitle("(1.234) Discord"), 1234);
  });

  test("clamps an implausible count rather than passing it through", () => {
    assert.equal(readMentionsFromTitle("(99999999) Discord"), MAX_OBSERVED_MENTIONS);
  });

  test("tolerates leading whitespace around the prefix", () => {
    assert.equal(readMentionsFromTitle("  (7) Discord"), 7);
  });

  test("ignores a parenthesised number that is not the unread prefix", () => {
    // A channel named "(2) something" must not be mistaken for two mentions
    // just because the digits appear somewhere in the title.
    assert.equal(readMentionsFromTitle("#canal (2) | Discord"), 0);
  });
});
