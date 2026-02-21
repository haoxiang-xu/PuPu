import { useContext, useState, useCallback } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Explorer from "../../../BUILTIN_COMPONENTs/explorer/explorer";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ── flat data: key → node props, children = array of keys ── */
/* Every node now carries an explicit `type: "folder" | "file"`.
   Empty folders (children: []) still behave as folders — they keep their
   expand arrow and accept drops inside them. */
const SAMPLE_DATA = {
  src: {
    label: "src",
    type: "folder",
    prefix_icon: "draft",
    children: ["components", "pages", "app.js", "index.js"],
  },
  components: {
    label: "components",
    type: "folder",
    prefix_icon: "draft",
    children: [
      "button.js",
      "input.js",
      "explorer.js",
      "segmented_button_with_a_very_long_name.js",
    ],
  },
  "button.js": { label: "button.js", type: "file", postfix: "2.1 KB" },
  "input.js": { label: "input.js", type: "file", postfix: "1.8 KB" },
  "explorer.js": { label: "explorer.js", type: "file", postfix: "5.4 KB" },
  "segmented_button_with_a_very_long_name.js": {
    label: "segmented_button_with_a_very_long_name.js",
    type: "file",
    postfix: "3.2 KB",
  },
  pages: {
    label: "pages",
    type: "folder",
    prefix_icon: "draft",
    children: ["home.js", "about.js", "settings"],
  },
  "home.js": { label: "home.js", type: "file" },
  "about.js": { label: "about.js", type: "file" },
  settings: {
    label: "settings",
    type: "folder",
    prefix_icon: "settings",
    children: ["general.js", "profile.js", "security.js"],
  },
  "general.js": { label: "general.js", type: "file" },
  "profile.js": { label: "profile.js", type: "file" },
  "security.js": { label: "security.js", type: "file" },
  "app.js": { label: "App.js", type: "file", prefix_icon: "home" },
  "index.js": { label: "index.js", type: "file" },
  public: {
    label: "public",
    type: "folder",
    prefix_icon: "draft",
    children: ["index.html", "favicon.ico"],
  },
  "index.html": { label: "index.html", type: "file" },
  "favicon.ico": { label: "favicon.ico", type: "file" },
  dist: {
    label: "dist",
    type: "folder",
    prefix_icon: "draft",
    children: [],
  },
  "package.json": { label: "package.json", type: "file", prefix_icon: "link" },
  "README.md": { label: "README.md", type: "file", prefix_icon: "edit" },
};

const SAMPLE_ROOT = ["src", "public", "dist", "package.json", "README.md"];

const ExplorerDemo = () => {
  const { theme } = useContext(ConfigContext);
  const color = theme?.color || "black";

  const [data, setData] = useState(SAMPLE_DATA);
  const [root, setRoot] = useState(SAMPLE_ROOT);

  const handleReorder = useCallback((newData, newRoot) => {
    setData(newData);
    setRoot(newRoot);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        Explorer
      </span>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        {/* ── Basic tree ────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontFamily: "Jost, sans-serif",
              color,
              opacity: 0.5,
            }}
          >
            Default
          </span>
          <Explorer
            data={SAMPLE_DATA}
            root={SAMPLE_ROOT}
            default_expanded={["src", "components"]}
            style={{ width: 240 }}
          />
        </div>

        {/* ── Fully expanded ────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              fontSize: 13,
              fontFamily: "Jost, sans-serif",
              color,
              opacity: 0.5,
            }}
          >
            Expanded + Draggable
          </span>
          <Explorer
            data={data}
            root={root}
            default_expanded={true}
            draggable
            on_reorder={handleReorder}
            style={{ width: 280 }}
          />
        </div>
      </div>
    </div>
  );
};

export default ExplorerDemo;
