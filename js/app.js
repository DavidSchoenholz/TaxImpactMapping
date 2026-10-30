// Main page logic. Settings you might want to change are in js/config.js;
// colours are in css/style.css.

const state = {
  summary: null,
  story: null,
  properties: null,        // rows from data/properties.json
  classes: null,           // data/classes.json: roll number -> class code (all except residential)
  propertiesPromise: null,
  sortedChanges: null,     // $ changes of taxed properties, ascending (for percentiles)
  measure: CONFIG.defaultMeasure,
  selectedWard: null,
  tableSort: { key: "ward", dir: 1 },
  charts: {},
  map: null,
  mapReady: null,
  mapLayer: null,
  legend: null,
  pin: null,
};

// ---------- helpers ----------------------------------------------------

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const fmtDollars = (v) => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-CA");
const fmtSignedDollars = (v) => (v > 0 ? "+" : "") + fmtDollars(v);
const fmtPercent = (v) => v.toFixed(1) + "%";
const fmtSignedPercent = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
const fmtShare = (v) => (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
const fmtCount = (v) => v.toLocaleString("en-CA");
function fmtMoneyShort(v) {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(3) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
  return fmtDollars(v);
}
const signed = (s, v) => (v > 0 ? "+" : "") + s;

function wardLabel(w) {
  const name = CONFIG.WARD_NAMES[w];
  return name ? `Ward ${w} – ${name}` : `Ward ${w}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// What the map can be coloured by. `ward` is the column in summary.json;
// `lot` titles the legend when individual properties are shown.
const fmtRate = (v) => v.toFixed(2) + "%";
const MEASURES = {
  pct:     { group: "The 2021 change", label: "% change in bill", ward: "median_percent_change", title: "Typical % change in bill", fmt: fmtSignedPercent,
             lot: "Change in bill, 2020 to 2021", desc: "How much each bill changed in 2021, in percent. Area-rate tiers show up as patches." },
  dollars: { group: "The 2021 change", label: "$ change in bill", ward: "median_dollar_change", title: "Typical $ change in bill", fmt: fmtSignedDollars,
             lot: "Change in bill, 2020 to 2021", desc: "How much each bill changed in 2021, in dollars. Bigger, pricier properties change by more." },
  less:    { group: "The 2021 change", label: "Paid less in 2021", ward: "share_decrease", title: "Share of properties paying less", fmt: fmtShare,
             lot: "Paid less in 2021?", desc: "Properties whose bill went down in 2021. Mostly commercial and industrial strips." },
  value:   { group: "The property", label: "Assessed value", ward: "median_home_value", title: "Typical home's assessed value", fmt: fmtDollars,
             lot: "Assessed value (2016 valuation)", desc: "What MPAC says the property was worth on January 1, 2016, the value used for 2017 to 2021 taxes. Condo lots show the typical unit." },
  bill:    { group: "The property", label: "2021 tax bill", ward: "median_tax_2021", title: "Typical 2021 tax bill", fmt: fmtDollars,
             lot: "2021 tax bill (per unit)", desc: "The 2021 bill. Condo lots show the typical unit." },
  rate:    { group: "The property", label: "Tax rate (bill ÷ value)", ward: "median_home_rate", title: "Typical home's tax rate", fmt: fmtRate,
             lot: "Tax rate: bill as % of value", desc: "Each bill divided by its assessed value. Homes fall into area tiers (Question 3); apartments and businesses pay far higher rates." },
  type:    { group: "The property", label: "Home type", ward: "share_condo_town", title: "Share of homes that are condos or townhouses", fmt: fmtShare,
             lot: "Property type", desc: "Detached, semi, townhouse, condo and more, from the MPAC property code. Ward view: the share of homes that are condos or townhouses." },
  growth:  { group: "Over time", label: "Value growth, 2016 reassessment", ward: "median_value_growth", title: "Typical assessment growth, 2016 to 2021", fmt: fmtSignedPercent,
             lot: "Assessment growth, 2016 to 2021", desc: "How much each assessment rose as the 2016 reassessment was phased in. Faster than average means a growing share of the tax bill." },
  long:    { group: "Over time", label: "Tax change since 2011", ward: "median_long_change", title: "Typical tax change, 2011 to 2021", fmt: fmtSignedPercent,
             lot: "Tax bill change, 2011 to 2021", desc: "Ten years of change in each bill, for properties taxed in both 2011 and 2021 (Question 7)." },
  new:     { group: "Over time", label: "Newer homes", ward: "share_new", title: "Share of properties first taxed after 2012", fmt: fmtShare,
             lot: "First year taxed as a building", desc: "When each property first shows up in the tax data as a building. A stand-in for age: the data starts in 2011, so everything older looks the same." },
};

// ---------- start-up ---------------------------------------------------

async function init() {
  document.title = CONFIG.title;
  try {
    const [s, st] = await Promise.all([
      fetch("data/summary.json").then((r) => r.ok ? r.json() : Promise.reject(r.status)),
      fetch("data/story.json").then((r) => r.ok ? r.json() : Promise.reject(r.status)),
    ]);
    state.summary = s;
    state.story = st;
  } catch (e) {
    $("hero-sub").textContent =
      "Could not load the data. If you opened this file straight from your computer, view it through GitHub Pages " +
      "instead, or see the README for how to preview it locally.";
    return;
  }
  // ?m=<measure> in the address opens the map on that measure (for sharing a view).
  const asked = new URLSearchParams(location.search).get("m");
  if (MEASURES[asked]) state.measure = asked;
  if (!MEASURES[state.measure]) state.measure = "pct";

  Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  renderHero();
  renderParadox();
  renderLess();
  renderClusters();
  renderTiers();
  renderBridge();
  renderRatios();
  renderExtremes();
  renderHistory();
  renderDecade();
  renderTypes();
  renderNewHomes();
  renderOpenQuestions();
  renderTable();
  initLookup();
  state.mapReady = initMap();

  const n = state.summary.notes;
  $("source").textContent = CONFIG.sourceNote;
  $("class-note").textContent =
    "Property classes come from the City's 2021 file with tax class (data/source/hamilton_tax_2021_with_class.csv). Classes named in the City's rate table are used as given; " +
    "the rest (for example CX, XT, IX, E) are grouped by their standard Ontario class code and may not be perfect. " +
    "Former-municipality names (Stoney Creek, Ancaster and so on) are inferred from the wards each municipality code covers; the files don't name them. " +
    "Differences between groups of homes come from the area-specific part of the rate (the bill minus the city-wide rate); the files don't say which local services changed.";
  $("data-notes").textContent =
    `${fmtCount(n.rows_after_cleaning)} properties in the file; ${fmtCount(n.properties_in_stats)} used in the ` +
    `statistics (${fmtCount(n.untaxed_or_unassigned)} had no tax in one of the years or no ward).` +
    (state.summary.map ? ` ${fmtCount(state.summary.map.properties_matched_to_parcel)} are shown on the map; ` +
      `${fmtCount(state.summary.map.properties_not_on_map)} could not be matched to a lot. Ward outlines are traced from the lots and are approximate.` : "");

  // Redraw in the right colours when the device switches light/dark.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    renderLess(); renderClusters(); renderRatios(); renderHistory(); renderDecade();
    if (state.mapLayer) { styleMap(); restyleParcels(); }
  });

  // Fetch the big address list quietly so search is instant, then open a shared link if there is one.
  setTimeout(loadProperties, 1200);
  const m = location.hash.match(/p=(\d+)/);
  if (m) loadProperties().then(() => {
    const p = state.properties.find((r) => r[2] === m[1]);
    if (p) showReceipt(p);
  });
}

// ---------- hero -------------------------------------------------------

function renderHero() {
  const c = state.summary.city;
  $("hero-eyebrow").textContent = `${CONFIG.cityName} · ${CONFIG.yearAfter} property taxes`;
  $("hero-sub").innerHTML =
    `The typical bill rose <strong>${fmtSignedDollars(c.median_dollar_change)}</strong> (${fmtSignedPercent(c.median_percent_change)}) from ${CONFIG.yearBefore} to ${CONFIG.yearAfter}. ` +
    `But yours might have gone up four times that, or down. Find out which.`;
}

// ---------- 1. the paradox ---------------------------------------------

function renderParadox() {
  const c = state.summary.city, t = state.story.totals;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;

  $("paradox-answer").innerHTML =
    `<strong>Short answer:</strong> for most homes, yes. The median bill rose ${fmtSignedPercent(c.median_percent_change)} (${fmtSignedDollars(c.median_dollar_change)}). ` +
    `For the city as a whole, no: total tax billed rose just ${t.net_pct.toFixed(2)}%, because about ${fmtCount(Math.round(t.n_less / 100) * 100)} properties, most of them businesses, paid less.`;
  $("paradox-lede").textContent =
    `${fmtShare(c.share_increase)} of properties paid more in ${y1}, so where did the difference go? ` +
    `The ${fmtCount(t.n_more)} properties that paid more added ${fmtMoneyShort(t.increase_total)}; the ${fmtCount(t.n_less)} that paid less took ${fmtMoneyShort(-t.decrease_total)} back off.`;

  const tiles = [
    { num: fmtShare(c.share_increase), what: "of properties paid more", more: `${fmtCount(t.n_more)} of ${fmtCount(t.n_taxed)} taxed properties` },
    { num: fmtSignedPercent(c.median_percent_change), what: "typical change in a bill", more: `${fmtSignedDollars(c.median_dollar_change)} a year, from ${fmtDollars(c.median_tax_2020)} to ${fmtDollars(c.median_tax_2021)}` },
    { num: (t.net_pct > 0 ? "+" : "") + t.net_pct.toFixed(2) + "%", what: "change in total tax collected", more: `${fmtMoneyShort(t.tax_2020)} to ${fmtMoneyShort(t.tax_2021)}, ${signed(fmtMoneyShort(t.net), t.net)}` },
  ];
  $("bigstats").innerHTML = tiles
    .map((x) => `<div class="bigstat"><div class="num">${x.num}</div><div class="what">${x.what}</div><div class="more">${x.more}</div></div>`)
    .join("");

  const lb = state.story.less_by_class;
  const max = t.increase_total;
  const rows = [
    { cls: "more", lab: "Paid more", sub: `${fmtCount(t.n_more)} properties`, v: t.increase_total },
    { cls: "less", lab: "Paid less", sub: `${fmtCount(t.n_less)} properties`, v: t.decrease_total },
    { cls: "net",  lab: "Net change", sub: "what the city actually collected", v: t.net },
  ];
  $("balance").innerHTML =
    `<h3>Where the extra money went</h3>` +
    rows.map((r) => `<div class="bal-row"><div class="lab"><strong>${r.lab}</strong><small>${r.sub}</small></div>` +
      `<div class="bal-bar ${r.cls}" data-w="${Math.max(12, Math.abs(r.v) / max * 100)}" style="width:0">${signed(fmtMoneyShort(r.v), r.v)}</div></div>`).join("") +
    `<p class="bal-note">The ${fmtCount(t.n_less)} properties that got a cut cancelled out about ${Math.round(-t.decrease_total / t.increase_total * 100)}% of the extra everyone else paid. Most of them (${fmtShare((lb.mix.commercial + lb.mix.industrial) / lb.n)}) are commercial or industrial properties.</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelectorAll(".bal-bar").forEach((b) => (b.style.width = b.dataset.w + "%"))));

  $("assessment-note").textContent = state.summary.assessment_changed
    ? ""
    : `Assessed values did not change between ${y0} and ${y1}, so every change on this page comes from tax rates, not from re-valuing property.`;
}

