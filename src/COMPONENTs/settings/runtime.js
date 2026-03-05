import { useCallback, useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SettingsSection } from "./appearance";
import { runtimeBridge } from "../../SERVICEs/bridges/miso_bridge";

const SETTINGS_STORAGE_KEY = "settings";
const SYSTEM_PROMPT_V2_SECTION_KEYS = [
  "personality",
  "rules",
  "style",
  "output_format",
  "context",
  "constraints",
];
const SYSTEM_PROMPT_V2_SECTION_LABELS = {
  personality: "Personality",
  rules: "Rules",
  style: "Style",
  output_format: "Output Format",
  context: "Context",
  constraints: "Constraints",
};
const SYSTEM_PROMPT_V2_SECTION_LIMIT = 2000;
const DEFAULT_GLOBAL_SYSTEM_PROMPT_V2_RULES = [
  "Once you start your final answer, treat that single message as the final deliverable. Output may be truncated, so do not depend on follow-up continuation.",
  "Tool use is optional. Call tools only when they are genuinely necessary to produce a correct and useful answer.",
].join("\n");

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readSettingsRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
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

const normalizeSystemPromptV2SectionKey = (rawKey) => {
  if (typeof rawKey !== "string") {
    return "";
  }
  const normalized = rawKey.trim().toLowerCase();
  const aliased = normalized === "personally" ? "personality" : normalized;
  return SYSTEM_PROMPT_V2_SECTION_KEYS.includes(aliased) ? aliased : "";
};

const sanitizeSystemPromptV2Sections = (rawSections = {}) => {
  const sanitized = {};
  if (!isObject(rawSections)) {
    return sanitized;
  }

  Object.entries(rawSections).forEach(([rawKey, rawValue]) => {
    const key = normalizeSystemPromptV2SectionKey(rawKey);
    if (!key || typeof rawValue !== "string") {
      return;
    }
    sanitized[key] = rawValue.trim().slice(0, SYSTEM_PROMPT_V2_SECTION_LIMIT);
  });

  return sanitized;
};

const createEmptySystemPromptV2Sections = () =>
  SYSTEM_PROMPT_V2_SECTION_KEYS.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {});

const toSystemPromptV2EditorSections = (rawSections = {}) => {
  const sanitized = sanitizeSystemPromptV2Sections(rawSections);
  return {
    ...createEmptySystemPromptV2Sections(),
    ...sanitized,
  };
};

const getDefaultSystemPromptV2Config = () => ({
  enabled: true,
  sections: toSystemPromptV2EditorSections({
    rules: DEFAULT_GLOBAL_SYSTEM_PROMPT_V2_RULES,
  }),
});

const readSystemPromptV2Config = () => {
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  const rawConfig = isObject(runtime.system_prompt_v2) ? runtime.system_prompt_v2 : {};
  if (!isObject(runtime.system_prompt_v2)) {
    return getDefaultSystemPromptV2Config();
  }
  return {
    enabled: rawConfig.enabled === true,
    sections: toSystemPromptV2EditorSections(rawConfig.sections),
  };
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

const writeSystemPromptV2Config = ({ enabled = false, sections = {} } = {}) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  root.runtime = {
    ...runtime,
    system_prompt_v2: {
      enabled: enabled === true,
      sections: sanitizeSystemPromptV2Sections(sections),
    },
  };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
};

