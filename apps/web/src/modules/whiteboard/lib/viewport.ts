/** How long a zoom from a button, shortcut or command takes to animate. */
export const ZOOM_DURATION_MS = 150;

/**
 * How "zoom to fit" frames the board, wherever it is asked for. The padding leaves room
 * round the edges, and it never zooms in past 100%, so a small board stays readable
 * rather than filling the screen.
 */
export const FIT_VIEW_OPTIONS = { padding: 0.3, maxZoom: 1 };

/** The same framing, animated, for when the person asks for it. */
export const ANIMATED_FIT_VIEW_OPTIONS = { ...FIT_VIEW_OPTIONS, duration: ZOOM_DURATION_MS };