// ---------- 2. who paid less -------------------------------------------

function renderLess() {
  const st = state.story;
  const cls = Object.fromEntries(st.classes.map((c) => [c.key, c]));
  const rc = st.rate_change_2021, lb = st.less_by_class;
  const res = cls.residential, com = cls.commercial, ind = cls.industrial;
  const edu = (c) => `${(c.education_2020 * 100).toFixed(2)}% to ${(c.education_2021 * 100).toFixed(2)}%`;
  const muniRise = (c) => ((c.municipal_2021 / c.municipal_2020 - 1) * 100).toFixed(0);

  const eduTotal = st.education_cut.reduce((sum, e) => sum + e.saving, 0);
  $("less-answer").innerHTML =
    `<strong>Short answer:</strong> businesses got a break in ${CONFIG.yearAfter}, but homeowners didn't pay for it that year. ` +
    `The break was a provincial cut to the education tax on businesses, worth ${fmtMoneyShort(eduTotal)}. ` +
    `Education tax goes to the province for schools, so the City collected the same either way. The real shift onto homes is slower, and it's in <a href="#q5">Question 5</a>.`;
  $("less-lede").textContent =
    `${fmtShare(com.share_less)} of commercial and ${fmtShare(ind.share_less)} of industrial properties got a cut, against ${fmtShare(res.share_less)} of residential ones. ` +
    `The City's own rate on businesses still rose (about ${muniRise(rc.CT)}% for commercial), but the education rate fell further ` +
    `(commercial ${edu(rc.CT)} of assessed value, industrial ${edu(rc.IT)}), so the total went down.`;

  const pct = (v) => (v * 100).toFixed(3).replace(/0$/, "") + "%";
  $("edu-lede").textContent =
    `On top of the City's part, every bill carries an education part set by the province. In ${CONFIG.yearAfter} the province cut the education rate on business classes to ${pct(rc.CT.education_2021)}. ` +
    `Homes stayed at ${pct(rc.RT.education_2021)}.`;
  $("edu-table").innerHTML =
    `<thead><tr><th>Class</th><th>Education rate ${CONFIG.yearBefore}</th><th>Education rate ${CONFIG.yearAfter}</th><th>Saved in ${CONFIG.yearAfter}</th></tr></thead><tbody>` +
    st.education_cut.map((e) => `<tr><td>${escapeHtml(e.group)}</td><td>${pct(e.rate_2020)}</td><td>${pct(e.rate_2021)}</td><td>${fmtMoneyShort(e.saving)}</td></tr>`).join("") +
    `<tr><td>Residential</td><td>${pct(rc.RT.education_2020)}</td><td>${pct(rc.RT.education_2021)}</td><td>$0</td></tr></tbody>` +
    `<tfoot><tr><td><strong>Total</strong></td><td></td><td></td><td><strong>${fmtMoneyShort(eduTotal)}</strong></td></tr></tfoot>`;
  $("less-callout").textContent =
    `A common reading of ${CONFIG.yearAfter} is "businesses got a tax cut and homeowners covered it." The numbers don't support that. ` +
    `Without the education cut, business bills would have been about ${fmtMoneyShort(eduTotal)} higher, and home bills would have been exactly the same. ` +
    `Saved in ${CONFIG.yearAfter} = ${CONFIG.yearAfter} assessed value × the drop in education rate, from the City's levy by-laws.`;
  $("class-title").textContent = "Typical % change in tax bill, by property class";

  const shown = ["residential", "multi", "commercial", "industrial", "farm"].map((k) => cls[k]);
  const businessNet = com.net + ind.net;
  const items = [
    { num: fmtShare(com.share_less), what: `of ${fmtCount(com.n)} commercial properties paid less. Their median bill is ${fmtDollars(com.median_bill)}, against ${fmtDollars(res.median_bill)} for homes.` },
    { num: fmtShare(ind.share_less), what: `of ${fmtCount(ind.n)} industrial properties paid less, by a typical ${fmtSignedPercent(ind.median_pct)} (${fmtSignedDollars(ind.median_change)}).` },
    { num: signed(fmtMoneyShort(businessNet), businessNet), what: `total change for commercial and industrial properties, while residential properties together paid ${fmtMoneyShort(res.net)} more.` },
    { num: fmtCount(lb.mix.residential), what: `residential-class properties also got a cut. ${fmtCount(lb.residential_mixed_use)} of them are parcels shared with another class, such as a home combined with a shop.` },
  ];
  $("contrast").innerHTML = items
    .map((x) => `<div class="card"><div class="num">${x.num}</div><div class="what">${x.what}</div></div>`).join("");

  makeChart("class", $("class-chart"), {
    type: "bar",
    data: {
      labels: shown.map((c) => c.label),
      datasets: [{
        data: shown.map((c) => c.median_pct),
        backgroundColor: shown.map((c) => (c.median_pct < 0 ? css("--decrease") : css("--increase"))),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (it) => shown[it[0].dataIndex].label,
            label: (it) => { const c = shown[it.dataIndex]; return [`Typical change: ${fmtSignedPercent(c.median_pct)} (${fmtSignedDollars(c.median_change)})`, `${fmtShare(c.share_less)} paid less`, `${fmtCount(c.n)} properties`]; },
          },
        },
      },
      scales: {
        x: { grid: { color: css("--line") }, ticks: { color: css("--text-muted"), callback: (v) => v + "%" } },
        y: { grid: { display: false }, ticks: { color: css("--text-soft") } },
      },
    },
  });
}

function makeChart(key, canvas, config) {
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart(canvas, config);
}

// ---------- 3. the clusters --------------------------------------------

function groupOf(change, pct) {
  if (change < 0) return "less";
  const g = state.story.groups.find((x) => x.lo != null && pct >= x.lo && pct < x.hi);
  return g ? g.key : null;
}

function groupRange(g) {
  if (g.key === "less") return "Below 0%";
  if (g.hi >= 100) return `${g.lo}%+`;
  return `${g.lo}–${g.hi}%`;
}

function classLabel(key) {
  const c = state.story.classes.find((x) => x.key === key);
  return c ? c.label : key;
}

const muniPhrase = (name) => (name === "Hamilton" ? "the old City of Hamilton" : name);

// "98% are residential. 85% are in Stoney Creek."
function wardPhrase(g) {
  const [ck, cn] = g.class_mix[0], [mn, mc] = g.top_munis[0];
  const cs = cn / g.n, ms = mc / g.n;
  const cPart = cs >= 0.5 ? `${Math.round(cs * 100)}% are ${ck === "other" ? "unclassified" : classLabel(ck).toLowerCase()}. ` : "";
  const mPart = ms >= 0.5
    ? `${Math.round(ms * 100)}% are in ${muniPhrase(mn)}.`
    : `Found in ${g.top_munis.map((x) => muniPhrase(x[0])).join(", ").replace(/, ([^,]+)$/, " and $1")}.`;
  return cPart + mPart;
}

