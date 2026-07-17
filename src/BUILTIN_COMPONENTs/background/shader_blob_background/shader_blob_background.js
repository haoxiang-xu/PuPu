import { useEffect, useRef, useState } from "react";

/**
 * ShaderBlobBackground
 *
 * Raymarched SDF metaballs rendered with a WebGL2 fragment shader.
 * Several primitives (spheres / boxes / tori / …) float in space, blend via
 * smooth / chamfer / hard union, and optionally fuse into a colored back
 * plane. Shading combines hemisphere ambient, Blinn-Phong specular, AO,
 * fresnel rim and subsurface wrap light for a plaster / ceramic / glass feel.
 *
 * Props (all optional):
 *  - colors           {string[]}  Hex palette for the primitives (up to 8)
 *  - count            {number}    Primitive count (2..7)
 *  - shape            {string}    sphere|box|torus|octa|capsule|hex|cyl|mix
 *  - edge             {string}    smooth|chamfer|hard
 *  - smooth           {number}    Blend radius (0..1)
 *  - speed            {number}    Motion speed (0..1)
 *  - rotation         {number}    Per-primitive self-rotation rate (0..1)
 *  - space            {number}    Z spread (0 = flush with bg, 1 = full depth)
 *  - glossy           {number}    Specular intensity / sharpness (0..1)
 *  - ao               {number}    Ambient occlusion strength (0..1)
 *  - sss              {number}    Subsurface / wrap light (0..1)
 *  - blur             {number}    CSS blur in px
 *  - lightAzimuth     {number}    Key light azimuth in deg
 *  - lightElevation   {number}    Key light elevation in deg
 *  - skyTint          {string}    Hex, hemisphere top
 *  - groundTint       {string}    Hex, hemisphere bottom
 *  - bgTop            {string}    Hex, plane gradient top
 *  - bgBottom         {string}    Hex, plane gradient bottom
 *  - bgDepth          {number}    Plane distance behind camera (1..9)
 *  - bgFuse           {boolean}   Smooth-union the plane with primitives
 *  - pixelRatio       {number}    Cap devicePixelRatio (default 2)
 *  - style, className
 */

/* { shader source } ------------------------------------------------------ */

const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0,1); }`;

const FS = `#version 300 es
precision highp float;
out vec4 frag;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;
uniform float uSmooth;
uniform int uShape;
uniform float uSpeed;
uniform float uRot;
uniform float uSpace;
uniform vec3 uColors[8];
uniform int uNumColors;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform float uBgDepth;
uniform int uBgFuse;
uniform int uBlend;
uniform vec3 uLightDir;
uniform float uGlossy;
uniform float uAO;
uniform float uSSS;
uniform vec3 uSkyTint;
uniform vec3 uGroundTint;

mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }

vec4 sminCol(vec4 a, vec4 b, float k){
  float h = clamp(0.5 + 0.5*(b.x - a.x)/k, 0.0, 1.0);
  float d = mix(b.x, a.x, h) - k*h*(1.0-h);
  vec3  c = mix(b.yzw, a.yzw, h);
  return vec4(d, c);
}
vec4 chamferCol(vec4 a, vec4 b, float k){
  float d1 = min(a.x, b.x);
  float d2 = (a.x + b.x - k) * 0.70710678;
  float d  = min(d1, d2);
  float h  = clamp(0.5 + 0.5 * (b.x - a.x) / max(k, 0.001), 0.0, 1.0);
  return vec4(d, mix(b.yzw, a.yzw, h));
}
vec4 minCol(vec4 a, vec4 b){ return a.x < b.x ? a : b; }
vec4 blendCol(vec4 a, vec4 b, float k){
  if (uBlend == 1) return chamferCol(a, b, k);
  if (uBlend == 2) return minCol(a, b);
  return sminCol(a, b, k);
}

float sdSphere(vec3 p, float r){ return length(p)-r; }
float sdBox(vec3 p, vec3 b, float r){ vec3 q = abs(p)-b; return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0) - r; }
float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz)-t.x, p.y); return length(q)-t.y; }
float sdPlane(vec3 p, vec3 n, float h){ return dot(p, n) + h; }
float sdOcta(vec3 p, float s){ p = abs(p); return (p.x+p.y+p.z-s)*0.57735027; }
float sdCapsule(vec3 p, float h, float r){ p.y -= clamp(p.y, -h, h); return length(p)-r; }
float sdHexPrism(vec3 p, vec2 h){
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;
  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z*h.x, k.z*h.x), h.x)) * sign(p.y - h.x), p.z - h.y);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}
