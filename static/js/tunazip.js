/*
  Visuals for "Device-Independent Neural Compression".

  Hero: an H100 encodes a payload, then a B200 decodes it twice, in float mode
  and in exact mode. The text is the opening of enwik8's first article. The
  divergence point (the B200's second token) is the measured one; the wrong
  tokens after it are illustrative, drawn from common enwik8 words, since the
  real decoder's output past that point is noise.

  arith-coding: a real adaptive arithmetic coder over a three-letter alphabet,
  computed live, with the interval drawn to scale.

  one-bit: encoder and decoder each divide the interval, zoomed in on one
  boundary; the decoder's is rounded differently, so the same number lands in
  different pieces.

  exact-sum: one dot product summed in two orders, in float32 and in tunazip's
  exact arithmetic.

  Visual grammar matches the DetLLM post: cool = exact / identical, warm = float
  / divergence.
*/

import { colors, COOL, MID, HOT, rgb, clamp, lerp, ease, seg, fmt, SANS, SANS_S, SANS_B, MONO, MONO_S, MONO_B, REDUCE, rrect, label, run, mount } from "./post-anim.js";

// ---- text --------------------------------------------------------------------

const PASSAGE =
  "Anarchism originated as a term of abuse first used against early working class radicals including the Diggers of the English Revolution and the sans-culottes of the French Revolution. Whilst the term is still used in a pejorative way to describe \"any act that used violent means to destroy the organization of society\", it has also been taken up as a positive label by self-defined anarchists.";
const WORDS = PASSAGE.split(" ");

const POOL = "its com some all space been nbsp most than can into language many would xml only state two used small people about time org center left thumb may html jpg after year world between years will these when them over known her called him use often part name there ref being human minor while out both well number what made system could book became where form history during because century work through those before later then including acid much area any new each see like found did example early different note country based style life groups even war states include science three high several own she film major main links way term second same large crew long very last water now set city social since common political modern largest man under important four within oil animals against still section province general culture until theory court countries usually make land word image".split(
  " ",
);

function hash(n) {
  const x = Math.sin(n * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
}
function garbage(i) {
  const w = POOL[Math.floor(hash(i * 3 + 1) * POOL.length)];
  const r = hash(i * 7 + 2);
  if (r < 0.18) return w.slice(0, 1 + Math.floor(hash(i * 11 + 3) * 3));
  if (r < 0.3) return w + ",";
  if (r < 0.38) return "]]";
  return w;
}

// Lay out a token stream into lines; tokens from `wrongFrom` on are wrong.
// Returns lines of [{text, i}].
function layoutStream(ctx, font, n, wrongFrom, width) {
  ctx.font = font;
  const sp = ctx.measureText(" ").width;
  const lines = [[]];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const text = i < wrongFrom ? WORDS[i] : garbage(i);
    const w = ctx.measureText(text).width;
    if (x && x + w > width) {
      lines.push([]);
      x = 0;
    }
    lines[lines.length - 1].push({ text, i, x });
    x += w + sp;
  }
  return lines;
}

// Draw a decoded stream: correct tokens in fg, wrong ones in warm, the newest highlighted.
function drawStream(ctx, x, y, w, lh, maxLines, n, wrongFrom, side, C, font) {
  font = font || MONO_S;
  const lines = layoutStream(ctx, font, n, wrongFrom, w);
  const first = Math.max(0, lines.length - maxLines);
  lines.slice(first).forEach((line, r) => {
    for (const t of line) {
      const wrong = t.i >= wrongFrom;
      const col = t.i === n - 1 ? rgb(side) : wrong ? rgb(HOT, 0.8) : C.fg;
      label(ctx, t.text, x + t.x, y + r * lh + lh / 2, col, font);
    }
  });
  return Math.min(lines.length, maxLines);
}

// ---- hero ----------------------------------------------------------------------

const TOTAL_TOKENS = 268011;
const B200_WRONG = 267844;
const B200_FIRST_WRONG = 2; // measured: the B200's first wrong token in float mode

