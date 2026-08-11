import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../BUILTIN_COMPONENTs/input/button";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Services } -------------------------------------------------------------------------------------------------------------- */
import {
  MEMORY_V2_TREE_STATES,
  MEMORY_V2_TREE_DISABLED_REASONS,
  defaultExpandedPaths,
  emptyMemoryV2TreeResult,
  flattenMemoryV2Tree,
  loadMemoryV2TreeState,
} from "../../SERVICEs/memory_v2_tree_state";
/* { Services } -------------------------------------------------------------------------------------------------------------- */

/* { Hooks } ----------------------------------------------------------------------------------------------------------------- */
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
/* { Hooks } ----------------------------------------------------------------------------------------------------------------- */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Memory V2 tree view                                                    */
/*                                                                         */
/*  The V2 counterpart to the vector scatter. It is deliberately NOT a      */
/*  scatter: V2 retrieval is purely lexical (FTS5), so any 2-D projection   */
/*  would be an embedding computed for the picture alone, with no causal    */
/*  link to what actually gets recalled. The author-written path hierarchy  */
/*  is the ground truth this store already has — so we render that.         */
/*                                                                         */
/*  This component holds NO judgment about whether V2 is on, empty or       */
/*  broken. It switches over a frozen enum produced by                      */
/*  SERVICEs/memory_v2_tree_state.js and renders whichever case came back.  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const INDENT = 16; /* matches BUILTIN explorer, so the tree feels native */
const ROW_HEIGHT = 28;

const KIND_ICONS = Object.freeze({
  folder: "folder",
  folder_open: "folder_open",
  file: "draft",
  link: "link",
});

const formatBytes = (bytes) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/* Which secondary line a row shows on the right. Description is the author's
   own words and outranks a byte count. */
