import { fireEvent, render, screen } from "@testing-library/react";

import { getCommand } from "../../../SERVICEs/command_registry";
import CommandExpansionBody, {
  parseComposer,
} from "./command_expansion_body";

// Chevron/glyph is decorative and pulls ConfigContext + async svg import;
// stub it so tests target chip/collapse/split/degrade/aria logic only.
jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => null,
}));

// Attribution is live-fetched from the command registry (contract §1.3). Its
// projection shape is a shared artery owned by the command-registry slice, so
// S2's render logic is tested against a controlled getCommand mock rather than
// the registry's current field set.
jest.mock("../../../SERVICEs/command_registry", () => ({
  __esModule: true,
  getCommand: jest.fn(() => null),
}));

const buildMessage = ({ template, userBody, commands, overrides }) => {
  const prefix = template || "";
  const content = [prefix, userBody].filter(Boolean).join("\n\n");
  return {
    id: "m1",
    role: "user",
    content,
    composer: {
      v: 1,
      rawText: "/plan " + (userBody || ""),
      commands: commands || [{ name: "/plan", sourceToolkitId: "superpowers" }],
      templateLength: prefix.length,
      ...(overrides || {}),
    },
  };
};

const renderBody = (message, { isDark = false, theme } = {}) => {
  const parts = parseComposer(message);
  return {
    parts,
    ...render(
      <CommandExpansionBody parts={parts} isDark={isDark} theme={theme} />,
    ),
  };
};

const FIVE_LINE_TEMPLATE = "# Plan\nline2\nline3\nline4\nZZTEMPLATEMARKER";
const ONE_LINE_TEMPLATE = "ZZSHORTMARKER";

afterEach(() => {
  getCommand.mockReset();
  getCommand.mockReturnValue(null);
});

/* ─────────────────────────── parseComposer (§4 gate) ─────────────────── */

describe("parseComposer — atomic validation + slicing", () => {
  test("valid composer → sliced parts (split correctness)", () => {
    const msg = buildMessage({
      template: FIVE_LINE_TEMPLATE,
      userBody: "help me refactor login",
    });
    const parts = parseComposer(msg);
    expect(parts).not.toBeNull();
    expect(parts.templateText).toBe(FIVE_LINE_TEMPLATE);
    // userBody has the ONE separating "\n\n" stripped.
    expect(parts.userBody).toBe("help me refactor login");
    expect(parts.templateLineCount).toBe(5);
    expect(parts.commands).toHaveLength(1);
  });

  test("templateLength === 0 → no template, full content is body", () => {
    const msg = {
      id: "m",
      role: "user",
      content: "just some text",
      composer: {
        v: 1,
        rawText: "/mark just some text",
        commands: [{ name: "/mark", sourceToolkitId: "" }],
        templateLength: 0,
      },
    };
    const parts = parseComposer(msg);
    expect(parts.templateLineCount).toBe(0);
    expect(parts.templateText).toBe("");
    expect(parts.userBody).toBe("just some text");
  });

  test.each([
    ["missing composer", (m) => delete m.composer],
    ["v !== 1", (m) => (m.composer.v = 2)],
    ["missing v", (m) => delete m.composer.v],
    ["empty rawText", (m) => (m.composer.rawText = "")],
    ["non-string rawText", (m) => (m.composer.rawText = 5)],
    ["commands not array", (m) => (m.composer.commands = {})],
    ["commands empty", (m) => (m.composer.commands = [])],
    ["command name non-string", (m) => (m.composer.commands = [{ name: 1, sourceToolkitId: "" }])],
    ["command missing sourceToolkitId", (m) => (m.composer.commands = [{ name: "/x" }])],
    ["templateLength negative", (m) => (m.composer.templateLength = -1)],
    ["templateLength non-integer", (m) => (m.composer.templateLength = 2.5)],
    ["templateLength > content.length", (m) => (m.composer.templateLength = 99999)],
  ])("degrade atomicity: %s → null (fail-open)", (_label, mutate) => {
    const msg = buildMessage({
      template: FIVE_LINE_TEMPLATE,
      userBody: "body",
    });
    mutate(msg);
    expect(parseComposer(msg)).toBeNull();
  });

  test("unknown v:1 member is ignored (forward-tolerant)", () => {
    const msg = buildMessage({ template: ONE_LINE_TEMPLATE, userBody: "b" });
    msg.composer.futureField = { anything: true };
    expect(parseComposer(msg)).not.toBeNull();
  });

  test("never throws on hostile input", () => {
    expect(() => parseComposer(null)).not.toThrow();
    expect(() => parseComposer({})).not.toThrow();
    expect(() => parseComposer({ composer: "nope" })).not.toThrow();
  });
});

/* ─────────────────────────── chip rendering ──────────────────────────── */

