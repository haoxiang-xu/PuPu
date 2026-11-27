import { renderHook, act } from "@testing-library/react";
import useSkeletonResource from "./use_skeleton_resource";
import { SESSION_STATUS } from "./skeleton_resource_session";
import { managed_path, sha256_text } from "./managed_code_sources";
import { api } from "../../../../SERVICEs/api";
import capture from "./managed_code_capture.json";

/* The editor's session against the v2 managed-Code aggregate (#357 G1).
 * Every store answer is the real producer's (managed_code_capture.json); the
 * bridge methods are the v2 ones and nothing else is installed, so nothing
 * here can pass by falling back to the graph-only v1 calls. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const copy = (value) => JSON.parse(JSON.stringify(value));
const row = (name) => copy(capture.rows.find((item) => item.case === name));
const reply = (name) => row(name).reply;
const refusal = (name) => {
  const { code, path, message, status } = row(name).refusal;
  return Object.assign(new Error(message), { code, path, status });
};
const CHILD = ["nodes", 5, "config", "subagents", 0, "source", "document", "nodes", 1];
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

/* What the panel's text box does: the node's source becomes the generated
   path of the new text, and the text goes with the edit. */
function typed(document, address, text) {
  const next = copy(document);
  let body = next;
  for (let index = 0; index < address.length - 2; index += 7) {
    body = body.nodes[address[index + 1]].config.subagents[address[index + 4]].source.document;
  }
  const node = body.nodes[address[address.length - 1]];
  const sha = sha256_text(text);
  node.config.code = { ...node.config.code, source: { kind: "file", path: managed_path(sha) } };
  return [next, { [sha]: text }];
}
const rows_of = (call) => call.managed_sources.map((item) => JSON.stringify(item)).sort();
const rows = (...pairs) => pairs.map(([node_path, text]) => JSON.stringify({ node_path, text })).sort();

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

const opened = async (name = "nested_get") => {
  api.unchain.getManagedSkeletonResource = jest.fn().mockResolvedValue(reply(name));
  const view = renderHook(() => useSkeletonResource());
  await act(async () => {
    await view.result.current.load(reply(name).resource.id);
  });
  return view;
};

