const createLogStore = ({ capacity = 2000 } = {}) => {
  const buffers = new Map();

  const getBuf = (source) => {
    let buf = buffers.get(source);
    if (!buf) {
      buf = [];
      buffers.set(source, buf);
    }
    return buf;
  };

  const push = (entry) => {
    const buf = getBuf(entry.source);
    buf.push(entry);
    if (buf.length > capacity) buf.shift();
  };

  const tail = ({ source, n = 200, since } = {}) => {
    const buf = buffers.get(source) || [];
    let out = buf;
    if (typeof since === "number") {
      out = out.filter((e) => e.ts > since);
    }
    return out.slice(-n);
  };

  const patchStream = (stream, source, level) => {
    const orig = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => {
      try {
        push({
          ts: Date.now(),
          level,
          source,
          msg: typeof chunk === "string" ? chunk : chunk.toString(),
        });
      } catch (_) {
        // best-effort: don't break stdout if push throws
      }
      return orig(chunk, ...rest);
    };
    return () => {
      stream.write = orig;
    };
  };

  return { push, tail, patchStream };
};

module.exports = { createLogStore };
