// Property map page. Colours every property by the chosen layer.
// Settings (file name, join column, layer names) are in js/config.js;
// colours are in css/style.css.
//
// The shapes come from a GeoJSON file of parcels or address points. Each
// shape is linked to the tax data in data/properties.json by roll number.

const PM = CONFIG.PROPERTY_MAP;

// How each layer gets its value and splits values into colours.
//   diverging:  blues for decreases, grey for no change, reds for increases
//   sequential: light to dark blues, split into equal-count groups
//               (or at fixed "breaks" when given)
// A value of null means "no data" and is drawn grey.
const LAYER_RULES = {
  dollar_change: { kind: "diverging", fmt: fmtSignedDollars, value: (p) => (p.taxed ? p.change : null) },
  pct_change: { kind: "diverging", fmt: fmtSignedPercent, value: (p) => (p.taxed ? p.pct : null) },
  assessment: { kind: "sequential", fmt: fmtDollars, value: (p) => (p.assessment > 0 ? p.assessment : null) },
  tax_2021: { kind: "sequential", fmt: fmtDollars, value: (p) => (p.taxed ? p.tax2021 : null) },
  tax_rate: {
    kind: "sequential",
    fmt: (v) => v.toFixed(2) + "%",
    value: (p) => (p.taxed && p.assessment > 0 ? (100 * p.tax2021) / p.assessment : null),
    // Rates bunch at a few values set by property class, so fixed breaks
    // separate the classes better than equal-count groups.
    breaks: [0.7, 1.15, 1.3, 2.5, 3.2],
  },
};

const pm = {
  map: null,
  shapes: null,
  wards: null,
  legend: null,
  byRoll: new Map(),
  layer: null,
  classes: null,
};

const normRoll = (v) => String(v ?? "").replace(/\.0+$/, "").replace(/\D/g, "");

// ---------- start-up ---------------------------------------------------

async function initPropertyMap() {
  $("source").textContent = CONFIG.sourceNote;
  const keys = Object.keys(CONFIG.PROPERTY_LAYERS).filter((k) => LAYER_RULES[k]);
  pm.layer = keys.includes(PM.defaultLayer) ? PM.defaultLayer : keys[0];
  renderLayerPicker(keys);

  let geo;
  try {
    const res = await fetch(PM.geojsonFile);
    if (!res.ok) throw new Error(res.status);
    geo = await res.json();
  } catch (e) {
    $("map-slot").innerHTML =
      '<div class="map-placeholder"><div><strong>Property map coming soon</strong><br>' +
      "The map will appear here once the property shapes file is added.<br>" +
      `<span class="note">Expected file: ${escapeHtml(PM.geojsonFile)}, with the roll number in a column called ` +
      `${escapeHtml(PM.joinField)}</span></div></div>`;
    return;
  }

  $("map-status").textContent = "Loading tax data…";
  try {
    const res = await fetch("data/properties.json");
    const rows = (await res.json()).rows;
    for (const [address, ward, roll, assessment, tax2020, tax2021, change, pct] of rows) {
      const taxed = tax2020 > 0 && tax2021 > 0 && ward > 0;
      pm.byRoll.set(roll, { address, ward, roll, assessment, tax2020, tax2021, change, pct, taxed });
    }
  } catch (e) {
    $("map-status").textContent = "Could not load the tax data.";
    return;
  }

  $("map-slot").innerHTML = '<div id="property-map" role="region" aria-label="Map of properties"></div>';
  // Canvas drawing keeps the map responsive with ~186,000 shapes.
  pm.map = L.map("property-map", { preferCanvas: true }).setView(CONFIG.MAP.center, CONFIG.MAP.zoom);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
  }).addTo(pm.map);

  let matched = 0;
  pm.shapes = L.geoJSON(geo, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, { radius: PM.pointRadius, stroke: false }),
    onEachFeature: (feature, layer) => {
      layer.row = pm.byRoll.get(normRoll(feature.properties?.[PM.joinField])) || null;
      if (layer.row) matched++;
    },
  });
  // One click handler for the whole layer, rather than one popup per shape.
  pm.shapes.on("click", (e) => showPopup(e.propagatedFrom || e.layer, e.latlng));
  pm.shapes.addTo(pm.map);
  if (pm.shapes.getLayers().length) pm.map.fitBounds(pm.shapes.getBounds());

  const total = pm.shapes.getLayers().length;
  $("map-status").textContent =
    `${fmtCount(matched)} of ${fmtCount(total)} shapes linked to tax data by roll number.` +
    (matched < total ? " Grey shapes have no matching roll number or no tax." : "");

  await addWardOutlines();
  styleShapes();

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", styleShapes);
}

// Ward boundaries drawn on top as outlines, if that file has been added.
async function addWardOutlines() {
  try {
    const res = await fetch(CONFIG.MAP.geojsonFile);
    if (!res.ok) return;
    const geo = await res.json();
    pm.wards = L.geoJSON(geo, {
      interactive: false,
      style: { fill: false, color: "#0b0b0b", weight: 1.5, opacity: 0.6 },
    });
    L.control.layers(null, { "Ward boundaries": pm.wards }, { collapsed: false }).addTo(pm.map);
    pm.wards.addTo(pm.map);
  } catch (e) {
    // No ward file yet; the map works without it.
  }
}

// ---------- layer picker -----------------------------------------------

function renderLayerPicker(keys) {
  const box = $("layer-picker");
  box.innerHTML = keys
    .map((k) => `<button type="button" data-layer="${k}">${escapeHtml(CONFIG.PROPERTY_LAYERS[k].label)}</button>`)
    .join("");
  box.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      pm.layer = b.dataset.layer;
      updatePicker();
      if (pm.shapes) styleShapes();
    })
  );
  updatePicker();
}

