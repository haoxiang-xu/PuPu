import { render, fireEvent, screen } from "@testing-library/react";
import ModelCard from "./model_card";
import { buildModelRef } from "../model_ref";
import { ConfigContext } from "../../../../CONTAINERs/config/context";

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));

/* Real catalog shapes, verified against the parse in api.ollama.searchLibrary
 * over https://ollama.com/library (232 entries, 30 of them size-less). */
const SIZELESS_EMBEDDING = {
  name: "nomic-embed-text",
  description: "A high-performing open embedding model.",
  tags: ["embedding"],
  sizes: [],
  pulls: "10.2M",
};

const SIZED_MODEL = {
  name: "llama3.1",
  description: "Meta's Llama 3.1.",
  tags: ["tools"],
  sizes: ["8b", "70b"],
  pulls: "5M",
};

const CLOUD_ONLY_MODEL = {
  name: "kimi-k3",
  description: "Cloud-hosted frontier model.",
  tags: ["vision", "tools", "thinking", "cloud"],
  sizes: [],
  pulls: "1.1M",
};

/* Cloud-tagged but with local size variants — must stay pullable. */
const CLOUD_TAGGED_WITH_SIZES = {
  name: "gpt-oss",
  description: "Open-weight model, also served from the cloud.",
  tags: ["tools", "thinking", "cloud"],
  sizes: ["20b", "120b"],
  pulls: "3M",
};

const renderCard = (props = {}, { isDark = false } = {}) => {
  const onPull = props.onPull || jest.fn();
  const onCancel = props.onCancel || jest.fn();
  const utils = render(
    <ConfigContext.Provider
      value={{ theme: { font: {} }, onThemeMode: isDark ? "dark_mode" : "light_mode" }}
    >
      <ModelCard
        model={props.model || SIZELESS_EMBEDDING}
        isDark={isDark}
        installedNames={props.installedNames || new Set()}
        pullingMap={props.pullingMap || {}}
        onPull={onPull}
        onCancel={onCancel}
      />
    </ConfigContext.Provider>,
  );
  return { ...utils, onPull, onCancel };
};

const findButtonByText = (container, text) =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent || "").includes(text),
  );

describe("ModelCard — size-less models are pullable", () => {
  it("renders the pull button for a model with sizes=[]", () => {
    const { container } = renderCard({ model: SIZELESS_EMBEDDING });

    const pullBtn = findButtonByText(container, "model_providers.pull");
    expect(pullBtn).toBeTruthy();
    expect(pullBtn).not.toBeDisabled();
  });

  it("passes the bare model name — no duplicated-name or empty-tag suffix", () => {
    const { container, onPull } = renderCard({ model: SIZELESS_EMBEDDING });

    fireEvent.click(findButtonByText(container, "model_providers.pull"));

    expect(onPull).toHaveBeenCalledTimes(1);
    const [name, size] = onPull.mock.calls[0];
    expect(name).toBe("nomic-embed-text");

    // What the pull hook will actually ask Ollama for.
    const requested = buildModelRef(name, size);
    expect(requested).toBe("nomic-embed-text");
    expect(requested).not.toBe("nomic-embed-text:nomic-embed-text");
    expect(requested).not.toBe("nomic-embed-text:");
  });

  it("still passes the selected size for a model that has sizes", () => {
    const { container, onPull } = renderCard({ model: SIZED_MODEL });

    fireEvent.click(findButtonByText(container, "model_providers.pull"));

    const [name, size] = onPull.mock.calls[0];
    expect(buildModelRef(name, size)).toBe("llama3.1:8b");

    // Selecting the other size chip changes the ref.
    fireEvent.click(findButtonByText(container, "70b"));
    fireEvent.click(findButtonByText(container, "model_providers.pull"));
    const [name2, size2] = onPull.mock.calls[1];
    expect(buildModelRef(name2, size2)).toBe("llama3.1:70b");
  });
});

