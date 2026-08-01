import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { LOCAL_PAGE_FILENAMES, isTrustedDiscordUrl, isTrustedIpcSender, localPageUrls } from "../../src/main/security";

describe("isTrustedIpcSender", () => {
  test("accepts trusted Discord origins", () => {
    assert.equal(isTrustedIpcSender("https://discord.com/app"), true);
    assert.equal(isTrustedIpcSender("https://canary.discord.com/app"), true);
  });

  test("rejects any file:// URL other than PulseCord's own compiled local pages", () => {
    // isTrustedIpcSender pins the allowed file:// URLs to its own __dirname at
    // module load time, so any path outside those exact locations — including
    // one that merely looks like them, or points elsewhere on disk — must fail.
    assert.equal(isTrustedIpcSender("file:///C:/Windows/System32/anything.html"), false);
    assert.equal(isTrustedIpcSender("file:///etc/passwd"), false);
    assert.equal(isTrustedIpcSender("file://"), false);
    assert.equal(isTrustedIpcSender("file:///C:/elsewhere/shell.html"), false, "right filename, wrong directory");
  });
});

describe("localPageUrls", () => {
  test("covers exactly the shell chrome and the offline fallback", () => {
    // The shell window and the embedded Discord view are separate renderer
    // contexts, so both local pages PulseCord ships must be named explicitly.
    assert.deepEqual([...LOCAL_PAGE_FILENAMES].sort(), ["offline.html", "shell.html"]);
  });

  test("builds absolute file URLs under the given directory, and nothing else", () => {
    const urls = localPageUrls("/opt/pulsecord/dist");
    assert.equal(urls.size, LOCAL_PAGE_FILENAMES.length);
    for (const url of urls) {
      assert.match(url, /^file:\/\/\//);
      assert.match(url, /\/(shell|offline)\.html$/);
    }
  });

  test("two different install directories never produce overlapping trusted URLs", () => {
    const first = localPageUrls("/opt/pulsecord/dist");
    const second = localPageUrls("/tmp/attacker");
    for (const url of second) assert.equal(first.has(url), false);
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
