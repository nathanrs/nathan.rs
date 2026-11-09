/*
  Visuals for "Diffusion LLMs are Faster at Writing Code".

  The grape example, rebuilt from the post's original animation script
  (grape-animation.py): the prompt "Repeat the word grape over and over again."
  followed by 120 "grape" tokens. A diffusion model with confidence-aware
  parallel decoding fills every token in one step; speculative decoding with
  k = 5 commits five per step, 24 steps in all.
*/

import { colors, COOL, rgb, ease, seg, SANS_S, SANS_B, MONO_S, REDUCE, rrect, label, run, mount } from "./post-anim.js";

const PROMPT = "Repeat the word grape over and over again.";
const N = 120,
  K = 5,
  STEPS = N / K;
// token cell size; smaller on narrow screens
const cellW = (W) => (W < 520 ? 34 : 44);
const CH = 16,
  CG = 4;
const START = 1.0, // both start after a pause on the empty sequence
  SPEC_STEP = 0.22,
  HOLD = 3;
const CYCLE = START + STEPS * SPEC_STEP + HOLD;

const perRow = (W) => Math.max(4, Math.floor((W - 4 + CG) / (cellW(W) + CG)));
const gridH = (W) => Math.ceil(N / perRow(W)) * (CH + CG);
const panelH = (W) => 22 + 18 + gridH(W) + 8;

function grape(canvas) {
  run(
    canvas,
    (W) => panelH(W) * 2 + 18,
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? CYCLE - 0.1 : (now / 1000) % CYCLE;
      const pr = perRow(W);
      const CW = cellW(W);
      const font = W < 520 ? "9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" : MONO_S;

      // diffusion: everything above the confidence threshold in one step
      const diffDone = t >= START ? N : 0;
      const diffFlash = 1 - ease(seg(t - START, 0, 0.8));
      panel(0, "Diffusion LM", diffDone, diffDone ? "1 step" : "0 steps", diffDone ? diffFlash : 0, 0);

      // speculative decoding: K tokens per step
      const s = Math.max(0, Math.min(STEPS, Math.floor((t - START) / SPEC_STEP) + 1));
      const specDone = t >= START ? s * K : 0;
      const specFlash = 1 - ease(seg(t - START - (s - 1) * SPEC_STEP, 0, SPEC_STEP));
      panel(panelH(W) + 18, `Speculative decoding (k = ${K})`, specDone, `${t >= START ? s : 0} / ${STEPS} steps`, specFlash, specDone - K);

      function panel(y, name, done, count, flash, freshFrom) {
        label(ctx, name, 2, y + 8, C.fg, SANS_B);
        label(ctx, count, W - 2, y + 8, done === N ? rgb(COOL) : C.mute, done === N ? SANS_B : SANS_S, "right");
        label(ctx, PROMPT, 2, y + 30, C.mute, MONO_S);
        const gy = y + 40;
        for (let i = 0; i < N; i++) {
          const x = 2 + (i % pr) * (CW + CG),
            yy = gy + Math.floor(i / pr) * (CH + CG);
          if (i < done) {
            const fresh = i >= freshFrom;
            ctx.fillStyle = fresh && flash > 0 ? rgb(COOL, 0.18 + 0.5 * flash) : rgb(COOL, 0.14);
            rrect(ctx, x, yy, CW, CH, 3);
            ctx.fill();
            label(ctx, "grape", x + CW / 2, yy + CH / 2 + 1, C.fg, font, "center");
          } else {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 1;
            rrect(ctx, x + 0.5, yy + 0.5, CW - 1, CH - 1, 3);
            ctx.stroke();
          }
        }
      }
    },
  );
}

mount(null, { grape });
