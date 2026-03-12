/**
 * Streaming `<think>` / `</think>` tag parser.
 *
 * DeepSeek-R1 (and similar models) emit reasoning content wrapped in
 * `<think>…</think>` tags inline with the token stream.  This parser
 * consumes raw token deltas one-by-one and routes them into two output
 * channels:
 *
 *   • **content**  – regular assistant text  → goes into `message.content`
 *   • **thinking** – reasoning text           → goes into `traceFrames` as a
 *                                                synthetic `reasoning` frame
 *
 * The parser is intentionally stateful so that tags split across token
 * boundaries (e.g. `"<thi"` + `"nk>"`) are handled correctly.
 *
 * Usage:
 * ```js
 * const parser = createThinkTagParser({
 *   onContent:  (text) => { … },
 *   onThinking: (text) => { … },
 * });
 * // feed every token delta:
 * parser.feed(delta);
 * // when the stream ends:
 * parser.flush();
 * ```
 */

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/**
 * @param {{
 *   onContent: (t: string) => void,
 *   onThinking: (t: string) => void,
 *   onThinkEnd?: () => void,
 * }} handlers
 */
export function createThinkTagParser({ onContent, onThinking, onThinkEnd }) {
  // ── state ────────────────────────────────────────────────────────────────
  let insideThink = false; // true while between <think> and </think>
  let tagBuffer = ""; // partial tag accumulator (starts when we see '<')

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Emit a chunk to the appropriate channel. */
  const emit = (text) => {
    if (!text) return;
    if (insideThink) {
      onThinking(text);
    } else {
      onContent(text);
    }
  };

  /**
   * Check whether `candidate` is still a valid prefix of either the open or
   * close tag (depending on the current state).  When we're outside a think
   * block we look for `<think>`; when inside we look for `</think>`.
   */
  const isPrefixOfExpectedTag = (candidate) => {
    if (insideThink) {
      return CLOSE_TAG.startsWith(candidate);
    }
    return OPEN_TAG.startsWith(candidate);
  };

  // ── public API ───────────────────────────────────────────────────────────

  /** Feed a raw token delta string (may be one char or many). */
  const feed = (chunk) => {
    if (typeof chunk !== "string" || !chunk) return;

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (tagBuffer.length > 0) {
        // We're in the middle of accumulating a potential tag.
        const next = tagBuffer + ch;

        if (next === OPEN_TAG) {
          // Complete opening tag detected.
          insideThink = true;
          tagBuffer = "";
          continue;
        }

        if (next === CLOSE_TAG) {
          // Complete closing tag detected.
          insideThink = false;
          tagBuffer = "";
          if (typeof onThinkEnd === "function") onThinkEnd();
          continue;
        }

        if (isPrefixOfExpectedTag(next)) {
          // Still a valid prefix – keep buffering.
          tagBuffer = next;
          continue;
        }

        // It was NOT a valid tag prefix.  Flush the accumulated buffer as
        // regular output for the current channel and reset.
        emit(tagBuffer);
        tagBuffer = "";

        // Re-evaluate the current character from scratch.
        if (ch === "<") {
          tagBuffer = "<";
        } else {
          emit(ch);
        }
        continue;
      }

      // tagBuffer is empty — normal character processing.
      if (ch === "<") {
        tagBuffer = "<";
      } else {
        emit(ch);
      }
    }
  };

  /**
   * Flush any remaining buffered content.  Call this when the stream ends
   * (onDone / onError) to ensure nothing is lost.
   */
  const flush = () => {
    if (tagBuffer) {
      emit(tagBuffer);
      tagBuffer = "";
    }
  };

  /** Reset the parser to its initial state. */
  const reset = () => {
    insideThink = false;
    tagBuffer = "";
  };

  /** Returns `true` when the parser is currently inside a `<think>` block. */
  const isInsideThink = () => insideThink;

  return { feed, flush, reset, isInsideThink };
}