describe("open and save through v2 only", () => {
  test("opening hands over the document and its text, keyed by digest", async () => {
    const view = await opened();
    const { session } = view.result.current;
    expect(session.status).toBe(SESSION_STATUS.READY);
    expect(session.edit_token).toBe(reply("nested_get").resource.edit_token);
    expect(Object.values(session.sources).sort()).toEqual([capture.texts.child, capture.texts.shared].sort());
    expect(api.unchain.getManagedSkeletonResource).toHaveBeenCalledWith("g1-nested");
  });

  test("Save sends the complete owned set at the loaded token: the edited node, its untouched sibling and the embedded child", async () => {
    const view = await opened();
    const [document, sources] = typed(view.result.current.session.document, ["nodes", 1], "def main(input, context):\n    return {'message': 'new'}\n");
    act(() => view.result.current.edit(document, sources));
    api.unchain.saveManagedSkeletonResource = jest.fn().mockResolvedValue(reply("nested_get"));
    await act(async () => {
      await view.result.current.save();
    });
    const [sent] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
    expect(Object.keys(sent).sort()).toEqual(["document", "expected_edit_token", "managed_sources", "schema"]);
    expect(sent.schema).toBe("pupu.skeleton-edit.v2");
    expect(sent.expected_edit_token).toBe("edit-1-ef223876e8d12447cef20e90");
    expect(sent.document).toEqual(document);
    expect(rows_of(sent)).toEqual(rows(
      [["nodes", 1], "def main(input, context):\n    return {'message': 'new'}\n"],
      [["nodes", 3], capture.texts.shared],
      [CHILD, capture.texts.child],
    ));
  });

  test("a host with only the graph-only methods cannot open or save; nothing falls back", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(reply("nested_get").resource);
    api.unchain.saveSkeletonResource = jest.fn();
    const view = renderHook(() => useSkeletonResource());
    await act(async () => {
      await view.result.current.load("g1-nested");
    });
    expect(view.result.current.session.status).toBe(SESSION_STATUS.UNAVAILABLE);
    expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
  });

  test("a reply that is not a whole aggregate fails the open; nothing is shown as if it were the resource", async () => {
    const broken = reply("nested_get");
    broken.contents[0].text += "tampered";
    api.unchain.getManagedSkeletonResource = jest.fn().mockResolvedValue(broken);
    const view = renderHook(() => useSkeletonResource());
    await act(async () => {
      await view.result.current.load("g1-nested");
    });
    expect(view.result.current.session.status).toBe(SESSION_STATUS.LOAD_FAILED);
    expect(view.result.current.session.error.code).toBe("managed_source_protocol_error");
    expect(view.result.current.session.document).toBeNull();
  });

  test("text that is not on hand stops the Save before anything is sent", async () => {
    const view = await opened();
    const [document] = typed(view.result.current.session.document, ["nodes", 1], "never registered");
    act(() => view.result.current.edit(document));
    api.unchain.saveManagedSkeletonResource = jest.fn();
    await act(async () => {
      await view.result.current.save();
    });
    expect(api.unchain.saveManagedSkeletonResource).not.toHaveBeenCalled();
    expect(view.result.current.session.error.code).toBe("managed_source_missing");
    expect(view.result.current.session.dirty).toBe(true);
  });

  test("the store's refusal keeps its code and path; the draft stays unsaved", async () => {
    const view = await opened("root_get");
    const [document, sources] = typed(view.result.current.session.document, ["nodes", 1], "x");
    act(() => view.result.current.edit(document, sources));
    api.unchain.saveManagedSkeletonResource = jest.fn().mockRejectedValue(refusal("root_unbound"));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.session.error).toEqual({
      code: "managed_source_required",
      path: ["document", "nodes", 1, "config", "code", "source"],
      message: row("root_unbound").refusal.message,
    });
    expect(view.result.current.session.dirty).toBe(true);
  });

  test("preflight asks v2 and reads the inner verdict", async () => {
    const view = await opened("root_get");
    api.unchain.preflightManagedSkeletonResource = jest.fn().mockResolvedValue({
      schema: "pupu.skeleton-preflight.v2",
      preflight: { ok: true, id: "g1-root", edit_token: "edit-1-445cb3d55fd3de7ba89a707a", definition_digest: "d".repeat(64) },
    });
    await act(async () => {
      await view.result.current.preflight();
    });
    expect(api.unchain.preflightManagedSkeletonResource).toHaveBeenCalledWith("g1-root");
    expect(view.result.current.session.preflight).toEqual({ ok: true, definition_digest: "d".repeat(64) });
  });
});

describe("unsaved text survives what happens around it", () => {
  test("typing while a Save is in flight: the echo does not replace the newer text, and the next Save sends it", async () => {
    const view = await opened("root_get");
    const [first, first_text] = typed(view.result.current.session.document, ["nodes", 1], "first\n");
    act(() => view.result.current.edit(first, first_text));
    const landing = deferred();
    api.unchain.saveManagedSkeletonResource = jest.fn().mockReturnValue(landing.promise);
    let pending;
    act(() => {
      pending = view.result.current.save();
    });
    const [second, second_text] = typed(first, ["nodes", 1], "first\nsecond\n");
    act(() => view.result.current.edit(second, second_text));
    const stored = reply("root_get");
    stored.resource.edit_token = "edit-2-stored";
    await act(async () => {
      landing.resolve(stored);
      await pending;
    });
    const { session } = view.result.current;
    expect(session.document).toEqual(second);
    expect(session.dirty).toBe(true);
    expect(session.edit_token).toBe("edit-2-stored");
    api.unchain.saveManagedSkeletonResource = jest.fn().mockResolvedValue(stored);
    await act(async () => {
      await view.result.current.save();
    });
    const [sent] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
    expect(sent.expected_edit_token).toBe("edit-2-stored");
    expect(sent.managed_sources).toEqual([{ node_path: ["nodes", 1], text: "first\nsecond\n" }]);
  });

  test("undo brings back the earlier text, and Save sends the earlier text", async () => {
    const view = await opened("root_get");
    const [edited, text] = typed(view.result.current.session.document, ["nodes", 1], "changed");
    act(() => view.result.current.edit(edited, text));
    act(() => view.result.current.undo());
    api.unchain.saveManagedSkeletonResource = jest.fn().mockResolvedValue(reply("root_get"));
    await act(async () => {
      await view.result.current.save();
    });
    expect(api.unchain.saveManagedSkeletonResource.mock.calls[0][0].managed_sources).toEqual([{ node_path: ["nodes", 1], text: capture.texts.root }]);
  });

  test("a long session of typing keeps only text a reachable document names", async () => {
    const view = await opened("root_get");
    for (let index = 0; index < 80; index += 1) {
      const [next, text] = typed(view.result.current.session.document, ["nodes", 1], `v${index}`);
      act(() => view.result.current.edit(next, text));
      /* A new gesture: the edit coalescing is per microtask. */
      await Promise.resolve();
    }
    expect(Object.keys(view.result.current.session.sources).length).toBeLessThanOrEqual(51);
    expect(Object.values(view.result.current.session.sources)).toContain("v79");
  });
});

