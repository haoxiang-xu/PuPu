import { useEffect, useRef, useState } from "react";

const DEFAULT_COLORS = ["#ffb37c", "#ff6b9d", "#7c5cff", "#3ba7ff"];

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2  uResolution;
uniform float uTime;
uniform vec3  uColors[8];
uniform int   uColorCount;
uniform int   uGradientMode;   // 0 linear, 1 radial, 2 conic
uniform float uGradientAngle;  // radians
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uGrain;
uniform vec2  uMouse;          // -1..1
uniform float uInteractive;    // 0 or 1

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1,0));
  float c = hash(i + vec2(0,1));
  float d = hash(i + vec2(1,1));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * vnoise(p); p *= 2.02; a *= 0.5;
  }
  return v;
}

vec3 sampleGradient(float t){
  t = clamp(t, 0.0, 0.999);
  float scaled = t * float(uColorCount - 1);
  int lo = int(floor(scaled));
  int hi = lo + 1;
  float k = fract(scaled);
  vec3 a = uColors[lo];
  vec3 b = uColors[hi];
  return mix(a, b, k);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;

  float n = fbm(uv * uWarpScale + vec2(uTime * 0.08, uTime * 0.06));
  vec2  dir = vec2(cos(n * 6.2831), sin(n * 6.2831));
  float mouseBoost = mix(1.0, 1.0 + 0.8 * (1.0 - length(uv - (uMouse * 0.5 + 0.5))), uInteractive);
  vec2 warped = uv + dir * uWarpStrength * mouseBoost;

  float t;
  if (uGradientMode == 0) {
    vec2 axis = vec2(cos(uGradientAngle), sin(uGradientAngle));
    t = dot(warped - 0.5, axis) + 0.5;
  } else if (uGradientMode == 1) {
    t = length(warped - 0.5) * 1.4142;
  } else {
    vec2 c = warped - 0.5;
    t = (atan(c.y, c.x) + 3.14159) / 6.2831;
  }

  vec3 col = sampleGradient(t);
  float g = (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;
  col += g;
  fragColor = vec4(col, 1.0);
}`;

const hexToRgb01 = (hex) => {
  const h = hex.replace("#", "");
  const v = h.length === 3
    ? h.split("").map((c) => parseInt(c + c, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  return [v[0] / 255, v[1] / 255, v[2] / 255];
};

const DisplacementWarp = ({
  colors         = DEFAULT_COLORS,
  speed          = 1,
  interactive    = true,
  ambient        = true,
  fadeMs         = 500,
  gradient       = "linear",
  gradientAngle  = 135,
  warpStrength   = 0.08,
  warpScale      = 2.5,
  grain          = 0.04,
  pixelRatio     = 1.5,
  style,
  className,
}) => {
  const canvasRef = useRef(null);
  const rootRef   = useRef(null);
  const rafRef    = useRef(0);
  const glStateRef = useRef(null);
  const propsRef  = useRef(null);
  const visibleRef = useRef(true);
  const readyRef  = useRef(false);
  const mouseRef  = useRef([0, 0]);

  const [ready,   setReady]   = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed,  setFailed]  = useState(false);

  propsRef.current = {
    colors, speed, interactive, ambient,
    gradient, gradientAngle, warpStrength, warpScale, grain, pixelRatio,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const root   = rootRef.current;
    if (!canvas || !root) return;

    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) { setFailed(true); return; }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(log);
      }
      return s;
    };

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
        setFailed(true);
        return;
      }
    } catch (e) {
      console.error(e);
      setFailed(true);
      return;
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const loc = {
      res:  gl.getUniformLocation(prog, "uResolution"),
      time: gl.getUniformLocation(prog, "uTime"),
      cols: gl.getUniformLocation(prog, "uColors"),
      cnt:  gl.getUniformLocation(prog, "uColorCount"),
      gm:   gl.getUniformLocation(prog, "uGradientMode"),
      ga:   gl.getUniformLocation(prog, "uGradientAngle"),
      ws:   gl.getUniformLocation(prog, "uWarpStrength"),
      wsc:  gl.getUniformLocation(prog, "uWarpScale"),
      grn:  gl.getUniformLocation(prog, "uGrain"),
      mouse: gl.getUniformLocation(prog, "uMouse"),
      inter: gl.getUniformLocation(prog, "uInteractive"),
    };

    glStateRef.current = { gl, prog, vbo, loc };

    const resize = () => {
      const r = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pr = (propsRef.current.pixelRatio || 1.5);
      const w = Math.max(1, Math.round(r.width  * dpr * pr / 2));
      const h = Math.max(1, Math.round(r.height * dpr * pr / 2));
      canvas.width  = w;
      canvas.height = h;
      canvas.style.width  = r.width  + "px";
      canvas.style.height = r.height + "px";
      gl.viewport(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    const io = new IntersectionObserver(
      ([entry]) => {
        const v = entry.isIntersecting;
        visibleRef.current = v;
        setVisible(v);
      },
      { rootMargin: "200px", threshold: 0.01 },
    );
    io.observe(root);

    const onMove = (e) => {
      if (!propsRef.current.interactive) return;
      const r = root.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
      const y = -((e.clientY - r.top)  / r.height - 0.5) * 2;
      mouseRef.current = [x, y];
    };
    root.addEventListener("mousemove", onMove);

    const t0 = performance.now();
    const GRAD_MAP = { linear: 0, radial: 1, conic: 2 };

    const loop = () => {
      if (!visibleRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const now = performance.now();
      const p = propsRef.current;
      const t = (p.ambient && !reduced) ? (now - t0) * 0.001 * p.speed : 0;

      gl.useProgram(prog);
      gl.uniform2f(loc.res, canvas.width, canvas.height);
      gl.uniform1f(loc.time, t);

      const cols = (p.colors && p.colors.length) ? p.colors : DEFAULT_COLORS;
      const n = Math.min(8, cols.length);
      const flat = new Float32Array(8 * 3);
      for (let i = 0; i < n; i++) {
        const [r, g, b] = hexToRgb01(cols[i]);
        flat[i * 3] = r; flat[i * 3 + 1] = g; flat[i * 3 + 2] = b;
      }
      gl.uniform3fv(loc.cols, flat);
      gl.uniform1i(loc.cnt, n);
      gl.uniform1i(loc.gm, GRAD_MAP[p.gradient] ?? 0);
      gl.uniform1f(loc.ga, (p.gradientAngle ?? 135) * Math.PI / 180);
      gl.uniform1f(loc.ws,  p.warpStrength);
      gl.uniform1f(loc.wsc, p.warpScale);
      gl.uniform1f(loc.grn, p.grain);
      gl.uniform2f(loc.mouse, mouseRef.current[0], mouseRef.current[1]);
      gl.uniform1f(loc.inter, p.interactive ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      io.disconnect();
      root.removeEventListener("mousemove", onMove);
      gl.deleteBuffer(vbo);
      gl.deleteProgram(prog);
      glStateRef.current = null;
    };
  }, []);

  if (failed) return null;

  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: interactive ? "auto" : "none",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          opacity: ready && visible ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease`,
        }}
      />
    </div>
  );
};

export default DisplacementWarp;
