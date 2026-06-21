/**
 * Streaming parser for <thinking>…</thinking> blocks.
 *
 * The model emits a flat text stream that may contain one or more reasoning
 * blocks wrapped in `<thinking>…</thinking>` tags. We need to:
 *   - split each incoming delta into a "visible" portion (rendered in the
 *     chat bubble) and a "thinking" portion (rendered in the collapsible
 *     accordion), AND
 *   - correctly handle tags that are split across multiple token deltas.
 *
 * The parser is stateful: callers should hold a single `ThinkingStreamState`
 * per in-flight message and push every delta through `pushThinkingToken`.
 *
 * Important guarantees:
 *   - `<thinking>` markers are NEVER echoed into the visible content — they
 *     are stripped on entry/exit of the thinking region.
 *   - `</thinking>` markers are NEVER echoed into the thinking content —
 *     the thinking content returned ends at the last character BEFORE the
 *     closing tag.
 *   - Outside any `<thinking>` region, content is treated as visible.
 *   - Nested `<thinking>` tags are NOT supported (the inner `<thinking>`
 *     would be emitted as visible text, which matches how model output
 *     typically behaves).
 */
export interface ThinkingStreamState {
  /** True while we are currently inside a <thinking>…</thinking> region. */
  inThinking: boolean;
  /**
   * Buffer of partial-tag characters we haven't matched yet, e.g. when a
   * delta ends mid-tag like "<th". When the next delta arrives we prepend
   * this buffer to it and re-attempt tag detection.
   */
  pending: string;
}

export interface ThinkingStreamResult {
  /** Text to render as visible chat bubble content for this delta. */
  visible: string;
  /** Text to render in the thinking accordion for this delta. */
  thinking: string;
}

const THINK_OPEN = "<thinking>";
const THINK_CLOSE = "</thinking>";

export function createThinkingStream(): ThinkingStreamState {
  return { inThinking: false, pending: "" };
}

/**
 * Push a token delta through the parser. Returns the visible and thinking
 * substrings for THIS delta (the caller is responsible for accumulating
 * those into their respective running buffers).
 */
export function pushThinkingToken(
  state: ThinkingStreamState,
  delta: string
): ThinkingStreamResult {
  let visible = "";
  let thinking = "";
  let buf = state.pending + delta;

  // Process buf character-by-character, detecting tags. We do this with a
  // simple window search: find the next occurrence of either open or close
  // tag, classify what's between them, and advance.
  while (buf.length > 0) {
    if (!state.inThinking) {
      // Look for an opening tag first.
      const openIdx = buf.indexOf(THINK_OPEN);
      if (openIdx < 0) {
        // No opener in this buf. We may have a partial opener at the tail —
        // any prefix of "<thinking>" that doesn't fully match yet. We keep
        // the last (len(THINK_OPEN) - 1) chars as "pending" just in case
        // they form the start of the next tag.
        if (looksLikePartialOpen(buf)) {
          const safe = buf.length >= THINK_OPEN.length
            ? buf.slice(0, buf.length - (THINK_OPEN.length - 1))
            : "";
          visible += safe;
          buf = buf.slice(safe.length);
          // buf is now the partial opener; stop and wait for more.
          break;
        }
        // No partial tag, emit everything as visible.
        visible += buf;
        buf = "";
        break;
      }
      // Emit everything before the opener as visible.
      visible += buf.slice(0, openIdx);
      buf = buf.slice(openIdx + THINK_OPEN.length);
      state.inThinking = true;
      // Continue loop — now inside thinking, look for close tag.
      continue;
    }

    // Inside <thinking>: look for close tag.
    const closeIdx = buf.indexOf(THINK_CLOSE);
    if (closeIdx < 0) {
      // No close yet. Check for partial close at tail.
      if (looksLikePartialClose(buf)) {
        const safe = buf.length >= THINK_CLOSE.length
          ? buf.slice(0, buf.length - (THINK_CLOSE.length - 1))
          : "";
        thinking += safe;
        buf = buf.slice(safe.length);
        break;
      }
      thinking += buf;
      buf = "";
      break;
    }
    thinking += buf.slice(0, closeIdx);
    buf = buf.slice(closeIdx + THINK_CLOSE.length);
    state.inThinking = false;
    // Continue — back to visible mode.
    continue;
  }

  state.pending = buf;
  return { visible, thinking };
}

/**
 * Returns true if the tail of `s` is a prefix of `<thinking>` that could
 * still become a complete opener. Used to hold back characters until we
 * know whether they form the tag.
 */
function looksLikePartialOpen(s: string): boolean {
  // We only need to hold back at most THINK_OPEN.length - 1 chars.
  const max = THINK_OPEN.length - 1;
  const tail = s.length > max ? s.slice(s.length - max) : s;
  for (let i = 1; i <= tail.length; i++) {
    if (THINK_OPEN.startsWith(tail.slice(tail.length - i))) return true;
  }
  return false;
}

function looksLikePartialClose(s: string): boolean {
  const max = THINK_CLOSE.length - 1;
  const tail = s.length > max ? s.slice(s.length - max) : s;
  for (let i = 1; i <= tail.length; i++) {
    if (THINK_CLOSE.startsWith(tail.slice(tail.length - i))) return true;
  }
  return false;
}