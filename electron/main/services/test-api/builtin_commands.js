const registerBuiltinCommands = ({ registry, bridge, logs, getMainWindow, electron }) => {
  // Chat lifecycle
  registry.register({
    method: "POST",
    path: "/v1/chats",
    handler: (ctx) => bridge.invoke("createChat", ctx.body || {}),
  });
  registry.register({
    method: "GET",
    path: "/v1/chats",
    handler: () => bridge.invoke("listChats", {}),
  });
  registry.register({
    method: "GET",
    path: "/v1/chats/:id",
    handler: (ctx) => bridge.invoke("getChat", { id: ctx.params.id }),
  });
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/activate",
    handler: (ctx) => bridge.invoke("activateChat", { id: ctx.params.id }),
  });
  registry.register({
    method: "PATCH",
    path: "/v1/chats/:id",
    handler: (ctx) =>
      bridge.invoke("renameChat", { id: ctx.params.id, ...(ctx.body || {}) }),
  });
  registry.register({
    method: "DELETE",
    path: "/v1/chats/:id",
    handler: (ctx) => bridge.invoke("deleteChat", { id: ctx.params.id }),
  });

  // Message
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/messages",
    validator: (body) =>
      body && typeof body.text === "string" ? null : "body.text required",
    handler: (ctx) =>
      bridge.invoke(
        "sendMessage",
        { id: ctx.params.id, ...(ctx.body || {}) },
        { timeout: 5 * 60 * 1000 },
      ),
  });
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/cancel",
    handler: (ctx) => bridge.invoke("cancelMessage", { id: ctx.params.id }),
  });

  // Catalog + selection
  registry.register({
    method: "GET",
    path: "/v1/catalog/models",
    handler: () => bridge.invoke("listModels", {}),
  });
  registry.register({
    method: "GET",
    path: "/v1/catalog/toolkits",
    handler: () => bridge.invoke("listToolkits", {}),
  });
  registry.register({
    method: "GET",
    path: "/v1/catalog/characters",
    handler: () => bridge.invoke("listCharacters", {}),
  });
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/model",
    validator: (body) =>
      body && typeof body.model_id === "string"
        ? null
        : "body.model_id required",
    handler: (ctx) =>
      bridge.invoke("selectModel", {
        id: ctx.params.id,
        model_id: ctx.body.model_id,
      }),
  });
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/toolkits",
    validator: (body) =>
      body && Array.isArray(body.toolkit_ids)
        ? null
        : "body.toolkit_ids array required",
    handler: (ctx) =>
      bridge.invoke("setToolkits", {
        id: ctx.params.id,
        toolkit_ids: ctx.body.toolkit_ids,
      }),
  });
  registry.register({
    method: "POST",
    path: "/v1/chats/:id/character",
    handler: (ctx) =>
      bridge.invoke("setCharacter", {
        id: ctx.params.id,
        character_id: ctx.body?.character_id ?? null,
      }),
  });

  // Debug
  registry.register({
    method: "GET",
    path: "/v1/debug/state",
    handler: (ctx) =>
      bridge.invoke("getStateSnapshot", { chat_id: ctx.query?.chat_id || null }),
  });
  registry.register({
    method: "GET",
    path: "/v1/debug/logs",
    handler: (ctx) => {
      const source = ctx.query?.source || "renderer";
      const n = ctx.query?.n ? Number(ctx.query.n) : 200;
      const since = ctx.query?.since ? Number(ctx.query.since) : undefined;
      return { entries: logs.tail({ source, n, since }) };
    },
  });

  const getWin = () => {
    const { BrowserWindow } = electron || require("electron");
    return BrowserWindow.getFocusedWindow() || (getMainWindow && getMainWindow());
  };

  registry.register({
    method: "GET",
    path: "/v1/debug/screenshot",
    handler: async (ctx) => {
      const win = getWin();
      if (!win) {
        throw Object.assign(new Error("no window"), {
          code: "no_window",
          status: 503,
        });
      }
      const img = await win.webContents.capturePage();
      const fmt = (ctx.query?.format || "png").toLowerCase();
      if (fmt === "jpeg" || fmt === "jpg") {
        const q = Number(ctx.query?.quality) || 80;
        return {
          __binary: true,
          contentType: "image/jpeg",
          buffer: img.toJPEG(q),
        };
      }
      return {
        __binary: true,
        contentType: "image/png",
        buffer: img.toPNG(),
      };
    },
  });
  registry.register({
    method: "POST",
    path: "/v1/debug/eval",
    validator: (body) =>
      body && typeof body.code === "string" && body.code.length <= 65536
        ? null
        : "body.code required (<=64KB)",
    handler: async (ctx) => {
      const win = getWin();
      if (!win) {
        throw Object.assign(new Error("no window"), {
          code: "no_window",
          status: 503,
        });
      }
      const code = ctx.body.code;
      const isAsync = ctx.body.await !== false;
      const wrapped = isAsync
        ? `(async () => { ${code} })()`
        : `(() => { return (${code}); })()`;
      try {
        const value = await win.webContents.executeJavaScript(wrapped, true);
        return { ok: true, value };
      } catch (e) {
        return { ok: false, error: { message: e.message, stack: e.stack } };
      }
    },
  });
  registry.register({
    method: "GET",
    path: "/v1/debug/dom",
    handler: async (ctx) => {
      const win = getWin();
      if (!win) {
        throw Object.assign(new Error("no window"), {
          code: "no_window",
          status: 503,
        });
      }
      const sel = ctx.query?.selector || "body";
      const code = `document.querySelector(${JSON.stringify(sel)})?.outerHTML ?? null`;
      const html = await win.webContents.executeJavaScript(
        `(() => { return (${code}); })()`,
        true,
      );
      return { html };
    },
  });
};

module.exports = { registerBuiltinCommands };
