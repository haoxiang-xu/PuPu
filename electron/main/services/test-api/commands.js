/* Every literal run between `:params` is escaped as a whole — escaping only
   `/` left backslashes and other regex metacharacters to be reinterpreted,
   so a pattern could silently compile to a different matcher than it reads. */
const PATH_PARAM_PATTERN = /:([A-Za-z_]\w*)/g;
const escapeRegExpLiteral = (value) =>
  value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

const compilePath = (pattern) => {
  const keys = [];
  let source = "";
  let lastIndex = 0;
  PATH_PARAM_PATTERN.lastIndex = 0;
  let match;
  while ((match = PATH_PARAM_PATTERN.exec(pattern)) !== null) {
    source += escapeRegExpLiteral(pattern.slice(lastIndex, match.index));
    keys.push(match[1]);
    source += "([^/]+)";
    lastIndex = match.index + match[0].length;
  }
  source += escapeRegExpLiteral(pattern.slice(lastIndex));
  return { regex: new RegExp(`^${source}$`), keys };
};

const codeToStatus = (code) => {
  switch (code) {
    case "chat_not_found":
    case "run_not_found":
      return 404;
    case "invalid_request":
      return 400;
    case "attempt_mismatch":
    case "chat_not_active":
    case "character_update_unsupported":
    case "durable_interaction_in_progress":
    case "no_handler":
    case "run_already_active":
    case "run_not_active":
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

  const register = ({ method, path, validator, handler, afterResponse }) => {
    routes.push({
      method: method.toUpperCase(),
      ...compilePath(path),
      validator,
      handler,
      afterResponse,
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
        const result = { status: 200, body: data };
        if (typeof route.afterResponse === "function") {
          result.afterResponse = route.afterResponse;
        }
        return result;
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
