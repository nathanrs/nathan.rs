/*
  Visuals for "Can a Linear Program Do Weight-Space Programming?".

  One ES module, auto-loaded by the post's `hero` frontmatter. It drives the
  hero canvas ([data-hero-canvas]) and every inline animation ([data-anim]).

  Real data (weight-space-lp.json, extracted from the weight-space-lp repo's
  eval outputs with the model's own tokenizer):
    - hero: GSM8K training problem 793, base model vs the LP edit, same
      sampling settings. Token counts are real; long middles are skipped.
    - loop-trace: duplicate-token fraction along 8 of the base model's dev-set
      answers (16-token windows, the same detector the LP's data used).
    - dose: problem 4027 with the steering vector at 0.5x, 1x and 2x.
  The timeline uses Astra's pass timestamps and accuracies from the
  released logs (driver.log, experiment_history.md). The residual-stream and
  LP geometry pictures are illustrations.

  Shared visual grammar:
    warm (red)  = looping / the loop direction u
    cool (blue) = productive / finished / the LP
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
  t = clamp(t, 0, 1);
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t = clamp(t, 0, 1)) * t * (3 - 2 * t);
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
}

function hash(n) {
  const x = Math.sin(n * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
}
// deterministic standard normal
function gauss(n) {
  const u = Math.max(1e-6, hash(n)),
    v = hash(n + 0.5);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const SANS = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const SANS_S = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const SANS_B = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
const MONO = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const MONO_S = "10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const MONO_B = "600 10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SERIF_I = "italic 14px ui-serif, Georgia, Cambria, Times New Roman, serif";

const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const fmt = (n) => Math.round(n).toLocaleString("en-US");

// generic canvas runner: heightFor(W) sets the wrapped height, render draws a frame.
// `now` passed to render is ms since the canvas first scrolled into view.
function run(canvas, heightFor, render) {
  const ctx = canvas.getContext("2d");
  let W = 0,
    H = 0,
    t0 = null;
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
  new IntersectionObserver((es) => {
    if (t0 === null && es.some((e) => e.isIntersecting)) t0 = performance.now();
  }).observe(canvas);
  resize();
  requestAnimationFrame(function frame(now) {
    ctx.clearRect(0, 0, W, H);
    render(ctx, W, H, t0 === null ? 0 : Math.max(0, now - t0));
    requestAnimationFrame(frame);
  });
}

function label(ctx, text, x, y, color, font, align) {
  ctx.font = font || SANS;
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
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
    ctx.fillStyle = it.c;
    rrect(ctx, x, y - sw / 2, sw, sw, 3);
    ctx.fill();
    ctx.fillStyle = C.mute;
    ctx.textAlign = "left";
    ctx.fillText(it.label, x + sw + g, y + 1);
    x += ws[i] + pad;
  });
}

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
  if (text != null) {
    ctx.font = o.font || SANS;
    ctx.fillStyle = o.color || "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  }
}

// straight arrow with a filled head
function arrow(ctx, x0, y0, x1, y1, color, lw, head) {
  head = head || 7;
  const a = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw || 1.6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(a) * head * 0.8, y1 - Math.sin(a) * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - head * Math.cos(a - 0.4), y1 - head * Math.sin(a - 0.4));
  ctx.lineTo(x1 - head * Math.cos(a + 0.4), y1 - head * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

// wrap text (with \n and leading indentation) to at most n characters per line
function wrap(text, n) {
  const out = [];
  for (const para of text.split("\n")) {
    if (para.length <= n) {
      out.push(para);
      continue;
    }
    const indent = para.match(/^\s*/)[0].slice(0, Math.floor(n / 3));
    let line = "";
    for (const w of para.trim().split(/ +/)) {
      const cand = line ? line + " " + w : indent + w;
      if (cand.length <= n) line = cand;
      else {
        if (line) out.push(line);
        line = (indent + w).slice(0, n);
      }
    }
    if (line) out.push(line);
  }
  return out;
}

const DATA = fetch(new URL("./weight-space-lp.json", import.meta.url)).then((r) => r.json());

// ---- hero: the same problem, base model vs the LP edit -------------------------
// Two panels type out real generations. The base model reaches the answer in its
// thinking at token ~2,400, then repeats itself until the 32,768-token limit.

function hero(canvas) {
  DATA.then((D) => heroRun(canvas, D));
}

