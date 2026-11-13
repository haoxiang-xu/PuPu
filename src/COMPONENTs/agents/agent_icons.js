import React from "react";
import { LogoSVGs, UISVGs } from "../../BUILTIN_COMPONENTs/icon/icon_manifest";

/* The icons an Agent can wear (its `presentation.icon`).
 *
 * Ids are persisted in the Agent's document, so they are stable: never rename
 * or reuse one. Every glyph is drawn with `fill="currentColor"` on a 24-unit
 * box, so the avatar colours it by setting `color`. Glyphs that already ship in
 * the icon manifest are reused as they are; the three owner-supplied robots
 * live here because nothing else in the app draws them.
 *
 * `bot` is the default and stays the app's Agent glyph.
 *
 * The REMIX_* glyphs below are path data copied verbatim from Remix Icon
 * 4.9.1 (remixicon npm package, `icons/<category>/<name>-fill.svg`),
 * Apache-2.0 licensed, https://remixicon.com — no package dependency. */

export const AGENT_ICON_GROUPS = Object.freeze(["robots", "providers", "everyday"]);
export const DEFAULT_AGENT_ICON = "bot";

const glyph = (path) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
    <path d={path}></path>
  </svg>
);

const ROBOT_DOME =
  "M13 4.05493C17.5 4.55237 21 8.36745 21 13V22H3V13C3 8.36745 6.50005 4.55237 11 4.05493V1H13V4.05493ZM12 18C14.7614 18 17 15.7614 17 13C17 10.2386 14.7614 8 12 8C9.23858 8 7 10.2386 7 13C7 15.7614 9.23858 18 12 18ZM12 16C10.3431 16 9 14.6569 9 13C9 11.3431 10.3431 10 12 10C13.6569 10 15 11.3431 15 13C15 14.6569 13.6569 16 12 16ZM12 14C12.5523 14 13 13.5523 13 13C13 12.4477 12.5523 12 12 12C11.4477 12 11 12.4477 11 13C11 13.5523 11.4477 14 12 14Z";
const ROBOT_FACE =
  "M13.5 2C13.5 2.44425 13.3069 2.84339 13 3.11805V5H18C19.6569 5 21 6.34315 21 8V18C21 19.6569 19.6569 21 18 21H6C4.34315 21 3 19.6569 3 18V8C3 6.34315 4.34315 5 6 5H11V3.11805C10.6931 2.84339 10.5 2.44425 10.5 2C10.5 1.17157 11.1716 0.5 12 0.5C12.8284 0.5 13.5 1.17157 13.5 2ZM0 10H2V16H0V10ZM24 10H22V16H24V10ZM9 14.5C9.82843 14.5 10.5 13.8284 10.5 13C10.5 12.1716 9.82843 11.5 9 11.5C8.17157 11.5 7.5 12.1716 7.5 13C7.5 13.8284 8.17157 14.5 9 14.5ZM16.5 13C16.5 12.1716 15.8284 11.5 15 11.5C14.1716 11.5 13.5 12.1716 13.5 13C13.5 13.8284 14.1716 14.5 15 14.5C15.8284 14.5 16.5 13.8284 16.5 13Z";
const ROBOT_BUST =
  "M17 2H13V1H11V2H7C5.34315 2 4 3.34315 4 5V8C4 10.7614 6.23858 13 9 13H15C17.7614 13 20 10.7614 20 8V5C20 3.34315 18.6569 2 17 2ZM11 7.5C11 8.32843 10.3284 9 9.5 9C8.67157 9 8 8.32843 8 7.5C8 6.67157 8.67157 6 9.5 6C10.3284 6 11 6.67157 11 7.5ZM16 7.5C16 8.32843 15.3284 9 14.5 9C13.6716 9 13 8.32843 13 7.5C13 6.67157 13.6716 6 14.5 6C15.3284 6 16 6.67157 16 7.5ZM4 22C4 17.5817 7.58172 14 12 14C16.4183 14 20 17.5817 20 22H4Z";

const REMIX_LINE_CHART =
  "M5 3V19H21V21H3V3H5ZM19.9393 5.93934L22.0607 8.06066L16 14.1213L13 11.121L9.06066 15.0607L6.93934 12.9393L13 6.87868L16 9.879L19.9393 5.93934Z";