function renderClusters() {
  const st = state.story;
  const typical = st.groups.find((g) => g.key === "typical");
  const moved = st.tiers.filter((t) => t.moved);
  const movedN = moved.reduce((sum, t) => sum + t.n, 0);
  $("clusters-answer").innerHTML =
    `<strong>Short answer:</strong> tax rates differ by area, and about ${fmtCount(Math.round(movedN / 50) * 50)} homes were moved up to a higher area rate in ${CONFIG.yearAfter}. ` +
    `Within each area, every home got the same percentage increase, whatever its value. Where you lived mattered more than what your house was worth.`;
  $("clusters-lede").textContent =
    `Line up every property by how much its bill changed and you don't get a smooth bell shape. You get stacks. ` +
    `${fmtShare(typical.share)} of bills landed between ${typical.lo}% and ${typical.hi}%, and the rest clumped in distinct blocks, ` +
    `each tied to particular parts of the city.`;

  const colourFor = (from) => {
    const mid = from + 0.05;
    if (mid < 0) return css("--g-less");
    if (mid < 1.5) return css("--g-low");
    if (mid < 2) return css("--g-typical");
    if (mid < 4) return css("--g-higher");
    if (mid >= 6) return css("--g-jump");
    return css("--no-change");
  };
  const h = st.hist;
  makeChart("hist", $("hist-chart"), {
    type: "bar",
    data: {
      labels: h.map((b) => b.from.toFixed(1)),
      datasets: [{ data: h.map((b) => b.count || null), backgroundColor: h.map((b) => colourFor(b.from)), borderWidth: 0, categoryPercentage: 1, barPercentage: 0.95 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (it) => { const f = Number(it[0].label); return `${fmtSignedPercent(f)} to ${fmtSignedPercent(f + 0.1)}`; },
            label: (it) => `${fmtCount(it.raw)} properties`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, color: css("--text-muted"), callback(v, i) { return i % 10 === 0 ? this.getLabelForValue(v).replace(/\.0$/, "") + "%" : ""; } } },
        y: { type: "logarithmic", min: 1, grid: { color: css("--line") }, ticks: { color: css("--text-muted"), callback: (v) => ([1, 10, 100, 1000, 10000, 100000].includes(v) ? fmtCount(v) : "") } },
      },
    },
  });

  $("groups").innerHTML = st.groups.map((g, i) => `
    <div class="group" style="--gc: var(--g-${g.key})">
      <div class="range">${groupRange(g)}</div>
      <div class="name">${escapeHtml(g.label)}</div>
      <p>${fmtCount(g.n)} properties (${fmtShare(g.share)}). ${wardPhrase(g)} Typical change: <strong style="white-space:nowrap">${fmtSignedDollars(g.median_change)}</strong> a year.</p>
      <button type="button" class="btn ghost" data-i="${i}">Show on the map</button>
    </div>`).join("");
  $("groups").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => showGroupOnMap(st.groups[Number(b.dataset.i)])));
}

async function showGroupOnMap(g) {
  await state.mapReady;
  if (!state.map) return;
  const measure = g.key === "less" ? "less" : "pct";
  setMeasure(measure);
  if (g.center) {
    state.map.setView(g.center, CONFIG.MAP.parcelZoom + 1);
  } else {
    const [w, n] = g.top_wards[0];
    if (n / g.n >= 0.3) selectWard(w, { fit: true, only: true });
    else state.map.fitBounds(state.mapLayer.getBounds());
  }
  $("explore").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- 3b. effective-rate tiers ------------------------------------

function renderTiers() {
  const st = state.story;
  const tiers = [...st.tiers].sort((a, b) => (a.moved - b.moved) || (b.rate_2021 - a.rate_2021));
  const lo = 0.95, hi = 1.25, at = (v) => ((v - lo) / (hi - lo)) * 100;
  $("tiers-lede").textContent =
    `Divide a bill by the home's assessed value and you get the rate it pays. Part of that rate is the same city-wide; ` +
    `part is set by area, for services the City charges by area. Homes fall into a handful of these area tiers. ` +
    `Each line runs from a tier's ${CONFIG.yearBefore} rate (hollow dot) to its ${CONFIG.yearAfter} rate. Click a tier to see it on the map.`;
  $("tiers").innerHTML =
    `<div class="tier-scale" aria-hidden="true">${[1.0, 1.1, 1.2].map((v) => `<span style="left:${at(v)}%">${v.toFixed(1)}%</span>`).join("")}</div>` +
    tiers.map((t, i) => `
    <button type="button" class="tier${t.moved ? " moved" : ""}" data-i="${i}">
      <span class="tier-name">${escapeHtml(t.name)}<small>${fmtCount(t.n)} homes${t.moved ? " · moved up a tier" : ""}</small></span>
      <span class="tier-track">
        <span class="tier-line" style="left:${at(Math.min(t.rate_2020, t.rate_2021))}%;width:${Math.abs(at(t.rate_2021) - at(t.rate_2020))}%"></span>
        <span class="tier-dot from" style="left:${at(t.rate_2020)}%" title="${CONFIG.yearBefore}: ${t.rate_2020.toFixed(3)}%"></span>
        <span class="tier-dot to" style="left:${at(t.rate_2021)}%" title="${CONFIG.yearAfter}: ${t.rate_2021.toFixed(3)}%"></span>
      </span>
      <span class="tier-val"><strong>${fmtSignedPercent(t.pct)}</strong><small>${fmtSignedDollars(t.median_change)} typical</small></span>
    </button>`).join("");
  $("tiers").querySelectorAll(".tier").forEach((el) => el.addEventListener("click", () => {
    const t = tiers[Number(el.dataset.i)];
    setMeasure("pct");
    if (t.center) showOnMap(t.center[0], t.center[1], t.name);
  }));

  const sc = tiers.find((t) => t.key === "1.04-1.11");
  const scUrban = tiers.find((t) => t.key === "1.09-1.11");
  const wd = tiers.find((t) => t.key === "1.09-1.1");
  const others = tiers.filter((t) => !t.moved && t !== wd);
  const wdDrop = wd.area_2020 - wd.area_2021;
  const maxOtherDrop = Math.max(...others.map((t) => t.area_2020 - t.area_2021));
  $("clusters-callout").innerHTML =
    `<strong>What happened in eastern Stoney Creek?</strong> Its ${fmtCount(sc.n)} homes went from a ${sc.rate_2020.toFixed(3)}% rate to ${sc.rate_2021.toFixed(3)}%, ` +
    `${Math.abs(sc.rate_2021 - scUrban.rate_2021) < 0.001 ? "exactly the rate the rest of urban Stoney Creek already paid" : "close to the rest of urban Stoney Creek"}. ` +
    `They paid ${fmtMoneyShort(sc.total_change)} more in ${CONFIG.yearAfter}, about ${fmtMoneyShort(sc.above_standard)} more than the standard rise would have cost. ` +
    `Joining the neighbours' rate, rather than getting a new one, looks like an urban service area being extended to them. The data can't say which service.` +
    `<br><br><strong>And Waterdown?</strong> The mirror image. Its area-specific rate fell ${wdDrop.toFixed(3)} points` +
    `${wdDrop > maxOtherDrop ? ", more than any other area's" : ""}, so its homes saw the smallest increase of any tier (${fmtSignedPercent(wd.pct)}).`;
}

// ---------- 4. rate vs bill -----------------------------------------------

function renderBridge() {
  const b = state.story.bridge;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  const shareMuni = b.share_citywide - b.share_education;
  $("bridge-answer").innerHTML =
    `<strong>Short answer:</strong> the ${b.rate_change_total}% is the change in the city-wide rate, and that is only about ${Math.round(b.share_citywide * 100)}% of a typical home's bill. ` +
    `The rest is an area-specific part, which didn't go up, and the education part, which didn't change.`;
  $("bridge-lede").textContent = `Here is a typical home in the old City of Hamilton, assessed at ${fmtDollars(b.assessment)} (the value has been frozen since 2016).`;
  const steps = [
    { label: "City-wide municipal rate", v: b.citywide_municipal, note: `rose ${b.rate_change_municipal}%` },
    { label: "Area-specific rate", v: b.area_specific, note: "fell slightly" },
    { label: "Education rate", v: b.education, note: "unchanged" },
  ];
  const max = Math.max(...steps.map((x) => Math.abs(x.v))) || 1;
  const pctOf = (v) => fmtSignedPercent((v / b.bill_2020) * 100);
  $("bridge").innerHTML = `
    <h3 class="chart-title">What makes up the ${y0} bill</h3>
    <div class="compose" role="img" aria-label="Bill composition">
      <span class="seg-muni" style="width:${shareMuni * 100}%">City-wide municipal ${Math.round(shareMuni * 100)}%</span>
      <span class="seg-area" style="width:${b.share_area * 100}%">Area-specific ${Math.round(b.share_area * 100)}%</span>
      <span class="seg-edu" style="width:${b.share_education * 100}%">Education ${Math.round(b.share_education * 100)}%</span>
    </div>
    <h3 class="chart-title" style="margin-top:22px">How it changed</h3>
    <div class="steps">
      <div class="step total"><span>${y0} bill</span><span></span><strong>${fmtDollars(b.bill_2020)}</strong></div>
      ${steps.map((x) => `<div class="step"><span>${x.label}<small>${x.note}</small></span>
        <span class="step-track"><span class="step-bar ${x.v > 0 ? "up" : x.v < 0 ? "down" : ""}" style="width:${Math.max(x.v ? 4 : 0, Math.abs(x.v) / max * 100)}%"></span></span>
        <strong>${fmtSignedDollars(x.v)} <small>${pctOf(x.v)}</small></strong></div>`).join("")}
      <div class="step total"><span>${y1} bill</span><span></span><strong>${fmtDollars(b.bill_2021)} <small>${pctOf(b.bill_2021 - b.bill_2020)}</small></strong></div>
    </div>`;
  const ann = state.story.annual.find((a) => a.year === CONFIG.yearAfter);
  $("bridge-callout").innerHTML =
    `<strong>So which number is "the" increase?</strong> The City-wide municipal rate rose ${b.rate_change_municipal}% (council's decision). ` +
    `The total city-wide rate rose ${b.rate_change_total}%. A real bill rose ${fmtSignedPercent(state.summary.city.median_percent_change)}. ` +
    `The figure reported at budget time was ${ann.announced}%, which matches none of them. Each answers a different question; only the bill is what people actually paid.`;
}

// ---------- 5. tax ratios -------------------------------------------------

function renderRatios() {
  const st = state.story, eff = st.ratio_effect, last = eff.at(-1), first = eff.at(0);
  const r0 = st.ratios.at(0), rN = st.ratios.at(-1);
  $("ratio-answer").innerHTML =
    `<strong>Short answer:</strong> homeowners, through tax ratios. Since ${CONFIG.yearAfter} council has steadily lowered what apartment buildings and industry pay compared with homes. ` +
    `In ${first.year} that moved ${fmtMoneyShort(first.residential)} onto homes. By ${last.year} it was moving ${fmtMoneyShort(last.residential)} a year, about ${last.residential_rate_pct.toFixed(1)}% of the residential rate.`;
  $("ratio-lede").textContent =
    `A tax ratio says how many times more a class pays per dollar of value than a home. Lowering a ratio doesn't change how much the City collects; it changes who pays it. ` +
    `To measure the effect, each year's city-wide levy is spread again using the ${r0.year} ratios and compared with what homes actually paid.`;
  $("ratio-title").textContent = `Extra paid by homes because of ratio changes since ${r0.year}, $M a year`;
  makeChart("ratio", $("ratio-chart"), {
    type: "bar",
    data: {
      labels: eff.map((e) => e.year),
      datasets: [{ data: eff.map((e) => e.residential / 1e6), backgroundColor: css("--increase"), borderRadius: 4 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (it) => { const e = eff.at(it.dataIndex); return [`${fmtMoneyShort(e.residential)} extra on homes (${e.residential_rate_pct}% of the residential rate)`, `Apartment buildings: ${fmtMoneyShort(e.multi)}`, `Industry: ${fmtMoneyShort(e.industrial)}`]; } } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--text-muted") } },
        y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { color: css("--text-muted"), callback: (v) => "$" + v + "M" } },
      },
    },
  });
  const cols = [["MT", "Apartments"], ["IT", "Industrial"], ["LT", "Large industrial"], ["CT", "Commercial"]];
  const val = (r, c) => (c === "MT" ? r.MT : c === "IT" ? r.IT : c === "LT" ? r.LT : r.CT);
  $("ratio-table").innerHTML =
    `<thead><tr><th>Year</th>${cols.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>` +
    st.ratios.map((r) => `<tr><td>${r.year}</td>${cols.map(([c]) => `<td>${val(r, c).toFixed(2)}</td>`).join("")}</tr>`).join("") + `</tbody>`;
  $("ratio-note").textContent =
    `Homes = 1.00. The apartment ratio fell from ${r0.MT.toFixed(2)} to ${rN.MT.toFixed(2)} in five even steps, which looks like a planned path. ` +
    `In ${last.year} the change saved apartment buildings ${fmtMoneyShort(-last.multi)} and industry ${fmtMoneyShort(-last.industrial)}. ` +
    `A common argument for lowering the apartment ratio is that apartment taxes are passed on to tenants in rent. Whatever the merits, this cost to homeowners never appears in the increase announced each year.`;
}

