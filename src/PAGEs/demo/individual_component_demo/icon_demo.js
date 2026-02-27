import { useContext, useMemo } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Icon Registry } --------------------------------------------------------------------------------------------------------- */
import {
  fileTypeSVGs,
  LogoSVGs,
  UISVGs,
} from "../../../BUILTIN_COMPONENTs/icon/icon_manifest";
/* { Icon Registry } --------------------------------------------------------------------------------------------------------- */

/* ── single icon cell ──────────────────────────────────────────────── */

const IconCell = ({ name }) => {
  const { theme } = useContext(ConfigContext);

  const color = theme?.color || "#000";

  return (
    <Tooltip
      label={name}
      position="top"
      trigger={["hover"]}
      open_delay={400}
      close_delay={60}
      show_arrow={false}
    >
      <div
        style={{
          width: 56,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "default",
        }}
      >
        <div style={{ width: 22, height: 22, color }}>
          <Icon src={name} />
        </div>
      </div>
    </Tooltip>
  );
};

/* ── main demo ─────────────────────────────────────────────────────── */

const IconDemo = () => {
  const { theme } = useContext(ConfigContext);
  const color = theme?.color || "#000";

  /* auto-derive categories from icon_manifest exports */
  const categories = useMemo(
    () => [
      { label: "UI", icons: Object.keys(UISVGs) },
      { label: "Logos", icons: Object.keys(LogoSVGs) },
      { label: "File Types", icons: Object.keys(fileTypeSVGs) },
    ],
    [],
  );

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 36,
        padding: "10px",
      }}
    >
      {/* title */}
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: 48,
          fontFamily: "Jost",
          color,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        Icons
      </span>

      {/* categories */}
      {categories.map((cat) => (
        <div
          key={cat.label}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          {/* category label */}
          <span
            style={{
              fontSize: 13,
              fontFamily: "Jost, sans-serif",
              fontWeight: 500,
              color,
              opacity: 0.36,
              letterSpacing: "1px",
              textTransform: "uppercase",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {cat.label}
          </span>

          {/* icon grid */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
            }}
          >
            {cat.icons.map((name) => (
              <IconCell key={name} name={name} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default IconDemo;
