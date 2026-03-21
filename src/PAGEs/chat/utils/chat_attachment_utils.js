export const getFileExtension = (name) => {
  if (typeof name !== "string" || !name.includes(".")) {
    return "";
  }
  const ext = name.split(".").pop();
  return typeof ext === "string" ? ext.trim().toLowerCase() : "";
};

export const guessMimeTypeFromExtension = (ext) => {
  if (ext === "pdf") {
    return "application/pdf";
  }
  if (ext === "png") {
    return "image/png";
  }
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  }
  if (ext === "gif") {
    return "image/gif";
  }
  if (ext === "webp") {
    return "image/webp";
  }
  return "";
};

export const parseDataUrl = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].trim().toLowerCase(),
    data: match[2],
  };
};

export const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () =>
      reject(new Error(`Failed to read file: ${file?.name || "unknown"}`));
    reader.readAsDataURL(file);
  });

export const createAttachmentPrompt = (attachments) => {
  const list = Array.isArray(attachments) ? attachments : [];
  const hasImage = list.some(
    (attachment) =>
      typeof attachment?.mimeType === "string" &&
      attachment.mimeType.toLowerCase().startsWith("image/"),
  );
  const hasPdf = list.some(
    (attachment) =>
      typeof attachment?.mimeType === "string" &&
      attachment.mimeType.toLowerCase() === "application/pdf",
  );

  if (hasImage && hasPdf) {
    return "Please analyze the attached image and file.";
  }
  if (hasImage) {
    return "Please analyze the attached image.";
  }
  if (hasPdf) {
    return "Please analyze the attached file.";
  }
  return "Please analyze the attached file.";
};
