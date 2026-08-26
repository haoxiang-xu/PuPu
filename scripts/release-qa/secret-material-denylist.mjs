#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PRIVATE_KEY_PEM_HEADER = /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/;
const KNOWN_SENSITIVE_FILENAMES = new Set([
  "apple-api-key.p8",
  "apple-app-specific-password.txt",
  "codesign-key.pem",
  "codesign-password.txt",
  "notarization-password.txt",
  "p12-password.txt",
  "private-key.pem",
  "signing-password.txt",
]);

function relativePath(root, target) {
  return path.relative(root, target).split(path.sep).join("/");
}

function requirePathWithinRoot(root, requestedPath) {
  if (typeof requestedPath !== "string" || !requestedPath || path.isAbsolute(requestedPath)) {
    throw new Error("artifact upload path must be a non-empty relative path");
  }
  const target = path.resolve(root, requestedPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("artifact upload path must remain inside the declared upload root");
  }
  return target;
}

function privateKeyHeaderPresent(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(8192);
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return PRIVATE_KEY_PEM_HEADER.test(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    fs.closeSync(descriptor);
  }
}

function categoriesForFile(filePath) {
  const filename = path.basename(filePath);
  const normalized = filename.toLowerCase();
  const categories = [];

  if (/\.p(?:12|fx)$/i.test(filename)) categories.push("pkcs12-extension");
  if (/^AuthKey_[A-Za-z0-9_-]+\.p8$/.test(filename)) categories.push("api-private-key-filename");
  if (KNOWN_SENSITIVE_FILENAMES.has(normalized)) categories.push("known-sensitive-filename");
  if (privateKeyHeaderPresent(filePath)) categories.push("private-key-pem-header");

  return categories;
}

function collectViolations(root, target, violations, checked) {
  const metadata = fs.lstatSync(target);
  if (metadata.isSymbolicLink()) {
    violations.push({ path: relativePath(root, target), category: "symbolic-link" });
    return;
  }
  if (metadata.isDirectory()) {
    for (const child of fs.readdirSync(target).sort()) {
      collectViolations(root, path.join(target, child), violations, checked);
    }
    return;
  }
  if (!metadata.isFile()) {
    violations.push({ path: relativePath(root, target), category: "unsupported-artifact-type" });
    return;
  }

  checked.count += 1;
  for (const category of categoriesForFile(target)) {
    violations.push({ path: relativePath(root, target), category });
  }
}

export function scanArtifactUploadPaths({ root, paths, failOnViolation = false }) {
  if (typeof root !== "string" || !root) throw new Error("artifact upload root is required");
  if (!Array.isArray(paths) || paths.length === 0) throw new Error("at least one artifact upload path is required");

  const rootPath = path.resolve(root);
  if (!fs.existsSync(rootPath) || !fs.lstatSync(rootPath).isDirectory()) {
    throw new Error("artifact upload root must be an existing directory");
  }

  const violations = [];
  const checked = { count: 0 };
  for (const requestedPath of paths) {
    const target = requirePathWithinRoot(rootPath, requestedPath);
    if (!fs.existsSync(target)) {
      throw new Error(`artifact upload path does not exist: ${requestedPath}`);
    }
    collectViolations(rootPath, target, violations, checked);
  }
  violations.sort((left, right) => left.path.localeCompare(right.path) || left.category.localeCompare(right.category));

  const result = { checked_file_count: checked.count, violations };
  if (failOnViolation && violations.length > 0) {
    const summary = violations.map(({ path: violationPath, category }) => `${violationPath} [${category}]`).join(", ");
    throw new Error(`sensitive signing material is not eligible for artifact upload: ${summary}`);
  }
  return result;
}

function parseArgs(argv) {
  const paths = [];
  let root = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") root = argv[++index] || "";
    else if (arg === "--path") paths.push(argv[++index] || "");
    else throw new Error(`unsupported argument: ${arg}`);
  }
  return { root, paths };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { root, paths } = parseArgs(process.argv.slice(2));
    const result = scanArtifactUploadPaths({ root, paths, failOnViolation: true });
    console.log(`[artifact-denylist] checked ${result.checked_file_count} file(s)`);
  } catch (error) {
    console.error(`[artifact-denylist] ${error.message || String(error)}`);
    process.exit(1);
  }
}
