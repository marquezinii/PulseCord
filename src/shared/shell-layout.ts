/**
 * Single source of truth for the shell's chrome geometry.
 *
 * The main process needs it to position the embedded Discord view, and the
 * shell renderer needs it to size its own navigation rail. Keeping the number
 * here (rather than duplicating it in CSS) is what stops the rail and the view
 * from drifting apart when one side is edited.
 */
export const SHELL_NAV_WIDTH = 72;

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes where the embedded Discord view sits inside the shell window: the
 * full content area minus the navigation rail on the left. Never returns
 * negative dimensions — a window narrower than the rail (or mid-minimize,
 * where Electron reports a zero-sized content area) collapses the view to
 * zero rather than producing bounds Electron would reject.
 */
export function computeServiceViewBounds(contentSize: Size): Bounds {
  const width = Math.max(0, Math.floor(contentSize.width) - SHELL_NAV_WIDTH);
  const height = Math.max(0, Math.floor(contentSize.height));

  return { x: SHELL_NAV_WIDTH, y: 0, width, height };
}
