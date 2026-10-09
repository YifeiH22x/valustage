// ValuStage interactive tool: wires inputs to model.js and redraws everything.
let M = clone(DEFAULTS);
let scenario = "Base";
let S = { ...M.scenarios[scenario] };   // assumptions in use
let edited = false;

const SLIDERS = [
  { key: "albumG",     label: "Album units, growth a year",       min: -0.20, max: 0.15, step: 0.005 },
  { key: "concertG",   label: "Concert revenue, growth a year",   min: -0.10, max: 0.25, step: 0.005 },
  { key: "otherG",     label: "Other businesses, growth a year",  min: -0.05, max: 0.12, step: 0.005 },
  { key: "margin",     label: "Operating margin",                 min: 0.08,  max: 0.25, step: 0.001 },
  { key: "wacc",       label: "Discount rate (WACC)",             min: 0.07,  max: 0.14, step: 0.0025 },
  { key: "termGrowth", label: "Terminal growth",                  min: 0.00,  max: 0.04, step: 0.0025, company: true }
];
const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const fmt = v => Math.round(v).toLocaleString("en-US");
const bn = v => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const $ = id => document.getElementById(id);

// Sliders
$("sliders").innerHTML = SLIDERS.map(s => `
  <div class="field">
    <label for="s-${s.key}"><span>${s.label}</span><output id="o-${s.key}"></output></label>
    <input type="range" id="s-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}">
  </div>`).join("");
SLIDERS.forEach(s => {
  $("s-" + s.key).addEventListener("input", e => {
    const v = parseFloat(e.target.value);
    if (s.company) M.company.termGrowth = v; else S[s.key] = v;
    edited = true; update();
  });
});
$("renew").addEventListener("change", e => { S.renew = e.target.checked; edited = true; update(); });

function selectScenario(name) {
  scenario = name;
  S = { ...M.scenarios[name] };
  M.company.termGrowth = DEFAULTS.company.termGrowth;
  edited = false;
  update();
}
document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => selectScenario(b.dataset.scn)));
$("reset").addEventListener("click", () => selectScenario(scenario));

