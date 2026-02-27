import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import { Slider, RangeSlider } from "../../../BUILTIN_COMPONENTs/input/slider";
import { CustomizedTooltip } from "../demo";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const SliderDemo = () => {
  const { theme } = useContext(ConfigContext);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
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
          color: theme?.color || "black",

          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
      >
        Sliders
      </span>

      {/* ── Default ──────────────────────────────────── */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Slider default_value={50} />
\`\`\`
        `}
      >
        <Slider default_value={50} />
      </CustomizedTooltip>

      {/* ── Marks / snap ─────────────────────────────── */}
      <CustomizedTooltip
        code={`
\`\`\`js
<Slider
  default_value={25}
  marks={[0, 25, 50, 75, 100]}
/>
\`\`\`
        `}
      >
        <Slider default_value={25} marks={[0, 25, 50, 75, 100]} />
      </CustomizedTooltip>

      {/* ── Range slider ─────────────────────────────── */}
      <CustomizedTooltip
        code={`
\`\`\`js
<RangeSlider default_value={[20, 80]} />
\`\`\`
        `}
      >
        <RangeSlider default_value={[20, 80]} />
      </CustomizedTooltip>
    </div>
  );
};

export default SliderDemo;
