import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const ToolkitIcon = ({ icon, size = 18, fallbackColor, style }) => {
  if (!icon || !icon.content || !icon.mimeType) {
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
