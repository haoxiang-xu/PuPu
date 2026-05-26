import React from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import {
  LogoSVGs,
  UISVGs,
} from "../../../BUILTIN_COMPONENTs/icon/icon_manifest";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isKnownBuiltinIcon = (name) =>
  typeof name === "string" && (name in UISVGs || name in LogoSVGs);

const builtinIconName = (icon) =>
  isKnownBuiltinIcon(icon?.name) ? icon.name : "information";

const fileIconSrc = (icon) => {
  if (!isObject(icon) || icon.type !== "file" || !icon.content || !icon.mimeType) {
    return "";
  }
  if (icon.mimeType === "image/svg+xml") {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.content)}`;
  }
  if (icon.mimeType === "image/png") {
    return `data:image/png;base64,${icon.content}`;
  }
  return "";
};

const ArtifactKindIcon = ({ icon, color, size = 22, style }) => {
  const imageSrc = fileIconSrc(icon);
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        width={size}
        height={size}
        draggable={false}
        style={{ display: "block", opacity: 0.75, flexShrink: 0, ...style }}
      />
    );
  }

  const iconColor = isObject(icon) && icon.color ? icon.color : color;
  return (
    <Icon
      src={builtinIconName(icon)}
      color={iconColor}
      style={{
        width: size,
        height: size,
        opacity: 0.75,
        flexShrink: 0,
        ...style,
      }}
    />
  );
};

export default ArtifactKindIcon;
