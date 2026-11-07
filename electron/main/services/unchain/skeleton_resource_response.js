const {
  createSkeletonProtocolError,
} = require("../../../shared/skeleton_resource_transport");

// The resource routes have a CLOSED refusal body. Keep HTTP status and the
// producer's path here rather than using the generic response parser.
const readSkeletonResourceResponse = async (response) => {
  const status = Number.isInteger(response.status) &&
    response.status >= 400 && response.status <= 599 ? response.status : null;
  let body;
  try {
    body = JSON.parse(await response.text());
  } catch {
    throw createSkeletonProtocolError("Invalid Skeleton resource response", status);
  }
  if (response.ok) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw createSkeletonProtocolError("Invalid Skeleton resource response");
    }
    return body;
  }
  const error = body?.error;
  if (!body || Array.isArray(body) || Object.keys(body).length !== 1 ||
      !error || typeof error !== "object" || Array.isArray(error) ||
      Object.keys(error).length !== 3 ||
      !["code", "path", "message"].every((key) =>
        Object.prototype.hasOwnProperty.call(error, key)) ||
      typeof error.code !== "string" || !/^[a-z][a-z0-9_]*$/.test(error.code) ||
      typeof error.message !== "string" || !error.message ||
      !Array.isArray(error.path) || !error.path.every((part) =>
        typeof part === "string" || (Number.isSafeInteger(part) && part >= 0)) ||
      status === null) {
    throw createSkeletonProtocolError("Invalid Skeleton resource error response", status);
  }
  throw Object.assign(new Error(error.message), {
    code: error.code, path: [...error.path], status,
  });
};

module.exports = { readSkeletonResourceResponse };
