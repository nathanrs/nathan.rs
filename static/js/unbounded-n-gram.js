/*
  Visuals for "Language Modeling Without Neural Networks".

  race:     the real outputs from the post's original GIF (unbounded-n-gram.json):
            infini-gram and nanoGPT each continuing "First Citizen:" for 1,000
            characters, in 0.08 s and 19.76 s, both played at the same 5x speed.
  suffix:   building the suffix array of the post's toy dataset, AABBCCBC.
  interp:   selective back-off interpolation on a real context from Tiny
            Shakespeare, with the real match counts and next-character counts
            (computed from the dataset, stored in the JSON).
*/

import { colors, COOL, rgb, lerp, ease, seg, SANS, SANS_S, SANS_B, MONO, MONO_S, MONO_B, REDUCE, rrect, label, run, monoCols, wrap, loadJSON, mount } from "./post-anim.js";

const DATA = loadJSON("./unbounded-n-gram.json", import.meta.url);
const TEXT = "AABBCCBC";
const SA = [...TEXT].map((_, i) => i).sort((a, b) => (TEXT.slice(a) < TEXT.slice(b) ? -1 : 1));
const cellW = (ctx, font) => {
  ctx.font = font;
  return ctx.measureText("M").width;
};

// ---- race: infini-gram vs nanoGPT at one constant speed ------------------------

const SPEED = 5;

function race(canvas) {
  DATA.then((D) => {
    const LH = 13,
      HEAD = 44,
      GAP = 20,
      BAR = 56;
    const endA = D.right_time / SPEED;
    const CYCLE = endA + 3.5;
    // fewer visible lines on phones; each panel still scrolls to its newest text
    const rowsFor = (W) => (W < 560 ? 16 : 30);
    const panelHFor = (W) => HEAD + rowsFor(W) * LH + 8;
    run(
      canvas,
      (W) => panelHFor(W) + BAR,
      (ctx, W, H, now) => {
        const C = colors();
        const ROWS = rowsFor(W),
          panelH = panelHFor(W);
        const a = REDUCE ? CYCLE : (now / 1000) % CYCLE;
        const real = a * SPEED;
        const pw = (W - GAP) / 2 - 1;

        panel(1, "Infini-gram", D.left, D.left_time);
        panel(pw + GAP, "nanoGPT", D.right, D.right_time);

        function panel(x, name, text, total) {
          const frac = Math.min(1, real / total);
          const done = frac >= 1;
          label(ctx, name, x, 8, C.fg, SANS_B);
          label(ctx, done ? `done in ${total.toFixed(2)} s` : `${real.toFixed(2)} s`, x + pw, 8, done ? rgb(COOL) : C.mute, done ? SANS_B : SANS_S, "right");
          ctx.fillStyle = C.line;
          rrect(ctx, x, 20, pw, 3, 1.5);
          ctx.fill();
          ctx.fillStyle = rgb(COOL);
          rrect(ctx, x, 20, pw * frac, 3, 1.5);
          ctx.fill();
          label(ctx, `${Math.round(frac * 1000)} / 1,000 characters`, x, 34, C.mute, SANS_S);
          const shown = text.slice(0, Math.round(text.length * frac));
          const lines = wrap(shown, monoCols(ctx, MONO_S, pw));
          const start = Math.max(0, lines.length - ROWS);
          lines.slice(start).forEach((l, r) => {
            const speaker = /^[A-Z][A-Za-z ]*:$/.test(l) && l.split(" ").length <= 3;
            label(ctx, l, x, HEAD + r * LH + LH / 2, speaker ? C.mute : C.fg, MONO_S);
          });
        }

        // real-time axis: where each model finished
        const y = panelH + 24,
          x0 = 1,
          x1 = W - 1,
          maxT = 20;
        const sx = (s) => x0 + (Math.min(s, maxT) / maxT) * (x1 - x0);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        for (const [tSec, name] of [
          [D.left_time, "infini-gram"],
          [D.right_time, "nanoGPT"],
        ]) {
          if (real < tSec) continue;
          ctx.fillStyle = rgb(COOL);
          ctx.fillRect(sx(tSec) - 1, y - 5, 2, 10);
          label(ctx, `${name} · ${tSec} s`, sx(tSec) + (tSec < 10 ? 5 : -5), y - 10, rgb(COOL), SANS_S, tSec < 10 ? "left" : "right");
        }
        ctx.fillStyle = C.fg;
        ctx.beginPath();
        ctx.arc(Math.min(sx(real), x1 - 3), y, 3, 0, Math.PI * 2);
        ctx.fill();
        label(ctx, `real time · playing at ${SPEED}× speed`, x0, y + 16, C.mute, SANS_S);
        label(ctx, `${maxT} s`, x1, y + 16, C.mute, SANS_S, "right");
      },
    );
  });
}

// ---- suffix: build the suffix array of AABBCCBC ---------------------------------
// Three aligned columns: the suffixes in text order, each sliding into its sorted
// row, and the suffix array, read off the sorted rows one index at a time.

