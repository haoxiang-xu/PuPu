import { useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Carousel from "../../../BUILTIN_COMPONENTs/carousel/carousel";
import { CustomizedTooltip } from "../demo";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const SAMPLE_ITEMS = [
  {
    title: "Minimalist Design",
    description: "Clean interfaces that focus on content and clarity.",
  },
  {
    title: "Spring Physics",
    description: "Natural, fluid animations powered by spring dynamics.",
  },
  {
    title: "Dark Mode",
    description: "Seamless theme switching with carefully tuned palettes.",
  },
  {
    title: "Composable",
    description: "Build complex UIs from small, reusable pieces.",
  },
  {
    title: "Accessible",
    description: "Keyboard navigation and ARIA support built in.",
  },
  {
    title: "Performant",
    description: "GPU-accelerated transforms, minimal re-renders.",
  },
  {
    title: "Responsive",
    description: "Adapts gracefully across viewport sizes.",
  },
];

const CarouselDemo = () => {
  const { theme } = useContext(ConfigContext);
  const color = theme?.color || "#222";
  const fontFamily = theme?.font?.fontFamily || "Jost";

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "32px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily,
          color,
          userSelect: "none",
        }}
      >
        Carousel
      </span>

      <CustomizedTooltip
        code={`
\`\`\`js
<Carousel items={items} />
\`\`\`
`}
      >
        <Carousel items={SAMPLE_ITEMS} />
      </CustomizedTooltip>
    </div>
  );
};

export default CarouselDemo;