function hero(canvas) {
  const N = WORDS.length;
  const RATE = 12; // tokens per second
  const HOLD = 4500;
  const phaseMs = (N / RATE) * 1000;
  const total = 2 * phaseMs + HOLD;
  const ROWLAB = 18,
    LH = 15,
    LINES = 4,
    FRAME = LINES * LH + 6,
    GAP = 14,
    FOOT = 22,
    FILE = 26,
    ARROW = 44;
  const panelH = ROWLAB + FRAME + FOOT;

  function frame(ctx, C, x, y, w, h) {
    ctx.fillStyle = C.soft;
    rrect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
  }

  run(
    canvas,
    (W) => (W < 600 ? 3 * panelH + FILE + 2 * GAP : 2 * panelH + GAP),
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? total - 1 : now % total;
      const encN = Math.min(N, Math.floor((t / 1000) * RATE) + 1);
      const encoded = t >= phaseMs;
      const decN = encoded ? Math.min(N, Math.floor(((t - phaseMs) / 1000) * RATE) + 1) : 0;
      const done = t >= 2 * phaseMs;
      const narrow = W < 600;
      const lw = narrow ? W : Math.round(W * 0.44);
      const rx = narrow ? 0 : lw + ARROW;
      const rw = narrow ? W : W - rx;

      // encoder, centered against the two decoders on wide layouts
      const leftH = ROWLAB + FRAME + FOOT + 28;
      let y = narrow ? 0 : Math.round((H - leftH) / 2);
      label(ctx, "H100, encoder", 0, y + ROWLAB / 2, C.fg, SANS_B);
      label(ctx, encoded ? "done" : `token ${encN}`, lw, y + ROWLAB / 2, C.mute, SANS_S, "right");
      y += ROWLAB;
      frame(ctx, C, 0, y, lw, FRAME);
      drawStream(ctx, 8, y + 3, lw - 16, LH, LINES, encN, Infinity, MID, C);
      ctx.restore();
      y += FRAME;
      // compressed file bar
      const by = y + FOOT / 2 + 2;
      const frac = encN / N;
      ctx.fillStyle = C.soft;
      rrect(ctx, 0, by - 5, lw, 10, 5);
      ctx.fill();
      ctx.fillStyle = rgb(MID, encoded ? 0.9 : 0.6);
      rrect(ctx, 0, by - 5, lw * frac, 10, 5);
      ctx.fill();
      label(ctx, encoded ? "compressed file, 1 MB of enwik8" : "writing compressed file", 0, by + 16, C.mute, SANS_S);
      const leftBottom = by + 28;

      // arrow from file to decoders
      ctx.strokeStyle = rgb(MID, encoded ? 0.9 : 0.25);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.5;
      if (!narrow) {
        const ay = by;
        const ax0 = lw + 10,
          ax1 = rx - 10;
        ctx.beginPath();
        ctx.moveTo(ax0, ay);
        ctx.lineTo(ax1 - 6, ay);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax1, ay);
        ctx.lineTo(ax1 - 7, ay - 4.5);
        ctx.lineTo(ax1 - 7, ay + 4.5);
        ctx.closePath();
        ctx.fill();
      }

      // decoders
      const decs = [
        { title: "B200, decoder · float (bf16)", side: HOT, wrongFrom: B200_FIRST_WRONG, tag: "wrong from token 2", foot: `${fmt(B200_WRONG)} of ${fmt(TOTAL_TOKENS)} tokens wrong` },
        { title: "B200, decoder · exact (tunazip)", side: COOL, wrongFrom: Infinity, tag: "identical", foot: `${fmt(TOTAL_TOKENS)} tokens, 0 wrong, bytes identical` },
      ];
      let dy = narrow ? leftBottom + GAP : 0;
      decs.forEach((D, i) => {
        label(ctx, D.title, rx, dy + ROWLAB / 2, C.fg, SANS_B);
        if (decN > D.wrongFrom || (decN > 0 && D.wrongFrom === Infinity)) label(ctx, D.tag, rx + rw, dy + ROWLAB / 2, rgb(D.side), SANS_S, "right");
        else label(ctx, encoded ? `token ${decN}` : "waiting for file", rx + rw, dy + ROWLAB / 2, C.mute, SANS_S, "right");
        dy += ROWLAB;
        frame(ctx, C, rx, dy, rw, FRAME);
        if (decN > 0) drawStream(ctx, rx + 8, dy + 3, rw - 16, LH, LINES, decN, D.wrongFrom, D.side, C);
        ctx.restore();
        dy += FRAME;
        if (done) label(ctx, D.foot, rx, dy + FOOT / 2 + 2, rgb(D.side), SANS_B);
        dy += FOOT + (i === 0 ? GAP : 0);
      });
    },
  );
}

