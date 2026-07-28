import assert from "node:assert/strict";
import { afterEach, describe, mock, test } from "node:test";

import { configureDesktopIdentity, createDesktopUserAgent } from "../../src/main/desktop-identity";

interface CapturedHandler {
  (
    details: { requestHeaders: Record<string, string> },
    callback: (response: { requestHeaders: Record<string, string> }) => void
  ): void;
}

function fakeSession(): { setUserAgentCalls: string[]; onBeforeSendHeaders: CapturedHandler[]; session: unknown } {
  const setUserAgentCalls: string[] = [];
  const onBeforeSendHeaders: CapturedHandler[] = [];
  const session = {
    setUserAgent: (userAgent: string) => setUserAgentCalls.push(userAgent),
    webRequest: {
      onBeforeSendHeaders: (_filter: unknown, handler: CapturedHandler) => onBeforeSendHeaders.push(handler)
    }
  };
  return { setUserAgentCalls, onBeforeSendHeaders, session };
}

function runHeaderRewrite(
  handler: CapturedHandler,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    handler({ requestHeaders: headers }, (response) => resolve(response.requestHeaders));
  });
}

describe("createDesktopUserAgent", () => {
  test("embeds a PulseCord product token alongside a Chromium-shaped UA string", () => {
    const userAgent = createDesktopUserAgent("1.2.3");
    assert.match(userAgent, /^Mozilla\/5\.0 /);
    assert.match(userAgent, /Chrome\/\d+\.\d+\.\d+\.\d+/);
    assert.match(userAgent, /PulseCord\/1\.2\.3$/);
  });
});

describe("configureDesktopIdentity", () => {
  afterEach(() => mock.restoreAll());

  test("sets the session user agent", () => {
    const { session, setUserAgentCalls } = fakeSession();
    configureDesktopIdentity(session as never, "PulseCord-UA/1.0");
    assert.deepEqual(setUserAgentCalls, ["PulseCord-UA/1.0"]);
  });

  test("rewrites browser/browser_user_agent inside X-Super-Properties on Discord API requests", async () => {
    const { session, onBeforeSendHeaders } = fakeSession();
    configureDesktopIdentity(session as never, "PulseCord-UA/1.0");
    const handler = onBeforeSendHeaders[0];
    assert.ok(handler);

    const original = { browser: "Chrome", browser_user_agent: "some-browser-ua", os: "Windows" };
    const encoded = Buffer.from(JSON.stringify(original), "utf8").toString("base64");

    const rewritten = await runHeaderRewrite(handler, { "X-Super-Properties": encoded, "Content-Type": "application/json" });

    const decoded = JSON.parse(Buffer.from(rewritten["X-Super-Properties"] ?? "", "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    assert.equal(decoded.browser, "Discord Client");
    assert.equal(decoded.browser_user_agent, "PulseCord-UA/1.0");
    assert.equal(decoded.os, "Windows", "unrelated fields must survive untouched");
    assert.equal(rewritten["Content-Type"], "application/json", "unrelated headers must survive untouched");
  });

  test("is a no-op when the header is absent", async () => {
    const { session, onBeforeSendHeaders } = fakeSession();
    configureDesktopIdentity(session as never, "PulseCord-UA/1.0");
    const handler = onBeforeSendHeaders[0];
    assert.ok(handler);

    const rewritten = await runHeaderRewrite(handler, { "Content-Type": "application/json" });
    assert.deepEqual(rewritten, { "Content-Type": "application/json" });
  });

  test("passes malformed X-Super-Properties through untouched and warns about it at least once instead of throwing", async () => {
    const warn = mock.method(console, "warn", () => undefined);
    const { session, onBeforeSendHeaders } = fakeSession();
    configureDesktopIdentity(session as never, "PulseCord-UA/1.0");
    const handler = onBeforeSendHeaders[0];
    assert.ok(handler);

    const garbage = "not-valid-base64-json!!";
    const rewritten = await runHeaderRewrite(handler, { "X-Super-Properties": garbage });
    assert.equal(rewritten["X-Super-Properties"], garbage, "must pass through unmodified rather than corrupt the header");
    assert.ok(warn.mock.calls.length >= 1, "should warn about the shape mismatch instead of failing silently");
  });

  test("does not warn again for further malformed requests once it already warned once", async () => {
    // desktop-identity.ts tracks "already warned" at module scope, so once
    // the previous test tripped it, every later mismatch — of any shape —
    // must stay quiet. This documents that "warn once" is truly process-wide
    // and not merely deduplicated per distinct failure reason.
    const warn = mock.method(console, "warn", () => undefined);
    const { session, onBeforeSendHeaders } = fakeSession();
    configureDesktopIdentity(session as never, "PulseCord-UA/1.0");
    const handler = onBeforeSendHeaders[0];
    assert.ok(handler);

    const arrayShaped = Buffer.from(JSON.stringify([1, 2, 3]), "utf8").toString("base64");
    await runHeaderRewrite(handler, { "X-Super-Properties": arrayShaped });
    assert.equal(warn.mock.calls.length, 0);
  });

  test("registers exactly one header-rewrite handler per configureDesktopIdentity call", () => {
    // The actual URL-pattern filter passed to onBeforeSendHeaders is Electron's
    // own matching responsibility (untestable without a real session), so this
    // only guards against the registration itself silently disappearing.
    const { onBeforeSendHeaders, session } = fakeSession();
    configureDesktopIdentity(session as never, "PulseCord-UA/1.0");
    assert.equal(onBeforeSendHeaders.length, 1);
  });
});
