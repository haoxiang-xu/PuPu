import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import {
  LogoSVGs,
  UISVGs,
} from "../../../BUILTIN_COMPONENTs/icon/icon_manifest";

export const isFileToolkitIcon = (icon) =>
  Boolean(
    icon &&
      (icon.type === "file" || icon.type == null) &&
      icon.content &&
      icon.mimeType,
  );

export const isBuiltinToolkitIcon = (icon) => icon?.type === "builtin";
export const isEmojiToolkitIcon = (icon) =>
  icon?.type === "emoji" && typeof icon?.emoji === "string" && icon.emoji.trim();

const isKnownBuiltinIcon = (name) =>
  typeof name === "string" && (name in UISVGs || name in LogoSVGs);

const getBuiltinIconName = (icon) =>
  isKnownBuiltinIcon(icon?.name) ? icon.name : "tool";

const normalizeFileIconDisplayScale = (value) => {
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale >= 1) return 1;
  return Math.max(0.5, scale);
};

export const getToolkitIconBackground = (icon, isDark) => {
  if (isBuiltinToolkitIcon(icon)) return icon.backgroundColor;
  return isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
};

export const hasTransparentToolkitIconBackground = (backgroundColor) =>
  !backgroundColor || backgroundColor === "transparent";

const ToolkitIcon = ({ icon, size = 18, fallbackColor, style }) => {
  if (isEmojiToolkitIcon(icon)) {
    return (
      <span
        aria-hidden="true"
        data-testid="toolkit-emoji-icon"
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size,
          lineHeight: 1,
          fontFamily:
            '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          ...style,
        }}
      >
        {icon.emoji.trim()}
      </span>
    );
  }

  if (isBuiltinToolkitIcon(icon)) {
    return (
      <Icon
        src={getBuiltinIconName(icon)}
        style={{ width: size, height: size, ...style }}
        color={icon?.color || fallbackColor || "#94a3b8"}
      />
    );
  }

  if (!isFileToolkitIcon(icon)) {
    return (
      <Icon
        src="tool"
        style={{ width: size, height: size, ...style }}
        color={fallbackColor || "#94a3b8"}
      />
    );
  }

  const displayScale = normalizeFileIconDisplayScale(icon.displayScale);
  const effectiveSize = Math.round(size * displayScale);
  const imageStyle =
    displayScale < 1
      ? { display: "block", borderRadius: style?.borderRadius }
      : { display: "block", ...style };
  const wrapScaledFileIcon = (image) =>
    displayScale < 1 ? (
      <span
        data-testid="toolkit-file-icon-frame"
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
      >
        {image}
      </span>
    ) : (
      image
    );

  if (icon.mimeType === "image/svg+xml") {
    const encoded = encodeURIComponent(icon.content);
    return wrapScaledFileIcon(
      <img
        src={`data:image/svg+xml;charset=utf-8,${encoded}`}
        alt=""
        width={effectiveSize}
        height={effectiveSize}
        style={imageStyle}
      />,
    );
  }

  if (icon.mimeType === "image/png" || icon.mimeType === "image/jpeg") {
    const mimeType = icon.mimeType === "image/jpeg" ? "jpeg" : "png";
    return wrapScaledFileIcon(
      <img
        src={`data:image/${mimeType};base64,${icon.content}`}
        alt=""
        width={effectiveSize}
        height={effectiveSize}
        style={imageStyle}
      />,
    );
  }

  return (
    <Icon
      src="tool"
      style={{ width: size, height: size, ...style }}
      color={fallbackColor || "#94a3b8"}
    />
  );
};

export const ToolkitIconFrame = ({
  icon,
  isDark = false,
  size = 36,
  iconSize = 18,
  transparentIconSize,
  borderRadius = 10,
  fallbackColor,
  style,
  iconStyle,
}) => {
  if (isFileToolkitIcon(icon)) {
    return (
      <ToolkitIcon
        icon={icon}
        size={size}
        fallbackColor={fallbackColor}
        style={{ borderRadius, flexShrink: 0, ...style }}
      />
    );
  }

  const backgroundColor = getToolkitIconBackground(icon, isDark);
  const effectiveIconSize =
    hasTransparentToolkitIconBackground(backgroundColor) && transparentIconSize
      ? transparentIconSize
      : iconSize;

  return (
    <div
      data-testid="toolkit-icon-frame"
      style={{
        width: size,
        height: size,
        borderRadius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        flexShrink: 0,
        ...style,
      }}
    >
      <ToolkitIcon
        icon={icon}
        size={effectiveIconSize}
        fallbackColor={fallbackColor}
        style={iconStyle}
      />
    </div>
  );
};

export default ToolkitIcon;
