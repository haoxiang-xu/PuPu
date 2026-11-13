import React from "react";
import { render, screen } from "@testing-library/react";
import AgentAvatar, { AVATAR_DARK_GLYPH, AVATAR_LIGHT_GLYPH, avatar_glyph_color } from "./agent_avatar";

const hex = (rgb) => `#${rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;

describe("AgentAvatar", () => {
  test("the default is the bot on the Agent blue, with a white glyph", () => {
    render(<AgentAvatar testid="a" size={22} />);
    const avatar = screen.getByTestId("a");
    expect(avatar.getAttribute("data-agent-icon")).toBe("bot");
    expect(hex(avatar.style.background)).toBe("#4a5bd8");
    expect(hex(avatar.style.color)).toBe(AVATAR_LIGHT_GLYPH);
    expect(avatar.style.width).toBe("22px");
    // eslint-disable-next-line testing-library/no-node-access
    expect(avatar.querySelector("svg").getAttribute("width")).toBe(String(Math.round(22 * 0.6)));
  });

  test("a light custom colour gets a dark glyph, a dark one a white glyph", () => {
    expect(avatar_glyph_color("#ffffff")).toBe(AVATAR_DARK_GLYPH);
    expect(avatar_glyph_color("#f5e663")).toBe(AVATAR_DARK_GLYPH);
    expect(avatar_glyph_color("#4a5bd8")).toBe(AVATAR_LIGHT_GLYPH);
    expect(avatar_glyph_color("#d23f37")).toBe(AVATAR_LIGHT_GLYPH);
    expect(avatar_glyph_color("#1d1d1f")).toBe(AVATAR_LIGHT_GLYPH);
    /* Every palette colour takes the white glyph; a pale colour outside the
       palette is not drawn at all, the default is. */
    render(<AgentAvatar testid="b" presentation={{ icon: "robot_face", color: "#FFF5CC" }} />);
    const avatar = screen.getByTestId("b");
    expect(avatar.getAttribute("data-agent-icon")).toBe("robot_face");
    expect(avatar.getAttribute("data-agent-color")).toBe("#4a5bd8");
    expect(hex(avatar.style.color)).toBe(AVATAR_LIGHT_GLYPH);
  });

  test("an unreadable presentation draws the default", () => {
    render(<AgentAvatar testid="c" presentation={{ icon: "constructor", color: "blue" }} />);
    expect(screen.getByTestId("c").getAttribute("data-agent-icon")).toBe("bot");
    expect(screen.getByTestId("c").getAttribute("data-agent-color")).toBe("#4a5bd8");
  });
});

describe("the glyph variant (list rows)", () => {
  test("draws no tile and keeps the row's text colour, whatever colour is stored", () => {
    render(<AgentAvatar variant="glyph" testid="g" presentation={{ icon: "run", color: "#1d8798" }} />);
    const el = screen.getByTestId("g");
    expect(el.style.background).toBe("");
    expect(el.getAttribute("data-agent-icon")).toBe("run");
    expect(el.getAttribute("data-agent-tint")).toBe("currentColor");
    expect(el.style.color.toLowerCase()).toBe("currentcolor");
  });
  test("an icon-only document draws its icon in the row's colour", () => {
    render(<AgentAvatar variant="glyph" testid="g" presentation={{ icon: "star" }} />);
    expect(screen.getByTestId("g").getAttribute("data-agent-icon")).toBe("star");
    expect(screen.getByTestId("g").getAttribute("data-agent-tint")).toBe("currentColor");
  });
  test("the tile variant ignores a stored colour: always the Agent blue", () => {
    render(<AgentAvatar testid="t" presentation={{ icon: "star", color: "#1d8798" }} />);
    expect(screen.getByTestId("t").style.background).toBe("rgb(74, 91, 216)");
    expect(screen.getByTestId("t").getAttribute("data-agent-icon")).toBe("star");
  });
});
