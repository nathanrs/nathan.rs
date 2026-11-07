/*
  Visuals for "Eliminating Nondeterminism in LLM Inference with Integer-Only
  Arithmetic".

  One ES module, auto-loaded by the post's `hero` frontmatter. It drives the
  hero canvas ([data-hero-canvas]) and every inline animation ([data-anim]).

  Everything numerical in here is computed live and honestly:
    - the float reductions use Math.fround, so every partial sum is a genuine
      IEEE-754 single-precision result, rounding included;
    - the integer reductions are exact (all values are far below 2^53);
    - the hero plays back real per-step distributions (detllm-hero.json),
      recorded by re-running scripts/demo.py's configs with every step's
      logits kept instead of only hashed.

  Shared visual grammar:
    cool (steel blue) = integer / identical / deterministic
    warm (amber -> red) = floating point / rounding / divergence
*/

// ---- shared helpers ---------------------------------------------------------

function colors() {
  const s = getComputedStyle(document.documentElement);
  const v = (n, f) => s.getPropertyValue(n).trim() || f;
  return {
    bg: v("--body-background", "#ffffff"),
    fg: v("--body-font-color", "#2c2724"),
    mute: v("--gray-500", "#b0aba5"),
    line: v("--gray-200", "#ece9e4"),
    soft: v("--gray-100", "#f9f9f9"),
  };
}

const COOL = [91, 138, 166];
const MID = [224, 168, 63];
const HOT = [216, 101, 75];

