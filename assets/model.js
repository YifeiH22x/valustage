// ValuStage valuation model - same logic as the Excel prototype (ValuStage_MVP_Prototype.xlsx).
// All money in KRW billion unless noted; value per share in KRW.

const DEFAULTS = {
  company: {
    revenue: 1174.9,      // FY2025 reported revenue (SM Entertainment, 2026b)
    ebit: 183.0,          // FY2025 operating profit
    shares: 22.89,        // million shares
    price: 82500,         // market price, Oct 2026
    netCash: 0,           // placeholder
    da: 60,               // depreciation & amortisation, placeholder
    tax: 0.24,
    fcfConv: 0.80,        // FCF as a share of NOPAT
    termGrowth: 0.02,
    otherRatio: 0.80,     // other revenue (MD, licensing, platform) per KRW of album + concert revenue
    tolerance: 0.02,
    otherBusinesses: 455  // revenue not linked to the four groups (illustrative)
  },
  artists: [
    { name: "NCT (all units)", albums: 5.0, albumPrice: 15000, shows: 40, attendance: 12000, ticket: 150000, contractEnd: 2030 },
    { name: "aespa",           albums: 3.0, albumPrice: 15000, shows: 30, attendance: 10000, ticket: 150000, contractEnd: 2027 },
    { name: "RIIZE",           albums: 2.8, albumPrice: 15000, shows: 35, attendance: 9000,  ticket: 150000, contractEnd: 2030 },
    { name: "NCT WISH",        albums: 3.5, albumPrice: 15000, shows: 20, attendance: 7000,  ticket: 150000, contractEnd: 2031 }
  ],
  scenarios: {
    Bear: { albumG: -0.10, concertG: 0.00, otherG: 0.00, margin: 0.13,  wacc: 0.11, renew: false },
    Base: { albumG: -0.03, concertG: 0.08, otherG: 0.04, margin: 0.156, wacc: 0.10, renew: true },
    Bull: { albumG:  0.03, concertG: 0.15, otherG: 0.07, margin: 0.18,  wacc: 0.09, renew: true }
  },
  peers: [
    { name: "HYBE", evEbitda: 15, pe: 25 },
    { name: "JYP Entertainment", evEbitda: 13, pe: 20 },
    { name: "YG Entertainment", evEbitda: 12, pe: 22 }
  ],
  deals: [
    { label: "HYBE tender offer", date: "Feb 2023", price: 120000 },
    { label: "Kakao tender offer", date: "Mar 2023", price: 150000 },
    { label: "Tencent Music purchase", date: "May 2025", price: 110000 }
  ]
};

const BASE_YEAR = 2025;
const YEARS = [1, 2, 3, 4, 5];

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Artist driver model for the base year (OR-5, OR-7)
function artistBase(a, c) {
  const album = a.albums * a.albumPrice / 1000;                       // mn units x KRW -> KRW bn
  const concert = a.shows * a.attendance * a.ticket / 1e9;            // KRW bn
  const total = (album + concert) * (1 + c.otherRatio);
  return { album, concert, total };
}

function reconcile(m) {
  const rows = m.artists.map(a => ({ name: a.name, ...artistBase(a, m.company) }));
  const groups = rows.reduce((s, r) => s + r.total, 0);
  const modelled = groups + m.company.otherBusinesses;
  const diff = modelled - m.company.revenue;
  return { rows, groups, modelled, diff, ok: Math.abs(diff) <= m.company.revenue * m.company.tolerance };
}

// Five-year DCF for one set of assumptions (OR-6, OR-8)
function dcf(m, s) {
  const c = m.company;
  const byArtist = m.artists.map(a => {
    const b = artistBase(a, c);
    return YEARS.map(t => {
      const active = (s.renew || BASE_YEAR + t <= a.contractEnd) ? 1 : 0;
      return (b.album * Math.pow(1 + s.albumG, t) + b.concert * Math.pow(1 + s.concertG, t)) * (1 + c.otherRatio) * active;
    });
  });
  const other = YEARS.map(t => c.otherBusinesses * Math.pow(1 + s.otherG, t));
  const revenue = YEARS.map((t, i) => byArtist.reduce((sum, r) => sum + r[i], 0) + other[i]);
  return finish(m, s, revenue, { byArtist, other });
}

