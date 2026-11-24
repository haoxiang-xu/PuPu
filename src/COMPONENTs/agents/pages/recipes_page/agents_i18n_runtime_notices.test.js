import React from "react";
import { node_label_capability } from "./node_label_capability";

test("local Rename capability refusal translates without changing the capability verdict", () => {
  const response = { hostile: "agents.rename.raw {id}" }; const before = JSON.stringify(response);
  const original = node_label_capability(response); const translated = node_label_capability(response, (key) => `T:${key}`);
  expect(translated.allowed).toBe(original.allowed); expect(translated.reason).toMatch(/^T:agents\./);
  expect(JSON.stringify(response)).toBe(before);
});