function heroRun(canvas, D) {
  const h = D.hero;
  const LIMIT = 32768;
  const loopCycle = h.base.tail.split("\n").slice(-4);
  const loopText = Array.from({ length: 30 }, () => loopCycle.join("\n")).join("\n");
  const onsetText = h.base.onset_text.split("\n").slice(0, -1).join("\n");
  const lpEnd = h.lp.end.replace(/\n{3,}/g, "\n\n");
  // segments: [text, kind, start s, end s, token start, token end]
  const BASE = [
    [h.base.intro, "text", 0.4, 3.4, 0, h.base.intro_tok],
    [`⋯ ${fmt(h.base.onset_tok - h.base.intro_tok - 60)} tokens later ⋯`, "skip", 3.4, 3.6, h.base.intro_tok, h.base.onset_tok - 60],
    [onsetText, "answer-think", 3.6, 5.2, h.base.onset_tok - 60, h.base.onset_tok],
    [loopText, "loop", 5.2, 13.5, h.base.onset_tok, LIMIT],
  ];
  const LP = [
    [h.lp.intro, "text", 0.4, 3.4, 0, h.lp.intro_tok],
    [`⋯ ${fmt(h.lp.end_tok - h.lp.intro_tok)} tokens later ⋯`, "skip", 3.4, 3.6, h.lp.intro_tok, h.lp.end_tok],
    [lpEnd, "answer", 3.6, 7.6, h.lp.end_tok, h.lp.n],
  ];
  const CYCLE = 17;
  const LH = 14,
    HEAD = 24,
    FOOT = 40,
    GAP = 18,
    stackAt = 640;
  // stacked on phones, so each panel shows fewer lines to keep the hero within one screen
  const rowsFor = (W) => (W < stackAt ? 8 : 13);
  const panelHFor = (W) => HEAD + rowsFor(W) * LH + 8 + FOOT;
  let ROWS = 13,
    panelH = panelHFor(1000);
  let cache = { w: 0 };

  function wrapped(segs, pw, ctx) {
    ctx.font = MONO_S;
    const n = Math.max(20, Math.floor((pw - 20) / ctx.measureText("M").width));
    return segs.map((s) => {
      const lines = wrap(s[0], n);
      return { lines, chars: lines.reduce((a, l) => a + l.length + 1, 0) };
    });
  }

  run(
    canvas,
    (W) => (W < stackAt ? panelHFor(W) * 2 + GAP : panelHFor(W)) + 2,
    (ctx, W, H, now) => {
      const C = colors();
      const narrow = W < stackAt;
      ROWS = rowsFor(W);
      panelH = panelHFor(W);
      const pw = narrow ? W - 2 : (W - GAP) / 2;
      if (cache.w !== pw) cache = { w: pw, base: wrapped(BASE, pw, ctx), lp: wrapped(LP, pw, ctx) };
      const t = REDUCE ? CYCLE - 1 : (now / 1000) % CYCLE;

      // the problem
      const TOPQ = 1;

      panel(1, TOPQ, "base model", BASE, cache.base, true);
      panel(narrow ? 1 : pw + GAP, narrow ? TOPQ + panelH + GAP : TOPQ, "with the LP edit", LP, cache.lp, false);

      function panel(x, y, title, segs, wr, isBase) {
        // reveal state
        let tokens = 0,
          done = true;
        const shown = [];
        segs.forEach((s, i) => {
          let f = seg(t, s[2], s[3]);
          if (s[1] === "loop") f = Math.pow(f, 1.6); // speeds up as the loop takes over
          if (f <= 0) {
            done = false;
            return;
          }
          if (f < 1) done = false;
          tokens = lerp(s[4], s[5], f);
          let left = Math.round(f * wr[i].chars);
          for (const line of wr[i].lines) {
            if (left <= 0) break;
            shown.push({ text: line.slice(0, left), kind: s[1] });
            left -= line.length + 1;
          }
        });

        rrect(ctx, x, y, pw - 1, panelH, 8);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.stroke();
        label(ctx, title, x + 10, y + HEAD / 2 + 2, C.fg, SANS_B);
        label(ctx, `${fmt(tokens)} tokens`, x + pw - 11, y + HEAD / 2 + 2, C.mute, MONO_S, "right");

        // text body, scrolled to the newest line
        const by = y + HEAD + 4;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 1, by, pw - 3, ROWS * LH + 4);
        ctx.clip();
        const start = Math.max(0, shown.length - ROWS);
        let loopSeen = 0;
        shown.forEach((ln, i) => {
          if (ln.kind === "loop") loopSeen++;
          if (i < start) return;
          const ly = by + (i - start) * LH + LH / 2 + 2;
          let color = C.fg,
            font = MONO_S;
          if (ln.kind === "skip") color = C.mute;
          else if (ln.kind === "loop") color = loopSeen > 4 ? rgb(HOT) : C.fg;
          if (/\\boxed\{/.test(ln.text)) {
            font = MONO_B;
            color = isBase ? C.fg : rgb(COOL);
          }
          label(ctx, ln.text, x + 10, ly, color, font);
        });
        ctx.restore();

        // token budget bar
        const fy = y + HEAD + ROWS * LH + 14;
        const bw = pw - 22;
        rrect(ctx, x + 10, fy, bw, 6, 3);
        ctx.fillStyle = C.line;
        ctx.fill();
        const frac = tokens / LIMIT;
        rrect(ctx, x + 10, fy, bw * frac, 6, 3);
        ctx.fillStyle = isBase ? rgb(mixc(COOL, HOT, seg(tokens, h.base.onset_tok, h.base.onset_tok + 4000))) : rgb(COOL);
        ctx.fill();
        const sy = fy + 21;
        if (done) {
          if (isBase) label(ctx, "✗  hit the 32,768-token limit, no answer", x + 10, sy, rgb(HOT), SANS_B);
          else label(ctx, `✓  answered ${h.answer} in ${fmt(h.lp.n)} tokens`, x + 10, sy, rgb(COOL), SANS_B);
        } else label(ctx, "token budget: 32,768", x + 10, sy, C.mute, SANS_S);
      }
    },
  );
}

// ---- loop-trace: where the repeated text is, along the base model's answers ----

function loopTraceAnim(canvas) {
  DATA.then((D) => {
    const P = D.profiles,
      S = D.profile_stats;
    const LIMIT = 32768,
      RH = 13,
      RG = 7,
      TOP = 26,
      LEFT = 8,
      RIGHT = 92;
    const CYCLE = 11;
    run(
      canvas,
      () => TOP + P.length * (RH + RG) + 54,
      (ctx, W, H, now) => {
        const C = colors();
        const t = REDUCE ? CYCLE : (now / 1000) % CYCLE;
        const play = ease(seg(t, 0.3, 7.5)) * LIMIT;
        const x0 = LEFT,
          x1 = W - RIGHT,
          sx = (k) => x0 + (k / LIMIT) * (x1 - x0);
        legend(ctx, [
          { label: "new text", c: C.line },
          { label: "repeated text", c: rgb(HOT) },
        ], W / 2, 9, C);
        P.forEach((p, r) => {
          const y = TOP + r * (RH + RG);
          const end = Math.min(p.n, play);
          const nb = p.bins.length;
          for (let b = 0; b < nb; b++) {
            const a = (b * LIMIT) / 128;
            if (a >= end) break;
            const z = Math.min(((b + 1) * LIMIT) / 128, end, p.n);
            const xa = Math.floor(sx(a)),
              bw = Math.max(1, Math.ceil(sx(z)) - xa);
            ctx.fillStyle = C.line;
            ctx.fillRect(xa, y, bw, RH);
            ctx.fillStyle = rgb(HOT, clamp((p.bins[b] - 0.1) / 0.8, 0, 1));
            ctx.fillRect(xa, y, bw, RH);
          }
          if (play >= p.n) {
            if (p.cut) label(ctx, "cut off", sx(LIMIT) + 8, y + RH / 2, rgb(HOT), SANS_S);
            else label(ctx, "✓ answered", sx(p.n) + 8, y + RH / 2, rgb(COOL), SANS_S);
          }
        });
        // limit line and playhead
        const yb = TOP + P.length * (RH + RG) - RG + 4;
        ctx.strokeStyle = rgb(HOT, 0.6);
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sx(LIMIT), TOP - 4);
        ctx.lineTo(sx(LIMIT), yb);
        ctx.stroke();
        ctx.setLineDash([]);
        if (play < LIMIT) {
          ctx.strokeStyle = C.mute;
          ctx.beginPath();
          ctx.moveTo(sx(play), TOP - 4);
          ctx.lineTo(sx(play), yb);
          ctx.stroke();
        }
        for (const k of [0, 8192, 16384, 24576, 32768]) {
          label(ctx, k === 0 ? "0" : `${k / 1024}k`, sx(k), yb + 12, C.mute, SANS_S, "center");
        }
        label(ctx, "tokens into the answer", (x0 + x1) / 2, yb + 28, C.mute, SANS_S, "center");
        label(
          ctx,
          W < 520 ? `${S.cut} of ${S.n} dev-set answers hit the limit` : `8 of the base model's answers on dev-set problems · ${S.cut} of all ${S.n} hit the limit`,
          W / 2,
          H - 8,
          C.mute,
          SANS_S,
          "center",
        );
      },
    );
  });
}

