import { useEffect, useRef, useState } from "react";

export const useEditableMessage = ({
  message,
  can_edit_message,
  disable_action_buttons,
  on_edit_message,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(
    typeof message?.content === "string" ? message.content : "",
  );
  const editTextareaRef = useRef(null);

  const isSubmitDisabled = disable_action_buttons || editDraft.trim().length === 0;

  useEffect(() => {
    if (!isEditing) {
      setEditDraft(typeof message?.content === "string" ? message.content : "");
    }
  }, [isEditing, message?.content, message?.id]);

  useEffect(() => {
    if (!isEditing || !editTextareaRef.current) {
      return;
    }

    editTextareaRef.current.focus();
    const cursorPosition = editTextareaRef.current.value?.length || 0;
    editTextareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
  }, [isEditing]);

  const handleStartEdit = () => {
    if (!can_edit_message || disable_action_buttons) {
      return;
    }

    setEditDraft(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditDraft(typeof message?.content === "string" ? message.content : "");
    setIsEditing(false);
  };

  const handleSubmitEdit = () => {
    const nextContent = typeof editDraft === "string" ? editDraft.trim() : "";
    if (!can_edit_message || disable_action_buttons || !nextContent) {
      return;
    }

    on_edit_message(message, nextContent);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.nativeEvent?.isComposing || e.isComposing) return;
      e.preventDefault();
      handleSubmitEdit();
    }
  };

  return {
    isEditing,
    editDraft,
    setEditDraft,
    editTextareaRef,
    isSubmitDisabled,
    handleStartEdit,
    handleCancelEdit,
    handleSubmitEdit,
    handleEditKeyDown,
  };
};

export default useEditableMessage;
