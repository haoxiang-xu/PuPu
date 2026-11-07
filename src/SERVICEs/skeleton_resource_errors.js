import { FrontendApiError, isObject } from "./api.shared";

// contextBridge drops custom properties on Error instances too. The preload
// rejects with a plain record; construct the application's Error only here.
export const invokeSkeletonBridge = async (task) => {
  try {
    return await task();
  } catch (record) {
    const keys = ["code", "path", "message", "status"];
    if (!isObject(record) || Object.keys(record).length !== keys.length ||
        !keys.every((key) => Object.prototype.hasOwnProperty.call(record, key)) ||
        typeof record.code !== "string" || !/^[a-z][a-z0-9_]*$/.test(record.code) ||
        typeof record.message !== "string" || !record.message ||
        !Array.isArray(record.path) || !Array.from(record.path).every((part) =>
          typeof part === "string" || (Number.isSafeInteger(part) && part >= 0)) ||
        !(record.status === null || (Number.isInteger(record.status) &&
          record.status >= 400 && record.status <= 599))) {
      throw new FrontendApiError(
        "skeleton_resource_protocol_error", "Invalid Skeleton resource bridge refusal",
      );
    }
    throw Object.assign(new FrontendApiError(record.code, record.message), {
      path: [...record.path], status: record.status,
    });
  }
};
