// Small helpers shared by the main page (app.js) and the property map (map.js).

// ---------- helpers ----------------------------------------------------

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const fmtDollars = (v) => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-CA");
const fmtSignedDollars = (v) => (v > 0 ? "+" : "") + fmtDollars(v);
const fmtPercent = (v) => v.toFixed(1) + "%";
const fmtSignedPercent = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
const fmtShare = (v) => (v * 100).toFixed(1) + "%";
const fmtCount = (v) => v.toLocaleString("en-CA");

function wardLabel(w) {
  const name = CONFIG.WARD_NAMES[w];
  return name ? `Ward ${w} – ${name}` : `Ward ${w}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
