import {
  readNamespace,
  updateNamespace,
} from "../../SERVICEs/settings_repository";

const APP_NAMESPACE = "app";

export const isSetupComplete = () => {
  try {
    return !!readNamespace(APP_NAMESPACE, {})?.setup_completed;
  } catch {
    return false;
  }
};

export const markSetupComplete = () => {
  try {
    updateNamespace(APP_NAMESPACE, (current) => ({
      ...(current || {}),
      setup_completed: true,
    })).catch(() => {});
  } catch {
    /* ignore */
  }
};