function suffixAnim(canvas) {
  const RH = 22,
    TOP = 26,
    CYCLE = 10;
  const rank = [];
  SA.forEach((idx, r) => (rank[idx] = r));
  run(
    canvas,
    () => TOP + TEXT.length * RH + 6,
    (ctx, W, H, now) => {
      const C = colors();
      const t = REDUCE ? CYCLE - 0.1 : (now / 1000) % CYCLE;
      const cw = cellW(ctx, MONO);
      const colW = cw * TEXT.length + 34;
      const arrW = 60;
      const gap = Math.min(110, (W - 2 * colW - arrW) / 2 - 4);
      const lx = (W - (2 * colW + arrW + 2 * gap)) / 2;
      const rx = lx + colW + gap;
      const ax = rx + colW + gap;

      const T_READ = 3.4,
        READ = 0.45;
      const reading = Math.min(SA.length - 1, Math.floor((t - T_READ) / READ));
      const readingOn = t >= T_READ && t < T_READ + SA.length * READ;

      label(ctx, "suffixes, in text order", lx, 8, C.mute, SANS_S);
      label(ctx, "sorted", rx, 8, C.mute, SANS_S);
      label(ctx, "suffix array", ax + arrW / 2, 8, C.mute, SANS_S, "center");

      const row = (x, y, i, idxColor, textColor, on) => {
        if (on) {
          ctx.fillStyle = rgb(COOL, 0.14);
          rrect(ctx, x - 4, y + 1, colW - 4, RH - 4, 4);
          ctx.fill();
        }
        label(ctx, String(i), x + 10, y + RH / 2, idxColor, MONO_B, "right");
        label(ctx, TEXT.slice(i), x + 22, y + RH / 2, textColor, MONO);
      };

      for (let i = 0; i < TEXT.length; i++) {
        // the original stays on the left (dimmed once copied); a copy slides to its sorted row
        const p = ease(seg(t, 0.8 + i * 0.12, 1.8 + i * 0.12));
        const yL = TOP + i * RH,
          yR = TOP + rank[i] * RH;
        const on = readingOn && SA[reading] === i;
        row(lx, yL, i, on ? rgb(COOL) : C.mute, p > 0 && !on ? C.mute : C.fg, on);
        if (p > 0) row(lerp(lx, rx, p), lerp(yL, yR, p), i, on ? rgb(COOL) : C.fg, C.fg, on);
      }

      // the suffix array, aligned with the sorted rows
      for (let r = 0; r < SA.length; r++) {
        const y = TOP + r * RH;
        const on = readingOn && r === reading;
        ctx.fillStyle = on ? rgb(COOL, 0.25) : C.soft;
        rrect(ctx, ax + arrW / 2 - 13, y + 1, 26, RH - 4, 4);
        ctx.fill();
        if (t >= T_READ + r * READ) label(ctx, String(SA[r]), ax + arrW / 2, y + RH / 2, C.fg, MONO_B, "center");
      }
    },
  );
}

// ---- interp: selective back-off interpolation on a real context ---------------

