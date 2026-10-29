// Main page logic. Settings you might want to change are in js/config.js;
// colours are in css/style.css.

const state = {
  summary: null,
  metric: CONFIG.defaultWardMetric,
  selectedWard: null,
  wardChart: null,
  distChart: null,
  map: null,
  mapLayer: null,
  legend: null,
  properties: null,
  tableSort: { key: "ward", dir: 1 },
};

// ---------- helpers ----------------------------------------------------

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const fmtDollars = (v) => (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-CA");
const fmtSignedDollars = (v) => (v > 0 ? "+" : "") + fmtDollars(v);
const fmtPercent = (v) => v.toFixed(1) + "%";
const fmtSignedPercent = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
const fmtShare = (v) => (v * 100).toFixed(1) + "%";
const fmtCount = (v) => v.toLocaleString("en-CA");

function formatMetric(key, value) {
  const f = CONFIG.WARD_METRICS[key].format;
  if (f === "dollars") return fmtDollars(value);
  if (f === "percent") return fmtPercent(value);
  if (f === "share") return fmtShare(value);
  return String(value);
}

function wardLabel(w) {
  const name = CONFIG.WARD_NAMES[w];
  return name ? `Ward ${w} – ${name}` : `Ward ${w}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- start-up ---------------------------------------------------

async function init() {
  document.title = CONFIG.title;
  $("title").textContent = CONFIG.title;
  $("subtitle").textContent = CONFIG.subtitle;
  $("source").textContent = CONFIG.sourceNote;

  try {
    const res = await fetch("data/summary.json");
    if (!res.ok) throw new Error(res.status);
    state.summary = await res.json();
  } catch (e) {
    $("stats").innerHTML =
      '<div class="card">Could not load the data. If you opened this file straight from your computer, ' +
      "view it through GitHub Pages instead, or see the README for how to preview it locally.</div>";
    return;
  }

  if (!CONFIG.WARD_METRICS[state.metric]) state.metric = Object.keys(CONFIG.WARD_METRICS)[0];

  renderStats();
  renderMetricPicker();
  renderWardChart();
  renderDistChart();
  renderTable();
  initMap();
  initLookup();

  const n = state.summary.notes;
  $("data-notes").textContent =
    `${fmtCount(n.rows_after_cleaning)} properties in the file; ${fmtCount(n.properties_in_stats)} used in the ` +
    `statistics (${fmtCount(n.untaxed_or_unassigned)} had no tax in one of the years or no ward).` +
    (state.summary.map ? ` ${fmtCount(state.summary.map.properties_matched_to_parcel)} properties are shown on the map; ` +
      `${fmtCount(state.summary.map.properties_not_on_map)} could not be matched to a lot. Ward outlines are traced from the lots and are approximate.` : "");

  // Redraw charts in the right colours when the device switches light/dark.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    renderWardChart();
    renderDistChart();
    if (state.mapLayer) { styleMap(); restyleParcels(); }
  });
}

// ---------- headline numbers ------------------------------------------

function renderStats() {
  const c = state.summary.city;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  const tiles = [
    { label: "Typical change in tax bill", value: fmtSignedPercent(c.median_percent_change), sub: `${y0} to ${y1}` },
    { label: "Typical change in dollars", value: fmtSignedDollars(c.median_dollar_change), sub: "per property, per year" },
    { label: `Typical ${y1} tax bill`, value: fmtDollars(c.median_tax_2021), sub: `up from ${fmtDollars(c.median_tax_2020)} in ${y0}` },
    { label: "Properties paying more", value: fmtShare(c.share_increase), sub: `${fmtShare(c.share_decrease)} are paying less` },
  ];
  $("stats").innerHTML = tiles
    .map((t) => `<div class="card stat"><div class="label">${t.label}</div><div class="value">${t.value}</div><div class="sub">${t.sub}</div></div>`)
    .join("");

  $("assessment-note").textContent = state.summary.assessment_changed
    ? ""
    : `Assessed values did not change between ${y0} and ${y1}, so these changes come from tax rates alone.`;
}

// ---------- ward chart -------------------------------------------------

function renderMetricPicker() {
  const sel = $("metric");
  sel.innerHTML = Object.entries(CONFIG.WARD_METRICS)
    .map(([k, m]) => `<option value="${k}">${m.label}</option>`)
    .join("");
  sel.value = state.metric;
  sel.addEventListener("change", () => {
    state.metric = sel.value;
    renderWardChart();
    if (state.mapLayer) styleMap();
  });
}

function chartDefaults() {
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  Chart.defaults.color = css("--text-muted");
  Chart.defaults.borderColor = css("--line");
}

function renderWardChart() {
  chartDefaults();
  const wards = state.summary.wards;
  const key = state.metric;
  const colours = wards.map((w) => (w.ward === state.selectedWard ? css("--highlight") : css("--accent")));
  const cityValue = state.summary.city[key];

  const data = {
    labels: wards.map((w) => `Ward ${w.ward}`),
    datasets: [{
      data: wards.map((w) => w[key]),
      backgroundColor: colours,
      borderRadius: 4,
      borderSkipped: "start",
      barPercentage: 0.8,
      categoryPercentage: 0.9,
    }],
  };

  const options = {
    indexAxis: "y",
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: `${CONFIG.WARD_METRICS[key].label} — city-wide: ${formatMetric(key, cityValue)}`,
        color: css("--text-soft"),
        align: "start",
        font: { weight: "normal", size: 13 },
      },
      tooltip: {
        callbacks: {
          title: (items) => wardLabel(wards[items[0].dataIndex].ward),
          label: (item) => `${CONFIG.WARD_METRICS[key].label}: ${formatMetric(key, item.raw)}`,
          afterLabel: (item) => `${fmtCount(wards[item.dataIndex].properties)} properties`,
        },
      },
    },
    scales: {
      x: { beginAtZero: true, grid: { color: css("--line") }, ticks: { callback: (v) => formatMetric(key, v) } },
      y: { grid: { display: false }, ticks: { color: css("--text-soft") } },
    },
    onClick: (evt, els) => { if (els.length) selectWard(wards[els[0].index].ward); },
    onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? "pointer" : "default"; },
  };

  if (state.wardChart) state.wardChart.destroy();
  state.wardChart = new Chart($("ward-chart"), { type: "bar", data, options });
}

function selectWard(w) {
  state.selectedWard = state.selectedWard === w ? null : w;
  renderWardChart();
  renderTable();
  if (state.mapLayer) styleMap();
}

// ---------- distribution chart ----------------------------------------

function renderDistChart() {
  chartDefaults();
  const bins = state.summary.histogram;
  const first = bins[0], last = bins[bins.length - 1];
  const label = (b) =>
    b.from === 0 && b.to === 0 ? "No change"
      : b === first ? `less than ${fmtSignedPercent(b.to)}`
      : b === last ? `more than ${fmtSignedPercent(b.from)}`
      : `${fmtSignedPercent(b.from)} to ${fmtSignedPercent(b.to)}`;
  const colour = (b) => (b.to <= 0 && b.from < 0 ? css("--decrease") : b.to > 0 ? css("--increase") : css("--no-change"));

  const data = {
    labels: bins.map((b) => b.from),
    datasets: [{
      data: bins.map((b) => b.count),
      backgroundColor: bins.map(colour),
      borderRadius: 4,
      borderSkipped: "start",
      barPercentage: 0.92,
      categoryPercentage: 1,
    }],
  };

  const options = {
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => label(bins[items[0].dataIndex]),
          label: (item) => `${fmtCount(item.raw)} properties`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        title: { display: true, text: "Percent change in tax bill" },
        // Label whole-number edges only; "0" sits under the no-change bar.
        ticks: {
          autoSkip: false,
          maxRotation: 0,
          callback: function (v, i) {
            const b = bins[i];
            const every = this.chart.width < 500 ? 4 : 2; // fewer labels on small screens
            if (b.from === 0 && b.to === 0) return "0%";
            if (b.from < 0 && b.from % every === 0) return fmtSignedPercent(b.from);
            if (b.from > 0 && b.to % every === 0) return fmtSignedPercent(b.to);
            return "";
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: css("--line") },
        title: { display: true, text: "Properties" },
        ticks: { callback: (v) => fmtCount(v) },
      },
    },
  };

  if (state.distChart) state.distChart.destroy();
  state.distChart = new Chart($("dist-chart"), { type: "bar", data, options });
}

// ---------- ward table -------------------------------------------------

const TABLE_COLUMNS = [
  { key: "ward", label: "Ward", fmt: (v) => wardLabel(v) },
  { key: "properties", label: "Properties", fmt: fmtCount },
  { key: "median_tax_2020", label: () => `Typical ${CONFIG.yearBefore} bill`, fmt: fmtDollars },
  { key: "median_tax_2021", label: () => `Typical ${CONFIG.yearAfter} bill`, fmt: fmtDollars },
  { key: "median_dollar_change", label: "Typical $ change", fmt: fmtSignedDollars },
  { key: "median_percent_change", label: "Typical % change", fmt: fmtSignedPercent },
  { key: "share_decrease", label: "Paying less", fmt: fmtShare },
  { key: "median_assessment", label: "Typical assessment", fmt: fmtDollars },
];

function renderTable() {
  const { key, dir } = state.tableSort;
  const rows = [...state.summary.wards].sort((a, b) => (a[key] - b[key]) * dir);
  const head = TABLE_COLUMNS.map((c) => {
    const lbl = typeof c.label === "function" ? c.label() : c.label;
    const sort = c.key === key ? (dir > 0 ? "ascending" : "descending") : "none";
    return `<th scope="col" data-key="${c.key}" aria-sort="${sort}" tabindex="0">${lbl}</th>`;
  }).join("");
  const body = rows.map((w) =>
    `<tr data-ward="${w.ward}" class="${w.ward === state.selectedWard ? "selected" : ""}">` +
    TABLE_COLUMNS.map((c) => `<td>${c.fmt(w[c.key])}</td>`).join("") + "</tr>"
  ).join("");
  const c = state.summary.city;
  const foot = `<tr><td><strong>${CONFIG.cityName}</strong></td>` +
    TABLE_COLUMNS.slice(1).map((col) => `<td><strong>${col.fmt(c[col.key])}</strong></td>`).join("") + "</tr>";

  const table = $("ward-table");
  table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
  table.querySelectorAll("th").forEach((th) => {
    const sortBy = () => {
      const k = th.dataset.key;
      state.tableSort = { key: k, dir: state.tableSort.key === k ? -state.tableSort.dir : 1 };
      renderTable();
    };
    th.addEventListener("click", sortBy);
    th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortBy(); } });
  });
  table.querySelectorAll("tbody tr").forEach((tr) =>
    tr.addEventListener("click", () => selectWard(Number(tr.dataset.ward)))
  );
}

// ---------- map --------------------------------------------------------
// Zoomed out, the map colours whole wards by the measure picked above.
// Zoomed in (CONFIG.MAP.parcelZoom or closer), it shows every property lot
// coloured by its $ change, loading one ward's lots at a time.

const parcelCache = {};   // ward number -> Leaflet layer (or a Promise while loading)

async function initMap() {
  const slot = $("map-slot");
  let geo;
  try {
    const res = await fetch(CONFIG.MAP.geojsonFile);
    if (!res.ok) throw new Error(res.status);
    geo = await res.json();
  } catch (e) {
    slot.innerHTML =
      '<div class="map-placeholder"><div><strong>Map coming soon</strong><br>' +
      "The map will appear here once the ward boundary file is added.<br>" +
      `<span class="note">Expected file: ${escapeHtml(CONFIG.MAP.geojsonFile)}</span></div></div>`;
    return;
  }

  slot.innerHTML =
    '<div id="map" role="region" aria-label="Map of wards and properties"></div>' +
    '<p class="note" id="map-hint"></p>';
  state.map = L.map("map", { scrollWheelZoom: false }).setView(CONFIG.MAP.center, CONFIG.MAP.zoom);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  }).addTo(state.map);

  state.parcelPane = state.map.createPane("parcels");
  state.parcelPane.style.zIndex = 390; // under the ward outlines (overlayPane is 400)
  state.parcelRenderer = L.canvas({ pane: "parcels" });

  // Wards get their own layer so it can be made click-through when zoomed in.
  state.map.createPane("wards").style.zIndex = 400;
  state.mapLayer = L.geoJSON(geo, {
    pane: "wards",
    renderer: L.svg({ pane: "wards" }),
    onEachFeature: (feature, layer) => {
      layer.on({
        click: (e) => {
          const w = wardOf(feature);
          if (!w) return;
          if (showingParcels()) return; // let clicks reach the property underneath
          selectWard(w);
          state.map.fitBounds(layer.getBounds());
        },
        mouseover: () => { if (!showingParcels()) layer.setStyle({ weight: 3 }); },
        mouseout: () => styleMap(),
      });
    },
  }).addTo(state.map);
  state.wardBounds = {};
  state.mapLayer.eachLayer((l) => { state.wardBounds[wardOf(l.feature)] = l.getBounds(); });

  state.map.fitBounds(state.mapLayer.getBounds());
  state.map.on("zoomend moveend", updateParcels);
  styleMap();
}

function wardOf(feature) {
  return Number(feature.properties[CONFIG.MAP.joinField]);
}

function showingParcels() {
  return state.map && state.map.getZoom() >= CONFIG.MAP.parcelZoom;
}

// Splits ward values into equal-count groups and returns the cut points.
function breaks(values, steps) {
  const sorted = [...values].sort((a, b) => a - b);
  const cuts = [];
  for (let i = 1; i < steps; i++) cuts.push(sorted[Math.floor((i * sorted.length) / steps)]);
  return [...new Set(cuts)];
}

function styleMap() {
  const key = state.metric;
  const zoomedIn = showingParcels();
  const byWard = Object.fromEntries(state.summary.wards.map((w) => [w.ward, w]));
  const steps = Math.min(7, Math.max(3, CONFIG.MAP.colourSteps));
  const cuts = breaks(state.summary.wards.map((w) => w[key]), steps);
  // Spread the chosen number of steps across the 7 colours in the stylesheet.
  const palette = Array.from({ length: cuts.length + 1 }, (_, i) =>
    css(`--map-${1 + Math.round((i * 6) / Math.max(1, cuts.length))}`)
  );
  const classOf = (v) => cuts.filter((c) => v >= c).length;

  state.map.getPane("wards").style.pointerEvents = zoomedIn ? "none" : "";
  state.mapLayer.eachLayer((layer) => {
    const w = wardOf(layer.feature);
    const d = byWard[w];
    const selected = w === state.selectedWard;
    layer.setStyle({
      fillColor: d ? palette[classOf(d[key])] : css("--no-change"),
      fill: !zoomedIn, // zoomed in: outline only, so clicks reach the lots
      fillOpacity: 0.8,
      color: selected ? css("--highlight") : zoomedIn ? css("--text-soft") : css("--card-bg"),
      weight: selected ? 4 : zoomedIn ? 2 : 1.5,
    });
    if (selected) layer.bringToFront();
    if (zoomedIn) layer.unbindTooltip();
    else layer.bindTooltip(
      d ? `<strong>${escapeHtml(wardLabel(w))}</strong><br>${CONFIG.WARD_METRICS[key].label}: ${formatMetric(key, d[key])}`
        : `Ward ${escapeHtml(w)} (no data)`,
      { sticky: true }
    );
  });

  if (zoomedIn) {
    setLegend("Change in tax bill", parcelClasses().map((c) => [c.colour, c.label]));
    $("map-hint").textContent = "Each shape is a property lot. Tap or click one for details. Zoom out to compare wards.";
  } else {
    const edges = [null, ...cuts, null];
    setLegend(CONFIG.WARD_METRICS[key].label, palette.map((col, i) => {
      const lo = edges[i], hi = edges[i + 1];
      return [col, lo === null ? `under ${formatMetric(key, hi)}` : hi === null ? `${formatMetric(key, lo)} or more` : `${formatMetric(key, lo)} to ${formatMetric(key, hi)}`];
    }));
    $("map-hint").textContent = "Click a ward to zoom in. Zoom in further to see individual properties.";
  }
}

function setLegend(title, rows) {
  if (state.legend) state.legend.remove();
  state.legend = L.control({ position: "bottomright" });
  state.legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `<strong>${escapeHtml(title)}</strong>` +
      rows.map(([col, text]) => `<div><i style="background:${col}"></i>${escapeHtml(text)}</div>`).join("");
    return div;
  };
  state.legend.addTo(state.map);
}

// ---------- property lots ---------------------------------------------

// Colour classes for lots, built from CONFIG.MAP.parcelBreaks.
function parcelClasses() {
  const down = [...CONFIG.MAP.parcelBreaks.decrease].sort((a, b) => a - b);  // e.g. [-100]
  const up = [...CONFIG.MAP.parcelBreaks.increase].sort((a, b) => a - b);    // e.g. [50, 100, 200]
  const classes = [];
  const downCols = [css("--lot-down-2"), css("--lot-down-1")];
  [-Infinity, ...down].forEach((lo, i, arr) => {
    const hi = i + 1 < arr.length ? arr[i + 1] : 0;
    classes.push({
      test: (c) => c < hi && c >= lo,
      colour: downCols[Math.max(0, downCols.length - arr.length + i)],
      label: lo === -Infinity ? `down more than ${fmtDollars(-hi)}` : `down up to ${fmtDollars(-lo)}`,
    });
  });
  classes.push({ test: (c) => c === 0, colour: css("--no-change"), label: "no change" });
  const upCols = [1, 2, 3, 4].map((i) => css(`--lot-up-${i}`));
  [0, ...up].forEach((lo, i, arr) => {
    const hi = i + 1 < arr.length ? arr[i + 1] : Infinity;
    classes.push({
      test: (c) => c > lo && c <= hi,
      colour: upCols[Math.min(upCols.length - 1, Math.round((i * (upCols.length - 1)) / Math.max(1, arr.length - 1)))],
      label: hi === Infinity ? `up more than ${fmtDollars(lo)}` : lo === 0 ? `up to ${fmtDollars(hi)}` : `up ${fmtDollars(lo)} to ${fmtDollars(hi)}`,
    });
  });
  return classes;
}

function parcelStyle(feature) {
  const p = feature.properties;
  const cls = p.x ? null : state.parcelClassList.find((c) => c.test(p.c));
  return {
    renderer: state.parcelRenderer,
    fillColor: cls ? cls.colour : css("--line"),
    fillOpacity: 0.85,
    color: css("--card-bg"),
    weight: 0.5,
  };
}

function parcelPopup(p) {
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  if (p.x) return `<strong>${escapeHtml(p.a)}</strong><br>No property tax in ${y0} or ${y1}.`;
  const units = p.n > 1
    ? `<br>${fmtCount(p.n)} units on this lot. Typical unit: ${fmtSignedDollars(p.c)} (${fmtSignedPercent(p.p)})<br>All units: ${fmtDollars(p.t0)} → ${fmtDollars(p.t1)}`
    : `<br>${y0}: ${fmtDollars(p.t0)} → ${y1}: ${fmtDollars(p.t1)}<br>Change: ${fmtSignedDollars(p.c)} (${fmtSignedPercent(p.p)})`;
  return `<strong>${escapeHtml(p.a)}</strong>${units}`;
}

function loadWardParcels(ward) {
  if (parcelCache[ward]) return parcelCache[ward];
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
    .catch(() => { delete parcelCache[ward]; return null; });
  return parcelCache[ward];
}

let parcelsWereShown = false;

async function updateParcels() {
  const show = showingParcels();
  if (show !== parcelsWereShown) {
    parcelsWereShown = show;
    styleMap();
  }
  state.parcelClassList = parcelClasses();
  const view = state.map.getBounds();
  for (const [ward, bounds] of Object.entries(state.wardBounds)) {
    const wanted = show && bounds.intersects(view);
    const cached = parcelCache[ward];
    if (wanted) {
      const layer = await loadWardParcels(ward);
      // The view may have changed while the file was loading.
      if (layer && showingParcels() && state.wardBounds[ward].intersects(state.map.getBounds())) layer.addTo(state.map);
    } else if (cached && cached.remove) {
      cached.remove();
    }
  }
}

// Recolour loaded lots (after the light/dark switch).
function restyleParcels() {
  state.parcelClassList = parcelClasses();
  Object.values(parcelCache).forEach((l) => l.setStyle && l.setStyle(parcelStyle));
}

// Zooms the map to a property found with the lookup.
function showOnMap(lat, lon, label) {
  if (!state.map || lat == null) return;
  if (state.pin) state.pin.remove();
  state.pin = L.circleMarker([lat, lon], {
    radius: 9, color: css("--card-bg"), weight: 3, fillColor: css("--highlight"), fillOpacity: 1,
  }).bindTooltip(escapeHtml(label), { permanent: true, direction: "top", offset: [0, -8] }).addTo(state.map);
  state.map.setView([lat, lon], Math.max(CONFIG.MAP.parcelZoom + 2, state.map.getZoom()));
  $("map-slot").scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- property lookup -------------------------------------------

function initLookup() {
  const input = $("search");
  let timer;
  input.addEventListener("focus", loadProperties, { once: true });
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(runSearch, 150);
  });
}

async function loadProperties() {
  if (state.properties) return;
  $("search-status").textContent = "Loading property list…";
  try {
    const res = await fetch("data/properties.json");
    const json = await res.json();
    state.properties = json.rows;
    $("search-status").textContent = `${fmtCount(state.properties.length)} properties ready to search.`;
    runSearch();
  } catch (e) {
    $("search-status").textContent = "Could not load the property list.";
  }
}

function runSearch() {
  if (!state.properties) return;
  const q = $("search").value.trim().toUpperCase().replace(/\s+/g, " ");
  const out = $("results");
  if (q.length < 3) { out.innerHTML = ""; return; }

  const hits = [];
  for (const p of state.properties) {
    if (p[0].includes(q) || p[2].startsWith(q)) {
      hits.push(p);
      if (hits.length >= CONFIG.lookupMaxResults) break;
    }
  }
  $("search-status").textContent = hits.length
    ? `Showing ${hits.length}${hits.length === CONFIG.lookupMaxResults ? "+" : ""} matches.`
    : "No matches. Try just the street name.";

  out.innerHTML = hits.map((p, i) => {
    const cls = p[6] > 0 ? "up" : p[6] < 0 ? "down" : "";
    return `<div class="result" role="option" tabindex="0" data-i="${i}">
      <div><div class="addr">${escapeHtml(p[0])}</div><div class="meta">${wardLabel(p[1])} · Roll ${escapeHtml(p[2])}</div></div>
      <div class="delta ${cls}">${fmtSignedDollars(p[6])}<br><span class="meta">${fmtSignedPercent(p[7])}</span></div>
    </div>`;
  }).join("");
  out.querySelectorAll(".result").forEach((el) => {
    const pick = () => showDetail(hits[Number(el.dataset.i)]);
    el.addEventListener("click", pick);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter") pick(); });
  });
}

function showDetail(p) {
  const [address, ward, roll, assessment, t0, t1, change, pct, lat] = p;
  const wardStats = state.summary.wards.find((w) => w.ward === ward);
  const city = state.summary.city;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  const compare = (mine, typical) =>
    mine > typical ? "more than" : mine < typical ? "less than" : "the same as";

  const d = $("detail");
  d.hidden = false;
  d.innerHTML = `<div class="card">
    <h3>${escapeHtml(address)}</h3>
    <dl>
      <dt>Ward</dt><dd>${wardLabel(ward)}</dd>
      <dt>Roll number</dt><dd>${escapeHtml(roll)}</dd>
      <dt>Assessed value</dt><dd>${fmtDollars(assessment)}</dd>
      <dt>${y0} taxes</dt><dd>${fmtDollars(t0)}</dd>
      <dt>${y1} taxes</dt><dd>${fmtDollars(t1)}</dd>
      <dt>Change</dt><dd class="${change > 0 ? "up" : change < 0 ? "down" : ""}">${fmtSignedDollars(change)} (${fmtSignedPercent(pct)})</dd>
    </dl>
    ${lat == null ? '<p class="note">This property could not be placed on the map.</p>' : ""}
    ${wardStats && t1 > 0 ? `<p class="note">That change is ${compare(change, wardStats.median_dollar_change)} the typical ${fmtSignedDollars(wardStats.median_dollar_change)} in ${wardLabel(ward)}, and ${compare(change, city.median_dollar_change)} the typical ${fmtSignedDollars(city.median_dollar_change)} city-wide.</p>` : ""}
  </div>`;
  if (wardStats && state.selectedWard !== ward) selectWard(ward);
  showOnMap(p[8], p[9], address);
}

init();
