import { MAX_OBSERVED_MENTIONS } from "./contracts";

/**
 * Reads Discord's own unread-mention count out of its document title.
 *
 * PulseCord holds no Discord credential and calls no Discord API, so the only
 * honest source is what Discord already published in the embedded surface.
 * The title is the best of those: Discord writes the deduplicated total there
 * as a "(3) " prefix, following the same convention web chat clients have used
 * for decades.
 *
 * Summing the visible badges instead would be both more fragile (it depends on
 * private class names and markup structure) and simply wrong, since one
 * mention is badged several times over — on the channel, on the server icon,
 * and on the folder containing it.
 *
 * This remains a compatibility layer over a surface PulseCord does not own, so
 * every function reports "no reading" rather than guessing. A caller must say
 * so out loud instead of rendering a zero it never observed.
 */

/** Discord's unread prefix: "(3) Discord", "(99+) Discord". */
const TITLE_COUNT_PATTERN = /^\s*\((\d[\d.,]*)(\+?)\)/u;

/** A title with no prefix at all, which is Discord's "nothing unread" state. */
const KNOWN_IDLE_TITLE = /discord/iu;

/**
 * Extracts the mention count from a document title.
 *
 * Returns 0 for a recognisable Discord title with no unread prefix, and null
 * when the title is not one PulseCord knows how to read — a loading screen, an
 * error page, or a future Discord that stopped using this convention. Those
 * two cases must stay distinct: the first is an observation, the second is the
 * absence of one.
 */
export function readMentionsFromTitle(title: string): number | null {
  const match = TITLE_COUNT_PATTERN.exec(title);

  if (!match) return KNOWN_IDLE_TITLE.test(title) ? 0 : null;

  // Discord groups thousands for display and the separator differs by locale,
  // so strip both rather than committing to one.
  const digits = (match[1] ?? "").replaceAll(".", "").replaceAll(",", "");
  if (digits.length === 0) return null;

  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.min(parsed, MAX_OBSERVED_MENTIONS);
}