function interpAnim(canvas) {
  DATA.then((D) => {
    const I = D.interp;
    const ctxStr = I.context;
    const lastStart = I.levels[I.levels.length - 1].start;
    // back-off steps: ones that keep a level linger, skips go by quickly
    const KEEP_T = 0.7,
      SKIP_T = 0.15;
    const stepAt = [];
    let acc = 0.8;
    for (let k = 0; k <= lastStart; k++) {
      stepAt.push(acc);
      acc += I.scan[k].keep ? KEEP_T : SKIP_T;
    }
    const tScanEnd = acc;
    const tCombine = tScanEnd + 0.8;
    const CYCLE = tCombine + 5;
    const stackAt = 560;
    const cardH = 132;
    // stacked (narrow) cards are only as tall as their bars
    const cardHN = I.levels.map((l) => 46 + Math.min(5, Object.keys(l.counts).length) * 16 + 8);
    const offN = cardHN.reduce((a, h) => [...a, a[a.length - 1] + h + 10], [0]);
    const stackH = offN[offN.length - 1];
    run(
      canvas,
      (W) => (W < stackAt ? 84 + stackH + 150 : 84 + cardH + 24 + 150),
      (ctx, W, H, now) => {
        const C = colors();
        const t = REDUCE ? CYCLE - 0.1 : (now / 1000) % CYCLE;
        const narrow = W < stackAt;
        const cw = cellW(ctx, MONO);
        let i = 0;
        for (let k = 0; k <= lastStart; k++) if (t >= stepAt[k]) i = k;
        const scanning = t >= 0.8 && t < tScanEnd;
        const s = I.scan[i];

        // the context, with the suffix currently being looked up
        label(ctx, "context", 2, 8, C.mute, SANS_S);
        const cx0 = 2;
        for (let k = 0; k < ctxStr.length; k++) {
          const inSuffix = t >= 0.8 && k >= i;
          if (inSuffix) {
            ctx.fillStyle = rgb(COOL, scanning ? 0.18 : 0.1);
            ctx.fillRect(cx0 + k * cw, 18, cw, 22);
          }
          label(ctx, ctxStr[k] === " " ? "·" : ctxStr[k], cx0 + k * cw, 30, ctxStr[k] === " " ? C.mute : C.fg, MONO);
        }
        label(ctx, "?", cx0 + ctxStr.length * cw + 4, 30, rgb(COOL), MONO_B);
        if (t >= 0.8) {
          const n = ctxStr.length - i + 1;
          label(ctx, `${n}-gram: "${ctxStr.slice(i)}" appears ${s.m} time${s.m === 1 ? "" : "s"}${s.keep ? " → keep this level" : " → same as before, skip"}`, 2, 56, s.keep ? rgb(COOL) : C.mute, s.keep ? SANS_B : SANS);
        } else label(ctx, "back off one character at a time; keep a level only when its match count goes up", 2, 56, C.mute, SANS);

        // level cards
        const combine = ease(seg(t, tCombine, tCombine + 1.2));
        const cols = narrow ? 1 : I.levels.length;
        const gw = 14;
        const cwid = (W - 4 - gw * (cols - 1)) / cols;
        I.levels.forEach((lv, li) => {
          const x = 2 + (narrow ? 0 : li * (cwid + gw));
          const y = 80 + (narrow ? offN[li] : 0);
          const ch = narrow ? cardHN[li] : cardH;
          if (t < stepAt[lv.start]) {
            // not reached yet: a faint placeholder so the layout is visible from the start
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            rrect(ctx, x + 0.5, y + 0.5, cwid - 1, ch - 1, 6);
            ctx.stroke();
            ctx.setLineDash([]);
            label(ctx, `level ${li + 1}`, x + 10, y + 14, C.mute, SANS);
            return;
          }
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1;
          rrect(ctx, x + 0.5, y + 0.5, cwid - 1, ch - 1, 6);
          ctx.stroke();
          label(ctx, `level ${li + 1} · ${ctxStr.length - lv.start + 1}-gram · m = ${lv.m}`, x + 10, y + 14, C.fg, SANS_B);
          label(ctx, `"${ctxStr.slice(lv.start)}"`, x + 10, y + 31, C.mute, MONO_S);
          const entries = Object.entries(lv.counts).slice(0, 5);
          const maxC = Math.max(...entries.map((e) => e[1]));
          entries.forEach(([ch, n], r) => {
            const by = y + 46 + r * 16;
            label(ctx, ch === " " ? "·" : ch, x + 16, by + 6, C.fg, MONO, "center");
            const bw = ((cwid - 80) * n) / maxC;
            ctx.fillStyle = rgb(COOL, 0.55);
            rrect(ctx, x + 30, by, bw, 11, 2);
            ctx.fill();
            label(ctx, String(n), x + 34 + bw, by + 6, C.mute, SANS_S);
          });
          if (combine > 0) {
            ctx.globalAlpha = combine;
            label(ctx, `× ${I.weights[li]}`, x + cwid - 10, y + 14, rgb(COOL), SANS_B, "right");
            ctx.globalAlpha = 1;
          }
        });

        // the mixed distribution (empty tracks until the levels are combined)
        {
          const y0 = narrow ? 80 + stackH + 4 : 80 + cardH + 22;
          ctx.globalAlpha = 1 - combine;
          label(ctx, "mixed distribution", 2, y0 + 6, C.mute, SANS);
          ctx.globalAlpha = 1;
          Object.keys(I.final).forEach((_, r) => {
            ctx.fillStyle = C.soft;
            rrect(ctx, 26, y0 + 22 + r * 22, W - 140, 15, 3);
            ctx.fill();
          });
        }
        if (combine > 0) {
          const y0 = narrow ? 80 + stackH + 4 : 80 + cardH + 22;
          ctx.globalAlpha = combine;
          label(ctx, "mixed distribution: weighted counts, normalized", 2, y0 + 6, C.fg, SANS_B);
          const entries = Object.entries(I.final);
          const bwMax = W - 140;
          entries.forEach(([ch, p], r) => {
            const by = y0 + 22 + r * 22;
            label(ctx, ch === " " ? "·" : ch, 12, by + 8, C.fg, MONO, "center");
            ctx.fillStyle = rgb(COOL, r === 0 ? 0.9 : 0.55);
            rrect(ctx, 26, by, Math.max(2, bwMax * p * combine), 15, 3);
            ctx.fill();
            label(ctx, `${(p * 100).toFixed(1)}%`, 32 + Math.max(2, bwMax * p * combine), by + 8, C.mute, SANS_S);
          });
          ctx.globalAlpha = 1;
        }
      },
    );
  });
}

mount(race, { race, suffix: suffixAnim, interp: interpAnim });
