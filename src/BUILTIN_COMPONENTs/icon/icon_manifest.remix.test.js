import { UISVGs } from "./icon_manifest";
import { render } from "@testing-library/react";

const ADDED = ["branch","switch_case","book_open","flow_chart","anchor","draggable","forbid","hand","loader","subagent_pool","toolkit_pool"];

describe("icons added from Remix Icon", () => {
  test.each(ADDED)("%s renders a square svg with at least one path", (name) => {
    expect(name in UISVGs).toBe(true);
    const { container } = render(UISVGs[name]());
    const svg = container.querySelector("svg");
    /* Most are 24x24; the supplied pool glyphs keep their own square viewBox,
     * which scales identically because no width/height is set. */
    const [, , w, h] = svg.getAttribute("viewBox").split(" ").map(Number);
    expect(w).toBe(h);
    /* Colour comes from `fill="currentColor"` — these components never spread
     * props, so a hardcoded fill would make the icon uncolourable. */
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });
  test("keys are unique and nothing existing was dropped", () => {
    const keys = Object.keys(UISVGs);
    expect(new Set(keys).size).toBe(keys.length);
    ["add","code","copy","delete","eye_open","paste","rename","unlink","search","fullscreen","flag","bot","target","tool","shapes","lock","warning","check","close","pause","play","circle","subtract","question_mark","refresh","enter_key","edit_pen"]
      .forEach((k) => expect(k in UISVGs).toBe(true));
  });
});