float sdCylinder(vec3 p, float h, float r){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x,d.y),0.0) + length(max(d,0.0)); }

vec3 bgColorAt(vec3 p){
  float g = clamp(0.5 + p.y * 0.08, 0.0, 1.0);
  return mix(uBgBottom, uBgTop, g);
}

float primitive(vec3 p, int kind, float seed){
  if (kind == 0) return sdSphere(p, 0.7 + 0.2*sin(seed));
  if (kind == 1) return sdBox(p, vec3(0.6), 0.0);
  if (kind == 2) return sdTorus(p.yzx, vec2(0.55, 0.18));
  if (kind == 3) return sdOcta(p, 0.85);
  if (kind == 4) return sdCapsule(p, 0.55, 0.4);
  if (kind == 5) return sdHexPrism(p, vec2(0.55, 0.3));
  if (kind == 6) return sdCylinder(p, 0.55, 0.4);
  return sdSphere(p, 0.65);
}

vec4 mapCol(vec3 p){
  float t = uTime * uSpeed;
  vec4 res = vec4(1e5, 0.0, 0.0, 0.0);
  int nc = max(uNumColors, 1);
  for (int i=0;i<7;i++){
    if (i >= uCount) break;
    float fi = float(i);
    float zAmp    = mix(0.15, 1.6, uSpace);
    float zCenter = mix(-uBgDepth + 0.15, 0.0, uSpace);
    vec3 off = vec3(
      1.8 * sin(t*0.35 + fi*1.7),
      1.4 * cos(t*0.28 + fi*2.1),
      zCenter + zAmp * sin(t*0.22 + fi*2.8)
    );
    int kind = uShape;
    if (uShape == 7) kind = int(mod(fi, 7.0));
    float ra = t * uRot + fi * 1.7;
    vec3 rp = rotY(ra) * rotX(ra * 0.65) * (p - off);
    float dd = primitive(rp, kind, fi*1.3 + t*0.2);
    float h = fract(sin(fi*13.37 + 1.7)*4758.54);
    int ci = int(h * float(nc));
    if (ci >= nc) ci = nc - 1;
    vec3 col = uColors[ci];
    res = blendCol(res, vec4(dd, col), uSmooth);
  }
  float planeD = sdPlane(p, vec3(0.0, 0.0, 1.0), uBgDepth);
  vec3 planeCol = bgColorAt(p);
  if (uBgFuse == 1) {
    res = blendCol(res, vec4(planeD, planeCol), uSmooth);
  } else {
    if (planeD < res.x) res = vec4(planeD, planeCol);
  }
  return res;
}

float map(vec3 p){ return mapCol(p).x; }

vec3 calcNormal(vec3 p){
  float e = 0.0015;
  return normalize(vec3(
    map(p+vec3(e,0,0)) - map(p-vec3(e,0,0)),
    map(p+vec3(0,e,0)) - map(p-vec3(0,e,0)),
    map(p+vec3(0,0,e)) - map(p-vec3(0,0,e))
  ));
}