// ---- down-proj: Wh is a weighted sum of W's columns ---------------------------
// Fixed W and h (illustrative values). Each step adds one term h_j w_j to the
// output; the result holds, then the cycle restarts.

function downProjAnim(canvas) {
  const R = 10,
    N = 8;
  const Wm = Array.from({ length: R }, (_, i) => Array.from({ length: N }, (_, j) => clamp(gauss(i * 31 + j * 7 + 3) * 0.5, -1, 1)));
  const HV = [0.9, -0.5, 0.2, 0.7, 0.0, -0.8, 0.4, 0.6];
  const STEP = 0.9,
    HOLD = 3,
    CYCLE = N * STEP + HOLD;
  const narrowAt = 520;
  const cellFor = (W) => (W < narrowAt ? Math.min(28, (W - 40) / (N + 4.4)) : Math.min(32, (W - 120) / (N + 5)));
  const TOP = 64;
  const cellColor = (v, a) => (v >= 0 ? rgb(COOL, a) : rgb(MID, a));
  // final output, for scaling the bars
  const full = Array.from({ length: R }, (_, i) => HV.reduce((acc, h, j) => acc + h * Wm[i][j], 0));
  const scale = Math.max(...full.map(Math.abs)) * 1.1;

  run(
    canvas,
    (W) => TOP + R * cellFor(W) + (W < narrowAt ? 52 : 34),
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? CYCLE - 0.1 : (now / 1000) % CYCLE;
      const narrow = W < narrowAt;
      const cell = cellFor(W);
      const k = Math.min(N, Math.floor(t / STEP)); // terms fully added
      const kf = k < N ? ease(seg(t - k * STEP, 0.1, STEP * 0.85)) : 0;
      const gap = cell * (narrow ? 1.4 : 2.2);
      const mx = (W - (N * cell + gap + cell * 3)) / 2,
        my = TOP;
      const ox = mx + N * cell + gap,
        ow = cell * 3,
        oc = ox + ow / 2;

      // equation, active term highlighted
      const terms = ["Wh", " = "];
      for (let j = 0; j < N; j++) terms.push(`h${sub(j + 1)}w${sub(j + 1)}`, j < N - 1 ? " + " : "");
      ctx.font = SERIF_I;
      const tw = terms.reduce((a, s) => a + ctx.measureText(s).width, 0);
      let ex = (W - tw) / 2;
      // too wide to write out every term: use the summation form
      if (tw > W - 8) label(ctx, "Wh = Σⱼ hⱼ wⱼ", W / 2, 14, C.fg, SERIF_I, "center");
      else terms.forEach((s, i) => {
        const j = (i - 2) / 2;
        const active = Number.isInteger(j) && j === k && k < N;
        const done = Number.isInteger(j) && j < k;
        label(ctx, s, ex, 14, active ? C.fg : done ? C.fg : C.mute, active ? "italic 600 14px ui-serif, Georgia, serif" : SERIF_I);
        ex += ctx.measureText(s).width;
      });

      // h values above each column
      label(ctx, "h", mx - 8, my - 18, C.mute, SERIF_I, "right");
      for (let j = 0; j < N; j++) {
        const cx = mx + j * cell + cell / 2;
        const v = HV[j];
        const active = j === k && k < N;
        const num = Math.abs(v).toFixed(1);
        const txt = v === 0 ? "0" : (v > 0 ? "" : "−") + (narrow ? num.slice(1) : num);
        const small = narrow ? "9.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : MONO_S;
        label(ctx, txt, cx, my - 18, active ? C.fg : v === 0 ? C.mute : cellColor(v), active ? (narrow ? "600 " + small : MONO_B) : small, "center");
      }
      label(ctx, "W", mx - 8, my + (R * cell) / 2, C.mute, SERIF_I, "right");

      // matrix: columns already added fade back, the active one is outlined
      for (let j = 0; j < N; j++) {
        const dim = j < k && k < N ? 0.35 : 1;
        for (let i = 0; i < R; i++) {
          const v = Wm[i][j];
          ctx.fillStyle = cellColor(v, (Math.abs(v) * 0.85 + 0.1) * dim);
          ctx.fillRect(mx + j * cell + 1, my + i * cell + 1, cell - 2, cell - 2);
        }
        if (j === k && k < N) {
          ctx.strokeStyle = C.fg;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(mx + j * cell + 0.5, my + 0.5, cell - 1, R * cell - 1);
        }
        label(ctx, `w${sub(j + 1)}`, mx + j * cell + cell / 2, my + R * cell + 12, j === k && k < N ? C.fg : C.mute, narrow ? "italic 12px ui-serif, Georgia, Cambria, Times New Roman, serif" : SERIF_I, "center");
      }

      // output: running sum, bars around a zero line
      const out = Array.from({ length: R }, (_, i) => {
        let acc = 0;
        for (let j = 0; j < k; j++) acc += HV[j] * Wm[i][j];
        if (k < N) acc += HV[k] * Wm[i][k] * kf;
        return acc;
      });
      label(ctx, narrow ? "Wh" : "Wh  (added to x)", oc, my - 18, C.mute, SANS_S, "center");
      for (let i = 0; i < R; i++) {
        ctx.fillStyle = C.soft;
        ctx.fillRect(ox, my + i * cell + 1, ow, cell - 2);
        const w = (Math.abs(out[i]) / scale) * (ow / 2);
        ctx.fillStyle = cellColor(out[i], 0.9);
        ctx.fillRect(out[i] >= 0 ? oc : oc - w, my + i * cell + 4, w, cell - 8);
      }
      ctx.strokeStyle = C.mute;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(oc, my);
      ctx.lineTo(oc, my + R * cell);
      ctx.stroke();

      // the scaled column in flight: h_k * w_k
      if (k < N && HV[k] !== 0) {
        const fx = lerp(mx + k * cell, oc - cell / 2, kf);
        ctx.globalAlpha = 1 - kf * 0.8;
        for (let i = 0; i < R; i++) {
          const v = Wm[i][k] * HV[k];
          ctx.fillStyle = cellColor(v, Math.min(1, Math.abs(v)) * 0.85 + 0.1);
          ctx.fillRect(fx + 2, my + i * cell + 3, cell - 4, cell - 6);
        }
        ctx.globalAlpha = 1;
      }
      const note =
        k < N ? (HV[k] === 0 ? `h${sub(k + 1)} = 0, so w${sub(k + 1)} adds nothing` : `adding h${sub(k + 1)} · w${sub(k + 1)}`) : "done: a weighted sum of the columns";
      if (narrow) label(ctx, note, W / 2, my + R * cell + 34, C.fg, SANS_S, "center");
      else label(ctx, note, oc, my + R * cell + 12, C.fg, SANS_S, "center");
    },
  );
}
const sub = (n) => String(n).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d]);

