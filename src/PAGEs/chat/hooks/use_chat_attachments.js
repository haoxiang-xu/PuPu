import { useCallback, useRef, useState } from "react";
import {
  deleteAttachmentPayload,
  loadAttachmentPayload,
  saveAttachmentPayload,
} from "../../../SERVICEs/attachment_storage";
import {
  createAttachmentPrompt,
  getFileExtension,
  guessMimeTypeFromExtension,
  parseDataUrl,
  readFileAsDataUrl,
} from "../utils/chat_attachment_utils";

export const useChatAttachments = ({
  chatId,
  initialDraftAttachments = [],
  draftAttachments: controlledDraftAttachments,
  setDraftAttachments: controlledSetDraftAttachments,
  attachmentsEnabled,
  attachmentsDisabledReason,
  supportsImageAttachments,
  supportsPdfAttachments,
  setStreamError,
  maxAttachmentBytes,
  maxAttachmentCount,
}) => {
  const [internalDraftAttachments, setInternalDraftAttachments] = useState(
    () => initialDraftAttachments || [],
  );
  const draftAttachments =
    controlledDraftAttachments !== undefined
      ? controlledDraftAttachments
      : internalDraftAttachments;
  const setDraftAttachments =
    typeof controlledSetDraftAttachments === "function"
      ? controlledSetDraftAttachments
      : setInternalDraftAttachments;
  const attachmentFileInputRef = useRef(null);
  const attachmentPayloadByChatRef = useRef(new Map());

  const getOrCreateChatAttachmentPayloadMap = useCallback((targetChatId) => {
    if (!targetChatId) {
      return null;
    }
    const existing = attachmentPayloadByChatRef.current.get(targetChatId);
    if (existing instanceof Map) {
      return existing;
    }
    const created = new Map();
    attachmentPayloadByChatRef.current.set(targetChatId, created);
    return created;
  }, []);

  const rememberAttachmentPayloads = useCallback(
    (targetChatId, payloadEntries = []) => {
      const payloadMap = getOrCreateChatAttachmentPayloadMap(targetChatId);
      if (!payloadMap || !Array.isArray(payloadEntries)) {
        return;
      }

      payloadEntries.forEach((entry) => {
        if (!entry || typeof entry !== "object") {
          return;
        }
        const attachmentId =
          typeof entry.id === "string" && entry.id.trim()
            ? entry.id.trim()
            : "";
        if (
          !attachmentId ||
          !entry.payload ||
          typeof entry.payload !== "object"
        ) {
          return;
        }
        payloadMap.set(attachmentId, entry.payload);
      });
    },
    [getOrCreateChatAttachmentPayloadMap],
  );

  const removeAttachmentPayload = useCallback((targetChatId, attachmentId) => {
    if (!targetChatId || !attachmentId) {
      return;
    }
    const payloadMap = attachmentPayloadByChatRef.current.get(targetChatId);
    if (!(payloadMap instanceof Map)) {
      return;
    }
    payloadMap.delete(attachmentId);
  }, []);

  const resolveAttachmentPayloads = useCallback((targetChatId, attachments = []) => {
    const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
    if (normalizedAttachments.length === 0) {
      return { payloads: [], missingAttachmentNames: [] };
    }

    const payloadMap = attachmentPayloadByChatRef.current.get(targetChatId);
    const payloads = [];
    const missingAttachmentNames = [];

    normalizedAttachments.forEach((attachment, index) => {
      const attachmentId =
        typeof attachment?.id === "string" && attachment.id.trim()
          ? attachment.id.trim()
          : "";
      const attachmentName =
        typeof attachment?.name === "string" && attachment.name.trim()
          ? attachment.name.trim()
          : `attachment-${index + 1}`;
      const payload =
        attachmentId && payloadMap instanceof Map
          ? payloadMap.get(attachmentId)
          : null;

      if (payload && typeof payload === "object") {
        payloads.push(payload);
      } else {
        missingAttachmentNames.push(attachmentName);
      }
    });

    return { payloads, missingAttachmentNames };
  }, []);

  const hydrateAttachmentPayloads = useCallback(
    async (targetChatId, attachments = []) => {
      const payloadMap = getOrCreateChatAttachmentPayloadMap(targetChatId);
      if (!payloadMap) {
        return;
      }

      for (const attachment of attachments) {
        if (attachment?.id && !payloadMap.has(attachment.id)) {
          const hydratedPayload = await loadAttachmentPayload(attachment.id);
          if (hydratedPayload) {
            payloadMap.set(attachment.id, hydratedPayload);
          }
        }
      }
    },
    [getOrCreateChatAttachmentPayloadMap],
  );

  const buildHistoryForModel = useCallback((baseMessages, targetChatId) => {
    const normalizedBaseMessages = Array.isArray(baseMessages)
      ? baseMessages
      : [];
    const payloadMap = attachmentPayloadByChatRef.current.get(targetChatId);

    return normalizedBaseMessages
      .filter((message) => {
        if (!message || typeof message !== "object") {
          return false;
        }
        return ["system", "user", "assistant"].includes(message.role);
      })
      .map((message) => {
        const role = message.role;
        if (role !== "user") {
          if (typeof message.content !== "string" || !message.content.trim()) {
            return null;
          }
          return {
            role,
            content: message.content,
          };
        }

        const textContent =
          typeof message.content === "string" ? message.content.trim() : "";
        const attachmentMeta = Array.isArray(message.attachments)
          ? message.attachments
          : [];

        const contentBlocks = [];
        if (textContent) {
          contentBlocks.push({
            type: "text",
            text: textContent,
          });
        }

        attachmentMeta.forEach((attachment) => {
          const attachmentId =
            typeof attachment?.id === "string" && attachment.id.trim()
              ? attachment.id.trim()
              : "";
          if (!attachmentId || !(payloadMap instanceof Map)) {
            return;
          }
          const payload = payloadMap.get(attachmentId);
          if (payload && typeof payload === "object") {
            contentBlocks.push(payload);
          }
        });

        if (contentBlocks.length === 0) {
          if (!textContent) {
            return null;
          }
          return {
            role,
            content: textContent,
          };
        }

        if (
          contentBlocks.length === 1 &&
          contentBlocks[0]?.type === "text" &&
          typeof contentBlocks[0]?.text === "string"
        ) {
          return {
            role,
            content: contentBlocks[0].text,
          };
        }

        return {
          role,
          content: contentBlocks,
        };
      })
      .filter(Boolean);
  }, []);

  const processFiles = useCallback(
    async (rawFiles) => {
      if (!chatId || rawFiles.length === 0) {
        return;
      }

      if (!attachmentsEnabled) {
        setStreamError(
          attachmentsDisabledReason ||
            "Current model does not support image or file inputs.",
        );
        return;
      }

      const currentAttachmentCount = Array.isArray(draftAttachments)
        ? draftAttachments.length
        : 0;
      if (currentAttachmentCount >= maxAttachmentCount) {
        setStreamError(
          `You can attach up to ${maxAttachmentCount} files per message.`,
        );
        return;
      }

      const remainingSlots = maxAttachmentCount - currentAttachmentCount;
      const files = rawFiles.slice(0, remainingSlots);
      const warnings = [];
      if (rawFiles.length > remainingSlots) {
        warnings.push(
          `Only ${remainingSlots} additional attachment(s) were accepted.`,
        );
      }

      const attachmentEntries = [];
      const payloadEntries = [];

      for (const file of files) {
        const fileSize = Number(file?.size) || 0;
        const fileName =
          typeof file?.name === "string" && file.name.trim()
            ? file.name.trim()
            : "attachment";
        const ext = getFileExtension(fileName);
        const fallbackMimeType = guessMimeTypeFromExtension(ext);
        const mimeTypeRaw =
          typeof file?.type === "string" && file.type.trim()
            ? file.type.trim().toLowerCase()
            : fallbackMimeType;
        const isPdf = mimeTypeRaw === "application/pdf" || ext === "pdf";
        const isImage = mimeTypeRaw.startsWith("image/");

        if (!isPdf && !isImage) {
          warnings.push(
            `Skipped "${fileName}": only images and PDFs are supported.`,
          );
          continue;
        }

        if (fileSize <= 0 || fileSize > maxAttachmentBytes) {
          warnings.push(
            `Skipped "${fileName}": file size must be between 1 byte and ${Math.floor(maxAttachmentBytes / (1024 * 1024))}MB.`,
          );
          continue;
        }

        if (isPdf && !supportsPdfAttachments) {
          warnings.push(
            `Skipped "${fileName}": current model does not support PDF input.`,
          );
          continue;
        }

        if (isImage && !supportsImageAttachments) {
          warnings.push(
            `Skipped "${fileName}": current model does not support image input.`,
          );
          continue;
        }

        let parsedDataUrl = null;
        try {
          const dataUrl = await readFileAsDataUrl(file);
          parsedDataUrl = parseDataUrl(dataUrl);
        } catch (_error) {
          parsedDataUrl = null;
        }

        if (!parsedDataUrl || !parsedDataUrl.data) {
          warnings.push(`Skipped "${fileName}": failed to read file data.`);
          continue;
        }

        const normalizedMimeType = isPdf
          ? "application/pdf"
          : parsedDataUrl.mimeType || mimeTypeRaw || fallbackMimeType;
        if (!isPdf && !normalizedMimeType.startsWith("image/")) {
          warnings.push(`Skipped "${fileName}": invalid image format.`);
          continue;
        }

        const attachmentId = `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const attachmentMeta = {
          id: attachmentId,
          kind: "file",
          name: fileName,
          source: "local",
          mimeType: normalizedMimeType,
          ext: ext || undefined,
          size: fileSize,
          createdAt: Date.now(),
        };

        const attachmentPayload = isPdf
          ? {
              type: "pdf",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: parsedDataUrl.data,
                filename: fileName,
              },
            }
          : {
              type: "image",
              source: {
                type: "base64",
                media_type: normalizedMimeType,
                data: parsedDataUrl.data,
              },
            };

        attachmentEntries.push(attachmentMeta);
        payloadEntries.push({
          id: attachmentId,
          payload: attachmentPayload,
        });
      }

      if (attachmentEntries.length > 0) {
        rememberAttachmentPayloads(chatId, payloadEntries);
        payloadEntries.forEach(({ id, payload }, index) => {
          saveAttachmentPayload(id, payload, attachmentEntries[index]?.name).catch(
            () => {},
          );
        });
        setDraftAttachments((previous) => {
          const current = Array.isArray(previous) ? previous : [];
          return [...current, ...attachmentEntries];
        });
      }

      if (attachmentEntries.length === 0) {
        setStreamError(
          warnings[0] || "No compatible attachments were selected.",
        );
        return;
      }

      if (warnings.length > 0) {
        setStreamError(warnings[0]);
        return;
      }

      setStreamError("");
    },
    [
      attachmentsDisabledReason,
      attachmentsEnabled,
      chatId,
      draftAttachments,
      maxAttachmentBytes,
      maxAttachmentCount,
      rememberAttachmentPayloads,
      setStreamError,
      supportsImageAttachments,
      supportsPdfAttachments,
    ],
  );

  const handleAttachFile = useCallback(() => {
    if (!attachmentsEnabled) {
      setStreamError(
        attachmentsDisabledReason ||
          "Current model does not support image or file inputs.",
      );
      return;
    }

    if (attachmentFileInputRef.current) {
      attachmentFileInputRef.current.click();
    }
  }, [attachmentsDisabledReason, attachmentsEnabled, setStreamError]);

  const handleFileInputChange = useCallback(
    async (event) => {
      const rawFiles = Array.from(event?.target?.files || []);
      if (event?.target) {
        event.target.value = "";
      }
      await processFiles(rawFiles);
    },
    [processFiles],
  );

  const removeDraftAttachment = useCallback(
    (attachmentId) => {
      const normalizedAttachmentId =
        typeof attachmentId === "string" ? attachmentId.trim() : "";
      if (!normalizedAttachmentId || !chatId) {
        return;
      }

      setDraftAttachments((previous) =>
        previous.filter((attachment) => attachment?.id !== normalizedAttachmentId),
      );
      removeAttachmentPayload(chatId, normalizedAttachmentId);
      deleteAttachmentPayload(normalizedAttachmentId).catch(() => {});
    },
    [chatId, removeAttachmentPayload],
  );

  const clearAttachmentPayloads = useCallback(() => {
    attachmentPayloadByChatRef.current.clear();
  }, []);

  return {
    attachmentFileInputRef,
    draftAttachments,
    setDraftAttachments,
    createAttachmentPrompt,
    handleAttachFile,
    handleFileInputChange,
    processFiles,
    removeDraftAttachment,
    clearAttachmentPayloads,
    rememberAttachmentPayloads,
    resolveAttachmentPayloads,
    hydrateAttachmentPayloads,
    buildHistoryForModel,
    removeAttachmentPayload,
  };
};