// ---------- 7. the decade ---------------------------------------------

// Canada's consumer price index rose about 18% from 2011 to 2021 (annual averages, Statistics Canada).
const CPI_2011_2021 = 18;

function renderDecade() {
  const d = state.story.decade, q = d.quintiles, lo = q.at(0), hi = q.at(-1);
  const wards = [...state.summary.wards].filter((w) => w.median_long_change != null).sort((a, b) => b.median_long_change - a.median_long_change);
  $("decade-answer").innerHTML =
    `<strong>Short answer:</strong> homes whose value grew fastest. From 2011 to 2021 the typical home's bill rose ${d.home_tax_change}%, ` +
    `a little more than inflation (about ${CPI_2011_2021}%). But the fifth of homes whose value grew most saw their bills rise ${hi.tax_change}%, ` +
    `while the fifth whose value grew least saw ${lo.tax_change}%.`;
  $("decade-lede").textContent =
    `Property tax divides the City's levy by value. Each reassessment re-sorts everyone: a home whose value rises faster than the city's ` +
    `takes on a bigger share of the bill, and one that rises slower sheds some, even if the rate never changed. ` +
    `Over the decade the typical home's assessed value rose ${d.home_value_growth}%, through two reassessments (2012 and 2016), each phased in over four years.`;
  makeChart("decade", $("decade-chart"), {
    type: "bar",
    data: {
      labels: q.map((x) => [`Value +${Math.round(x.value_growth)}%`, x.fifth === 1 ? "slowest fifth" : x.fifth === 5 ? "fastest fifth" : `fifth ${x.fifth}`]),
      datasets: [{ data: q.map((x) => x.tax_change), backgroundColor: q.map((x) => (x.fifth === 5 ? css("--increase") : css("--no-change"))), borderRadius: 4 }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => { const x = q.at(it.dataIndex); return `Bills ${fmtSignedPercent(x.tax_change)} (${fmtCount(x.n)} homes)`; } } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--text-muted") } },
        y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { color: css("--text-muted"), callback: (v) => "+" + v + "%" } },
      },
    },
  });
  $("decade-note").textContent = `Median for each fifth of ${fmtCount(d.homes_compared)} homes taxed in both 2011 and 2021, sorted by assessed-value growth over the same years.`;
  const top3 = wards.slice(0, 3), bottom3 = wards.slice(-3);
  const card = (w) => `<li><span>${escapeHtml(wardLabel(w.ward))}</span><strong>${fmtSignedPercent(w.median_long_change)}</strong></li>`;
  $("decade-wards").innerHTML =
    `<div class="card"><div class="what">Fastest-rising wards, bill change 2011 to 2021</div><ul class="mini-list">${top3.map(card).join("")}</ul></div>` +
    `<div class="card"><div class="what">Slowest-rising wards</div><ul class="mini-list">${bottom3.map(card).join("")}</ul></div>`;
  $("decade-callout").innerHTML =
    `<strong>Is that unfair?</strong> It is how the system is designed: tax follows value. But it means the neighbourhoods whose values climbed fastest, ` +
    `mostly the lower city (Wards ${top3.map((w) => w.ward).join(", ").replace(/, (\d+)$/, " and $1")}), carry a growing share of the levy whether or not the people living there earn more. ` +
    `Phase-ins slow the climb; they don't change where it ends. Use "Tax change since 2011" on the map to see it street by street.`;
}

// ---------- 8. home types ----------------------------------------------

function renderTypes() {
  const d = state.story.decade, t = d.by_type.filter((x) => x.n >= 500);
  const get = (k) => t.find((x) => x.key === k);
  const C = get("C"), D = get("D"), T = get("T"), P = get("P");
  $("types-answer").innerHTML =
    `<strong>Short answer:</strong> not in any one year: every home in an area pays the same rate per dollar of value. ` +
    `Over a decade, yes, because their values grew at different speeds. Since 2011, condo bills rose ${C.tax_change}%, detached houses ${D.tax_change}%, ` +
    `townhouses ${T.tax_change}% and houses split into 2 to 6 units ${P.tax_change}%.`;
  $("types-table").innerHTML =
    `<thead><tr><th>Home type</th><th>Homes</th><th>Typical value</th><th>Typical 2021 bill</th><th>Value growth 2011–2021</th><th>Bill change 2011–2021</th><th>First taxed after 2012</th></tr></thead><tbody>` +
    [...t].sort((a, b) => b.tax_change - a.tax_change).map((x) => `<tr><td><i class="swatch" style="background:var(--type-${x.key})"></i>${escapeHtml(x.label)}</td><td>${fmtCount(x.n)}</td><td>${fmtDollars(x.median_value)}</td>` +
      `<td>${fmtDollars(x.median_bill)}</td><td>${fmtSignedPercent(x.value_growth_2011)}</td><td><strong>${fmtSignedPercent(x.tax_change)}</strong></td><td>${fmtShare(x.share_new)}</td></tr>`).join("") + `</tbody>`;
  $("types-callout").innerHTML =
    `<strong>Why condos lag and plexes lead.</strong> Condo values rose ${C.value_growth_2011}% over the decade, against ${P.value_growth_2011}% for houses with 2 to 6 units, ` +
    `${fmtShare(P.share_lower_city)} of them in Wards 1 to 4 in the lower city, and almost none built since 2011. Many are rentals, so some of that increase may reach tenants through rent. ` +
    `Home types come from the MPAC property code; "Home type" on the map shows them lot by lot.`;
}

// ---------- 9. newer homes ---------------------------------------------

function renderNewHomes() {
  const n = state.story.decade.new;
  const town = state.story.decade.by_type.find((x) => x.key === "T");
  $("new-answer").innerHTML =
    `<strong>Short answer:</strong> bigger bills, lower rates. The ${fmtCount(n.n)} homes first taxed after 2012 pay a typical ${fmtDollars(n.median_bill)}, ` +
    `against ${fmtDollars(n.median_bill_old)} for older homes, because they are worth more. But they pay less per dollar of value ` +
    `(${n.median_rate.toFixed(2)}% against ${n.median_rate_old.toFixed(2)}%), because most were built outside the old City of Hamilton, where area rates are lower.`;
  const stats = [
    { num: fmtShare(n.share), what: "of homes were first taxed after 2012", more: `${fmtCount(n.n)} homes` },
    { num: "$" + Math.round(n.median_value / 1000) + "k", what: "typical value of a newer home", more: `older homes: $${Math.round(n.median_value_old / 1000)}k` },
    { num: fmtShare(town.share_new), what: "of townhouses are newer", more: "more than any other home type" },
  ];
  $("new-stats").innerHTML = stats.map((x) => `<div class="bigstat"><div class="num">${x.num}</div><div class="what">${x.what}</div><div class="more">${x.more}</div></div>`).join("");
  const list = (rows) => rows.slice(0, 4).map(([k, v]) => `${k} (${fmtCount(v)})`).join(", ");
  $("new-lede").textContent =
    `Where they are: ${list(n.by_area)}. What they are: ${list(n.by_type)}. ` +
    `"First taxed" is the first year a property appears in the tax data as a building, so it stands in for age only after 2011.`;
  $("new-callout").innerHTML =
    `<strong>Was the 2021 jump in eastern Stoney Creek about new subdivisions?</strong> No. ${fmtShare(n.winona_existing_2011)} of the homes that moved up a tier there ` +
    `were already taxed as buildings in 2011. The change was to the area, not the houses.`;
}

