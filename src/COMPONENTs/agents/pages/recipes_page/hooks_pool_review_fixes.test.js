import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import HooksPoolSection from "./detail_panel/hooks_pool_section";
import HooksPoolNode from "./nodes/hooks_pool_node";
import { admit_version_aggregate } from "./managed_code_sources";
import { forget_workflow_versions, remember_workflow_version } from "./workflow_versions";
import { scope_duplicate_ids } from "./hooks_pool_config";
import capture from "./hooks_pool_capture.json";
import toolCapture from "./tool_call_capture.json";

/* R-HP-01…04 (independent review of f7972613). Every document is the real
   producer's (hooks_pool_capture.json); the section and node are driven
   through their real controls. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const reply = (name) => copy(capture.rows.find((item) => item.case === name).reply);
const doc = (name) => reply(`${name}_get`).resource.document;
const pool_of = (document, id = "hooks") => document.nodes.find((node) => node.id === id);
let current;
let writes;
function Host({ initial, pool = "hooks" }) {
  const [state, set] = useState(initial);
  current = state;
  return (
    <ConfigContext.Provider value={{ theme: {} }}>
      <HooksPoolSection document={state} node={pool_of(state, pool)} isDark={false} onChange={(next) => { writes.push(next); set(next); }} />
    </ConfigContext.Provider>
  );
}
/* A version from somewhere else: same content, a different list object. */
function ExternalHost({ initial }) {
  const [state, set] = useState(initial);
  current = state;
  return (
    <ConfigContext.Provider value={{ theme: {} }}>
      <button type="button" onClick={() => set(copy(state))}>replace from outside</button>
      <HooksPoolSection document={state} node={pool_of(state)} isDark={false} onChange={(next) => { writes.push(next); set(next); }} />
    </ConfigContext.Provider>
  );
}

beforeEach(() => {
  writes = [];
  forget_workflow_versions();
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue(reply("list_active"));
  api.unchain.listToolModalCatalog = jest.fn().mockResolvedValue(JSON.parse(toolCapture.catalog_v2.body_text));
  Object.keys(capture.revisions).forEach((id) => remember_workflow_version(admit_version_aggregate(reply(`${id}_version`)).version));
});

describe("R-HP-01: a stored id that is not text never breaks the drawing", () => {
  test("the node draws a pool whose same-order entries include an unreadable id, in the runtime's order otherwise", () => {
    const document = doc("complete");
    const hooks = pool_of(document).config.hooks;
    hooks[0].id = { toString: null };
    hooks[0].order = 10;
    expect(() => render(<ConfigContext.Provider value={{ theme: {} }}><HooksPoolNode node={pool_of(document)} isDark={false} /></ConfigContext.Provider>)).not.toThrow();
    expect(screen.getByTestId("hooks-pool-node-hooks")).toHaveTextContent("2 hooks");
    /* The stored value is untouched. */
    expect(pool_of(document).config.hooks[0].id).toEqual({ toString: null });
  });

  test("the section shows the stored value as stored and offers its fix", () => {
    const document = doc("complete");
    pool_of(document).config.hooks[0].id = { toString: null };
    pool_of(document).config.hooks[0].order = 10;
    render(<Host initial={document} />);
    expect(screen.getByTestId("hook-row-0")).toHaveTextContent("(no id)");
    fireEvent.click(screen.getByRole("button", { name: "Edit hook 1" }));
    expect(within(screen.getByTestId("hook-0-editor")).getByPlaceholderText('stored: {"toString":null}')).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
});

describe("R-HP-02: a new id is free across the attached Kernel's pools", () => {
  test("a sibling pool's hook-1 is not reused", () => {
    const document = doc("two_pools");
    pool_of(document, "hooks").config.hooks[0].id = "hook-1";
    pool_of(document, "more").config.hooks = [];
    render(<Host initial={document} pool="more" />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add hook" }));
    const id = pool_of(current, "more").config.hooks[0].id;
    expect(id).toBe("hook-2");
    expect([...scope_duplicate_ids(current, "more")]).toEqual([]);
  });

  test("an unattached pool only avoids its own ids; the rule is the Kernel scope, not the whole graph", () => {
    const document = doc("not_attached");
    render(<Host initial={document} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add hook" }));
    expect(pool_of(current).config.hooks.map((entry) => entry.id)).toEqual(["audit", "guard", "hook-1"]);
  });
});

describe("R-HP-03: a pool setting the runtime does not read can be removed, key by key", () => {
  test("fail_open is shown with its value and removed alone; the hooks are kept", () => {
    const document = doc("config_extra");
    render(<Host initial={document} />);
    expect(screen.getByTestId("hooks-pool-extra-fail_open")).toHaveTextContent("true");
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove pool setting fail_open" }));
    const expected = copy(document);
    delete pool_of(expected).config.fail_open;
    expect(current).toEqual(expected);
    expect(screen.queryByTestId("hooks-pool-problems")).toBeNull();
  });
});

describe("R-HP-04: rows keep their editor and held text across this editor's own removal", () => {
  const two = () => {
    const document = doc("complete");
    const pool = pool_of(document);
    pool.config.hooks = [false, pool.config.hooks[0]];
    return document;
  };

  test("removing the bad first entry keeps the second row open with its refused text", () => {
    render(<Host initial={two()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit hook 2" }));
    const box = within(screen.getByTestId("hook-1-editor")).getByDisplayValue("20");
    fireEvent.change(box, { target: { value: "1.5" } });
    expect(screen.getByTestId("hook-1-order-problem")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove stored entry 1" }));
    expect(writes).toHaveLength(1);
    const editor = screen.getByTestId("hook-0-editor");
    expect(within(editor).getByDisplayValue("1.5")).toBeInTheDocument();
    expect(screen.getByTestId("hook-0-order-problem")).toBeInTheDocument();
    expect(pool_of(current).config.hooks.map((entry) => entry.order)).toEqual([20]);
  });

  test("a version from elsewhere still clears what was held", () => {
    render(<ExternalHost initial={two()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit hook 2" }));
    fireEvent.change(within(screen.getByTestId("hook-1-editor")).getByDisplayValue("20"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "replace from outside" }));
    expect(screen.queryByDisplayValue("1.5")).toBeNull();
    expect(screen.queryByTestId("hook-1-editor")).toBeNull();
  });
});