// ---- loop-direction: the residual stream drifts along one direction as a loop starts -----
// Illustration, not measured data.

function loopDirectionAnim(canvas) {
  const theta = 0.3;
  const U = [Math.cos(theta), Math.sin(theta)];
  const prod = Array.from({ length: 140 }, (_, i) => [gauss(i * 3 + 1) * 0.75, gauss(i * 3 + 2) * 0.55]);
  const LOOP_C = [3.3 * U[0], 3.3 * U[1]];
  // a trace: wanders inside the productive cloud, then drifts along u and gets stuck
  const trace = [];
  let p = [-0.6, 0.3];
  for (let i = 0; i < 70; i++) {
    if (i < 26) p = [p[0] * 0.8 + gauss(i * 9 + 5) * 0.32, p[1] * 0.8 + gauss(i * 9 + 6) * 0.26];
    else if (i < 40) {
      const f = (i - 25) / 14;
      p = [lerp(p[0], LOOP_C[0], 0.22 * f + 0.05) + gauss(i * 9 + 5) * 0.08, lerp(p[1], LOOP_C[1], 0.22 * f + 0.05) + gauss(i * 9 + 6) * 0.08];
    } else p = [LOOP_C[0] + gauss(i * 9 + 5) * 0.18, LOOP_C[1] + gauss(i * 9 + 6) * 0.15];
    trace.push({ p, loop: i >= 32 });
  }
  const CYCLE = 13;
  // fit the plot to its points, leaving room for the formula above and the labels below
  const pts = [...prod, ...trace.map((d) => d.p)];
  const xs = pts.map((q) => q[0]),
    ys = pts.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 0.2, Math.max(...xs) + 0.2, Math.min(...ys) - 0.2, Math.max(...ys) + 0.2];
  const TOPPAD = 14,
    BOTPAD = 34;
  run(
    canvas,
    // tall enough for the plot to use the full width, capped on wide screens
    (W) => Math.min(320, Math.round(((W - 16) / (x1 - x0)) * (y1 - y0) + TOPPAD + BOTPAD)),
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? CYCLE - 0.5 : (now / 1000) % CYCLE;
      const S = Math.min((W - 16) / (x1 - x0), (H - TOPPAD - BOTPAD) / (y1 - y0));
      const cx = W / 2 - ((x0 + x1) / 2) * S,
        cy = TOPPAD + (H - TOPPAD - BOTPAD) / 2 + ((y0 + y1) / 2) * S;
      const X = (q) => [cx + q[0] * S, cy - q[1] * S];

      for (const q of prod) {
        const [x, y] = X(q);
        ctx.fillStyle = rgb(COOL, 0.28);
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      const n = Math.floor(seg(t, 0.5, 7.5) * trace.length);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgb([140, 135, 130], 0.5);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const [x, y] = X(trace[i].p);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      for (let i = 0; i < n; i++) {
        const [x, y] = X(trace[i].p);
        ctx.fillStyle = trace[i].loop ? rgb(HOT) : rgb(COOL);
        ctx.beginPath();
        ctx.arc(x, y, i === n - 1 ? 4 : 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      label(ctx, "productive tokens", X([0, 0])[0], H - 20, rgb(COOL), SANS_S, "center");
      if (n > 45) label(ctx, "looping tokens", X(LOOP_C)[0], X([0, LOOP_C[1] - 0.75])[1], rgb(HOT), SANS_S, "center");

      // difference of means
      const f = ease(seg(t, 8, 9.5));
      if (f > 0) {
        const mP = prod.reduce((a, q) => [a[0] + q[0] / prod.length, a[1] + q[1] / prod.length], [0, 0]);
        const L = trace.filter((d) => d.loop).map((d) => d.p);
        const mL = L.reduce((a, q) => [a[0] + q[0] / L.length, a[1] + q[1] / L.length], [0, 0]);
        const [ax, ay] = X(mP),
          [bx, by] = X(mL);
        ctx.globalAlpha = f;
        arrow(ctx, ax, ay, lerp(ax, bx, f), lerp(ay, by, f), C.fg, 2, 9);
        for (const [x, y, c] of [[ax, ay, COOL], [bx, by, HOT]]) {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fillStyle = C.bg;
          ctx.fill();
          ctx.strokeStyle = rgb(c);
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        label(ctx, "u = mean(looping) − mean(productive)", (ax + bx) / 2 - 24, Math.max(10, Math.min(ay, by) - 30), C.fg, SANS_B, "center");
        ctx.globalAlpha = 1;
      }
    },
  );
}

// ---- flip: subtracting α times a column's component along u ---------------------

function flipAnim(canvas) {
  const A = 1.0,
    B = 1.5; // column w = a·u + b·(orthogonal)
  // keyframes: [time s, alpha]
  const KF = [[0, 0], [1.2, 0], [2.4, 1], [4.2, 1], [6.4, 6], [9.4, 6], [10.6, 0]];
  const CYCLE = 10.6;
  const alphaAt = (t) => {
    for (let i = 1; i < KF.length; i++) if (t <= KF[i][0]) return lerp(KF[i - 1][1], KF[i][1], ease(seg(t, KF[i - 1][0], KF[i][0])));
    return 0;
  };
  run(
    canvas,
    () => 250,
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? 8 : (now / 1000) % CYCLE;
      const al = alphaAt(t);
      const S = Math.min((W - 40) / 7.4, 62);
      const ox = W / 2 + 1.9 * S,
        oy = 192;
      const X = (u, v) => [ox + u * S, oy - v * S];

      label(ctx, "wⱼ  →  wⱼ − α (uᵀwⱼ) u", W / 2, 16, C.fg, SERIF_I, "center");
      // u axis
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(-5.6, 0)[0], oy);
      ctx.lineTo(X(1.8, 0)[0], oy);
      ctx.stroke();
      arrow(ctx, ox, oy, X(1, 0)[0], oy, rgb(HOT), 2.4, 8);
      if (X(1, 0)[0] + 110 < W) label(ctx, "u (loop direction)", X(1, 0)[0] + 6, oy + 14, rgb(HOT), SANS_S, "left");
      else label(ctx, "u", X(1, 0)[0] + 4, oy - 10, rgb(HOT), SERIF_I, "left");

      // original column, faded
      const [gx, gy] = X(A, B);
      ctx.setLineDash([3, 3]);
      ctx.globalAlpha = 0.5;
      arrow(ctx, ox, oy, gx, gy, C.mute, 1.2, 6);
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // edited column
      const comp = A * (1 - al);
      const [wx, wy] = X(comp, B);
      ctx.strokeStyle = C.mute;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx, oy);
      ctx.stroke();
      ctx.setLineDash([]);
      // its component along u
      ctx.strokeStyle = comp >= 0 ? rgb(HOT) : rgb(COOL);
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(ox, oy + 12);
      ctx.lineTo(wx, oy + 12);
      ctx.stroke();
      ctx.lineCap = "butt";
      arrow(ctx, ox, oy, wx, wy, C.fg, 2, 8);
      label(ctx, "wⱼ", wx + (comp >= 0 ? 8 : -8), wy - 6, C.fg, SERIF_I, comp >= 0 ? "left" : "right");

      const a = `${comp >= 0 ? "+" : "−"}${Math.abs(comp).toFixed(1)}a`;
      let note = `writes ${a} along u`;
      if (Math.abs(al - 1) < 0.02) note = "writes 0 along u: the component is removed";
      if (al > 5.98) note = "writes −5a along u: it now pushes away from loops";
      if (al < 0.02) note = "writes +a along u";
      label(ctx, `α = ${al.toFixed(1)}`, W / 2, 42, C.fg, MONO, "center");
      label(ctx, note, W / 2, 62, comp >= 0 ? C.mute : rgb(COOL), SANS, "center");
      label(ctx, "component along u", ox, oy + 28, C.mute, SANS_S, "center");
    },
  );
}

