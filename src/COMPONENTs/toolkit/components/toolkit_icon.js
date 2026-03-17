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

const isKnownBuiltinIcon = (name) =>
  typeof name === "string" && (name in UISVGs || name in LogoSVGs);

const getBuiltinIconName = (icon) =>
  isKnownBuiltinIcon(icon?.name) ? icon.name : "tool";

const ToolkitIcon = ({ icon, size = 18, fallbackColor, style }) => {
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

  if (icon.mimeType === "image/svg+xml") {
    const encoded = encodeURIComponent(icon.content);
    return (
      <img
        src={`data:image/svg+xml;charset=utf-8,${encoded}`}
        alt=""
        width={size}
        height={size}
        style={{ display: "block", ...style }}
      />
    );
  }

  if (icon.mimeType === "image/png") {
    return (
      <img
        src={`data:image/png;base64,${icon.content}`}
        alt=""
        width={size}
        height={size}
        style={{ display: "block", ...style }}
      />
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

export default ToolkitIcon;
