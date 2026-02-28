import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";

const readWorkspaceRoot = () => {
  try {
    const root = JSON.parse(localStorage.getItem("settings") || "{}");
    return root?.runtime?.workspace_root || "";
  } catch {
    return "";
  }
};

const writeWorkspaceRoot = (path) => {
  try {
    const root = JSON.parse(localStorage.getItem("settings") || "{}");
    root.runtime = { ...(root.runtime || {}), workspace_root: path };
    localStorage.setItem("settings", JSON.stringify(root));
  } catch {}
};

const WorkspaceStep = ({ onNext }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [path, setPath] = useState(() => readWorkspaceRoot());
  const [validation, setValidation] = useState(null); // null | { valid: bool, message: string }
  const [validating, setValidating] = useState(false);

  const headingColor = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.88)";
  const subColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.32)";

  /* Validate path after it changes */
  useEffect(() => {
    if (!path) {
      setValidation(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setValidating(true);
      try {
        const result = await window.misoAPI?.validateWorkspaceRoot?.(path);
        if (!cancelled) {
          if (result?.valid) {
            setValidation({ valid: true, message: "Valid workspace path" });
          } else {
            setValidation({
              valid: false,
              message: result?.message || "Invalid path",
            });
          }
        }
      } catch {
        if (!cancelled)
          setValidation({ valid: false, message: "Could not validate path" });
      } finally {
        if (!cancelled) setValidating(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path]);

  const handleBrowse = useCallback(async () => {
    try {
      const result = await window.misoAPI?.pickWorkspaceRoot?.(path);
      if (result?.path) {
        setPath(result.path);
        writeWorkspaceRoot(result.path);
      }
    } catch {}
  }, [path]);

  const handleSave = useCallback(() => {
    writeWorkspaceRoot(path);
  }, [path]);

  const canContinue = validation?.valid === true;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Heading with icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <Icon src="folder" style={{ width: 22, height: 22 }} />
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "Jost",
            color: headingColor,
            letterSpacing: "-0.3px",
          }}
        >
          Set your workspace
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          fontFamily: "Jost",
          color: subColor,
          marginBottom: 28,
          lineHeight: 1.5,
          maxWidth: 360,
        }}
      >
        PuPu saves your chats and files here. Choose a folder you have full
        access to.
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: dividerColor, marginBottom: 24 }} />

      {/* Path input row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div style={{ flex: 1 }}>
          <Input
            value={path}
            set_value={(v) => {
              setPath(v);
              setValidation(null);
            }}
            placeholder="/Users/you/workspace"
            prefix_icon="folder"
            style={{ width: "100%" }}
          />
        </div>

        <Tooltip label="Browse for a folder" position="top">
          <Button
            prefix_icon="folder"
            label="Browse"
            onClick={handleBrowse}
            style={{
              fontSize: 13,
            }}
          />
        </Tooltip>
      </div>

      {/* Validation feedback */}
      <div style={{ minHeight: 22, marginBottom: 24 }}>
        {validating && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ArcSpinner size={14} stroke_width={2} />
            <span
              style={{ fontSize: 12, fontFamily: "Jost", color: mutedColor }}
            >
              Validating…
            </span>
          </div>
        )}
        {!validating && validation && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 12,
              fontFamily: "Jost",
              color: validation.valid ? "rgba(10,186,181,1)" : "#e05c5c",
            }}
          >
            <Icon
              src={validation.valid ? "check" : "error"}
              color={validation.valid ? "rgba(10,186,181,1)" : "#e05c5c"}
              style={{ width: 14, height: 14, flexShrink: 0 }}
            />
            {validation.message}
          </div>
        )}
      </div>

      {/* Continue */}
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          label="Continue"
          postfix_icon="arrow_right"
          onClick={() => {
            if (canContinue) {
              handleSave();
              onNext();
            }
          }}
          disabled={!canContinue}
          style={{
            fontSize: 13,
          }}
        />
        <Button
          label="Skip for now"
          onClick={onNext}
          style={{
            fontSize: 13,
          }}
        />
      </div>
    </div>
  );
};

export default WorkspaceStep;
