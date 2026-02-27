import { useEffect, useRef, useMemo } from "react";

/**
 * AuroraBackground
 *
 * Renders soft, slowly-moving color orbs behind a frosted-glass blur layer,
 * producing an organic, lava-lamp / aurora effect.
 *
 * Props:
 *  - colors        {string[]}   Array of CSS colors for the orbs
 *  - blur          {number}     px blur applied over the orbs  (default 80)
 *  - speed         {number}     animation speed multiplier     (default 1)
 *  - orbCount      {number}     number of orbs (auto from colors.length if omitted)
 *  - orbSize       {string}     CSS size of each orb           (default "45%")
 *  - style         {object}     extra styles on the root container
 *  - className     {string}     extra class on the root container
 */

/* -------------------------------------------------- helpers -------------------------------------------------- */

const seededRandom = (seed) => {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

const buildKeyframes = (name, rand) => {
  /* each orb floats around a unique looping path */
  const x0 = Math.round(rand() * 70 + 15);
  const y0 = Math.round(rand() * 70 + 15);
  const x1 = Math.round(rand() * 70 + 15);
  const y1 = Math.round(rand() * 70 + 15);
  const x2 = Math.round(rand() * 70 + 15);
  const y2 = Math.round(rand() * 70 + 15);
  const x3 = Math.round(rand() * 70 + 15);
  const y3 = Math.round(rand() * 70 + 15);
  const r0 = Math.round(rand() * 360);
  const r1 = r0 + (rand() > 0.5 ? 180 : -180);
  const s0 = 0.9 + rand() * 0.3;
  const s1 = 0.8 + rand() * 0.4;

  return `
    @keyframes ${name} {
      0%   { transform: translate(${x0}%, ${y0}%) rotate(${r0}deg) scale(${s0}); }
      25%  { transform: translate(${x1}%, ${y1}%) rotate(${r0 + 90}deg) scale(${s1}); }
      50%  { transform: translate(${x2}%, ${y2}%) rotate(${r1}deg) scale(${s0}); }
      75%  { transform: translate(${x3}%, ${y3}%) rotate(${r1 + 90}deg) scale(${s1}); }
      100% { transform: translate(${x0}%, ${y0}%) rotate(${r0 + 360}deg) scale(${s0}); }
    }
  `;
};

/* ------------------------------------------------- component ------------------------------------------------- */

const DEFAULT_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#10b981", // emerald
];

const AuroraBackground = ({
  colors = DEFAULT_COLORS,
  blur = 80,
  speed = 1,
  orbCount,
  orbSize = "45%",
  style,
  className,
}) => {
  const styleRef = useRef(null);
  const idRef = useRef(`aurora-${Math.random().toString(36).slice(2, 8)}`);
  const id = idRef.current;

  const count = orbCount ?? colors.length;

  /* Build orb configs deterministically from index so they don't jump on re-render */
  const orbs = useMemo(() => {
    const rand = seededRandom(42);
    return Array.from({ length: count }, (_, i) => {
      const color = colors[i % colors.length];
      const name = `${id}-orb-${i}`;
      const duration = (18 + rand() * 20) / speed;
      const delay = -(rand() * duration);
      const keyframes = buildKeyframes(name, rand);
      return { color, name, duration, delay, keyframes };
    });
  }, [count, colors, speed, id]);

  /* Inject keyframes into <head> */
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = orbs.map((o) => o.keyframes).join("\n");
    document.head.appendChild(el);
    styleRef.current = el;
    return () => {
      document.head.removeChild(el);
    };
  }, [orbs]);

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    >
      {/* Orb layer — extends beyond bounds to avoid hard edges */}
      <div
        style={{
          position: "absolute",
          top: "-20%",
          left: "-20%",
          width: "140%",
          height: "140%",
          filter: `blur(${blur}px)`,
          WebkitFilter: `blur(${blur}px)`,
        }}
      >
        {orbs.map((orb, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: orbSize,
              height: orbSize,
              borderRadius: "50%",
              background: `radial-gradient(circle at 40% 40%, ${orb.color}, ${orb.color}88, transparent 70%)`,
              opacity: 0.7,
              mixBlendMode: "normal",
              animation: `${orb.name} ${orb.duration.toFixed(1)}s ${orb.delay.toFixed(1)}s infinite ease-in-out`,
              willChange: "transform",
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default AuroraBackground;
