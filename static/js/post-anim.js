/*
  Shared helpers for post animations.

  A post's script imports what it needs from here, registers its animations
  with mount(), and gets: theme colors, a resize-aware canvas runner whose clock
  starts when the canvas first scrolls into view, text helpers, and
  reduced-motion handling.

  Reserve each canvas's desktop height in the post itself
  (style="height: …px" on the <canvas>, heroHeight in the frontmatter) so the
  page doesn't jump while the script loads.
*/

export function colors() {
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

export const COOL = [91, 138, 166];
export const MID = [224, 168, 63];
export const HOT = [216, 101, 75];

export function rgb(c, a) {
  return a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => (t = clamp(t, 0, 1)) * t * (3 - 2 * t);
export const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
export const fmt = (n) => Math.round(n).toLocaleString("en-US");

export const SANS = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
export const SANS_S = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
export const SANS_B = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
export const MONO = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const MONO_S = "10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const MONO_B = "600 10.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export const REDUCE = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r);
}

export function label(ctx, text, x, y, color, font, align) {
  ctx.font = font || SANS;
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

// Canvas runner. heightFor(W, ctx) sets the height for a given width; render(ctx, W, H, now)
// draws a frame, where now is ms since the canvas first scrolled into view.
export function run(canvas, heightFor, render) {
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

// Characters per line of monospace text in a given width.
export function monoCols(ctx, font, width) {
  ctx.font = font;
  return Math.max(10, Math.floor(width / ctx.measureText("M").width));
}

// Wrap plain text (keeping its newlines) to at most n characters per line.
export function wrap(text, n) {
  const out = [];
  for (const para of text.split("\n")) {
    if (para.length <= n) {
      out.push(para);
      continue;
    }
    let line = "";
    for (const w of para.split(/ +/)) {
      const cand = line ? line + " " + w : w;
      if (cand.length <= n) line = cand;
      else {
        if (line) out.push(line);
        line = w.slice(0, n);
      }
    }
    if (line) out.push(line);
  }
  return out;
}

// Wrap a token list into lines of at most n characters. Returns lines of {i, x}
// entries, where i indexes the token and x is its starting column.
export function wrapTokens(tokens, n) {
  const lines = [];
  let cur = [],
    col = 0;
  tokens.forEach((t, i) => {
    const need = (col ? 1 : 0) + t.length;
    if (col && col + need > n) {
      lines.push(cur);
      cur = [];
      col = 0;
    }
    const x = col ? col + 1 : 0;
    cur.push({ i, x });
    col = x + t.length;
  });
  if (cur.length) lines.push(cur);
  return lines;
}

// Fetch a JSON file that sits next to the calling script.
export function loadJSON(name, base) {
  return fetch(new URL(name, base)).then((r) => r.json());
}

// Run every animation on the page: hero is the [data-hero-canvas] function, anims maps
// data-anim names to functions.
export function mount(hero, anims) {
  if (hero) for (const c of document.querySelectorAll("[data-hero-canvas]")) hero(c);
  for (const c of document.querySelectorAll("[data-anim]")) {
    const fn = anims[c.getAttribute("data-anim")];
    if (fn) fn(c);
  }
}
