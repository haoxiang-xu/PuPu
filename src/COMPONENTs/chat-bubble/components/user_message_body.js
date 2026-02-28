import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { FloatingTextField } from "../../../BUILTIN_COMPONENTs/input/textfield";

const UserMessageBody = ({
  message,
  theme,
  isDark,
  isEditing,
  userAttachments,
  editTextareaRef,
  editDraft,
  setEditDraft,
  handleEditKeyDown,
  handleCancelEdit,
  handleSubmitEdit,
  isSubmitDisabled,
  disableActionButtons,
  color,
}) => {
  if (isEditing) {
    return (
      <FloatingTextField
        textarea_ref={editTextareaRef}
        value={editDraft}
        min_rows={2}
        max_display_rows={8}
        set_value={setEditDraft}
        placeholder="Edit message..."
        on_key_down={handleEditKeyDown}
        functional_section={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              marginRight: -6,
              marginBottom: -6,
            }}
          >
            <Button
              label="Cancel"
              disabled={disableActionButtons}
              onClick={handleCancelEdit}
              style={{ color, fontSize: 12, opacity: 0.75 }}
            />
            <Button
              label="Submit"
              postfix_icon="arrow_right"
              disabled={isSubmitDisabled}
              onClick={handleSubmitEdit}
              style={{
                color,
                fontSize: 12,
                opacity: isSubmitDisabled ? 0.35 : 0.9,
              }}
            />
          </div>
        }
        style={{ width: "100%", margin: 0, borderRadius: 14 }}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: userAttachments.length > 0 ? 8 : 0,
      }}
    >
      {typeof message.content === "string" && message.content ? (
        <span>{message.content}</span>
      ) : null}
      {userAttachments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {userAttachments.map((attachment, index) => {
            const attachmentId =
              typeof attachment?.id === "string" && attachment.id
                ? attachment.id
                : `user-attachment-${index}`;
            const attachmentName =
              typeof attachment?.name === "string" && attachment.name.trim()
                ? attachment.name.trim()
                : "attachment";
            return (
              <span
                key={attachmentId}
                title={attachmentName}
                style={{
                  display: "inline-block",
                  maxWidth: 260,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: isDark
                    ? "1px solid rgba(255,255,255,0.16)"
                    : "1px solid rgba(0,0,0,0.16)",
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(0,0,0,0.04)",
                  fontSize: 11,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {attachmentName}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default UserMessageBody;