const REMIX_PIE_CHART =
  "M11 2.04938V13H21.9506C21.4489 18.0533 17.1853 22 12 22C6.47715 22 2 17.5229 2 12C2 6.81465 5.94668 2.5511 11 2.04938ZM13 2.04938C17.7244 2.51845 21.4816 6.27559 21.9506 11H13V2.04938Z";
const REMIX_DOCUMENT =
  "M21 9V20.9925C21 21.5511 20.5552 22 20.0066 22H3.9934C3.44495 22 3 21.556 3 21.0082V2.9918C3 2.45531 3.44694 2 3.99826 2H14V8C14 8.55228 14.4477 9 15 9H21ZM21 7H16V2.00318L21 7ZM8 7V9H11V7H8ZM8 11V13H16V11H8ZM8 15V17H16V15H8Z";
const REMIX_IMAGE =
  "M20 5H4V19L13.2923 9.70649C13.6828 9.31595 14.3159 9.31591 14.7065 9.70641L20 15.0104V5ZM2 3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934ZM8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7C9.10457 7 10 7.89543 10 9C10 10.1046 9.10457 11 8 11Z";
const REMIX_MUSIC =
  "M20 3V17C20 19.2091 18.2091 21 16 21C13.7909 21 12 19.2091 12 17C12 14.7909 13.7909 13 16 13C16.7286 13 17.4117 13.1948 18 13.5351V6H9V17C9 19.2091 7.20914 21 5 21C2.79086 21 1 19.2091 1 17C1 14.7909 2.79086 13 5 13C5.72857 13 6.41165 13.1948 7 13.5351V3H20Z";
const REMIX_FILM =
  "M2 3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934ZM4 5V7H6V5H4ZM18 5V7H20V5H18ZM4 9V11H6V9H4ZM18 9V11H20V9H18ZM4 13V15H6V13H4ZM18 13V15H20V13H18ZM4 17V19H6V17H4ZM18 17V19H20V17H18Z";
const REMIX_BRIEFCASE =
  "M7 5V2C7 1.44772 7.44772 1 8 1H16C16.5523 1 17 1.44772 17 2V5H21C21.5523 5 22 5.44772 22 6V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V6C2 5.44772 2.44772 5 3 5H7ZM4 15V19H20V15H4ZM11 11V13H13V11H11ZM9 3V5H15V3H9Z";
const REMIX_SHOPPING_CART =
  "M6.00488 9H19.9433L20.4433 7H8.00488V5H21.7241C22.2764 5 22.7241 5.44772 22.7241 6C22.7241 6.08176 22.7141 6.16322 22.6942 6.24254L20.1942 16.2425C20.083 16.6877 19.683 17 19.2241 17H5.00488C4.4526 17 4.00488 16.5523 4.00488 16V4H2.00488V2H5.00488C5.55717 2 6.00488 2.44772 6.00488 3V9ZM6.00488 23C4.90031 23 4.00488 22.1046 4.00488 21C4.00488 19.8954 4.90031 19 6.00488 19C7.10945 19 8.00488 19.8954 8.00488 21C8.00488 22.1046 7.10945 23 6.00488 23ZM18.0049 23C16.9003 23 16.0049 22.1046 16.0049 21C16.0049 19.8954 16.9003 19 18.0049 19C19.1095 19 20.0049 19.8954 20.0049 21C20.0049 22.1046 19.1095 23 18.0049 23Z";
const REMIX_WALLET =
  "M2.00488 8.99979H21.0049C21.5572 8.99979 22.0049 9.4475 22.0049 9.99979V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V8.99979ZM3.00488 2.99979H18.0049V6.99979H2.00488V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979ZM15.0049 13.9998V15.9998H18.0049V13.9998H15.0049Z";
const REMIX_STAR =
  "M12.0006 18.26L4.94715 22.2082L6.52248 14.2799L0.587891 8.7918L8.61493 7.84006L12.0006 0.5L15.3862 7.84006L23.4132 8.7918L17.4787 14.2799L19.054 22.2082L12.0006 18.26Z";
const REMIX_FLASHLIGHT =
  "M13 10H20L11 23V14H4L13 1V10Z";
