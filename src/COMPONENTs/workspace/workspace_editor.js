import { useCallback, useMemo, useState } from "react";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import {
  readWorkspaces,
  writeWorkspaces,
  readWorkspaceRoot,
  writeWorkspaceRoot,
  makeWorkspaceId,
  validateWorkspaceRoot,
} from "../settings/runtime";
import { runtimeBridge } from "../../SERVICEs/bridges/miso_bridge";

/* ── Theme colours ───────────────────────────────────────────────────────── */

const useThemeColors = (isDark) =>
  useMemo(
    () => ({
      text: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)",
      muted: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
      error: isDark ? "#ff7f7f" : "#c62828",
      success: isDark ? "#86efac" : "#2e7d32",
      border: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)",
      hoverBg: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      accent: "rgba(10,186,181,1)",
    }),
    [isDark],
  );

/* ── Sub-heading ─────────────────────────────────────────────────────────── */

const SubHeading = ({ children, isDark, style }) => (
  <div
    style={{
      fontSize: 11,
      fontFamily: "Jost, sans-serif",
      textTransform: "uppercase",
      letterSpacing: "1.6px",
      fontWeight: 500,
      color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.32)",
      padding: "16px 0 8px",
      userSelect: "none",
      ...style,
    }}
  >
    {children}
  </div>
);

/* ── Thin vertical divider ───────────────────────────────────────────────── */

