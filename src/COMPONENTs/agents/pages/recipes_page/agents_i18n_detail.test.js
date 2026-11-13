import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { node_identity } from "./detail_panel/node_identity";
import DetailPanel from "./detail_panel/detail_panel";
import { SkeletonElsewhereDiagnostics, SkeletonNodeDiagnostics } from "./detail_panel/skeleton_diagnostics_notice";

const localized = (locale, children) => <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
  <LocaleContext.Provider value={{ locale }}>{children}</LocaleContext.Provider>
</ConfigContext.Provider>;

test("node identity localizes only its owned captions and keeps authored labels, raw ids, model ids and geometry", () => {
  const t = (key) => `T:${key}`;
  const node = { id: "toolkit-{raw}", type: "toolkit_pool", toolkits: [] };
  const before = JSON.stringify(node);
  const english = node_identity(node);
  const translated = node_identity(node, t);
  expect(english).toMatchObject({ title: "Toolkit Pool", subtitle: "No toolkits" });
  expect(translated).toMatchObject({ title: "T:agents.nodes.toolkit_pool", subtitle: "T:agents.identity.no_toolkits" });
  expect(translated.icon).toBe(english.icon);
  expect(translated.gradient).toBe(english.gradient);
  const raw = "agents.nodes.agent {value} · raw";
  /* A native Agent without a label reads as its type, never as its id. */
  expect(node_identity({ id: raw, type: "agent", config: {} }, t).title).toBe("T:agents.nodes.agent");
  expect(node_identity({ id: "a", label: raw, type: "agent", config: {} }, t).title).toBe(raw);
  expect(node_identity({ id: "a", type: "agent", override: { model: raw } }, t).subtitle).toBe(raw);
  expect(node_identity({ id: "raw", type: "__proto__", config: {} }, t)).toBeNull();
  expect(JSON.stringify(node)).toBe(before);
});

test("the empty real detail panel translates without writing or inventing a selected node", () => {
  const onDocumentChange = jest.fn();
  render(localized("zh-CN", <DetailPanel document={{ nodes: [], edges: [] }} selectedNodeId={null} onDocumentChange={onDocumentChange} />));
  expect(screen.getByTestId("recipe-detail-panel-body")).toHaveTextContent("选择一个节点进行编辑。");
  expect(onDocumentChange).not.toHaveBeenCalled();
});

test("saved and stale diagnostic captions translate independently of opaque backend messages and identities", () => {
  const raw = "agents.diagnostics.saved_one {count} · RAW_BACKEND";
  const diagnostics = Object.freeze([Object.freeze({ code: "raw_code", path: ["document", "nodes", 0], message: raw })]);
  const document = { nodes: [{ id: "agents.nodes.start {id}" }], edges: [] };
  const before = JSON.stringify({ diagnostics, document });
  const tree = (locale) => localized(locale, <><SkeletonNodeDiagnostics diagnostics={diagnostics} />
    <SkeletonElsewhereDiagnostics diagnostics={diagnostics} document={document} /></>);
  const view = render(tree("en"));
  expect(screen.getByTestId("skeleton-diagnostics-notice")).toHaveTextContent("Saved, with a problem to finish");
  view.rerender(tree("zh-CN"));
  expect(screen.getByTestId("skeleton-diagnostics-notice")).toHaveTextContent("已保存，仍有一项问题需要完善");
  expect(screen.getByTestId("skeleton-diagnostic-0")).toHaveTextContent(raw);
  expect(screen.getByTestId("skeleton-elsewhere-0")).toHaveTextContent(`节点 ${document.nodes[0].id}`);
  expect(screen.getByTestId("skeleton-elsewhere-0")).toHaveTextContent(raw);
  expect(JSON.stringify({ diagnostics, document })).toBe(before);
});