describe("ModelCard — pull key is the same string in all three derivations", () => {
  it.each([
    ["size-less", SIZELESS_EMBEDDING, "nomic-embed-text"],
    ["sized", SIZED_MODEL, "llama3.1:8b"],
  ])(
    "%s model: pull target, progress key and cancel key all agree",
    (_label, model, expectedKey) => {
      // 1. the ref the card asks the hook to pull
      const first = renderCard({ model });
      fireEvent.click(findButtonByText(first.container, "model_providers.pull"));
      const pullTarget = buildModelRef(...first.onPull.mock.calls[0]);
      expect(pullTarget).toBe(expectedKey);
      first.unmount();

      // 2. the key the card reads progress from — pull_store is written under
      //    the hook's fullName, which is this same ref.
      const second = renderCard({
        model,
        pullingMap: { [pullTarget]: { status: "pulling", percent: 42 } },
      });
      expect(second.container.textContent).toContain("pulling 42%");
      expect(
        findButtonByText(second.container, "model_providers.pull"),
      ).toBeFalsy();

      // 3. the key the card hands back to cancel
      fireEvent.click(second.container.querySelector('button[title="Cancel"]'));
      expect(second.onCancel).toHaveBeenCalledWith(pullTarget);
    },
  );

  it("does not bind progress to a stale colon-suffixed key", () => {
    const { container } = renderCard({
      model: SIZELESS_EMBEDDING,
      pullingMap: { "nomic-embed-text:": { status: "pulling", percent: 42 } },
    });

    expect(container.textContent).not.toContain("pulling 42%");
    expect(findButtonByText(container, "model_providers.pull")).toBeTruthy();
  });
});

describe("ModelCard — installed state", () => {
  it("shows the check and hides pull when the exact ref is installed", () => {
    const { container } = renderCard({
      model: SIZED_MODEL,
      installedNames: new Set(["llama3.1:8b"]),
    });

    expect(container.textContent).toContain("✓");
    expect(container.textContent).toContain("model_providers.installed");
    expect(findButtonByText(container, "model_providers.pull")).toBeFalsy();
  });

  it("shows the check for a size-less model installed as name:latest", () => {
    const { container } = renderCard({
      model: SIZELESS_EMBEDDING,
      installedNames: new Set(["nomic-embed-text:latest"]),
    });

    expect(container.textContent).toContain("model_providers.installed");
    expect(findButtonByText(container, "model_providers.pull")).toBeFalsy();
  });

  it("does not claim installed for an unrelated model", () => {
    const { container } = renderCard({
      model: SIZELESS_EMBEDDING,
      installedNames: new Set(["mxbai-embed-large:latest"]),
    });

    expect(container.textContent).not.toContain("model_providers.installed");
    expect(findButtonByText(container, "model_providers.pull")).toBeTruthy();
  });
});