// ---- timeline: Astra's run, phase by phase -------------------------------------

const PASS_H = [0.13, 0.22, 0.26, 0.41, 2.13, 2.4, 2.64, 2.83, 3.0, 3.35, 3.78, 4.18, 4.8, 4.83, 5.28, 5.56, 5.59, 5.64, 6.08, 6.74, 7.39, 7.61, 7.88, 8.04, 8.08, 8.1, 8.41, 8.54, 8.67, 8.97, 9.52, 9.54, 9.84, 10.35, 10.69, 10.99, 11.22, 11.48, 11.89, 12.18, 12.5, 12.8, 13.07, 13.42, 13.88, 14.28, 14.58, 14.97, 15.26, 20.28];
const END_H = 20.35;
const PHASES = [
  { a: 0, b: 0.26, name: "find u", sub: "15 min · 3 passes", c: HOT },
  { a: 0.26, b: 2.33, name: "pick layers", sub: "2 passes", c: MID },
  { a: 2.33, b: 10.03, name: "find v", sub: "~8 h · 28 passes", c: COOL },
  { a: 10.03, b: END_H, name: "confirm", sub: "17 passes, no changes", c: [170, 165, 158] },
];
function timelineAnim(canvas, lp) {
  const CYCLE = lp ? 9 : 12;
  const TH = 128;
  run(
    canvas,
    () => (lp ? 170 : TH),
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? CYCLE - 0.5 : (now / 1000) % CYCLE;
      const x0 = 12,
        x1 = W - 12;
      const sx = (h) => x0 + (h / END_H) * (x1 - x0);
      const narrow = W < 560;

      if (lp) return timelineLP(ctx, W, H, t, C, (h) => x0 + (h / 13.5) * (x1 - x0), x0, x1);

      const play = REDUCE ? END_H : ease(seg(t, 0.3, 9)) * END_H;
      const BY = 58,
        BH = 16;
      const hatch = (x, y, w, h) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.strokeStyle = rgb([255, 255, 255], 0.7);
        ctx.lineWidth = 2;
        for (let hx = x - h; hx < x + w; hx += 7) {
          ctx.beginPath();
          ctx.moveTo(hx, y + h);
          ctx.lineTo(hx + h, y);
          ctx.stroke();
        }
        ctx.restore();
      };

      // bar
      for (const p of PHASES) {
        ctx.fillStyle = rgb(p.c, 0.18);
        ctx.fillRect(sx(p.a), BY, sx(p.b) - sx(p.a) - 1, BH);
        const e = Math.min(play, p.b);
        if (e > p.a) {
          ctx.fillStyle = rgb(p.c, 0.85);
          ctx.fillRect(sx(p.a), BY, sx(e) - sx(p.a) - (e === p.b ? 1 : 0), BH);
        }
      }
      hatch(sx(15.3), BY, sx(20.0) - sx(15.3), BH); // the outage, explained in the legend

      // pass ticks
      let passes = 0;
      PASS_H.forEach((h) => {
        if (h > play) return;
        passes++;
        ctx.fillStyle = C.fg;
        ctx.fillRect(sx(h) - 0.5, BY - 7, 1.2, 5);
      });

      // legend: the two short phases, and the outage
      const keys = [
        { c: PHASES[0].c, txt: narrow ? "find u: 15 min" : `find u: ${PHASES[0].sub}` },
        { c: PHASES[1].c, txt: narrow ? "pick layers: 2 h" : `pick layers: ${PHASES[1].sub}` },
        { c: PHASES[3].c, txt: "4.7 h outage", hatch: true },
      ];
      let kx = x0;
      ctx.font = SANS_S;
      for (const k of keys) {
        ctx.fillStyle = rgb(k.c, 0.85);
        rrect(ctx, kx, 31, 10, 10, 2);
        ctx.fill();
        if (k.hatch) hatch(kx, 31, 10, 10);
        label(ctx, k.txt, kx + 15, 36, C.mute, SANS_S);
        ctx.font = SANS_S;
        kx += 15 + ctx.measureText(k.txt).width + 14;
      }
      if (!narrow) label(ctx, "ticks: counted forward passes", x1, 36, C.mute, SANS_S, "right");

      // the two long phases, named under the bar
      PHASES.slice(2).forEach((p) => {
        if (play < p.a) return;
        const cx = (sx(p.a) + sx(p.b)) / 2;
        label(ctx, p.name, cx, BY + BH + 14, rgb(p.c), SANS_B, "center");
        label(ctx, p.sub, cx, BY + BH + 29, C.mute, SANS_S, "center");
      });

      // clock
      const hh = Math.floor(play),
        mm = Math.floor((play - hh) * 60);
      label(ctx, `${hh}:${String(mm).padStart(2, "0")} elapsed`, x0, 14, C.fg, MONO);
      label(ctx, `pass ${passes}/50`, x1, 14, C.fg, MONO, "right");

      // the freeze
      if (play > 10.03) {
        ctx.strokeStyle = C.fg;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(sx(10.03), BY - 10);
        ctx.lineTo(sx(10.03), H - 4);
        ctx.stroke();
        ctx.setLineDash([]);
        label(ctx, "edit frozen", sx(10.03) + 5, H - 9, C.fg, SANS_S);
      }
    },
  );
}

