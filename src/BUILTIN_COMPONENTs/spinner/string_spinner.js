import { useState, useContext, useEffect } from "react";
import { useSpring, animated } from "react-spring";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

// 生成振动弦的 SVG 路径
function generatePath(n, t, options) {
  const {
    R = 50,
    A0 = 10,
    omega = 1,
    cx = 100,
    cy = 100,
    points = 100,
  } = options;
  const A = A0 * Math.sin(omega * t);
  let path = `M `;
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * 2 * Math.PI;
    const r = R + A * Math.cos(n * theta);
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    path += `${x},${y} `;
    if (i < points) path += `L `;
  }
  path += `Z`;
  return path;
}

function StringSpinner({ n = 5, amplitude = 2, size = 26, color = "default" }) {
  const { theme } = useContext(ConfigContext);
  const padding = 10;
  const svgSize = size * 2 + padding * 2;
  const center = svgSize / 2;
  const [strokeColor, setStrokeColor] = useState(color);
  useEffect(() => {
    if (theme && color === "default") {
      setStrokeColor(theme.spinner.color);
    } else {
      setStrokeColor(color);
    }
  }, [theme, color]);

  const props = useSpring({
    from: { t: 0 },
    to: { t: 2 * Math.PI },
    loop: true,
    config: { duration: 1000 },
  });
  const d = props.t.to((t) =>
    generatePath(n, t, {
      R: size,
      A0: amplitude,
      omega: 1,
      cx: center,
      cy: center,
      points: 100,
    })
  );

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        margin: "0 auto",
      }}
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <animated.path
        d={d}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        filter="url(#glow)"
      />
    </svg>
  );
}

export default StringSpinner;