const rowMeta = (node) => {
  if (node.kind === "link") return typeof node.link_url === "string" ? node.link_url : "";
  if (node.kind === "file") return formatBytes(node.content_bytes);
  return "";
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TreeRow                                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TreeRow({ row, isDark, fontFamily, color, onToggle }) {
  const [hovered, setHovered] = useState(false);
  const { node, depth, hasChildren, expanded } = row;

  const meta_color = isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.32)";
  const hover_bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const meta = rowMeta(node);
  const description = typeof node.description === "string" ? node.description : "";

  const iconName =
    node.kind === "folder"
      ? expanded
        ? KIND_ICONS.folder_open
        : KIND_ICONS.folder
      : KIND_ICONS[node.kind] || KIND_ICONS.file;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={hasChildren ? () => onToggle(row.path) : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: ROW_HEIGHT,
        paddingLeft: 12 + depth * INDENT,
        paddingRight: 12,
        borderRadius: 6,
        cursor: hasChildren ? "pointer" : "default",
        backgroundColor: hovered ? hover_bg : "transparent",
        transition: "background-color 0.12s ease",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* chevron — reserved even when absent, so names stay on one grid */}
      <span
        style={{
          width: 14,
          height: 14,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hasChildren ? 0.7 : 0,
        }}
      >
        {hasChildren && (
          <Icon
            src={expanded ? "arrow_down" : "arrow_right"}
            style={{ width: 14, height: 14 }}
          />
        )}
      </span>

      <span
        style={{
          width: 14,
          height: 14,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.55,
        }}
      >
        <Icon src={iconName} style={{ width: 14, height: 14 }} />
      </span>

      <span
        title={row.path}
        style={{
          fontSize: 12.5,
          fontFamily,
          color,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          flexShrink: 1,
        }}
      >
        {typeof node.name === "string" && node.name ? node.name : row.path}
      </span>

      {description && (
        <span
          style={{
            fontSize: 11,
            fontFamily,
            color: meta_color,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {description}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 8 }} />

      {meta && (
        <span
          style={{
            fontSize: 10,
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: meta_color,
            whiteSpace: "nowrap",
            flexShrink: 0,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TreeStateCard — the non-tree states                                    */
/*                                                                         */
/*  The three states AC-5 requires to be distinguishable never share a      */
/*  visual grammar: they differ in border (dashed vs solid), icon, tint and */
/*  whether a retry is offered. "Not enabled" and "enabled but empty" must  */
/*  never both degrade into the same blank panel.                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TreeStateCard({
  icon,
  title,
  detail,
  code,
  tone,
  dashed,
  isDark,
  fontFamily,
  onRetry,
  retryLabel,
}) {
  const tint =
    tone === "danger"
      ? isDark
        ? "rgba(255,120,120,0.75)"
        : "rgba(180,40,40,0.75)"
      : tone === "caution"
        ? isDark
          ? "rgba(235,190,110,0.8)"
          : "rgba(160,110,20,0.8)"
        : isDark
          ? "rgba(255,255,255,0.4)"
          : "rgba(0,0,0,0.4)";
  const border_color =
    tone === "danger"
      ? isDark
        ? "rgba(255,120,120,0.28)"
        : "rgba(180,40,40,0.24)"
      : isDark
        ? "rgba(255,255,255,0.14)"
        : "rgba(0,0,0,0.12)";
  const meta_color = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";

  return (
    <div
      data-testid="memory-v2-tree-state-card"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          maxWidth: 420,
          padding: "26px 30px",
          borderRadius: 12,
          border: `1px ${dashed ? "dashed" : "solid"} ${border_color}`,
          backgroundColor:
            tone === "danger"
              ? isDark
                ? "rgba(255,80,80,0.05)"
                : "rgba(180,40,40,0.03)"
              : "transparent",
          textAlign: "center",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            color: tint,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.85,
          }}
        >
          <Icon src={icon} style={{ width: 22, height: 22 }} />
        </span>

        <div
          style={{
            fontSize: 13.5,
            fontFamily,
            color: tint,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {title}
        </div>

        {detail && (
          <div
            style={{
              fontSize: 12,
              fontFamily,
              color: meta_color,
              lineHeight: 1.55,
            }}
          >
            {detail}
          </div>
        )}

        {code && (
          <div
            style={{
              fontSize: 10,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
              color: meta_color,
              wordBreak: "break-all",
            }}
          >
            {code}
          </div>
        )}

        {onRetry && (
          <Button
            label={retryLabel}
            prefix_icon="refresh"
            onClick={onRetry}
            style={{
              marginTop: 2,
              fontSize: 11,
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 7,
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.06)",
              content: { icon: { width: 12, height: 12 } },
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  useMemoryV2Tree                                                        */
/*                                                                         */
/*  One load per (open, ownerChatId, spaceId) plus an explicit refresh.     */
/*  Deliberately NOT polled like the vector view: getTree has no pagination,*/
/*  so a background timer would re-pull an unbounded payload on a cadence   */
/*  nobody asked for. Refresh is a button.                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const useMemoryV2Tree = ({ open, ownerChatId, load }) => {
  const [result, setResult] = useState(emptyMemoryV2TreeResult);
  const [spaceId, setSpaceId] = useState("");
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);

  /* A different chat is a different tree — drop the space pin so we do not
     ask chat B for a space that only exists in chat A. */
  useEffect(() => {
    setSpaceId("");
  }, [ownerChatId]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setResult(emptyMemoryV2TreeResult());

    load({ ownerChatId, spaceId }).then((next) => {
      if (cancelled || requestRef.current !== requestId) return;
      setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [open, ownerChatId, spaceId, nonce, load]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { result, refresh, selectSpace: setSpaceId };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  MemoryV2TreeView                                                       */
/*                                                                         */
/*  Props:                                                                 */
/*    open        — boolean (gates the fetch)                              */
/*    ownerChatId — string (V2 owner key; undefined at the settings mount)  */
/*    chatTitle   — string, header subtitle                                */
/*    load        — injectable loader, tests only                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const MemoryV2TreeView = ({
  open = true,
  ownerChatId,
  chatTitle,
  load = loadMemoryV2TreeState,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || (isDark ? "#fff" : "#111");
  const fontFamily = theme?.font?.fontFamily || "Jost";
  const meta_color = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const { result, refresh, selectSpace } = useMemoryV2Tree({
    open,
    ownerChatId,
    load,
  });

  /* Expansion is presentation, so it lives here — but the flattening that
     turns it into rows is the service's job, because that is where the render
     cap is enforced.

     Reset during render rather than in an effect: an effect would commit one
     frame of fully-collapsed tree before opening the first level, which reads
     as a flicker on every load and every space switch. React re-runs this
     component before painting, so the collapsed frame never reaches the
     screen. */
  const [expanded, setExpanded] = useState(() => new Set());
  const [seenRoots, setSeenRoots] = useState(null);
  if (seenRoots !== result.roots) {
    setSeenRoots(result.roots);
    setExpanded(defaultExpandedPaths(result.roots));
  }

  const onToggle = useCallback((path) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const flattened = useMemo(
    () => flattenMemoryV2Tree(result.roots, { expanded }),
    [result.roots, expanded],
  );

  const disabledDetail = {
    [MEMORY_V2_TREE_DISABLED_REASONS.NO_OWNER]: t("memory_inspect.tree_disabled_no_owner"),
    [MEMORY_V2_TREE_DISABLED_REASONS.NO_BRIDGE]: t("memory_inspect.tree_disabled_no_bridge"),
    [MEMORY_V2_TREE_DISABLED_REASONS.SIDECAR_UNAVAILABLE]: t(
      "memory_inspect.tree_disabled_sidecar",
    ),
    [MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF]: t("memory_inspect.tree_disabled_rollout"),
    [MEMORY_V2_TREE_DISABLED_REASONS.STORE_DISABLED]: t("memory_inspect.tree_disabled_store"),
  };

  const renderBody = () => {
    switch (result.state) {
      case MEMORY_V2_TREE_STATES.LOADING:
        return (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontFamily,
              color: meta_color,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {t("memory_inspect.loading")}
          </div>
        );

      case MEMORY_V2_TREE_STATES.DISABLED:
        return (
          <TreeStateCard
            icon="information"
            tone="muted"
            dashed
            title={t("memory_inspect.tree_disabled")}
            detail={disabledDetail[result.reason] || ""}
            isDark={isDark}
            fontFamily={fontFamily}
          />
        );

      case MEMORY_V2_TREE_STATES.EMPTY:
        return (
          <TreeStateCard
            icon="folder"
            tone="muted"
            title={t("memory_inspect.tree_empty")}
            detail={t("memory_inspect.tree_empty_detail")}
            isDark={isDark}
            fontFamily={fontFamily}
            onRetry={refresh}
            retryLabel={t("memory_inspect.tree_refresh")}
          />
        );

      case MEMORY_V2_TREE_STATES.ERROR:
        return (
          <TreeStateCard
            icon="warning"
            tone="danger"
            title={t("memory_inspect.tree_failed")}
            detail={result.errorMessage}
            code={result.errorCode}
            isDark={isDark}
            fontFamily={fontFamily}
            onRetry={refresh}
            retryLabel={t("memory_inspect.tree_retry")}
          />
        );

      case MEMORY_V2_TREE_STATES.READY:
        return (
          <div
            className="scrollable"
            data-testid="memory-v2-tree-rows"
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: "6px 8px 8px",
            }}
          >
            {flattened.rows.map((row) => (
              <TreeRow
                key={row.key}
                row={row}
                isDark={isDark}
                fontFamily={fontFamily}
                color={color}
                onToggle={onToggle}
              />
            ))}
          </div>
        );

      /* UNKNOWN and anything a future producer adds. Never silently blank. */
      default:
        return (
          <TreeStateCard
            icon="question_mark"
            tone="caution"
            title={t("memory_inspect.tree_unknown")}
            detail={t("memory_inspect.tree_unknown_detail")}
            isDark={isDark}
            fontFamily={fontFamily}
            onRetry={refresh}
            retryLabel={t("memory_inspect.tree_retry")}
          />
        );
    }
  };

  const showSpaceBar = result.spaces.length > 0;

  return (
    <div
      data-testid="memory-v2-tree-view"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        borderRadius: "inherit",
        backgroundColor: "rgb(var(--pupu-surface-rgb))",
        overflow: "hidden",
      }}
    >
      {/* ━━ Header — mirrors the vector view's, so switching does not jump ━ */}
      <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
            color,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {t("memory_inspect.title")}
        </div>
        {chatTitle && (
          <div
            style={{
              fontSize: 12,
              fontFamily,
              color: meta_color,
              marginTop: 2,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {chatTitle}
          </div>
        )}
        {/* reserves the band the view switcher is absolutely positioned into */}
        <div style={{ height: 40 }} />
      </div>

      {/* ━━ Space bar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showSpaceBar && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            padding: "0 12px 8px 24px",
            borderBottom: `1px solid ${divider}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: 1,
              minWidth: 0,
              overflowX: "auto",
            }}
          >
            {result.spaces.map((space) => {
              const active = space.spaceId === result.spaceId;
              return (
                <Button
                  key={space.spaceId}
                  label={space.name || space.spaceId}
                  onClick={() => selectSpace(space.spaceId)}
                  style={{
                    fontSize: 11,
                    paddingVertical: 3,
                    paddingHorizontal: 9,
                    borderRadius: 6,
                    opacity: active ? 1 : 0.45,
                    hoverBackgroundColor: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.06)",
                  }}
                />
              );
            })}
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
              color: meta_color,
              flexShrink: 0,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {t("memory_inspect.tree_entry_count", { count: result.entryCount })}
          </span>
          <Button
            prefix_icon="refresh"
            onClick={refresh}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 6,
              opacity: 0.45,
              flexShrink: 0,
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.06)",
              content: { icon: { width: 13, height: 13 } },
            }}
          />
        </div>
      )}

      {/* ━━ Body ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {renderBody()}
      </div>

      {/* ━━ Truncation footer — the render cap, said out loud ━━━━━━━━━━ */}
      {result.state === MEMORY_V2_TREE_STATES.READY && flattened.truncated && (
        <div
          style={{
            flexShrink: 0,
            padding: "6px 24px 8px",
            borderTop: `1px solid ${divider}`,
            fontSize: 10,
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: meta_color,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {t("memory_inspect.tree_truncated", {
            shown: flattened.rows.length,
            total: flattened.visibleCount,
          })}
        </div>
      )}
    </div>
  );
};

export { MemoryV2TreeView as default, MemoryV2TreeView };
