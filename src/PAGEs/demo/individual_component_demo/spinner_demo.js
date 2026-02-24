import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } -------------------------------------------------------------------------------------------------------------- */
import StringSpinner from "../../../BUILTIN_COMPONENTs/spinner/string_spinner";
import CellSplitSpinner from "../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { CustomizedTooltip } from "../demo";
/* { Components } -------------------------------------------------------------------------------------------------------------- */

const SpinnerDemo = () => {
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
        Spinners
      </span>
      {/* ── ArcSpinner ── */}
      <CustomizedTooltip
        code={` 
\`\`\`js
<ArcSpinner />
\`\`\` 
          `}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <ArcSpinner />
        </div>
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<ArcSpinner size={56} stroke_width={4} />
\`\`\` 
          `}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <ArcSpinner size={56} stroke_width={4} />
        </div>
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<ArcSpinner size={36} stroke_width={2} />
\`\`\` 
          `}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <ArcSpinner size={36} stroke_width={2} />
        </div>
      </CustomizedTooltip>
      {/* ── StringSpinner ── */}
      <CustomizedTooltip
        code={` 
\`\`\`js
<StringSpinner size={34} amplitude={3} />
\`\`\` 
          `}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <StringSpinner size={34} amplitude={3} />
        </div>
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<CellSplitSpinner size={60} />
\`\`\` 
          `}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <CellSplitSpinner size={60} />
        </div>
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<CellSplitSpinner size={60} cells={4} stagger={80}/>
\`\`\` 
          `}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <CellSplitSpinner size={60} cells={4} stagger={80} />
        </div>
      </CustomizedTooltip>
      <CustomizedTooltip
        code={` 
\`\`\`js
<CellSplitSpinner size={60} cells={5} stagger={80} spread={0.9} spin />
\`\`\` 
          `}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 160,
            height: 160,
          }}
        >
          <CellSplitSpinner
            size={60}
            cells={5}
            stagger={80}
            spread={0.9}
            spin
          />
        </div>
      </CustomizedTooltip>
    </div>
  );
};

export default SpinnerDemo;
