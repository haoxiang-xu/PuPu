import { useCallback, useState } from "react";

/**
 * Handles file drag-and-drop overlay state for chat input.
 *
 * @param {object} params
 * @param {(files: File[]) => void | null} params.on_drop_files
 */
export const useFileDropOverlay = ({ on_drop_files }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e) => {
      if (!on_drop_files) return;
      const hasFiles = Array.from(e.dataTransfer?.types || []).includes("Files");
      if (!hasFiles) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    },
    [on_drop_files],
  );

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (!on_drop_files) return;
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        on_drop_files(files);
      }
    },
    [on_drop_files],
  );

  return {
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};

export default useFileDropOverlay;