const REMIX_BUG =
  "M6.05636 8.30049C6.11995 8.19854 6.18609 8.09835 6.25469 8H17.7453C17.8139 8.09835 17.88 8.19854 17.9436 8.30049L19.9641 7.13397L20.9641 8.86602L18.7512 10.1436C18.9134 10.7348 19 11.3573 19 12V13H22V15H19C19 15.9534 18.8094 16.8623 18.4642 17.6907L20.9641 19.134L19.9641 20.866L17.4383 19.4077C16.3533 20.7447 14.7853 21.6737 13 21.9291V14H11V21.9291C9.21467 21.6737 7.64665 20.7447 6.56171 19.4077L4.0359 20.866L3.0359 19.134L5.5358 17.6907C5.19061 16.8623 5 15.9534 5 15H2V13H5V12C5 11.3573 5.08661 10.7348 5.2488 10.1436L3.0359 8.86602L4.0359 7.13397L6.05636 8.30049ZM8 6C8 3.79086 9.79086 2 12 2C14.2091 2 16 3.79086 16 6H8Z";
const REMIX_RUN =
  "M9.82986 8.78986L7.99998 9.45588V13H5.99998V8.05H6.015L11.2834 6.13247C11.5274 6.03855 11.7922 5.99162 12.0648 6.0008C13.1762 6.02813 14.1522 6.75668 14.4917 7.82036C14.678 8.40431 14.848 8.79836 15.0015 9.0025C15.9138 10.2155 17.3653 11 19 11V13C16.8253 13 14.8823 12.0083 13.5984 10.4526L13.017 13.7497L15 15.67V23H13V17.0142L10.9507 15.0271L10.003 19.3253L3.10938 18.1098L3.45667 16.1401L8.38071 17.0084L9.82986 8.78986ZM13.5 5.5C12.3954 5.5 11.5 4.60457 11.5 3.5C11.5 2.39543 12.3954 1.5 13.5 1.5C14.6046 1.5 15.5 2.39543 15.5 3.5C15.5 4.60457 14.6046 5.5 13.5 5.5Z";
const REMIX_PLANE =
  "M14 8.94737L22 14V16L14 13.4737V18.8333L17 20.5V22L12.5 21L8 22V20.5L11 18.8333V13.4737L3 16V14L11 8.94737V3.5C11 2.67157 11.6716 2 12.5 2C13.3284 2 14 2.67157 14 3.5V8.94737Z";
const REMIX_CUP =
  "M5 3H20C21.1046 3 22 3.89543 22 5V8C22 9.10457 21.1046 10 20 10H18V13C18 15.2091 16.2091 17 14 17H8C5.79086 17 4 15.2091 4 13V4C4 3.44772 4.44772 3 5 3ZM18 5V8H20V5H18ZM2 19H20V21H2V19Z";
const REMIX_LIGHTBULB =
  "M11 18H7.94101C7.64391 16.7274 6.30412 15.6857 5.75395 14.9992C4.65645 13.6297 4 11.8915 4 10C4 5.58172 7.58172 2 12 2C16.4183 2 20 5.58172 20 10C20 11.8925 19.3428 13.6315 18.2443 15.0014C17.6944 15.687 16.3558 16.7276 16.059 18H13V13H11V18ZM16 20V21C16 22.1046 15.1046 23 14 23H10C8.89543 23 8 22.1046 8 21V20H16Z";

const ui = (key) => () => UISVGs[key]();
const logo = (key) => () => LogoSVGs[key]();

/* [id, English label, renderer] per group. Labels are accessible names in the
   picker; they are not persisted. */
const ROBOTS = [
  ["bot", "Bot", ui("bot")],
  ["robot_dome", "Dome robot", () => glyph(ROBOT_DOME)],
  ["robot_face", "Robot face", () => glyph(ROBOT_FACE)],
  ["robot_bust", "Robot bust", () => glyph(ROBOT_BUST)],
];

/* The model-provider marks the app already ships (native providers and the
   shipped presets). All of them are single-colour `currentColor` glyphs, so
   they take the avatar's contrast colour like every other icon. */
