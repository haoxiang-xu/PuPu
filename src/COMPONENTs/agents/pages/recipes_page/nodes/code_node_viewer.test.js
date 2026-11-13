/* eslint-disable testing-library/no-node-access -- the puzzle body's notch and bump are read off the drawn DOM. */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import CodeNode from "./code_node";
import { managed_path, sha256_text } from "../managed_code_sources";
import { native_step_ports } from "../skeleton_node_catalog";
import { NODE_PORT_ANCHOR } from "./node_metrics";

/* #357: the Code node on the canvas is a plain header node. Its code is
 * read and written in the panel, never shown on the card. */

const TEXT = "def main(input, context):\n    rows = input[\"rows\"]\n    return {\"rows\": len(rows)}\n";
const SHA = sha256_text(TEXT);
const NODE = {
  id: "score",
  type: "code",
  config: {
    execution: { inputs: [], outputs: [] },
    code: { source: { kind: "file", path: managed_path(SHA) }, environment_profile_id: "builtin", timeout_ms: 5000, max_result_bytes: 4096, max_log_bytes: 4096, result_schema: null },
  },
};

const show = () => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <CodeNode node={NODE} isDark={false} />
  </ConfigContext.Provider>,
);
const node = () => screen.getByTestId("code-node-score");

test("the card is the shared header only: name and language, no code, no viewer, no expand button", () => {
  show();
  expect(node()).toHaveTextContent("score");
  expect(node()).toHaveTextContent("Python");
  expect(node()).not.toHaveTextContent("def main");
  expect(screen.queryByTestId("code-node-score-block")).toBeNull();
  expect(screen.queryByTestId("code-node-score-source")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

test("the in notch and out bump sit level with the anchored ports, not the node's middle", () => {
  show();
  const ports = native_step_ports("code");
  expect(ports.map((port) => port.anchor)).toEqual([NODE_PORT_ANCHOR, NODE_PORT_ANCHOR]);
  const shape = node();
  expect(shape.querySelector("[data-puzzle-body]").getAttribute("data-side-y")).toBe(`${NODE_PORT_ANCHOR}px`);
  expect(shape.querySelector("[data-tab-side=right]").style.top).toBe(`${NODE_PORT_ANCHOR}px`);
});