function rgb(c, a) {
  return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
function mixc(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
function heat(t) {
  t = Math.max(0, Math.min(1, t));
  return rgb(t < 0.5 ? mixc(COOL, MID, t / 0.5) : mixc(MID, HOT, (t - 0.5) / 0.5));
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
}

// deterministic per-step jitter so flicker is stable within a frame
function hash(n) {
  const x = Math.sin(n * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
}

const SANS = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const SANS_B = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const MONO = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const MONO_S = "10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// generic canvas runner: heightFor(W) sets the wrapped height, render draws a frame
function run(canvas, heightFor, render) {
  const ctx = canvas.getContext("2d");
  let W = 0,
    H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, canvas.clientWidth || canvas.getBoundingClientRect().width || 600);
    H = heightFor(W, ctx);
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  requestAnimationFrame(function frame(now) {
    ctx.clearRect(0, 0, W, H);
    render(ctx, W, H, now);
    requestAnimationFrame(frame);
  });
}

function legend(ctx, items, cx, y, C) {
  ctx.font = SANS;
  ctx.textBaseline = "middle";
  const sw = 11,
    g = 6,
    pad = 16;
  const ws = items.map((it) => sw + g + ctx.measureText(it.label).width);
  const total = ws.reduce((a, b) => a + b, 0) + pad * (items.length - 1);
  let x = cx - total / 2;
  items.forEach((it, i) => {
    if (it.outline) {
      ctx.strokeStyle = C.mute;
      ctx.lineWidth = 1.5;
      rrect(ctx, x, y - sw / 2, sw, sw, 3);
      ctx.stroke();
    } else {
      ctx.fillStyle = it.c;
      rrect(ctx, x, y - sw / 2, sw, sw, 3);
      ctx.fill();
    }
    ctx.fillStyle = C.mute;
    ctx.textAlign = "left";
    ctx.fillText(it.label, x + sw + g, y + 1);
    x += ws[i] + pad;
  });
}

function label(ctx, text, x, y, color, font, align) {
  ctx.font = font || SANS;
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

// a value chip: rounded box with centered text
function chip(ctx, x, y, w, h, text, o) {
  o = o || {};
  rrect(ctx, x, y, w, h, o.r || 6);
  if (o.fill) {
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.stroke) {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.lw || 1.5;
    ctx.stroke();
  }
  if (text !== undefined && text !== null) {
    ctx.font = o.font || MONO;
    ctx.fillStyle = o.color || "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  }
}

function arrow(ctx, x0, y0, x1, y1, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const my = (y0 + y1) / 2;
  ctx.bezierCurveTo(x0, my, x1, my, x1, y1);
  ctx.stroke();
  // head
  const a = Math.atan2(y1 - my, x1 - x1 + 0.0001);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - 4, y1 - 6);
  ctx.lineTo(x1 + 4, y1 - 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  void a;
}

const neg = (s) => String(s).replace("-", "−");

// ---- the numbers ------------------------------------------------------------
// Eight fp32 values whose exact sum is 4.75. Their magnitudes are contrived
// (2^24 is where fp32 stops being able to represent odd integers), but that is
// the whole point: it makes the rounding visible in a handful of adds instead of
// a billion.
const F_VALS = [16777216, 1, 1, 1, 1, -16777216, 0.5, 0.25];
// the same values scaled by 4 so they are integers; exact sum 19
const I_VALS = F_VALS.map((v) => v * 4);

const fadd = (a, b) => Math.fround(a + b);
const iadd = (a, b) => a + b;

// sequential left-to-right reduction, returns every partial sum
function seqTrace(vals, add) {
  const out = [vals[0]];
  for (let i = 1; i < vals.length; i++) out.push(add(out[i - 1], vals[i]));
  return out;
}

// ---- 1 & 2. two devices, two reduction orders --------------------------------
// GPU A sums left to right. GPU B splits the reduction in two halves (as a
// split-K kernel would), sums each, then combines. Float: different answers.
// Integer: the same.

function orderAnim(canvas, isInt) {
  const vals = isInt ? I_VALS : F_VALS;
  const add = isInt ? iadd : fadd;
  const N = vals.length;
  const STEP = 720,
    HOLD = 5;
  const half = N / 2;
  const A = seqTrace(vals, add); // A[k] = running sum after consuming k
  const B1 = seqTrace(vals.slice(0, half), add);
  const B2 = seqTrace(vals.slice(half), add);
  const Bfinal = add(B1[half - 1], B2[half - 1]);
  const same = A[N - 1] === Bfinal;

  const TITLE = 22,
    CH = 30,
    GAPY = 26,
    ARROWH = 30,
    PAD_P = 18,
    CAP = 30,
    TOP = 8;
  const cols = (W) => (W < 520 ? 4 : 8);
  const leavesH = (W) => {
    const rows = N / cols(W);
    return rows * CH + (rows - 1) * 8;
  };
  const panelH = (W) => TITLE + 6 + leavesH(W) + ARROWH + CH + GAPY + CH + 8;

  run(
    canvas,
    (W) => TOP + panelH(W) * 2 + PAD_P + CAP,
    (ctx, W, H, now) => {
      const C = colors();
      const c = cols(W);
      const cw = Math.min(96, (W - 24 - (c - 1) * 8) / c);
      const gridW = c * cw + (c - 1) * 8;
      const gx = (W - gridW) / 2;

      const cycle = N + HOLD;
      const step = Math.floor(now / STEP) % cycle; // step k consumes leaf k
      const tIn = (now % STEP) / STEP;
      const doneAll = step >= N - 1;

      const leafPos = (i) => {
        const r = Math.floor(i / c),
          k = i % c;
        return { x: gx + k * (cw + 8), y: r * (CH + 8) };
      };

      function panel(py, title, mode) {
        label(ctx, title, gx, py + TITLE / 2, C.fg, SANS_B);
        const ly = py + TITLE + 6;
        // which leaves are consumed so far in this mode
        const consumed = (i) => {
          if (mode === "A") return i <= step;
          const k = i < half ? i : i - half;
          return k <= step;
        };
        const active = (i) => {
          if (mode === "A") return i === step;
          const k = i < half ? i : i - half;
          return k === step && step < half;
        };
        for (let i = 0; i < N; i++) {
          const p = leafPos(i);
          const on = consumed(i);
          const act = active(i);
          const grp = mode === "B" ? (i < half ? 0 : 1) : -1;
          const tint = isInt ? COOL : HOT;
          chip(ctx, p.x, ly + p.y, cw, CH, neg(vals[i]), {
            fill: act ? rgb(tint, 0.22) : on ? rgb(tint, 0.1) : C.soft,
            stroke: act ? rgb(tint) : grp === 1 && mode === "B" ? C.mute : C.line,
            lw: act ? 2 : 1.2,
            color: on ? C.fg : C.mute,
            font: cw < 70 ? MONO_S : MONO,
          });
        }
        // split bracket under the two halves for B
        const accY = ly + leavesH(W) + ARROWH;
        const accW = Math.min(170, gridW * 0.42);
        const resY = accY + CH + GAPY;
        if (mode === "A") {
          const ax = W / 2 - accW / 2;
          const k = Math.min(step, N - 1);
          const src = leafPos(k);
          arrow(ctx, src.x + cw / 2, ly + src.y + CH, W / 2, accY, isInt ? rgb(COOL) : rgb(HOT), 0.6);
          const exact = k === 0 ? vals[0] : A[k - 1] + vals[k];
          const rounded = !isInt && exact !== A[k];
          chip(ctx, ax, accY, accW, CH, neg(A[k]), {
            fill: C.soft,
            stroke: isInt ? rgb(COOL) : rgb(HOT),
            color: C.fg,
          });
          label(ctx, "running sum", ax - 10, accY + CH / 2, C.mute, SANS, "right");
          if (rounded && step < N) {
            ctx.globalAlpha = 1 - tIn * 0.6;
            label(ctx, "rounded", ax + accW + 10, accY + CH / 2, rgb(HOT), SANS, "left");
            ctx.globalAlpha = 1;
          }
          // result
          const show = doneAll;
          chip(ctx, ax, resY, accW, CH, show ? neg(A[N - 1]) : "", {
            fill: show ? (isInt ? rgb(COOL, 0.16) : same ? rgb(COOL, 0.16) : rgb(HOT, 0.16)) : C.soft,
            stroke: show ? (isInt || same ? rgb(COOL) : rgb(HOT)) : C.line,
            color: C.fg,
            font: "600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          });
          label(ctx, "result", ax - 10, resY + CH / 2, C.mute, SANS, "right");
        } else {
          const gap = 18;
          const ax1 = W / 2 - gap / 2 - accW;
          const ax2 = W / 2 + gap / 2;
          const k = Math.min(step, half - 1);
          const s1 = leafPos(k),
            s2 = leafPos(half + k);
          const col = isInt ? rgb(COOL) : rgb(HOT);
          arrow(ctx, s1.x + cw / 2, ly + s1.y + CH, ax1 + accW / 2, accY, col, 0.6);
          arrow(ctx, s2.x + cw / 2, ly + s2.y + CH, ax2 + accW / 2, accY, col, 0.6);
          const e1 = k === 0 ? vals[0] : B1[k - 1] + vals[k];
          const e2 = k === 0 ? vals[half] : B2[k - 1] + vals[half + k];
          chip(ctx, ax1, accY, accW, CH, neg(B1[k]), { fill: C.soft, stroke: col, color: C.fg });
          chip(ctx, ax2, accY, accW, CH, neg(B2[k]), { fill: C.soft, stroke: col, color: C.fg });
          if (ax1 - 12 > 84) label(ctx, "partial sums", ax1 - 10, accY + CH / 2, C.mute, SANS, "right");
          else label(ctx, "partial sums", ax1, accY - 9, C.mute, SANS, "left");
          if (!isInt && step < half) {
            ctx.globalAlpha = 1 - tIn * 0.6;
            if (e1 !== B1[k]) label(ctx, "rounded", ax1 + accW / 2, accY + CH + 11, rgb(HOT), SANS, "center");
            if (e2 !== B2[k]) label(ctx, "rounded", ax2 + accW / 2, accY + CH + 11, rgb(HOT), SANS, "center");
            ctx.globalAlpha = 1;
          }
          const combining = step >= half;
          const ax = W / 2 - accW / 2;
          if (combining) {
            arrow(ctx, ax1 + accW / 2, accY + CH, W / 2 - 6, resY, col, 0.6);
            arrow(ctx, ax2 + accW / 2, accY + CH, W / 2 + 6, resY, col, 0.6);
          }
          chip(ctx, ax, resY, accW, CH, combining ? neg(Bfinal) : "", {
            fill: combining ? (isInt || same ? rgb(COOL, 0.16) : rgb(HOT, 0.16)) : C.soft,
            stroke: combining ? (isInt || same ? rgb(COOL) : rgb(HOT)) : C.line,
            color: C.fg,
            font: "600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          });
          label(ctx, "result", ax - 10, resY + CH / 2, C.mute, SANS, "right");
        }
      }

      const ph = panelH(W);
      panel(TOP, isInt ? "GPU A, integers: left to right" : "GPU A: adds left to right", "A");
      // divider
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, TOP + ph + PAD_P / 2);
      ctx.lineTo(gx + gridW, TOP + ph + PAD_P / 2);
      ctx.stroke();
      panel(
        TOP + ph + PAD_P,
        isInt ? "GPU B, integers: two partial sums, then combine" : "GPU B: two partial sums, then combine",
        "B",
      );

      // verdict
      const vy = H - CAP / 2;
      if (doneAll) {
        const txt = isInt
          ? `${neg(A[N - 1])} = ${neg(Bfinal)}   same bits, any order`
          : same
            ? `${neg(A[N - 1])} = ${neg(Bfinal)}`
            : `${neg(A[N - 1])} ≠ ${neg(Bfinal)}   same inputs, different answer`;
        label(ctx, txt, W / 2, vy, isInt || same ? rgb(COOL) : rgb(HOT), SANS_B, "center");
      } else {
        label(
          ctx,
          isInt ? "exact sum is 19" : "exact sum is 4.75 (fp32, every add rounds)",
          W / 2,
          vy,
          C.mute,
          SANS,
          "center",
        );
      }
    },
  );
}

// ---- 3. batch variance -----------------------------------------------------
// Your request is one row of a matmul. How many other rows share the batch
// decides which kernel the library picks, and the kernel decides how the K
// dimension is split. Three batch sizes, side by side: same row, same values,
// three splits, three different fp32 outputs.

function batchAnim(canvas) {
  const K = F_VALS.length;
  const ROWS = [
    { b: 1, g: 4 },
    { b: 4, g: 2 },
    { b: 8, g: 1 },
  ].map((r) => {
    const per = K / r.g;
    const traces = [];
    for (let i = 0; i < r.g; i++) traces.push(seqTrace(F_VALS.slice(i * per, (i + 1) * per), fadd));
    const result = seqTrace(traces.map((t) => t.at(-1)), fadd).at(-1);
    return { ...r, per, traces, result };
  });
  const STEP = 620,
    LEAF_STEPS = K,
    HOLD = 6;
  const CYCLE = LEAF_STEPS + 1 + HOLD;

  const TOP = 8,
    TITLE = 20,
    CELLH = 26,
    BRK = 16,
    PARTH = 24,
    ROWGAP = 22,
    FOOT = 50;
  const rowH = TITLE + CELLH + BRK + PARTH;
  const short = (v) => (v === 16777216 ? "2²⁴" : v === -16777216 ? "−2²⁴" : neg(v));
  // values within a few of ±2^24, written relative to it when space is tight
  const compact = (v) => {
    const P = 16777216;
    if (Math.abs(Math.abs(v) - P) > 8) return short(v);
    const d = Math.abs(v) - P;
    const base = v < 0 ? "−2²⁴" : "2²⁴";
    return d === 0 ? base : v < 0 ? `${neg(-d)}${base}`.replace("−−", "") : `${base}+${d}`;
  };

  run(
    canvas,
    () => TOP + ROWS.length * rowH + (ROWS.length - 1) * ROWGAP + FOOT,
    (ctx, W, H, now) => {
      const C = colors();
      const narrow = W < 560;
      const step = Math.floor(now / STEP) % CYCLE; // leaves consumed so far, per group
      const glyphW = narrow ? 26 : 44;
      const resW = narrow ? 58 : 84;
      const lx = glyphW + (narrow ? 12 : 22);
      const areaW = W - lx - resW - (narrow ? 22 : 34);
      const cellG = 4,
        grpG = narrow ? 10 : 14;
      const cellW = (areaW - 3 * grpG - 4 * cellG) / K;
      const leafFont = cellW < 46 ? "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : MONO_S;
      const fmtLeaf = cellW < 62 ? short : neg;
      const resX = W - resW;
      const done = step >= LEAF_STEPS;

      ROWS.forEach((R, ri) => {
        const y0 = TOP + ri * (rowH + ROWGAP);
        const cy = y0 + TITLE;
        // title: batch size and the kernel it gets
        label(ctx, `batch of ${R.b}`, 0, y0 + TITLE / 2 - 2, C.fg, SANS_B);
        ctx.font = SANS_B;
        const tw = ctx.measureText(`batch of ${R.b}`).width;
        label(ctx, R.g === 1 ? "→ one pass over K" : `→ split-K ×${R.g}`, tw + 8, y0 + TITLE / 2 - 2, C.mute, SANS);

        // batch glyph: 8 slots, yours on top
        const slotH = (CELLH + BRK + PARTH - 7 * 2) / 8;
        for (let s = 0; s < 8; s++) {
          const sy = cy + s * (slotH + 2);
          if (s >= R.b) {
            ctx.strokeStyle = C.line;
            ctx.setLineDash([2, 3]);
            ctx.lineWidth = 1;
            rrect(ctx, 0.5, sy + 0.5, glyphW - 1, slotH - 1, 2);
            ctx.stroke();
            ctx.setLineDash([]);
          } else {
            ctx.fillStyle = s === 0 ? rgb(COOL) : C.line;
            rrect(ctx, 0, sy, glyphW, slotH, 2);
            ctx.fill();
          }
        }

        // your row's values, spaced into the kernel's groups
        const xOf = (i) => lx + i * (cellW + cellG) + Math.floor(i / R.per) * (grpG - cellG);
        for (let i = 0; i < K; i++) {
          const k = i % R.per;
          const on = k <= step;
          const act = k === step && !done;
          chip(ctx, xOf(i), cy, cellW, CELLH, fmtLeaf(F_VALS[i]), {
            r: 4,
            fill: act ? rgb(COOL, 0.24) : on ? rgb(COOL, 0.1) : C.soft,
            stroke: act ? rgb(COOL) : C.line,
            lw: act ? 1.6 : 1,
            color: on ? C.fg : C.mute,
            font: leafFont,
          });
        }

        // brackets + partial sums
        const by = cy + CELLH + 5;
        const py = by + BRK - 4;
        const partEnds = [];
        for (let g = 0; g < R.g; g++) {
          const a = xOf(g * R.per),
            b = xOf((g + 1) * R.per - 1) + cellW;
          ctx.strokeStyle = C.mute;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a + 1, by);
          ctx.lineTo(a + 1, by + 4);
          ctx.lineTo(b - 1, by + 4);
          ctx.lineTo(b - 1, by);
          ctx.stroke();
          const k = Math.min(step, R.per - 1);
          const v = R.traces[g][k];
          ctx.font = MONO_S;
          const txt = ctx.measureText(short(v)).width > b - a - 8 ? compact(v) : short(v);
          chip(ctx, a, py, b - a, PARTH - 4, txt, {
            r: 4,
            fill: C.soft,
            stroke: C.mute,
            lw: 1,
            color: C.fg,
            font: (b - a) / 9 < 6.4 ? "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : MONO_S,
          });
          partEnds.push(b);
        }

        // combine -> result
        const combined = step >= R.per;
        const ry = cy + (CELLH + BRK + PARTH) / 2 - 15;
        const last = partEnds[partEnds.length - 1];
        const midY = py + (PARTH - 4) / 2;
        ctx.strokeStyle = combined ? C.mute : C.line;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(last + 4, midY);
        ctx.lineTo(resX - 6, ry + 15);
        ctx.stroke();
        ctx.fillStyle = combined ? C.mute : C.line;
        ctx.beginPath();
        ctx.moveTo(resX - 2, ry + 15);
        ctx.lineTo(resX - 8, ry + 11.5);
        ctx.lineTo(resX - 8, ry + 18.5);
        ctx.fill();

        // no result is "the right one" (exact is 4.75), so all three stay neutral
        chip(ctx, resX, ry, resW, 30, combined ? neg(R.result) : "", {
          fill: C.soft,
          stroke: combined ? C.fg : C.line,
          lw: 1.4,
          color: C.fg,
          font: "600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        });
        if (ri === 0) label(ctx, "your output", W, y0 + TITLE / 2 - 2, C.mute, SANS, "right");
      });

      // verdict
      const vy = H - FOOT + 22;
      if (done) {
        label(
          ctx,
          `same row, three batch sizes: ${ROWS.map((r) => neg(r.result)).join(", ")}`,
          W / 2,
          vy,
          rgb(HOT),
          SANS_B,
          "center",
        );
      } else {
        label(ctx, "same eight fp32 values in every row; exact sum 4.75", W / 2, vy, C.mute, SANS, "center");
      }
      legend(
        ctx,
        [
          { c: rgb(COOL), label: "your request" },
          { c: C.line, label: "other requests" },
        ],
        W / 2,
        H - 10,
        C,
      );
    },
  );
}

// ---- 4. integer storage is not integer arithmetic ---------------------------
// Two lanes of a transformer block. A typical int8 (W8A8) stack keeps the
// GEMMs in integers but dequantizes to float for every non-linear op, and each
// float island is a place where reduction order leaks back in. DetLLM has no
// islands.

function pipelineAnim(canvas) {
  const STAGES = [
    { t: "GEMM", s: "GEMM", int: true },
    { t: "RMSNorm", s: "norm", int: false },
    { t: "GEMM", s: "GEMM", int: true },
    { t: "softmax", s: "smax", int: false },
    { t: "GEMM", s: "GEMM", int: true },
    { t: "SwiGLU", s: "act", int: false },
    { t: "GEMM", s: "GEMM", int: true },
  ];
  const PERIOD = 5200;
  const TOP = 8,
    TITLE = 22,
    BH = 34,
    LANEG = 26,
    CAP = 30;
  const laneH = TITLE + 14 + BH + 22;
  run(
    canvas,
    () => TOP + laneH * 2 + LANEG + CAP,
    (ctx, W, H, now) => {
      const C = colors();
      const n = STAGES.length;
      const gap = Math.max(10, Math.min(22, W * 0.03));
      const bw = (W - 24 - (n - 1) * gap) / n;
      const x0 = 12;
      const ph = (now % PERIOD) / PERIOD;
      const px = x0 + ph * (W - 24);
      const small = bw < 62;

      function lane(y, title, allInt) {
        label(ctx, title, x0, y + TITLE / 2, C.fg, SANS_B);
        const by = y + TITLE + 14;
        const ry = by + BH + 10; // rail runs under the boxes
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0, ry);
        ctx.lineTo(W - 12, ry);
        ctx.stroke();
        for (let i = 0; i < n; i++) {
          const s = STAGES[i];
          const isInt = allInt || s.int;
          const bx = x0 + i * (bw + gap);
          const inside = px > bx && px < bx + bw;
          const tint = isInt ? COOL : HOT;
          chip(ctx, bx, by, bw, BH, small ? s.s : s.t, {
            fill: rgb(tint, inside ? 0.3 : 0.14),
            stroke: rgb(tint),
            lw: inside ? 2 : 1.3,
            color: C.fg,
            font: small ? MONO_S : MONO,
          });
          if (!isInt) {
            // dequant / requant converters at each float island's edges
            if (!small) {
              ctx.fillStyle = C.mute;
              ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
              ctx.textBaseline = "bottom";
              ctx.textAlign = "left";
              ctx.fillText("int8→fp", bx, by - 3);
              ctx.textAlign = "right";
              ctx.fillText("fp→int8", bx + bw, by - 3);
            }
            if (inside) {
              // rounding jitter: the value wobbles while it is in float land
              const j = (hash(Math.floor(now / 90)) - 0.5) * 4;
              ctx.strokeStyle = rgb(HOT);
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(px - 10, ry + 6 + j);
              ctx.lineTo(px - 4, ry + 10 - j);
              ctx.lineTo(px + 2, ry + 4 + j);
              ctx.lineTo(px + 8, ry + 9 - j);
              ctx.stroke();
            }
          }
        }
        // the travelling activation
        ctx.fillStyle = C.fg;
        ctx.beginPath();
        ctx.arc(px, ry, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      lane(TOP, small ? "typical int8 stack (W8A8)" : "typical int8 stack (W8A8): integer storage, float math in between", false);
      lane(TOP + laneH + LANEG, "DetLLM: integers from input ids to logits", true);

      legend(
        ctx,
        [
          { c: rgb(COOL, 0.8), label: "integer op (exact)" },
          { c: rgb(HOT, 0.8), label: "floating-point op (rounds)" },
        ],
        W / 2,
        H - CAP / 2,
        C,
      );
    },
  );
}

// ---- 5. argmax cushion ------------------------------------------------------
// Greedy decoding hides logit noise as long as the noise is smaller than the gap
// between the top two tokens. Left: the typical step from the demo (gap 2.66,
// noise up to 0.094). Right: a near tie, where the same noise flips the token.

function marginAnim(canvas) {
  const DEVICES = ["A100 · batch 1", "A100 · batch 8", "H100 · batch 1", "H100 · batch 8", "EPYC 7J13", "Xeon 8480+", "M1 Pro"];
  const STEP = 800;
  const NOISE = 0.094;
  const TOP = 8,
    TITLE = 22,
    BARH = 16,
    BARG = 9,
    NB = 4,
    CAP = 30,
    PAD = 18;
  const stackAt = 560;
  const panelH = TITLE + 6 + NB * (BARH + BARG) + 22;
  run(
    canvas,
    (W) => TOP + (W < stackAt ? panelH * 2 + PAD : panelH) + CAP,
    (ctx, W, H, now) => {
      const C = colors();
      const narrow = W < stackAt;
      const pw = narrow ? W - 24 : (W - 24 - PAD) / 2;
      const d = Math.floor(now / STEP) % DEVICES.length;
      const dev = DEVICES[d];

      function panel(x, y, title, base, seed) {
        label(ctx, title, x, y + TITLE / 2, C.fg, SANS_B);
        const labW = 24,
          valW = 96;
        const bx = x + labW;
        const bwMax = pw - labW - valW;
        const maxV = 8;
        // perturb each logit deterministically per (device, token)
        const vals = base.map((v, i) => v + (hash(seed + d * 17 + i * 3) * 2 - 1) * NOISE);
        let top = 0;
        for (let i = 1; i < NB; i++) if (vals[i] > vals[top]) top = i;
        const baseTop = base.indexOf(Math.max(...base));
        const flipped = top !== baseTop;
        for (let i = 0; i < NB; i++) {
          const by = y + TITLE + 6 + i * (BARH + BARG);
          const w = (vals[i] / maxV) * bwMax;
          const isTop = i === top;
          label(ctx, "ABCD"[i], x + labW - 10, by + BARH / 2, C.fg, MONO, "right");
          ctx.fillStyle = isTop ? (flipped ? rgb(HOT) : rgb(COOL)) : C.line;
          rrect(ctx, bx, by, w, BARH, 3);
          ctx.fill();
          label(ctx, vals[i].toFixed(2), bx + w + 6, by + BARH / 2, C.mute, MONO_S, "left");
          if (isTop) label(ctx, "argmax", bx + w + 6 + 36, by + BARH / 2, isTop && flipped ? rgb(HOT) : rgb(COOL), SANS, "left");
        }
        // gap bracket between bars 0 and 1
        const b0 = y + TITLE + 6,
          w0 = (vals[0] / maxV) * bwMax,
          w1 = (vals[1] / maxV) * bwMax;
        const gy = b0 + BARH + BARG / 2;
        ctx.strokeStyle = C.mute;
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx + Math.min(w0, w1), gy);
        ctx.lineTo(bx + Math.max(w0, w1), gy);
        ctx.stroke();
        ctx.setLineDash([]);
        const fy = y + TITLE + 6 + NB * (BARH + BARG) + 4;
        label(ctx, `gap ${Math.abs(vals[0] - vals[1]).toFixed(2)}  ·  noise ±${NOISE}`, x, fy, C.mute, SANS);
        return flipped;
      }

      const y2 = narrow ? TOP + panelH + PAD : TOP;
      const x2 = narrow ? 12 : 12 + pw + PAD;
      panel(12, TOP, "a typical step", [7.10, 4.44, 3.02, 1.21], 5);
      const flipped = panel(x2, y2, "a near-tie step", [5.21, 5.18, 3.02, 1.21], 61);
      if (!narrow) {
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.moveTo(W / 2, TOP + 4);
        ctx.lineTo(W / 2, TOP + panelH - 4);
        ctx.stroke();
      }
      label(
        ctx,
        `${dev}${flipped ? "   → different token" : ""}`,
        W / 2,
        H - CAP / 2,
        flipped ? rgb(HOT) : C.mute,
        flipped ? SANS_B : SANS,
        "center",
      );
    },
  );
}

// ---- hero: nine runs, two distributions --------------------------------------
// Plays back the real next-token distribution at every one of the 512 greedy
// steps, for nine machine configurations (detllm-hero.json). Each panel shows
// the reference run's top-8 tokens; every run draws a tick at its own
// probability for each token, and a dot for its log-prob drift from the
// reference (A100 batch 1). fp16 ticks smear and dots scatter; the int8 runs
// are bit-identical, so all nine land on the same pixel. The M1 Pro's fp16
// run hits an exact tie at step 457 and forks; after that it has no
// comparable distribution and drops out.

const HERO_DATA = new URL("./detllm-hero.json", import.meta.url);

// timeline segments: [fromStep, toStep, steps per second] or [step, step, holdMs]
function heroTimeline(fork) {
  const segs = [
    { a: 0, b: 40, rate: 6 },
    { a: 40, b: fork - 9, rate: 70, ff: true },
    { a: fork - 9, b: fork, rate: 3 },
    { a: fork, b: fork, hold: 5200, forkHold: true },
    { a: fork, b: 511, rate: 36, ff: true },
    { a: 511, b: 511, hold: 4200, end: true },
  ];
  let t = 0;
  for (const s of segs) {
    s.t0 = t;
    s.dur = s.hold || ((s.b - s.a) / s.rate) * 1000;
    t += s.dur;
  }
  return { segs, total: t };
}

function heroAt(tl, t) {
  t %= tl.total;
  for (const s of tl.segs) {
    if (t < s.t0 + s.dur) {
      const f = s.hold ? 0 : (t - s.t0) / s.dur;
      return { seg: s, step: Math.min(511, Math.floor(s.a + f * (s.b - s.a))) };
    }
  }
  const s = tl.segs[tl.segs.length - 1];
  return { seg: s, step: s.b };
}

const tokShow = (s) => s.replace(/\n/g, "↵").replace(/^ /, "·");

function hero(canvas) {
  let D = null;
  fetch(HERO_DATA)
    .then((r) => r.json())
    .then((d) => (D = d))
    .catch(() => {});
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const RANGE = 0.04; // ± nats shown in the drift column
  const ROWH = 22,
    HEAD = 22,
    COLH = 18,
    TICK = 30,
    FOOT = 24;
  const GAP = 16;
  const panelH = HEAD + COLH + 8 * ROWH + GAP + TICK;

  let clock = 0,
    last = 0,
    hover = null,
    layout = null;
  // smoothed per-row geometry so step changes glide instead of flicker
  const smooth = { fp: [], int: [] };

  canvas.addEventListener("mousemove", (e) => {
    const r = canvas.getBoundingClientRect();
    hover = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  canvas.addEventListener("mouseleave", () => (hover = null));

  run(
    canvas,
    (W) => (W < 600 ? panelH * 2 + 18 + FOOT : panelH + FOOT) + 4,
    (ctx, W, H, now) => {
      const dt = last ? Math.min(100, now - last) : 0;
      last = now;
      const C = colors();
      if (!D) return;
      const fork = D.fork.step;
      const tl = heroTimeline(fork);

      const narrow = W < 600;
      const pw = narrow ? W : (W - 28) / 2;
      const panels = [
        { key: "fp", x: 0, y: 0 },
        { key: "int", x: narrow ? 0 : pw + 28, y: narrow ? panelH + 18 : 0 },
      ];

      // hovering a row pauses playback
      let hovRow = null;
      if (hover && layout) {
        for (const P of layout) {
          const r = Math.floor((hover.y - P.rowsY) / ROWH);
          if (hover.x >= P.x && hover.x <= P.x + pw && r >= 0 && r < 8) hovRow = { key: P.key, row: r };
        }
      }
      if (!hovRow) clock += dt;
      const { seg, step } = reduce ? { seg: tl.segs[3], step: fork } : heroAt(tl, clock);
      const k = Math.min(1, dt / 70) || 1;

      layout = [];
      for (const P of panels) {
        const isFp = P.key === "fp";
        const side = isFp ? HOT : COOL;
        const src = D[P.key];
        const ids = src.ids[step],
          probs = src.p[step];
        const labW = Math.min(74, pw * 0.2);
        const dW = Math.max(64, Math.min(104, pw * 0.27));
        const barX = P.x + labW + 6;
        const barW = pw - labW - dW - 22;
        const dX = barX + barW + 16;
        const rowsY = P.y + HEAD + COLH;
        layout.push({ key: P.key, x: P.x, rowsY });

        label(ctx, isFp ? "fp16" : "int8 (DetLLM)", P.x, P.y + HEAD / 2, C.fg, SANS_B);
        ctx.font = SANS_B;
        const tw = ctx.measureText(isFp ? "fp16" : "int8 (DetLLM)").width;
        label(ctx, "· 9 runs", P.x + tw + 6, P.y + HEAD / 2, C.mute, SANS);
        const ch = P.y + HEAD + COLH / 2 - 1;
        const tiny = "10.5px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
        label(ctx, "next token", P.x, ch, C.mute, tiny);
        label(ctx, "probability", barX, ch, C.mute, tiny);
        label(ctx, narrow || pw < 340 ? "drift" : "log-prob drift", dX + dW / 2, ch, C.mute, tiny, "center");

        // drift axis: zero line and ±range ticks
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dX + dW / 2, rowsY);
        ctx.lineTo(dX + dW / 2, rowsY + 8 * ROWH);
        ctx.stroke();

        const ay = rowsY + 8 * ROWH + 7;
        label(ctx, "−" + RANGE, dX, ay, C.mute, tiny, "left");
        label(ctx, "+" + RANGE, dX + dW, ay, C.mute, tiny, "right");
        label(ctx, "0", dX + dW / 2, ay, C.mute, tiny, "center");

        const sm = smooth[P.key];
        const runs = isFp ? src.runs : null;
        for (let r = 0; r < 8; r++) {
          const y = rowsY + r * ROWH;
          const pBase = probs[r] / 1e4;
          const s = (sm[r] = sm[r] || { bar: pBase, ticks: new Array(9).fill(pBase), dots: new Array(9).fill(0) });
          s.bar += (pBase - s.bar) * k;
          const isHov = hovRow && hovRow.key === P.key && hovRow.row === r;
          if (isHov) {
            ctx.fillStyle = C.soft;
            ctx.fillRect(P.x, y, pw, ROWH);
          }
          // token label
          const txt = tokShow(D.vocab[ids[r]] || "");
          ctx.font = MONO_S;
          let shown = txt;
          while (shown.length > 1 && ctx.measureText(shown).width > labW - 4) shown = shown.slice(0, -1);
          if (shown !== txt) shown = shown.slice(0, -1) + "…";
          label(ctx, shown, P.x, y + ROWH / 2, r === 0 ? C.fg : C.mute, MONO_S);
          // track + reference bar
          ctx.fillStyle = C.line;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(barX, y + ROWH / 2 - 0.5, barW, 1);
          ctx.globalAlpha = 1;
          ctx.fillStyle = rgb(side, 0.16);
          rrect(ctx, barX, y + 4, Math.max(2, s.bar * barW), ROWH - 8, 3);
          ctx.fill();

          // per-run ticks and drift dots
          for (let i = 0; i < 9; i++) {
            let dlp = 0,
              alive = true;
            if (isFp) {
              const R = runs[i];
              alive = step <= R.last && !(i === D.fork.run && step > fork);
              dlp = alive ? R.d[step][r] / 1e4 : 0;
            }
            const pr = pBase * Math.exp(dlp);
            s.ticks[i] += (pr - s.ticks[i]) * k;
            s.dots[i] += (dlp - s.dots[i]) * k;
            if (!alive) continue;
            const tx = barX + Math.min(1, s.ticks[i]) * barW;
            ctx.fillStyle = rgb(side, isFp ? 0.38 : 0.9);
            ctx.fillRect(tx - 0.75, y + 3, 1.5, ROWH - 6);
            const v = Math.max(-1, Math.min(1, s.dots[i] / RANGE));
            const dx = dX + dW / 2 + v * (dW / 2 - 3);
            const dy = y + 4 + (i * (ROWH - 8)) / 8;
            ctx.fillStyle = rgb(side, 0.85);
            ctx.beginPath();
            ctx.arc(dx, dy, 1.9, 0, Math.PI * 2);
            ctx.fill();
            // the tie: the M1 Pro's argmax is this row instead of row 0
            if (isFp && i === D.fork.run && step === fork && runs[i].pick[fork] === r) {
              ctx.strokeStyle = C.fg;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.arc(dx, dy, 5, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }

        // ticker: generated text so far, current token highlighted
        const ty = rowsY + 8 * ROWH + GAP + TICK / 2;
        const toks = src.toks;
        const showFork = isFp && step === fork && seg.forkHold;
        drawTicker(ctx, D, toks, step, P.x, ty - (showFork ? 8 : 0), pw, side, C, showFork ? "A100" : null);
        if (showFork) drawTicker(ctx, D, toks.slice(0, fork).concat(D.fork.toks), fork, P.x, ty + 8, pw, side, C, "M1 Pro");
      }

      // footer
      const fy = H - FOOT / 2 - 2;
      const fp = panels[0],
        ip = panels[1];
      const SB = SANS_B;
      if (seg.end) {
        label(ctx, `${D.fp.unique_hashes} runs, ${D.fp.unique_hashes} different logit hashes`, fp.x, narrow ? fp.y + panelH + 6 : fy, rgb(HOT), SB);
        label(ctx, `9 runs, 1 hash: ${D.int.hash}`, ip.x, fy, rgb(COOL), SB);
      } else if (seg.forkHold || reduce) {
        const tie = D.vocab[D.fork.toks[0]];
        label(ctx, `step ${fork}: M1 Pro ties, picks "${tie.trim()}"`, fp.x, narrow ? fp.y + panelH + 6 : fy, C.fg, SB);
        label(ctx, `step ${fork}: all 9 identical`, ip.x, fy, rgb(COOL), SB);
      } else {
        const txt = `step ${step}${seg.ff ? "  ▸▸" : ""}`;
        label(ctx, txt, fp.x, narrow ? fp.y + panelH + 6 : fy, C.mute, SANS);
        label(ctx, "identical to the bit", ip.x, fy, rgb(COOL), SANS);
        if (step > fork) {
          ctx.font = SANS;
          const w = ctx.measureText(txt).width;
          label(ctx, `· M1 Pro forked at step ${fork}`, fp.x + w + 8, narrow ? fp.y + panelH + 6 : fy, C.mute, SANS);
        }
      }

      // tooltip for the hovered row
      if (hovRow) heroTooltip(ctx, D, hovRow, step, fork, hover, W, C);
    },
  );
}

function drawTicker(ctx, D, toks, step, x, y, w, side, C, tag) {
  let lx = x;
  if (tag) {
    label(ctx, tag, x, y, C.mute, "10.5px ui-sans-serif, system-ui, sans-serif");
    lx = x + 46;
  }
  ctx.font = MONO_S;
  const avail = x + w - lx;
  const cur = (D.vocab[toks[step]] || "").replace(/\n/g, "↵");
  const cw = ctx.measureText(cur).width;
  let before = "";
  for (let i = step - 1; i >= 0; i--) {
    const t = (D.vocab[toks[i]] || "").replace(/\n/g, "↵");
    if (ctx.measureText(t + before).width + cw > avail - 4) break;
    before = t + before;
  }
  const bw = ctx.measureText(before).width;
  label(ctx, before, lx, y, C.mute, MONO_S);
  ctx.fillStyle = rgb(side, 0.16);
  rrect(ctx, lx + bw - 1, y - 8, cw + 2, 16, 3);
  ctx.fill();
  label(ctx, cur, lx + bw, y, C.fg, MONO_S);
}

function heroTooltip(ctx, D, hv, step, fork, m, W, C) {
  const src = D[hv.key];
  const tok = (D.vocab[src.ids[step][hv.row]] || "").replace(/\n/g, "↵");
  const pBase = src.p[step][hv.row] / 1e4;
  const lines = [];
  const names = src.runs.map((r) => `${r.dev} ${r.cfg}`);
  for (let i = 0; i < 9; i++) {
    let p = pBase,
      ok = true;
    if (hv.key === "fp") {
      const R = src.runs[i];
      ok = step <= R.last && !(i === D.fork.run && step > fork);
      if (ok) p = pBase * Math.exp(R.d[step][hv.row] / 1e4);
    }
    lines.push([names[i], ok ? (p * 100).toFixed(4) + "%" : "forked"]);
  }
  ctx.font = MONO_S;
  const nw = Math.max(...lines.map((l) => ctx.measureText(l[0]).width));
  const vw = Math.max(...lines.map((l) => ctx.measureText(l[1]).width));
  const w = nw + vw + 30,
    lh = 15,
    h = lines.length * lh + 30;
  let x = m.x + 14,
    y = m.y + 10;
  if (x + w > W - 4) x = m.x - w - 14;
  if (y + h > ctx.canvas.clientHeight - 2) y = Math.max(2, ctx.canvas.clientHeight - h - 2);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.12)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = C.bg;
  rrect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  rrect(ctx, x, y, w, h, 6);
  ctx.stroke();
  label(ctx, `"${tok}"  step ${step}`, x + 10, y + 14, C.fg, SANS_B);
  lines.forEach((l, i) => {
    const ly = y + 30 + i * lh;
    label(ctx, l[0], x + 10, ly, C.mute, MONO_S);
    label(ctx, l[1], x + w - 10, ly, C.fg, MONO_S, "right");
  });
}

// ---- dispatch ---------------------------------------------------------------

const ANIMS = {
  "float-order": (c) => orderAnim(c, false),
  "int-order": (c) => orderAnim(c, true),
  "batch-variance": batchAnim,
  pipeline: pipelineAnim,
  margin: marginAnim,
};

for (const c of document.querySelectorAll("[data-hero-canvas]")) hero(c);
for (const c of document.querySelectorAll("[data-anim]")) {
  const fn = ANIMS[c.getAttribute("data-anim")];
  if (fn) fn(c);
}
