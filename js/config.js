// =====================================================================
//  SITE SETTINGS — safe to edit
// =====================================================================
//  Change any value on the right-hand side, save, and refresh the page.
//  Keep the quotes "..." around text and the commas at the end of lines.
//  Colours live in css/style.css (the block at the very top).
// =====================================================================

const CONFIG = {
  // ---- Text shown on the page ----------------------------------------
  title: "Hamilton Property Tax Impact, 2021",
  cityName: "Hamilton",
  yearBefore: 2020,
  yearAfter: 2021,
  sourceNote:
    "Source: City of Hamilton 2021 tax impact data (about 186,000 properties). Statistics leave out properties with no tax in either year.",

  // Which measure the map opens on: "pct", "dollars", "less", "value", "bill",
  // "rate", "type", "growth", "long" or "new".
  defaultMeasure: "pct",

  // Optional ward names, shown next to the number. Leave "" to show only the number.
  WARD_NAMES: {
    1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", 8: "",
    9: "", 10: "", 11: "", 12: "", 13: "", 14: "", 15: "",
  },

  // ---- Map -----------------------------------------------------------
  MAP: {
    // Ward shapes (made from the parcel shapefile, see README).
    geojsonFile: "data/wards.geojson",
    // Name of the column in the shapes file that holds the ward number.
    joinField: "WARD",
    // Starting view: [latitude, longitude] and zoom (bigger = closer).
    center: [43.22, -79.88],
    zoom: 10,
    // How many colour steps the ward map uses (3 to 7).
    colourSteps: 5,

    // Zoom level at which the map switches from wards to individual
    // property lots (bigger = you have to zoom in further).
    parcelZoom: 14,
    // Folder holding the property lot files (made by scripts/build_data.py).
    parcelFolder: "data/parcels",

    // Where the lot colours change (colours are set in css/style.css).
    dollarBreaks: [50, 100, 200],        // "$ change" view, dollars
    billBreaks: [2000, 4000, 6000, 10000], // "tax bill" view, dollars
    valueBreaks: [200000, 300000, 400000, 500000, 750000], // "assessed value" view
  },

  // ---- Property lookup -----------------------------------------------
  lookupMaxResults: 8,
};