const areSystemPromptV2SectionsEqual = (left = {}, right = {}) =>
  SYSTEM_PROMPT_V2_SECTION_KEYS.every((key) => (left[key] || "") === (right[key] || ""));

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
      typeof response?.resolvedPath === "string" ? response.resolvedPath.trim() : "";
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
  const [systemPromptEnabled, setSystemPromptEnabled] = useState(
    () => readSystemPromptV2Config().enabled,
  );
  const [savedSystemPromptEnabled, setSavedSystemPromptEnabled] = useState(
    () => readSystemPromptV2Config().enabled,
  );
  const [systemPromptSections, setSystemPromptSections] = useState(
    () => readSystemPromptV2Config().sections,
  );
  const [savedSystemPromptSections, setSavedSystemPromptSections] = useState(
    () => readSystemPromptV2Config().sections,
  );
  const [systemPromptError, setSystemPromptError] = useState("");
  const [systemPromptInfo, setSystemPromptInfo] = useState("");
  const [isSavingSystemPrompt, setIsSavingSystemPrompt] = useState(false);

  const browseSupported =
    runtimeBridge.isWorkspacePickerAvailable();

  const openFolderSupported =
    runtimeBridge.isOpenRuntimeFolderAvailable();

  const isDirty = useMemo(
    () => workspaceRoot.trim() !== savedWorkspaceRoot.trim(),
    [workspaceRoot, savedWorkspaceRoot],
  );
  const isSystemPromptDirty = useMemo(
    () =>
      systemPromptEnabled !== savedSystemPromptEnabled ||
      !areSystemPromptV2SectionsEqual(
        systemPromptSections,
        savedSystemPromptSections,
      ),
    [
      systemPromptEnabled,
      savedSystemPromptEnabled,
      systemPromptSections,
      savedSystemPromptSections,
    ],
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
      if (!response?.canceled && typeof response?.path === "string" && response.path.trim()) {
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

  const handleSaveSystemPrompt = useCallback(() => {
    setIsSavingSystemPrompt(true);
    setSystemPromptError("");
    setSystemPromptInfo("");

    const normalizedSections = toSystemPromptV2EditorSections(systemPromptSections);
    writeSystemPromptV2Config({
      enabled: systemPromptEnabled,
      sections: normalizedSections,
    });
    setSystemPromptSections(normalizedSections);
    setSavedSystemPromptSections(normalizedSections);
    setSavedSystemPromptEnabled(systemPromptEnabled);
    setSystemPromptInfo("System prompt settings saved.");
    setIsSavingSystemPrompt(false);
  }, [systemPromptEnabled, systemPromptSections]);

  const handleClearSystemPrompt = useCallback(() => {
    const clearedSections = createEmptySystemPromptV2Sections();
    writeSystemPromptV2Config({
      enabled: false,
      sections: clearedSections,
    });
    setSystemPromptEnabled(false);
    setSavedSystemPromptEnabled(false);
    setSystemPromptSections(clearedSections);
    setSavedSystemPromptSections(clearedSections);
    setSystemPromptError("");
    setSystemPromptInfo("System prompt settings cleared.");
  }, []);

  return (
    <div>
      <SettingsSection title="Miso Workspace" icon="terminal">
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
              disabled={!browseSupported || isBrowsing || isSaving || isOpeningFolder}
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
              disabled={isSaving || isBrowsing || isOpeningFolder || !savedWorkspaceRoot.trim()}
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
            This root is sent with each Miso request and used as
            <code style={{ marginLeft: 4, marginRight: 4 }}>workspace_root</code>
            when workspace toolkit is enabled.
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="System Prompt (V2)" icon="terminal">
        <div
          style={{
            padding: "14px 0",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontFamily: "Jost, sans-serif",
            }}
          >
            <input
              type="checkbox"
              checked={systemPromptEnabled}
              onChange={(event) => {
                setSystemPromptEnabled(event.target.checked);
                setSystemPromptError("");
                setSystemPromptInfo("");
              }}
            />
            Enable system prompt injection
          </label>

          {SYSTEM_PROMPT_V2_SECTION_KEYS.map((sectionKey) => (
            <div
              key={sectionKey}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <label
                style={{
                  fontSize: 12,
                  fontFamily: "Jost, sans-serif",
                  color: mutedColor,
                }}
              >
                {SYSTEM_PROMPT_V2_SECTION_LABELS[sectionKey]}
              </label>
              <textarea
                value={systemPromptSections[sectionKey] || ""}
                onChange={(event) => {
                  const nextValue = event.target.value.slice(
                    0,
                    SYSTEM_PROMPT_V2_SECTION_LIMIT,
                  );
                  setSystemPromptSections((previous) => ({
                    ...previous,
                    [sectionKey]: nextValue,
                  }));
                  setSystemPromptError("");
                  setSystemPromptInfo("");
                }}
                rows={3}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "vertical",
                  minHeight: 72,
                  borderRadius: 8,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}`,
                  backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "#fff",
                  color: isDark ? "#fff" : "#111",
                  fontFamily: "Jost, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.45,
                  padding: "8px 10px",
                }}
              />
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              label={isSavingSystemPrompt ? "Saving..." : "Save"}
              onClick={handleSaveSystemPrompt}
              disabled={isSavingSystemPrompt || !isSystemPromptDirty}
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
            <Button
              label="Clear"
              onClick={handleClearSystemPrompt}
              disabled={isSavingSystemPrompt}
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
          </div>

          {systemPromptError && (
            <div
              style={{
                fontSize: 12,
                fontFamily: "Jost, sans-serif",
                color: errorColor,
              }}
            >
              {systemPromptError}
            </div>
          )}

          {!systemPromptError && systemPromptInfo && (
            <div
              style={{
                fontSize: 12,
                fontFamily: "Jost, sans-serif",
                color: successColor,
              }}
            >
              {systemPromptInfo}
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
            Saved defaults are attached to v2 chat requests as
            <code style={{ marginLeft: 4, marginRight: 4 }}>
              options.system_prompt_v2.defaults
            </code>
            and can be overridden per-chat by API payload.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};