function updatePicker() {
  $("layer-picker").querySelectorAll("button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.layer === pm.layer))
  );
  $("layer-about").textContent = CONFIG.PROPERTY_LAYERS[pm.layer].about;
}

// ---------- colours ----------------------------------------------------

// Cut points that split sorted values into `steps` equal-count groups.
function quantileCuts(sorted, steps) {
  const cuts = [];
  for (let i = 1; i < steps; i++) cuts.push(sorted[Math.floor((i * sorted.length) / steps)]);
  return [...new Set(cuts)];
}

// Turns cut points into classes { min, max, colour }; min is inclusive.
function classesFrom(cuts, colours, from = -Infinity, to = Infinity) {
  const edges = [from, ...cuts, to];
  return colours.map((colour, i) => ({ min: edges[i], max: edges[i + 1], colour }));
}

// Picks `n` colours spread evenly across a list of CSS colour names.
const spread = (names, n) =>
  Array.from({ length: n }, (_, i) => css(names[n === 1 ? names.length - 1 : Math.round((i * (names.length - 1)) / (n - 1))]));

function buildClasses(rule, values) {
  if (rule.kind === "diverging") {
    const down = values.filter((v) => v < 0).sort((a, b) => a - b);
    const up = values.filter((v) => v > 0).sort((a, b) => a - b);
    const downCuts = quantileCuts(down, 3);
    const upCuts = quantileCuts(up, 4);
    const downNames = ["--down-3", "--down-2", "--down-1"];
    const upNames = ["--up-1", "--up-2", "--up-3", "--up-4"];
    return [
      ...(down.length ? classesFrom(downCuts, spread(downNames, downCuts.length + 1), -Infinity, 0) : []),
      { min: 0, max: 0, colour: css("--no-change"), label: "No change" },
      ...(up.length ? classesFrom(upCuts, spread(upNames, upCuts.length + 1), 0, Infinity) : []),
    ];
  }
  const cuts = rule.breaks || quantileCuts([...values].sort((a, b) => a - b), 7);
  const names = Array.from({ length: 7 }, (_, i) => `--map-${i + 1}`);
  return classesFrom(cuts, spread(names, cuts.length + 1));
}

function classOf(v) {
  return pm.classes.find((c) => (c.min === c.max ? v === c.min : v >= c.min && v < c.max)) ||
    pm.classes[pm.classes.length - 1];
}

function styleShapes() {
  const rule = LAYER_RULES[pm.layer];
  const layers = pm.shapes.getLayers();
  const valueOf = (l) => (l.row ? rule.value(l.row) : null);
  // The no-change class (0 only) comes before the increase classes, so
  // classOf matches it first.
  pm.classes = buildClasses(rule, layers.map(valueOf).filter((v) => v !== null));
  pm.classes.forEach((c) => (c.count = 0));
  const noData = css("--no-data");
  let missing = 0;

  for (const l of layers) {
    const v = valueOf(l);
    let colour = noData;
    if (v === null) missing++;
    else { const c = classOf(v); c.count++; colour = c.colour; }
    if (l instanceof L.CircleMarker) {
      l.setStyle({ fillColor: colour, fillOpacity: v === null ? 0.4 : 0.85 });
    } else {
      l.setStyle({ fillColor: colour, fillOpacity: v === null ? 0.4 : 0.85, color: colour, weight: 0.5, opacity: 0.9 });
    }
  }
  renderLegend(rule, missing);
}

function renderLegend(rule, missing) {
  if (pm.legend) pm.legend.remove();
  pm.legend = L.control({ position: "bottomright" });
  pm.legend.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    const text = (c) =>
      c.label ? c.label
        : c.min === -Infinity ? `under ${rule.fmt(c.max)}`
        : c.max === Infinity ? `${rule.fmt(c.min)} or more`
        : c.min === 0 ? `up to ${rule.fmt(c.max)}`
        : `${rule.fmt(c.min)} to ${rule.fmt(c.max)}`;
    const row = (colour, label, count) =>
      `<div><i style="background:${colour}"></i>${escapeHtml(label)}<span class="count">${fmtCount(count)}</span></div>`;
    div.innerHTML =
      `<strong>${escapeHtml(CONFIG.PROPERTY_LAYERS[pm.layer].label)}</strong>` +
      [...pm.classes].reverse().filter((c) => c.count).map((c) => row(c.colour, text(c), c.count)).join("") +
      (missing ? row(css("--no-data"), "No data / no tax", missing) : "");
    return div;
  };
  pm.legend.addTo(pm.map);
}

// ---------- popup ------------------------------------------------------

function showPopup(layer, latlng) {
  const p = layer?.row;
  const y0 = CONFIG.yearBefore, y1 = CONFIG.yearAfter;
  const html = p
    ? `<strong>${escapeHtml(p.address.trim() || "(no address)")}</strong>
      <dl>
        <dt>Ward</dt><dd>${wardLabel(p.ward)}</dd>
        <dt>Roll number</dt><dd>${escapeHtml(p.roll)}</dd>
        <dt>Assessed value</dt><dd>${fmtDollars(p.assessment)}</dd>
        <dt>${y0} taxes</dt><dd>${fmtDollars(p.tax2020)}</dd>
        <dt>${y1} taxes</dt><dd>${fmtDollars(p.tax2021)}</dd>
        <dt>Change</dt><dd>${fmtSignedDollars(p.change)} (${fmtSignedPercent(p.pct)})</dd>
      </dl>`
    : `No tax data for roll number ${escapeHtml(layer?.feature?.properties?.[PM.joinField] ?? "(none)")}`;
  L.popup().setLatLng(latlng).setContent(html).openOn(pm.map);
}

initPropertyMap();