function finish(m, s, revenue, extra = {}) {
  const c = m.company;
  const g = s.termGrowth ?? c.termGrowth;
  const ebit = revenue.map(r => r * s.margin);
  const fcf = ebit.map(e => e * (1 - c.tax) * c.fcfConv);
  const df = YEARS.map(t => 1 / Math.pow(1 + s.wacc, t));
  const pv = fcf.map((f, i) => f * df[i]);
  const sumPv = pv.reduce((a, b) => a + b, 0);
  const tv = fcf[4] * (1 + g) / (s.wacc - g);
  const pvTv = tv * df[4];
  const ev = sumPv + pvTv;
  const equity = ev + c.netCash;
  const vps = equity * 1000 / c.shares;
  return { ...extra, revenue, ebit, fcf, df, pv, sumPv, tv, pvTv, ev, equity, vps, upside: vps / c.price - 1 };
}

// Comparable companies (OR-9)
function median(xs) { const a = [...xs].sort((x, y) => x - y); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; }
function comps(m) {
  const c = m.company;
  const evEbitda = median(m.peers.map(p => p.evEbitda));
  const pe = median(m.peers.map(p => p.pe));
  const ebitda = c.ebit + c.da;
  const ni = c.ebit * (1 - c.tax);
  return {
    evEbitda, pe, ebitda, ni,
    vpsEvEbitda: (evEbitda * ebitda + c.netCash) * 1000 / c.shares,
    vpsPe: pe * ni * 1000 / c.shares
  };
}

// What uniform revenue growth does the market price assume? (OR-11)
function valueAtGrowth(m, s, g) {
  const revenue = YEARS.map(t => m.company.revenue * Math.pow(1 + g, t));
  return finish(m, s, revenue).vps;
}
function impliedGrowth(m, s) {
  let lo = -0.5, hi = 0.6;
  const target = m.company.price;
  if (valueAtGrowth(m, s, lo) > target || valueAtGrowth(m, s, hi) < target) return null;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (valueAtGrowth(m, s, mid) < target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// One-at-a-time sensitivity (OR-12)
const SENS = [
  { label: "Discount rate (WACC) ±1 pt", key: "wacc", d: 0.01, flip: true },
  { label: "Terminal growth ±0.5 pt", key: "termGrowth", d: 0.005 },
  { label: "Operating margin ±2 pts", key: "margin", d: 0.02 },
  { label: "Album growth ±5 pts", key: "albumG", d: 0.05 },
  { label: "Concert growth ±5 pts", key: "concertG", d: 0.05 }
];
function sensitivity(m, s) {
  const base = dcf(m, s).vps;
  return SENS.map(x => {
    const cur = x.key === "termGrowth" ? m.company.termGrowth : s[x.key];
    const lo = dcf(m, { ...s, [x.key]: cur - x.d }).vps - base;
    const hi = dcf(m, { ...s, [x.key]: cur + x.d }).vps - base;
    return { label: x.label, down: Math.min(lo, hi), up: Math.max(lo, hi) };
  }).sort((a, b) => (b.up - b.down) - (a.up - a.down));
}

function run(m, scenarioName, custom) {
  const s = custom || m.scenarios[scenarioName];
  const selected = dcf(m, s);
  const all = Object.fromEntries(Object.keys(m.scenarios).map(k => [k, dcf(m, m.scenarios[k]).vps]));
  const cp = comps(m);
  const implied = impliedGrowth(m, s);
  const baseCagr = Math.pow(selected.revenue[4] / reconcile(m).modelled, 1 / 5) - 1;
  const methods = [all.Bear, all.Base, all.Bull, cp.vpsEvEbitda, cp.vpsPe];
  return {
    selected, all, comps: cp, implied, baseCagr,
    range: [Math.min(...methods), Math.max(...methods)],
    sens: sensitivity(m, s), recon: reconcile(m)
  };
}

if (typeof module !== "undefined") module.exports = { DEFAULTS, run, dcf, clone, reconcile };
