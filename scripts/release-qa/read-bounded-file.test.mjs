import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readBoundedFile } from "./read-bounded-file.mjs";

const fixture = (t, content) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-bounded-read-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "sample");
  fs.writeFileSync(file, content);
  return file;
};

test("reads binary bytes losslessly and respects the size boundary", (t) => {
  const file = fixture(t, Buffer.from([0, 128, 255]));
  assert.equal(readBoundedFile(file, 3), "\x00\x80\xff");
  assert.equal(readBoundedFile(file, 2), null);
  fs.writeFileSync(file, "");
  assert.equal(readBoundedFile(file, 0), "");
});

test("pathname replacement after the check cannot change the scanned file", (t) => {
  const file = fixture(t, "original");
  const fileSystem = {
    ...fs,
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      fs.renameSync(file, `${file}.old`);
      fs.writeFileSync(file, "replacement");
      return stat;
    },
  };
  assert.equal(readBoundedFile(file, 32, fileSystem), "original");
});

test("growth after the check is capped and skipped", (t) => {
  const file = fixture(t, "x");
  let bytesRead = 0;
  const fileSystem = {
    ...fs,
    fstatSync(fd) {
      const stat = fs.fstatSync(fd);
      fs.appendFileSync(file, "x".repeat(100));
      return stat;
    },
    readSync(...args) {
      const count = fs.readSync(...args);
      bytesRead += count;
      return count;
    },
  };
  assert.equal(readBoundedFile(file, 8, fileSystem), null);
  assert.equal(bytesRead, 9);
});

test("read failure closes the descriptor", (t) => {
  const file = fixture(t, "data");
  let descriptor;
  const fileSystem = {
    ...fs,
    readSync(fd) {
      descriptor = fd;
      throw new Error("synthetic read failure");
    },
  };
  assert.throws(() => readBoundedFile(file, 8, fileSystem), /synthetic read failure/);
  assert.throws(() => fs.fstatSync(descriptor), { code: "EBADF" });
});
