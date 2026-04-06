const normalizePendingConfirmationRequests = (requests) => {
  if (!requests || typeof requests !== "object") {
    return [];
  }

  return Object.values(requests)
    .filter(
      (request) =>
        request &&
        typeof request === "object" &&
        typeof request.confirmationId === "string" &&
        request.confirmationId.trim(),
    )
    .sort((left, right) => {
      const leftTime = Number(left.requestedAt);
      const rightTime = Number(right.requestedAt);
      if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
        return leftTime - rightTime;
      }
      if (Number.isFinite(leftTime)) {
        return -1;
      }
      if (Number.isFinite(rightTime)) {
        return 1;
      }
      return 0;
    });
};

export const buildPendingConfirmationTraceFrames = (requests) =>
  normalizePendingConfirmationRequests(requests).map((request, index) => {
    const interactType =
      typeof request.interactType === "string" && request.interactType.trim()
        ? request.interactType.trim()
        : "confirmation";
    const interactConfig =
      request.interactConfig && typeof request.interactConfig === "object"
        ? request.interactConfig
        : {};
    const callId =
      typeof request.callId === "string" && request.callId.trim()
        ? request.callId.trim()
        : `pending-confirmation-${index + 1}`;
    const requestedAt = Number(request.requestedAt);

    return {
      seq: index + 1,
      ts: Number.isFinite(requestedAt) ? requestedAt : Date.now() + index,
      type: "tool_call",
      stage: "client",
      payload: {
        call_id: callId,
        confirmation_id: request.confirmationId.trim(),
        requires_confirmation: true,
        tool_name:
          typeof request.toolName === "string" && request.toolName.trim()
            ? request.toolName.trim()
            : "tool",
        ...(typeof request.toolDisplayName === "string" &&
        request.toolDisplayName.trim()
          ? { tool_display_name: request.toolDisplayName.trim() }
          : {}),
        ...(typeof request.description === "string" && request.description.trim()
          ? { description: request.description.trim() }
          : {}),
        arguments:
          request.arguments && typeof request.arguments === "object"
            ? request.arguments
            : {},
        interact_type: interactType,
        interact_config: interactConfig,
      },
    };
  });