describe("CommandChip", () => {
  test("renders /name with live attribution tail from registry", () => {
    getCommand.mockReturnValue({
      name: "/plan",
      icon: "",
      sourceLabel: "Superpowers",
      sourceToolkitId: "superpowers",
    });
    renderBody(
      buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "help" }),
    );
    expect(screen.getByText("/plan")).toBeInTheDocument();
    // attribution tail + title/aria present
    expect(screen.getByTitle("/plan — from Superpowers")).toBeInTheDocument();
    expect(
      screen.getByLabelText("/plan command from Superpowers"),
    ).toBeInTheDocument();
  });

  test("catalog miss (plugin uninstalled) → green chip kept, tail dropped, no error", () => {
    getCommand.mockReturnValue(null); // miss
    renderBody(
      buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "help" }),
    );
    expect(screen.getByText("/plan")).toBeInTheDocument();
    // no attribution: title degrades to bare name
    expect(screen.getByTitle("/plan")).toBeInTheDocument();
    expect(screen.getByLabelText("/plan command")).toBeInTheDocument();
    expect(screen.queryByTitle(/from/)).toBeNull();
  });

  test("sourceToolkitId mismatch (command replaced by other owner) → no tail", () => {
    getCommand.mockReturnValue({
      name: "/plan",
      icon: "",
      sourceLabel: "OtherPack",
      sourceToolkitId: "other-pack",
    });
    // stored sourceToolkitId is "superpowers", registry now "other-pack"
    renderBody(
      buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "help" }),
    );
    expect(screen.getByTitle("/plan")).toBeInTheDocument();
    expect(screen.queryByText(/OtherPack/)).toBeNull();
  });

  test("multiple commands → multiple chips, single disclosure", () => {
    renderBody(
      buildMessage({
        template: FIVE_LINE_TEMPLATE,
        userBody: "help",
        commands: [
          { name: "/plan", sourceToolkitId: "superpowers" },
          { name: "/debug", sourceToolkitId: "superpowers" },
        ],
      }),
    );
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("/debug")).toBeInTheDocument();
    // single disclosure bar, plural noun + command count
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByText("Expanded templates")).toBeInTheDocument();
    expect(screen.getByText(/2 commands · 5 lines/)).toBeInTheDocument();
  });
});

/* ─────────────────────────── collapse threshold ──────────────────────── */

describe("collapse threshold", () => {
  test("templateLineCount > 3 → collapsed disclosure, panel hidden until open", () => {
    const { container } = renderBody(
      buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "body text" }),
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("Expanded template")).toBeInTheDocument();
    // collapsed panel is unmounted → template marker not in DOM (copy semantics)
    expect(container.textContent).not.toContain("ZZTEMPLATEMARKER");
    // user body always visible
    expect(screen.getByText("body text")).toBeInTheDocument();
  });

  test("templateLineCount 1..3 → always-open panel, no disclosure", () => {
    const { container } = renderBody(
      buildMessage({ template: ONE_LINE_TEMPLATE, userBody: "body text" }),
    );
    expect(screen.queryByRole("button")).toBeNull();
    // panel present, marker visible
    expect(container.textContent).toContain("ZZSHORTMARKER");
    expect(screen.getByText("body text")).toBeInTheDocument();
  });

  test("templateLength 0 → chip + body only, no panel, no disclosure", () => {
    const msg = {
      id: "m",
      role: "user",
      content: "just body",
      composer: {
        v: 1,
        rawText: "/mark just body",
        commands: [{ name: "/mark", sourceToolkitId: "" }],
        templateLength: 0,
      },
    };
    const { container } = renderBody(msg);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("/mark")).toBeInTheDocument();
    expect(screen.getByText("just body")).toBeInTheDocument();
    expect(container.querySelector("[id]")).toBeNull(); // no panel (panel has id)
  });

  test("pure command (no user body) → chip + panel, no body span", () => {
    const msg = buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "" });
    renderBody(msg);
    expect(screen.getByText("/plan")).toBeInTheDocument();
    // opening reveals template; there is no trailing body text
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("help me refactor login")).toBeNull();
  });
});

/* ─────────────────────────── disclosure a11y + toggle ────────────────── */

describe("disclosure bar accessibility + toggle", () => {
  test("has role=button, aria-expanded, aria-controls to panel id", () => {
    renderBody(
      buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "b" }),
    );
    const bar = screen.getByRole("button");
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(bar).toHaveAttribute("aria-controls");
    expect(bar).toHaveAttribute("tabindex", "0");
    expect(bar).toHaveAttribute(
      "aria-label",
      "Show command template, 5 lines",
    );
  });

  test("click toggles open → panel mounts, text switches to Hide", () => {
    const { container } = renderBody(
      buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "b" }),
    );
    const bar = screen.getByRole("button");
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hide template")).toBeInTheDocument();
    expect(container.textContent).toContain("ZZTEMPLATEMARKER");
    expect(bar).toHaveAttribute("aria-label", "Hide command template");
  });

  test("Enter key toggles open", () => {
    renderBody(buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "b" }));
    const bar = screen.getByRole("button");
    fireEvent.keyDown(bar, { key: "Enter" });
    expect(bar).toHaveAttribute("aria-expanded", "true");
  });

  test("Space key toggles open", () => {
    renderBody(buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "b" }));
    const bar = screen.getByRole("button");
    fireEvent.keyDown(bar, { key: " " });
    expect(bar).toHaveAttribute("aria-expanded", "true");
  });

  test("aria-controls id matches the mounted panel id", () => {
    renderBody(buildMessage({ template: FIVE_LINE_TEMPLATE, userBody: "b" }));
    const bar = screen.getByRole("button");
    const panelId = bar.getAttribute("aria-controls");
    fireEvent.click(bar);
    expect(document.getElementById(panelId)).not.toBeNull();
  });
});
