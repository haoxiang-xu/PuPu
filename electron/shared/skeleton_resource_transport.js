// Electron serializes thrown Errors without custom fields. This versioned
// reply carries Skeleton refusals as data; the preload rebuilds the Error.
const SKELETON_RESOURCE_REPLY_SCHEMA = "pupu.skeleton-resource-response.v1";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value, keys) =>
  isObject(value) && Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const isCode = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9_]*$/.test(value);
const isPath = (value) =>
  Array.isArray(value) && Array.from(value).every((part) =>
    typeof part === "string" || (Number.isSafeInteger(part) && part >= 0));
const isStatus = (value) =>
  value === null || (Number.isInteger(value) && value >= 400 && value <= 599);

const createSkeletonProtocolError = (message, status = null) =>
  Object.assign(new Error(message), {
    code: "skeleton_resource_protocol_error", path: [], status,
  });

const createSkeletonResourceReply = async (operation) => {
  try {
    return { schema: SKELETON_RESOURCE_REPLY_SCHEMA, ok: true, data: await operation() };
  } catch (error) {
    return {
      schema: SKELETON_RESOURCE_REPLY_SCHEMA,
      ok: false,
      error: {
        code: isCode(error?.code) ? error.code : "skeleton_resource_failed",
        path: isPath(error?.path) ? [...error.path] : [],
        message: typeof error?.message === "string" && error.message
          ? error.message : "Skeleton resource request failed",
        status: isStatus(error?.status) ? error.status : null,
      },
    };
  }
};

const unwrapSkeletonResourceResponse = (reply) => {
  const invalid = () => {
    throw createSkeletonProtocolError("Invalid Skeleton resource IPC response");
  };
  if (!isObject(reply) || reply.schema !== SKELETON_RESOURCE_REPLY_SCHEMA) return invalid();
  if (reply.ok === true) {
    if (!exactKeys(reply, ["schema", "ok", "data"]) || !isObject(reply.data)) return invalid();
    return reply.data;
  }
  if (reply.ok !== false || !exactKeys(reply, ["schema", "ok", "error"])) return invalid();
  const error = reply.error;
  if (!exactKeys(error, ["code", "path", "message", "status"]) ||
      !isCode(error.code) || !isPath(error.path) || !isStatus(error.status) ||
      typeof error.message !== "string" || !error.message) return invalid();
  throw Object.assign(new Error(error.message), {
    code: error.code, path: [...error.path], status: error.status,
  });
};

module.exports = {
  createSkeletonResourceReply,
  unwrapSkeletonResourceResponse,
  createSkeletonProtocolError,
};