describe("answers that outlived what they were asked about", () => {
  test("a late read of the resource that was left cannot bring its text into the one now open", async () => {
    const late = deferred();
    api.unchain.getManagedSkeletonResource = jest.fn()
      .mockImplementationOnce(() => late.promise)
      .mockResolvedValue(reply("ref_get"));
    const view = renderHook(() => useSkeletonResource());
    let first;
    act(() => {
      first = view.result.current.load("g1-nested");
    });
    await act(async () => {
      await view.result.current.load("g1-ref");
    });
    await act(async () => {
      late.resolve(reply("nested_get"));
      await first;
    });
    const { session } = view.result.current;
    expect(session.resource_id).toBe("g1-ref");
    expect(Object.values(session.sources)).toEqual([capture.texts.ref]);
  });

  test("reopening the same Agent is a new sitting: an old save's echo cannot land in it", async () => {
    const view = await opened("root_get");
    const [document, sources] = typed(view.result.current.session.document, ["nodes", 1], "old sitting");
    act(() => view.result.current.edit(document, sources));
    const landing = deferred();
    api.unchain.saveManagedSkeletonResource = jest.fn().mockReturnValue(landing.promise);
    let pending;
    act(() => {
      pending = view.result.current.save();
    });
    await act(async () => {
      await view.result.current.load("g1-root");
    });
    const echo = reply("root_get");
    echo.resource.edit_token = "edit-2-old-sitting";
    echo.resource.document.nodes[1].config.code.source.path = managed_path(sha256_text("old sitting"));
    echo.sources_manifest.entries[0].sha256 = sha256_text("old sitting");
    echo.contents = [{ sha256: sha256_text("old sitting"), text: "old sitting" }];
    await act(async () => {
      landing.resolve(echo);
      await pending;
    });
    const { session } = view.result.current;
    expect(session.edit_token).toBe("edit-1-445cb3d55fd3de7ba89a707a");
    expect(session.dirty).toBe(false);
    expect(Object.values(session.sources)).toEqual([capture.texts.root]);
  });
});

describe("a conflict keeps the author's text until they choose", () => {
  const conflicted = async () => {
    const view = await opened();
    const [document, sources] = typed(view.result.current.session.document, CHILD, "mine\n");
    act(() => view.result.current.edit(document, sources));
    api.unchain.saveManagedSkeletonResource = jest.fn().mockRejectedValue(refusal("root_stale_token"));
    await act(async () => {
      await view.result.current.save();
    });
    expect(view.result.current.session.conflict).not.toBeNull();
    api.unchain.getManagedSkeletonResource = jest.fn().mockResolvedValue(reply("nested_get_after"));
    return { view, document };
  };

  test("keeping mine re-bases my document AND my text onto their token; Save sends mine at the positions in my document", async () => {
    const { view, document } = await conflicted();
    await act(async () => {
      await view.result.current.keepMine();
    });
    expect(view.result.current.session.document).toEqual(document);
    api.unchain.saveManagedSkeletonResource = jest.fn().mockResolvedValue(reply("nested_get"));
    await act(async () => {
      await view.result.current.save();
    });
    const [sent] = api.unchain.saveManagedSkeletonResource.mock.calls[0];
    expect(sent.expected_edit_token).toBe(reply("nested_get_after").resource.edit_token);
    expect(rows_of(sent)).toEqual(rows(
      [["nodes", 1], capture.texts.shared],
      [["nodes", 3], capture.texts.shared],
      [CHILD, "mine\n"],
    ));
  });

  test("taking theirs takes their document with their text, and nothing of mine is left to send", async () => {
    const { view } = await conflicted();
    await act(async () => {
      await view.result.current.takeTheirs();
    });
    const { session } = view.result.current;
    expect(session.document).toEqual(reply("nested_get_after").resource.document);
    expect(Object.values(session.sources)).not.toContain("mine\n");
    expect(Object.values(session.sources).sort()).toEqual([capture.texts.child + "# more\n", capture.texts.shared].sort());
  });
});