// ---- arithmetic coder -----------------------------------------------------------

// Adaptive model over an alphabet: counts start at 1, the coded token's count
// goes up by 1. Encodes `text` and returns one record per step with the interval
// before and after, the split, and the cost in bits.
function arithTrace(text, alphabet) {
  const counts = Object.fromEntries(alphabet.map((a) => [a, 1]));
  let lo = 0,
    hi = 1;
  const steps = [];
  for (const ch of text) {
    const total = alphabet.reduce((s, a) => s + counts[a], 0);
    const probs = alphabet.map((a) => counts[a] / total);
    let cum = 0;
    const splits = alphabet.map((a, i) => {
      const s = { sym: a, p: probs[i], lo: lo + (hi - lo) * cum, hi: lo + (hi - lo) * (cum + probs[i]) };
      cum += probs[i];
      return s;
    });
    const k = alphabet.indexOf(ch);
    steps.push({ sym: ch, lo, hi, splits, k, p: probs[k], bits: -Math.log2(probs[k]), nlo: splits[k].lo, nhi: splits[k].hi });
    lo = splits[k].lo;
    hi = splits[k].hi;
    counts[ch]++;
  }
  return { steps, lo, hi, bits: -Math.log2(hi - lo) };
}

const ALPHA = ["a", "b", "n"];
const TEXT = "banana";

function bin(x, digits) {
  let s = "0.";
  for (let i = 0; i < digits; i++) {
    x *= 2;
    if (x >= 1) {
      s += "1";
      x -= 1;
    } else s += "0";
  }
  return s;
}

// The shortest binary fraction strictly inside [lo, hi).
function codeword(lo, hi) {
  for (let d = 1; d < 40; d++) {
    const scale = 2 ** d;
    const k = Math.ceil(lo * scale);
    if (k / scale < hi) return { value: k / scale, text: bin(k / scale, d), bits: d };
  }
  return { value: lo, text: bin(lo, 40), bits: 40 };
}

