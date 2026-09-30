import fs from "node:fs";

// Inspect and read the same open file, even if its pathname is replaced.
// Bound the read as well as the initial size check: an open file may grow.
export const readBoundedFile = (file, limit, fileSystem = fs) => {
  const fd = fileSystem.openSync(file, "r");
  try {
    const stat = fileSystem.fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) return null;
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fileSystem.readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    return length > limit ? null : buffer.subarray(0, length).toString("latin1");
  } finally {
    fileSystem.closeSync(fd);
  }
};