float calcAO(vec3 p, vec3 n){
  float ao = 0.0;
  float sca = 1.0;
  for (int i=0;i<5;i++){
    float h = 0.012 + 0.14 * float(i);
    float d = map(p + n * h);
    ao += (h - d) * sca;
    sca *= 0.78;
  }
  return clamp(1.0 - 1.8 * ao, 0.0, 1.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, 4.5);
  vec3 rd = normalize(vec3(uv, -1.3));

  float sg = clamp(0.5 + uv.y * 0.7, 0.0, 1.0);
  vec3 col = mix(uBgBottom, uBgTop, sg);

  float t = 0.0;
  float hit = -1.0;
  float maxDist = uBgDepth + 10.0;
  for (int i=0; i<120; i++){
    vec3 p = ro + rd*t;
    float d = map(p);
    if (d < 0.002){ hit = t; break; }
    if (t > maxDist) break;
    t += d * 0.9;
  }

  if (hit > 0.0){
    vec3 p = ro + rd*hit;
    vec3 n = calcNormal(p);
    vec3 base = mapCol(p).yzw;
    vec3 v = -rd;
    vec3 l = normalize(uLightDir);
    vec3 hv = normalize(l + v);

    float ndl = max(dot(n, l), 0.0);
    float ndv = max(dot(n, v), 0.0);
    float ndh = max(dot(n, hv), 0.0);

    float wrap = uSSS * 0.75;
    float ndl_wrap = max((dot(n, l) + wrap) / (1.0 + wrap), 0.0);
    float backLit = pow(max(dot(-l, v), 0.0), 3.0) * uSSS * 0.55;

    vec3 fillDir = normalize(vec3(-l.x*0.7, -l.y*0.4, abs(l.z)*0.6 + 0.2));
    float ndfill = max(dot(n, fillDir), 0.0);

    float hemi = 0.5 + 0.5 * n.y;
    vec3 ambient = mix(uGroundTint, uSkyTint, hemi);

    float ao = mix(1.0, calcAO(p, n), uAO);
    float fresnel = pow(1.0 - ndv, 5.0);
    float shininess = mix(10.0, 140.0, uGlossy);
    float spec = pow(ndh, shininess) * ndl;
    float specAmp = mix(0.15, 0.9, uGlossy);

    float diffMix = mix(ndl, ndl_wrap, uSSS);
    col  = base * ambient * (0.28 + 0.72 * ao);
    col += base * diffMix * mix(0.55, 0.42, uSSS);
    col += base * ndfill * 0.12;
    col += base * backLit;
    col += vec3(spec) * specAmp * (1.0 - uSSS * 0.5);
    col += mix(base, vec3(1.0), 0.6) * fresnel * mix(0.18, 0.45, uGlossy);
  }

  frag = vec4(col, 1.0);
}`;

/* { helpers } ------------------------------------------------------------ */

const hexToRgb = (hex) => {
  const h = (hex || "#000000").replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h.padEnd(6, "0");
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ];
};

const SHAPE_MAP = { sphere: 0, box: 1, torus: 2, octa: 3, capsule: 4, hex: 5, cyl: 6, mix: 7 };
const EDGE_MAP  = { smooth: 0, chamfer: 1, hard: 2 };

/* { component } ---------------------------------------------------------- */

const DEFAULT_COLORS = ["#b9c4d4", "#9fb1c8", "#d2c9d9"];

const ShaderBlobBackground = ({
  colors        = DEFAULT_COLORS,
  count         = 4,
  shape         = "mix",
  edge          = "smooth",
  smooth        = 0.6,
  speed         = 0.35,
  rotation      = 0.4,
  space         = 1,
  glossy        = 0.55,
  ao            = 0.8,
  sss           = 0.5,
  blur          = 0,
  lightAzimuth     = 30,
  lightElevation   = 50,
  skyTint       = "#eef3fa",
  groundTint    = "#585264",
  bgTop         = "#ffffff",
  bgBottom      = "#ffffff",
  bgDepth       = 1,
  bgFuse        = true,
  pixelRatio    = 2,
  fadeMs        = 500,
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
  const [ready, setReady]   = useState(false);
  const [visible, setVisible] = useState(true);
  const [failed, setFailed] = useState(false);

  // keep props accessible inside the raf loop without re-creating it
  propsRef.current = {
    colors, count, shape, edge, smooth, speed, rotation, space,
    glossy, ao, sss, lightAzimuth, lightElevation,
    skyTint, groundTint, bgTop, bgBottom, bgDepth, bgFuse, pixelRatio,
  };

  /* initialize GL — once */
  useEffect(() => {
    const canvas = canvasRef.current;
    const root   = rootRef.current;
    if (!canvas || !root) return;

    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) { setFailed(true); return; }

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
      gl.attachShader(prog, compile(gl.VERTEX_SHADER,   VS));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
        setFailed(true);
        return;
      }
    } catch (err) {
      console.error(err);
      setFailed(true);
      return;
    }
    gl.useProgram(prog);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const ploc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(ploc);
    gl.vertexAttribPointer(ploc, 2, gl.FLOAT, false, 0, 0);

    const loc = (name) => gl.getUniformLocation(prog, name);
    const U = {
      uRes: loc("uRes"), uTime: loc("uTime"), uCount: loc("uCount"),
      uSmooth: loc("uSmooth"), uShape: loc("uShape"), uSpeed: loc("uSpeed"),
      uRot: loc("uRot"), uSpace: loc("uSpace"),
      uColors: loc("uColors[0]"), uNumColors: loc("uNumColors"),
      uBgTop: loc("uBgTop"), uBgBottom: loc("uBgBottom"),
      uBgDepth: loc("uBgDepth"), uBgFuse: loc("uBgFuse"),
      uBlend: loc("uBlend"), uLightDir: loc("uLightDir"),
      uGlossy: loc("uGlossy"), uAO: loc("uAO"), uSSS: loc("uSSS"),
      uSkyTint: loc("uSkyTint"), uGroundTint: loc("uGroundTint"),
    };

    glStateRef.current = { gl, U, prog, vbo };

    const resize = () => {
      const p = propsRef.current;
      const pr = Math.min(p.pixelRatio ?? 2, window.devicePixelRatio || 1);
      const w  = Math.max(1, Math.round(root.clientWidth  * pr));
      const h  = Math.max(1, Math.round(root.clientHeight * pr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(root);
    resize();

    // Pause the render loop when the element is off-screen.
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = entry.isIntersecting;
        visibleRef.current = v;
        setVisible(v);
      },
      { rootMargin: "200px", threshold: 0.01 },
    );
    io.observe(root);

    const start = performance.now();
    const loop = () => {
      if (!visibleRef.current) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const p = propsRef.current;
      const t = (performance.now() - start) / 1000;

      resize();
      gl.uniform1f(U.uTime, t);
      gl.uniform1i(U.uCount, p.count | 0);
      gl.uniform1f(U.uSmooth, p.smooth);
      gl.uniform1i(U.uShape, SHAPE_MAP[p.shape] ?? 7);
      gl.uniform1f(U.uSpeed, p.speed);
      gl.uniform1f(U.uRot, p.rotation);
      gl.uniform1f(U.uSpace, p.space);
      gl.uniform1i(U.uBlend, EDGE_MAP[p.edge] ?? 0);
      gl.uniform1f(U.uBgDepth, p.bgDepth);
      gl.uniform1i(U.uBgFuse, p.bgFuse ? 1 : 0);
      gl.uniform1f(U.uGlossy, p.glossy);
      gl.uniform1f(U.uAO, p.ao);
      gl.uniform1f(U.uSSS, p.sss);

      // palette
      const palette = p.colors && p.colors.length ? p.colors : DEFAULT_COLORS;
      const n = Math.min(8, palette.length);
      const buf = new Float32Array(8 * 3);
      for (let i = 0; i < n; i++) {
        const [r, g, b] = hexToRgb(palette[i]);
        buf[i*3] = r; buf[i*3+1] = g; buf[i*3+2] = b;
      }
      gl.uniform3fv(U.uColors, buf);
      gl.uniform1i(U.uNumColors, Math.max(1, n));

      // bg tint
      {
        const [r,g,b] = hexToRgb(p.bgTop);    gl.uniform3f(U.uBgTop, r, g, b);
        const [br,bg,bb] = hexToRgb(p.bgBottom); gl.uniform3f(U.uBgBottom, br, bg, bb);
        const [sr,sg,sb] = hexToRgb(p.skyTint);   gl.uniform3f(U.uSkyTint, sr, sg, sb);
        const [gr,gg,gb] = hexToRgb(p.groundTint); gl.uniform3f(U.uGroundTint, gr, gg, gb);
      }

      // light
      {
        const az = (p.lightAzimuth   ?? 0) * Math.PI / 180;
        const el = (p.lightElevation ?? 0) * Math.PI / 180;
        const ce = Math.cos(el);
        gl.uniform3f(U.uLightDir, Math.cos(az) * ce, Math.sin(el), Math.sin(az) * ce);
      }

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
        pointerEvents: "none",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          filter: blur ? `blur(${blur}px)` : undefined,
          opacity: ready && visible ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease, filter .2s`,
        }}
      />
    </div>
  );
};

export default ShaderBlobBackground;
