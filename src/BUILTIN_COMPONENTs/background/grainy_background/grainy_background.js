import "./grainy_background.css";

const GrainyBackground = ({
  baseFrequency = "0.8",
  numOctaves = "3",
  colors = ["rgb(241, 244, 245)", "rgb(238, 240, 243)", "rgb(241, 234, 239)"],
}) => {
  return (
    <>
      <div
        className="grainy-background"
        style={{
          position: "absolute",
          top: -256,
          left: -256,
          right: -256,
          bottom: -256,
          pointerEvents: "none",
          filter: "url(#grain-only)",
          background:
            `radial-gradient(circle at 30% 30%, ${colors[0]}, transparent),` +
            `radial-gradient(circle at 70% 70%, ${colors[1]}, transparent),` +
            `radial-gradient(circle at 50% 50%, ${colors[2]}, transparent)`,
        }}
      />
      <svg width="0" height="0">
        <filter id="grain-only">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="3"
            result="noise"
          />
          <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
        </filter>
      </svg>
    </>
  );
};

export default GrainyBackground;