const PROVIDERS = [
  ["open_ai", "OpenAI", logo("open_ai")],
  ["anthropic", "Anthropic", logo("Anthropic")],
  ["gemini", "Gemini", logo("gemini")],
  ["deepseek", "DeepSeek", logo("deepseek")],
  ["kimi", "Kimi", logo("kimi")],
  ["ollama", "Ollama", logo("ollama")],
];

const EVERYDAY = [
  ["storefront", "Store", ui("storefront")],
  ["bar_chart", "Bar chart", ui("bar_chart")],
  ["calendar", "Calendar", ui("calendar")],
  ["email", "Mail", ui("email")],
  ["chat", "Chat", ui("chat")],
  ["search", "Search", ui("search")],
  ["code", "Code", ui("code")],
  ["terminal", "Terminal", ui("terminal")],
  ["data", "Database", ui("data")],
  ["server", "Server", ui("server")],
  ["folder", "Folder", ui("folder")],
  ["book_open", "Book", ui("book_open")],
  ["edit_pen", "Pencil", ui("edit_pen")],
  ["globe", "Globe", ui("globe")],
  ["map", "Map pin", ui("map")],
  ["home", "Home", ui("home")],
  ["heart", "Heart", ui("heart")],
  ["shield", "Shield", ui("shield")],
  ["education", "Graduation cap", ui("education")],
  ["brain", "Brain", ui("brain")],
  ["key", "Key", ui("key")],
  ["lock", "Lock", ui("lock")],
  ["target", "Target", ui("target")],
  ["flag", "Flag", ui("flag")],
  ["tool", "Tool", ui("tool")],
  ["hammer", "Hammer", ui("hammer")],
  ["phone", "Phone", ui("phone")],
  ["user", "Person", ui("user")],
  ["line_chart", "Line chart", () => glyph(REMIX_LINE_CHART)],
  ["pie_chart", "Pie chart", () => glyph(REMIX_PIE_CHART)],
  ["document", "Document", () => glyph(REMIX_DOCUMENT)],
  ["image", "Image", () => glyph(REMIX_IMAGE)],
  ["music", "Music", () => glyph(REMIX_MUSIC)],
  ["film", "Film", () => glyph(REMIX_FILM)],
  ["briefcase", "Briefcase", () => glyph(REMIX_BRIEFCASE)],
  ["shopping_cart", "Shopping cart", () => glyph(REMIX_SHOPPING_CART)],
  ["wallet", "Wallet", () => glyph(REMIX_WALLET)],
  ["star", "Star", () => glyph(REMIX_STAR)],
  ["flashlight", "Flashlight", () => glyph(REMIX_FLASHLIGHT)],
  ["bug", "Bug", () => glyph(REMIX_BUG)],
  ["run", "Run", () => glyph(REMIX_RUN)],
  ["plane", "Plane", () => glyph(REMIX_PLANE)],
  ["cup", "Cup", () => glyph(REMIX_CUP)],
  ["lightbulb", "Lightbulb", () => glyph(REMIX_LIGHTBULB)],
];

export const AGENT_ICONS = Object.freeze(
  [
    ...ROBOTS.map((row) => [...row, "robots"]),
    ...PROVIDERS.map((row) => [...row, "providers"]),
    ...EVERYDAY.map((row) => [...row, "everyday"]),
  ].map(([id, label, render, group]) => Object.freeze({ id, label, group, render })),
);

const BY_ID = Object.create(null);
AGENT_ICONS.forEach((entry) => {
  BY_ID[entry.id] = entry;
});

export const is_agent_icon_id = (id) =>
  typeof id === "string" && Object.prototype.hasOwnProperty.call(BY_ID, id);

export const agent_icon = (id) => (is_agent_icon_id(id) ? BY_ID[id] : BY_ID[DEFAULT_AGENT_ICON]);

export const agent_icons_in = (group) => AGENT_ICONS.filter((entry) => entry.group === group);

/* The glyph at an exact pixel size. The manifest components spread no props
   and Ollama's sets `1em`, so the size is set on the element itself. */
export function render_agent_icon(id, size) {
  const element = agent_icon(id).render();
  return React.cloneElement(element, {
    width: size,
    height: size,
    "aria-hidden": "true",
    focusable: "false",
    style: { display: "block", flexShrink: 0 },
  });
}