// ---------- open questions ---------------------------------------------

function renderOpenQuestions() {
  const st = state.story, moved = st.tiers.filter((t) => t.moved);
  const movedN = moved.reduce((sum, t) => sum + t.n, 0);
  const ann = st.annual.find((a) => a.year === CONFIG.yearAfter);
  const qs = [
    `Which area-rated services changed their boundaries in eastern Stoney Creek and north-west Glanbrook for ${CONFIG.yearAfter}? Were the ${fmtCount(movedN)} affected homes told before the bill arrived, and was a phase-in considered?`,
    `Why did Waterdown's area-specific rate fall more than any other area's?`,
    `How is the announced average increase (${ann.announced}% for ${CONFIG.yearAfter}) calculated? It matches neither the rate change nor the bills.`,
    `Why do ${fmtCount(st.checks.multi_zero)} of ${fmtCount(st.checks.multi_n)} apartment buildings show exactly 0.0% change, when their class rate rose about 1%?`,
    `The levy by-law's commercial and industrial assessment jumped in 2023, even though property values were still frozen at 2016 levels. What changed?`,
    `Where does the tax-ratio path end, and is its cost to homeowners reported to council each year?`,
  ];
  $("open-qs").innerHTML = qs.map((q) => `<li>${escapeHtml(q)}</li>`).join("");
}

// ---------- extremes ------------------------------------------------

