---
name: streaming-live-tail-markdown
description: Why the streaming live tail renders as Markdown now (reversed the earlier plain-text-tail tradeoff) and the liveFence contract
metadata:
  type: project
---

The streaming markdown live tail (in-progress block) renders through the same `Markdown` component as the promoted stable blocks — NOT as plain text.

**Why:** c417d9c's block-promotion architecture rendered only *completed* blocks as Markdown and kept the *in-progress* block as unstyled `StreamingPlainText`. Commit granularity = "one completed markdown block", so long paragraphs sat as raw text for seconds then snapped into styled output → the "text appears section by section" complaint. The earlier plain-text tail was a *deliberate* choice to avoid premature code highlighting; this fix consciously reverses that tradeoff.

**How to apply:**
- `StreamingLiveBlock` (in seamless_markdown.js) renders `liveText` via `Markdown` every store notify (rAF). Cost = one `normalizeHtmlDocumentMarkdown` O(n) pass + showdown parse of the tail (typically <2KB).
- Live tail runs the SAME `normalizeHtmlDocumentMarkdown` as stable blocks so promotion is visually seamless (no HTML-document jump).
- Code fences: `splitStreamingMarkdown`/accumulator snapshot now expose `liveFence` (the open marker, e.g. ```` ``` ````, `~~~`, `` ```` ``). `buildLiveMarkdown` virtually appends the same marker to close the fence so highlighting shows mid-stream. The open-fence line itself is inside `liveText`.
- Perf guard: `LIVE_MARKDOWN_MAX_CHARS = 4KB`. Over that, fall back to the retained `StreamingPlainText` path (huge in-progress code block not re-parsed each rAF).
- Unclosed inline syntax (`**`, `` ` ``) is left to the parser's raw output — no inline completion.
- Security guard that MUST survive: a partial ```html fence renders as an ESCAPED code block, never leaking real `meta`/`html` DOM (assistant_message_body.test.js). Relates to [[security-render-sinks]].

All rendering is consume-only from the streaming store snapshot; the bubble never drives the stream.
