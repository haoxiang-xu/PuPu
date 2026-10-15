import React, { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import DetailPanel from "./recipes_page/detail_panel/detail_panel";
import SkeletonSaveBar from "./recipes_page/skeleton_save_bar";
import useSkeletonResource from "./recipes_page/use_skeleton_resource";
import { can_convert_legacy_pools } from "./recipes_page/skeleton_resource_session";
import SkeletonCanvas from "./recipes_page/skeleton_canvas";
import { SESSION_STATUS } from "./recipes_page/skeleton_resource_session";

/* One Skeleton resource, open for editing.
 *
 * This is the first product surface that talks to the resource store: it loads
 * through the real facade, hands the document to the shared detail panel, and
 * saves at the token it loaded, with the conflict choices in the bar.
 *
 * The graph is drawn from two sources kept apart on purpose: the document says
 * what it is, and `SERVICEs/skeleton_layout` says where it is drawn. A
 * Skeleton node is closed to `{id, type, config}` and the store refuses a
 * coordinate, so a position is not something this page may persist into the
 * Agent — and because the canvas has no route to the document at all, moving a
 * node cannot change what the Agent does. */

const PANEL = (isDark) => ({
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
  color: "var(--pupu-text)",
  backgroundColor: isDark ? "var(--pupu-background)" : "var(--pupu-background)",
});

const NOTE = { fontSize: 11, color: "#86868b", lineHeight: 1.45 };

const ROW = (isDark, selected) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 9px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11.5,
  background: selected
    ? isDark
      ? "rgba(255,255,255,0.07)"
      : "rgba(0,0,0,0.05)"
    : "transparent",
});

export default function SkeletonResourcePage({ resourceId }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const {
    session,
    load,
    edit,
    save,
    keepMine,
    takeTheirs,
    preflight,
    convertLegacyPools,
  } = useSkeletonResource();
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  useEffect(() => {
    if (!resourceId) return;
    load(resourceId);
    setSelectedNodeId(null);
  }, [resourceId, load]);

  const document = session.document;
  const nodes = (document && document.nodes) || [];

  return (
    <div style={PANEL(isDark)} data-testid="skeleton-resource-page">
      <SkeletonSaveBar
        session={session}
        isDark={isDark}
        onSave={save}
        onKeepMine={keepMine}
        onTakeTheirs={takeTheirs}
        onPreflight={preflight}
      />

      {session.status === SESSION_STATUS.LOADING && (
        <span style={NOTE}>Opening…</span>
      )}

      {session.status === SESSION_STATUS.LOAD_FAILED && (
        <span data-testid="skeleton-load-failed" style={NOTE}>
          {(session.error && session.error.message) ||
            "This Agent could not be opened."}
        </span>
      )}

      {session.status === SESSION_STATUS.READY && (
        <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          {/* The graph, and the same nodes as a list beside it. The list is
              not a fallback for the canvas — it is how a node is reached by
              name when the graph is large, and it is what a keyboard can
              use. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <SkeletonCanvas
              resourceId={session.resource_id}
              document={document}
              onSelectNode={setSelectedNodeId}
              isDark={isDark}
            />
            <div
              data-testid="skeleton-node-list"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                paddingTop: 8,
                flexShrink: 0,
              }}
            >
              {nodes.map((node) => (
                <div
                  key={node.id}
                  data-testid={`skeleton-node-${node.id}`}
                  onClick={() => setSelectedNodeId(node.id)}
                  style={ROW(isDark, node.id === selectedNodeId)}
                >
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {node.id}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#86868b" }}>
                    {node.type}
                  </span>
                </div>
              ))}
              {nodes.length === 0 && <span style={NOTE}>This graph has no nodes.</span>}
            </div>
          </div>

          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <DetailPanel
              recipe={null}
              selectedNodeId={selectedNodeId}
              onChange={() => {}}
              onChangeSilent={() => {}}
              document={document}
              documentRevision={session.document_revision}
              diagnostics={session.diagnostics}
              onDocumentChange={edit}
              onConvertLegacy={convertLegacyPools}
              canConvertLegacy={can_convert_legacy_pools(session)}
              convertingLegacy={session.converting}
            />
          </div>
        </div>
      )}
    </div>
  );
}
