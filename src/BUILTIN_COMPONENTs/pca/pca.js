import { useContext, useMemo } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import { Scatter } from "../scatter";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Pure-JS PCA — gram matrix + power iteration                           */
/*                                                                         */
/*  Works entirely in the browser with zero dependencies.                  */
/*  Suitable for n < 2000 points, any dimensionality p.                   */
/*                                                                         */
/*  Algorithm:                                                             */
/*    1. Center X  (n × p)                                                 */
/*    2. Build gram matrix  G = X Xᵀ  (n × n)                             */
/*    3. Extract top-2 eigenvectors of G via power iteration + deflation   */
/*    4. Scores = uᵢ · √λᵢ  (these are the PCA coordinates)              */
/*    5. Report explained variance = λᵢ / tr(G)                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Math helpers ────────────────────────────────────────────────────── */

function _dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function _norm(v) {
  return Math.sqrt(_dot(v, v));
}

function _mat_vec(M, v) {
  return M.map((row) => _dot(row, v));
}

/* Seeded random for reproducible initial vectors */
function _seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646 - 0.5;
  };
}

/* ── Power iteration (single eigenvector) ────────────────────────────── */

function _power_iter(M, n_iter, seed) {
  const rand = _seeded(seed);
  let v = Array.from({ length: M.length }, rand);
  let n = _norm(v);
  v = v.map((x) => x / n);

  for (let i = 0; i < n_iter; i++) {
    const Mv = _mat_vec(M, v);
    const norm_i = _norm(Mv);
    if (norm_i < 1e-12) break;
    v = Mv.map((x) => x / norm_i);
  }

  const lambda = _dot(v, _mat_vec(M, v));
  return { v, lambda };
}

/* ── Core PCA: n × p data → 2D coordinates ──────────────────────────── */

function _pca_2d(data, n_iter = 300) {
  const n = data.length;
  const p = data[0].length;

  if (n < 2 || p < 2) {
    return { coords: data.map(() => [0, 0]), variance: [0, 0] };
  }

  /* ── Center ── */
  const mean = new Array(p).fill(0);
  for (const v of data) for (let j = 0; j < p; j++) mean[j] += v[j];
  for (let j = 0; j < p; j++) mean[j] /= n;
  const X = data.map((v) => v.map((x, j) => x - mean[j]));

  /* ── Gram matrix G = X Xᵀ  (n × n) ── */
  const G = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => _dot(X[i], X[j])),
  );

  /* trace of G = total variance */
  let total = 0;
  for (let i = 0; i < n; i++) total += G[i][i];

  /* ── PC1 ── */
  const { v: u1, lambda: l1 } = _power_iter(G, n_iter, 42);

  /* ── Deflate: G₂ = G - λ₁ u₁ u₁ᵀ ── */
  const G2 = G.map((row, i) =>
    row.map((val, j) => val - l1 * u1[i] * u1[j]),
  );

  /* ── PC2 ── */
  const { v: u2, lambda: l2 } = _power_iter(G2, n_iter, 137);

  /* ── Scores ── */
  const s1 = Math.sqrt(Math.max(0, l1));
  const s2 = Math.sqrt(Math.max(0, l2));

  const coords = Array.from({ length: n }, (_, i) => [
    u1[i] * s1,
    u2[i] * s2,
  ]);

  const variance = [
    total > 0 ? l1 / total : 0,
    total > 0 ? l2 / total : 0,
  ];

  return { coords, variance };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  usePCA hook                                                            */
/*                                                                         */
/*  vectors   — number[][]   raw high-dimensional embeddings              */
/*  metadata  — object[]     one entry per vector; merged into each point */
/*                                                                         */
/*  Returns { points, variance }                                           */
/*    points   — ready for <Scatter>: [{id, x, y, ...meta}]              */
/*    variance — [pc1_ratio, pc2_ratio]  (0-1)                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function usePCA(vectors, metadata = []) {
  return useMemo(() => {
    if (!vectors || vectors.length === 0) {
      return { points: [], variance: [0, 0] };
    }

    const { coords, variance } = _pca_2d(vectors);

    const points = coords.map(([x, y], i) => ({
      id: metadata[i]?.id ?? `pt_${i}`,
      x,
      y,
      ...metadata[i],
    }));

    return { points, variance };
  }, [vectors, metadata]);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Explained-variance bar                                                 */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function VarianceBar({ variance, isDark }) {
  const pct1 = (variance[0] * 100).toFixed(1);
  const pct2 = (variance[1] * 100).toFixed(1);
  const total = variance[0] + variance[1];
  const fill1 = variance[0] / Math.max(total, 0.01);
  const fill2 = variance[1] / Math.max(total, 0.01);

  const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const col1 = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";
  const col2 = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
  const text = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Labels */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {[
          { label: "PC1", pct: pct1 },
          { label: "PC2", pct: pct2 },
        ].map(({ label, pct }) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
              color: text,
            }}
          >
            {label} {pct}%
          </span>
        ))}
      </div>

      {/* Bar */}
      <div
        style={{
          width: 120,
          height: 4,
          borderRadius: 2,
          backgroundColor: bg,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${fill1 * 100}%`,
            height: "100%",
            backgroundColor: col1,
            transition: "width 0.4s cubic-bezier(0.32,1,0.32,1)",
          }}
        />
        <div
          style={{
            width: `${fill2 * 100}%`,
            height: "100%",
            backgroundColor: col2,
            transition: "width 0.4s cubic-bezier(0.32,1,0.32,1)",
          }}
        />
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  PCAScatter                                                             */
/*                                                                         */
/*  Drop-in: accepts raw high-dim vectors + metadata,                     */
/*  runs PCA internally, renders <Scatter> + variance overlay.            */
/*                                                                         */
/*  Props                                                                  */
/*    vectors      number[][]   high-dimensional embeddings               */
/*    metadata     object[]     per-vector metadata (merged into points)  */
/*    color_by     string|fn    passed through to <Scatter>               */
/*    point_size   number                                                  */
/*    show_legend  bool                                                    */
/*    show_variance bool        show PC1/PC2 explained-variance overlay   */
/*    on_point_click  fn                                                   */
/*    on_point_hover  fn                                                   */
/*    style        object                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function PCAScatter({
  vectors = [],
  metadata = [],
  color_by = "group",
  point_size = 9,
  show_legend = true,
  show_variance = true,
  on_point_click,
  on_point_hover,
  style,
}) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const { points, variance } = usePCA(vectors, metadata);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      <Scatter
        points={points}
        color_by={color_by}
        point_size={point_size}
        show_legend={show_legend}
        on_point_click={on_point_click}
        on_point_hover={on_point_hover}
        style={style}
      />

      {/* ── Explained variance overlay ── */}
      {show_variance && variance[0] > 0 && (
        <VarianceBar variance={variance} isDark={isDark} />
      )}
    </div>
  );
}

export { PCAScatter as default, PCAScatter };