// The view window [vlo, vhi] interpolates from the current interval to the kept
// piece. `nested` is the next step's splits, drawn inside the kept piece at
// alpha `nestA`, so the zoom ends on exactly what the next step starts with.
function drawInterval(ctx, x, y, w, h, lo, hi, splits, k, zoom, C, side, mark, tintA, nested, nestA) {
  const vlo = lerp(lo, splits[k].lo, zoom),
    vhi = lerp(hi, splits[k].hi, zoom);
  const px = (v) => x + ((v - vlo) / (vhi - vlo)) * w;
  const piece = (s, fill, labelCol, alpha) => {
    const a = px(s.lo),
      b = px(s.hi);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.fillRect(a, y, Math.max(0, b - a - 1), h);
    if (b - a > 22) label(ctx, s.sym, (a + b) / 2, y + h / 2, labelCol, MONO_B, "center");
    ctx.globalAlpha = 1;
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 1, y - 20, w + 2, h + 40);
  ctx.clip();
  splits.forEach((s, i) => {
    if (i !== k) return piece(s, C.line, C.mute, 1);
    piece(s, C.line, tintA > 0 ? C.fg : C.mute, 1);
    if (tintA > 0) {
      ctx.globalAlpha = tintA;
      ctx.fillStyle = rgb(side, 0.6);
      ctx.fillRect(px(s.lo), y, Math.max(0, px(s.hi) - px(s.lo) - 1), h);
      ctx.globalAlpha = 1;
    }
  });
  if (nested && nestA > 0) {
    // the kept piece is outlined and its sub-pieces drop in as shorter bars,
    // growing to full height as the zoom brings them to the bar's edges
    const a = px(splits[k].lo),
      b = px(splits[k].hi);
    const inset = 7 * nestA * (1 - zoom);
    const fade = nestA * (1 - zoom);
    ctx.globalAlpha = nestA;
    ctx.fillStyle = C.bg;
    ctx.fillRect(a, y, Math.max(0, b - a - 1), h);
    ctx.globalAlpha = 1;
    nested.forEach((s) => {
      const na = px(s.lo),
        nb = px(s.hi);
      ctx.globalAlpha = nestA;
      ctx.fillStyle = C.line;
      ctx.fillRect(na, y + inset, Math.max(0, nb - na - 1), h - 2 * inset);
      ctx.globalAlpha = 0.35 * fade;
      ctx.fillStyle = rgb(side);
      ctx.fillRect(na, y + inset, Math.max(0, nb - na - 1), h - 2 * inset);
      ctx.globalAlpha = nestA;
      if (nb - na > 22) label(ctx, s.sym, (na + nb) / 2, y + h / 2, C.mute, MONO_B, "center");
      ctx.globalAlpha = 1;
    });
    ctx.globalAlpha = fade;
    ctx.strokeStyle = rgb(side);
    ctx.lineWidth = 2;
    ctx.strokeRect(a - 1, y - 1, Math.max(0, b - a - 1) + 2, h + 2);
    ctx.globalAlpha = 1;
  }
  if (mark !== undefined && mark !== null) {
    const mx = px(mark);
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx, y - 6);
    ctx.lineTo(mx, y + h + 6);
    ctx.stroke();
  }
  ctx.restore();
  return { vlo, vhi };
}

function arithAnim(canvas) {
  const tr = arithTrace(TEXT, ALPHA);
  const STEP = 3200,
    HOLD = 4000;
  const total = tr.steps.length * STEP + HOLD;
  const BAR = 44;
  // phases within a step: show split, highlight the kept piece, nest the next
  // split inside it, zoom until it fills the bar
  const T_KEEP = 0.18,
    T_NEST = 0.32,
    T_ZOOM = 0.58,
    T_END = 0.97;
  const BIG = "600 16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

  run(
    canvas,
    () => 112,
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? total - 1 : now % total;
      const final = t >= tr.steps.length * STEP;
      const si = Math.min(tr.steps.length - 1, Math.floor(t / STEP));
      const u = final ? 1 : (t - si * STEP) / STEP;
      const S = tr.steps[si];
      const next = tr.steps[si + 1] || null;
      const keep = ease(seg(u, T_KEEP, T_NEST));
      const nest = ease(seg(u, T_NEST, T_ZOOM));
      const zoom = ease(seg(u, T_ZOOM, T_END));
      const tintA = final ? 0.5 : keep * (1 - zoom);
      const kept = final ? tr.steps.length : si + (u >= T_KEEP ? 1 : 0);
      const bits = tr.steps.slice(0, kept).reduce((a, R) => a + R.bits, 0);

      // message with the current token highlighted
      label(ctx, "message", 0, 12, C.mute, SANS_S);
      let x = 68;
      for (let i = 0; i < TEXT.length; i++) {
        const done = i < kept;
        const cur = i === si && !final && u < T_KEEP;
        label(ctx, TEXT[i], x, 12, cur ? rgb(COOL) : done ? C.fg : C.mute, BIG);
        x += 14;
      }
      label(ctx, `bits so far: ${bits.toFixed(2)}`, W, 12, kept && !final ? rgb(COOL) : C.fg, MONO, "right");

      // interval bar
      const by = 40;
      label(ctx, "interval", 0, by + BAR / 2, C.mute, SANS_S);
      const bx = 68,
        bw = W - bx;
      drawInterval(ctx, bx, by, bw, BAR, S.lo, S.hi, S.splits, S.k, final ? 1 : zoom, C, COOL, null, tintA, next ? next.splits : null, nest);
      label(ctx, "0", bx, by + BAR + 14, C.mute, MONO_S, "left");
      label(ctx, "1", bx + bw, by + BAR + 14, C.mute, MONO_S, "right");

    },
  );
}

