import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { isTrustedDiscordUrl, isTrustedIpcSender } from "../../src/main/security";

describe("isTrustedIpcSender", () => {
  test("accepts trusted Discord origins", () => {
    assert.equal(isTrustedIpcSender("https://discord.com/app"), true);
    assert.equal(isTrustedIpcSender("https://canary.discord.com/app"), true);
  });

  test("rejects any file:// URL other than PulseCord's own compiled offline.html", () => {
    // isTrustedIpcSender pins the allowed file:// URL to its own __dirname at
    // module load time, so any path outside that exact location — including
    // one that merely looks like it, or points elsewhere on disk — must fail.
    assert.equal(isTrustedIpcSender("file:///C:/Windows/System32/anything.html"), false);
    assert.equal(isTrustedIpcSender("file:///etc/passwd"), false);
    assert.equal(isTrustedIpcSender("file://"), false);
  });

  test("rejects non-Discord https origins and other protocols", () => {
    assert.equal(isTrustedIpcSender("https://evil.example/"), false);
    assert.equal(isTrustedIpcSender("http://discord.com/app"), false);
    assert.equal(isTrustedIpcSender("javascript:alert(1)"), false);
    assert.equal(isTrustedIpcSender("about:blank"), false);
  });
});

describe("isTrustedDiscordUrl (re-exported for the main process's own checks)", () => {
  test("is the same allowlist behavior shared/contracts exports", () => {
    assert.equal(isTrustedDiscordUrl("https://discord.com/app"), true);
    assert.equal(isTrustedDiscordUrl("https://discord.com.evil.example/"), false);
  });
});
