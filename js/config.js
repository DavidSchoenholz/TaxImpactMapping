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
  subtitle:
    "How the 2021 tax bill changed from 2020 for about 181,000 properties across Hamilton's 15 wards.",
  cityName: "Hamilton",
  yearBefore: 2020,
  yearAfter: 2021,
  sourceNote:
    "Source: City of Hamilton 2021 tax impact data. Statistics exclude properties with no tax in either year.",

  // ---- Ward chart ----------------------------------------------------
  // Which measure the ward chart (and map) shows when the page opens.
  // Pick one of the keys listed in WARD_METRICS below.
  defaultWardMetric: "median_dollar_change",

  // The measures people can choose from. Remove a line to hide it.
  //   label  = name shown in the drop-down
  //   format = "dollars", "percent" (value is already 0-100), or "share" (0-1)
  WARD_METRICS: {
    median_dollar_change:  { label: "Typical $ change in tax bill",     format: "dollars" },
    median_tax_2021:       { label: "Typical 2021 tax bill",            format: "dollars" },
    median_percent_change: { label: "Typical % change in tax bill",     format: "percent" },
    share_decrease:        { label: "Share of properties paying less",  format: "share" },
    median_assessment:     { label: "Typical assessed value",           format: "dollars" },
  },

  // Optional ward names, shown next to the number. Leave "" to show only the number.
  WARD_NAMES: {
    1: "", 2: "", 3: "", 4: "", 5: "", 6: "", 7: "", 8: "",
    9: "", 10: "", 11: "", 12: "", 13: "", 14: "", 15: "",
  },

  // ---- Map -----------------------------------------------------------
  MAP: {
    // Where the shapes file lives (made from the shapefile, see README).
    // While this file doesn't exist, the map shows a "coming soon" note.
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
    // Dollar amounts where the lot colours change. Colours are set in
    // css/style.css (--lot-down-... and --lot-up-...).
    parcelBreaks: {
      decrease: [-100],          // one value, below 0
      increase: [50, 100, 200],  // up to 3 values, each above 0
    },
  },

  // ---- Property lookup -----------------------------------------------
  lookupMaxResults: 25,
};