function renderExtremes() {
  const list = (id, rows) => {
    $(id).innerHTML = rows.map((r, i) => `
      <li tabindex="0" data-i="${i}">
        <span class="a">${escapeHtml(r.address)}</span>
        <span class="d ${r.change > 0 ? "up" : "down"}">${fmtSignedDollars(r.change)}</span>
        <span class="m">${wardLabel(r.ward)} · ${r.class && r.class !== "other" ? escapeHtml(classLabel(r.class)) + " · " : ""}${fmtDollars(r.tax2020)} → ${fmtDollars(r.tax2021)}</span>
        <span class="m" style="text-align:right">${fmtSignedPercent(r.pct)}</span>
      </li>`).join("");
    $(id).querySelectorAll("li").forEach((li) => {
      const go = () => { const r = rows[Number(li.dataset.i)]; showOnMap(r.lat, r.lon, r.address); };
      li.addEventListener("click", go);
      li.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  };
  list("ext-up", state.story.extremes.up);
  list("ext-down", state.story.extremes.down);
}

// ---------- 6. zoom out ------------------------------------------------

function renderHistory() {
  const st = state.story;
  const ann = st.annual;
  const idx = st.rate_index;
  const at = (code, year) => (idx[code].find((p) => p[0] === year) || [])[1];

  const obs = ann.filter((a) => a.observed != null);
  const thisObs = obs.find((a) => a.year === CONFIG.yearAfter);
  const lowerSince = obs.filter((a) => a.year < CONFIG.yearAfter && a.observed <= thisObs.observed).map((a) => a.year).at(-1);
  const later = ann.filter((a) => a.year >= 2023 && a.year <= 2025 && a.announced != null).map((a) => a.announced);
  $("history-answer").innerHTML =
    `<strong>Short answer:</strong> no. In the City's parcel data, ${CONFIG.yearAfter} was the smallest residential increase since ${lowerSince}. ` +
    `It was the calm before 2023 to 2025, when announced increases ran ${Math.min(...later)}% to ${Math.max(...later)}% a year.`;
  const hp = st.home_path, h21 = hp.find((h) => h.year === CONFIG.yearAfter), hN = hp.at(-1);
  $("home-path").innerHTML =
    `<strong>What that means for a home.</strong> On the city-wide rate alone, the median home (assessed at ${fmtDollars(st.median_home)}) paid ${fmtDollars(h21.citywide)} in ${h21.year} ` +
    `and ${fmtDollars(hN.citywide)} in ${hN.year} (${fmtSignedDollars(hN.citywide - h21.citywide)}, ${fmtSignedPercent((hN.citywide / h21.citywide - 1) * 100)}), with no change at all in its assessed value. ` +
    `For a typical old-Hamilton home the full bill is estimated to go from ${fmtDollars(h21.old_hamilton_est)} to ${fmtDollars(hN.old_hamilton_est)}, holding its area-specific rate at the ${h21.year} level.`;
  $("history-lede").textContent =
    `The increases also stopped being shared evenly. Since 2020 the residential tax rate is up ${Math.round(at("RT", 2025) - 100)}%, against ${Math.round(at("CT", 2025) - 100)}% for commercial and ${Math.round(at("IT", 2025) - 100)}% for industrial.`;
  $("history-note").textContent =
    "Announced figures are the average residential increase reported when council adopted each budget (sources are in data/source/hamilton_annual_tax_increases.csv). " +
    "Observed figures are the median residential change in the City's parcel data, available only for years the City published a parcel layer. " +
    `They don't always agree (${CONFIG.yearAfter}: 2.1% announced, 1.7% observed) and the data doesn't say why.`;

  makeChart("annual", $("annual-chart"), {
    type: "bar",
    data: {
      labels: ann.map((a) => a.year),
      datasets: [
        { label: "Announced", data: ann.map((a) => a.announced), backgroundColor: css("--no-change"), borderRadius: 3 },
        { label: "Observed (median)", data: ann.map((a) => a.observed), backgroundColor: css("--accent"), borderRadius: 3 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: css("--text-soft"), boxWidth: 12 } }, tooltip: { callbacks: { label: (it) => `${it.dataset.label}: ${it.raw}%` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--text-muted") } },
        y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { color: css("--text-muted"), callback: (v) => v + "%" } },
      },
    },
  });

  const lines = [["RT", "Residential", "--increase"], ["MT", "Multi-residential", "--text-muted"], ["CT", "Commercial", "--decrease"], ["IT", "Industrial", "--highlight"]];
  makeChart("rate", $("rate-chart"), {
    type: "line",
    data: {
      labels: idx.RT.map((p) => p[0]),
      datasets: lines.map(([code, label, col]) => ({
        label, data: idx[code].map((p) => p[1]), borderColor: css(col), backgroundColor: css(col), borderWidth: 3, pointRadius: 3, tension: 0.2,
      })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: css("--text-soft"), boxWidth: 12 } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--text-muted") } },
        y: { grid: { color: css("--line") }, ticks: { color: css("--text-muted") } },
      },
    },
  });
}

// ---------- ward table -------------------------------------------------

const TABLE_COLUMNS = [
  { key: "ward", label: "Ward", fmt: (v) => wardLabel(v) },
  { key: "properties", label: "Properties", fmt: fmtCount },
  { key: "median_tax_2021", label: "Typical 2021 bill", fmt: fmtDollars },
  { key: "median_dollar_change", label: "Typical $ change", fmt: fmtSignedDollars },
  { key: "median_percent_change", label: "Typical % change", fmt: fmtSignedPercent },
  { key: "share_decrease", label: "Paying less", fmt: fmtShare },
  { key: "tax_change", label: "Total tax change", fmt: (v) => signed(fmtMoneyShort(v), v) },
];

function renderTable() {
  const { key, dir } = state.tableSort;
  const wards = state.summary.wards.map((w) => ({ ...w, tax_change: w.total_tax_2021 - w.total_tax_2020 }));
  const rows = wards.sort((a, b) => (a[key] - b[key]) * dir);
  const c = { ...state.summary.city, ward: "City", tax_change: state.summary.city.total_tax_2021 - state.summary.city.total_tax_2020 };
  const head = TABLE_COLUMNS.map((col) =>
    `<th data-key="${col.key}">${col.label}${col.key === key ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("");
  const body = rows.map((w) =>
    `<tr data-ward="${w.ward}" class="${w.ward === state.selectedWard ? "selected" : ""}">` +
    TABLE_COLUMNS.map((col) => `<td>${col.fmt(w[col.key])}</td>`).join("") + "</tr>").join("");
  const foot = "<tr><td><strong>City</strong></td>" +
    TABLE_COLUMNS.slice(1).map((col) => `<td><strong>${col.fmt(c[col.key])}</strong></td>`).join("") + "</tr>";
  const table = $("ward-table");
  table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
  table.querySelectorAll("th").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.key;
    state.tableSort = { key: k, dir: state.tableSort.key === k ? -state.tableSort.dir : (k === "ward" ? 1 : -1) };
    renderTable();
  }));
  table.querySelectorAll("tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => selectWard(Number(tr.dataset.ward), { fit: true })));
}

// ---------- 4. map -----------------------------------------------------
// Zoomed out, the map colours whole wards by the chosen measure.
// Zoomed in (CONFIG.MAP.parcelZoom or closer), it shows every property lot,
// loading one ward's lots at a time.

const parcelCache = {};   // ward number -> Leaflet layer (or a Promise while loading)
let pendingLoads = 0;
let parcelsWereShown = false;

const showingLots = () => state.map && state.map.getZoom() >= CONFIG.MAP.parcelZoom;
const wardOf = (feature) => Number(feature.properties[CONFIG.MAP.joinField]);

async function initMap() {
  // Controls first, so they work as soon as the map is up.
  const groups = [...new Set(Object.values(MEASURES).map((m) => m.group))];
  $("measure-select").innerHTML = groups.map((g) => `<optgroup label="${escapeHtml(g)}">` +
    Object.entries(MEASURES).filter(([, m]) => m.group === g).map(([k, m]) => `<option value="${k}">${escapeHtml(m.label)}</option>`).join("") +
    `</optgroup>`).join("");
  $("measure-select").addEventListener("change", (e) => setMeasure(e.target.value));
  $("view-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  renderRank();

  let geo;
  try {
    const res = await fetch(CONFIG.MAP.geojsonFile);
    if (!res.ok) throw new Error(res.status);
    geo = await res.json();
  } catch (e) {
    $("map-slot").innerHTML = '<div class="card">The map could not be loaded.</div>';
    return;
  }

  state.map = L.map("map", { scrollWheelZoom: true, zoomControl: false }).setView(CONFIG.MAP.center, CONFIG.MAP.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(state.map);

  L.control.zoom({ position: "topright" }).addTo(state.map);
  state.map.createPane("parcels").style.zIndex = 390; // under the ward outlines
  state.parcelRenderer = L.canvas({ pane: "parcels" });
  state.map.createPane("wards").style.zIndex = 400;
  state.mapLayer = L.geoJSON(geo, {
    pane: "wards",
    renderer: L.svg({ pane: "wards" }),
    onEachFeature: (feature, layer) => {
      const w = wardOf(feature);
      layer.on({
        click: () => { if (!showingLots()) selectWard(w, { fit: true, only: true }); },
        mouseover: () => { if (showingLots()) return; layer.setStyle({ weight: 3.5 }); wardInfo(w); },
        mouseout: () => {
          layer.setStyle({ weight: w === state.selectedWard ? 4 : 1.5 });
          mapHint();
        },
      });
    },
  }).addTo(state.map);
  state.wardBounds = {};
  state.mapLayer.eachLayer((l) => { state.wardBounds[wardOf(l.feature)] = l.getBounds(); });

  state.legend = L.control({ position: "bottomright" });
  state.legend.onAdd = () => L.DomUtil.create("div", "legend leaflet-control");
  state.legend.addTo(state.map);

  state.map.fitBounds(state.mapLayer.getBounds());
  state.map.on("zoomend moveend", updateParcels);
  styleMap();
  syncControls();
}

function setView(view) {
  if (!state.map) return;
  if (view === "wards") state.map.fitBounds(state.mapLayer.getBounds());
  else if (!showingLots()) state.map.setView(state.map.getCenter(), CONFIG.MAP.parcelZoom);
}

function setMeasure(key) {
  state.measure = key;
  renderRank();
  syncControls();
  if (state.mapLayer) { styleMap(); restyleParcels(); }
}

function syncControls() {
  $("measure-select").value = state.measure;
  $("measure-desc").textContent = MEASURES[state.measure].desc;
  const lots = !!showingLots();
  $("view-seg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.view === "lots") === lots)));
}

function mapHint() {
  const info = $("map-info");
  if (!state.map) return;
  info.innerHTML = showingLots()
    ? `<strong>Every lot is a property.</strong>Click one for its bill. Zoom out to compare wards.`
    : `<strong>Hover or click a ward.</strong>Zoom in, or choose "Every property", to see individual lots.`;
}

function wardInfo(w) {
  const d = state.summary.wards.find((x) => x.ward === w);
  if (!d) return;
  const m = MEASURES[state.measure];
  $("map-info").innerHTML = `<strong>${escapeHtml(wardLabel(w))}</strong>${m.title}: ${m.fmt(d[m.ward])} · ${fmtCount(d.properties)} properties`;
}

// Equal-width colour steps between the lowest and highest ward.
function wardScale(field) {
  const vals = state.summary.wards.map((w) => w[field]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const steps = Math.min(7, Math.max(3, CONFIG.MAP.colourSteps));
  const palette = Array.from({ length: steps }, (_, i) => css(`--map-${1 + Math.round((i * 6) / (steps - 1))}`));
  const idx = (v) => (max === min ? 0 : Math.min(steps - 1, Math.floor(((v - min) / (max - min)) * steps)));
  return { min, max, steps, palette, colour: (v) => palette[idx(v)] };
}

function styleMap() {
  if (!state.mapLayer) return;
  const m = MEASURES[state.measure], lots = showingLots();
  const byWard = Object.fromEntries(state.summary.wards.map((w) => [w.ward, w]));
  const scale = wardScale(m.ward);

  state.map.getPane("wards").style.pointerEvents = lots ? "none" : "";
  state.mapLayer.eachLayer((layer) => {
    const w = wardOf(layer.feature), d = byWard[w], sel = w === state.selectedWard;
    layer.setStyle({
      fill: !lots && !!d,
      fillColor: d ? scale.colour(d[m.ward]) : css("--line"),
      fillOpacity: 0.78,
      color: sel ? css("--highlight") : lots ? css("--text-soft") : css("--card-bg"),
      weight: sel ? 4 : lots ? 2 : 1.5,
    });
    if (sel) layer.bringToFront();
    layer.unbindTooltip();
    if (!lots) layer.bindTooltip(String(w), { permanent: true, direction: "center", className: "ward-label" });
  });

  if (lots) {
    setLegend(m.lot, lotClasses().filter((c) => !c.hide).map((c) => [c.colour, c.label]));
  } else {
    const step = (scale.max - scale.min) / scale.steps;
    setLegend(m.title, scale.palette.map((col, i) => [col, `${m.fmt(scale.min + i * step)} – ${m.fmt(scale.min + (i + 1) * step)}`]));
  }
  mapHint();
}

function setLegend(title, rows) {
  const el = state.legend.getContainer();
  el.innerHTML = `<strong>${escapeHtml(title)}</strong>` +
    rows.map(([col, text]) => `<div><i style="background:${col}"></i>${escapeHtml(text)}</div>`).join("");
}

// ---- ward panel (ranked list + detail) ----

function renderRank() {
  const m = MEASURES[state.measure];
  $("rank-title").textContent = m.title + ", by ward";
  const rows = [...state.summary.wards].sort((a, b) => b[m.ward] - a[m.ward]);
  const max = Math.max(...rows.map((w) => Math.abs(w[m.ward]))) || 1;
  $("rank").innerHTML = rows.map((w) => `
    <li tabindex="0" data-ward="${w.ward}" class="${w.ward === state.selectedWard ? "selected" : ""}">
      <span>Ward ${w.ward}</span>
      <span><div class="bar" style="width:${Math.max(3, Math.abs(w[m.ward]) / max * 100)}%"></div></span>
      <span class="val">${m.fmt(w[m.ward])}</span>
    </li>`).join("");
  $("rank").querySelectorAll("li").forEach((li) => {
    const go = () => selectWard(Number(li.dataset.ward), { fit: true });
    li.addEventListener("click", go);
    li.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
  renderWardDetail();
}

function renderWardDetail() {
  const el = $("ward-detail");
  const d = state.summary.wards.find((w) => w.ward === state.selectedWard);
  if (!d) { el.hidden = true; return; }
  const c = state.summary.city;
  el.hidden = false;
  el.innerHTML = `<strong>${escapeHtml(wardLabel(d.ward))}</strong>
    <dl>
      <dt>Properties</dt><dd>${fmtCount(d.properties)}</dd>
      <dt>Typical 2021 bill</dt><dd>${fmtDollars(d.median_tax_2021)}</dd>
      <dt>Typical change</dt><dd>${fmtSignedDollars(d.median_dollar_change)} (${fmtSignedPercent(d.median_percent_change)})</dd>
      <dt>Paying less</dt><dd>${fmtShare(d.share_decrease)} <span class="muted">(city ${fmtShare(c.share_decrease)})</span></dd>
      <dt>Total tax change</dt><dd>${signed(fmtMoneyShort(d.total_tax_2021 - d.total_tax_2020), d.total_tax_2021 - d.total_tax_2020)}</dd>
      ${d.median_home_value != null ? `<dt>Typical home value</dt><dd>${fmtDollars(d.median_home_value)}</dd>
      <dt>Typical home tax rate</dt><dd>${fmtRate(d.median_home_rate)}</dd>
      <dt>Bill change since 2011</dt><dd>${fmtSignedPercent(d.median_long_change)} <span class="muted">(homes ${fmtSignedPercent(state.story.decade.home_tax_change)})</span></dd>
      <dt>Detached share of homes</dt><dd>${fmtShare(d.share_detached)}</dd>
      <dt>First taxed after 2012</dt><dd>${fmtShare(d.share_new)}</dd>` : ""}
    </dl>`;
}

// opts.fit: zoom the map to the ward. opts.only: select (never deselect).
function selectWard(w, opts = {}) {
  state.selectedWard = state.selectedWard === w && !opts.only ? null : w;
  renderRank();
  renderTable();
  if (state.mapLayer) {
    styleMap();
    if (opts.fit && state.selectedWard && state.wardBounds[w]) state.map.fitBounds(state.wardBounds[w]);
  }
}

// ---- property lots ----

// Colour classes for lots, for whichever measure is picked.
// A lot's feature properties: c = $ change, p = % change, t1 = 2021 bill, n = units, x = no tax.
function lotClasses() {
  const m = state.measure, B = CONFIG.MAP;
  const up = [1, 2, 3, 4].map((i) => css(`--lot-up-${i}`));
  const down = css("--lot-down"), none = css("--lot-none");
  const noTax = { test: (p) => p.x, colour: none, label: "No tax", hide: true };
  const less = { test: (p) => p.c < 0, colour: down, label: "Paying less" };

  if (m === "less") {
    return [noTax, less, { test: () => true, colour: none, label: "Paying more, or no change" }];
  }
  if (m === "pct") {
    return [noTax, less,
      { test: (p) => p.p < 1.5, colour: up[0], label: "Under 1.5% more" },
      { test: (p) => p.p < 2, colour: up[1], label: "1.5–2% more (the standard rise)" },
      { test: (p) => p.p < 6, colour: up[2], label: "2–6% more" },
      { test: () => true, colour: up[3], label: "More than 6% more" }];
  }
  if (m === "dollars") {
    const b = B.dollarBreaks;
    return [noTax, less,
      { test: (p) => p.c <= b[0], colour: up[0], label: `Up to ${fmtDollars(b[0])} more` },
      { test: (p) => p.c <= b[1], colour: up[1], label: `${fmtDollars(b[0])} to ${fmtDollars(b[1])} more` },
      { test: (p) => p.c <= b[2], colour: up[2], label: `${fmtDollars(b[1])} to ${fmtDollars(b[2])} more` },
      { test: () => true, colour: up[3], label: `More than ${fmtDollars(b[2])} more` }];
  }
  const ramp = (breaks, cols, value, fmt, unit) => [noTax,
    { test: (p) => value(p) == null, colour: none, label: "No data", hide: true },
    ...breaks.map((lim, i) => ({
      test: (p) => value(p) < lim, colour: cols.at(i),
      label: i === 0 ? `Under ${fmt(lim)}${unit}` : `${fmt(breaks.at(i - 1))} to ${fmt(lim)}${unit}`,
    })),
    { test: () => true, colour: cols.at(breaks.length), label: `${fmt(breaks.at(-1))}${unit} or more` }];
  const blues = [1, 2, 3, 4, 6, 7].map((i) => css(`--map-${i}`));
  const reds = [1, 2, 3, 4, 5].map((i) => css(`--lot-up-${i}`));
  const plusPct = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v) + "%";
  if (m === "value") {
    const k = (v) => "$" + v / 1000 + "k";
    return ramp(B.valueBreaks, blues, (p) => p.v, k, "");
  }
  if (m === "rate") {
    const rows = ramp([1.03, 1.09, 1.11, 1.15, 1.3], blues, (p) => p.e, (v) => v.toFixed(2) + "%", "");
    const notes = ["", "", " (mostly rural)", "", " (Waterdown, Stoney Creek, Dundas)", " (Ancaster, Mount Hope)", " (old City of Hamilton)", " (apartments, businesses)"];
    return rows.map((r, i) => (r.hide ? r : { ...r, label: r.label + (notes.at(i) || "") }));
  }
  if (m === "type") {
    const types = state.summary.types || {};
    return [noTax, ...["D", "S", "T", "C", "P", "A", "V", "F", "B", "I", "O"].map((k) => ({
      test: (p) => (p.k || "O") === k, colour: css(`--type-${k}`), label: types[k] || k,
    }))];
  }
  if (m === "growth") {
    return [noTax, { test: (p) => p.g == null, colour: none, label: "No data", hide: true },
      { test: (p) => p.g < 0, colour: down, label: "Value went down" },
      ...ramp([20, 27, 34, 40], reds, (p) => p.g, plusPct, "").slice(2)];
  }
  if (m === "long") {
    return [noTax, { test: (p) => p.l == null, colour: none, label: "Not taxed in 2011", hide: true },
      { test: (p) => p.l < 0, colour: down, label: "Lower than in 2011" },
      ...ramp([15, 22, 30, 40], reds, (p) => p.l, plusPct, "").slice(2)];
  }
  if (m === "new") {
    return [noTax,
      { test: (p) => p.y == null, colour: none, label: "No data", hide: true },
      { test: (p) => p.y <= 2011, colour: css("--lot-none"), label: "Taxed as a building by 2011" },
      { test: (p) => p.y <= 2016, colour: css("--map-3"), label: "First taxed 2012 to 2016" },
      { test: (p) => p.y <= 2019, colour: css("--map-5"), label: "First taxed 2017 to 2019" },
      { test: () => true, colour: css("--map-7"), label: "First taxed 2020 or 2021" }];
  }
  // bill: dark = big bill
  const b = B.billBreaks;
  const cols = [2, 3, 4, 6, 7].map((i) => css(`--map-${i}`));
  const bill = (p) => (p.n > 1 ? p.t1 / p.n : p.t1);
  return [noTax,
    ...b.map((lim, i) => ({
      test: (p) => bill(p) < lim, colour: cols[i],
      label: i === 0 ? `Under ${fmtDollars(lim)}` : `${fmtDollars(b[i - 1])} to ${fmtDollars(lim)}`,
    })),
    { test: () => true, colour: cols[b.length], label: `${fmtDollars(b[b.length - 1])} or more` }];
}

function parcelStyle(feature) {
  const p = feature.properties;
  const cls = state.lotClasses.find((c) => c.test(p));
  return {
    renderer: state.parcelRenderer,
    fillColor: cls ? cls.colour : css("--lot-none"),
    fillOpacity: p.x ? 0.4 : 0.88,
    color: css("--card-bg"),
    weight: 0.4,
  };
}

function parcelPopup(p) {
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  if (p.x) return `<strong>${escapeHtml(p.a)}</strong><br>No property tax in ${y0} or ${y1}.`;
  const g = state.story.groups.find((x) => x.key === groupOf(p.c, p.p));
  const tag = g ? `<br><em>${escapeHtml(g.label)}</em>` : "";
  const units = p.n > 1
    ? `<br>${fmtCount(p.n)} units on this lot. Typical unit: ${fmtSignedDollars(p.c)} (${fmtSignedPercent(p.p)})<br>All units: ${fmtDollars(p.t0)} → ${fmtDollars(p.t1)}`
    : `<br>${y0}: ${fmtDollars(p.t0)} → ${y1}: ${fmtDollars(p.t1)}<br>Change: <strong>${fmtSignedDollars(p.c)} (${fmtSignedPercent(p.p)})</strong>`;
  const types = state.summary.types || {};
  const more = [
    p.k && types[p.k] ? types[p.k] : null,
    p.v != null ? `Assessed at ${fmtDollars(p.v)}${p.n > 1 ? " (typical unit)" : ""}` : null,
    p.e != null ? `Tax rate ${p.e.toFixed(3)}% of value` : null,
    p.g != null ? `Value growth 2016–2021: ${fmtSignedPercent(p.g)}` : null,
    p.l != null ? `Bill change since 2011: ${fmtSignedPercent(p.l)}` : null,
    p.y != null && p.y > 2011 ? `First taxed as a building: ${p.y}` : null,
  ].filter(Boolean);
  return `<strong>${escapeHtml(p.a)}</strong>${units}${tag}` + (more.length ? `<div class="popup-more">${more.map(escapeHtml).join("<br>")}</div>` : "");
}

function loadWardParcels(ward) {
  if (parcelCache[ward]) return parcelCache[ward];
  pendingLoads++;
  $("map-info").classList.add("busy");
  parcelCache[ward] = fetch(`${CONFIG.MAP.parcelFolder}/ward-${ward}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((geo) => {
      const layer = L.geoJSON(geo, {
        pane: "parcels",
        style: parcelStyle,
        onEachFeature: (f, l) => l.bindPopup(() => parcelPopup(f.properties)),
      });
      parcelCache[ward] = layer;
      return layer;
    })
    .catch(() => { delete parcelCache[ward]; return null; })
    .finally(() => { if (--pendingLoads === 0) $("map-info").classList.remove("busy"); });
  return parcelCache[ward];
}

async function updateParcels() {
  const show = showingLots();
  if (show !== parcelsWereShown) {
    parcelsWereShown = show;
    styleMap();
  }
  syncControls();
  state.lotClasses = lotClasses();
  const view = state.map.getBounds();
  for (const [ward, bounds] of Object.entries(state.wardBounds)) {
    const cached = parcelCache[ward];
    if (show && bounds.intersects(view)) {
      const layer = await loadWardParcels(ward);
      // The view may have changed while the file was loading.
      if (layer && showingLots() && state.wardBounds[ward].intersects(state.map.getBounds())) layer.addTo(state.map);
    } else if (cached && cached.remove) {
      cached.remove();
    }
  }
}

// Recolour loaded lots (after changing measure or light/dark).
function restyleParcels() {
  state.lotClasses = lotClasses();
  Object.values(parcelCache).forEach((l) => l.setStyle && l.setStyle(parcelStyle));
}

// Zooms the map to a property and drops a pin. scroll: bring the map into view.
async function showOnMap(lat, lon, label, scroll = true) {
  await state.mapReady;
  if (!state.map || lat == null) return;
  if (state.pin) state.pin.remove();
  state.pin = L.marker([lat, lon]).bindTooltip(escapeHtml(label), { permanent: true, direction: "top", offset: [0, -34] }).addTo(state.map);
  state.map.setView([lat, lon], CONFIG.MAP.parcelZoom + 3);
  if (scroll) $("explore").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- property lookup -------------------------------------------

function loadProperties() {
  if (state.propertiesPromise) return state.propertiesPromise;
  $("search-status").textContent = "Loading all 186,000 addresses…";
  state.propertiesPromise = Promise.all([
      fetch("data/properties.json").then((r) => r.json()),
      fetch("data/classes.json").then((r) => r.json()).catch(() => null),
    ])
    .then(([json, classes]) => {
      state.classes = classes;
      state.properties = json.rows;
      state.sortedChanges = json.rows.filter((r) => r[4] > 0 && r[5] > 0).map((r) => r[6]).sort((a, b) => a - b);
      resetStatus();
      runSearch();
    })
    .catch(() => {
      state.propertiesPromise = null;
      $("search-status").textContent = "Could not load the property list.";
    });
  return state.propertiesPromise;
}

function resetStatus() {
  $("search-status").innerHTML = 'Or <button type="button" class="link" id="random">show me a random property</button>.';
  $("random").addEventListener("click", randomProperty);
}

let activeResult = -1;
let currentHits = [];

function initLookup() {
  const input = $("search");
  let timer;
  input.addEventListener("focus", loadProperties);
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(runSearch, 120); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!currentHits.length) return;
      e.preventDefault();
      activeResult = (activeResult + (e.key === "ArrowDown" ? 1 : -1) + currentHits.length) % currentHits.length;
      document.querySelectorAll(".result").forEach((el, i) => el.classList.toggle("active", i === activeResult));
    } else if (e.key === "Enter" && currentHits.length) {
      pick(currentHits[Math.max(0, activeResult)]);
    } else if (e.key === "Escape") {
      closeResults();
    }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".finder")) closeResults(); });
  $("random").addEventListener("click", randomProperty);
}

