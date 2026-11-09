/*
  Visuals for "BERT is just a Single Text Diffusion Step".

  Replays real generations, recovered from the post's original GIFs
  (roberta-diffusion.json): every denoising step of the fine-tuned RoBERTa, and
  the GPT-2 continuation of the same prompt.

  The paragraph is laid out once, with the final text's words as fixed slots, so
  nothing moves between steps. Each step's snapshot was aligned onto those slots:
  a slot is a mask (a bar the width of its final word), its final word, or, when
  the model had a different word there at that step, that word in gray (or a
  mask, if it doesn't fit the slot). Words
  decoded at a step land in blue and settle to the text color. The
  alignment is approximate (it matches OCR'd text, not the model's token
  positions). Timing follows the post: about 13 s for RoBERTa, 9 s for GPT-2.
*/

import { colors, COOL, rgb, seg, ease, SANS_S, SANS_B, MONO, REDUCE, rrect, label, run, monoCols, wrapTokens, wrap, loadJSON, mount } from "./post-anim.js";

const DATA = loadJSON("./roberta-diffusion.json", import.meta.url);
const FONT = MONO;
const LH = 17;
const FADE = 0.45; // seconds for a slot to change

// Draw one slot in a given state: 0 = mask, 1 = final word, string = another word.
// glow: 0..1, how blue a newly decoded word still is.
function drawSlot(ctx, word, state, x, y, cw, alpha, C, glow = 0) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  // a different word that doesn't fit its slot reads as a mask, so nothing gets cut off
  if (state === 0 || (typeof state === "string" && state.length > word.length)) {
    ctx.fillStyle = C.line;
    rrect(ctx, x + 1, y - 4, Math.max(1, word.length) * cw - 2, 8, 2);
    ctx.fill();
  } else if (state === 1) {
    // blend from the accent blue to the text color, never stacking one on the other
    if (glow < 1) {
      ctx.globalAlpha = alpha * (1 - glow);
      label(ctx, word, x, y, C.fg, FONT);
    }
    if (glow > 0) {
      ctx.globalAlpha = alpha * glow;
      label(ctx, word, x, y, rgb(COOL), FONT);
    }
  }
  else {
    // a different word than the final one, in gray
    label(ctx, state, x, y, C.mute, FONT);
  }
  ctx.globalAlpha = 1;
}

// Draw step k of a generation in the fixed layout, crossfading from step k - 1.
// since: seconds since step k began. Words decoded at this step land in blue and settle.
function drawStep(ctx, gen, k, since, x, y, w, C) {
  // the old state fades out, then the new one fades in, so two words never overlap
  const out = k === 0 ? 1 : ease(seg(since, 0, FADE / 2));
  const inn = k === 0 ? 1 : ease(seg(since, FADE / 2, FADE));
  const glow = k === 0 ? 0 : 1 - ease(seg(since, FADE, FADE + 1.2));
  const cols = monoCols(ctx, FONT, w);
  ctx.font = FONT;
  const cw = ctx.measureText("M").width;
  const cur = gen.states[k],
    prev = gen.states[Math.max(0, k - 1)];
  wrapTokens(gen.words, cols).forEach((line, r) => {
    for (const { i, x: col } of line) {
      const px = x + col * cw,
        py = y + r * LH + LH / 2;
      const word = gen.words[i];
      if (cur[i] === prev[i]) drawSlot(ctx, word, cur[i], px, py, cw, 1, C);
      else {
        drawSlot(ctx, word, prev[i], px, py, cw, 1 - out, C);
        drawSlot(ctx, word, cur[i], px, py, cw, inn, C, cur[i] === 1 ? glow : 0);
      }
    }
  });
}

const linesFor = (ctx, gen, w) => wrapTokens(gen.words, monoCols(ctx, FONT, w)).length;

// ---- hero: one generation, step by step ---------------------------------------

