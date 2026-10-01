import { useEffect, useRef, useState } from "react";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Code from "../../BUILTIN_COMPONENTs/code/code";

/* ─── provider retry waits (#386, design A2) ─────────────────────────────────

   The runtime emits one provider_retry frame each time a retry-safe provider
   failure starts a wait before the next try. Frames of one model turn form a
   group that renders as a single trace row:

   - waiting: spinner, reason, countdown, a bar with one segment per try,
     a legend, Stop (the composer's stop) and the failed tries;
   - settled: "Retried N×" (answered, or gave up when the turn failed), or
     "Stopped while retrying" when the turn was stopped during the retries.

   Frames carry only closed fields (BC-386-6): HTTP status, provider status,
   try numbers and the wait length. No provider text reaches this view. */

const PROVIDER_NAMES = {
  anthropic: "Anthropic",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  ollama: "Ollama",
  openai: "OpenAI",
};

export const providerDisplayName = (provider, t) => {
  const id = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  if (!id) return t("provider_retry.provider_fallback");
  return PROVIDER_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);
};

export const providerRetryReason = (payload, t) => {
  const status = payload?.http_status;
  if (!Number.isInteger(status)) return t("provider_retry.reason_unknown");
  if (status === 503 || status === 529) {
    return t("provider_retry.reason_overloaded", { status });
  }
  if (status === 429) return t("provider_retry.reason_rate_limited", { status });
  if (status === 502) return t("provider_retry.reason_gateway", { status });
  return t("provider_retry.reason_http", { status });
};

/* Group consecutive provider_retry frames of one run and model turn. Returns
   a Map from the first frame's seq to { frames, outcome }, where outcome is
   "waiting" | "retried" | "failed" | "stopped". */
export const groupProviderRetryFrames = (displayFrames, allFrames, status) => {
  const groups = new Map();
  let current = null;
  for (const frame of displayFrames) {
    if (frame?.type !== "provider_retry") {
      current = null;
      continue;
    }
    const runId = typeof frame.run_id === "string" ? frame.run_id : "";
    const iteration = Number.isInteger(frame.iteration) ? frame.iteration : null;
    if (current && current.runId === runId && current.iteration === iteration) {
      current.frames.push(frame);
      continue;
    }
    current = { runId, iteration, frames: [frame] };
    groups.set(Number(frame.seq), current);
  }
  for (const group of groups.values()) {
    const last = group.frames[group.frames.length - 1];
    const lastSeq = Number(last.seq);
    // Anything the same run produced after the wait means the next try was
    // answered (or failed for good): the wait is over.
    const settledByLaterFrame = allFrames.some(
      (frame) =>
        frame &&
        frame.type !== "provider_retry" &&
        Number(frame.seq) > lastSeq &&
        (typeof frame.run_id === "string" ? frame.run_id : "") === group.runId,
    );
    if (status === "error") {
      group.outcome = "failed";
    } else if (settledByLaterFrame) {
      group.outcome = "retried";
    } else if (status === "streaming") {
      group.outcome = "waiting";
    } else if (status === "cancelled") {
      group.outcome = "stopped";
    } else {
      group.outcome = "retried";
    }
  }
  return groups;
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";
const AMBER = "var(--pupu-warning)";
const RED = "var(--pupu-danger)";

/* Re-render four times a second while a wait is running. */
const useTicker = (active) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(timer);
  }, [active]);
};

/* Remaining wait in ms, measured from the frame's own time against the
   current clock on every render (a new wait never starts from a stale tick). */
const useRemainingMs = (frame, live) => {
  const mountedAt = useRef(Date.now());
  const startedAt = Number.isFinite(frame?.ts) ? frame.ts : mountedAt.current;
  const delay = Number(frame?.payload?.delay_ms) || 0;
  const remaining = Math.max(0, startedAt + delay - Date.now());
  useTicker(live && remaining > 0);
  return remaining;
};