function timelineLP(ctx, W, H, t, C, sx, x0, x1) {
  const f = REDUCE ? 1 : ease(seg(t, 2, 4.5));
  const rows = [
    { y: 34, name: "Astra" },
    { y: 104, name: "LP" },
  ];
  const BH = 16;
  label(ctx, rows[0].name, x0, rows[0].y - 12, C.fg, SANS_B);
  label(ctx, `${rows[1].name}, given Astra's u and layers`, x0, rows[1].y - 12, C.fg, SANS_B);
  // Astra: the full run up to the freeze
  const astra = PHASES.slice(0, 3);
  for (const p of astra) {
    ctx.fillStyle = rgb(p.c, 0.85);
    ctx.fillRect(sx(p.a), rows[0].y, sx(p.b) - sx(p.a) - 1, BH);
  }
  label(ctx, "~8 h, 28 passes", (sx(2.33) + sx(10.03)) / 2, rows[0].y + BH / 2 + 1, "#fff", SANS_B, "center");
  label(ctx, W < 520 ? "+17 more" : "+ 17 confirmation passes", sx(10.03) + 6, rows[0].y + BH / 2 + 1, C.mute, SANS_S);
  // LP: same u and layers, then the v phase collapses to one solve
  for (const p of astra.slice(0, 2)) {
    ctx.fillStyle = rgb(p.c, 0.35);
    ctx.fillRect(sx(p.a), rows[1].y, sx(p.b) - sx(p.a) - 1, BH);
  }
  const vEnd = lerp(10.03, 2.33 + 1 / 60, f);
  ctx.fillStyle = rgb(COOL, 0.85);
  ctx.fillRect(sx(2.33), rows[1].y, Math.max(3, sx(vEnd) - sx(2.33)), BH);
  if (f > 0.95) {
    arrow(ctx, sx(2.33) + 50, rows[1].y + BH + 18, sx(2.33) + 3, rows[1].y + BH / 2 + 2, C.fg, 1.2, 6);
    label(ctx, W < 520 ? "LP solves, ~1 min each" : "a couple of LP solves, ~1 min each", sx(2.33) + 54, rows[1].y + BH + 19, C.fg, SANS_B);
  }
  label(ctx, "(from Astra)", (sx(0) + sx(2.33)) / 2, rows[1].y + BH + 12, C.mute, SANS_S, "center");
  for (const h of [0, 2, 4, 6, 8, 10]) label(ctx, `${h}h`, sx(h), H - 8, C.mute, SANS_S, "center");
}

// ---- l1-corner: why the L1 objective gives a sparse v ---------------------------

