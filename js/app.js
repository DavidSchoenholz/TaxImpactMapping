// Main page logic. Settings you might want to change are in js/config.js;
// colours are in css/style.css.

const state = {
  summary: null,
  story: null,
  properties: null,        // rows from data/properties.json
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

// What the map can be coloured by. `ward` is the column in summary.json.
const MEASURES = {
  pct:     { label: "% change",  ward: "median_percent_change", title: "Typical % change in bill",         fmt: fmtSignedPercent },
  dollars: { label: "$ change",  ward: "median_dollar_change",  title: "Typical $ change in bill",         fmt: fmtSignedDollars },
  bill:    { label: "2021 bill", ward: "median_tax_2021",       title: "Typical 2021 tax bill",            fmt: fmtDollars },
  less:    { label: "Paid less", ward: "share_decrease",        title: "Share of properties paying less",  fmt: fmtShare },
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
  if (!MEASURES[state.measure]) state.measure = "pct";

  Chart.defaults.font.family = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  renderHero();
  renderParadox();
  renderLess();
  renderClusters();
  renderExtremes();
  renderTable();
  initLookup();
  state.mapReady = initMap();

  const n = state.summary.notes;
  $("source").textContent = CONFIG.sourceNote;
  $("data-notes").textContent =
    `${fmtCount(n.rows_after_cleaning)} properties in the file; ${fmtCount(n.properties_in_stats)} used in the ` +
    `statistics (${fmtCount(n.untaxed_or_unassigned)} had no tax in one of the years or no ward).` +
    (state.summary.map ? ` ${fmtCount(state.summary.map.properties_matched_to_parcel)} are shown on the map; ` +
      `${fmtCount(state.summary.map.properties_not_on_map)} could not be matched to a lot. Ward outlines are traced from the lots and are approximate.` : "");

  // Redraw in the right colours when the device switches light/dark.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    renderLess(); renderClusters();
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

  $("h-paradox").textContent = "Almost every bill rose. The city's total barely did.";
  $("paradox-lede").textContent =
    `${fmtShare(c.share_increase)} of properties paid more in ${y1}, yet ${CONFIG.cityName} collected only ` +
    `${t.net_pct.toFixed(2)}% more in total. The gap comes down to a few thousand very large bills.`;

  const tiles = [
    { num: fmtShare(c.share_increase), what: "of properties paid more", more: `${fmtCount(t.n_more)} of ${fmtCount(t.n_taxed)} taxed properties` },
    { num: fmtSignedPercent(c.median_percent_change), what: "typical change in a bill", more: `${fmtSignedDollars(c.median_dollar_change)} a year, from ${fmtDollars(c.median_tax_2020)} to ${fmtDollars(c.median_tax_2021)}` },
    { num: (t.net_pct > 0 ? "+" : "") + t.net_pct.toFixed(2) + "%", what: "change in total tax collected", more: `${fmtMoneyShort(t.tax_2020)} to ${fmtMoneyShort(t.tax_2021)}, ${signed(fmtMoneyShort(t.net), t.net)}` },
  ];
  $("bigstats").innerHTML = tiles
    .map((x) => `<div class="bigstat"><div class="num">${x.num}</div><div class="what">${x.what}</div><div class="more">${x.more}</div></div>`)
    .join("");

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
    `<p class="bal-note">The ${fmtCount(t.n_less)} properties that got a cut cancelled out about ${Math.round(-t.decrease_total / t.increase_total * 100)}% of the extra everyone else paid.</p>`;
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.querySelectorAll(".bal-bar").forEach((b) => (b.style.width = b.dataset.w + "%"))));

  $("assessment-note").textContent = state.summary.assessment_changed
    ? ""
    : `Assessed values did not change between ${y0} and ${y1}, so every change on this page comes from tax rates, not from re-valuing property.`;
}

// ---------- 2. who paid less -------------------------------------------

