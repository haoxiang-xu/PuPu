import { useCallback, useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SettingsSection } from "./appearance";
import { runtimeBridge } from "../../SERVICEs/bridges/miso_bridge";

const SETTINGS_STORAGE_KEY = "settings";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readSettingsRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    );
    return isObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const readWorkspaceRoot = () => {
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  return typeof runtime.workspace_root === "string"
    ? runtime.workspace_root.trim()
    : "";
};

const writeWorkspaceRoot = (workspaceRoot) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const trimmed = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  root.runtime = {
    ...runtime,
    workspace_root: trimmed,
  };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
};

export const readWorkspaces = () => {
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  const list = Array.isArray(runtime.workspaces) ? runtime.workspaces : [];
  return list.filter(
    (w) =>
      isObject(w) &&
      typeof w.id === "string" &&
      w.id.trim() &&
      (typeof w.path === "string" || typeof w.name === "string"),
  );
};

const writeWorkspaces = (workspaces) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  root.runtime = { ...runtime, workspaces };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
};

const makeWorkspaceId = () =>
  `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

const validateWorkspaceRoot = async (workspaceRoot) => {
  const trimmed = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  if (!trimmed) {
    return { valid: true, resolvedPath: "", reason: "" };
  }

  if (!runtimeBridge.isWorkspaceValidationAvailable()) {
    return { valid: true, resolvedPath: trimmed, reason: "" };
  }

  try {
    const response = await runtimeBridge.validateWorkspaceRoot(trimmed);
    const valid = Boolean(response?.valid);
    const resolvedPath =
      typeof response?.resolvedPath === "string"
        ? response.resolvedPath.trim()
        : "";
    const reason = typeof response?.reason === "string" ? response.reason : "";
    return {
      valid,
      resolvedPath,
      reason,
    };
  } catch (error) {
    return {
      valid: false,
      resolvedPath: "",
      reason: error?.message || "Failed to validate workspace path",
    };
  }
};

export const RuntimeSettings = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
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

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const errorColor = isDark ? "#ff7f7f" : "#c62828";
  const successColor = isDark ? "#86efac" : "#2e7d32";

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
    setInfo(nextPath ? "Workspace root saved." : "Workspace root cleared.");
    setIsSaving(false);
  }, [workspaceRoot]);

  const handleClear = useCallback(() => {
    writeWorkspaceRoot("");
    setWorkspaceRoot("");
    setSavedWorkspaceRoot("");
    setError("");
    setInfo("Workspace root cleared.");
  }, []);

  const handleBrowse = useCallback(async () => {
    if (!browseSupported) {
      setError("Directory picker is only available in Electron runtime.");
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
    } catch (error) {
      setError(error?.message || "Failed to open directory picker.");
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
    } catch (error) {
      setError(error?.message || "Failed to open folder.");
    } finally {
      setIsOpeningFolder(false);
    }
  }, [savedWorkspaceRoot]);

  return (
    <div>
      <SettingsSection title="Default Workspace" icon="terminal">
        <div
          style={{
            padding: "14px 0",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Input
            label="Workspace Root"
            placeholder="/path/to/workspace"
            value={workspaceRoot}
            set_value={(value) => {
              setWorkspaceRoot(value);
              setError("");
              setInfo("");
            }}
            style={{ width: "100%", fontSize: 14, height: 38 }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              label={isBrowsing ? "Browsing..." : "Browse"}
              onClick={handleBrowse}
              disabled={
                !browseSupported || isBrowsing || isSaving || isOpeningFolder
              }
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
            <Button
              label={isSaving ? "Saving..." : "Save"}
              onClick={handleSave}
              disabled={isSaving || isBrowsing || isOpeningFolder || !isDirty}
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
            <Button
              label="Clear"
              onClick={handleClear}
              disabled={
                isSaving ||
                isBrowsing ||
                isOpeningFolder ||
                !savedWorkspaceRoot.trim()
              }
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
            <Button
              label={isOpeningFolder ? "Opening..." : "Open Folder"}
              onClick={handleOpenFolder}
              disabled={
                !openFolderSupported ||
                isOpeningFolder ||
                isBrowsing ||
                isSaving ||
                !savedWorkspaceRoot.trim()
              }
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                fontFamily: "Jost, sans-serif",
                color: errorColor,
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
                color: successColor,
              }}
            >
              {info}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              fontFamily: "Jost, sans-serif",
              color: mutedColor,
              lineHeight: 1.5,
            }}
          >
            Applied to every Miso request automatically when workspace toolkit
            is enabled.
          </div>
        </div>
      </SettingsSection>

      <WorkspacesSection />
    </div>
  );
};

const WorkspacesSection = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  // `items` = persisted workspaces; only modified after a successful save.
  const [items, setItems] = useState(() => readWorkspaces());
  // Which item is currently open in edit mode.
  const [editingId, setEditingId] = useState(null);
  // Draft values for the item being edited.
  const [editDraft, setEditDraft] = useState({ name: "", path: "" });
  // IDs created via "Add" that haven't been saved yet.
  const [unsavedIds, setUnsavedIds] = useState(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const browseSupported = runtimeBridge.isWorkspacePickerAvailable();

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const errorColor = isDark ? "#ff7f7f" : "#c62828";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.82)";
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const startEditing = useCallback((item) => {
    setEditingId(item.id);
    setEditDraft({ name: item.name || "", path: item.path || "" });
    setEditError("");
  }, []);

  const cancelEditing = useCallback(() => {
    // If this was a brand-new unsaved item, remove it entirely.
    setItems((prev) =>
      unsavedIds.has(editingId)
        ? prev.filter((w) => w.id !== editingId)
        : prev,
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

    setItems((prev) =>
      prev.map((w) => (w.id === editingId ? saved : w)),
    );
    setUnsavedIds((prev) => {
      const next = new Set(prev);
      next.delete(editingId);
      return next;
    });

    // Persist the full list
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

  const hasItems = items.length > 0;

  return (
    <SettingsSection title="Workspaces" icon="terminal">
      <div
        style={{
          padding: "14px 0",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {!hasItems && (
          <div
            style={{
              fontSize: 12,
              color: mutedColor,
              fontFamily: "Jost, sans-serif",
              paddingBottom: 10,
            }}
          >
            No workspaces added yet.
          </div>
        )}

        {hasItems && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderTop: `1px solid ${borderColor}`,
              marginBottom: 10,
            }}
          >
            {items.map((item) => {
              const isEditing = editingId === item.id;

              if (isEditing) {
                // ── Edit row ──────────────────────────────────────────────
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: `1px solid ${borderColor}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Input
                        placeholder="Name (optional)"
                        value={editDraft.name}
                        set_value={(v) =>
                          setEditDraft((d) => ({ ...d, name: v }))
                        }
                        style={{
                          width: 130,
                          flexShrink: 0,
                          fontSize: 13,
                          height: 34,
                        }}
                      />
                      <Input
                        placeholder="/path/to/workspace"
                        value={editDraft.path}
                        set_value={(v) =>
                          setEditDraft((d) => ({ ...d, path: v }))
                        }
                        style={{ flex: 1, fontSize: 13, height: 34 }}
                      />
                      {browseSupported && (
                        <Button
                          label="Browse"
                          onClick={handleBrowse}
                          disabled={isSaving}
                          style={{
                            fontSize: 12,
                            paddingVertical: 6,
                            paddingHorizontal: 11,
                            borderRadius: 7,
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>

                    {editError && (
                      <div
                        style={{
                          fontSize: 11,
                          color: errorColor,
                          fontFamily: "Jost, sans-serif",
                        }}
                      >
                        {editError}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6 }}>
                      <Button
                        label={isSaving ? "Saving..." : "Save"}
                        onClick={handleSaveItem}
                        disabled={isSaving}
                        style={{
                          fontSize: 12,
                          paddingVertical: 5,
                          paddingHorizontal: 12,
                          borderRadius: 7,
                        }}
                      />
                      <Button
                        label="Cancel"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        style={{
                          fontSize: 12,
                          paddingVertical: 5,
                          paddingHorizontal: 12,
                          borderRadius: 7,
                          opacity: 0.55,
                        }}
                      />
                    </div>
                  </div>
                );
              }

              // ── View row ────────────────────────────────────────────────
              const displayName = item.name?.trim() || item.path?.trim() || "Unnamed";
              const displayPath = item.name?.trim() ? item.path?.trim() : null;

              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderBottom: `1px solid ${borderColor}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontFamily: "Jost, sans-serif",
                        color: textColor,
                        fontWeight: 500,
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
                          color: mutedColor,
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

                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <Button
                      label="Edit"
                      onClick={() => startEditing(item)}
                      disabled={editingId !== null}
                      style={{
                        fontSize: 12,
                        paddingVertical: 4,
                        paddingHorizontal: 10,
                        borderRadius: 6,
                        opacity: editingId !== null ? 0.35 : 0.7,
                      }}
                    />
                    <Button
                      prefix_icon="delete"
                      onClick={() => deleteItem(item.id)}
                      disabled={editingId !== null}
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 6,
                        borderRadius: 6,
                        opacity: editingId !== null ? 0.25 : 0.5,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          label="Add Workspace"
          onClick={addItem}
          disabled={editingId !== null}
          style={{
            fontSize: 13,
            paddingVertical: 7,
            paddingHorizontal: 14,
            borderRadius: 7,
            opacity: editingId !== null ? 0.4 : 1,
          }}
        />

        <div
          style={{
            fontSize: 11,
            fontFamily: "Jost, sans-serif",
            color: mutedColor,
            lineHeight: 1.5,
            paddingTop: 10,
          }}
        >
          Named workspaces can be selected per-chat from the chat input toolbar.
        </div>
      </div>
    </SettingsSection>
  );
};
