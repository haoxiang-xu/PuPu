import fs from "fs";
import path from "path";

describe("segmented_button theme (phase 4)", () => {
  test("light-mode indicator background binds to the background tier, not a hardcoded literal", () => {
    const source = fs.readFileSync(path.join(__dirname, "segmented_button.js"), "utf8");
    expect(source).not.toContain("rgba(255,255,255,0.92)");
    expect(source).toContain("rgba(var(--pupu-background-rgb),0.92)");
  });

  test("track container border binds to the mid border-strength tier (three-tier border strength)", () => {
    const source = fs.readFileSync(path.join(__dirname, "segmented_button.js"), "utf8");
    expect(source).toContain('border: "1px solid var(--pupu-border-mid)"');
  });
});

describe("SegmentedButton track padding", () => {
  const { render } = require("@testing-library/react");
  const React = require("react");
  const { ConfigContext } = require("../../CONTAINERs/config/context");
  const SegmentedButton = require("./segmented_button").default;

  const renderTrack = (style) => {
    const { container } = render(
      React.createElement(
        ConfigContext.Provider,
        { value: { onThemeMode: "light_mode", theme: {} } },
        React.createElement(SegmentedButton, {
          options: [
            { label: "Light", value: "l" },
            { label: "Dark", value: "d" },
          ],
          value: "l",
          on_change: () => {},
          style,
        }),
      ),
    );
    return container.firstChild;
  };

  test("horizontal padding defaults symmetric (override via paddingHorizontal)", () => {
    expect(renderTrack({ padding: 2 }).style.padding).toBe("2px 2px");
    expect(renderTrack(undefined).style.padding).toBe("3px 3px");
  });

  test("paddingHorizontal override wins and never leaks into the style passthrough", () => {
    const track = renderTrack({ padding: 2, paddingHorizontal: 8 });
    expect(track.style.padding).toBe("2px 8px");
  });
});

describe("SegmentedButton concentric indicator corners", () => {
  const { render } = require("@testing-library/react");
  const React = require("react");
  const { ConfigContext } = require("../../CONTAINERs/config/context");
  const SegmentedButton = require("./segmented_button").default;

  test("indicator radius = track radius minus per-axis inset (padding + 1px border)", () => {
    const { container } = render(
      React.createElement(
        ConfigContext.Provider,
        { value: { onThemeMode: "light_mode", theme: {} } },
        React.createElement(SegmentedButton, {
          options: [{ label: "A", value: "a" }, { label: "B", value: "b" }],
          value: "a",
          on_change: () => {},
          style: { padding: 2, borderRadius: 7 },
        }),
      ),
    );
    const indicator = container.firstChild.querySelector("div");
    // insets: x=2+1, y=2+1; concentric baseline +1 → radii (7-3)+1=5 both axes
    expect(indicator.style.borderRadius).toBe("5px / 5px");
  });
});
