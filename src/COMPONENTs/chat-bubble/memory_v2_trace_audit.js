import { useState } from "react";
import contextV2Bridge from "../../SERVICEs/bridges/context_v2_bridge";
import MemoryV2PendingReviews from "./memory_v2_pending_reviews";
import MemoryV2CanonicalJournalReload from "./memory_v2_journal_reload";

const mono = "Menlo, Monaco, Consolas, monospace";

const formatNumber = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "";

const formatBytes = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const decodeUtf8Base64 = (value) => {
  if (typeof value !== "string" || !value) return "";
  const decode =
    typeof window !== "undefined" && typeof window.atob === "function"
      ? window.atob.bind(window)
      : null;
  if (!decode) return "";
  const binary = decode(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (typeof TextDecoder === "function") {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
};

const AuditRow = ({ label, value, isDark, code = false }) => {
  if (value === "" || value === null || value === undefined) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(104px, 0.34fr) minmax(0, 1fr)",
        gap: 10,
        alignItems: "start",
        padding: "3px 0",
        lineHeight: 1.5,
      }}
    >
      <span style={{ opacity: 0.54, fontSize: 11 }}>{label}</span>
      <span
        style={{
          minWidth: 0,
          color: isDark ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.72)",
          fontFamily: code ? mono : "inherit",
          fontSize: code ? 11 : 12,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          userSelect: "text",
        }}
      >
        {value}
      </span>
    </div>
  );
};

