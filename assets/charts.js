// Small SVG chart helpers for ValuStage (no external libraries).
const NS = "http://www.w3.org/2000/svg";
const COLORS = {
  ink: "#1B1F3B", muted: "#5B6177", line: "#DCE0EA", violet: "#5B3FD9", violetSoft: "#E9E4FF",
  amber: "#D98E1F", bear: "#C2414F", bull: "#2A8573",
  artists: ["#1B1F3B", "#5B3FD9", "#2A8573", "#D98E1F", "#B9BECC"]
};

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function txt(parent, x, y, s, attrs = {}) {
  const t = el("text", { x, y, "font-size": 12, fill: COLORS.ink, ...attrs }, parent);
  t.textContent = s;
  return t;
}
function svgFor(container, h, label) {
  container.innerHTML = "";
  const w = Math.max(280, container.clientWidth);
  const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: "img", "aria-label": label }, container);
  return { svg, w };
}
const krw = v => Math.round(v).toLocaleString("en-US");
const k = v => (v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "k";
function niceMax(v, step) { return Math.ceil(v / step) * step; }

// Greedy label placement: returns a level for each label so labels at the same level do not overlap.
function levels(items, gap = 10) {
  const ends = [];
  return items.map(it => {
    let lv = 0;
    while (ends[lv] !== undefined && ends[lv] + gap > it.x0) lv++;
    ends[lv] = it.x1;
    return lv;
  });
}

// Home page: one axis with the market price, the deal prices and the model's DCF range.
function priceRuler(container, d) {
  const narrow = container.clientWidth < 600;
  const fs = narrow ? 11.5 : 13;
  const cw = fs * 0.56;
  const markers = [
    { v: d.price, top: "Market price", bot: "Oct 2026", color: COLORS.amber, market: true },
    ...d.deals.map(x => ({ v: x.price, top: x.label, bot: x.date, color: COLORS.ink }))
  ].sort((a, b) => a.v - b.v);
  const lo = 20000, hi = 160000;
  const { svg, w } = svgFor(container, 10, "Prices paid for one SM Entertainment share compared with the ValuStage DCF range");
  const pad = 8, X = v => pad + (v - lo) / (hi - lo) * (w - 2 * pad);
  // label boxes
  const items = markers.map(m => {
    const width = Math.max(m.top.length, ("KRW " + krw(m.v)).length) * cw;
    let x0 = X(m.v) - width / 2;
    x0 = Math.min(Math.max(x0, 0), w - width);
    return { ...m, x0, x1: x0 + width, width };
  });
  const lv = levels(items, 12);
  const nLv = Math.max(...lv) + 1, rowH = fs * 3.4;
  const axisY = nLv * rowH + 26, bandY = axisY + 18, h = bandY + 64;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`); svg.setAttribute("height", h);

  // DCF range band
  el("rect", { x: X(d.range[0]), y: bandY, width: X(d.range[1]) - X(d.range[0]), height: 14, fill: COLORS.violetSoft, rx: 2 }, svg);
  el("rect", { x: X(d.base) - 1.5, y: bandY - 3, width: 3, height: 20, fill: COLORS.violet }, svg);
  const bandLabel = `ValuStage DCF range, Bear to Bull: KRW ${krw(d.range[0])} to ${krw(d.range[1])} (Base ${krw(d.base)})`;
  const bl = txt(svg, X(d.range[0]), bandY + 36, bandLabel, { "font-size": fs, fill: COLORS.violet, "font-weight": 600 });
  if (narrow) { bl.textContent = `DCF range: ${k(d.range[0])} to ${k(d.range[1])}, Base ${k(d.base)}`; }

  // axis
  el("line", { x1: pad, x2: w - pad, y1: axisY, y2: axisY, stroke: COLORS.ink, "stroke-width": 1.5 }, svg);
  for (let v = lo; v <= hi; v += 20000) {
    el("line", { x1: X(v), x2: X(v), y1: axisY, y2: axisY + 5, stroke: COLORS.ink }, svg);
    txt(svg, X(v), axisY + 18, k(v), { "font-size": 11, fill: COLORS.muted, "text-anchor": v === lo ? "start" : v === hi ? "end" : "middle" });
  }
  // markers and labels
  items.forEach((m, i) => {
    const ly = (nLv - 1 - lv[i]) * rowH + fs + 2;
    el("line", { x1: X(m.v), x2: X(m.v), y1: ly + fs * 1.9, y2: axisY, stroke: m.color, "stroke-width": 1, "stroke-dasharray": m.market ? "" : "3 3" }, svg);
    el("circle", { cx: X(m.v), cy: axisY, r: m.market ? 8 : 6, fill: m.market ? COLORS.amber : "#fff", stroke: m.color, "stroke-width": 2.5 }, svg);
    const cx = m.x0 + m.width / 2;
    txt(svg, cx, ly, m.top, { "font-size": fs, "text-anchor": "middle", fill: COLORS.muted });
    txt(svg, cx, ly + fs * 1.3, "KRW " + krw(m.v), { "font-size": fs, "text-anchor": "middle", "font-weight": 700, fill: m.market ? COLORS.amber : COLORS.ink });
  });
}

// Tool: value per share by method, with market and deal prices as reference lines (OR-14, OR-15).
function valueBars(container, rows, refs) {
  const narrow = container.clientWidth < 560;
  const labelW = narrow ? 104 : 170, rowH = 34, top = 14;
  const h = top + rows.length * rowH + 30;
  const { svg, w } = svgFor(container, h, "Value per share by method compared with market and deal prices");
  const max = niceMax(Math.max(...rows.map(r => r.v), ...refs.map(r => r.v)) * 1.08, 20000);
  const x0 = labelW, x1 = w - 8, X = v => x0 + v / max * (x1 - x0);
  for (let v = 0; v <= max; v += max > 160000 ? 40000 : 20000) {
    el("line", { x1: X(v), x2: X(v), y1: top - 6, y2: h - 26, stroke: COLORS.line }, svg);
    txt(svg, X(v), h - 10, k(v), { "font-size": 11, fill: COLORS.muted, "text-anchor": "middle" });
  }
  refs.forEach(r => {
    el("line", { x1: X(r.v), x2: X(r.v), y1: top - 4, y2: h - 26, stroke: r.color, "stroke-width": r.market ? 2.5 : 1.2, "stroke-dasharray": r.market ? "" : "4 4" }, svg);
  });
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    txt(svg, x0 - 10, y + 17, narrow ? r.short : r.label, { "text-anchor": "end", "font-size": narrow ? 11 : 12.5, "font-weight": r.bold ? 700 : 400 });
    el("rect", { x: x0, y: y + 5, width: Math.max(0, X(r.v) - x0), height: 18, fill: r.color, rx: 2 }, svg);
    const inside = X(r.v) - x0 > 70;
    txt(svg, inside ? X(r.v) - 6 : X(r.v) + 6, y + 18, krw(r.v), { "font-size": 11.5, "text-anchor": inside ? "end" : "start", fill: inside && !r.light ? "#fff" : COLORS.ink, "font-weight": 600 });
  });
}

// Tool: revenue by artist group, FY2025-FY2030, stacked columns.
function revenueStack(container, years, series) {
  const h = 260, top = 12, bottom = 26, left = 46;
  const { svg, w } = svgFor(container, h, "Revenue by artist group, FY2025 to FY2030");
  const totals = years.map((_, i) => series.reduce((s, x) => s + x.values[i], 0));
  const max = niceMax(Math.max(...totals) * 1.1, 500);
  const Y = v => h - bottom - v / max * (h - top - bottom);
  for (let v = 0; v <= max; v += 500) {
    el("line", { x1: left, x2: w, y1: Y(v), y2: Y(v), stroke: COLORS.line }, svg);
    txt(svg, left - 8, Y(v) + 4, v.toLocaleString("en-US"), { "font-size": 11, fill: COLORS.muted, "text-anchor": "end" });
  }
  const slot = (w - left) / years.length, bw = Math.min(56, slot * 0.6);
  years.forEach((yr, i) => {
    const cx = left + slot * i + slot / 2;
    let acc = 0;
    series.forEach(s => {
      const v = s.values[i];
      if (v > 0) el("rect", { x: cx - bw / 2, y: Y(acc + v), width: bw, height: Y(acc) - Y(acc + v), fill: s.color, stroke: "#fff", "stroke-width": 1 }, svg);
      acc += v;
    });
    txt(svg, cx, Y(acc) - 5, Math.round(acc).toLocaleString("en-US"), { "font-size": 11, "text-anchor": "middle", "font-weight": 600 });
    txt(svg, cx, h - 8, yr, { "font-size": 11.5, "text-anchor": "middle", fill: COLORS.muted });
  });
}

// Tool: sensitivity tornado (OR-12).
function tornado(container, rows) {
  const narrow = container.clientWidth < 560;
  const labelW = narrow ? 120 : 190, rowH = 34, top = 6;
  const h = top + rows.length * rowH + 30;
  const { svg, w } = svgFor(container, h, "Change in value per share when each assumption moves");
  const m = niceMax(Math.max(...rows.map(r => Math.max(-r.down, r.up))) * 1.15, 5000);
  const x0 = labelW, x1 = w - 8, X = v => x0 + (v + m) / (2 * m) * (x1 - x0);
  for (let v = -m; v <= m; v += m / 2) {
    el("line", { x1: X(v), x2: X(v), y1: top, y2: h - 26, stroke: v === 0 ? COLORS.ink : COLORS.line }, svg);
    txt(svg, X(v), h - 10, (v > 0 ? "+" : "") + k(v), { "font-size": 11, fill: COLORS.muted, "text-anchor": "middle" });
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const lab = narrow ? r.label.replace("Discount rate (WACC)", "WACC").replace("Operating margin", "Margin").replace("Terminal growth", "Term. growth") : r.label;
    txt(svg, x0 - 10, y + 18, lab, { "text-anchor": "end", "font-size": narrow ? 11 : 12.5 });
    el("rect", { x: X(r.down), y: y + 6, width: X(0) - X(r.down), height: 18, fill: COLORS.bear, rx: 2 }, svg);
    el("rect", { x: X(0), y: y + 6, width: X(r.up) - X(0), height: 18, fill: COLORS.bull, rx: 2 }, svg);
  });
}