function renderLess() {
  const t = state.story.totals, d = state.story.deciles;
  const top = d[9];
  const otherMax = Math.max(...d.slice(0, 9).map((x) => x.share_less));
  const lessGroup = state.story.groups.find((g) => g.key === "less");

  $("h-less").textContent = "The bigger the bill, the likelier it fell.";
  $("less-lede").textContent =
    `Of the top tenth of bills (${fmtDollars(top.from_bill)} a year and up), ${fmtShare(top.share_less)} went down. ` +
    `In every other tenth, ${fmtShare(otherMax)} or fewer did.`;
  $("decile-title").textContent = "Share of properties paying less, by size of 2020 bill (each bar is one tenth of all properties)";

  const topWards = lessGroup.top_wards;
  const topShare = topWards.reduce((s, w) => s + w[1], 0) / lessGroup.n;
  const items = [
    { num: fmtSignedDollars(t.median_change_less), what: `typical change for a property that paid less. Their median bill: ${fmtDollars(t.median_bill_less)}.` },
    { num: fmtSignedDollars(t.median_change_rest), what: `typical change for everyone else. Their median bill: ${fmtDollars(t.median_bill_rest)}.` },
    { num: fmtShare(t.tax_share_of_less), what: `of all ${CONFIG.yearBefore} tax dollars came from the ${fmtShare(t.share_less)} of properties that got a cut.` },
    { num: fmtShare(topShare), what: `of them are in just three wards: ${topWards.map((w) => w[0]).join(", ").replace(/, (\d+)$/, " and $1")}.` },
  ];
  $("contrast").innerHTML = items
    .map((x) => `<div class="card"><div class="num">${x.num}</div><div class="what">${x.what}</div></div>`).join("");

  const isLast = (i) => i === d.length - 1;
  makeChart("decile", $("decile-chart"), {
    type: "bar",
    data: {
      labels: d.map((x) => fmtDollars(x.from_bill) + "+"),
      datasets: [{
        data: d.map((x) => x.share_less * 100),
        backgroundColor: d.map((x, i) => (isLast(i) ? css("--g-less") : css("--no-change"))),
        borderRadius: 4,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: (it) => `Bills of ${it[0].label} and up`, label: (it) => `${it.raw.toFixed(1)}% paid less` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: css("--text-muted"), maxRotation: 0, font: { size: 11 } }, title: { display: true, text: "Smallest bill in each tenth", color: css("--text-muted") } },
        y: { beginAtZero: true, grid: { color: css("--line") }, ticks: { color: css("--text-muted"), callback: (v) => v + "%" } },
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

function wardPhrase(g) {
  const [w, n] = g.top_wards[0];
  const share = n / g.n;
  if (share >= 0.5) return `${Math.round(share * 100)}% of them are in ${wardLabel(w)}.`;
  return `Spread across the city; most are in wards ${g.top_wards.map((x) => x[0]).join(", ").replace(/, (\d+)$/, " and $1")}.`;
}

function renderClusters() {
  const st = state.story;
  const typical = st.groups.find((g) => g.key === "typical");
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

// ---------- 5. extremes ------------------------------------------------

function renderExtremes() {
  const list = (id, rows) => {
    $(id).innerHTML = rows.map((r, i) => `
      <li tabindex="0" data-i="${i}">
        <span class="a">${escapeHtml(r.address)}</span>
        <span class="d ${r.change > 0 ? "up" : "down"}">${fmtSignedDollars(r.change)}</span>
        <span class="m">${wardLabel(r.ward)} · ${fmtDollars(r.tax2020)} → ${fmtDollars(r.tax2021)}</span>
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
  $("measure-seg").innerHTML = Object.entries(MEASURES)
    .map(([k, m]) => `<button type="button" data-m="${k}">${m.label}</button>`).join("");
  $("measure-seg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => setMeasure(b.dataset.m)));
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
  $("measure-seg").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.m === state.measure)));
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
    setLegend(m.title.replace("Typical", "Each property:"), lotClasses().filter((c) => !c.hide).map((c) => [c.colour, c.label]));
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
  return `<strong>${escapeHtml(p.a)}</strong>${units}${tag}`;
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
  state.propertiesPromise = fetch("data/properties.json")
    .then((r) => r.json())
    .then((json) => {
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

function showReceipt(p) {
  const [address, ward, roll, assessment, t0, t1, change, pct, lat, lon] = p;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  const st = state.story, city = state.summary.city;
  const wardStats = state.summary.wards.find((w) => w.ward === ward);
  const taxed = t0 > 0 && t1 > 0;
  const el = $("receipt");
  history.replaceState(null, "", `#p=${roll}`);

  let inner;
  if (!taxed) {
    inner = `<h3>${escapeHtml(address)}</h3><p class="where">${wardLabel(ward)} · Roll ${escapeHtml(roll)}</p>
      <p class="verdict">This property was not billed property tax in ${y0} or ${y1} (${t0 + t1 === 0 ? "no tax in either year" : "tax in only one year"}), so there is no change to compare.</p>`;
  } else {
    const key = groupOf(change, pct);
    const g = st.groups.find((x) => x.key === key);
    let verdict;
    if (key === "less") {
      verdict = `Your bill went <strong>down</strong>. Only ${fmtShare(st.totals.share_less)} of Hamilton properties got a cut, and their median bill was ${fmtDollars(st.totals.median_bill_less)}.`;
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
      <p class="where">${wardLabel(ward)} · Roll ${escapeHtml(roll)} · Assessed at ${fmtDollars(assessment)}</p>
      <div class="big"><span class="num ${change > 0 ? "up" : change < 0 ? "down" : ""}">${fmtSignedDollars(change)}</span><span class="sub">a year (${fmtSignedPercent(pct)})</span></div>
      <div class="bills"><span>${y0}: <strong>${fmtDollars(t0)}</strong></span><span class="arrow">→</span><span>${y1}: <strong>${fmtDollars(t1)}</strong></span></div>
      <p class="verdict">${verdict}</p>
      <div class="track" aria-hidden="true"><span class="dot" style="left:${pos}%" data-label="Bigger rise than ${rank}% of properties" data-edge="${pos > 70 ? "r" : pos < 30 ? "l" : ""}"></span></div>
      <div class="track-labels"><span>Biggest decrease</span><span>Dollar change, all taxed properties</span><span>Biggest increase</span></div>
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

  if (ward !== state.selectedWard) selectWard(ward, { only: true });
  if (lat != null) showOnMap(lat, lon, address, false);
}

init();
