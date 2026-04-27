const compilePath = (pattern) => {
  const keys = [];
  const regex = new RegExp(
    "^" +
      pattern
        .replace(/\//g, "\\/")
        .replace(/:([A-Za-z_]\w*)/g, (_, k) => {
          keys.push(k);
          return "([^/]+)";
        }) +
      "$",
  );
  return { regex, keys };
};

const codeToStatus = (code) => {
  switch (code) {
    case "chat_not_found":
      return 404;
    case "no_handler":
      return 409;
    case "ipc_timeout":
      return 408;
    case "not_ready":
      return 503;
    default:
      return 500;
  }
};

const createCommandRegistry = () => {
  const routes = [];

  const register = ({ method, path, validator, handler }) => {
    routes.push({
      method: method.toUpperCase(),
      ...compilePath(path),
      validator,
      handler,
    });
  };

  const dispatch = async ({ method, path, body, query, raw }) => {
    const m = (method || "GET").toUpperCase();
    for (const route of routes) {
      if (route.method !== m) continue;
      const match = route.regex.exec(path);
      if (!match) continue;
      const params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(match[i + 1]);
      });
      if (route.validator) {
        const err = route.validator(body, params);
        if (err) {
          return {
            status: 400,
            body: { error: { code: "invalid_payload", message: err } },
          };
        }
      }
      try {
        const data = await route.handler({ params, body, query, raw });
        return { status: 200, body: data };
      } catch (e) {
        const code = e.code || "handler_error";
        const status = e.status || codeToStatus(code);
        return {
          status,
          body: { error: { code, message: e.message } },
        };
      }
    }
    return {
      status: 404,
      body: {
        error: { code: "not_found", message: `no route for ${m} ${path}` },
      },
    };
  };

  return { register, dispatch, routes };
};

module.exports = { createCommandRegistry };
