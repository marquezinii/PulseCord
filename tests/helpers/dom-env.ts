import { JSDOM } from "jsdom";

const GLOBAL_KEYS = ["window", "document", "Element", "Node", "MutationObserver", "HTMLElement", "Event", "CustomEvent"] as const;

type GlobalKey = (typeof GLOBAL_KEYS)[number];

/**
 * Installs a fresh jsdom document on the Node global object for the duration
 * of a test, and returns a `restore()` to tear it back down. PulseCore's
 * renderer modules reference `document`/`window`/`MutationObserver` as
 * ambient globals (as they do in the real Electron renderer), so tests need
 * those globals present rather than passing a document instance around.
 */
export function installDom(): { dom: JSDOM; restore(): void } {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://discord.com/app" });
  const globalObject = globalThis as Record<GlobalKey, unknown>;
  const previous: Partial<Record<GlobalKey, unknown>> = {};

  for (const key of GLOBAL_KEYS) {
    previous[key] = globalObject[key];
    globalObject[key] = (dom.window as unknown as Record<GlobalKey, unknown>)[key];
  }

  return {
    dom,
    restore(): void {
      for (const key of GLOBAL_KEYS) globalObject[key] = previous[key];
      dom.window.close();
    }
  };
}

/** Waits a tick so pending MutationObserver callbacks (microtask-queued) run. */
export function flushMutations(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