function hero(canvas) {
  DATA.then((D) => {
    const gen = D.hero;
    const n = gen.states.length;
    const STEP = 1.1,
      HOLD = 3,
      CYCLE = n * STEP + HOLD,
      HEAD = 30;
    run(
      canvas,
      (W, ctx) => HEAD + linesFor(ctx, gen, W - 4) * LH + 10,
      (ctx, W, H, now) => {
        const C = colors();
        const t = REDUCE ? CYCLE - 0.1 : (now / 1000) % CYCLE;
        const k = Math.min(n - 1, Math.floor(t / STEP));

        label(ctx, `RoBERTa diffusion · step ${k}/${n - 1}`, 2, 10, C.fg, SANS_B);
        for (let s = 0; s < n; s++) {
          const cx = W - 6 - (n - 1 - s) * 13;
          ctx.beginPath();
          ctx.arc(cx, 10, s === k ? 4 : 3, 0, Math.PI * 2);
          ctx.fillStyle = s <= k ? rgb(COOL, s === k ? 1 : 0.55) : C.line;
          ctx.fill();
        }
        drawStep(ctx, gen, k, t - k * STEP, 2, HEAD, W - 4, C);
      },
    );
  });
}

// ---- compare: RoBERTa diffusion vs GPT-2, in real time ------------------------

function compare(canvas) {
  DATA.then((D) => {
    const gen = D.cmp_roberta;
    const n = gen.states.length;
    const RT = D.roberta_seconds,
      GT = D.gpt_seconds,
      HOLD = 3,
      CYCLE = Math.max(RT, GT) + HOLD;
    const HEAD = 40,
      GAP = 20,
      stackAt = 640;
    const panelW = (W) => (W < stackAt ? W - 4 : (W - GAP) / 2 - 2);
    const panelH = (W, ctx) => {
      const w = panelW(W);
      const gl = wrap(D.cmp_gpt, monoCols(ctx, FONT, w)).length;
      return HEAD + Math.max(linesFor(ctx, gen, w), gl) * LH + 8;
    };
    run(
      canvas,
      (W, ctx) => (W < stackAt ? panelH(W, ctx) * 2 + GAP : panelH(W, ctx)),
      (ctx, W, H, now) => {
        const C = colors();
        const t = REDUCE ? CYCLE : (now / 1000) % CYCLE;
        const narrow = W < stackAt;
        const pw = panelW(W);
        const ph = panelH(W, ctx);

        function header(x, y, name, elapsed, total) {
          const done = elapsed >= total;
          label(ctx, name, x, y + 8, C.fg, SANS_B);
          label(ctx, done ? `done in ~${total} s` : `${elapsed.toFixed(1)} s`, x + pw, y + 8, done ? rgb(COOL) : C.mute, done ? SANS_B : SANS_S, "right");
          ctx.fillStyle = C.line;
          rrect(ctx, x, y + 20, pw, 3, 1.5);
          ctx.fill();
          ctx.fillStyle = rgb(COOL);
          rrect(ctx, x, y + 20, pw * Math.min(1, elapsed / total), 3, 1.5);
          ctx.fill();
        }

        // RoBERTa: 10 steps spread evenly over its run time
        const stepT = RT / (n - 1);
        const k = Math.min(n - 1, Math.floor(Math.min(t, RT) / stepT + 1e-9));
        header(2, 0, `RoBERTa diffusion · step ${k}/${n - 1}`, Math.min(t, RT), RT);
        drawStep(ctx, gen, k, t - k * stepT, 2, HEAD, pw, C);

        // GPT-2: one token after another; characters revealed in proportion to time
        const gx = narrow ? 2 : pw + GAP + 2,
          gy = narrow ? ph + GAP : 0;
        header(gx, gy, "GPT-2 · left to right", Math.min(t, GT), GT);
        const gen2 = D.cmp_gpt.slice(D.prompt.length);
        const shown = D.prompt + gen2.slice(0, Math.round(gen2.length * Math.min(1, t / GT)));
        wrap(shown, monoCols(ctx, FONT, pw)).forEach((line, r) => {
          label(ctx, line, gx, gy + HEAD + r * LH + LH / 2, C.fg, FONT);
        });
      },
    );
  });
}

mount(hero, { "roberta-vs-gpt": compare });