const RefReader = ({ item, ownerChatId, isDark }) => {
  const [reader, setReader] = useState({
    open: false,
    loading: false,
    text: "",
    nextOffset: 0,
    totalBytes: null,
    mimeType: "",
    error: "",
  });
  const canRead =
    typeof ownerChatId === "string" &&
    ownerChatId.trim().length > 0 &&
    contextV2Bridge.isAvailable();

  const readPage = async (offset) => {
    setReader((current) => ({
      ...current,
      open: true,
      loading: true,
      error: "",
    }));
    try {
      const page = await contextV2Bridge.readContent({
        ownerChatId,
        ref: item.ref,
        offset,
        limit: 32 * 1024,
      });
      const mimeType =
        typeof page?.mime_type === "string"
          ? page.mime_type
          : item.mediaType || "";
      const isText =
        mimeType.startsWith("text/") ||
        mimeType.includes("json") ||
        mimeType.includes("xml") ||
        mimeType.includes("markdown") ||
        !mimeType;
      const nextText = isText
        ? decodeUtf8Base64(page?.data)
        : `[Binary content · ${mimeType || "application/octet-stream"}]`;
      setReader((current) => ({
        ...current,
        open: true,
        loading: false,
        text: offset > 0 ? `${current.text}${nextText}` : nextText,
        nextOffset:
          typeof page?.next_offset === "number" ? page.next_offset : null,
        totalBytes:
          typeof page?.total_bytes === "number" ? page.total_bytes : null,
        mimeType,
        error: "",
      }));
    } catch (error) {
      setReader((current) => ({
        ...current,
        open: true,
        loading: false,
        error:
          error && typeof error.message === "string"
            ? error.message.slice(0, 1000)
            : "Content could not be read.",
      }));
    }
  };

  const metadata = [item.kind, item.mediaType, formatBytes(item.bytes)]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ padding: "4px 0" }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}
      >
        <code
          aria-label={`${item.kind} reference`}
          style={{
            minWidth: 0,
            flex: "1 1 auto",
            fontFamily: mono,
            fontSize: 10.5,
            lineHeight: 1.5,
            overflowWrap: "anywhere",
            userSelect: "text",
            color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
          }}
        >
          {item.ref}
        </code>
        {canRead && (
          <button
            type="button"
            onClick={() =>
              reader.open
                ? setReader((current) => ({ ...current, open: false }))
                : readPage(0)
            }
            style={{
              border:
                "1px solid var(--pupu-card-border, rgba(127,127,127,0.22))",
              borderRadius: 6,
              padding: "2px 7px",
              background: "var(--pupu-surface, transparent)",
              color: "inherit",
              fontSize: 10.5,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {reader.open ? "close" : "read"}
          </button>
        )}
      </div>
      {metadata && (
        <div style={{ marginTop: 1, fontSize: 10, opacity: 0.42 }}>
          {metadata}
        </div>
      )}
      {reader.open && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            borderRadius: 7,
            border: "1px solid var(--pupu-card-border, rgba(127,127,127,0.18))",
            background: "var(--pupu-surface, rgba(127,127,127,0.04))",
          }}
        >
          {reader.error ? (
            <div
              role="alert"
              style={{ fontSize: 11, color: "var(--pupu-danger, #c44)" }}
            >
              {reader.error}
            </div>
          ) : (
            <pre
              style={{
                margin: 0,
                maxHeight: 260,
                overflow: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                userSelect: "text",
                fontFamily: mono,
                fontSize: 10.5,
                lineHeight: 1.55,
                color: "inherit",
              }}
            >
              {reader.loading && !reader.text ? "Reading…" : reader.text}
            </pre>
          )}
          {!reader.error && reader.nextOffset !== null && (
            <button
              type="button"
              disabled={reader.loading}
              onClick={() => readPage(reader.nextOffset)}
              style={{
                marginTop: 7,
                border: 0,
                padding: 0,
                background: "transparent",
                color: "inherit",
                opacity: reader.loading ? 0.4 : 0.64,
                cursor: reader.loading ? "default" : "pointer",
                fontSize: 10.5,
              }}
            >
              {reader.loading
                ? "Reading…"
                : `read next page${reader.totalBytes ? ` · ${formatBytes(reader.totalBytes)}` : ""}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const RefList = ({ refs, ownerChatId, isDark }) => {
  if (!Array.isArray(refs) || refs.length === 0) return null;
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ fontSize: 11, opacity: 0.54, marginBottom: 2 }}>
        Durable references
      </div>
      {refs.map((item) => (
        <RefReader
          key={`${item.kind}:${item.ref}`}
          item={item}
          ownerChatId={ownerChatId}
          isDark={isDark}
        />
      ))}
    </div>
  );
};

export const MemoryV2ContextAudit = ({
  audit,
  ownerChatId,
  isDark,
  onJournalProjection,
}) => {
  const pressure = audit.pressure;
  const compression = audit.compression;
  const pressureText =
    pressure.predictedTokens !== null && pressure.availableTokens !== null
      ? `${formatNumber(pressure.predictedTokens)} / ${formatNumber(
          pressure.availableTokens,
        )} tokens${pressure.percent !== null ? ` (${pressure.percent}%)` : ""}`
      : "";
  const compressionText =
    compression.compacted === true
      ? [
          compression.beforeTokens !== null && compression.afterTokens !== null
            ? `${formatNumber(compression.beforeTokens)} → ${formatNumber(
                compression.afterTokens,
              )} tokens`
            : "Compacted",
          compression.droppedTurns > 0
            ? `${formatNumber(compression.droppedTurns)} closed turns checkpointed`
            : "",
          compression.compactedToolResults > 0
            ? `${formatNumber(compression.compactedToolResults)} tool payloads enveloped`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : compression.compacted === false
        ? "Not triggered"
        : "";
  const range = compression.sourceRange;
  const rangeText = range
    ? [
        range.firstEventId && range.lastEventId
          ? `${range.firstEventId} → ${range.lastEventId}`
          : range.firstEventId || range.lastEventId,
        range.eventCount !== null
          ? `${formatNumber(range.eventCount)} events`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <div data-testid="memory-v2-context-audit">
      <AuditRow label="Mode" value={audit.modeLabel} isDark={isDark} />
      <AuditRow label="Trace state" value={audit.status} isDark={isDark} />
      <AuditRow
        label="Context pressure"
        value={pressureText}
        isDark={isDark}
        code
      />
      <AuditRow
        label="Real window"
        value={
          pressure.realWindowTokens !== null
            ? `${formatNumber(pressure.realWindowTokens)} tokens`
            : ""
        }
        isDark={isDark}
        code
      />
      <AuditRow
        label="Compression line"
        value={
          pressure.thresholdTokens !== null
            ? `${formatNumber(pressure.thresholdTokens)} tokens`
            : ""
        }
        isDark={isDark}
        code
      />
      <AuditRow label="Compression" value={compressionText} isDark={isDark} />
      <AuditRow label="Source range" value={rangeText} isDark={isDark} code />
      <AuditRow label="Reason" value={audit.reason} isDark={isDark} />
      <AuditRow
        label="Error code"
        value={audit.errorCode}
        isDark={isDark}
        code
      />
      <RefList refs={audit.refs} ownerChatId={ownerChatId} isDark={isDark} />
      <MemoryV2CanonicalJournalReload
        ownerChatId={ownerChatId}
        onProjection={onJournalProjection}
      />
      <MemoryV2PendingReviews ownerChatId={ownerChatId} isDark={isDark} />
    </div>
  );
};

const modelLabel = (run) =>
  [run.provider, run.model, run.version ? `v${run.version}` : ""]
    .filter(Boolean)
    .join(" · ");

const tokenLabel = (run) => {
  if (run.consumedTokens === null) return "";
  const parts = [`${formatNumber(run.consumedTokens)} total`];
  if (run.inputTokens !== null)
    parts.push(`${formatNumber(run.inputTokens)} in`);
  if (run.outputTokens !== null)
    parts.push(`${formatNumber(run.outputTokens)} out`);
  return parts.join(" · ");
};

export const MemoryAgentAudit = ({ runs, ownerChatId, isDark }) => (
  <div data-testid="memory-agent-audit">
    {runs.map((run, index) => (
      <div
        key={run.id}
        style={{
          paddingTop: index === 0 ? 0 : 9,
          marginTop: index === 0 ? 0 : 9,
          borderTop:
            index === 0
              ? "none"
              : "1px solid var(--pupu-card-border, rgba(127,127,127,0.16))",
        }}
      >
        <AuditRow label="Run" value={run.id} isDark={isDark} code />
        <AuditRow label="Status" value={run.status} isDark={isDark} />
        <AuditRow label="Trigger" value={run.trigger} isDark={isDark} />
        <AuditRow label="Model" value={modelLabel(run)} isDark={isDark} code />
        <AuditRow label="Tokens" value={tokenLabel(run)} isDark={isDark} code />
        <AuditRow
          label="Cost"
          value={
            run.cost !== null
              ? `${run.cost.toLocaleString()} ${run.currency}`
              : ""
          }
          isDark={isDark}
          code
        />
        <AuditRow label="Write diff" value={run.diff} isDark={isDark} code />
        <AuditRow label="Reason" value={run.reason} isDark={isDark} />
        <AuditRow
          label="Error code"
          value={run.errorCode}
          isDark={isDark}
          code
        />
        <AuditRow label="Error" value={run.error} isDark={isDark} />
        <AuditRow label="Undo metadata" value={run.undo} isDark={isDark} code />
        <RefList refs={run.refs} ownerChatId={ownerChatId} isDark={isDark} />
      </div>
    ))}
  </div>
);