function l1Anim(canvas) {
  // constraints a·v <= b in (v1, v2)
  const CON = [
    { a: [1, 0.3], b: -1, kind: "loop", name: "looping token", lt: 0.93, dx: 7, al: "left" },
    { a: [0.8, -0.5], b: -1, kind: "loop", name: "looping token", lt: 0.9, dx: -7, al: "right" },
    { a: [0.2, 1], b: 0.6, kind: "prod", name: "productive token (both sides)", lt: 0.02, dx: 2, dy: -10, al: "left" },
    { a: [-0.2, -1], b: 0.6, kind: "prod" },
  ];
  const BOX = [-2.6, 1.4, -1.7, 1.7];
  let poly = [[BOX[0], BOX[2]], [BOX[1], BOX[2]], [BOX[1], BOX[3]], [BOX[0], BOX[3]]];
  for (const c of CON) poly = clip(poly, c);
  // L1 minimum: at a polygon vertex or where the polygon crosses an axis
  const cand = poly.slice();
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    for (const ax of [0, 1]) {
      if ((p[ax] <= 0 && q[ax] >= 0) || (p[ax] >= 0 && q[ax] <= 0)) {
        const s = p[ax] === q[ax] ? 0 : p[ax] / (p[ax] - q[ax]);
        cand.push([lerp(p[0], q[0], s), lerp(p[1], q[1], s)]);
      }
    }
  }
  let best = cand[0];
  for (const c of cand) if (Math.abs(c[0]) + Math.abs(c[1]) < Math.abs(best[0]) + Math.abs(best[1])) best = c;
  const rStar = Math.abs(best[0]) + Math.abs(best[1]);

  const CYCLE = 12;
  run(
    canvas,
    (W) => Math.min(340, Math.max(260, W * 0.55)),
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? CYCLE - 0.5 : (now / 1000) % CYCLE;
      const S = Math.min((W - 30) / (BOX[1] - BOX[0]), (H - 40) / (BOX[3] - BOX[2]));
      const cx = W / 2 - ((BOX[0] + BOX[1]) / 2) * S,
        cy = (H - 14) / 2;
      const X = (p) => [cx + p[0] * S, cy - p[1] * S];

      // axes
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(...X([BOX[0], 0]));
      ctx.lineTo(...X([BOX[1], 0]));
      ctx.moveTo(...X([0, BOX[2]]));
      ctx.lineTo(...X([0, BOX[3]]));
      ctx.stroke();
      const narrow = W < 520;
      label(ctx, narrow ? "v₁" : "v₁ (column 1)", X([BOX[1], 0])[0] - 2, X([0, 0])[1] + 12, C.mute, SANS_S, "right");
      label(ctx, narrow ? "v₂" : "v₂ (column 2)", X([0, BOX[3]])[0] + 6, X([0, BOX[3]])[1] + 8, C.mute, SANS_S);

      // feasible region
      const fr = ease(seg(t, 4.2, 5));
      if (fr > 0) {
        ctx.fillStyle = rgb(COOL, 0.16 * fr);
        ctx.beginPath();
        poly.forEach((p, i) => (i ? ctx.lineTo(...X(p)) : ctx.moveTo(...X(p))));
        ctx.closePath();
        ctx.fill();
        if (fr > 0.6) {
          const m = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
          label(ctx, "feasible", X([m[0] - 0.4, m[1]])[0], X(m)[1], rgb(COOL), SANS_S, "center");
        }
      }
      // constraint lines appear one by one
      CON.forEach((c, i) => {
        const a = ease(seg(t, 0.4 + Math.min(i, 2) * 1.2, 1.2 + Math.min(i, 2) * 1.2));
        if (a <= 0) return;
        const pts = lineInBox(c, BOX);
        if (!pts) return;
        ctx.globalAlpha = a;
        ctx.strokeStyle = c.kind === "loop" ? rgb(HOT) : rgb(COOL);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(...X(pts[0]));
        ctx.lineTo(...X(pts[1]));
        ctx.stroke();
        if (c.name) {
          const [lx, ly] = X([lerp(pts[0][0], pts[1][0], c.lt), lerp(pts[0][1], pts[1][1], c.lt)]);
          const name = narrow ? c.name.split(" ")[0] : c.name;
          label(ctx, name, lx + (c.dx || 0), ly + (c.dy || 0), ctx.strokeStyle, SANS_S, c.al);
        }
        ctx.globalAlpha = 1;
      });
      // L1 diamond grows until it touches the region
      const g = seg(t, 5.4, 8);
      if (g > 0) {
        const r = rStar * ease(g);
        ctx.strokeStyle = C.fg;
        ctx.lineWidth = 1.5;
        ctx.fillStyle = rgb([150, 145, 140], 0.08);
        ctx.beginPath();
        [[r, 0], [0, r], [-r, 0], [0, -r]].forEach((p, i) => (i ? ctx.lineTo(...X(p)) : ctx.moveTo(...X(p))));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        if (narrow) label(ctx, `|v₁| + |v₂| = ${r.toFixed(2)}`, W - 4, 10, C.fg, MONO_S, "right");
        else label(ctx, `|v₁| + |v₂| = ${r.toFixed(2)}`, X([0, -r])[0] + 8, X([0, -r])[1] + 10, C.fg, MONO_S);
      }
      if (t > 8.1) {
        const [bx, by] = X(best);
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, Math.PI * 2);
        ctx.fillStyle = C.fg;
        ctx.fill();
        label(ctx, narrow ? "first touch: v₂ = 0" : "first touch: v₂ = 0, column 2 unused", W / 2, H - 8, C.fg, SANS_B, "center");
      } else label(ctx, narrow ? "min |v₁| + |v₂|" : "min |v₁| + |v₂|  subject to the token constraints", W / 2, H - 8, C.mute, SANS_S, "center");
    },
  );
}

function clip(poly, c) {
  const f = (p) => c.a[0] * p[0] + c.a[1] * p[1] - c.b;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i],
      q = poly[(i + 1) % poly.length];
    const fp = f(p),
      fq = f(q);
    if (fp <= 0) out.push(p);
    if (fp * fq < 0) {
      const s = fp / (fp - fq);
      out.push([lerp(p[0], q[0], s), lerp(p[1], q[1], s)]);
    }
  }
  return out;
}
function lineInBox(c, B) {
  const pts = [];
  const [a1, a2] = c.a;
  if (Math.abs(a2) > 1e-9)
    for (const x of [B[0], B[1]]) {
      const y = (c.b - a1 * x) / a2;
      if (y >= B[2] && y <= B[3]) pts.push([x, y]);
    }
  if (Math.abs(a1) > 1e-9)
    for (const y of [B[2], B[3]]) {
      const x = (c.b - a2 * y) / a1;
      if (x > B[0] && x < B[1]) pts.push([x, y]);
    }
  if (pts.length < 2) return null;
  pts.sort((p, q) => p[0] - q[0]);
  return [pts[0], pts[pts.length - 1]];
}

// ---- dose: the steering vector at three strengths -------------------------------