function closeResults() {
  $("results").hidden = true;
  $("search").setAttribute("aria-expanded", "false");
  currentHits = []; activeResult = -1;
}

function runSearch() {
  if (!state.properties) return;
  const q = $("search").value.trim().toUpperCase().replace(/\s+/g, " ");
  if (q.length < 3) { closeResults(); return; }

  const starts = [], contains = [];
  for (const p of state.properties) {
    if (p[0].startsWith(q) || p[2].startsWith(q)) starts.push(p);
    else if (p[0].includes(q)) contains.push(p);
    if (starts.length >= CONFIG.lookupMaxResults) break;
  }
  const hits = starts.concat(contains).slice(0, CONFIG.lookupMaxResults);
  currentHits = hits; activeResult = -1;
  const out = $("results");
  out.hidden = false;
  $("search").setAttribute("aria-expanded", "true");
  if (!hits.length) {
    out.innerHTML = '<div class="result"><div class="meta">No matches. Try just the street name, e.g. FALCON.</div></div>';
    return;
  }
  out.innerHTML = hits.map((p, i) => {
    const cls = p[6] > 0 ? "up" : p[6] < 0 ? "down" : "";
    return `<div class="result" role="option" data-i="${i}">
      <div><div class="addr">${escapeHtml(p[0])}</div><div class="meta">${wardLabel(p[1])} · Roll ${escapeHtml(p[2])}</div></div>
      <div class="delta ${cls}">${fmtSignedDollars(p[6])}<br><span class="meta">${fmtSignedPercent(p[7])}</span></div>
    </div>`;
  }).join("");
  out.querySelectorAll(".result[data-i]").forEach((el) =>
    el.addEventListener("mousedown", (e) => { e.preventDefault(); pick(hits[Number(el.dataset.i)]); }));
}

