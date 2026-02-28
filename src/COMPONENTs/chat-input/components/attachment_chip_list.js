import Button from "../../../BUILTIN_COMPONENTs/input/button";

const AttachmentChipList = ({
  attachments = [],
  color,
  isDark,
  onRemoveAttachment,
  isStreaming = false,
}) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        padding: "0 4px",
      }}
    >
      {attachments.map((attachment, index) => {
        const attId =
          typeof attachment?.id === "string" && attachment.id
            ? attachment.id
            : `attachment-${index}`;
        const attName =
          typeof attachment?.name === "string" && attachment.name.trim()
            ? attachment.name.trim()
            : "attachment";

        return (
          <div
            key={attId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              padding: "6px 8px 6px 14px",
              borderRadius: 999,
              border: isDark
                ? "1px solid rgba(255, 255, 255, 0.16)"
                : "1px solid rgba(0, 0, 0, 0.32)",
              backgroundColor: isDark ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)",
            }}
          >
            <span
              title={attName}
              style={{
                fontSize: 12,
                lineHeight: 1.4,
                color: isDark ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {attName}
            </span>
            {typeof onRemoveAttachment === "function" && (
              <Button
                prefix_icon="close"
                disabled={isStreaming}
                onClick={() => onRemoveAttachment(attId)}
                style={{
                  color,
                  fontSize: 12,
                  borderRadius: 999,
                  padding: 2,
                  iconOnlyPaddingVertical: 1,
                  iconOnlyPaddingHorizontal: 1,
                  opacity: isStreaming ? 0.35 : 0.7,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AttachmentChipList;