function doseAnim(canvas) {
  DATA.then((D) => {
    const DOSES = [
      { k: "half", x: 0.5, l: "0.5×", dev: 51.6 },
      { k: "one", x: 1, l: "1×", dev: 57.8 },
      { k: "two", x: 2, l: "2×", dev: 31.2 },
    ];
    const STEP = 4.5,
      CYCLE = STEP * 3;
    const LH = 14,
      ROWS = 10;
    run(
      canvas,
      () => 78 + ROWS * LH + 64,
      (ctx, W, H, now) => {
        const C = colors();
        const t = REDUCE ? STEP + 1 : (now / 1000) % CYCLE;
        const i = Math.floor(t / STEP);
        const local = t - i * STEP;
        const d = DOSES[i],
          r = D.dose[d.k];
        // dose axis
        const ax0 = 40,
          ax1 = W - 40,
          // on narrow screens the three strengths are evenly spaced so their labels don't collide
          sx = W < 520 ? (x) => lerp(ax0, ax1, { 0.5: 0.12, 1: 0.5, 2: 0.88 }[x]) : (x) => lerp(ax0, ax1, x / 2.5);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax0, 34);
        ctx.lineTo(ax1, 34);
        ctx.stroke();
        label(ctx, "steering strength (× the LP edit's average push)", W / 2, 10, C.mute, SANS_S, "center");
        const prev = DOSES[(i + 2) % 3];
        const mx = REDUCE ? sx(d.x) : lerp(sx(i === 0 ? d.x : prev.x), sx(d.x), ease(local / 0.6));
        DOSES.forEach((q, j) => {
          const on = j === i;
          const c = q.k === "one" ? rgb(COOL) : rgb(HOT);
          ctx.beginPath();
          ctx.arc(sx(q.x), 34, on ? 0 : 4, 0, Math.PI * 2);
          ctx.fillStyle = C.mute;
          ctx.fill();
          label(ctx, q.l, sx(q.x), 52, on ? c : C.mute, on ? SANS_B : SANS, "center");
          label(ctx, `dev ${q.dev}%`, sx(q.x), 66, C.mute, SANS_S, "center");
        });
        ctx.beginPath();
        ctx.arc(mx, 34, 7, 0, Math.PI * 2);
        ctx.fillStyle = d.k === "one" ? rgb(COOL) : rgb(HOT);
        ctx.fill();

        // the generation's last lines
        const by = 82;
        rrect(ctx, 1, by, W - 2, ROWS * LH + 14, 8);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = MONO_S;
        const n = Math.floor((W - 24) / ctx.measureText("M").width);
        const lines = wrap(r.tail, n).filter((l) => l.trim()).slice(-ROWS);
        const fade = REDUCE ? 1 : ease(seg(local, 0.3, 0.9));
        ctx.globalAlpha = fade;
        lines.forEach((l, j) => {
          const boxed = /\\boxed\{/.test(l);
          const c = d.k === "half" ? rgb(HOT) : boxed ? (r.correct ? rgb(COOL) : rgb(HOT)) : C.fg;
          label(ctx, l, 12, by + 10 + j * LH + LH / 2, c, boxed ? MONO_B : MONO_S);
        });
        ctx.globalAlpha = 1;
        const msg =
          d.k === "half"
            ? `still loops: hit the 32,768-token limit, no answer`
            : r.correct
              ? `✓ answers ${r.pred} in ${fmt(r.n)} tokens`
              : `✗ answers ${r.pred} (correct: ${D.dose_problem.answer}): the loops are gone, and so is the reasoning`;
        label(ctx, msg, 4, H - 26, d.k === "one" ? rgb(COOL) : rgb(HOT), SANS_B);
        label(ctx, "last lines of the model's answer to one GSM8K training problem", 4, H - 8, C.mute, SANS_S);
      },
    );
  });
}

// ---- benchmarks: grouped bars -------------------------------------------------

function benchAnim(canvas) {
  const MODELS = [
    { l: "Base model", c: () => "#cfcac4" },
    { l: "Astra's edit (130k weights)", c: (C) => C.fg },
    { l: "LP, Astra's direction (16k)", c: () => rgb(COOL) },
    { l: "LP, heuristic direction (16k)", c: () => rgb(COOL, 0.5) },
  ];
  const GROUPS = [
    { l: "GSM8K test", v: [14.1, 68.2, 69.6, 65.4] },
    { l: "MATH-500", v: [7.0, 50.9, 51.7, 47.8] },
    { l: "Unseen train set", v: [12.1, 53.3, 56.6, 54.9] },
    { l: "IFEval (strict)", v: [22.9, 61.9, 59.7, 60.4] },
  ];
  run(
    canvas,
    (W) => (W < 560 ? 330 : 290),
    (ctx, W, H, now) => {
      const C = colors();
      const g = REDUCE ? 1 : ease(seg(now / 1000, 0.2, 1.6));
      const narrow = W < 560;
      // legend in two rows
      ctx.font = SANS;
      const half = narrow ? 2 : 4;
      [MODELS.slice(0, half), MODELS.slice(half)].forEach((row, r) => {
        if (row.length) legend(ctx, row.map((m) => ({ label: m.l, c: m.c(C) })), W / 2, 10 + r * 18, C);
      });
      const top = narrow ? 52 : 34,
        bot = H - 30;
      const sy = (v) => lerp(bot, top + 10, v / 80);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      for (const v of [0, 20, 40, 60, 80]) {
        ctx.beginPath();
        ctx.moveTo(30, sy(v));
        ctx.lineTo(W - 4, sy(v));
        ctx.stroke();
        label(ctx, `${v}`, 24, sy(v), C.mute, SANS_S, "right");
      }
      const gw = (W - 40) / GROUPS.length;
      const bw = Math.min(26, (gw - 16) / 4);
      GROUPS.forEach((G, i) => {
        const gx = 34 + i * gw + (gw - bw * 4) / 2;
        G.v.forEach((v, j) => {
          const x = gx + j * bw,
            y = sy(v * g);
          ctx.fillStyle = MODELS[j].c(C);
          ctx.fillRect(x + 1, y, bw - 2, bot - y);
          if (g > 0.98 && bw > 17) label(ctx, v.toFixed(0), x + bw / 2, y - 8, C.mute, SANS_S, "center");
        });
        label(ctx, G.l, 34 + i * gw + gw / 2, bot + 14, C.fg, narrow ? SANS_S : SANS, "center");
      });
      label(ctx, "accuracy, %", 2, top - 2, C.mute, SANS_S);
    },
  );
}

// ---- dispatch ---------------------------------------------------------------

const ANIMS = {
  "loop-trace": loopTraceAnim,
  "down-proj": downProjAnim,
  "loop-direction": loopDirectionAnim,
  flip: flipAnim,
  timeline: (c) => timelineAnim(c, false),
  "timeline-lp": (c) => timelineAnim(c, true),
  "l1-corner": l1Anim,
  dose: doseAnim,
  benchmarks: benchAnim,
};

for (const c of document.querySelectorAll("[data-hero-canvas]")) hero(c);
for (const c of document.querySelectorAll("[data-anim]")) {
  const fn = ANIMS[c.getAttribute("data-anim")];
  if (fn) fn(c);
}