// ---- one bit -------------------------------------------------------------------

function oneBitAnim(canvas) {
  // Encoder and decoder each divide the interval; the decoder's boundary slides
  // one unit below the encoder's, so the same coded number lands in different
  // pieces on the two rows.
  const T0 = 1400,
    SLIDE = 1200,
    HOLD = 3400;
  const total = T0 + SLIDE + HOLD;
  const GAP = 22; // px between the two boundaries at full slide

  run(
    canvas,
    () => 150,
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? total - 1 : now % total;
      const slide = ease(seg(t, T0, T0 + SLIDE));
      const split = slide >= 1;
      const lx = 80,
        bw = W - lx,
        BAR = 30;
      const xe = lx + bw * 0.58; // encoder's boundary
      const xn = xe - GAP * 0.45; // the coded number

      label(ctx, "zoomed in on one boundary", 0, 10, C.mute, SANS_S);
      label(ctx, "coded number", xn, 10, C.fg, SANS_S, "center");

      const rows = [
        { name: "encoder", y: 28, xb: xe, side: COOL, reads: "a" },
        { name: "decoder", y: 28 + BAR + 30, xb: xe - GAP * slide, side: split ? HOT : COOL, reads: split ? "n" : "a" },
      ];
      for (const R of rows) {
        label(ctx, R.name, 0, R.y + BAR / 2, C.mute, SANS_S);
        const pieces = [
          { sym: "a", x0: lx, x1: R.xb },
          { sym: "n", x0: R.xb, x1: lx + bw },
        ];
        for (const P of pieces) {
          const hit = P.sym === R.reads;
          ctx.fillStyle = hit ? rgb(R.side, 0.4) : C.line;
          ctx.fillRect(P.x0, R.y, Math.max(0, P.x1 - P.x0 - 1), BAR);
          label(ctx, P.sym, (P.x0 + P.x1) / 2, R.y + BAR / 2, hit ? C.fg : C.mute, MONO_B, "center");
        }
        label(ctx, `reads "${R.reads}"`, lx + bw, R.y + BAR + 13, rgb(R.side), SANS_B, "right");
        if (R.name === "decoder" && split) label(ctx, "rounded differently on this GPU", R.xb - 6, R.y + BAR + 13, rgb(HOT), SANS_S, "right");
      }

      // the coded number runs through both rows
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xn, 20);
      ctx.lineTo(xn, rows[1].y + BAR + 4);
      ctx.stroke();
    },
  );
}

// ---- exact sum -------------------------------------------------------------------

