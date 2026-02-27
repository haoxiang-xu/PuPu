import { useEffect } from "react";

const GrainyBackground = ({
  baseFrequency = "0.8",
  numOctaves = "3",
  animationDuration = 32,
  colors = ["rgb(177, 75, 119)", "rgb(243, 190, 171)", "rgb(211, 97, 116)"],
}) => {
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
      .grainy-background {
        animation: grainy-background-animation ${animationDuration}s infinite alternate ease-in-out;
      }
      @keyframes grainy-background-animation {
        0% {
          transform: translate(0, 0) rotate(0deg);
        }
        50% {
          transform: translate(-4%, -4%)rotate(16deg);
        }
        100% {
          transform: translate(4%, 4%) rotate(0deg);
        }
      }
  `;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [animationDuration]);

  return (
    <>
      <div
        className="grainy-background"
        style={{
          position: "absolute",
          top: -300,
          left: -300,
          right: -300,
          bottom: -300,
          pointerEvents: "none",
          filter: "url(#grain-only)",
          background:
            `radial-gradient(circle at 30% 30%, ${colors[0]}, ${colors[1]}),` +
            `radial-gradient(circle at 70% 70%, ${colors[1]}, ${colors[2]}),` +
            `radial-gradient(circle at 50% 50%, ${colors[2]}, ${colors[0]})`,
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
