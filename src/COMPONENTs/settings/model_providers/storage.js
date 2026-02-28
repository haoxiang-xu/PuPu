export const readModelProviders = () => {
  try {
    const root = JSON.parse(localStorage.getItem("settings") || "{}");
    return root?.model_providers || {};
  } catch {
    return {};
  }
};

export const writeModelProviders = (data) => {
  try {
    const root = JSON.parse(localStorage.getItem("settings") || "{}");
    root.model_providers = { ...(root.model_providers || {}), ...data };
    localStorage.setItem("settings", JSON.stringify(root));
  } catch {
    /* ignore write errors */
  }
};
