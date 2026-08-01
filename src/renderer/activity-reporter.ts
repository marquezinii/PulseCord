import { readMentionsFromTitle } from "../shared/activity-reading";
import { unavailableActivity, type ActivitySnapshot } from "../shared/contracts";

/**
 * Watches the embedded Discord surface for changes to its unread state and
 * reports each reading outward, so the shell's Activity screen can show it
 * without reaching into Discord itself.
 *
 * PulseCord observes only what Discord already published in the page — here,
 * its document title. Nothing is intercepted, no credential is read, and no
 * Discord API is called. See `shared/activity-reading.ts` for why the title is
 * the source rather than the visible badges.
 */

/** How long a title must hold still before it counts as a reading. */
const SETTLE_MS = 250;

export interface ActivityReporterController {
  /** Re-reads immediately, regardless of the debounce. */
  refresh(): void;
  destroy(): void;
}

export function mountActivityReporter(
  report: (snapshot: ActivitySnapshot) => void,
  now: () => number = Date.now
): ActivityReporterController {
  const teardowns: Array<() => void> = [];
  let lastMentions: number | null | undefined;
  let timer: number | undefined;

  const read = (): void => {
    const mentions = readMentionsFromTitle(document.title);
    // Only the value matters for deduplication: re-sending an identical
    // reading every time Discord rewrites its title unchanged would wake the
    // shell for nothing.
    if (lastMentions !== undefined && lastMentions === mentions) return;
    lastMentions = mentions;
    report(mentions === null ? unavailableActivity(now()) : { mentions, readAt: now() });
  };

  const schedule = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(read, SETTLE_MS);
  };

  // Discord rewrites <title> in place, so the mutation to watch is the text
  // inside the existing element rather than the element being replaced.
  const titleObserver = new MutationObserver(schedule);
  teardowns.push(() => titleObserver.disconnect());

  const observeTitle = (): boolean => {
    const title = document.querySelector("title");
    if (!title) return false;
    titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    return true;
  };

  if (!observeTitle()) {
    // No <title> yet, so Discord is still booting. Watch for one to appear,
    // then hand off to the observer above.
    const bootObserver = new MutationObserver(() => {
      if (!observeTitle()) return;
      bootObserver.disconnect();
      schedule();
    });
    bootObserver.observe(document.head ?? document.documentElement, { childList: true, subtree: true });
    teardowns.push(() => bootObserver.disconnect());
  }

  read();

  return {
    refresh: read,
    destroy(): void {
      if (timer !== undefined) window.clearTimeout(timer);
      for (const teardown of teardowns) teardown();
    }
  };
}