function pick(p) {
  closeResults();
  $("search").value = p[0];
  showReceipt(p);
}

async function randomProperty() {
  await loadProperties();
  if (!state.properties) return;
  const pool = state.properties.filter((r) => r[4] > 0 && r[5] > 0 && r[8] != null && r[0].trim() && !r[0].startsWith("0 "));
  const p = pool[Math.floor(Math.random() * pool.length)];
  $("search").value = p[0];
  showReceipt(p);
}

const historyCache = {};

// Ten years of this property's bills, drawn as a small line.
async function showHistory(p) {
  const [, ward, roll] = p;
  const el = $("receipt-history");
  if (!el || !ward) return;
  if (!historyCache[ward]) historyCache[ward] = fetch(`data/history/ward-${ward}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const h = await historyCache[ward];
  const series = h && h.tax[roll];
  if (!series || $("receipt-history") !== el) return;
  const pts = h.years.map((y, i) => [y, series.at(i)]).filter(([, v]) => v != null && v > 0);
  if (pts.length < 3) return;
  const W = 520, H = 90, x0 = pts.at(0)[0], x1 = pts.at(-1)[0];
  const vals = pts.map(([, v]) => v), lo = Math.min(...vals), hi = Math.max(...vals);
  const X = (y) => 8 + ((y - x0) / (x1 - x0 || 1)) * (W - 16), Y = (v) => H - 18 - ((v - lo) / (hi - lo || 1)) * (H - 36);
  const line = pts.map(([y, v], i) => `${i ? "L" : "M"}${X(y).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const first = pts.at(0), last = pts.at(-1), change = (last[1] / first[1] - 1) * 100;
  const typical = state.story.decade.home_tax_change;
  el.innerHTML = `<p class="history-title">Your bill since ${first[0]}: <strong>${fmtSignedPercent(change)}</strong>` +
    (first[0] === 2011 ? ` <span class="muted">(typical home ${fmtSignedPercent(typical)})</span>` : "") + `</p>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tax bill by year">
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
      ${pts.map(([y, v]) => `<circle cx="${X(y)}" cy="${Y(v)}" r="3" fill="var(--accent)"><title>${y}: ${fmtDollars(v)}</title></circle>`).join("")}
      <text x="${X(first[0])}" y="${H - 2}" font-size="11" fill="var(--text-muted)">${first[0]}: ${fmtDollars(first[1])}</text>
      <text x="${X(last[0])}" y="${H - 2}" font-size="11" text-anchor="end" fill="var(--text-muted)">${last[0]}: ${fmtDollars(last[1])}</text>
    </svg>`;
}

function showReceipt(p) {
  const [address, ward, roll, assessment, t0, t1, change, pct, lat, lon] = p;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  const st = state.story, city = state.summary.city;
  const wardStats = state.summary.wards.find((w) => w.ward === ward);
  const taxed = t0 > 0 && t1 > 0;
  const code = state.classes ? (state.classes.rolls[roll] || "RT") : null;
  const fam = code ? (state.classes.family[code] || "other") : null;
  const famLabel = code && fam !== "other" ? state.classes.labels[fam] : "";
  const homeType = p[10] && state.summary.types ? state.summary.types[p[10]] : "";
  const placeLabel = homeType && !["O"].includes(p[10]) ? homeType : famLabel;
  const el = $("receipt");
  history.replaceState(null, "", `#p=${roll}`);

  let inner;
  if (!taxed) {
    inner = `<h3>${escapeHtml(address)}</h3><p class="where">${wardLabel(ward)}${placeLabel ? " · " + escapeHtml(placeLabel) : ""} · Roll ${escapeHtml(roll)}</p>
      <p class="verdict">This property was not billed property tax in ${y0} or ${y1} (${t0 + t1 === 0 ? "no tax in either year" : "tax in only one year"}), so there is no change to compare.</p>`;
  } else {
    const key = groupOf(change, pct);
    const g = st.groups.find((x) => x.key === key);
    let verdict;
    if (key === "less") {
      verdict = `Your bill went <strong>down</strong>. Only ${fmtShare(st.totals.share_less)} of Hamilton properties got a cut, and their median bill was ${fmtDollars(st.totals.median_bill_less)}.` +
        (fam === "commercial" || fam === "industrial" ? ` Business tax rates fell in ${y1} because the education part of the rate was cut, which is why most ${famLabel.toLowerCase()} properties paid less.` : "");
    } else if (key === "typical") {
      verdict = `<strong>Right on the standard rise.</strong> ${fmtShare(g.share)} of properties saw an increase of ${g.lo}% to ${g.hi}%.`;
    } else if (g) {
      verdict = `<strong>${escapeHtml(g.label)}.</strong> Your increase of ${fmtSignedPercent(pct)} is outside the standard ${st.groups.find((x) => x.key === "typical").lo}–${st.groups.find((x) => x.key === "typical").hi}% rise. ` +
        `You're in a group of ${fmtCount(g.n)} properties (${fmtShare(g.share)}). ${wardPhrase(g)}`;
    } else {
      verdict = `Your ${fmtSignedPercent(pct)} change falls between the city's main groups.`;
    }

    const sc = state.sortedChanges;
    let below = 0;
    if (sc) { let lo = 0, hi = sc.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (sc[mid] < change) lo = mid + 1; else hi = mid; } below = lo / sc.length; }
    const rank = Math.round(below * 100);
    const pos = Math.min(97, Math.max(3, below * 100));

    inner = `<h3>${escapeHtml(address)}</h3>
      <p class="where">${wardLabel(ward)}${placeLabel ? " · " + escapeHtml(placeLabel) : ""} · Roll ${escapeHtml(roll)} · Assessed at ${fmtDollars(assessment)}</p>
      <div class="big"><span class="num ${change > 0 ? "up" : change < 0 ? "down" : ""}">${fmtSignedDollars(change)}</span><span class="sub">a year (${fmtSignedPercent(pct)})</span></div>
      <div class="bills"><span>${y0}: <strong>${fmtDollars(t0)}</strong></span><span class="arrow">→</span><span>${y1}: <strong>${fmtDollars(t1)}</strong></span></div>
      <p class="verdict">${verdict}</p>
      <div class="track" aria-hidden="true"><span class="dot" style="left:${pos}%" data-label="Bigger rise than ${rank}% of properties" data-edge="${pos > 70 ? "r" : pos < 30 ? "l" : ""}"></span></div>
      <div class="track-labels"><span>Biggest decrease</span><span>Dollar change, all taxed properties</span><span>Biggest increase</span></div>
      <div class="history" id="receipt-history"></div>
      <p class="note">Typical change: ${fmtSignedDollars(city.median_dollar_change)} city-wide${wardStats ? `, ${fmtSignedDollars(wardStats.median_dollar_change)} in ${wardLabel(ward)}` : ""}.</p>`;
  }
  el.hidden = false;
  el.innerHTML = inner + `<div class="actions">
      ${lat != null ? '<button type="button" class="btn" id="see-map">See it on the map</button>' : ""}
      <button type="button" class="btn ghost" id="copy-link">Copy link</button></div>`;
  const see = $("see-map");
  if (see) see.addEventListener("click", () => showOnMap(lat, lon, address));
  $("copy-link").addEventListener("click", (e) => {
    navigator.clipboard && navigator.clipboard.writeText(location.href);
    e.target.textContent = "Link copied";
  });

  if (taxed) showHistory(p);
  if (ward !== state.selectedWard) selectWard(ward, { only: true });
  if (lat != null) showOnMap(lat, lon, address, false);
}

init();
