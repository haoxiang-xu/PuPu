import {
  PROTOCOL_ERROR,
  admit_resource_aggregate,
  code_node_at,
  managed_path,
  managed_rows,
  managed_sha,
  merged_sources,
  owned_code_nodes,
  referenced_shas,
  save_edit,
  sha256_text,
  text_problem,
  utf8_bytes,
} from "./managed_code_sources";
import capture from "./managed_code_capture.json";

/* Every reply below is the real producer's (managed_code_capture.json:
   save_managed_draft / get_managed_resource on the fixed wheel). */
const row = (name) => {
  const found = capture.rows.find((item) => item.case === name);
  if (!found) throw new Error(`no captured row ${name}`);
  return JSON.parse(JSON.stringify(found));
};
const replies = capture.rows.filter((item) => item.reply);
const sorted_rows = (rows) => [...rows].map((item) => JSON.stringify(item)).sort();

describe("the digest is the host's", () => {
  test("every captured body hashes to the digest the store gave it, with and without the platform encoder", () => {
    const bodies = replies.flatMap((item) => item.reply.contents);
    expect(bodies.length).toBeGreaterThan(5);
    bodies.forEach(({ sha256, text }) => expect(sha256_text(text)).toBe(sha256));
    const platform = global.TextEncoder;
    try {
      delete global.TextEncoder;
      bodies.forEach(({ sha256, text }) => expect(sha256_text(text)).toBe(sha256));
    } finally {
      global.TextEncoder = platform;
    }
  });

  test("known vectors, block boundaries and astral characters", () => {
    expect(sha256_text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256_text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256_text("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(Array.from(utf8_bytes("é😀"))).toEqual([0xc3, 0xa9, 0xf0, 0x9f, 0x98, 0x80]);
  });

  test("a lone surrogate has no UTF-8 and therefore no digest — the store refuses it too", () => {
    expect(utf8_bytes("x\ud800")).toBeNull();
    expect(sha256_text("\udc00")).toBeNull();
    expect(text_problem("x\ud800").code).toBe("invalid_value");
    expect(row("root_lone_surrogate").refusal).toMatchObject({ code: "invalid_value", path: ["managed_sources", 0, "text"] });
  });

  test("the four MiB limit is the store's", () => {
    expect(text_problem("a".repeat(4 * 1024 * 1024))).toBeNull();
    expect(text_problem("a".repeat(4 * 1024 * 1024 + 1)).code).toBe("limit_bytes");
  });
});

describe("every real reply is admitted, exactly", () => {
  test.each(replies.map((item) => [item.case]))("%s", (name) => {
    const { reply } = row(name);
    const admitted = admit_resource_aggregate(reply);
    expect(admitted.ok).toBe(true);
    expect(admitted.resource).toBe(reply.resource);
    expect(Object.getPrototypeOf(admitted.sources)).toBeNull();
    expect(Object.keys(admitted.sources).sort()).toEqual(reply.contents.map((body) => body.sha256));
    reply.contents.forEach((body) => expect(admitted.sources[body.sha256]).toBe(body.text));
  });

  test("the text comes back byte for byte: no trimming, no line-ending or Unicode rewrite", () => {
    const at = (name, index = 0) => {
      const { reply } = row(name);
      const sha = reply.sources_manifest.entries[index].sha256;
      return admit_resource_aggregate(reply).sources[sha];
    };
    expect(at("root_get")).toBe(capture.texts.root);
    expect(at("crlf_get")).toBe(capture.texts.crlf);
    expect(at("crlf_get")).toContain("\r\n");
    expect(at("nested_get", 2)).toBe(capture.texts.child);
    const empty = row("empty_create").reply;
    expect(admit_resource_aggregate(empty).sources[empty.sources_manifest.entries[0].sha256]).toBe("");
  });

  test("the node's source is the generated path of its digest", () => {
    const { reply } = row("nested_get");
    reply.sources_manifest.entries.forEach(({ node_path, sha256 }) => {
      expect(code_node_at(reply.resource.document, node_path).config.code.source).toEqual({ kind: "file", path: managed_path(sha256) });
    });
  });
});

describe("a reply that does not describe its own document is refused, never trimmed", () => {
  const base = () => row("nested_get").reply;
  const cases = [
    ["an extra top-level key", (r) => { r.extra = 1; }],
    ["a missing aggregate digest", (r) => { delete r.content_digest; }],
    ["another schema", (r) => { r.schema = "pupu.skeleton-resource.v1"; }],
    ["a v1 resource in place of the aggregate", (r) => r.resource],
    ["no document", (r) => { delete r.resource.document; }],
    ["a document of another resource", (r) => { r.resource.document.id = "someone-else"; }],
    ["no edit token", (r) => { r.resource.edit_token = ""; }],
    ["a manifest of another schema", (r) => { r.sources_manifest.schema = "x"; }],
    ["a binding with an extra key", (r) => { r.sources_manifest.entries[0].extra = 1; }],
    ["a binding whose digest is not its node's", (r) => { r.sources_manifest.entries[0].sha256 = r.sources_manifest.entries[2].sha256; }],
    ["a binding at a string index", (r) => { r.sources_manifest.entries[0].node_path = ["nodes", "1"]; }],
    ["a binding at a boolean index", (r) => { r.sources_manifest.entries[0].node_path = ["nodes", true]; }],
    ["a binding into a referenced Agent", (r) => {
      r.sources_manifest.entries[2].node_path = ["nodes", 5, "config", "subagents", 1, "source", "document", "nodes", 1];
    }],
    ["a binding on a node that is not Code", (r) => { r.sources_manifest.entries[0].node_path = ["nodes", 0]; }],
    ["the same node bound twice", (r) => { r.sources_manifest.entries[1] = { ...r.sources_manifest.entries[0] }; }],
    ["bindings out of canonical order", (r) => { r.sources_manifest.entries.reverse(); }],
    ["a body whose bytes are not its digest", (r) => { r.contents[0].text += " "; }],
    ["bodies out of order", (r) => { r.contents.reverse(); }],
    ["a bound body missing", (r) => { r.contents.pop(); }],
    ["a body nobody binds", (r) => { r.contents.push({ sha256: "f".repeat(64), text: "x" }); r.contents.sort((a, b) => (a.sha256 < b.sha256 ? -1 : 1)); }],
    ["a body with an extra key", (r) => { r.contents[0].note = "x"; }],
    ["a Code node naming host-kept text the manifest does not bind", (r) => {
      const dropped = r.sources_manifest.entries.pop();
      r.contents = r.contents.filter((body) => body.sha256 !== dropped.sha256);
    }],
    ["a Code node naming a malformed host-kept path", (r) => {
      r.resource.document.nodes[5].config.subagents[0].source.document.nodes[0] = { id: "odd", type: "code", config: { code: { source: { kind: "file", path: "__pupu_code__/sha256/zz.py" } } } };
    }],
  ];
  test.each(cases)("%s", (_name, mutate) => {
    const reply = base();
    const changed = mutate(reply) || reply;
    const admitted = admit_resource_aggregate(changed);
    expect(admitted).toEqual({ ok: false, error: { code: PROTOCOL_ERROR, path: [], message: expect.any(String) } });
  });
});

describe("the save carries the complete owned set at the positions it is sent with", () => {
  const successes = capture.rows.filter((item) => item.reply && item.edit);
  test.each(successes.map((item) => [item.case]))("%s: the rows rebuilt from the stored document are the rows that stored it", (name) => {
    const { edit, reply } = row(name);
    const admitted = admit_resource_aggregate(reply);
    const rebuilt = managed_rows(admitted.resource.document, admitted.sources);
    expect(rebuilt.ok).toBe(true);
    expect(sorted_rows(rebuilt.rows)).toEqual(sorted_rows(edit.managed_sources));
  });

  test("moving nodes moves their rows: the reordered document binds where the nodes now are", () => {
    const before = admit_resource_aggregate(row("nested_get").reply);
    const document = JSON.parse(JSON.stringify(before.resource.document));
    [document.nodes[1], document.nodes[3]] = [document.nodes[3], document.nodes[1]];
    const rows = managed_rows(document, before.sources).rows;
    expect(sorted_rows(rows)).toEqual(sorted_rows(row("nested_reordered").edit.managed_sources));
  });

  test("deleting a node drops its row and shifts the rest; nothing of a sibling is lost", () => {
    const before = admit_resource_aggregate(row("nested_reordered").reply);
    const document = JSON.parse(JSON.stringify(before.resource.document));
    document.nodes.splice(1, 1);
    expect(sorted_rows(managed_rows(document, before.sources).rows)).toEqual(sorted_rows(row("nested_node_deleted").edit.managed_sources));
  });

  test("a referenced Agent is never walked, whatever its entry carries", () => {
    const { reply } = row("nested_get");
    const admitted = admit_resource_aggregate(reply);
    const document = JSON.parse(JSON.stringify(admitted.resource.document));
    document.nodes[5].config.subagents[1].source.document = { nodes: [{ id: "x", type: "code", config: { code: { source: { kind: "file", path: managed_path("a".repeat(64)) } } } }] };
    expect(owned_code_nodes(document).map((item) => item.node_path)).toEqual(reply.sources_manifest.entries.map((item) => item.node_path));
    expect(managed_rows(document, admitted.sources).ok).toBe(true);
  });

  test("a node naming text that is not on hand is refused, never sent empty", () => {
    const admitted = admit_resource_aggregate(row("nested_get").reply);
    const child_sha = row("nested_get").reply.sources_manifest.entries[2].sha256;
    const without = merged_sources(admitted.sources, null, new Set(Object.keys(admitted.sources).filter((sha) => sha !== child_sha)));
    expect(managed_rows(admitted.resource.document, without)).toEqual({
      ok: false,
      error: {
        code: "managed_source_missing",
        path: ["document", "nodes", 5, "config", "subagents", 0, "source", "document", "nodes", 1, "config", "code", "source"],
        message: expect.any(String),
      },
    });
    expect(save_edit(admitted.resource.document, "t", without).ok).toBe(false);
  });

  test("a workspace file is not host-kept text and is not bound", () => {
    const { reply, edit } = row("nested_switch_to_file");
    const admitted = admit_resource_aggregate(reply);
    expect(managed_rows(admitted.resource.document, admitted.sources).rows).toEqual(edit.managed_sources);
    expect(managed_sha({ kind: "file", path: "tools/score.py" })).toBeNull();
    expect(managed_sha({ kind: "file", path: managed_path("a".repeat(64)), extra: 1 })).toBeNull();
  });

  test("the edit is exactly the v2 shape, null token on create", () => {
    const admitted = admit_resource_aggregate(row("root_get").reply);
    const built = save_edit(admitted.resource.document, null, admitted.sources);
    expect(Object.keys(built.edit).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
    expect(built.edit).toEqual({ ...row("root_create").edit, document: admitted.resource.document });
    expect(save_edit(admitted.resource.document, "edit-1-x", admitted.sources).edit.expected_edit_token).toBe("edit-1-x");
  });
});

describe("the text table keeps only what can still be reached", () => {
  test("a digest no document names is let go", () => {
    const admitted = admit_resource_aggregate(row("nested_get").reply);
    const reachable = referenced_shas([admitted.resource.document]);
    expect([...reachable].sort()).toEqual(Object.keys(admitted.sources).sort());
    const kept = merged_sources(admitted.sources, { ["b".repeat(64)]: "typed and replaced" }, reachable);
    expect(Object.keys(kept).sort()).toEqual([...reachable].sort());
  });

  test("keys are data: an inherited name never answers", () => {
    const table = merged_sources({ constructor: "x", ["c".repeat(64)]: "kept" });
    expect(Object.keys(table)).toEqual(["c".repeat(64)]);
    expect(table.constructor).toBeUndefined();
  });
});
