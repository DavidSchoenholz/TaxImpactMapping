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
    // How many colour steps the map uses (3 to 7).
    colourSteps: 5,
  },

  // ---- Property lookup -----------------------------------------------
  lookupMaxResults: 25,

  // ---- Property map (map.html) ---------------------------------------
  PROPERTY_MAP: {
    // Shapes file with one shape (parcel outline or address point) per
    // property. Until this file exists the page shows a "coming soon" note.
    geojsonFile: "data/properties.geojson",
    // Name of the column in the shapes file that holds the roll number.
    // Dashes and spaces in the roll number are ignored.
    joinField: "ROLL_NO",
    // Which layer is shown when the page opens (a key from PROPERTY_LAYERS).
    defaultLayer: "dollar_change",
    // Size of the dots when the shapes are points.
    pointRadius: 3,
  },

  // The layers people can switch between. Remove a line to hide one.
  //   label = name on the button
  //   about = sentence shown under the buttons
  PROPERTY_LAYERS: {
    dollar_change: { label: "Tax increase ($)",
      about: "How much the tax bill went up (red) or down (blue) from 2020 to 2021, in dollars." },
    pct_change:    { label: "Tax increase (%)",
      about: "How much the tax bill went up (red) or down (blue) from 2020 to 2021, as a percent of the 2020 bill." },
    assessment:    { label: "Assessed value",
      about: "The property's assessed value. Darker means a higher value." },
    tax_2021:      { label: "2021 tax bill",
      about: "The total 2021 tax bill. Darker means a bigger bill." },
    tax_rate:      { label: "Effective tax rate",
      about: "The 2021 bill as a percent of assessed value. Farms pay the lowest rates and homes about 1.2%. Apartments, shops and industry pay 2.5% or more." },
  },
};
