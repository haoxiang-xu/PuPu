import { add_node, connect_nodes, new_agent_document } from "./skeleton_graph_edits";
import capture from "./skeleton_toolkit_capture.json";

test.each(capture.shapes)("new Toolkit Pool agrees with real store shape $case", (row) => {
  const graph = new_agent_document({ id: row.document.id, name: row.document.name }).document;
  const added = add_node(graph, { type: "toolkit_pool", id: "tools" });
  expect(added.ok).toBe(true);
  const edge = row.document.edges.find((e) => e.kind === "attach");
  const joined = edge ? connect_nodes(added.document, edge) : added;
  expect(joined.ok).toBe(true);
  expect(row.configured_execution_structure_admitted).toBe(Boolean(edge));
  expect(joined.document).toStrictEqual(row.document);
  expect(row.saved && row.roundtrip_equal).toBe(true);
});
