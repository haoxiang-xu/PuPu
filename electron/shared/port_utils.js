const DEFAULT_PORT_HOST = "127.0.0.1";

const normalizePort = (candidate) => {
  const numeric = Number(candidate);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 65535) {
    return null;
  }
  return numeric;
};

const createPortFinder = (netModule) => {
  const isPortAvailable = ({ port, host = DEFAULT_PORT_HOST } = {}) =>
    new Promise((resolve) => {
      const normalizedPort = normalizePort(port);
      if (normalizedPort == null || !netModule) {
        resolve(false);
        return;
      }

      const server = netModule.createServer();
      if (typeof server.unref === "function") {
        server.unref();
      }

      server.once("error", () => {
        resolve(false);
      });

      server.once("listening", () => {
        server.close(() => resolve(true));
      });

      server.listen(normalizedPort, host);
    });

  const reserveEphemeralPort = ({ host = DEFAULT_PORT_HOST } = {}) =>
    new Promise((resolve) => {
      if (!netModule) {
        resolve(null);
        return;
      }

      const server = netModule.createServer();
      if (typeof server.unref === "function") {
        server.unref();
      }

      server.once("error", () => {
        resolve(null);
      });

      server.once("listening", () => {
        const address = server.address();
        const port =
          address && typeof address === "object" ? normalizePort(address.port) : null;
        server.close(() => resolve(port));
      });

      server.listen(0, host);
    });

  const findAvailablePort = async ({
    startPort,
    endPort = startPort,
    host = DEFAULT_PORT_HOST,
    fallbackToEphemeral = true,
  } = {}) => {
    const normalizedStart = normalizePort(startPort);
    const normalizedEnd = normalizePort(endPort);

    if (normalizedStart != null && normalizedEnd != null) {
      const lower = Math.min(normalizedStart, normalizedEnd);
      const upper = Math.max(normalizedStart, normalizedEnd);

      for (let port = lower; port <= upper; port += 1) {
        // eslint-disable-next-line no-await-in-loop
        if (await isPortAvailable({ port, host })) {
          return port;
        }
      }
    }

    if (!fallbackToEphemeral) {
      return null;
    }

    return reserveEphemeralPort({ host });
  };

  return {
    isPortAvailable,
    reserveEphemeralPort,
    findAvailablePort,
  };
};

module.exports = {
  DEFAULT_PORT_HOST,
  createPortFinder,
};