// Editable tables
function numInput(value, onChange, step = "any", label = "", illustrative = true) {
  const i = document.createElement("input");
  if (!illustrative) i.className = "public";
  i.type = "number"; i.value = value; i.step = step; i.inputMode = "decimal";
  if (label) i.setAttribute("aria-label", label);
  i.addEventListener("input", () => { const v = parseFloat(i.value); if (!isNaN(v)) { onChange(v); update(false); } });
  return i;
}
function buildArtistTable() {
  const body = $("artist-body"); body.innerHTML = "";
  M.artists.forEach((a, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><strong>${a.name}</strong></td>`;
    [["albums", "0.1"], ["albumPrice", "500"], ["shows", "1"], ["attendance", "500"], ["ticket", "1000"], ["contractEnd", "1"]].forEach(([k, step]) => {
      const td = document.createElement("td"); td.className = "num";
      td.appendChild(numInput(a[k], v => { M.artists[idx][k] = v; }, step, `${a.name} ${k}`));
      tr.appendChild(td);
    });
    const out = document.createElement("td"); out.className = "num"; out.id = "rev-" + idx; tr.appendChild(out);
    body.appendChild(tr);
  });
  const tr = document.createElement("tr");
  tr.innerHTML = `<td colspan="7">Other artists and businesses (not modelled by group)</td>`;
  const td = document.createElement("td"); td.className = "num";
  td.appendChild(numInput(M.company.otherBusinesses, v => { M.company.otherBusinesses = v; }, "1", "Other artists and businesses revenue"));
  tr.appendChild(td); body.appendChild(tr);
}
function buildCompanyTable() {
  const rows = [
    ["price", "Market price per share (KRW)", "100", false],
    ["revenue", "Reported revenue FY2025 (KRW bn)", "0.1", false],
    ["ebit", "Operating profit FY2025 (KRW bn)", "0.1", false],
    ["shares", "Shares outstanding (mn)", "0.01", false],
    ["otherRatio", "Other revenue per KRW of album and concert revenue", "0.05", true],
    ["da", "Depreciation and amortisation (KRW bn)", "1", true],
    ["netCash", "Net cash (KRW bn)", "1", true],
    ["tax", "Tax rate", "0.01", false],
    ["fcfConv", "Cash conversion (FCF / NOPAT)", "0.05", false]
  ];
  const body = $("company-body"); body.innerHTML = "";
  rows.forEach(([k, label, step, placeholder]) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${label}</td>`;
    const td = document.createElement("td"); td.className = "num";
    td.appendChild(numInput(M.company[k], v => { M.company[k] = v; }, step, label, placeholder));
    tr.appendChild(td); body.appendChild(tr);
  });
  const pb = $("peer-body"); pb.innerHTML = "";
  M.peers.forEach((p, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.name}</td>`;
    ["evEbitda", "pe"].forEach(k => {
      const td = document.createElement("td"); td.className = "num";
      td.appendChild(numInput(p[k], v => { M.peers[idx][k] = v; }, "0.5", `${p.name} ${k}`));
      tr.appendChild(td);
    });
    pb.appendChild(tr);
  });
}

// Render
let last;
function update(syncControls = true) {
  const r = run(M, scenario, S);
  last = r;
  const c = M.company;

  // controls
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scn === scenario && !edited)));
  $("seg-note").textContent = edited ? `Custom assumptions, starting from ${scenario}` : "";
  if (syncControls) {
    SLIDERS.forEach(s => { $("s-" + s.key).value = s.company ? c.termGrowth : S[s.key]; });
    $("renew").checked = !!S.renew;
  }
  SLIDERS.forEach(s => { $("o-" + s.key).textContent = pct(s.company ? c.termGrowth : S[s.key]); });

  // KPIs
  const name = edited ? "custom" : scenario;
  $("k1-label").textContent = `DCF value per share (${name})`;
  $("k1").textContent = "KRW " + fmt(r.selected.vps);
  const up = r.selected.upside;
  $("k1-sub").innerHTML = `<span class="${up >= 0 ? "up" : "down"}">${pct(Math.abs(up))} ${up >= 0 ? "above" : "below"}</span> the market price of KRW ${fmt(c.price)}`;
  $("k2").textContent = `${fmt(r.range[0] / 1000)}k to ${fmt(r.range[1] / 1000)}k`;
  $("k2-sub").textContent = "Lowest to highest of the three DCF scenarios and two peer multiples";
  if (r.implied === null) { $("k3").textContent = "n/a"; $("k3-sub").textContent = "Outside the range the solver checks"; }
  else {
    $("k3").textContent = pct(r.implied) + " a year";
    const gap = r.implied - r.baseCagr;
    $("k3-sub").textContent = `Your assumptions give ${pct(r.baseCagr)} a year (FY2025 to FY2030), so the market expects ${gap >= 0 ? "more" : "less"} growth than you do.`;
  }

  // charts
  const cp = r.comps;
  valueBars($("c-value"), [
    { label: `DCF, ${edited ? "custom" : scenario + " (selected)"}`, short: "DCF selected", v: r.selected.vps, color: COLORS.violet, bold: true },
    { label: "DCF, Bear", short: "DCF Bear", v: r.all.Bear, color: COLORS.ink },
    { label: "DCF, Base", short: "DCF Base", v: r.all.Base, color: COLORS.ink },
    { label: "DCF, Bull", short: "DCF Bull", v: r.all.Bull, color: COLORS.ink },
    { label: "Peers, EV/EBITDA", short: "EV/EBITDA", v: cp.vpsEvEbitda, color: "#C9CDD8", light: true },
    { label: "Peers, P/E", short: "P/E", v: cp.vpsPe, color: "#C9CDD8", light: true }
  ], [
    { v: c.price, color: COLORS.amber, market: true },
    ...M.deals.map(d => ({ v: d.price, color: COLORS.ink }))
  ]);

  const series = M.artists.map((a, i) => ({
    name: a.name, color: COLORS.artists[i],
    values: [r.recon.rows[i].total, ...r.selected.byArtist[i]]
  }));
  series.push({ name: "Other artists and businesses", color: COLORS.artists[4], values: [c.otherBusinesses, ...r.selected.other] });
  revenueStack($("c-rev"), ["FY25", "FY26", "FY27", "FY28", "FY29", "FY30"], series);
  $("rev-legend").innerHTML = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");

  tornado($("c-sens"), r.sens);

  // artist table outputs and reconciliation (OR-7)
  r.recon.rows.forEach((row, i) => { $("rev-" + i).textContent = bn(row.total); });
  $("recon").innerHTML = `Modelled total KRW ${bn(r.recon.modelled)} bn vs reported KRW ${bn(c.revenue)} bn, a difference of ${bn(r.recon.diff)} bn. ` +
    `<span class="check ${r.recon.ok ? "ok" : "bad"}">${r.recon.ok ? "Within 2%, OK" : "More than 2% apart; adjust the artist inputs"}</span>`;

  // DCF table
  const d = r.selected;
  const yrs = ["FY2026", "FY2027", "FY2028", "FY2029", "FY2030"];
  const row = (label, vals, bold) => `<tr${bold ? ' style="font-weight:600"' : ""}><td>${label}</td>${vals.map(v => `<td class="num">${v}</td>`).join("")}</tr>`;
  $("dcf-table").innerHTML =
    `<thead><tr><th></th>${yrs.map(y => `<th class="num">${y}</th>`).join("")}</tr></thead><tbody>` +
    row("Revenue", d.revenue.map(bn), true) +
    row("Operating profit", d.ebit.map(bn)) +
    row("Free cash flow", d.fcf.map(bn)) +
    row("Discount factor", d.df.map(v => v.toFixed(3))) +
    row("Present value of FCF", d.pv.map(bn)) +
    `</tbody><tbody>` +
    row("Sum of present values", [bn(d.sumPv), "", "", "", ""]) +
    row("Present value of terminal value", [bn(d.pvTv), "", "", "", ""]) +
    row("Enterprise value", [bn(d.ev), "", "", "", ""], true) +
    row("Equity value (plus net cash)", [bn(d.equity), "", "", "", ""]) +
    row("Value per share (KRW)", [fmt(d.vps), "", "", "", ""], true) + `</tbody>`;
}

buildArtistTable();
buildCompanyTable();
update();
let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => update(false), 120); });
