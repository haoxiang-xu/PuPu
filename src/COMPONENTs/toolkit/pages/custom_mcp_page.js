import { useContext, useMemo, useRef, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import {
  normalizeCustomMcpRecipe,
  parseCustomMcpEnvSecrets,
} from "../../../SERVICEs/mcp_install";
import { DEFAULT_MCP_ICON } from "../../../SERVICEs/mcp_toolkit_store";
import ToolkitIcon from "../components/toolkit_icon";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const ICON_MAX_DIM = 128;
const ICON_SVG_MAX_LENGTH = 200_000;
/* Side of the icon picker = height of the name+description stack (two 34px
   fields + 9px gap), so the square aligns flush with both inputs. */
const IDENTITY_STACK_HEIGHT = 77;

/* Reads a user-picked image into a ToolkitIcon file-icon. SVG is stored as raw
   text; raster images are downscaled to <=128px and re-encoded as PNG so the
   stored payload stays tiny and renders through ToolkitIcon's png/svg paths. */
function readIconFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("no file"));
      return;
    }
    const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("read failed"));

    if (isSvg) {
      reader.onload = () => {
        const content = String(reader.result || "");
        if (!content || content.length > ICON_SVG_MAX_LENGTH) {
          reject(new Error("svg too large"));
          return;
        }
        resolve({ type: "file", content, mimeType: "image/svg+xml" });
      };
      reader.readAsText(file);
      return;
    }

    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(
            1,
            ICON_MAX_DIM / Math.max(img.width || 1, img.height || 1),
          );
          const w = Math.max(1, Math.round((img.width || 1) * scale));
          const h = Math.max(1, Math.round((img.height || 1) * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          const content = (canvas.toDataURL("image/png").split(",")[1]) || "";
          if (!content) {
            reject(new Error("encode failed"));
            return;
          }
          resolve({ type: "file", content, mimeType: "image/png" });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

const CustomMcpPage = ({
  isDark,
  onInstall,
  installing = false,
  installError = null,
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState("stdio");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [url, setUrl] = useState("");
  const [envSecretsText, setEnvSecretsText] = useState("");
  const [icon, setIcon] = useState(null);
  const fileRef = useRef(null);

  const textColor = isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.82)";
  const mutedColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.45)";
  const sectionColor = isDark ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.34)";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const dashColor = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const segOnBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)";
  const actionBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.055)";

  const inputStyle = {
    width: "100%",
    fontSize: 12.5,
    fontFamily,
    borderRadius: 8,
    color: textColor,
    paddingVertical: 7,
    paddingHorizontal: 10,
  };

  const canInstall =
    String(name || "").trim() &&
    (transport === "http"
      ? String(url || "").trim()
      : String(command || "").trim());

  const envSetup = useMemo(
    () => parseCustomMcpEnvSecrets(envSecretsText),
    [envSecretsText],
  );

  const openPicker = () => fileRef.current?.click();

  const handlePickIcon = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      setIcon(await readIconFile(file));
    } catch (_) {
      /* unsupported / oversized file — keep the current icon */
    }
  };

  const handleInstall = () => {
    if (!canInstall || installing) return;
    const recipe = normalizeCustomMcpRecipe({
      name,
      description,
      transport,
      command,
      argsText,
      url,
      envSecretsText,
    });
    onInstall?.(
      {
        id: "custom",
        toolkitId: recipe.toolkit_id,
        toolkitName: recipe.toolkit_name,
        status: "available",
        source: "mcp",
        mcp: recipe.mcp,
      },
      {
        customRecipe: recipe,
        secrets: transport === "stdio" ? envSetup.values : {},
        ...(icon ? { customIcon: icon } : {}),
      },
    );
  };

  const sectionLabelStyle = {
    fontSize: 9.5,
    fontFamily,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: sectionColor,
    marginBottom: 9,
  };

  const dividerStyle = {
    height: 1,
    backgroundColor: dividerColor,
    margin: "14px 0 13px",
  };

  const stackStyle = { display: "flex", flexDirection: "column", gap: 9 };

  const segItemStyle = (active) => ({
    fontSize: 11.5,
    fontFamily,
    fontWeight: 500,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderRadius: 999,
    color: active ? textColor : mutedColor,
    root: { background: active ? segOnBg : "transparent" },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* ── Identity: icon picker + name/description (equal height) ── */}
      <div style={sectionLabelStyle}>{t("toolkit.custom_section_identity")}</div>
      <div style={{ display: "flex", gap: 11, alignItems: "stretch" }}>
        <div
          role="button"
          title={t("toolkit.custom_icon_upload")}
          onClick={openPicker}
          style={{
            /* Square sized to the name+description stack: two input fields
               (34px each: 18px input + 14px padding + 2px border) plus the 9px
               gap = 77px. Explicit square because aspect-ratio can't track the
               stretch height inside a flex row. */
            width: IDENTITY_STACK_HEIGHT,
            height: IDENTITY_STACK_HEIGHT,
            flexShrink: 0,
            position: "relative",
            borderRadius: 11,
            border: icon
              ? `1px solid ${borderColor}`
              : `1px dashed ${dashColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <ToolkitIcon
            icon={icon || DEFAULT_MCP_ICON}
            size={28}
            fallbackColor={mutedColor}
            style={{ borderRadius: icon ? 8 : 0 }}
          />
          <span
            style={{
              position: "absolute",
              right: -5,
              bottom: -5,
              width: 17,
              height: 17,
              borderRadius: 999,
              backgroundColor: accentColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon src="add" style={{ width: 10, height: 10 }} color="#fff" />
          </span>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/svg+xml,image/jpeg,image/webp"
            onChange={handlePickIcon}
            style={{ display: "none" }}
          />
        </div>

        <div style={{ ...stackStyle, flex: 1, minWidth: 0 }}>
          <Input
            value={name}
            set_value={setName}
            placeholder={t("toolkit.custom_name_placeholder")}
            style={inputStyle}
          />
          <Input
            value={description}
            set_value={setDescription}
            placeholder={t("toolkit.custom_description_placeholder")}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={dividerStyle} />

      {/* ── Connection ── */}
      <div style={sectionLabelStyle}>
        {t("toolkit.custom_section_connection")}
      </div>
      <div
        style={{
          display: "flex",
          gap: 2,
          border: `1px solid ${borderColor}`,
          borderRadius: 999,
          padding: 2,
          width: "fit-content",
          marginBottom: 11,
        }}
      >
        <Button
          label={t("toolkit.custom_transport_stdio")}
          onClick={() => setTransport("stdio")}
          style={segItemStyle(transport === "stdio")}
        />
        <Button
          label={t("toolkit.custom_transport_http")}
          onClick={() => setTransport("http")}
          style={segItemStyle(transport === "http")}
        />
      </div>

      {transport === "stdio" ? (
        <div style={stackStyle}>
          <Input
            value={command}
            set_value={setCommand}
            placeholder={t("toolkit.custom_command_placeholder")}
            style={inputStyle}
          />
          <Input
            value={argsText}
            set_value={setArgsText}
            placeholder={t("toolkit.custom_args_placeholder")}
            style={inputStyle}
          />
        </div>
      ) : (
        <Input
          value={url}
          set_value={setUrl}
          placeholder={t("toolkit.custom_url_placeholder")}
          style={inputStyle}
        />
      )}

      {/* ── Environment (stdio only) ── */}
      {transport === "stdio" && (
        <>
          <div style={dividerStyle} />
          <div style={sectionLabelStyle}>
            {t("toolkit.custom_section_environment")}
          </div>
          <textarea
            value={envSecretsText}
            onChange={(event) => setEnvSecretsText(event.target.value)}
            placeholder={t("toolkit.custom_env_secrets_placeholder")}
            style={{
              width: "100%",
              minHeight: 56,
              resize: "vertical",
              boxSizing: "border-box",
              border: `1px solid ${borderColor}`,
              borderRadius: 8,
              padding: "8px 10px",
              backgroundColor: "transparent",
              color: textColor,
              fontFamily,
              fontSize: 12.5,
              outline: "none",
            }}
          />
        </>
      )}

      {/* ── Footer: secret count + install ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginTop: 16,
        }}
      >
        <div
          style={{
            minHeight: 16,
            fontSize: 11,
            lineHeight: 1.4,
            color: installError ? warningColor : mutedColor,
            fontFamily,
          }}
        >
          {installError
            ? t("toolkit.store_install_error")
            : transport === "stdio" && envSetup.specs.length > 0
              ? `${envSetup.specs.length} ${t("toolkit.custom_env_secrets_count")}`
              : ""}
        </div>
        <Button
          label={
            installing
              ? t("toolkit.store_installing")
              : t("toolkit.custom_install")
          }
          disabled={!canInstall || installing}
          onClick={handleInstall}
          style={{
            fontSize: 11.5,
            fontFamily,
            fontWeight: 500,
            paddingVertical: 5,
            paddingHorizontal: 16,
            borderRadius: 999,
            color: canInstall && !installing ? accentColor : mutedColor,
            root: { background: actionBg },
            state: {
              disabled: {
                root: { opacity: 0.7, cursor: "not-allowed" },
                background: {},
              },
            },
          }}
        />
      </div>
    </div>
  );
};

export default CustomMcpPage;
