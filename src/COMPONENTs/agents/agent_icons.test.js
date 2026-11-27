/* eslint-disable testing-library/no-container, testing-library/no-node-access -- the drawn svg element is what is asserted. */
import { render } from "@testing-library/react";
import {
  AGENT_ICONS,
  AGENT_ICON_GROUPS,
  DEFAULT_AGENT_ICON,
  agent_icon,
  agent_icons_in,
  is_agent_icon_id,
  render_agent_icon,
} from "./agent_icons";

/* The catalogue's ids are persisted in Agent documents: unique, stable, and
   every one of them draws. */
describe("the Agent icon catalogue", () => {
  test("ids are unique and well formed", () => {
    const ids = AGENT_ICONS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[a-z0-9_]{1,40}$/));
  });

  test("every entry is in one of the three groups, and every group has icons", () => {
    expect(AGENT_ICON_GROUPS).toEqual(["robots", "providers", "everyday"]);
    AGENT_ICONS.forEach((entry) => expect(AGENT_ICON_GROUPS).toContain(entry.group));
    AGENT_ICON_GROUPS.forEach((group) => expect(agent_icons_in(group).length).toBeGreaterThan(0));
    expect(agent_icons_in("robots").map((entry) => entry.id)).toEqual(["bot", "robot_dome", "robot_face", "robot_bust"]);
  });

  test("bot is the default and is first", () => {
    expect(DEFAULT_AGENT_ICON).toBe("bot");
    expect(AGENT_ICONS[0].id).toBe("bot");
    expect(agent_icon("no-such-icon").id).toBe("bot");
  });

  test.each(AGENT_ICONS.map((entry) => entry.id))("%s renders a currentColor svg at the size asked", (id) => {
    const { container } = render(render_agent_icon(id, 17));
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg.getAttribute("width")).toBe("17");
    expect(svg.getAttribute("height")).toBe("17");
    expect(svg.getAttribute("fill")).toBe("currentColor");
    expect(svg.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  test("only own catalogue ids are ids", () => {
    ["constructor", "__proto__", "toString", "", null, 3].forEach((value) => expect(is_agent_icon_id(value)).toBe(false));
    expect(is_agent_icon_id("open_ai")).toBe(true);
  });
});

test("the everyday group carries the Remix glyphs the owner asked for (exercise, charts, …)", () => {
  const everyday = agent_icons_in("everyday").map((entry) => entry.id);
  ["line_chart", "pie_chart", "bar_chart", "document", "image", "music", "film", "briefcase", "shopping_cart",
    "wallet", "star", "flashlight", "bug", "run", "plane", "cup", "lightbulb"]
    .forEach((id) => expect(everyday).toContain(id));
});