const SegmentBar = ({ last, outcome, fill, t }) => {
  const max = last.max_attempts;
  const failed = last.attempt_failed;
  const current = last.next_attempt;
  const segments = [];
  for (let n = 1; n <= max; n += 1) {
    let background = "var(--pupu-border)";
    let inner = null;
    let outline;
    if (n <= failed || (n === current && outcome === "failed")) {
      background = RED;
    } else if (n === current && outcome === "waiting") {
      background = "rgba(var(--pupu-warning-rgb),0.14)";
      outline = "1px solid rgba(var(--pupu-warning-rgb),0.45)";
      inner = (
        <span
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: `${Math.round(fill * 100)}%`,
            background: AMBER,
            transition: "width 0.25s linear",
          }}
        />
      );
    } else if (n === current) {
      background = "var(--pupu-text-faint)";
    }
    segments.push(
      <span
        key={n}
        style={{
          position: "relative",
          height: 5,
          borderRadius: 2,
          overflow: "hidden",
          background,
          outline,
          opacity: n <= failed ? 0.8 : 1,
        }}
      >
        {inner}
      </span>,
    );
  }
  return (
    <div
      role="progressbar"
      aria-label={t("provider_retry.bar_label", { max })}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={failed}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))`,
        gap: 3,
      }}
    >
      {segments}
    </div>
  );
};

/* The failed tries as plain text, one line each, for the code block. */
export const providerRetryAttemptText = (frames, outcome, t) => {
  const last = frames[frames.length - 1].payload;
  const rows = frames.map(
    (frame) =>
      `#${frame.payload.attempt_failed}  ${providerRetryReason(frame.payload, t)}`,
  );
  if (outcome === "stopped") {
    rows.push(`#${last.next_attempt}  ${t("provider_retry.stopped_by_you")}`);
  }
  return rows.join("\n");
};

const AttemptList = ({ frames, outcome, t }) => (
  <div data-testid="provider-retry-attempts" style={{ minWidth: 0 }}>
    <Code
      code={providerRetryAttemptText(frames, outcome, t)}
      language="plaintext"
      showHeader={false}
      showCopy={false}
      deferHighlight={false}
    />
  </div>
);

const Box = ({ children }) => (
  <div
    style={{
      display: "grid",
      gap: 8,
      marginTop: 6,
      fontFamily: MONO,
      fontSize: 11,
      color: "var(--pupu-text-secondary)",
      fontVariantNumeric: "tabular-nums",
      minWidth: 0,
    }}
  >
    {children}
  </div>
);

export const ProviderRetryWaitBody = ({ frames, onStopStream, t }) => {
  const lastFrame = frames[frames.length - 1];
  const last = lastFrame.payload;
  const remaining = useRemainingMs(lastFrame, true);
  const delay = Number(last.delay_ms) || 0;
  const fill = delay > 0 ? 1 - remaining / delay : 1;
  const seconds = Math.ceil(remaining / 1000);
  const left = Math.max(0, last.max_attempts - last.next_attempt);
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 11,
          color: "var(--pupu-text-secondary)",
          fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
        }}
      >
        {providerRetryReason(last, t)}
        {" · "}
        <span style={{ color: AMBER }}>
          {remaining > 0
            ? t("provider_retry.next_try_in", { seconds })
            : t("provider_retry.trying_again", {
                attempt: last.next_attempt,
                max: last.max_attempts,
              })}
        </span>
      </div>
      <Box>
        <SegmentBar last={last} outcome="waiting" fill={fill} t={t} />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 12px",
              color: "var(--pupu-text-faint)",
            }}
          >
            <span>{t("provider_retry.legend_failed", { count: last.attempt_failed })}</span>
            <span style={{ color: AMBER }}>
              {t("provider_retry.legend_current", { attempt: last.next_attempt })}
            </span>
            <span>{t("provider_retry.legend_left", { count: left })}</span>
          </span>
          {typeof onStopStream === "function" ? (
            <Button
              prefix_icon="stop_mini_filled"
              label={t("provider_retry.stop")}
              onClick={() => onStopStream()}
              style={{
                fontSize: 12,
                iconSize: 12,
                borderRadius: 6,
                paddingVertical: 4,
                paddingHorizontal: 10,
              }}
            />
          ) : null}
        </div>
        <AttemptList frames={frames} outcome="waiting" t={t} />
      </Box>
    </div>
  );
};

export const ProviderRetryRecordDetails = ({ frames, outcome, t }) => {
  const last = frames[frames.length - 1].payload;
  return (
    <Box>
      <SegmentBar last={last} outcome={outcome} fill={0} t={t} />
      <AttemptList frames={frames} outcome={outcome} t={t} />
    </Box>
  );
};

export const RetryWaitPoint = () => (
  <div
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      border: `1.4px solid ${AMBER}`,
      background: "rgba(var(--pupu-warning-rgb),0.12)",
      boxSizing: "border-box",
      flexShrink: 0,
    }}
  />
);

export const RetryStoppedPoint = () => (
  <div
    style={{
      position: "relative",
      width: 10,
      height: 10,
      borderRadius: "50%",
      border: "1.4px solid var(--pupu-text-secondary)",
      boxSizing: "border-box",
      flexShrink: 0,
    }}
  >
    <span
      style={{
        position: "absolute",
        inset: 2,
        borderRadius: 1,
        background: "var(--pupu-text-secondary)",
      }}
    />
  </div>
);