const Divider = ({ isDark }) => (
  <div
    style={{
      width: 1,
      height: 14,
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
      marginLeft: 2,
      marginRight: 2,
      flexShrink: 0,
    }}
  />
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DefaultWorkspaceSection
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DefaultWorkspaceSection = ({ isDark }) => {
  const c = useThemeColors(isDark);
  const [workspaceRoot, setWorkspaceRoot] = useState(() => readWorkspaceRoot());
  const [savedWorkspaceRoot, setSavedWorkspaceRoot] = useState(() =>
    readWorkspaceRoot(),
  );
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

  const browseSupported = runtimeBridge.isWorkspacePickerAvailable();
  const openFolderSupported = runtimeBridge.isOpenRuntimeFolderAvailable();

  const isDirty = useMemo(
    () => workspaceRoot.trim() !== savedWorkspaceRoot.trim(),
    [workspaceRoot, savedWorkspaceRoot],
  );

  const busy = isSaving || isBrowsing || isOpeningFolder;

  const handleSave = useCallback(async () => {
    const candidate = workspaceRoot.trim();
    setIsSaving(true);
    setError("");
    setInfo("");

    const validation = await validateWorkspaceRoot(candidate);
    if (!validation.valid) {
      setError(validation.reason || "Invalid workspace root.");
      setIsSaving(false);
      return;
    }

    const nextPath = validation.resolvedPath || candidate;
    writeWorkspaceRoot(nextPath);
    setWorkspaceRoot(nextPath);
    setSavedWorkspaceRoot(nextPath);
    setInfo(nextPath ? "Saved." : "Cleared.");
    setIsSaving(false);
  }, [workspaceRoot]);

  const handleClear = useCallback(() => {
    writeWorkspaceRoot("");
    setWorkspaceRoot("");
    setSavedWorkspaceRoot("");
    setError("");
    setInfo("Cleared.");
  }, []);

  const handleBrowse = useCallback(async () => {
    if (!browseSupported) {
      setError("Directory picker is only available in Electron.");
      return;
    }
    setIsBrowsing(true);
    setError("");
    setInfo("");
    try {
      const response = await runtimeBridge.pickWorkspaceRoot(
        workspaceRoot.trim() || savedWorkspaceRoot.trim(),
      );
      if (
        !response?.canceled &&
        typeof response?.path === "string" &&
        response.path.trim()
      ) {
        setWorkspaceRoot(response.path.trim());
      }
    } catch (err) {
      setError(err?.message || "Failed to open directory picker.");
    } finally {
      setIsBrowsing(false);
    }
  }, [browseSupported, workspaceRoot, savedWorkspaceRoot]);

  const handleOpenFolder = useCallback(async () => {
    const folderPath = savedWorkspaceRoot.trim();
    setIsOpeningFolder(true);
    setError("");
    setInfo("");
    try {
      const response = await runtimeBridge.openRuntimeFolder(folderPath);
      if (!response?.ok) {
        setError(response?.error || "Failed to open folder.");
      }
    } catch (err) {
      setError(err?.message || "Failed to open folder.");
    } finally {
      setIsOpeningFolder(false);
    }
  }, [savedWorkspaceRoot]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <SubHeading isDark={isDark}>Default Workspace</SubHeading>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: isDark
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(0,0,0,0.12)",
          borderRadius: 7,
          overflow: "hidden",
        }}
      >
        <input
          type="text"
          value={workspaceRoot}
          onChange={(e) => {
            setWorkspaceRoot(e.target.value);
            setError("");
            setInfo("");
          }}
          placeholder="Enter workspace path..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: "Jost, sans-serif",
            color: isDark ? "#ccc" : "#222",
            background: "transparent",
            border: "none",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 4,
            flexWrap: "wrap",
            padding: "4px 8px 8px",
          }}
        >
          <Button
            label={isSaving ? "Saving..." : "Save"}
            onClick={handleSave}
            disabled={busy || !isDirty}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 6,
              fontSize: 12,
              opacity: isDirty ? 1 : 0.35,
              hoverBackgroundColor: c.hoverBg,
            }}
          />
          {browseSupported && (
            <Button
              label={isBrowsing ? "..." : "Browse"}
              onClick={handleBrowse}
              disabled={busy}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                fontSize: 12,
                opacity: 0.6,
                hoverBackgroundColor: c.hoverBg,
              }}
            />
          )}
          {savedWorkspaceRoot.trim() && (
            <Button
              label="Clear"
              onClick={handleClear}
              disabled={busy}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.5,
                fontSize: 12,
                hoverBackgroundColor: isDark
                  ? "rgba(239,83,80,0.15)"
                  : "rgba(239,83,80,0.1)",
              }}
            />
          )}
          {openFolderSupported && savedWorkspaceRoot.trim() && (
            <Button
              label={isOpeningFolder ? "..." : "Open in Explorer"}
              onClick={handleOpenFolder}
              disabled={busy}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.5,
                fontSize: 12,
                hoverBackgroundColor: c.hoverBg,
              }}
            />
          )}
        </div>
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "Jost, sans-serif",
            color: c.error,
          }}
        >
          {error}
        </div>
      )}
      {!error && info && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "Jost, sans-serif",
            color: c.success,
          }}
        >
          {info}
        </div>
      )}

      <div
        style={{
          fontSize: 11,
          fontFamily: "Jost, sans-serif",
          color: c.muted,
          lineHeight: 1.5,
        }}
      >
        Applied to every Miso request when workspace toolkit is enabled.
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   WorkspacesSection — flat list with inline actions
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const WorkspacesSection = ({ isDark }) => {
  const c = useThemeColors(isDark);
  const [items, setItems] = useState(() => readWorkspaces());
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", path: "" });
  const [unsavedIds, setUnsavedIds] = useState(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [hoveredId, setHoveredId] = useState(null);

  const browseSupported = runtimeBridge.isWorkspacePickerAvailable();

  const startEditing = useCallback((item) => {
    setEditingId(item.id);
    setEditDraft({ name: item.name || "", path: item.path || "" });
    setEditError("");
  }, []);

  const cancelEditing = useCallback(() => {
    setItems((prev) =>
      unsavedIds.has(editingId) ? prev.filter((w) => w.id !== editingId) : prev,
    );
    setUnsavedIds((prev) => {
      const next = new Set(prev);
      next.delete(editingId);
      return next;
    });
    setEditingId(null);
    setEditDraft({ name: "", path: "" });
    setEditError("");
  }, [editingId, unsavedIds]);

  const addItem = useCallback(() => {
    const id = makeWorkspaceId();
    const newItem = { id, name: "", path: "" };
    setItems((prev) => [...prev, newItem]);
    setUnsavedIds((prev) => new Set([...prev, id]));
    setEditingId(id);
    setEditDraft({ name: "", path: "" });
    setEditError("");
  }, []);

  const handleBrowse = useCallback(async () => {
    try {
      const response = await runtimeBridge.pickWorkspaceRoot(
        editDraft.path.trim() || "",
      );
      if (
        !response?.canceled &&
        typeof response?.path === "string" &&
        response.path.trim()
      ) {
        setEditDraft((d) => ({ ...d, path: response.path.trim() }));
      }
    } catch (_err) {}
  }, [editDraft.path]);

  const handleSaveItem = useCallback(async () => {
    setIsSaving(true);
    setEditError("");

    const rawPath = editDraft.path.trim();
    let resolvedPath = rawPath;

    if (rawPath) {
      const validation = await validateWorkspaceRoot(rawPath);
      if (!validation.valid) {
        setEditError(validation.reason || "Invalid path.");
        setIsSaving(false);
        return;
      }
      resolvedPath = validation.resolvedPath || rawPath;
    }

    const saved = {
      id: editingId,
      name: editDraft.name.trim(),
      path: resolvedPath,
    };

    setItems((prev) => prev.map((w) => (w.id === editingId ? saved : w)));
    setUnsavedIds((prev) => {
      const next = new Set(prev);
      next.delete(editingId);
      return next;
    });

    const next = items.map((w) => (w.id === editingId ? saved : w));
    writeWorkspaces(next.filter((w) => w.path || w.name));

    setEditingId(null);
    setEditDraft({ name: "", path: "" });
    setIsSaving(false);
  }, [editingId, editDraft, items]);

  const deleteItem = useCallback(
    (id) => {
      const next = items.filter((w) => w.id !== id);
      setItems(next);
      writeWorkspaces(next.filter((w) => w.path || w.name));
      if (editingId === id) {
        setEditingId(null);
        setEditDraft({ name: "", path: "" });
        setEditError("");
      }
      setUnsavedIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    },
    [items, editingId],
  );

  return (
    <div>
      <SubHeading isDark={isDark}>Workspaces</SubHeading>

      {items.length === 0 && editingId === null && (
        <div
          style={{
            fontSize: 12,
            color: c.muted,
            fontFamily: "Jost, sans-serif",
            padding: "4px 0 8px",
          }}
        >
          No workspaces added yet.
        </div>
      )}

      {items.map((item) => {
        const isEditing = editingId === item.id;

        if (isEditing) {
          return (
            <div
              key={item.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 0",
                borderBottom: `1px solid ${c.border}`,
              }}
            >
              <Input
                value={editDraft.name}
                placeholder="Name (optional)"
                set_value={(v) => setEditDraft((d) => ({ ...d, name: v }))}
                style={{ flex: 1, fontSize: 13, height: 34 }}
              />
              <Input
                value={editDraft.path}
                placeholder="/path/to/workspace"
                set_value={(v) => setEditDraft((d) => ({ ...d, path: v }))}
                postfix_component={
                  browseSupported ? (
                    <Button
                      label="Browse"
                      onClick={handleBrowse}
                      disabled={isSaving}
                      style={{
                        paddingVertical: 2,
                        paddingHorizontal: 8,
                        borderRadius: 4,
                        fontSize: 12,
                        opacity: 0.5,
                        hoverBackgroundColor: c.hoverBg,
                      }}
                    />
                  ) : null
                }
                style={{ flex: 1, fontSize: 13, height: 34 }}
              />
              {editError && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "Jost, sans-serif",
                    color: c.error,
                  }}
                >
                  {editError}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 6,
                  paddingTop: 2,
                }}
              >
                <Button
                  label="Cancel"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 6,
                    opacity: 0.5,
                    fontSize: 12,
                    hoverBackgroundColor: c.hoverBg,
                  }}
                />
                <Button
                  label={isSaving ? "Saving..." : "Save"}
                  onClick={handleSaveItem}
                  disabled={isSaving}
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    hoverBackgroundColor: c.hoverBg,
                  }}
                />
              </div>
            </div>
          );
        }

        const displayName = item.name?.trim() || item.path?.trim() || "Unnamed";
        const displayPath = item.name?.trim() ? item.path?.trim() : null;

        return (
          <div
            key={item.id}
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 2px",
              borderBottom: `1px solid ${c.border}`,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: "Jost, sans-serif",
                  fontWeight: 500,
                  color: c.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {displayName}
              </div>
              {displayPath && (
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    color: c.muted,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {displayPath}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                flexShrink: 0,
                opacity: hoveredId === item.id ? 1 : 0,
                transition: "opacity 0.12s ease",
              }}
            >
              <Button
                prefix_icon="folder_open"
                onClick={() => {
                  if (item.path?.trim()) {
                    runtimeBridge.openRuntimeFolder(item.path.trim());
                  }
                }}
                disabled={editingId !== null || !item.path?.trim()}
                style={{
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  opacity: 0.45,
                  content: { icon: { width: 14, height: 14 } },
                  hoverBackgroundColor: c.hoverBg,
                }}
              />
              <Divider isDark={isDark} />
              <Button
                prefix_icon="edit_pen"
                onClick={() => startEditing(item)}
                disabled={editingId !== null}
                style={{
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  opacity: 0.5,
                  content: { icon: { width: 14, height: 14 } },
                  hoverBackgroundColor: c.hoverBg,
                }}
              />
              <Divider isDark={isDark} />
              <Button
                prefix_icon="delete"
                onClick={() => deleteItem(item.id)}
                disabled={editingId !== null}
                style={{
                  paddingVertical: 2,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  opacity: 0.4,
                  content: { icon: { width: 14, height: 14 } },
                  hoverBackgroundColor: isDark
                    ? "rgba(239,83,80,0.15)"
                    : "rgba(239,83,80,0.1)",
                }}
              />
            </div>
          </div>
        );
      })}

      {/* Add workspace — minimal */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 12,
          marginBottom: 4,
        }}
      >
        <Button
          label="+ Add Workspace"
          onClick={addItem}
          disabled={editingId !== null}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: 6,
            fontSize: 12,
            opacity: editingId !== null ? 0.3 : 0.6,
            hoverBackgroundColor: c.hoverBg,
          }}
        />
      </div>

      <div
        style={{
          fontSize: 11,
          fontFamily: "Jost, sans-serif",
          color: c.muted,
          lineHeight: 1.5,
          padding: "4px 0 0",
        }}
      >
        Named workspaces can be selected per-chat from the chat input toolbar.
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   WorkspaceEditor — reusable composite (DefaultWorkspace + Workspaces list)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const WorkspaceEditor = ({ isDark }) => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    <DefaultWorkspaceSection isDark={isDark} />
    <div style={{ height: 8 }} />
    <WorkspacesSection isDark={isDark} />
  </div>
);

export default WorkspaceEditor;