// One dot product, 1,024 terms, summed left to right and right to left. In
// float32 the two orders round differently and the results disagree. With the
// operands rounded to 16 significant bits on a shared exponent and the sums
// done in float64, every partial sum is exact and the two orders agree.
const K = 1024;
const OPS = (() => {
  const gauss = (i) => {
    const u = hash(i) || 1e-9,
      v = hash(i + 7919);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const a = [],
    b = [];
  for (let i = 0; i < K; i++) {
    a.push(Math.fround(gauss(i * 2 + 1) * 0.7));
    b.push(Math.fround(gauss(i * 2 + 2) * 0.7));
  }
  return { a, b };
})();
function roundBits(xs, bits) {
  const max = Math.max(...xs.map(Math.abs));
  const scale = 2 ** (Math.floor(Math.log2(max)) - (bits - 1));
  return xs.map((x) => Math.round(x / scale) * scale);
}
const OPS16 = { a: roundBits(OPS.a, 16), b: roundBits(OPS.b, 16) };
function sumFloat32(n, reverse) {
  let s = 0;
  for (let k = 0; k < n; k++) {
    const i = reverse ? n - 1 - k : k;
    s = Math.fround(s + Math.fround(OPS.a[i] * OPS.b[i]));
  }
  return s;
}
function sumExact(n, reverse) {
  let s = 0;
  for (let k = 0; k < n; k++) {
    const i = reverse ? n - 1 - k : k;
    s += OPS16.a[i] * OPS16.b[i];
  }
  return s;
}

function exactSumAnim(canvas) {
  const PLAY = 7000,
    HOLD = 3500;
  const total = PLAY + HOLD;
  const ROW = 20,
    HEAD = 22,
    TOP = 26,
    GAP = 18;
  const panelH = HEAD + 2 * ROW;

  run(
    canvas,
    () => TOP + 2 * panelH + GAP,
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? total - 1 : now % total;
      const n = Math.max(1, Math.min(K, Math.round(ease(seg(t, 0, PLAY)) * K)));
      const narrow = W < 560;
      const lx = narrow ? 0 : 100; // row label width
      ctx.font = MONO;
      const vw = ctx.measureText("-0.000000000000").width; // value column
      const sw = W - lx - vw - 28; // strip spans the rest

      // what is being summed
      label(ctx, narrow ? "a₁b₁ + ⋯ + a₁₀₂₄b₁₀₂₄, added in two orders" : "a₁b₁ + a₂b₂ + ⋯ + a₁₀₂₄b₁₀₂₄, the same 1,024 terms added in two orders", 0, 10, C.fg, SANS);

      const panels = [
        { title: "float32", sum: sumFloat32, side: HOT, digits: 9, y: TOP },
        { title: "16-bit operands, float64 sums", sum: sumExact, side: COOL, digits: 12, y: TOP + panelH + GAP },
      ];
      for (const P of panels) {
        label(ctx, P.title, 0, P.y + 10, C.fg, SANS_B);
        const lr = P.sum(n, false).toPrecision(P.digits);
        const rl = P.sum(n, true).toPrecision(P.digits);
        let d = 0;
        while (d < lr.length && lr[d] === rl[d]) d++;
        const same = d === lr.length && lr.length === rl.length;
        ctx.font = SANS_B;
        label(ctx, same ? "identical" : "different", ctx.measureText(P.title).width + 8, P.y + 10, rgb(same ? COOL : HOT), SANS_B);
        [
          { name: "first to last", val: lr, fromRight: false },
          { name: "last to first", val: rl, fromRight: true },
        ].forEach((R, r) => {
          const y = P.y + HEAD + r * ROW + ROW / 2;
          if (!narrow) label(ctx, R.name, 0, y, C.mute, SANS_S);
          // progress strip: the terms added so far, filling from the order's starting end
          ctx.fillStyle = C.line;
          ctx.fillRect(lx + 6, y - 5, sw - 12, 10);
          const fw = ((sw - 12) * n) / K;
          ctx.fillStyle = rgb(P.side, 0.6);
          ctx.fillRect(R.fromRight ? lx + sw - 6 - fw : lx + 6, y - 5, fw, 10);
          // arrow head showing direction
          ctx.fillStyle = C.mute;
          const ax = R.fromRight ? lx : lx + sw;
          ctx.beginPath();
          ctx.moveTo(ax, y);
          ctx.lineTo(ax + (R.fromRight ? 5 : -5), y - 4);
          ctx.lineTo(ax + (R.fromRight ? 5 : -5), y + 4);
          ctx.closePath();
          ctx.fill();
          // value, right-aligned, differing digits in red
          ctx.font = MONO;
          const head = R.val.slice(0, d),
            tail = R.val.slice(d);
          const tw = ctx.measureText(tail).width;
          label(ctx, head, W - tw, y, C.fg, MONO, "right");
          if (tail) label(ctx, tail, W, y, rgb(HOT), MONO_B, "right");
        });
      }
      if (!narrow) label(ctx, `${fmt(n)} of ${fmt(K)} terms`, W, 10, C.mute, SANS_S, "right");
    },
  );
}

mount(hero, { "arith-coding": arithAnim, "one-bit": oneBitAnim, "exact-sum": exactSumAnim });
