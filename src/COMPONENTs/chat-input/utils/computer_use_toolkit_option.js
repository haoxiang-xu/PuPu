import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/**
 * The canonical toolkit id the sidecar funnel recognizes for computer use.
 * This is a SYNTHETIC menu entry — it is NOT part of the MCP toolkit catalog,
 * so nothing in the catalog-render path produces it. When selected, this id
 * simply rides the existing chat toolkit payload; the sidecar mounts the
 * builtin computer tool only when its runtime flag is on, the model supports
 * it, and the turn is not a subagent (server is authoritative).
 */
export const COMPUTER_TOOLKIT_ID = "builtin.computer";

/** Builtin icon (cursor/pointer) used for the Computer menu entry. */
const COMPUTER_TOOLKIT_ICON = "mouse";

const ICON_BOX_SIZE = 24;
const ICON_GLYPH_SIZE = 16;

/**
 * Strip a provider prefix from a model id: "anthropic:claude-opus-4-8"
 * becomes "claude-opus-4-8". A value with no provider colon is returned
 * as-is. Custom providers ("custom.foo:model") strip to "model".
 *
 * @param {string} modelId
 * @returns {string}
 */
export const stripModelProviderPrefix = (modelId) => {
  if (typeof modelId !== "string") return "";
  const trimmed = modelId.trim();
  if (!trimmed) return "";
  const colonIndex = trimmed.indexOf(":");
  return colonIndex === -1 ? trimmed : trimmed.slice(colonIndex + 1);
};

/**
 * Whether the current chat model supports computer use, per the sidecar's
 * capability contract: the provider-stripped model id must start with one of
 * the supported prefixes. An empty / missing prefix list (older sidecar)
 * reads as "no supported models" ⇒ unsupported.
 *
 * @param {string} modelId — e.g. "anthropic:claude-opus-4-8"
 * @param {Array<string>} supportedPrefixes — bare id prefixes
 * @returns {boolean}
 */
export const isComputerModelSupported = (modelId, supportedPrefixes) => {
  if (!Array.isArray(supportedPrefixes) || supportedPrefixes.length === 0) {
    return false;
  }
  const bareId = stripModelProviderPrefix(modelId);
  if (!bareId) return false;
  return supportedPrefixes.some(
    (prefix) =>
      typeof prefix === "string" && prefix !== "" && bareId.startsWith(prefix),
  );
};

const buildComputerToolkitIcon = (isDark) => (
  <span
    aria-hidden="true"
    style={{
      width: ICON_BOX_SIZE,
      height: ICON_BOX_SIZE,
      borderRadius: 6,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark
        ? "rgba(148,163,184,0.18)"
        : "rgba(148,163,184,0.14)",
      flexShrink: 0,
    }}
  >
    <Icon
      src={COMPUTER_TOOLKIT_ICON}
      style={{ width: ICON_GLYPH_SIZE, height: ICON_GLYPH_SIZE }}
    />
  </span>
);

/**
 * Build the synthetic "Computer" Select option for the chat toolkit menu.
 * When the model is unsupported the option is disabled and its description
 * becomes the short "needs a supported model" hint.
 *
 * @param {{ t: Function, isDark: boolean, supported: boolean }} params
 * @returns {object} Select-compatible option
 */
export const buildComputerToolkitOption = ({ t, isDark, supported }) => {
  const label = t("chat.attach.computer");
  return {
    value: COMPUTER_TOOLKIT_ID,
    label,
    description: supported
      ? t("chat.attach.computer_description")
      : t("chat.attach.computer_requires_supported_model"),
    disabled: !supported,
    icon: buildComputerToolkitIcon(isDark),
    search: `${label} ${COMPUTER_TOOLKIT_ID} computer`,
  };
};

export default buildComputerToolkitOption;