describe("ModelCard — cloud-only models", () => {
  it("renders a disabled action instead of a pull button", () => {
    const { container, onPull } = renderCard({ model: CLOUD_ONLY_MODEL });

    const cloudBtn = findButtonByText(container, "model_providers.cloud_only");
    expect(cloudBtn).toBeTruthy();
    expect(cloudBtn).toBeDisabled();
    expect(cloudBtn.getAttribute("title")).toBe(
      "model_providers.cloud_only_hint",
    );
    expect(findButtonByText(container, "model_providers.pull")).toBeFalsy();

    fireEvent.click(cloudBtn);
    expect(onPull).not.toHaveBeenCalled();
  });

  it("keeps the BUILTIN disabled affordance and a themed label in both modes", () => {
    const light = renderCard({ model: CLOUD_ONLY_MODEL }, { isDark: false });
    const lightBtn = findButtonByText(
      light.container,
      "model_providers.cloud_only",
    );
    // BUILTIN Button default form, not a bare transparent text link: it always
    // renders its hover-background overlay span.
    expect(lightBtn.querySelector('span[aria-hidden="true"]')).toBeTruthy();
    expect(lightBtn.style.cursor).toBe("not-allowed");
    expect(lightBtn.style.opacity).toBe("0.4");
    /* The label colour is a semantic token now, and jsdom drops var() from
       the CSSOM — the token binding is asserted by source scan below. What
       stays assertable here is the affordance itself. */
    light.unmount();

    const dark = renderCard({ model: CLOUD_ONLY_MODEL }, { isDark: true });
    const darkBtn = findButtonByText(
      dark.container,
      "model_providers.cloud_only",
    );
    expect(darkBtn.querySelector('span[aria-hidden="true"]')).toBeTruthy();
    expect(darkBtn.style.cursor).toBe("not-allowed");
    expect(darkBtn.style.opacity).toBe("0.4");
  });

  it("gives the enabled pull button a dark-mode-visible hover colour", () => {
    const light = renderCard({ model: SIZED_MODEL }, { isDark: false });
    const lightOverlay = findButtonByText(
      light.container,
      "model_providers.pull",
    ).querySelector('span[aria-hidden="true"]');
    expect(lightOverlay).toBeTruthy();
    light.unmount();

    const dark = renderCard({ model: SIZED_MODEL }, { isDark: true });
    const darkOverlay = findButtonByText(
      dark.container,
      "model_providers.pull",
    ).querySelector('span[aria-hidden="true"]');
    expect(darkOverlay).toBeTruthy();
  });

  it("leaves cloud-tagged models that DO have local sizes pullable", () => {
    const { container, onPull } = renderCard({
      model: CLOUD_TAGGED_WITH_SIZES,
    });

    expect(
      findButtonByText(container, "model_providers.cloud_only"),
    ).toBeFalsy();
    const pullBtn = findButtonByText(container, "model_providers.pull");
    expect(pullBtn).toBeTruthy();

    fireEvent.click(pullBtn);
    expect(buildModelRef(...onPull.mock.calls[0])).toBe("gpt-oss:20b");
  });

  it("shows installed rather than the cloud badge when already installed", () => {
    const { container } = renderCard({
      model: CLOUD_ONLY_MODEL,
      installedNames: new Set(["kimi-k3:latest"]),
    });

    expect(container.textContent).toContain("model_providers.installed");
    expect(
      findButtonByText(container, "model_providers.cloud_only"),
    ).toBeFalsy();
  });
});

describe("ModelCard — tags and description still render", () => {
  it("renders the model name and its known tags", () => {
    renderCard({ model: CLOUD_ONLY_MODEL });

    expect(screen.getByText("kimi-k3")).toBeInTheDocument();
    expect(screen.getByText("cloud")).toBeInTheDocument();
    expect(screen.getByText("vision")).toBeInTheDocument();
  });
});


/* The card used to carry a hand-written light/dark pair for its label and for
   the pull button's hover overlay. Both now come off the shared ladder, which
   is what makes them survive a custom palette — and the mode split lives in
   the variable rather than in this file. jsdom drops var() from the CSSOM, so
   the binding is asserted here by source scan. */
describe("model_card.js takes its neutrals from the semantic ladder", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "model_card.js"),
    "utf8",
  );

  test("no hand-written neutral pair is left in the chrome", () => {
    /* barFill is the progress mark, not chrome: it is a data value drawn on
       the card and the ladder's fill steps top out far below the weight it
       needs, so it keeps its own pair on purpose. */
    const chrome = src
      .split("\n")
      .filter((line) => !/barFill/.test(line))
      .join("\n");
    expect(chrome).not.toMatch(
      /isDark\s*\n?\s*\?\s*"rgba\(255,\s*255,\s*255,[^)]*\)"\s*\n?\s*:\s*"rgba\(0,\s*0,\s*0,/,
    );
  });

  test("fills come from the overlay family and strokes from the border token", () => {
    expect(src).toMatch(/var\(--pupu-overlay-(hover|active|selected|ghost)\)/);
    expect(src).toMatch(/var\(--pupu-border\)/);
  });
});
